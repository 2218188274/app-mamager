using System.Buffers.Binary;
using System.Net;
using System.Text;
using ChatQ.Windows;

internal static class ImeChecks
{
    private sealed class Handler(Func<HttpRequestMessage,CancellationToken,Task<HttpResponseMessage>> run):HttpMessageHandler
    {protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage r,CancellationToken t)=>run(r,t);}
    private static MemoryStream Request(uint mode,string text,uint magic=ImeWorker.Magic)
    {
        var stream=new MemoryStream();using(var w=new BinaryWriter(stream,Encoding.Unicode,true)){w.Write(magic);w.Write(mode);w.Write((uint)text.Length);w.Write(Encoding.Unicode.GetBytes(text));}stream.Position=0;return stream;
    }
    private static (uint status,string revision,string caption,List<string> replies) Response(MemoryStream stream)
    {
        stream.Position=0;using var r=new BinaryReader(stream,Encoding.Unicode,true);if(r.ReadUInt32()!=ImeWorker.Magic)throw new Exception("response magic");uint status=r.ReadUInt32(),count=r.ReadUInt32();string Text(){uint length=r.ReadUInt32();return Encoding.Unicode.GetString(r.ReadBytes(checked((int)length*2)));}string rev=Text(),caption=Text();var replies=new List<string>();for(int i=0;i<count;i++)replies.Add(Text());if(stream.Position!=stream.Length)throw new Exception("trailing bytes");return(status,rev,caption,replies);
    }
    internal static async Task Run(string root,Action<bool,string> check)
    {
        var vault=new Vault(root);vault.SaveProfile(new("ime","合成API","https://example.invalid/v1","fixture-model","synthetic-ime-key"));vault.Update(s=>{s.PersonaId="work";s.ReplyCount=2;},true);int calls=0;
        using var ai=new PersonalAi(new Handler(async(r,t)=>{calls++;string wire=await r.Content!.ReadAsStringAsync(t);using var json=System.Text.Json.JsonDocument.Parse(wire);string body=string.Join("\n",json.RootElement.GetProperty("messages").EnumerateArray().Select(x=>x.GetProperty("content").GetString()));check(body.Contains("润色")&&body.Contains("合成选中文字")&&body.Contains("礼貌")&&!body.Contains("unrelated private draft"),"IME uses only supplied text and the saved persona/count");return new(HttpStatusCode.OK){Content=new StringContent("{\"choices\":[{\"message\":{\"content\":\"{\\\"replies\\\":[\\\"合成候选一\\\",\\\"合成候选二\\\"]}\"},\"finish_reason\":\"stop\"}]}")};}));
        vault.Update(s=>s.ReplyDraft="unrelated private draft");byte[] before=File.ReadAllBytes(Path.Combine(root,"data.vault"));
        using(var input=Request(1,"合成选中文字"))using(var output=new MemoryStream()){await ImeWorker.Run(input,output,vault,ai);var result=Response(output);check(result.status==0&&result.replies.SequenceEqual(new[]{"合成候选一","合成候选二"})&&result.caption.Contains("礼貌得体"),"IME binary generation result includes persona and bounded replies");check(!Encoding.Unicode.GetString(output.ToArray()).Contains("synthetic-ime-key"),"IME result never includes the profile key");}
        check(calls==1&&File.ReadAllBytes(Path.Combine(root,"data.vault")).SequenceEqual(before),"IME generation makes one call and does not persist prompt/history or change state");
        string rev=vault.Read().ConfigurationRevision;
        foreach(var value in new[]{rev,Guid.NewGuid().ToString("N")})using(var input=Request(2,value))using(var output=new MemoryStream()){await ImeWorker.Run(input,output,vault,ai);check(Response(output).status==(value==rev?0u:4u),"IME use checks exact saved configuration revision without generation");}
        foreach(var input in new[]{Request(7,"bad"),Request(0,"",0),Request(0,new string('x',1001)),Request(0,"a\0b")})using(input)using(var output=new MemoryStream()){await ImeWorker.Run(input,output,vault,ai);check(Response(output).status==2,"IME invalid mode, malformed, oversized and NUL input rejected");}
        check(calls==1,"invalid requests and configuration checks never call provider");
        var changed=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var slow=new PersonalAi(new Handler(async(_,t)=>{changed.SetResult();await Task.Delay(30000,t);throw new Exception("not reached");}));
        using(var input=Request(0,"合成取消"))using(var output=new MemoryStream()){var work=ImeWorker.Run(input,output,vault,slow);await changed.Task;vault.Update(s=>s.Goal="感谢",true);await work.WaitAsync(TimeSpan.FromSeconds(3));check(Response(output).status==4&&Response(output).replies.Count==0,"configuration change cancels an in-flight IME generation and drops stale replies");}
        using var cancel=new CancellationTokenSource();cancel.Cancel();using(var input=Request(0,"合成停止"))using(var output=new MemoryStream()){await ImeWorker.Run(input,output,vault,ai,cancel.Token);check(Response(output).status==3,"IME cancellation returns only a stopped result");}
        using(var input=Request(0,"合成缺配置"))using(var output=new MemoryStream()){await ImeWorker.Run(input,output,new Vault(Path.Combine(root,"empty")),ai);check(Response(output).status==1,"missing API is actionable without generation");}
        using var error=new PersonalAi(new Handler((_,_)=>Task.FromResult(new HttpResponseMessage(HttpStatusCode.Unauthorized){Content=new StringContent("synthetic-ime-key provider failure")})));
        using(var input=Request(0,"合成失败"))using(var output=new MemoryStream()){await ImeWorker.Run(input,output,vault,error);var result=Response(output);check(result.status==2&&!result.caption.Contains("synthetic-ime-key"),"provider failure never exposes reflected credentials or retries");}
    }
}
