using System.Text.Json;
using ChatQ.Windows;

internal static class ReceiveDiagnosticChecks
{
    public static void Run(Action<bool,string> check)
    {
        string json="""{"post_type":"message","message_type":"private","sub_type":"friend","self_id":10001,"user_id":20001,"message_id":1,"message":[{"type":"text","data":{"text":"synthetic private text"}}],"time":1793940000}""";
        foreach(string timestamp in new[]{"1.5","9223372036854775808","\"1793940000\"","null"})
        {
            using var doc=JsonDocument.Parse(json.Replace("1793940000",timestamp));
            check(OneBotTransport.Parse(doc.RootElement,"10001",new HashSet<string>{"20001"},out var reason) is null&&reason==OneBotReceiveReason.Invalid,"bad numeric timestamp is rejected per event without an escaping exception");
        }
        using(var doc=JsonDocument.Parse(json))check(OneBotTransport.Parse(doc.RootElement,"10001",new HashSet<string>{"20001"},out var reason) is not null&&reason==OneBotReceiveReason.Accepted,"valid peer event has an explicit accepted reason");
        // No text/type field: scope checks must reject before trying to inspect content.
        using(var doc=JsonDocument.Parse("""{"post_type":"message","self_id":99999}"""))check(OneBotTransport.Parse(doc.RootElement,"10001",new HashSet<string>{"20001"},out var reason) is null&&reason==OneBotReceiveReason.WrongAccount,"wrong account is rejected before reading message fields");
        using(var doc=JsonDocument.Parse("""{"post_type":"message","message_type":"private","self_id":10001,"user_id":30001}"""))check(OneBotTransport.Parse(doc.RootElement,"10001",new HashSet<string>{"20001"},out var reason) is null&&reason==OneBotReceiveReason.OtherPeer,"other peers are rejected before reading message content");
        foreach(string state in new[]{"{}","null","{\"online\":true,\"good\":false}","{\"online\":\"true\",\"good\":true}"})
        {using var doc=JsonDocument.Parse(state);bool failed=false;try{OneBotTransport.CheckStatus(doc.RootElement);}catch(InvalidOperationException){failed=true;}check(failed,"runtime state requires actual online and good booleans");}
        using(var doc=JsonDocument.Parse("{\"online\":true,\"good\":true}")){OneBotTransport.CheckStatus(doc.RootElement);check(true,"verified online runtime accepted");}
    }
}
