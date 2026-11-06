using System.Text.Json;
using ChatQ.Windows;

internal static class WechatProtocolChecks
{
    public static void Run(Action<bool,string> check)
    {
        var settings=new HubConnection("wechat","合成账号");var peers=new HashSet<string>{"合成好友"};string echo=Guid.NewGuid().ToString("N");
        string Frame(object value)=>"CQH:"+JsonSerializer.Serialize(value);
        void Reject(string frame,string message){bool rejected=false;try{WechatProtocol.Parse(frame,settings,peers,true);}catch(InvalidOperationException error){rejected=WechatProtocol.IsKnownError(error.Message) && !error.Message.Contains("synthetic-private-error");}check(rejected,message);}
        check(WechatProtocol.Parse(Frame(new{kind="ready",account="合成账号"}),settings,peers,false)?.Account=="合成账号","bridge ready checks observed account");
        Reject(Frame(new{kind="ready",account="wrong"}),"wrong observed account rejected before any incoming text");
        check(WechatProtocol.Parse("library diagnostic ignored",settings,peers,false) is null,"third-party stdout diagnostic never becomes user error or chat");
        var message=new{kind="message",peer="合成好友",id="m1",text="合成私聊",time=1700000000,self=false};
        check(WechatProtocol.Parse(Frame(message),settings,peers,false) is null,"messages before ready discarded");
        check(WechatProtocol.Parse(Frame(message),settings,peers,true)?.Incoming?.Peer=="合成好友","allowed peer parsed by actual transport frame decoder");
        check(WechatProtocol.Parse(Frame(new{kind="message",peer="not-allowed"}),settings,peers,true) is null,"outside peer rejected without parsing body");
        check(WechatProtocol.Parse(Frame(new{kind="reply",echo,ok=true,receipt="submission"}),settings,peers,true)?.Receipt=="submission","nonempty submission acknowledgement accepted");
        Reject(Frame(new{kind="reply",echo,ok=true,receipt=""}),"empty successful receipt cannot mark a message sent");
        Reject(Frame(new{kind="reply",echo="bad",ok=true,receipt="submission"}),"unbound reply nonce rejected");
        check(WechatProtocol.Parse(Frame(new{kind="reply",echo,ok=false,code="DRAFT_OR_UNSUPPORTED_CLIENT"}),settings,peers,true)?.Notice.Contains("草稿")==true,"draft failure preserves actionable cause without raw library exception");
        foreach(string code in new[]{"DEPENDENCY_MISSING","INITIALIZATION_FAILED","ACCOUNT_MISMATCH_OR_UNSUPPORTED","CHAT_BINDING_CHANGED","LOGGING_CONTROL_UNAVAILABLE","INPUT_INSPECTION_UNAVAILABLE"})Reject(Frame(new{kind="fatal",code,message="synthetic-private-error"}),"startup cause mapped to fixed text: "+code);
        Reject(Frame(new{kind="fatal",code="synthetic-private-error"}),"unknown fatal details not displayed");
        Reject("CQH:{bad-json","malformed frame gives fixed protocol error");
        Reject(Frame(new{kind=5,text="synthetic-private-error"}),"wrong JSON field type sanitized");
        Reject(Frame(new{kind="message",peer="合成好友",id="m",text="x",time=long.MaxValue,self=false}),"out-of-range bridge timestamp sanitized");
        Reject("CQH:"+new string('x',16385),"frame size bounded");
        check(!WechatProtocol.IsKnownError("synthetic-private-error"),"disconnect only accepts fixed known notices, never arbitrary adapter diagnostics");
    }
}
