using System.IO.Compression;
using System.Text;
using System.Text.Json;

namespace ChatQ.Windows;

public static class ChatImportChecks
{
    public static string FixtureJson=>JsonSerializer.Serialize(new{Session=new{UserName="synthetic-peer",DisplayName="合成会话"},Messages=new[]{new{Id="2",Sender="合成好友",IsSelf=false,Time="2026-11-04 12:02:00",Type=1,Content="合成自己，下次一起散步？联系13800138000或demo@example.com"},new{Id="1",Sender="合成自己",IsSelf=true,Time="2026-11-04 12:01:00",Type=1,Content="今天忙完了，想出去走走。"}}});
    public static string FixtureAnswer=>JsonSerializer.Serialize(new{summary="双方正在商量散步，可先确认时间和地点。",observations=new[]{new{point="对方提出了具体邀请。",evidence=new[]{"M00002"},confidence="较明确"}},nextSteps=new[]{"先回应邀请，再询问方便的时间。"},topics=new[]{"你平时喜欢去哪儿散步？"},replies=new[]{"好呀，你大概几点方便？"}});
    private static byte[] Bytes(string value)=>Encoding.UTF8.GetBytes(value);
    private static ImportedArchive Load(string value,string name="messages.json")=>ChatImport.Load(Bytes(value),name);
    private static byte[] Zip(params (string Name,string Value)[] files)
    {using var memory=new MemoryStream();using(var zip=new ZipArchive(memory,ZipArchiveMode.Create,true)){foreach(var f in files){using var writer=new StreamWriter(zip.CreateEntry(f.Name).Open(),new UTF8Encoding(false));writer.Write(f.Value);}}return memory.ToArray();}
    public static async Task Run(string? fixture,Action<bool,string> check)
    {
        ChatFileChecks.Run(check);
        WechatDatabaseChecks.Run(check);
        void Reject(Action action,string message){bool failed=false;try{action();}catch(InvalidOperationException){failed=true;}check(failed,message);}
        var archive=Load(FixtureJson);var thread=archive.Threads.Single();check(thread.Id=="synthetic-peer" && thread.Name=="合成会话","actual wrapper Session/Messages field layout");
        check(thread.Lines[0].Id=="1" && archive.Chronological,"descending export reordered chronologically");
        var slice=ChatImport.Select(thread,ChatImport.SelfFlags,100);check(slice.Count==2 && slice.EvidenceIds.SequenceEqual(new[]{"M00001","M00002"}),"source references correspond to ordered preview");
        check(!slice.Transcript.Contains("合成自己") && !slice.Transcript.Contains("合成好友") && !slice.Transcript.Contains("13800138000") && !slice.Transcript.Contains("demo@example.com"),"known names phone and email excluded from outbound preview");
        check(slice.Transcript.Contains("我：") && slice.Transcript.Contains("对方1："),"self flags remain distinct from friend");
        Reject(()=>ChatImport.Select(thread,"",100),"never guesses which participant is self");
        Reject(()=>ChatImport.Select(thread,"absent",100),"unknown self identity rejected");
        Reject(()=>ChatImport.Select(thread,ChatImport.SelfFlags,201),"range bounded");
        string csv="时间,发送人,类型,内容\r\n2026-11-04 12:00:00,我,文本,\"第一行,有逗号\r\n第二行\"\r\n2026-11-04 12:01:00,对方,文本,\"他说\"\"好呀\"\"\"\r\n";
        var csvThread=Load(csv,"messages.csv").Threads.Single();check(csvThread.Lines.Count==2 && csvThread.Lines[0].Text.Contains("\r\n") && csvThread.Lines[1].Text=="他说\"好呀\"","RFC4180 multilingual multiline quote and comma support");
        Reject(()=>ChatImport.Select(csvThread,ChatImport.SelfFlags,50),"CSV missing self flags requires manual identity");
        check(ChatImport.Select(csvThread,"我",50).Count==2,"manual self identity works for original tool CSV");
        check(ChatImport.Load(new byte[]{255,254}.Concat(Encoding.Unicode.GetBytes(csv)).ToArray(),"messages.csv").Threads.Count==1,"UTF16 BOM CSV parsed without mojibake");
        check(Load("\uFEFF"+FixtureJson).Threads.Count==1,"UTF8 BOM JSON");
        Reject(()=>Load("发送人,内容\n我,\"未闭合","messages.csv"),"unterminated CSV rejected");
        Reject(()=>Load("发送人,内容\n我,好呀,多余列","messages.csv"),"inconsistent CSV columns rejected");
        Reject(()=>Load("发送人,内容\n我,\"好呀\"tail","messages.csv"),"trailing CSV quoted cell characters rejected");
        Reject(()=>Load("StrTalker,StrContent\nfriend,text","messages.csv"),"conversation ID never silently treated as sender");
        Reject(()=>Load("{\"SessionsFile\":\"../../secret.json\"}","manifest.json"),"manifest never follows local paths");
        Reject(()=>ChatImport.Load([255,255,0],"messages.json"),"invalid UTF8 rejected");
        Reject(()=>ChatImport.Load([1],"message.db"),"database rejected without opening database or loading key code");
        Reject(()=>ChatImport.Load(new byte[ChatImport.MaxBytes+1],"messages.json"),"import size bounded");
        using(var cancelled=new CancellationTokenSource()){cancelled.Cancel();bool stopped=false;try{ChatImport.Load(Bytes(FixtureJson),"messages.json",cancelled.Token);}catch(OperationCanceledException){stopped=true;}check(stopped,"import cancellation before processing");}
        var data=Zip(("agent_data/manifest.json","{\"MessageFiles\":[\"../../outside.json\"]}"),("agent_data/contacts.json","private-contact-not-loaded"),("agent_data/messages/peer.json",FixtureJson));
        check(ChatImport.Load(data,"export.zip").Threads.Single().Lines.Count==2,"agent-data ZIP only reads message entries, never manifests contacts or external paths");
        Reject(()=>ChatImport.Load(Zip(("chatlog_alpha.exe","not-run"),("messages.json",FixtureJson)),"installer.zip"),"executable installer archive rejected without extraction or execution");
        Reject(()=>ChatImport.Load(Zip(("../messages.json",FixtureJson)),"export.zip"),"unsafe archive paths rejected without extraction");
        string rows="[{\"Id\":\"1\",\"Sender\":\"我\",\"IsSelf\":true,\"Time\":1,\"Type\":1,\"Content\":\"重复\"},{\"Id\":\"1\",\"Sender\":\"我\",\"IsSelf\":true,\"Time\":1,\"Type\":1,\"Content\":\"重复\"},{\"Id\":\"2\",\"Sender\":\"我\",\"IsSelf\":true,\"Time\":1,\"Type\":1,\"Content\":\"重复\"},{\"Sender\":\"\",\"Type\":3,\"Content\":\"do-not-read-media\"}]";
        var dedup=Load(rows);check(dedup.DuplicateCount==1 && dedup.MediaCount==1,"dedup only identical stable ID; distinct messages preserved, media counted");
        var mediaSlice=ChatImport.Select(dedup.Threads.Single(),"我",50);check(mediaSlice.MediaSkipped==1 && !mediaSlice.Transcript.Contains("do-not-read-media"),"nontext media not sent or fetched");
        string noId="[{\"Sender\":\"我\",\"Content\":\"好\"},{\"Sender\":\"我\",\"Content\":\"好\"}]";var repeated=ChatImport.Select(Load(noId).Threads.Single(),"我",50);check(repeated.Count==2 && repeated.EvidenceIds.Distinct().Count()==2,"identical no-ID messages retain separate source positions");
        var longThread=new ImportedThread("long","long",Enumerable.Range(1,250).Select(n=>new ImportedLine(n.ToString(),n%2==0?"自己":"好友",n%2==0,"2026-11-04",new string('x',2000)+n,true)).ToList());
        var bounded=ChatImport.Select(longThread,ChatImport.SelfFlags,200);check(bounded.Transcript.Length<=ChatImport.MaxPromptChars && bounded.Count<200 && bounded.Shortened==bounded.Count && bounded.Coverage.Contains("250"),"long imports bound newest context and disclose actual coverage and shortened messages");
        check(bounded.EvidenceIds.Last()=="M00250","latest context retained rather than oldest bulk transcript");
        var mixed=Load("[{\"Sender\":\"自己\",\"Time\":\"unknown\",\"Content\":\"1\"},{\"Sender\":\"自己\",\"Time\":\"2026-11-04\",\"Content\":\"2\"}]");check(!mixed.Chronological && mixed.Threads[0].Lines[0].Text=="1","unknown times disclose original order instead of fabricating recency");
        var user=new UserState();var messages=PersonalAi.AnalysisMessages(user,slice,"如何接着聊",7);check(messages.Count==2 && messages[0].Role=="system" && messages[1].Role=="user" && !messages[0].Content.Contains(slice.Transcript),"imported text remains data in user payload, never elevated to system roles");
        check(messages[1].Content.Contains("requestedReplyCount") && !messages[1].Content.Contains("synthetic-test-key"),"analysis payload carries requested count and no API secret");
        var answer=PersonalAi.ParseAnalysis(FixtureAnswer,slice,3);check(answer.Replies.Single().Contains("方便") && answer.Observations.Single().Evidence.Single()=="M00002","actionable structured analysis and checked evidence");
        Reject(()=>PersonalAi.ParseAnalysis(FixtureAnswer.Replace("M00002","M99999"),slice,3),"hallucinated evidence ID rejected");
        Reject(()=>PersonalAi.ParseAnalysis("{\"summary\":\"partial\"}",slice,3),"partial report rejected without overwriting old result");
        Reject(()=>PersonalAi.AnalysisMessages(user,slice,"x",11),"user-defined reply count upper bound");
        Reject(()=>PersonalAi.AnalysisMessages(user,slice,new string('x',501),3),"analysis question length bounded");
        if(fixture is not null)
        {
            using var ai=new PersonalAi();var profile=new ApiProfile("analysis","合成接口",fixture,"fixture-model","synthetic-test-key");user.Profiles=[profile];user.ProfileId=profile.Id;
            var result=await ai.AnalyzeHistory(user,slice,"fixture-history",3,CancellationToken.None);check(result.Replies.Count==1 && result.Observations[0].Evidence[0]=="M00002","analysis full localhost provider flow without paid AI or real histories");
        }
    }
}
