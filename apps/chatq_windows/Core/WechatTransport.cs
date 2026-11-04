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
        if(connection.Platform!="wechat" || !HubReadiness.PythonPath(connection.Python) || !HubStore.Small(connection.Account,100)) throw new InvalidOperationException("请选择已安装 wxautox4 的 Python.exe，并填写当前微信显示名称。");
        var preparation=await HubReadiness.ProbePython(connection.Python,token);
        if(preparation.Status!="ready")throw new InvalidOperationException(preparation.Detail);
        token.ThrowIfCancellationRequested();
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
                var value=WechatProtocol.Parse(frame,settings,peers,connected.Task.IsCompletedSuccessfully);if(value is null)continue;
                if(value.Kind=="ready"){connected.TrySetResult(value.Account);continue;}
                if(value.Kind=="reply")
                {
                    if(pending.TryRemove(value.Echo,out var callback)){if(value.Ok)callback.TrySetResult(value.Receipt);else callback.TrySetException(new InvalidOperationException(value.Notice));}
                    continue;
                }
                if(value.Incoming is { } item)incoming(item);
            }
        }
        catch(Exception error)
        {
            string notice=error is InvalidOperationException && WechatProtocol.IsKnownError(error.Message)?error.Message:WechatProtocol.Error("PROTOCOL_INVALID");
            bool wasReady=connected.Task.IsCompletedSuccessfully;
            connected.TrySetException(new InvalidOperationException(notice));if(wasReady && !disposed && !token.IsCancellationRequested)disconnected(notice);
        }
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
