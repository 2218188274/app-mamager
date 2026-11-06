using System.Reflection;
using ChatQ.Windows;

internal static class RefinementChecks
{
    private sealed class Adapter:IHubTransport
    {
        public Action<HubIncoming>? Incoming;
        public TaskCompletionSource<string>? Receipt;
        public int Submits;
        public Task Connect(HubConnection connection,IReadOnlyList<HubRule> rules,Action<HubIncoming> incoming,Action<string> disconnected,CancellationToken token){Incoming=incoming;return Task.CompletedTask;}
        public Task<string> Send(HubIncoming target,string text,CancellationToken token){Submits++;return Receipt?.Task??Task.FromResult("synthetic-receipt");}
        public void Dispose(){}
    }
    private static async Task Wait(Func<bool> done)
    {for(int i=0;i<200&&!done();i++)await Task.Delay(10);if(!done())throw new Exception("Refinement synthetic operation timed out");}
    public static async Task Run(string root,Action<bool,string> check)
    {
        var library=new ChatLibrary(Path.Combine(root,"library"));
        var thread=new ImportedThread("synthetic","合成资料",[new("1","我",true,"","合成消息",true)]);
        foreach(bool deleting in new[]{false,true})
        {
            var row=library.Save(thread,ChatImport.SelfFlags,true,"原名称");byte[] before=File.ReadAllBytes(library.FilePath);
            object gate=typeof(ChatLibrary).GetProperty("Gate",BindingFlags.NonPublic|BindingFlags.Instance)!.GetValue(library)!;
            using var cancel=new CancellationTokenSource();using var started=new ManualResetEventSlim();Task work;
            Monitor.Enter(gate);
            try
            {
                work=Task.Run(()=>{started.Set();var other=new ChatLibrary(Path.Combine(root,"library"));if(deleting)other.Delete(row.Id,row.UpdatedAt,cancel.Token);else other.Rename(row.Id,"被取消的名称",row.UpdatedAt,cancel.Token);},cancel.Token);
                if(!started.Wait(5000))throw new Exception("Cancellation test worker did not start");cancel.Cancel();
            }
            finally{Monitor.Exit(gate);}
            bool stopped=false;try{await work;}catch(OperationCanceledException){stopped=true;}
            check(stopped&&File.ReadAllBytes(library.FilePath).SequenceEqual(before),deleting?"in-flight cancelled delete preserves exact encrypted library":"in-flight cancelled rename preserves exact encrypted library");
            check(library.Read().Chats.Single(x=>x.Id==row.Id).Name=="原名称","cancelled queued library operation leaves original record accessible");
        }

        var user=new UserState{Profiles=[new("api","合成接口","https://example.invalid/v1","fixture-model","synthetic-key")],ProfileId="api"};
        var one=new HubRule("one","qq","10001","20001","合成一","api","natural");var two=one with{Id="two",Peer="20002",Name="合成二",Paused=true};
        var store=new HubStore(Path.Combine(root,"hub"));
        store.Update(s=>{s.Connection=new("qq","10001","ws://127.0.0.1:3001/","synthetic-channel-token");s.Rules=[one,two];s.Contexts[one.Id]=[new("user","要清除的上下文"),new("assistant","旧回答")];s.Contexts[two.Id]=[new("user","其他好友的上下文")];s.BudgetDay=DateTime.UtcNow.ToString("yyyy-MM-dd");s.Requests=2;s.Sends=3;s.CooldownSeconds=5;s.AutoStartRevision=s.Revision;s.AutoStartConfiguration=user.ConfigurationRevision;s.AutoStartScope=new string('a',64);});
        bool hold=false;var generated=new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);List<Message> latest=[];
        Task<string> Complete(ApiProfile profile,List<Message> messages,CancellationToken token){latest=messages;return hold?generated.Task:Task.FromResult("合成回复");}
        using var hub=new MessageHub(store,()=>user,Complete);var adapter=new Adapter();await hub.Start(adapter);
        adapter.Incoming!(new("qq","10001","20001","first","合成问题",DateTime.UtcNow));await Wait(()=>store.Read().Items.LastOrDefault()?.Status=="ready");
        string id=store.Read().Items.Last().Id;
        // Regenerate after cooldown without waiting on wall-clock time.
        store.Update(s=>s.LastRequests[one.Id]=DateTime.UtcNow.AddMinutes(-1));hold=true;Task pending=hub.Generate(id);
        var beforeReset=store.Read();int count=hub.ResetContext(one.Id);var reset=store.Read();
        check(count==2&&!hub.Active&&!hub.Running&&!reset.Contexts.ContainsKey(one.Id),"explicit context reset stops the run and removes only selected AI memory");
        check(reset.Contexts[two.Id].Single().Content=="其他好友的上下文"&&reset.Rules.SequenceEqual(beforeReset.Rules),"context reset preserves other friend memory, identities and paused choices");
        check(reset.Requests==beforeReset.Requests&&reset.Sends==beforeReset.Sends&&reset.LastRequests[one.Id]==beforeReset.LastRequests[one.Id],"context reset cannot reset daily attempts or cooldown");
        check(reset.Items.Count==beforeReset.Items.Count&&reset.Items.Single().Status=="interrupted"&&reset.AutoStartRevision==""&&reset.AutoStartScope=="","context reset preserves processing records, invalidates drafts and revokes startup consent");
        generated.SetResult("已取消的旧生成");await pending;
        check(store.Read().Items.Single().Status=="interrupted"&&adapter.Submits==0&&!store.Read().Contexts.ContainsKey(one.Id),"late old generation cannot revive a reset task or submit a reply");
        hold=false;store.Update(s=>s.LastRequests.Clear());var current=new Adapter{Receipt=new(TaskCreationOptions.RunContinuationsAsynchronously)};await hub.Start(current);
        current.Incoming!(new("qq","10001","20001","second","从新消息开始",DateTime.UtcNow));await Wait(()=>store.Read().Items.LastOrDefault()?.Status=="ready");
        check(!latest.Any(m=>m.Content.Contains("要清除的上下文")||m.Content.Contains("其他好友的上下文")),"new generation after explicit reconnect has no reset or other-friend memory");
        Task send=hub.Approve(store.Read().Items.Last().Id,"合成回复");check(current.Submits==1,"synthetic submission held for a late receipt regression");
        hub.ResetContext(one.Id);int sends=store.Read().Sends;current.Receipt.SetResult("synthetic-late-receipt");await send;
        check(!store.Read().Contexts.ContainsKey(one.Id)&&store.Read().Items.Last().Status=="sent"&&!hub.Active&&store.Read().Sends==sends,"late acknowledged submission records truth without restoring reset context or retrying");
        var stable=new Adapter();await hub.Start(stable);byte[] exact=File.ReadAllBytes(store.FilePath);bool rejected=false;try{hub.ResetContext("removed-rule");}catch(InvalidOperationException){rejected=true;}
        check(rejected&&hub.Running&&File.ReadAllBytes(store.FilePath).SequenceEqual(exact),"stale removed-rule reset neither pauses another connection nor mutates data");
    }
}
