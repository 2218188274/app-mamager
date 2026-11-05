using System.Text.Json;
using ChatQ.Windows;

internal static class HubAutomaticChecks
{
    public static void Run(Action<bool,string> check)
    {
        var user=new UserState{Profiles=[new("api","合成接口","https://example.invalid/v1","fixture","synthetic-autostart-model-key")],ProfileId="api"};
        HubState Policy()=>new(){Connection=new("qq","10001","ws://127.0.0.1:3001/","synthetic-autostart-channel-token"),Rules=[new("one","qq","10001","20001","合成好友","api","natural","auto")]};
        var policy=Policy();
        check(HubAutomatic.Inspect(policy,user).Status=="disabled" && policy.AutoReplyDelaySeconds==2,"automatic startup is opt-in and continuous text default waits two seconds");
        HubAutomatic.Enable(policy,user);HubStore.Validate(policy);
        check(HubAutomatic.Inspect(policy,user).Status=="ready","one explicit setup authorizes startup without per-launch or per-message confirmation");
        string report=JsonSerializer.Serialize(HubAutomatic.Inspect(policy,user));
        check(!report.Contains("synthetic-autostart-model-key") && !report.Contains("synthetic-autostart-channel-token"),"automatic readiness report never reveals API or bridge credentials");
        policy.Requests++;policy.Sends++;policy.BudgetDay="2026-11-05";
        check(HubAutomatic.HasConsent(policy,user),"normal attempt counters do not revoke configured startup scope");
        string configuration=user.ConfigurationRevision;user.ConfigurationRevision=Guid.NewGuid().ToString("N");
        check(HubAutomatic.Inspect(policy,user).Status=="blocked","changed provider or persona configuration cannot reuse startup consent");user.ConfigurationRevision=configuration;
        policy.Rules[0]=policy.Rules[0] with{Peer="20002"};
        check(HubAutomatic.Inspect(policy,user).Status=="blocked","peer changes are rejected even if caller forgot to rotate revision");policy.Rules[0]=policy.Rules[0] with{Peer="20001"};
        policy.Connection=policy.Connection with{Token="another-synthetic-channel-token"};
        check(HubAutomatic.Inspect(policy,user).Status=="blocked","connection credential changes cannot silently reuse an old startup scope");policy.Connection=Policy().Connection;
        policy.Rules[0]=policy.Rules[0] with{Mode="confirm"};bool rejected=false;
        try{HubAutomatic.Enable(policy,user);}catch(InvalidOperationException){rejected=true;}
        check(rejected,"confirmation-mode friends are never silently upgraded when enabling startup");policy.Rules[0]=policy.Rules[0] with{Mode="auto"};
        policy.Items.Add(new(){RuleId="one",Run="synthetic-run",Source=new("qq","10001","20001","unknown","合成消息",DateTime.UtcNow),Status="unknown"});
        check(HubAutomatic.Inspect(policy,user).Status=="blocked","unresolved submission prevents unattended startup and replay");policy.Items.Clear();
        policy.Rules[0]=policy.Rules[0] with{Paused=true};check(HubAutomatic.Inspect(policy,user).Status=="blocked","taking over a friend never silently re-arms it at startup");
        policy.Rules[0]=policy.Rules[0] with{Paused=false};HubAutomatic.Disable(policy);
        check(HubAutomatic.Inspect(policy,user).Status=="disabled" && policy.AutoStartScope.Length==0,"explicit stop clears saved automatic-start authorization");
        policy=Policy();policy.Rules[0]=policy.Rules[0] with{Mode="confirm"};
        policy.Rules.Add(policy.Rules[0] with{Id="paused",Peer="20002",Paused=true});
        policy.Rules.Add(policy.Rules[0] with{Id="other-account",Account="10002",Peer="20003"});
        HubAutomatic.SetCurrentFriendsAutomatic(policy);
        check(policy.Rules[0].Mode=="auto" && policy.Rules[1].Mode=="confirm" && policy.Rules[1].Paused && policy.Rules[2].Mode=="confirm","one-click automatic preset preserves paused friends and other accounts");
        check(policy.AutoStartRevision.Length==0,"changing automatic friend scope does not itself authorize a live connection");

        policy=Policy();string run=Guid.NewGuid().ToString("N"),revision=user.ConfigurationRevision;
        HubItem Row(string id,string text,string status="obsolete",string peer="20001",string account="10001")=>new(){Id=id,RuleId="one",Run=run,ConfigurationRevision=revision,Source=new("qq",account,peer,id,text,DateTime.UtcNow),Status=status};
        policy.Items=[Row("old","已经回复的内容","sent"),Row("a","明天有空吗？"),Row("foreign","其他账号消息",account:"10002"),Row("wrong-peer","其他好友消息",peer:"20002"),Row("b","一起吃饭吧","received")];
        check(HubAutomatic.Inputs(policy,policy.Items[^1]).SequenceEqual(new[]{"明天有空吗？","一起吃饭吧"}),"batch includes consecutive unsent text in order and excludes other accounts peers and submitted history");
        policy.Items=[Row("old","人工接管前的内容"),Row("stop","人工接管","interrupted"),Row("new","重新开始的新消息","received")];
        check(HubAutomatic.Inputs(policy,policy.Items[^1]).SequenceEqual(new[]{"重新开始的新消息"}),"manual-takeover boundary prevents older text from joining a later reply");
        policy.Items=[Row("completed","上一轮已经生成但未提交的消息"),Row("new","这一轮的新消息","received")];policy.Items[0].CompletedBatch=true;
        check(HubAutomatic.Inputs(policy,policy.Items[^1]).SequenceEqual(new[]{"这一轮的新消息"}),"completed but superseded drafts never leak into a later independent batch");
        policy.Items=Enumerable.Range(0,8).Select(i=>Row(i.ToString(),"合成消息"+i,i==7?"received":"obsolete")).ToList();
        check(HubAutomatic.Inputs(policy,policy.Items[^1]).SequenceEqual(Enumerable.Range(3,5).Select(i=>"合成消息"+i)),"continuous messages are bounded to the most recent five without slicing message text");
        policy.Items[0].Source=policy.Items[0].Source with{Text="验证码在较早的一条"};
        check(HubAutomatic.HasReviewWord(policy,policy.Items[^1]),"a keyword in an omitted earlier burst message still prevents automatic submission");
        policy.Items[^1].Status="ready";
        check(HubAutomatic.Inputs(policy,policy.Items[^1]).Last()=="合成消息7","explicit regeneration retains the current latest message");
        policy.AutoReplyDelaySeconds=16;rejected=false;try{HubStore.Validate(policy);}catch(InvalidOperationException){rejected=true;}
        check(rejected,"unbounded automatic debounce is rejected before saving encrypted data");
    }
}
