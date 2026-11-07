using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ChatQ.Windows;

internal static class HistoryLibraryChecks
{
    private static ImportedThread Thread(int count,string body="合成消息")=>new("synthetic-thread","合成好友",Enumerable.Range(1,count).Select(i=>new ImportedLine(i.ToString(),i%2==0?"合成自己":"合成好友",i%2==0,$"2026-11-06 10:{i%60:D2}",body+i,true)).ToList());
    private sealed class Provider : HttpMessageHandler
    {
        public int Calls;
        public bool CancelSecond,InvalidFinal;
        public readonly List<string> Kinds=[];
        public string? LastSynthesis;
        public CancellationTokenSource? Cancellation;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken token)
        {
            Calls++;if(CancelSecond && Calls==2){Cancellation!.Cancel();await Task.Delay(Timeout.Infinite,token);}
            string body=await request.Content!.ReadAsStringAsync(token);using var wire=JsonDocument.Parse(body);
            using var input=JsonDocument.Parse(wire.RootElement.GetProperty("messages")[1].GetProperty("content").GetString()!);var value=input.RootElement;
            string kind=value.GetProperty("kind").GetString()!;Kinds.Add(kind);string evidence;
            if(kind=="chatq_history_synthesis_v1")
            {
                LastSynthesis=value.GetRawText();
                evidence=InvalidFinal?"M00002":value.GetProperty("segments")[0].GetProperty("observations")[0].GetProperty("evidence")[0].GetString()!;
                if(body.Contains("13800138000") || body.Contains("demo@example.com"))throw new Exception("private contact details reached synthetic provider");
            }
            else evidence=value.GetProperty("evidenceIds")[0].GetString()!;
            int replies=value.GetProperty("requestedReplyCount").GetInt32();
            var result=new{summary="按所选范围分析的合成总结",observations=new[]{new{point="双方有具体互动",evidence=new[]{evidence},confidence="有限"}},nextSteps=new[]{"核对方便的时间"},topics=new[]{"今天过得怎么样？"},replies=Enumerable.Range(1,replies).Select(i=>"合成回复"+i).ToArray()};
            string output=JsonSerializer.Serialize(new{choices=new[]{new{message=new{content=JsonSerializer.Serialize(result)},finish_reason="stop"}}});
            return new(HttpStatusCode.OK){Content=new StringContent(output,Encoding.UTF8,"application/json")};
        }
    }
    public static async Task Run(string root,Action<bool,string> check)
    {
        void Reject(Action action,string label){bool failed=false;try{action();}catch(Exception e)when(e is InvalidOperationException or CryptographicException){failed=true;}check(failed,label);}
        var store=new ChatLibrary(root);check(!File.Exists(store.FilePath) && store.Read().Chats.Count==0,"reading absent library creates no file");
        var source=Thread(4);var saved=store.Save(source,ChatImport.SelfFlags,true,"日常合成资料");
        check(store.Read().Chats.Single().Thread.Lines.SequenceEqual(source.Lines),"explicit library save preserves raw source messages and metadata");
        check(!Encoding.UTF8.GetString(File.ReadAllBytes(store.FilePath)).Contains("合成消息"),"raw imported messages are encrypted on disk");
        source.Lines.Clear();check(new ChatLibrary(root).Read().Chats.Single().Thread.Lines.Count==4,"save snapshots the import and survives store reopening");
        check(!JsonSerializer.Serialize(PortableData.From(new UserState()),Defaults.Json).Contains("合成消息"),"normal portable state has no chat-library field");
        store.Rename(saved.Id,"重新命名",saved.UpdatedAt);var renamed=store.Read().Chats.Single();
        check(renamed.Name=="重新命名" && renamed.Thread.Lines.Count==4,"rename preserves saved conversation");
        Reject(()=>store.Delete(saved.Id,saved.UpdatedAt),"stale deletion cannot remove newly renamed data");
        Reject(()=>store.Rename(saved.Id,"wrong",saved.UpdatedAt),"stale rename cannot overwrite current label");
        byte[] before=File.ReadAllBytes(store.FilePath);using(var cancelled=new CancellationTokenSource())
        {cancelled.Cancel();bool stopped=false;try{store.Save(Thread(1),ChatImport.SelfFlags,true,"cancelled",cancelled.Token);}catch(OperationCanceledException){stopped=true;}check(stopped && before.SequenceEqual(File.ReadAllBytes(store.FilePath)),"cancelled save preserves prior library atomically");}
        Reject(()=>store.Save(Thread(1),"",true,"invalid"),"saving requires explicitly chosen self identity");
        Reject(()=>store.Rename(saved.Id,"bad\nname",renamed.UpdatedAt),"library labels reject control characters");
        var large=Thread(900,new string('x',19980));Reject(()=>store.Save(large,ChatImport.SelfFlags,true,"too large"),"library rejects oversized import without overwriting");
        check(before.SequenceEqual(File.ReadAllBytes(store.FilePath)),"failed save preserves prior ciphertext");
        for(int i=1;i<ChatLibrary.MaxEntries;i++)store.Save(Thread(1),ChatImport.SelfFlags,true,"资料"+i);
        before=File.ReadAllBytes(store.FilePath);Reject(()=>store.Save(Thread(1),ChatImport.SelfFlags,true,"overflow"),"library count has explicit limit");
        check(before.SequenceEqual(File.ReadAllBytes(store.FilePath)),"full library never silently evicts an existing entry");
        store.Delete(renamed.Id,renamed.UpdatedAt);check(store.Read().Chats.Count==19,"explicit confirmed deletion removes only chosen item");
        byte[] corrupt="corrupt-synthetic-library"u8.ToArray();File.WriteAllBytes(store.FilePath,corrupt);
        Reject(()=>store.Save(Thread(1),ChatImport.SelfFlags,true,"must not overwrite"),"corrupt library is never replaced by a new blank library");
        check(corrupt.SequenceEqual(File.ReadAllBytes(store.FilePath)),"corrupt encrypted source remains intact");

        var thread=Thread(450,"今天商量散步 13800138000 demo@example.com");
        var plan=HistoryPlan.Create(thread,ChatImport.SelfFlags,450);
        check(plan.Parts.Count==3 && plan.Requests==4 && plan.Evidence.Count==450,"long history is split into bounded chunks plus one final synthesis");
        check(plan.Parts.SelectMany(p=>p.EvidenceIds).SequenceEqual(Enumerable.Range(1,450).Select(i=>"M"+i.ToString("D5"))),"chunking covers every selected message in order exactly once");
        check(plan.Parts.All(p=>p.Count<=200 && p.Transcript.Length<=ChatImport.MaxPromptChars),"message and prompt bounds apply to every chunk");
        check(plan.Parts.All(p=>!p.Transcript.Contains("13800138000") && !p.Transcript.Contains("demo@example.com") && !p.Transcript.Contains("合成好友")),"all chunks preserve anonymization");
        var recent=HistoryPlan.Create(thread,ChatImport.SelfFlags,100);check(recent.Evidence.First().Id=="M00351" && recent.Requests==1,"recent range retains stable original evidence IDs");
        var longPlan=HistoryPlan.Create(Thread(100,new string('x',1599)+"😀tail"),ChatImport.SelfFlags,100);
        check(longPlan.Parts.Count>1 && longPlan.Evidence.All(e=>!e.Text.Contains('\ufffd') && !char.IsHighSurrogate(e.Text[1599])),"long message shortening never leaves split surrogate characters");
        Reject(()=>HistoryPlan.Create(Thread(1000,new string('x',1900)),ChatImport.SelfFlags,1000),"excessive chunk count is rejected before any AI call");
        using(var cancel=new CancellationTokenSource()){cancel.Cancel();bool stopped=false;try{HistoryPlan.Create(thread,ChatImport.SelfFlags,200,cancel.Token);}catch(OperationCanceledException){stopped=true;}check(stopped,"planning honors cancellation");}
        var state=new UserState{Profiles=[new("qa","合成接口","https://fixture.invalid/v1","fixture-model","synthetic-key")],ProfileId="qa"};
        var provider=new Provider();using(var ai=new PersonalAi(provider))
        {
            var job=new HistoryAnalysisJob(state,plan,"接下来如何聊",3);var updates=new List<HistoryProgress>();
            var result=await ai.AnalyzeLongHistory(state,plan,"接下来如何聊",3,job,updates.Add,CancellationToken.None);
            check(provider.Calls==4 && job.Completed==3 && job.Finished && result.Replies.Count==3,"long analysis calls only planned chunks and synthesis with requested replies");
            check(provider.Kinds.Last()=="chatq_history_synthesis_v1" && updates.Last().Completed==4,"phase and progress identify final synthesis");
            bool rejected=false;try{await ai.AnalyzeLongHistory(state,plan,"changed question",3,job,null,CancellationToken.None);}catch(InvalidOperationException){rejected=true;}
            check(rejected && provider.Calls==4,"question changes cannot reuse old chunks or incur hidden calls");
        }
        provider=new Provider();using(var ai=new PersonalAi(provider))
        {
            var one=new HistoryAnalysisJob(state,recent,"",5);var answer=await ai.AnalyzeLongHistory(state,recent,"",5,one,null,CancellationToken.None);
            check(provider.Calls==1 && answer.Replies.Count==5 && one.Finished,"single chunk uses a single request and honors reply count");
        }
        provider=new Provider();using(var cts=new CancellationTokenSource())using(var ai=new PersonalAi(provider))
        {
            provider.CancelSecond=true;provider.Cancellation=cts;var job=new HistoryAnalysisJob(state,plan,"",2);bool cancelled=false;
            try{await ai.AnalyzeLongHistory(state,plan,"",2,job,null,cts.Token);}catch(OperationCanceledException){cancelled=true;}
            check(cancelled && job.Completed==1 && !job.Finished && provider.Calls==2,"cancellation retains only completed chunks and never auto retries");
            var file = HistoryCheckpoint.Save(state, thread, ChatImport.SelfFlags, 500, "", 2, plan, job, default);
            var restored = HistoryCheckpoint.Restore(file, state, thread, ChatImport.SelfFlags, default);
            check(!ReferenceEquals(restored.Job, job) && restored.Job.Completed == 1 && restored.Plan.Requests == 4 &&
                restored.Maximum == 500 && restored.ReplyCount == 2 && provider.Calls == 2, "opening encrypted progress restores the exact next step without provider calls");
            Reject(() => HistoryCheckpoint.Restore(file, state, thread with { Id = "different-thread" }, ChatImport.SelfFlags, default), "identical excerpts from a different source cannot share progress");
            Reject(() => HistoryCheckpoint.Restore(file, state, thread, "合成自己", default), "restoring requires the same explicit identity selection");
            var profile = state.Profiles[0];
            state.Profiles[0] = profile with { BaseUrl = "https://different.invalid/v1" };
            Reject(() => HistoryCheckpoint.Restore(file, state, thread, ChatImport.SelfFlags, default), "different endpoint with the same display name rejects saved analysis");
            state.Profiles[0] = profile;
            var damaged = file.ToArray(); damaged[^1] ^= 0x80;
            Reject(() => HistoryCheckpoint.Restore(damaged, state, thread, ChatImport.SelfFlags, default), "modified encrypted progress is rejected");
            Reject(() => HistoryCheckpoint.Restore(new byte[HistoryCheckpoint.MaxBytes+1], state, thread, ChatImport.SelfFlags, default), "progress files are bounded before decrypt");
            byte[] plain = DeviceEncryption.Unprotect(file);
            try
            {
                using var snapshot = JsonDocument.Parse(plain);
                check(snapshot.RootElement.EnumerateObject().Select(x => x.Name).ToHashSet().SetEquals(
                    new[]{"format","sourceHash","scope","maximum","question","replyCount","parts"}) &&
                    !Encoding.UTF8.GetString(plain).Contains("synthetic-key"), "progress stores only scope hashes, options and completed answers");
                var edited = System.Text.Json.Nodes.JsonNode.Parse(plain)!;
                edited["parts"]![0]!["observations"]![0]!["evidence"]![0] = "M00450";
                var badCitation = DeviceEncryption.Protect(JsonSerializer.SerializeToUtf8Bytes(edited));
                Reject(() => HistoryCheckpoint.Restore(badCitation,state,thread,ChatImport.SelfFlags,default), "invalid cross-chunk citation is rejected before accepting any progress");
            }
            finally { CryptographicOperations.ZeroMemory(plain); }
            job = restored.Job;
            provider.CancelSecond=false;await ai.AnalyzeLongHistory(state,restored.Plan,"",2,job,null,CancellationToken.None);
            check(provider.Calls==5 && job.Completed==3 && job.Finished,"manual continuation resumes missing chunks without repeating completed work");
            int calls=provider.Calls;bool rejected=false;state.ConfigurationRevision=Guid.NewGuid().ToString("N");
            try{await ai.AnalyzeLongHistory(state,plan,"",2,job,null,CancellationToken.None);}catch(InvalidOperationException){rejected=true;}
            check(rejected && provider.Calls==calls,"API and persona revision changes reject cached progress before calling the model");
        }
        provider=new Provider{InvalidFinal=true};using(var ai=new PersonalAi(provider))
        {
            var job=new HistoryAnalysisJob(state,plan,"",1);bool rejected=false;try{await ai.AnalyzeLongHistory(state,plan,"",1,job,null,CancellationToken.None);}catch(InvalidOperationException){rejected=true;}
            check(rejected && !job.Finished && job.Completed==3,"final synthesis cannot cite an ID absent from transmitted segment summaries");
            var file = HistoryCheckpoint.Save(state, thread, ChatImport.SelfFlags, 500, "", 1, plan, job, default);
            var restored = HistoryCheckpoint.Restore(file, state, thread, ChatImport.SelfFlags, default);
            provider.InvalidFinal=false;int calls=provider.Calls;
            string preview=PersonalAi.SynthesisInput(restored.Plan,"",1,restored.Job).Payload;
            await ai.AnalyzeLongHistory(state, restored.Plan, "", 1, restored.Job, null, default);
            check(provider.Calls==calls+1 && provider.Kinds.Last()=="chatq_history_synthesis_v1", "when only synthesis failed a restored session pays for exactly one remaining request");
            check(provider.LastSynthesis==preview && !preview.Contains("demo@example.com"), "when only synthesis remains the preview matches the exact outbound user payload");
            Reject(() => HistoryCheckpoint.Save(state,thread,ChatImport.SelfFlags,500,"",1,restored.Plan,restored.Job,default), "a finished job cannot be reopened as an unfinished checkpoint");
        }
        provider=new Provider();using(var ai=new PersonalAi(provider))
        {
            var changed=plan with{Parts=[..plan.Parts]};var job=new HistoryAnalysisJob(state,changed,"",1);changed.Parts[0]=changed.Parts[0] with{Transcript=changed.Parts[0].Transcript+" changed"};bool rejected=false;
            try{await ai.AnalyzeLongHistory(state,changed,"",1,job,null,CancellationToken.None);}catch(InvalidOperationException){rejected=true;}
            check(rejected && provider.Calls==0,"changed transcript cannot reuse completed job identity");
        }
    }
}
