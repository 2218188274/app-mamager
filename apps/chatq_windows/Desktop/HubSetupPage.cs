using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace ChatQ.Windows;

public sealed partial class MainWindow
{
    private void ShowHubTab(int tab){hubTab=tab;if((string?)navigation.SelectedItem!="消息助手")navigation.SelectedItem="消息助手";else Navigate("消息助手");}
    private UIElement SetupCard(HubSetupReport report,IEnumerable<SetupCheck>? additional=null)
    {
        var body=Stack();body.Children.Add(Text(report.CanAttempt?"配置完整，可尝试连接":"按这三步准备连接",17,true));
        foreach(var check in report.Checks.Concat(additional??[]))
        {
            var title=Text((check.Status=="ready"?"✓ ":check.Status=="pending"?"○ ":"待完成 · ")+check.Title,13,true);
            title.Foreground=check.Status=="ready"?new SolidColorBrush(Color.FromRgb(34,112,80)):check.Status=="pending"?Muted:Brushes.Firebrick;
            body.Children.Add(title);var detail=Text(check.Detail,12);detail.Foreground=Muted;body.Children.Add(detail);
        }
        body.Children.Add(Text("检查只确认配置和组件信息，不调用模型、不登录账号、不读取或发送聊天消息。",12));
        return Card(body);
    }
    private UIElement FirstHubSetup(HubState policy,WrapPanel actions)
    {
        var report=HubReadiness.Inspect(vault.Read(),policy);bool api=report.Checks.Single(x=>x.Id=="api").Status=="ready",connection=report.Checks.Single(x=>x.Id=="connection").Status=="ready";
        actions.Children.Add(Button("配置 API",()=>navigation.SelectedItem="我的 API",!api));actions.Children.Add(Button("配置连接",()=>ShowHubTab(2),api&&!connection));actions.Children.Add(Button("指定好友",()=>ShowHubTab(1),api&&connection));return SetupCard(report);
    }
    private void CheckHubBeforeStart(HubSetupReport report)
    {
        if(report.CanAttempt)return;
        string step=report.Checks.First(c=>c.Status=="missing").Id;if(step=="api")navigation.SelectedItem="我的 API";else ShowHubTab(step=="friends"?1:2);
        throw new InvalidOperationException("连接尚未准备好："+string.Join("；",report.Checks.Where(c=>c.Status=="missing").Select(c=>c.Detail)));
    }
}
