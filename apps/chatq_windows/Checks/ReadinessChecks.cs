using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text.Json;
using ChatQ.Windows;

internal static class ReadinessChecks
{
    public static async Task Run(string root,Action<bool,string> check)
    {
        var user=new UserState();var policy=new HubState();
        var missing=HubReadiness.Inspect(user,policy);check(!missing.CanAttempt && missing.Checks.Count(c=>c.Status=="missing")==3,"setup identifies missing API connection and friend without side effects");
        user.Profiles=[new("api","合成接口","https://example.invalid/v1","fixture-model","synthetic-private-model-key")];user.ProfileId="api";
        policy.Connection=new("qq","10001","ws://127.0.0.1:3001/","synthetic-private-bridge-token");policy.Rules=[new("a","qq","10001","20001","合成好友","api","natural")];
        var ready=HubReadiness.Inspect(user,policy);check(ready.CanAttempt && ready.FriendCount==1 && ready.AutomaticCount==0 && ready.Checks.Last().Status=="pending","complete setup is distinguished from actual platform acceptance");
        string display=JsonSerializer.Serialize(ready);check(!display.Contains("synthetic-private-model-key") && !display.Contains("synthetic-private-bridge-token"),"setup report excludes keys and channel tokens");
        policy.Rules[0]=policy.Rules[0] with {Mode="auto"};check(HubReadiness.Inspect(user,policy).AutomaticCount==1,"setup makes automatic rule count visible");
        policy.Rules[0]=policy.Rules[0] with {Paused=true};check(!HubReadiness.Inspect(user,policy).CanAttempt,"paused friend is not silently rearmed by setup");
        policy.Rules[0]=policy.Rules[0] with {Paused=false,PersonaId="removed"};check(!HubReadiness.Inspect(user,policy).CanAttempt,"deleted persona blocks setup before connection");
        policy.Rules[0]=policy.Rules[0] with {PersonaId="natural",Account="other"};check(HubReadiness.Inspect(user,policy).FriendCount==0,"friends of another account cannot satisfy current setup");
        var saved=policy.Connection;var fresh=saved with {Token="new-synthetic-token"};
        check(HubReadiness.Draft(fresh,"qq","10001",saved.Endpoint,"","").Token==fresh.Token,"blank secret uses latest saved connection after repeated save");
        check(HubReadiness.Draft(fresh,"qq","10002",saved.Endpoint,"","").Token=="","blank secret cannot migrate to another account");
        check(HubReadiness.Draft(fresh,"qq","10001","ws://127.0.0.1:4567/","","").Token=="","blank secret cannot migrate to another endpoint");
        check(HubReadiness.Draft(fresh,"wechat","合成账号","","",@"C:\synthetic\python.exe").Token=="","QQ token never follows platform switch");
        bool rejected=false;try{OneBotTransport.Endpoint(saved with {Endpoint="ws://127.0.0.1:0/"});}catch(InvalidOperationException){rejected=true;}check(rejected,"port zero rejected before socket operation");
        check(HubReadiness.ParsePythonMetadata("{\"python\":\"3.14.2\",\"found\":false,\"version\":null}").Status=="missing","missing package information produces actionable result");
        check(HubReadiness.ParsePythonMetadata("{\"python\":\"3.14.2\",\"found\":true,\"version\":\"40.1.9\"}").Detail.Contains("未加载"),"package metadata does not claim activation or runtime compatibility");
        check(HubReadiness.ParsePythonMetadata("{\"python\":\"bad\\nsecret\",\"found\":true,\"version\":\"1\"}").Status=="blocked","unexpected metadata content not echoed as diagnostics");
        check(HubReadiness.ParsePythonMetadata(new string('x',4097)).Status=="blocked","metadata response bounded");
        using(var cancellation=new CancellationTokenSource())
        {cancellation.Cancel();bool cancelled=false;try{await HubReadiness.ProbeLocalPort(saved,cancellation.Token);}catch(OperationCanceledException){cancelled=true;}check(cancelled,"cancelled preparation never opens a socket");}
        var sink=new TcpListener(IPAddress.Loopback,0);sink.Start();
        try
        {
            using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(5));int port=((IPEndPoint)sink.LocalEndpoint).Port;var accept=sink.AcceptTcpClientAsync(timeout.Token);
            var probe=await HubReadiness.ProbeLocalPort(saved with {Endpoint=$"ws://127.0.0.1:{port}/"},timeout.Token);
            using var peer=await accept;byte[] bytes=new byte[1];int count=await peer.GetStream().ReadAsync(bytes,timeout.Token);
            check(probe.Status=="ready" && probe.Detail.Contains("未发送令牌"),"TCP preparation distinguishes reachability from account authentication");
            check(count==0,"independent TCP sink observes zero application bytes or credentials");
        }
        finally{sink.Stop();}
        var temporaryListener=new TcpListener(IPAddress.Loopback,0);temporaryListener.Start();int closedPort=((IPEndPoint)temporaryListener.LocalEndpoint).Port;temporaryListener.Stop();
        var closed=await HubReadiness.ProbeLocalPort(saved with {Endpoint=$"ws://127.0.0.1:{closedPort}/"},CancellationToken.None);check(closed.Status=="missing","closed local port gets a specific preparation hint");
        if(Environment.GetEnvironmentVariable("CHATQ_PYTHON_FIXTURE") is { } python)
        {
            Directory.CreateDirectory(root);string environment=Path.Combine(root,"metadata-venv"),marker=Path.Combine(root,"startup-must-not-run.txt");
            var setup=new ProcessStartInfo(python){UseShellExecute=false,CreateNoWindow=true};foreach(var arg in new[]{"-I","-m","venv","--without-pip",environment})setup.ArgumentList.Add(arg);
            using(var process=Process.Start(setup)!)
            {using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(30));try{await process.WaitForExitAsync(timeout.Token);}catch{process.Kill(entireProcessTree:true);throw;}check(process.ExitCode==0,"dedicated synthetic Python environment created");}
            string site=Path.Combine(environment,"Lib","site-packages");Directory.CreateDirectory(site);
            File.WriteAllText(Path.Combine(site,"startup-trap.pth"),"import pathlib; pathlib.Path("+JsonSerializer.Serialize(marker)+").write_text('executed')\n");
            Directory.CreateDirectory(Path.Combine(site,"wxautox4"));File.WriteAllText(Path.Combine(site,"wxautox4","__init__.py"),"raise RuntimeError('synthetic module must never be imported')\n");
            string distribution=Path.Combine(site,"wxautox4-40.0.test.dist-info");Directory.CreateDirectory(distribution);File.WriteAllText(Path.Combine(distribution,"METADATA"),"Metadata-Version: 2.1\nName: wxautox4\nVersion: 40.0.test\n");
            var info=await HubReadiness.ProbePython(Path.Combine(environment,"Scripts","python.exe"),CancellationToken.None);
            check(info.Status=="ready" && info.Detail.Contains("40.0.test"),"real isolated Python subprocess reads selected virtualenv package metadata");
            check(!File.Exists(marker),"Python preparation does not execute site .pth startup code or import automation package");
        }
    }
}
