using ChatQ.Windows;

internal static class HubAutoChecks
{
    private sealed class Adapter : IHubTransport
    {
        public Action<HubIncoming>? Incoming;
        public int Sends;
        public int Connects;
        public bool Disposed;
        public readonly List<string> Sources=[];
        public TaskCompletionSource<string>? Submission;
        public Task Connect(HubConnection c,IReadOnlyList<HubRule> rules,Action<HubIncoming> incoming,Action<string> disconnected,CancellationToken token){Connects++;Incoming=incoming;return Task.CompletedTask;}
        public Task<string> Send(HubIncoming target,string text,CancellationToken token){token.ThrowIfCancellationRequested();Sources.Add(target.Id);Interlocked.Increment(ref Sends);return Submission?.Task??Task.FromResult("synthetic-auto-receipt");}
        public void Dispose()=>Disposed=true;
    }
    private static async Task Wait(Func<bool> done,int attempts=200)
    {for(int n=0;n<attempts&&!done();n++)await Task.Delay(10);if(!done())throw new Exception("auto-reply synthetic operation timed out");}
    private sealed class Timer
    {
        private readonly object gate=new();
        private DateTime now=DateTime.UtcNow;
        private readonly List<(DateTime Due,TaskCompletionSource Ready,Task Wait)> waits=[];
        public DateTime Now {get{lock(gate)return now;}}
        public int Pending {get{lock(gate)return waits.Count(x=>!x.Wait.IsCompleted);}}
        public bool IgnoreCancellation;
        public Task Delay(TimeSpan duration,CancellationToken token)
        {
            lock(gate){var ready=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);var wait=IgnoreCancellation?ready.Task:ready.Task.WaitAsync(token);waits.Add((now+duration,ready,wait));return wait;}
        }
        public void Advance(double seconds)
        {
            TaskCompletionSource[] due;
            lock(gate){now=now.AddSeconds(seconds);due=waits.Where(x=>x.Due<=now).Select(x=>x.Ready).ToArray();}
            foreach(var ready in due)ready.TrySetResult();
        }
    }
    public static async Task Run(string root,Action<bool,string> check)
    {
        var user=new UserState{Profiles=[new("api","合成API","https://example.invalid/v1","fixture","synthetic-key")],ProfileId="api"};
        var store=new HubStore(root);store.Update(s=>{s.Connection=new("qq","10001","ws://127.0.0.1:3001/","synthetic-auto-token");s.Rules=[new("one","qq","10001","20001","合成好友","api","natural","auto")];s.CooldownSeconds=5;s.AutoReplyDelaySeconds=0;});
        int calls=0;var adapter=new Adapter();using var hub=new MessageHub(store,()=>user,(p,m,t)=>{Interlocked.Increment(ref calls);return Task.FromResult("合成自动回复");});
        HubIncoming Message(string id)=>new("qq","10001","20001",id,"合成消息"+id,DateTime.UtcNow);
        await hub.Start(adapter);adapter.Incoming!(Message("one"));await Wait(()=>store.Read().Items.LastOrDefault()?.Status=="sent");
        adapter.Incoming!(Message("two"));await Task.Delay(5600);
        check(calls==2&&adapter.Sends==2&&store.Read().Items.Last().Status=="sent","automatic friend reply resumes after cooldown without another incoming message or manual click");
        hub.Stop();

        HubStore Store(string name,string mode="auto")
        {
            var result=new HubStore(Path.Combine(root,name));result.Update(s=>{s.Connection=store.Read().Connection;s.Rules=[store.Read().Rules[0] with{Mode=mode}];s.CooldownSeconds=5;s.AutoReplyDelaySeconds=0;});return result;
        }
        HubIncoming Incoming(Timer timer,string id,string text="合成消息",string peer="20001",bool self=false)=>new("qq","10001",peer,id,text,timer.Now,self);
        var timer=new Timer();var burst=Store("burst");var burstAdapter=new Adapter();int burstCalls=0;var prompts=new List<List<Message>>();
        using var burstHub=new MessageHub(burst,()=>user,(p,m,t)=>{burstCalls++;prompts.Add(m);return Task.FromResult("合成回复");},()=>timer.Now,timer.Delay);
        await burstHub.Start(burstAdapter);burstAdapter.Incoming!(Incoming(timer,"first"));await Wait(()=>burstAdapter.Sends==1);
        burstAdapter.Incoming!(Incoming(timer,"second"));await Wait(()=>timer.Pending==1);
        check(burstCalls==1&&burst.Read().Items.Last().Notice.Contains("间隔结束后自动"),"cooldown shows automatic continuation without spending another provider call");
        burstAdapter.Incoming!(Incoming(timer,"latest"));await Wait(()=>timer.Pending==1&&burst.Read().Items.Last().Source.Id=="latest");
        check(burst.Read().Items.Single(i=>i.Source.Id=="second").Status=="obsolete","newer message supersedes pending cooldown message");
        timer.Advance(4);await Task.Delay(20);check(burstCalls==1&&burstAdapter.Sends==1,"automatic reply never bypasses configured cooldown");
        timer.Advance(1);await Wait(()=>burst.Read().Items.Last().Status=="sent");
        check(burstCalls==2&&burstAdapter.Sources.SequenceEqual(new[]{"first","latest"}),"a burst produces only one latest-message reply at the original cooldown boundary");
        check(burst.Read().Requests==2&&burst.Read().Sends==2,"waiting does not reserve duplicate provider or send attempts");
        burstAdapter.Incoming!(Incoming(timer,"manual-keyword","请给我验证码"));await Wait(()=>timer.Pending==1);timer.Advance(5);await Wait(()=>burst.Read().Items.Last().Status=="ready");
        check(burstAdapter.Sends==2&&burst.Read().Items.Last().Notice.Contains("转人工词"),"deferred automatic reply still routes keyword matches to explicit confirmation");
        burstAdapter.Incoming!(Incoming(timer,"outside",peer:"99999"));check(burst.Read().Items.Last().Source.Id=="manual-keyword"&&timer.Pending==0,"outside whitelist never schedules or generates");
        burstAdapter.Incoming!(Incoming(timer,"pending-takeover"));await Wait(()=>timer.Pending==1);burstAdapter.Incoming!(Incoming(timer,"manual-outgoing","本人合成手动回复",self:true));
        timer.Advance(5);await Task.Delay(20);check(timer.Pending==0&&burst.Read().Rules[0].Paused&&burstAdapter.Sends==2,"manual outgoing cancels scheduled automatic reply and pauses only that friend");
        burstHub.Stop();

        foreach(string action in new[]{"pause","stop","reconnect","configuration","policy"})
        {
            var clock=new Timer{IgnoreCancellation=true};var data=Store(action);var channel=new Adapter();int requests=0;
            using var currentHub=new MessageHub(data,()=>user,(p,m,t)=>{requests++;return Task.FromResult("合成回复");},()=>clock.Now,clock.Delay);
            await currentHub.Start(channel);channel.Incoming!(Incoming(clock,"first"));await Wait(()=>channel.Sends==1);
            channel.Incoming!(Incoming(clock,"pending"));await Wait(()=>clock.Pending==1);
            if(action=="pause")currentHub.PauseRule("one");
            if(action is "stop" or "reconnect")currentHub.Stop();
            var replacement=new Adapter();if(action=="reconnect")await currentHub.Start(replacement);
            if(action=="configuration")user.ConfigurationRevision=Guid.NewGuid().ToString("N");
            if(action=="policy")data.Update(s=>s.Revision=Guid.NewGuid().ToString("N"));
            clock.Advance(5);await Task.Delay(40);
            check(requests==1&&channel.Sends==1&&replacement.Sends==0,$"{action} prevents deferred work even when the synthetic timer ignores cancellation");
            if(action=="reconnect")check(currentHub.Running,"old cooldown completion does not stop replacement connection");
        }
        var confirmClock=new Timer();var confirm=Store("confirm","confirm");var confirmAdapter=new Adapter();int confirmCalls=0;
        using var confirmHub=new MessageHub(confirm,()=>user,(p,m,t)=>{confirmCalls++;return Task.FromResult("合成待确认回复");},()=>confirmClock.Now,confirmClock.Delay);
        await confirmHub.Start(confirmAdapter);confirmAdapter.Incoming!(Incoming(confirmClock,"first"));await Wait(()=>confirm.Read().Items.Last().Status=="ready");
        confirmAdapter.Incoming!(Incoming(confirmClock,"second"));confirmClock.Advance(10);await Task.Delay(20);
        check(confirmCalls==1&&confirmAdapter.Sends==0&&confirmClock.Pending==0&&confirm.Read().Items.Last().Status=="received","confirmation mode is not silently upgraded to scheduled automatic sending");

        var receiptClock=new Timer();var receipts=Store("receipt");var receiptAdapter=new Adapter{Submission=new(TaskCreationOptions.RunContinuationsAsynchronously)};int receiptCalls=0;
        using var receiptHub=new MessageHub(receipts,()=>user,(p,m,t)=>{receiptCalls++;return Task.FromResult("合成回复");},()=>receiptClock.Now,receiptClock.Delay);
        await receiptHub.Start(receiptAdapter);receiptAdapter.Incoming!(Incoming(receiptClock,"first"));await Wait(()=>receiptAdapter.Sends==1);
        receiptAdapter.Incoming!(Incoming(receiptClock,"next"));check(receiptCalls==1&&receipts.Read().Items.Last().Status=="received","pending prior submission blocks later provider request");
        receiptAdapter.Submission.SetResult("synthetic-acknowledgement");await Wait(()=>receiptClock.Pending==1);
        receiptClock.Advance(5);await Wait(()=>receipts.Read().Items.Last().Status=="sent");
        check(receiptCalls==2&&receiptAdapter.Sources.SequenceEqual(new[]{"first","next"}),"successful old receipt resumes latest automatic message without another event");

        var unknownClock=new Timer();var unknown=Store("unknown");var unknownAdapter=new Adapter{Submission=new(TaskCreationOptions.RunContinuationsAsynchronously)};int unknownCalls=0;
        using var unknownHub=new MessageHub(unknown,()=>user,(p,m,t)=>{unknownCalls++;return Task.FromResult("合成回复");},()=>unknownClock.Now,unknownClock.Delay);
        await unknownHub.Start(unknownAdapter);unknownAdapter.Incoming!(Incoming(unknownClock,"first"));await Wait(()=>unknownAdapter.Sends==1);
        unknownAdapter.Incoming!(Incoming(unknownClock,"next"));unknownAdapter.Submission.SetException(new IOException("synthetic-unknown-submission"));await Wait(()=>unknown.Read().Rules[0].Paused);
        unknownClock.Advance(10);await Task.Delay(20);check(unknownCalls==1&&unknownAdapter.Sends==1&&unknownClock.Pending==0,"unknown prior submission pauses pending latest message and never retries");

        var budgetClock=new Timer();var budget=Store("budget");budget.Update(s=>s.DailySendLimit=1);var budgetAdapter=new Adapter();
        using var budgetHub=new MessageHub(budget,()=>user,(p,m,t)=>Task.FromResult("合成回复"),()=>budgetClock.Now,budgetClock.Delay);
        await budgetHub.Start(budgetAdapter);budgetAdapter.Incoming!(Incoming(budgetClock,"first"));await Wait(()=>budgetAdapter.Sends==1);
        budgetAdapter.Incoming!(Incoming(budgetClock,"second"));await Wait(()=>budgetClock.Pending==1);budgetClock.Advance(5);await Wait(()=>budget.Read().Items.Last().Status=="ready");
        check(budgetAdapter.Sends==1&&budget.Read().Items.Last().Notice.Contains("发送次数已达上限")&&!budget.Read().Items.Last().Notice.Contains("等待自动发送"),"exhausted send budget keeps a truthful manual action rather than a stuck auto-send notice");

        var retryClock=new Timer();var retry=Store("no-retry");int failures=0;var retryAdapter=new Adapter();
        using var retryHub=new MessageHub(retry,()=>user,(p,m,t)=>{failures++;return Task.FromException<string>(new IOException("synthetic-provider-failure"));},()=>retryClock.Now,retryClock.Delay);
        await retryHub.Start(retryAdapter);retryAdapter.Incoming!(Incoming(retryClock,"failed"));await Wait(()=>retry.Read().Items.Last().Status=="failed");retryClock.Advance(20);await Task.Delay(20);
        check(failures==1&&retryAdapter.Sends==0&&retryClock.Pending==0,"cooldown scheduling never retries failed provider requests");

        var manualClock=new Timer();var manual=Store("manual-race");int manualCalls=0;var manualAdapter=new Adapter();
        using var manualHub=new MessageHub(manual,()=>user,(p,m,t)=>{manualCalls++;return Task.FromResult("合成回复");},()=>manualClock.Now,manualClock.Delay);
        await manualHub.Start(manualAdapter);manualAdapter.Incoming!(Incoming(manualClock,"first"));await Wait(()=>manualAdapter.Sends==1);
        manualAdapter.Incoming!(Incoming(manualClock,"next"));await Wait(()=>manualClock.Pending==1);string pending=manual.Read().Items.Last().Id;
        await manualHub.Generate(pending);check(manualCalls==1&&manualClock.Pending==1,"manual click during cooldown leaves the automatic continuation intact without extra calls");
        manualClock.Advance(5);await Task.WhenAll(manualHub.Generate(pending),Task.Delay(20));await Wait(()=>manual.Read().Items.Last().Status=="sent");
        check(manualCalls==2&&manualAdapter.Sends==2&&manual.Read().Requests==2,"manual click at timer boundary cannot duplicate generation or submission");

        var separateClock=new Timer();var separate=Store("independent-friends");separate.Update(s=>s.Rules.Add(s.Rules[0] with{Id="two",Peer="20002",Name="另一位合成好友"}));var separateAdapter=new Adapter();int separateCalls=0;
        using var separateHub=new MessageHub(separate,()=>user,(p,m,t)=>{separateCalls++;return Task.FromResult("合成回复");},()=>separateClock.Now,separateClock.Delay);
        await separateHub.Start(separateAdapter);separateAdapter.Incoming!(Incoming(separateClock,"first"));await Wait(()=>separateAdapter.Sends==1);
        separateAdapter.Incoming!(Incoming(separateClock,"waiting-first"));await Wait(()=>separateClock.Pending==1);
        separateAdapter.Incoming!(Incoming(separateClock,"other-first",peer:"20002"));await Wait(()=>separateAdapter.Sends==2);
        check(separateCalls==2&&separateClock.Pending==1&&separateAdapter.Sources.Last()=="other-first","one friend's cooldown does not delay a different friend's first reply");
        separateAdapter.Incoming!(Incoming(separateClock,"waiting-other",peer:"20002"));await Wait(()=>separateClock.Pending==2);separateHub.PauseRule("one");separateClock.Advance(5);
        await Wait(()=>separateAdapter.Sends==3);check(separateCalls==3&&separateAdapter.Sources.Last()=="waiting-other"&&!separate.Read().Rules[1].Paused,"taking over one friend cancels only that friend's deferred reply");

        var mergeClock=new Timer();var merged=Store("continuous-input");merged.Update(s=>s.AutoReplyDelaySeconds=2);var mergedAdapter=new Adapter();var mergedPrompts=new List<List<Message>>();
        using var mergedHub=new MessageHub(merged,()=>user,(p,m,t)=>{mergedPrompts.Add(m);return Task.FromResult("合成连续消息回复");},()=>mergeClock.Now,mergeClock.Delay);
        await mergedHub.Start(mergedAdapter);mergedAdapter.Incoming!(Incoming(mergeClock,"part-1","明天有空吗？"));await Wait(()=>mergeClock.Pending==1);
        mergeClock.Advance(1);mergedAdapter.Incoming!(Incoming(mergeClock,"part-2","一起吃饭吧"));await Wait(()=>mergeClock.Pending==1);
        mergeClock.Advance(1);await Task.Delay(25);check(mergedPrompts.Count==0&&mergedAdapter.Sends==0,"automatic reply waits until the most recent message has settled before spending an API attempt");
        mergeClock.Advance(1);await Wait(()=>mergedAdapter.Sends==1);
        check(mergedPrompts.Single().Where(m=>m.Role=="user").Select(m=>m.Content).SequenceEqual(new[]{"明天有空吗？","一起吃饭吧"})&&mergedAdapter.Sources.Single()=="part-2","a continuous burst produces one response with complete recent input and the latest stable send target");
        check(merged.Read().Contexts["one"].Select(m=>m.Content).SequenceEqual(new[]{"明天有空吗？","一起吃饭吧","合成连续消息回复"})&&merged.Read().Requests==1,"acknowledged context retains every grouped input without duplicate API reservations");
        mergeClock.Advance(5);mergedAdapter.Incoming!(Incoming(mergeClock,"keyword-part","前一条包含验证码"));await Wait(()=>mergeClock.Pending==1);
        mergeClock.Advance(1);mergedAdapter.Incoming!(Incoming(mergeClock,"normal-part","后面这条是普通文字"));await Wait(()=>mergeClock.Pending==1);mergeClock.Advance(2);
        await Wait(()=>merged.Read().Items.Last().Status=="ready");check(mergedAdapter.Sends==1&&merged.Read().Items.Last().Notice.Contains("转人工词"),"keyword guard covers earlier grouped messages rather than only the latest text");

        var accountClock=new Timer();var scoped=Store("connection-account-scope");scoped.Update(s=>s.Rules.Add(s.Rules[0] with{Id="foreign-rule",Account="10002"}));var scopedAdapter=new Adapter();int scopedCalls=0;
        using var scopedHub=new MessageHub(scoped,()=>user,(p,m,t)=>{scopedCalls++;return Task.FromResult("合成回复");},()=>accountClock.Now,accountClock.Delay);
        await scopedHub.Start(scopedAdapter);scopedAdapter.Incoming!(Incoming(accountClock,"foreign-event") with{Account="10002"});
        check(scoped.Read().Items.Count==0&&scopedCalls==0,"even a configured friend on another account cannot enter the active session or call the model");
        scopedAdapter.Incoming!(Incoming(accountClock,"current-event"));await Wait(()=>scopedAdapter.Sends==1);check(scopedCalls==1,"active-account automatic replies still work after rejecting a foreign-account callback");

        var startup=Store("automatic-start-scope");startup.Update(s=>HubAutomatic.Enable(s,user));string scope=startup.Read().AutoStartScope;
        startup.Update(s=>{s.Connection=s.Connection with{Account="10002"};s.Rules[0]=s.Rules[0] with{Account="10002"};});
        var startupAdapter=new Adapter();using var startupHub=new MessageHub(startup,()=>user,(p,m,t)=>Task.FromResult("合成回复"));bool scopeRejected=false;
        try{await startupHub.Start(startupAdapter,scope);}catch(InvalidOperationException){scopeRejected=true;}
        check(scopeRejected&&startupAdapter.Connects==0&&startupAdapter.Disposed&&!startupHub.Active,"scope changed between UI inspection and startup is rejected before a transport connects");
        startup.Update(s=>HubAutomatic.Enable(s,user));var authorizedAdapter=new Adapter();await startupHub.Start(authorizedAdapter,startup.Read().AutoStartScope);
        check(startupHub.Running&&authorizedAdapter.Connects==1&&authorizedAdapter.Sends==0,"authorized startup connects once without sending old queue items or invoking a model");
    }
}
