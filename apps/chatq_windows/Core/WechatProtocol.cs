using System.Text.Json;

namespace ChatQ.Windows;

public sealed record WechatFrame(string Kind,string Account="",HubIncoming? Incoming=null,string Echo="",bool Ok=false,string Receipt="",string Notice="");

/// <summary>Decode independent bridge frames. External diagnostics are never displayed verbatim.</summary>
public static class WechatProtocol
{
    private static readonly string[] Codes=["DEPENDENCY_MISSING","INITIALIZATION_FAILED","ACCOUNT_MISMATCH_OR_UNSUPPORTED","CHAT_BINDING_CHANGED","LOGGING_CONTROL_UNAVAILABLE","STALE_TARGET","DRAFT_OR_UNSUPPORTED_CLIENT","UNCONFIRMED","PROTOCOL_INVALID",""];
    public static bool IsKnownError(string text)=>Codes.Any(code=>Error(code)==text);
    public static string Error(string? code)=>code switch
    {
        "DEPENDENCY_MISSING"=>"所选Python缺少微信连接依赖，请先在该环境准备授权wxautox4。",
        "INITIALIZATION_FAILED"=>"微信组件初始化未完成，请核对授权激活、本人登录状态和客户端兼容性。",
        "ACCOUNT_MISMATCH_OR_UNSUPPORTED"=>"当前微信账号名与配置不符，或组件无法读取本人账号；请核对账号名，暂不连接。",
        "CHAT_BINDING_CHANGED"=>"指定好友窗口未能唯一绑定或已变化，请核对唯一备注与窗口状态后重新连接。",
        "LOGGING_CONTROL_UNAVAILABLE"=>"微信组件无法关闭文件日志，已停止连接；请核对组件版本。",
        "STALE_TARGET"=>"原消息或好友窗口已变化，这条回复不会发送，请等待新的消息。",
        "DRAFT_OR_UNSUPPORTED_CLIENT"=>"微信输入框有待发送草稿，或当前版本无法检查输入框；请本人核对草稿和兼容性。",
        "UNCONFIRMED"=>"连接组件未确认提交结果，请在微信核对；不会自动重试。",
        "PROTOCOL_INVALID"=>"微信连接组件返回格式异常，已停止处理；请核对组件版本。",
        _=>"微信连接组件未就绪，请核对依赖、授权激活和当前客户端兼容性。"
    };
    public static WechatFrame? Parse(string frame,HubConnection settings,IReadOnlySet<string> peers,bool ready)
    {
        if(frame.Length>16384)throw new InvalidOperationException(Error("PROTOCOL_INVALID"));
        if(!frame.StartsWith("CQH:",StringComparison.Ordinal))return null;
        try
        {
            using var doc=JsonDocument.Parse(frame[4..],new JsonDocumentOptions{MaxDepth=8});var value=doc.RootElement;
            string Field(string name)=>value.GetProperty(name).GetString()??"";
            string kind=Field("kind");
            if(kind=="fatal")throw new InvalidOperationException(Error(value.TryGetProperty("code",out var code) && code.ValueKind==JsonValueKind.String?code.GetString():null));
            if(kind=="ready")
            {
                string account=Field("account");if(account!=settings.Account)throw new InvalidOperationException(Error("ACCOUNT_MISMATCH_OR_UNSUPPORTED"));return new(kind,Account:account);
            }
            if(kind=="reply")
            {
                string echo=Field("echo");if(!Guid.TryParseExact(echo,"N",out _))throw new InvalidOperationException(Error("PROTOCOL_INVALID"));
                bool ok=value.GetProperty("ok").GetBoolean();string receipt=ok?Field("receipt"):"";
                if(ok && !HubStore.Small(receipt,160))throw new InvalidOperationException(Error("PROTOCOL_INVALID"));
                string? code=value.TryGetProperty("code",out var item) && item.ValueKind==JsonValueKind.String?item.GetString():null;
                return new(kind,Echo:echo,Ok:ok,Receipt:receipt,Notice:ok?"":Error(code));
            }
            if(kind!="message" || !ready)return null;
            string peer=Field("peer");if(!peers.Contains(peer))return null;
            var incoming=new HubIncoming("wechat",settings.Account,peer,Field("id"),Field("text"),DateTimeOffset.FromUnixTimeSeconds(value.GetProperty("time").GetInt64()).UtcDateTime,value.GetProperty("self").GetBoolean());
            return HubStore.ValidIncoming(incoming)?new(kind,Incoming:incoming):null;
        }
        catch(Exception error) when(error is JsonException or KeyNotFoundException or ArgumentOutOfRangeException or FormatException)
        {throw new InvalidOperationException(Error("PROTOCOL_INVALID"));}
        catch(InvalidOperationException error) when(!IsKnownError(error.Message))
        {throw new InvalidOperationException(Error("PROTOCOL_INVALID"));}
    }
}
