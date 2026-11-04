using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace ChatQ.Windows;

/// <summary>Independent OneBot11 protocol client. No QQ implementation or third-party bridge is bundled.</summary>
public sealed class OneBotTransport : IHubTransport
{
    private readonly ClientWebSocket socket = new();
    private readonly HttpMessageInvoker handshake=new(new SocketsHttpHandler {AllowAutoRedirect=false,UseCookies=false,UseProxy=false});
    private readonly SemaphoreSlim writing = new(1,1);
    private readonly ConcurrentDictionary<string,TaskCompletionSource<JsonElement>> pending = new();
    private readonly CancellationTokenSource shutdown = new();
    private HubConnection settings = new();
    private bool ready;
    private HashSet<string> peers = [];
    public static Uri Endpoint(HubConnection c)
    {
        if(c.Platform!="qq" || !long.TryParse(c.Account,out long id) || id<=0 || c.Token.Length is <16 or >4096 || c.Token.Any(ch=>ch<33||ch>126) ||
           !Uri.TryCreate(c.Endpoint,UriKind.Absolute,out var uri) || uri.Scheme!="ws" || uri.Host is not ("127.0.0.1" or "localhost" or "[::1]") || uri.AbsolutePath!="/" || uri.Query.Length>0 || uri.Fragment.Length>0 || uri.UserInfo.Length>0)
            throw new InvalidOperationException("QQ 需填写本机 OneBot11 混合接口 ws://127.0.0.1:端口/、本人 QQ 号和至少16位访问令牌。");
        return uri;
    }
    public async Task Connect(HubConnection connection,IReadOnlyList<HubRule> rules,Action<HubIncoming> incoming,Action<string> disconnected,CancellationToken token)
    {
        var uri=Endpoint(connection);settings=connection;
        peers=rules.Select(r=>r.Peer).ToHashSet(StringComparer.Ordinal);
        if(peers.Count==0 || peers.Any(p=>!long.TryParse(p,out long id)||id<=0))throw new InvalidOperationException("请填写准确的好友 QQ 号码；首版仅处理指定好友私聊。");
        socket.Options.SetRequestHeader("Authorization","Bearer "+connection.Token);
        using var connectTimeout=CancellationTokenSource.CreateLinkedTokenSource(token,shutdown.Token);connectTimeout.CancelAfter(TimeSpan.FromSeconds(10));
        await socket.ConnectAsync(uri,handshake,connectTimeout.Token).ConfigureAwait(false);
        _=Pump(incoming,disconnected,token);
        var login=await Call("get_login_info",new {},connectTimeout.Token);
        if(!login.TryGetProperty("user_id",out var user) || user.ToString()!=connection.Account)throw new InvalidOperationException("桥接组件登录账号与填写的 QQ 不一致，已拒绝接入。");
        ready=true;
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
                using var document=JsonDocument.Parse(new UTF8Encoding(false,true).GetString(body.ToArray()));var value=document.RootElement;
                if(value.TryGetProperty("echo",out var echo) && echo.ValueKind==JsonValueKind.String && pending.TryRemove(echo.GetString()!,out var callback)){callback.TrySetResult(value.Clone());continue;}
                if(ready && Parse(value,settings.Account,peers) is { } message)incoming(message);
            }
        }
        catch {if(!shutdown.IsCancellationRequested && !session.IsCancellationRequested)disconnected("QQ 桥接连接中断");}
        finally {ready=false;foreach(var entry in pending.Values)entry.TrySetException(new InvalidOperationException("桥接连接已结束。"));pending.Clear();}
    }
    public static HubIncoming? Parse(JsonElement value,string account,ISet<string> peers)
    {
        try
        {
            string kind=value.GetProperty("post_type").GetString()??"";
            if(kind is not ("message" or "message_sent") || value.GetProperty("message_type").GetString()!="private" || value.GetProperty("self_id").ToString()!=account)return null;
            if(value.TryGetProperty("sub_type",out var subtype) && subtype.GetString()!="friend")return null;
            bool self=kind=="message_sent";string peer=value.GetProperty("user_id").ToString();
            if(self && value.TryGetProperty("target_id",out var target))peer=target.ToString();
            if(!peers.Contains(peer) || peer==account)return null;
            string text="";var message=value.GetProperty("message");
            if(message.ValueKind==JsonValueKind.String){text=message.GetString()!;if(text.Contains("[CQ:",StringComparison.OrdinalIgnoreCase))return null;}
            else if(message.ValueKind==JsonValueKind.Array)
            {
                foreach(var segment in message.EnumerateArray()){if(segment.GetProperty("type").GetString()!="text")return null;text+=segment.GetProperty("data").GetProperty("text").GetString();if(text.Length>2000)return null;}
            }
            else return null;
            var result=new HubIncoming("qq",account,peer,value.GetProperty("message_id").ToString(),text,DateTimeOffset.FromUnixTimeSeconds(value.GetProperty("time").GetInt64()).UtcDateTime,self);
            return HubStore.ValidIncoming(result)?result:null;
        }
        catch(Exception e) when(e is JsonException or KeyNotFoundException or InvalidOperationException or ArgumentOutOfRangeException){return null;}
    }
    public async Task<string> Send(HubIncoming target,string text,CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        if(!ready || target.Platform!="qq" || target.Account!=settings.Account || !peers.Contains(target.Peer))throw new InvalidOperationException("发送目标不在当前连接范围内。");
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
    public void Dispose(){ready=false;shutdown.Cancel();socket.Abort();socket.Dispose();handshake.Dispose();}
}
