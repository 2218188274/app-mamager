using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;

namespace ChatQ.Windows;

public sealed partial class MainWindow
{
    private UIElement ReceiveDiagnosticsCard()
    {
        var body=Stack();var state=Text("",14,true);var wire=Text("",13);var tasks=Text("",13);var filters=Text("",12);
        AutomationProperties.SetName(state,"接收诊断状态");
        void Refresh()
        {
            var snapshot=hub.ReceiveSnapshot;var transport=snapshot.Transport;
            state.Text=transport is null?"尚无QQ连接诊断":(hub.Active?"本次连接 · ":"最近一次连接 · ")+transport.Stage;
            wire.Text=transport is null?"开始连接后，显示账号、运行状态、心跳和事件计数。":$"桥接帧 {transport.Frames} · 心跳 {transport.Heartbeats} · 有效好友文本 {transport.Accepted}\n协议异常 {transport.Invalid} · 不支持的类型 {transport.Unsupported} · 就绪前事件 {transport.BeforeReady}";
            tasks.Text=$"进入任务 {snapshot.Accepted} · 重复 {snapshot.Duplicate} · 自身消息 {snapshot.Self}\n过期 {snapshot.Stale} · 时间超前 {snapshot.Future} · 范围不符 {snapshot.WrongScope}\n任务就绪前 {snapshot.BeforeRunning} · 任务格式异常 {snapshot.Invalid}";
            filters.Text=transport is null?"这里只显示计数，不展示原文、账号、好友号码、令牌或密钥。":$"账号不符 {transport.WrongAccount} · 非指定好友 {transport.OtherPeer}\n当前连接重新开始时清零；暂停后保留本次计数。时间过滤异常时请核对电脑和桥接时间，不会自动放宽限制。";
        }
        body.Children.Add(state);body.Children.Add(wire);body.Children.Add(tasks);body.Children.Add(filters);
        body.Children.Add(Button("刷新接收计数",Refresh));Refresh();
        return new Expander{Header="QQ接收诊断 · 不展示消息原文",Content=Card(body),IsExpanded=false};
    }
}
