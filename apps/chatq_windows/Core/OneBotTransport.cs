using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace ChatQ.Windows;

/// <summary>Independent OneBot11 protocol client. No QQ implementation or third-party bridge is bundled.</summary>
public sealed class OneBotTransport : IHubTransport,IReceiveDiagnostics
{
    private readonly ClientWebSocket socket = new();
    private readonly HttpMessageInvoker handshake=new(new SocketsHttpHandler {AllowAutoRedirect=false,UseCookies=false,UseProxy=false});
    private readonly SemaphoreSlim writing = new(1,1);
    private readonly ConcurrentDictionary<string,TaskCompletionSource<JsonElement>> pending = new();
    private readonly CancellationTokenSource shutdown = new();
    private HubConnection settings = new();
    private volatile bool ready;
    private int disposed;
    private Action<string>? disconnectedCallback;
    private readonly OneBotReceiveCounters diagnostics=new();
    public OneBotReceiveSnapshot ReceiveSnapshot=>diagnostics.Snapshot;
    private HashSet<string> peers = [];
    public static Uri Endpoint(HubConnection c)
    {
        if(c.Platform!="qq" || !long.TryParse(c.Account,out long id) || id<=0 || c.Token.Length is <16 or >4096 || c.Token.Any(ch=>ch<33||ch>126) ||
           !Uri.TryCreate(c.Endpoint,UriKind.Absolute,out var uri) || uri.Scheme!="ws" || uri.Port is <1 or >65535 || uri.Host is not ("127.0.0.1" or "localhost" or "[::1]") || uri.AbsolutePath!="/" || uri.Query.Length>0 || uri.Fragment.Length>0 || uri.UserInfo.Length>0)
            throw new InvalidOperationException("QQ 需填写本机 OneBot11 混合接口 ws://127.0.0.1:端口/、本人 QQ 号和至少16位访问令牌。");
        return uri;
    }
    public async Task Connect(HubConnection connection,IReadOnlyList<HubRule> rules,Action<HubIncoming> incoming,Action<string> disconnected,CancellationToken token)
    {
        var uri=Endpoint(connection);settings=connection;disconnectedCallback=disconnected;
        peers=rules.Select(r=>r.Peer).ToHashSet(StringComparer.Ordinal);
        if(peers.Count==0 || peers.Any(p=>!long.TryParse(p,out long id)||id<=0))throw new InvalidOperationException("请填写准确的好友 QQ 号码；首版仅处理指定好友私聊。");
        socket.Options.SetRequestHeader("Authorization","Bearer "+connection.Token);
        using var connectTimeout=CancellationTokenSource.CreateLinkedTokenSource(token,shutdown.Token);connectTimeout.CancelAfter(TimeSpan.FromSeconds(10));
        await socket.ConnectAsync(uri,handshake,connectTimeout.Token).ConfigureAwait(false);
        _=Pump(incoming,disconnected,token);
        var login=await Call("get_login_info",new {},connectTimeout.Token);
        if(!login.TryGetProperty("user_id",out var user) || user.ToString()!=connection.Account)throw new InvalidOperationException("桥接组件登录账号与填写的 QQ 不一致，已拒绝接入。");
        diagnostics.Account();
        CheckStatus(await Call("get_status",new {},connectTimeout.Token));
        diagnostics.Status();
        ready=true;
    }
    public static void CheckStatus(JsonElement status)
    {
        if(status.ValueKind!=JsonValueKind.Object||!status.TryGetProperty("online",out var online)||online.ValueKind!=JsonValueKind.True||!status.TryGetProperty("good",out var good)||good.ValueKind!=JsonValueKind.True)
            throw new InvalidOperationException("账号已核对，但QQ尚未在线就绪；请等待桥接初始化完成后重新连接，不会生成或发送回复。");
    }
    private async Task Pump(Action<HubIncoming> incoming,Action<string> disconnected,CancellationToken session)
    {
        using var linked=CancellationTokenSource.CreateLinkedTokenSource(session,shutdown.Token);
        try
        {
            byte[] buffer=new byte[4096];
            while(!linked.IsCancellationRequested)
            {
                using var body=new MemoryStream();WebSocketReceiveResult part;
                do
                {
                    part=await socket.ReceiveAsync(new ArraySegment<byte>(buffer),linked.Token).ConfigureAwait(false);
                    if(part.MessageType!=WebSocketMessageType.Text)throw new InvalidOperationException("桥接连接结束或返回了非文本帧。");
                    if(body.Length+part.Count>65536)throw new InvalidOperationException("桥接响应过大。");
                    body.Write(buffer,0,part.Count);
                }while(!part.EndOfMessage);
                diagnostics.Frame();
                using var document=JsonDocument.Parse(new UTF8Encoding(false,true).GetString(body.ToArray()));var value=document.RootElement;
                if(value.ValueKind!=JsonValueKind.Object){diagnostics.Observe(OneBotReceiveReason.Invalid);continue;}
                if(value.TryGetProperty("echo",out var echo) && echo.ValueKind==JsonValueKind.String){if(pending.TryRemove(echo.GetString()!,out var callback))callback.TrySetResult(value.Clone());continue;}
                if(!ready){diagnostics.BeforeReady();continue;}
                if(value.TryGetProperty("post_type",out var post)&&post.ValueKind==JsonValueKind.String&&post.GetString()=="meta_event" &&
                    value.TryGetProperty("meta_event_type",out var meta)&&meta.ValueKind==JsonValueKind.String&&meta.GetString()=="heartbeat")
                {
                    if(!value.TryGetProperty("self_id",out var self)||self.ToString()!=settings.Account){diagnostics.Observe(OneBotReceiveReason.WrongAccount);LoseConnection("QQ心跳账号与当前连接不符，已暂停");break;}
                    diagnostics.Heartbeat();
                    if(value.TryGetProperty("status",out var state)){try{CheckStatus(state);}catch{LoseConnection("QQ运行状态变为离线或异常，已暂停");break;}}
                    continue;
                }
                var message=Parse(value,settings.Account,peers,out var reason);diagnostics.Observe(reason);
                if(message is not null)incoming(message);
            }
        }
        catch {if(!shutdown.IsCancellationRequested && !session.IsCancellationRequested)disconnected("QQ 桥接连接中断");}
        finally {ready=false;foreach(var entry in pending.Values)entry.TrySetException(new InvalidOperationException("桥接连接已结束。"));pending.Clear();}
    }
    public static HubIncoming? Parse(JsonElement value,string account,ISet<string> peers)=>Parse(value,account,peers,out _);
    public static HubIncoming? Parse(JsonElement value,string account,ISet<string> peers,out OneBotReceiveReason reason)
    {
        reason=OneBotReceiveReason.Invalid;
        try
        {
            string kind=value.GetProperty("post_type").GetString()??"";
            if(kind is not ("message" or "message_sent")){reason=OneBotReceiveReason.Control;return null;}
            if(value.GetProperty("self_id").ToString()!=account){reason=OneBotReceiveReason.WrongAccount;return null;}
            if(value.GetProperty("message_type").GetString()!="private"){reason=OneBotReceiveReason.Unsupported;return null;}
            if(value.TryGetProperty("sub_type",out var subtype) && subtype.GetString()!="friend"){reason=OneBotReceiveReason.Unsupported;return null;}
            bool self=kind=="message_sent";string peer=value.GetProperty("user_id").ToString();
            if(self && value.TryGetProperty("target_id",out var target))peer=target.ToString();
            if(!peers.Contains(peer) || peer==account){reason=OneBotReceiveReason.OtherPeer;return null;}
            string text="";var message=value.GetProperty("message");
            if(message.ValueKind==JsonValueKind.String){text=message.GetString()!;if(text.Contains("[CQ:",StringComparison.OrdinalIgnoreCase)){reason=OneBotReceiveReason.Unsupported;return null;}}
            else if(message.ValueKind==JsonValueKind.Array)
            {
                foreach(var segment in message.EnumerateArray()){if(segment.GetProperty("type").GetString()!="text"){reason=OneBotReceiveReason.Unsupported;return null;}text+=segment.GetProperty("data").GetProperty("text").GetString();if(text.Length>2000)return null;}
            }
            else return null;
            var result=new HubIncoming("qq",account,peer,value.GetProperty("message_id").ToString(),text,DateTimeOffset.FromUnixTimeSeconds(value.GetProperty("time").GetInt64()).UtcDateTime,self);
            if(!HubStore.ValidIncoming(result))return null;reason=OneBotReceiveReason.Accepted;return result;
        }
        catch(Exception e) when(e is JsonException or KeyNotFoundException or InvalidOperationException or ArgumentOutOfRangeException or FormatException){return null;}
    }
    public async Task<string> Send(HubIncoming target,string text,CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        if(!ready || target.Platform!="qq" || target.Account!=settings.Account || !peers.Contains(target.Peer))throw new InvalidOperationException("发送目标不在当前连接范围内。");
        try
        {
            var login=await Call("get_login_info",new {},token);
            if(!login.TryGetProperty("user_id",out var current)||current.ToString()!=settings.Account){diagnostics.Observe(OneBotReceiveReason.WrongAccount);throw new InvalidOperationException();}
            CheckStatus(await Call("get_status",new {},token));
            token.ThrowIfCancellationRequested();if(!ready)throw new OperationCanceledException();
        }
        catch(OperationCanceledException){throw;}
        catch{LoseConnection("提交前QQ账号或运行状态无法确认，已暂停");throw new InvalidOperationException("提交前QQ账号或运行状态无法确认，未继续提交。");}
        var result=await Call("send_private_msg",new {user_id=long.Parse(target.Peer,System.Globalization.CultureInfo.InvariantCulture),message=new[]{new {type="text",data=new {text}}},auto_escape=true},token);
        if(!result.TryGetProperty("message_id",out var id) || id.ToString().Length==0)throw new InvalidOperationException("桥接组件没有返回消息 ID。");
        return id.ToString();
    }
    private async Task<JsonElement> Call(string action,object parameters,CancellationToken token)
    {
        string echo=Guid.NewGuid().ToString("N");var completion=new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);pending[echo]=completion;
        try
        {
            byte[] bytes=JsonSerializer.SerializeToUtf8Bytes(new {action,@params=parameters,echo});
            await writing.WaitAsync(token);
            try {await socket.SendAsync(new ArraySegment<byte>(bytes),WebSocketMessageType.Text,true,token);}finally{writing.Release();}
            var result=await completion.Task.WaitAsync(token);
            if(result.GetProperty("status").GetString()!="ok" || result.GetProperty("retcode").GetInt32()!=0 || !result.TryGetProperty("data",out var data))throw new InvalidOperationException("桥接组件未确认操作成功。");
            return data.Clone();
        }
        finally {pending.TryRemove(echo,out _);}
    }
    private void LoseConnection(string reason){ready=false;diagnostics.Status(false);disconnectedCallback?.Invoke(reason);}
    public void Dispose(){if(Interlocked.Exchange(ref disposed,1)!=0)return;ready=false;disconnectedCallback=null;shutdown.Cancel();socket.Abort();socket.Dispose();handshake.Dispose();}
}
