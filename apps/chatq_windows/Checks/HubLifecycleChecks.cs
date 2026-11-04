using ChatQ.Windows;

internal static class HubLifecycleChecks
{
    private sealed class Adapter : IHubTransport
    {
        public TaskCompletionSource? Startup;
        public TaskCompletionSource<string>? Submission;
        public Action<HubIncoming>? Incoming;
        public Action<string>? Disconnected;
        public bool Disposed;
        public readonly List<HubIncoming> Sent=[];
        public Task Connect(HubConnection connection,IReadOnlyList<HubRule> rules,Action<HubIncoming> incoming,Action<string> disconnected,CancellationToken token)
        {Incoming=incoming;Disconnected=disconnected;return Startup?.Task??Task.CompletedTask;}
        public Task<string> Send(HubIncoming target,string text,CancellationToken token){Sent.Add(target);return Submission?.Task??Task.FromResult("synthetic-lifecycle-receipt");}
        public void Dispose()=>Disposed=true;
    }
    private static async Task Wait(Func<bool> done)
    {for(int n=0;n<200 && !done();n++)await Task.Delay(10);if(!done())throw new Exception("lifecycle synthetic operation timed out");}
    public static async Task Run(string root,Action<bool,string> check)
    {
        var state=new UserState{Profiles=[new("api","合成接口","https://example.invalid/v1","fixture-model","synthetic-test-key")],ProfileId="api"};
        DateTime now=DateTime.UtcNow;int calls=0;var rule=new HubRule("one","qq","10001","20001","合成指定好友","api","natural");
        HubStore Store(string name){var s=new HubStore(Path.Combine(root,name));s.Update(v=>{v.Connection=new("qq","10001","ws://127.0.0.1:3001/","synthetic-test-channel-token");v.Rules=[rule];v.CooldownSeconds=5;});return s;}
        HubIncoming Message(string id)=>new("qq","10001","20001",id,"合成新文本",now);
        Task<string> Complete(ApiProfile p,List<Message> m,CancellationToken token){calls++;return Task.FromResult("合成回复");}
        var store=Store("startup");using var hub=new MessageHub(store,()=>state,Complete,()=>now);
        var old=new Adapter{Startup=new(TaskCreationOptions.RunContinuationsAsynchronously)};Task oldStart=hub.Start(old);
        hub.Stop();var current=new Adapter{Startup=new(TaskCreationOptions.RunContinuationsAsynchronously)};Task currentStart=hub.Start(current);
        old.Startup.SetResult();await oldStart;
        check(hub.Active && !hub.Running && old.Disposed,"late old startup success cannot mark replacement connection ready");
        old.Disconnected!(WechatProtocol.Error("CHAT_BINDING_CHANGED"));
        check(hub.Active && !current.Disposed,"old disconnect callback cannot stop replacement connection");
        current.Startup.SetResult();await currentStart;check(hub.Running,"replacement becomes ready only after its own connect completes");
        old.Incoming!(Message("old-late-message"));await Task.Delay(25);
        check(calls==0 && store.Read().Items.Count==0,"previous connection callback cannot introduce stale text into same-account new session");
        current.Incoming!(Message("current-message"));await Wait(()=>store.Read().Items.LastOrDefault()?.Status=="ready");
        check(calls==1 && current.Sent.Count==0,"current allowlisted message still generates confirmation draft normally");
        old.Disconnected!("synthetic-private-untrusted-error");check(hub.Running,"stale untrusted disconnect does not pause active session or leak text");
        hub.Stop();
        var failed=new Adapter{Startup=new(TaskCreationOptions.RunContinuationsAsynchronously)};var failure=hub.Start(failed);hub.Stop();var stable=new Adapter();await hub.Start(stable);
        failed.Startup.SetException(new IOException("synthetic-stale-startup-failure"));bool surfaced=false;try{await failure;}catch{surfaced=true;}
        check(!surfaced && hub.Running && !stable.Disposed,"stale startup failure is ignored without stopping or reporting failure for new session");hub.Stop();
        foreach(bool removeOldItem in new[]{false,true})
        {
            now=now.AddSeconds(6);var sentStore=Store(removeOldItem?"removed-send":"late-send");using var sentHub=new MessageHub(sentStore,()=>state,Complete,()=>now);
            var sending=new Adapter{Submission=new(TaskCreationOptions.RunContinuationsAsynchronously)};await sentHub.Start(sending);sending.Incoming!(Message("pending-submission"));await Wait(()=>sentStore.Read().Items.LastOrDefault()?.Status=="ready");
            string id=sentStore.Read().Items.Single().Id;var submission=sentHub.Approve(id,"待确认提交的合成回复");check(sending.Sent.Count==1,"synthetic adapter holds an actual in-flight submission");sentHub.Stop();
            if(removeOldItem)sentStore.Update(v=>v.Items.Clear());
            var replacement=new Adapter();await sentHub.Start(replacement);sending.Submission.SetException(new IOException("synthetic-late-submission-failure"));await submission;
            check(sentHub.Running && !sentStore.Read().Rules.Single().Paused && !replacement.Disposed,removeOldItem?"late failed send for removed old row cannot stop new session":"late failed send cannot pause new session friend with same rule ID");
            check(sentStore.Read().Contexts.Count==0,"old failed submission never contributes new-session context");
            now=now.AddSeconds(6);replacement.Incoming!(Message("replacement-message"));await Wait(()=>sentStore.Read().Items.LastOrDefault()?.Status=="ready");
            check(replacement.Sent.Count==0 && sentStore.Read().Items.Last().Source.Id=="replacement-message","replacement remains usable after old send failure, without automatic retry");
            if(!removeOldItem)check(sentStore.Read().Items.Find(i=>i.Id==id)?.Status=="unknown","historical uncertain send remains recorded as unknown");
        }
    }
}
