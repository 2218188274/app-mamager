using System.Security.Cryptography;
using System.Text.Json;

namespace ChatQ.Windows;

/// <summary>Explicit saved startup scope and bounded new-message grouping. No network or UI.</summary>
public static class HubAutomatic
{
    public static bool HasConsent(HubState policy,UserState user)=>policy.AutoStartRevision==policy.Revision && policy.AutoStartConfiguration==user.ConfigurationRevision && policy.AutoStartScope==Scope(policy,user);
    private static string Scope(HubState policy,UserState user)
    {
        byte[] data=JsonSerializer.SerializeToUtf8Bytes(new{policy.Connection,rules=policy.Rules.Where(r=>r.Platform==policy.Connection.Platform && r.Account==policy.Connection.Account).OrderBy(r=>r.Id).ToArray(),policy.CooldownSeconds,policy.AutoReplyDelaySeconds,policy.DailyRequestLimit,policy.DailySendLimit,policy.ManualWords,user.ConfigurationRevision});
        try{return Convert.ToHexString(SHA256.HashData(data));}finally{CryptographicOperations.ZeroMemory(data);}
    }
    public static SetupCheck Inspect(HubState policy,UserState user)
    {
        if(policy.AutoStartRevision.Length==0)return new("automatic-start","打开软件自动开始","disabled","尚未开启；不会自行连接账号或发送消息。");
        if(!HasConsent(policy,user))return new("automatic-start","打开软件自动开始","blocked","账号、规则、人设或 API 配置有变化，请检查后重新开启自动开始。");
        return Readiness(policy,user);
    }
    private static SetupCheck Readiness(HubState policy,UserState user)
    {
        var rules=policy.Rules.Where(r=>r.Platform==policy.Connection.Platform && r.Account==policy.Connection.Account && !r.Paused).ToList();
        if(!HubReadiness.Inspect(user,policy).CanAttempt || rules.Any(r=>r.Mode!="auto"))return new("automatic-start","打开软件自动开始","blocked","请先完成 API 和连接配置，将本次指定好友设为自动模式。暂停的好友不会恢复。");
        if(policy.Items.Any(i=>rules.Any(r=>r.Id==i.RuleId) && i.Status is "sending" or "unknown"))return new("automatic-start","打开软件自动开始","blocked","存在未确认的发送结果，本次不会自动连接或补发。请先核对原软件。");
        return new("automatic-start","打开软件自动开始","ready",$"下次打开聊商将自动连接这{rules.Count}位指定好友，处理新消息，无需逐条确认。登录与外部组件仍须可用。");
    }
    public static void Enable(HubState policy,UserState user)
    {
        var readiness=Readiness(policy,user);if(readiness.Status!="ready")throw new InvalidOperationException(readiness.Detail);
        policy.AutoStartRevision=policy.Revision;policy.AutoStartConfiguration=user.ConfigurationRevision;policy.AutoStartScope=Scope(policy,user);
    }
    public static void Disable(HubState policy){policy.AutoStartRevision="";policy.AutoStartConfiguration="";policy.AutoStartScope="";}
    public static void SetCurrentFriendsAutomatic(HubState policy)
    {
        for(int i=0;i<policy.Rules.Count;i++)
        {
            var rule=policy.Rules[i];
            if(rule.Platform==policy.Connection.Platform && rule.Account==policy.Connection.Account && !rule.Paused)policy.Rules[i]=rule with{Mode="auto"};
        }
        policy.Revision=Guid.NewGuid().ToString("N");Disable(policy);
    }

    public static List<string> Inputs(HubState policy,HubItem latest)
        =>Batch(policy,latest).TakeLast(5).Select(i=>i.Source.Text).ToList();
    public static bool HasReviewWord(HubState policy,HubItem latest)
        =>Batch(policy,latest).Any(i=>policy.ManualWords.Any(w=>i.Source.Text.Contains(w,StringComparison.OrdinalIgnoreCase)));
    private static IEnumerable<HubItem> Batch(HubState policy,HubItem latest)
    {
        int end=policy.Items.FindIndex(i=>i.Id==latest.Id);if(end<0)return [latest];
        // Only newly received rows in this exact run/account/peer/configuration are eligible.
        // A submitted or interrupted row is a boundary; no history API or retry is involved.
        int start=end;
        while(start>0)
        {
            var row=policy.Items[start-1];
            if(row.RuleId==latest.RuleId && (row.CompletedBatch || row.Run!=latest.Run || row.ConfigurationRevision!=latest.ConfigurationRevision || row.Status is "sent" or "sending" or "unknown" or "interrupted" or "failed" or "ready"))break;
            start--;
        }
        return policy.Items.Skip(start).Take(end-start+1).Where(i=>i.RuleId==latest.RuleId && i.Run==latest.Run && i.ConfigurationRevision==latest.ConfigurationRevision &&
            i.Source.Platform==latest.Source.Platform && i.Source.Account==latest.Source.Account && i.Source.Peer==latest.Source.Peer && (i.Id==latest.Id || i.Status is "received" or "obsolete"))
            .ToList();
    }
}
