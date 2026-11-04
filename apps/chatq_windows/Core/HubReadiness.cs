using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;

namespace ChatQ.Windows;

public sealed record SetupCheck(string Id,string Title,string Status,string Detail);
public sealed record HubSetupReport(bool CanAttempt,int FriendCount,int AutomaticCount,List<SetupCheck> Checks);

/// <summary>Preparation only. Never authenticates, imports automation code, requests AI or reads chat.</summary>
public static class HubReadiness
{
    public static HubConnection Draft(HubConnection previous,string platform,string account,string endpoint,string typedToken,string python)
    {
        account=account.Trim();endpoint=endpoint.Trim();
        string secret=typedToken;
        if(platform=="qq" && secret.Length==0 && previous.Platform==platform && previous.Account==account && previous.Endpoint==endpoint)secret=previous.Token;
        return new(platform,account,platform=="qq"?endpoint:"",platform=="qq"?secret:"",platform=="wechat"?python.Trim():"");
    }
    public static bool PythonPath(string path)=>Path.IsPathFullyQualified(path) &&
        Path.GetFileName(path).Equals("python.exe",StringComparison.OrdinalIgnoreCase) && File.Exists(path);
    public static HubSetupReport Inspect(UserState user,HubState policy)
    {
        var c=policy.Connection;var rules=policy.Rules.Where(r=>r.Platform==c.Platform && r.Account==c.Account && !r.Paused).ToList();
        var checks=new List<SetupCheck>();
        bool validApi=user.Profiles.Count>0;
        try{foreach(var profile in user.Profiles)_=Validation.Profile(profile);}catch{validApi=false;}
        checks.Add(new("api","1 · 配置自己的 API",validApi?"ready":"missing",validApi?"已有保存的模型配置；本检查不会调用 AI。":"先到“我的 API”保存地址、密钥和模型。"));
        bool connectedFields=false;
        if(c.Platform=="qq")
        {
            try{_=OneBotTransport.Endpoint(c);connectedFields=true;}catch(InvalidOperationException){}
            checks.Add(new("connection","2 · 保存账号与连接",connectedFields?"ready":"missing",connectedFields?"本机地址、本人号码和令牌格式完整；尚未登录或核对账号。":"QQ 需本人号码、本机 ws://127.0.0.1:端口/ 混合接口及至少16位访问令牌。"));
        }
        else
        {
            connectedFields=HubStore.Small(c.Account,100) && PythonPath(c.Python);
            checks.Add(new("connection","2 · 保存账号与连接",connectedFields?"ready":"missing",connectedFields?"已选择本机 Python.exe 并填写微信显示名；依赖和客户端兼容尚未检查。":"微信需当前账号显示名及已安装适配依赖的 Python.exe。"));
        }
        bool bindings=rules.Count>0 && rules.All(r=>user.Profiles.Any(p=>p.Id==r.ProfileId) && user.Personas.Any(p=>p.Id==r.PersonaId));
        checks.Add(new("friends","3 · 添加指定好友",bindings?"ready":"missing",rules.Count==0?"添加至少一位好友并选择人设。暂停或属于其他账号的规则不参与本次连接。":bindings?$"本次有 {rules.Count} 位好友，自动模式 {rules.Count(r=>r.Mode=="auto")} 位。":"部分好友的 API 或人设已删除，请到“指定好友”重新选择。"));
        checks.Add(new("acceptance","4 · 先做确认模式验证","pending","配置完整不代表已验证微信或 QQ；首次请用确认模式核对实际账号、好友与发送结果。"));
        return new(validApi && connectedFields && bindings,rules.Count,rules.Count(r=>r.Mode=="auto"),checks);
    }
    public static async Task<SetupCheck> ProbeLocalPort(HubConnection connection,CancellationToken token)
    {
        var uri=OneBotTransport.Endpoint(connection);token.ThrowIfCancellationRequested();
        var address=uri.Host=="[::1]"?IPAddress.IPv6Loopback:IPAddress.Loopback;
        using var client=new TcpClient(address.AddressFamily);using var timeout=CancellationTokenSource.CreateLinkedTokenSource(token);timeout.CancelAfter(TimeSpan.FromSeconds(2));
        try
        {
            await client.ConnectAsync(address,uri.Port,timeout.Token).ConfigureAwait(false);
            return new("dependency","本机桥接端口","ready","本机端口可达。未发送令牌或消息，尚未确认服务协议、登录号或发送能力。");
        }
        catch(Exception error) when(error is SocketException or OperationCanceledException)
        {
            token.ThrowIfCancellationRequested();
            return new("dependency","本机桥接端口","missing","该端口未响应。请先准备并启动本机桥接，核对端口后重查；不要开放到公网。");
        }
    }
    // -I -S avoids PYTHONPATH, sitecustomize and executable .pth files.
    // Only package METADATA is read. Never import wxautox4 to test installation.
    private const string MetadataScript="""
import sys, sysconfig, json
from pathlib import Path
from importlib.metadata import distributions
exe=Path(sys.executable).resolve()
venv=next((p for p in (exe.parent,exe.parent.parent) if (p/'pyvenv.cfg').is_file()),None)
if venv is not None:
    paths={str(venv/'Lib'/'site-packages')}
    with (venv/'pyvenv.cfg').open(encoding='utf-8') as stream:
        config=stream.read(4096).lower().replace(' ','')
    if 'include-system-site-packages=true' in config:
        paths.add(str(Path(sys.base_prefix)/'Lib'/'site-packages'))
else:
    paths={str(exe.parent/'Lib'/'site-packages')}
    paths.update(str(p) for p in (sysconfig.get_path('purelib'),sysconfig.get_path('platlib')) if p)
version=None
for package in distributions(path=sorted(paths)):
    if str(package.metadata.get('Name','')).lower().replace('-','_')=='wxautox4':
        version=str(package.version)
        break
print(json.dumps({'python':sys.version.split()[0],'found':version is not None,'version':version}))
""";
    public static SetupCheck ParsePythonMetadata(string text)
    {
        try
        {
            if(text.Length>4096)throw new JsonException();
            using var document=JsonDocument.Parse(text);var root=document.RootElement;
            string python=root.GetProperty("python").GetString()??"";
            bool found=root.GetProperty("found").GetBoolean();string version=found?root.GetProperty("version").GetString()??"":"";
            if(!SafeVersion(python) || (found && !SafeVersion(version)))throw new JsonException();
            return new("dependency","Python 与微信适配依赖",found?"ready":"missing",found?$"Python {python}，找到 wxautox4 {version} 的安装信息；未加载该模块，激活和客户端兼容仍需后续验证。":$"Python {python} 可运行，但未找到 wxautox4 安装信息。请在该 Python 环境准备授权依赖后重新检查。");
        }
        catch(Exception error) when(error is JsonException or InvalidOperationException or KeyNotFoundException)
        {return new("dependency","Python 与微信适配依赖","blocked","安装信息无法确认。请核对 Python 环境；没有加载微信适配模块或连接账号。");}
    }
    private static bool SafeVersion(string value)=>value.Length is >0 and <=80 && value.All(c=>char.IsAsciiLetterOrDigit(c)||c is '.' or '_' or '+' or '-');
    public static async Task<SetupCheck> ProbePython(string path,CancellationToken token)
    {
        token.ThrowIfCancellationRequested();if(!PythonPath(path))return new("dependency","Python 与微信适配依赖","missing","请选择实际安装的 Python.exe，不能使用其他程序或启动器。");
        var start=new ProcessStartInfo(path){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true,StandardOutputEncoding=Encoding.UTF8};
        start.ArgumentList.Add("-I");start.ArgumentList.Add("-S");start.ArgumentList.Add("-c");start.ArgumentList.Add(MetadataScript);
        Process? process=null;
        using var timeout=CancellationTokenSource.CreateLinkedTokenSource(token);timeout.CancelAfter(TimeSpan.FromSeconds(8));
        try
        {
            process=Process.Start(start)??throw new IOException();
            var stderr=Discard(process.StandardError,timeout.Token);var output=ReadBounded(process.StandardOutput,timeout.Token);
            await Task.WhenAll(process.WaitForExitAsync(timeout.Token),stderr,output).ConfigureAwait(false);
            string text=await output.ConfigureAwait(false);
            return process.ExitCode==0?ParsePythonMetadata(text):new("dependency","Python 与微信适配依赖","blocked","Python 检查未完成；请核对安装和权限，没有连接微信。");
        }
        catch(Exception error) when(error is IOException or InvalidOperationException or System.ComponentModel.Win32Exception or OperationCanceledException)
        {
            token.ThrowIfCancellationRequested();return new("dependency","Python 与微信适配依赖","blocked","Python 检查超时或无法运行，请核对该程序和安装环境。");
        }
        finally
        {
            if(process is not null){try{if(!process.HasExited)process.Kill(entireProcessTree:true);}catch(Exception error) when(error is InvalidOperationException or System.ComponentModel.Win32Exception){}process.Dispose();}
        }
    }
    private static async Task<string> ReadBounded(StreamReader reader,CancellationToken token)
    {var text=new StringBuilder();char[] buffer=new char[1024];int count;while((count=await reader.ReadAsync(buffer.AsMemory(),token).ConfigureAwait(false))>0){if(text.Length+count>4096)throw new IOException();text.Append(buffer,0,count);}return text.ToString();}
    private static async Task Discard(StreamReader reader,CancellationToken token)
    {char[] buffer=new char[1024];while(await reader.ReadAsync(buffer.AsMemory(),token).ConfigureAwait(false)>0){} }
}
