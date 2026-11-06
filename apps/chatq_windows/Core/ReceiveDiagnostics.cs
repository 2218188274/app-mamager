namespace ChatQ.Windows;

public enum OneBotReceiveReason { Control, WrongAccount, OtherPeer, Unsupported, Invalid, Accepted }

// Counts and fixed states only. Never keep IDs, tokens, text, raw events or exception messages.
public sealed record OneBotReceiveSnapshot(long Frames,long Heartbeats,long BeforeReady,long WrongAccount,
    long OtherPeer,long Unsupported,long Invalid,long Accepted,bool AccountVerified,bool StatusVerified)
{
    public string Stage => !AccountVerified ? "账号尚未核对" : !StatusVerified ? "QQ运行状态尚未通过" : Accepted>0 ? "已收到指定好友的有效文本事件" : Heartbeats>0 ? "桥接有心跳，等待指定好友事件" : "账号与运行状态通过，尚待事件上报";
}
public interface IReceiveDiagnostics { OneBotReceiveSnapshot ReceiveSnapshot { get; } }
internal sealed class OneBotReceiveCounters
{
    private readonly object gate=new();
    private long frames,heartbeats,beforeReady,wrongAccount,otherPeer,unsupported,invalid,accepted;
    private bool accountVerified,statusVerified;
    public OneBotReceiveSnapshot Snapshot {get {lock(gate)return new(frames,heartbeats,beforeReady,wrongAccount,otherPeer,unsupported,invalid,accepted,accountVerified,statusVerified);}}
    public void Frame(){lock(gate)frames++;}
    public void BeforeReady(){lock(gate)beforeReady++;}
    public void Heartbeat(){lock(gate)heartbeats++;}
    public void Account(){lock(gate)accountVerified=true;}
    public void Status(bool value=true){lock(gate)statusVerified=value;}
    public void Observe(OneBotReceiveReason reason)
    {
        lock(gate)switch(reason){case OneBotReceiveReason.WrongAccount:wrongAccount++;break;case OneBotReceiveReason.OtherPeer:otherPeer++;break;case OneBotReceiveReason.Unsupported:unsupported++;break;case OneBotReceiveReason.Invalid:invalid++;break;case OneBotReceiveReason.Accepted:accepted++;break;}
    }
}
public sealed record HubReceiveSnapshot(long BeforeRunning,long Invalid,long Stale,long Future,long WrongScope,long Self,long Duplicate,long Accepted,OneBotReceiveSnapshot? Transport);
