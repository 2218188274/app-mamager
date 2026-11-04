using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text;
using System.Text.Json;

namespace ChatQ.Windows;

public sealed class WechatTransport : IHubTransport
{
    private Process? process;
    private readonly TaskCompletionSource<string> connected=new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly ConcurrentDictionary<string,TaskCompletionSource<string>> pending=new();
    private readonly SemaphoreSlim writing=new(1,1);
    private HubConnection settings=new();
    private HashSet<string> peers=[];
    private bool disposed;
    public static string Script()
    {
        using var resource=typeof(WechatTransport).Assembly.GetManifestResourceStream("ChatQ.Windows.WechatBridge.py") ?? throw new InvalidOperationException("微信连接适配器文件缺失。");
        using var reader=new StreamReader(resource,Encoding.UTF8);return reader.ReadToEnd();
    }
    public async Task Connect(HubConnection connection,IReadOnlyList<HubRule> rules,Action<HubIncoming> incoming,Action<string> disconnected,CancellationToken token)
    {
        if(connection.Platform!="wechat" || !Path.IsPathFullyQualified(connection.Python) || !File.Exists(connection.Python) || !string.Equals(Path.GetExtension(connection.Python),".exe",StringComparison.OrdinalIgnoreCase) || !HubStore.Small(connection.Account,100)) throw new InvalidOperationException("请选择已安装 wxautox4 的 Python.exe，并填写当前微信显示名称。");
        settings=connection;peers=rules.Select(r=>r.Peer).ToHashSet(StringComparer.Ordinal);
        var start=new ProcessStartInfo(connection.Python){UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,StandardInputEncoding=new UTF8Encoding(false),StandardOutputEncoding=Encoding.UTF8,StandardErrorEncoding=Encoding.UTF8,WorkingDirectory=Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)};
        start.ArgumentList.Add("-I");start.ArgumentList.Add("-u");start.ArgumentList.Add("-c");start.ArgumentList.Add(Script());
        process=Process.Start(start)??throw new InvalidOperationException("Python 未能启动。");
        _=DrainErrors(process.StandardError);_=Pump(incoming,disconnected,token);
        await process.StandardInput.WriteLineAsync(JsonSerializer.Serialize(new {account=connection.Account,peers=peers.ToArray()}).AsMemory(),token);await process.StandardInput.FlushAsync(token);
        using var timeout=CancellationTokenSource.CreateLinkedTokenSource(token);timeout.CancelAfter(TimeSpan.FromSeconds(25));
        if(await connected.Task.WaitAsync(timeout.Token)!=connection.Account)throw new InvalidOperationException("微信账号与配置不一致。");
    }
    private static async Task DrainErrors(StreamReader reader)
    {try {char[] buffer=new char[2048];while(await reader.ReadAsync(buffer)>0){/* No third-party diagnostics retained. */}}catch(IOException){} }
    private async Task Pump(Action<HubIncoming> incoming,Action<string> disconnected,CancellationToken token)
    {
        try
        {
            var reader=process!.StandardOutput;var line=new StringBuilder();char[] one=new char[1];
            while(!token.IsCancellationRequested && !disposed)
            {
                if(await reader.ReadAsync(one.AsMemory(),token).ConfigureAwait(false)==0)throw new IOException();
                if(one[0]!='\n'){line.Append(one[0]);if(line.Length>16384)throw new IOException();continue;}
                string frame=line.ToString().TrimEnd('\r');line.Clear();if(!frame.StartsWith("CQH:",StringComparison.Ordinal))continue;
                using var doc=JsonDocument.Parse(frame[4..]);var value=doc.RootElement;string kind=value.GetProperty("kind").GetString()??"";
                if(kind=="ready"){connected.TrySetResult(value.GetProperty("account").GetString()??"");continue;}
                if(kind=="fatal")throw new InvalidOperationException("微信连接组件不兼容或账号不一致。");
                if(kind=="reply")
                {
                    string echo=value.GetProperty("echo").GetString()??"";
                    if(pending.TryRemove(echo,out var callback)){if(value.GetProperty("ok").GetBoolean())callback.TrySetResult(value.GetProperty("receipt").GetString()??"");else callback.TrySetException(new InvalidOperationException("目标、草稿保护或发送结果未确认，请在微信核对。"));}
                    continue;
                }
                if(kind!="message" || !connected.Task.IsCompletedSuccessfully)continue;
                string peer=value.GetProperty("peer").GetString()??"";if(!peers.Contains(peer))continue;
                var item=new HubIncoming("wechat",settings.Account,peer,value.GetProperty("id").GetString()??"",value.GetProperty("text").GetString()??"",DateTimeOffset.FromUnixTimeSeconds(value.GetProperty("time").GetInt64()).UtcDateTime,value.GetProperty("self").GetBoolean());
                if(HubStore.ValidIncoming(item))incoming(item);
            }
        }
        catch {connected.TrySetException(new InvalidOperationException("微信连接失败；请检查已安装的依赖、账号名与当前客户端兼容性。"));if(!disposed && !token.IsCancellationRequested)disconnected("微信连接中断");}
        finally {foreach(var item in pending.Values)item.TrySetException(new IOException("微信连接已结束。"));pending.Clear();}
    }
    public async Task<string> Send(HubIncoming target,string text,CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        if(disposed || process is null || target.Platform!="wechat" || target.Account!=settings.Account || !peers.Contains(target.Peer))throw new InvalidOperationException("微信发送目标已失效。");
        string echo=Guid.NewGuid().ToString("N");var completion=new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);pending[echo]=completion;
        try
        {
            await writing.WaitAsync(token);
            try{await process.StandardInput.WriteLineAsync(JsonSerializer.Serialize(new {kind="send",echo,peer=target.Peer,messageId=target.Id,text}).AsMemory(),token);await process.StandardInput.FlushAsync(token);}finally{writing.Release();}
            return await completion.Task.WaitAsync(token);
        }
        finally{pending.TryRemove(echo,out _);}
    }
    public void Dispose()
    {
        if(disposed)return;disposed=true;
        try{if(process is not null && !process.HasExited)process.Kill(entireProcessTree:true);}catch(Exception error) when(error is InvalidOperationException or System.ComponentModel.Win32Exception){}finally{process?.Dispose();}
    }
}
