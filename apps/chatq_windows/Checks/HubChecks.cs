using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ChatQ.Windows;

internal static class HubChecks
{
    private sealed class Adapter : IHubTransport
    {
        public readonly List<(HubIncoming Target,string Text)> Sent=[];
        public bool Fail,Disposed;
        public TaskCompletionSource<string>? DelayedSend;
        public Action<HubIncoming>? Incoming;
        public Task Connect(HubConnection c,IReadOnlyList<HubRule> r,Action<HubIncoming> incoming,Action<string> disconnected,CancellationToken token){Incoming=incoming;return Task.CompletedTask;}
        public Task<string> Send(HubIncoming target,string text,CancellationToken token){token.ThrowIfCancellationRequested();Sent.Add((target,text));return DelayedSend?.Task ?? (Fail?Task.FromException<string>(new IOException("synthetic failure")):Task.FromResult("synthetic-receipt"));}
        public void Dispose()=>Disposed=true;
    }
    private static async Task Wait(Func<bool> completed)
    {for(int i=0;i<200 && !completed();i++)await Task.Delay(10);if(!completed())throw new Exception("hub asynchronous check timed out");}
    public static async Task Run(string root,Action<bool,string> check)
    {
        void Reject(Action action,string name){bool rejected=false;try{action();}catch(Exception e) when(e is InvalidOperationException or OperationCanceledException or CryptographicException){rejected=true;}check(rejected,name);}
        async Task RejectAsync(Func<Task> action,string name){bool rejected=false;try{await action();}catch(Exception e) when(e is InvalidOperationException or OperationCanceledException){rejected=true;}check(rejected,name);}
        DateTime time=DateTime.UtcNow;int calls=0;
        var user=new UserState {Profiles=[new("api","合成配置","https://example.invalid/v1","fixture","private-synthetic-api-key")],ProfileId="api"};
        var store=new HubStore(root);var r1=new HubRule("friend-a","qq","10001","20001","合成好友甲","api","natural");var r2=new HubRule("friend-b","qq","10001","20002","合成好友乙","api","warm");
        store.Update(s=>{s.Connection=new("qq","10001","ws://127.0.0.1:3001/","synthetic-bridge-token");s.Rules=[r1,r2];});
        HubIncoming Message(string id,string peer="20001",string text="合成消息",bool self=false)=>new("qq","10001",peer,id,text,time,self);
        var prompts=new List<List<Message>>();var adapter=new Adapter();
        using var hub=new MessageHub(store,()=>user,(p,m,t)=>{calls++;prompts.Add(m);return Task.FromResult("合成建议");},()=>time);
        check(!hub.Active && calls==0 && adapter.Sent.Count==0,"hub never connects or calls AI at construction");
        await hub.Start(adapter);check(hub.Running,"explicit hub start");
        adapter.Incoming!(Message("outside","99999"));adapter.Incoming!(Message("old") with {Time=time.AddMinutes(-3)});adapter.Incoming!(Message("future") with {Time=time.AddMinutes(1)});adapter.Incoming!(Message("wrong-account") with {Account="99999"});
        check(store.Read().Items.Count==0 && calls==0,"outside account peer and stale messages never reach model");
        adapter.Incoming!(Message("1"));await Wait(()=>store.Read().Items.Single().Status=="ready");
        string first=store.Read().Items.Single().Id;
        check(calls==1 && adapter.Sent.Count==0,"confirm mode generates without sending");
        check(prompts[0][0].Content.Contains("自然真诚") && !JsonSerializer.Serialize(prompts).Contains("private-synthetic-api-key"),"per-friend persona without API key in prompt");
        adapter.Incoming!(Message("1"));check(calls==1 && store.Read().Items.Count==1,"message ID dedup before another AI call");
        await hub.Approve(first,"核对后修改的回复");check(adapter.Sent.Single().Text=="核对后修改的回复" && adapter.Sent[0].Target.Peer=="20001","edited response targets original stable peer");
        await RejectAsync(()=>hub.Approve(first,"重复提交"),"submitted item cannot be submitted twice");
        adapter.Incoming!(Message("own-echo",text:"核对后修改的回复",self:true));check(!store.Read().Rules[0].Paused,"known local echo does not trigger manual takeover");
        adapter.Incoming!(Message("2","20002"));await Wait(()=>store.Read().Items.Last().Status=="ready");
        check(prompts.Last().All(m=>m.Content!="核对后修改的回复") && prompts.Last()[0].Content.Contains("温柔"),"friend contexts and personas never mix");
        time=time.AddSeconds(31);adapter.Incoming!(Message("3"));await Wait(()=>store.Read().Items.Last().Status=="ready");
        check(prompts.Last().Any(m=>m.Content=="核对后修改的回复"),"only acknowledged exchanges enter same-friend context");
        string third=store.Read().Items.Last().Id;
        adapter.Incoming!(Message("manual",text:"本人手动回复",self:true));check(store.Read().Rules[0].Paused && store.Read().Items.Last().Status=="interrupted","manual outgoing pauses only matching friend and old ready reply");
        await RejectAsync(()=>hub.Approve(third,"不能发送"),"manual takeover blocks queued send");
        hub.Stop();check(!hub.Active && adapter.Disposed,"pause disconnects connector");
        string cipher=Encoding.UTF8.GetString(File.ReadAllBytes(store.FilePath));check(!cipher.Contains("synthetic-bridge-token") && !cipher.Contains("合成消息"),"channel token and records encrypted at rest");
        check(!JsonSerializer.Serialize(PortableData.From(user)).Contains("synthetic-bridge-token"),"portable app backup has no channel token");
        var invalid=new HubConnection("qq","10001","ws://remote.invalid:3001/","synthetic-bridge-token");Reject(()=>OneBotTransport.Endpoint(invalid),"remote plaintext QQ endpoint rejected");Reject(()=>OneBotTransport.Endpoint(invalid with {Endpoint="ws://127.0.0.1:3001/event"}),"event-only endpoint cannot be used for sending");Reject(()=>OneBotTransport.Endpoint(invalid with {Endpoint="ws://127.0.0.1:3001/?token=secret"}),"token in URL rejected");
        string eventJson=JsonSerializer.Serialize(new {time=new DateTimeOffset(time).ToUnixTimeSeconds(),self_id=10001,post_type="message",message_type="private",sub_type="friend",message_id=17,user_id=20001,message=new[]{new{type="text",data=new{text="合成协议消息"}}}});
        using(var doc=JsonDocument.Parse(eventJson)){var parsed=OneBotTransport.Parse(doc.RootElement,"10001",new HashSet<string>{"20001"});check(parsed?.Text=="合成协议消息" && parsed.Peer=="20001","OneBot text event parsed with exact identity");check(OneBotTransport.Parse(doc.RootElement,"different",new HashSet<string>{"20001"}) is null,"OneBot self-account mismatch rejected");}
        using(var doc=JsonDocument.Parse(eventJson.Replace("\"text\",\"data\"","\"image\",\"data\""))){check(OneBotTransport.Parse(doc.RootElement,"10001",new HashSet<string>{"20001"}) is null,"OneBot mixed/media messages ignored");}
        check(WechatTransport.Script().Contains("wxautox4") && WechatTransport.Script().Contains("empty_draft") && !WechatTransport.Script().Contains("GetAllMessage("),"embedded wx bridge contains guard and no history API");
        if(Environment.GetEnvironmentVariable("CHATQ_ONEBOT_FIXTURE") is { } ws)
        {
            using var wire=new OneBotTransport();using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(10));var received=new List<HubIncoming>();
            await wire.Connect(new("qq","10001",ws,"synthetic-bridge-token"),[r1],m=>{lock(received)received.Add(m);},_=>{},timeout.Token);
            string receipt=await wire.Send(Message("wire"),"合成本机发送",timeout.Token);await Wait(()=>received.Count>0);
            check(receipt=="123456" && received.Single().Peer=="20001","real loopback WebSocket auth echo send receipt and whitelist receive");
            using var wrong=new OneBotTransport();await RejectAsync(()=>wrong.Connect(new("qq","10001",ws,"synthetic-wrong-account"),[r1],_=>{},_=>{},timeout.Token),"loopback login mismatch rejected before any send");
        }

        var autoStore=new HubStore(Path.Combine(root,"auto"));autoStore.Update(s=>{s.Connection=store.Read().Connection;s.Rules=[r1 with{Mode="auto"}];});var autoAdapter=new Adapter();int autoCalls=0;
        using var autoHub=new MessageHub(autoStore,()=>user,(p,m,t)=>{autoCalls++;return Task.FromResult("自动合成建议");},()=>time);
        await autoHub.Start(autoAdapter);autoAdapter.Incoming!(Message("auto1"));await Wait(()=>autoStore.Read().Items.Last().Status=="sent");check(autoAdapter.Sent.Count==1,"allowlisted auto mode submits exactly one reply");
        time=time.AddSeconds(31);autoAdapter.Incoming!(Message("manual-word",text:"请给验证码"));await Wait(()=>autoStore.Read().Items.Last().Status=="ready");check(autoAdapter.Sent.Count==1,"manual keyword keeps automatic reply pending confirmation");
        time=time.AddSeconds(31);autoAdapter.Fail=true;autoAdapter.Incoming!(Message("unknown"));await Wait(()=>autoStore.Read().Items.Last().Status=="unknown");int sends=autoAdapter.Sent.Count;time=time.AddSeconds(31);autoAdapter.Incoming!(Message("no-retry"));
        check(autoStore.Read().Rules.Single().Paused && autoAdapter.Sent.Count==sends,"ambiguous send pauses friend and never retries");
        autoHub.Stop();autoStore.Update(s=>s.Rules[0]=s.Rules[0] with {Paused=false});await autoHub.Start(new Adapter());check(!autoStore.Read().Items.Any(i=>i.Status=="sending"),"restart never resubmits interrupted reservation");autoHub.Stop();

        var limitStore=new HubStore(Path.Combine(root,"limits"));limitStore.Update(s=>{s.Connection=store.Read().Connection;s.Rules=[r1];s.DailyRequestLimit=1;s.DailySendLimit=1;});var limitAdapter=new Adapter();int limitedCalls=0;
        using var limitHub=new MessageHub(limitStore,()=>user,(p,m,t)=>{limitedCalls++;return Task.FromResult("额度合成建议");},()=>time);await limitHub.Start(limitAdapter);
        limitAdapter.Incoming!(Message("limit1"));await Wait(()=>limitStore.Read().Items.Last().Status=="ready");time=time.AddSeconds(31);limitAdapter.Incoming!(Message("limit2"));await Task.Delay(30);
        check(limitedCalls==1 && limitStore.Read().Items.Last().Notice.Contains("上限"),"daily API attempt ceiling survives new messages");
        limitHub.Stop();await limitHub.Start(new Adapter());check(limitStore.Read().Requests==1,"reconnect does not reset daily budget");limitHub.Stop();

        var lateStore=new HubStore(Path.Combine(root,"late"));lateStore.Update(s=>{s.Connection=store.Read().Connection;s.Rules=[r1 with {Mode="auto"}];});var lateAdapter=new Adapter();var delayed=new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
        using var lateHub=new MessageHub(lateStore,()=>user,(p,m,t)=>delayed.Task,()=>time);await lateHub.Start(lateAdapter);lateAdapter.Incoming!(Message("late1"));await Wait(()=>lateStore.Read().Items.Last().Status=="generating");
        lateAdapter.Incoming!(Message("late2"));delayed.SetResult("不应发送的旧回复");await Wait(()=>lateStore.Read().Items[0].Status=="obsolete");await Task.Delay(30);
        check(lateAdapter.Sent.Count==0 && lateStore.Read().Items.Last().Status=="received","new message cancels old generation even when provider ignores cancellation");lateHub.Stop();
        var configStore=new HubStore(Path.Combine(root,"config"));configStore.Update(s=>{s.Connection=store.Read().Connection;s.Rules=[r1 with {Mode="auto"}];});var configAdapter=new Adapter();var delayedConfig=new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
        using var configHub=new MessageHub(configStore,()=>user,(p,m,t)=>delayedConfig.Task,()=>time);await configHub.Start(configAdapter);configAdapter.Incoming!(Message("config1"));await Wait(()=>configStore.Read().Items.Last().Status=="generating");user.ConfigurationRevision=Guid.NewGuid().ToString("N");delayedConfig.SetResult("旧配置回复");await Wait(()=>configStore.Read().Items.Last().Status=="interrupted");check(configAdapter.Sent.Count==0,"API revision change invalidates background send");configHub.Stop();
        var ackStore=new HubStore(Path.Combine(root,"late-ack"));ackStore.Update(s=>{s.Connection=store.Read().Connection;s.Rules=[r1];});var lateAck=new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);var ackAdapter=new Adapter {DelayedSend=lateAck};
        using var ackHub=new MessageHub(ackStore,()=>user,(p,m,t)=>Task.FromResult("合成提交"),()=>time);await ackHub.Start(ackAdapter);ackAdapter.Incoming!(Message("ack1"));await Wait(()=>ackStore.Read().Items.Last().Status=="ready");var submission=ackHub.Approve(ackStore.Read().Items.Last().Id,"已经提交的合成回复");ackHub.Stop();ackStore.Update(s=>{s.Rules[0]=r1 with {Peer="20003"};s.Revision=Guid.NewGuid().ToString("N");});await ackHub.Start(new Adapter());lateAck.SetResult("late-synthetic-receipt");await submission;
        check(ackStore.Read().Contexts.Count==0 && ackStore.Read().Rules[0].Peer=="20003","late transport acknowledgement cannot inject old-target history into replacement session");ackHub.Stop();
        byte[] before=File.ReadAllBytes(store.FilePath);Reject(()=>store.Update(s=>s.Rules.Add(r1)),"duplicate peer rejected before encrypted overwrite");check(before.SequenceEqual(File.ReadAllBytes(store.FilePath)),"invalid rule update is atomic");
        File.WriteAllBytes(store.FilePath,Encoding.UTF8.GetBytes("corrupt synthetic vault"));Reject(()=>store.Update(s=>s.Items.Clear()),"corrupt hub data is not silently replaced");
    }
}
