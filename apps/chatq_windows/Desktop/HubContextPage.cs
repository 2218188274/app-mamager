using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;

namespace ChatQ.Windows;

public sealed partial class MainWindow
{
    private Window BuildHubContextResetDialog(HubRule rule)
    {
        var dialog=Dialog("重置AI上下文",560,560);var dock=new DockPanel{Margin=new(20)};var form=Stack();var bottom=Stack();
        form.Children.Add(Text("重置AI上下文",18,true));form.Children.Add(Text(rule.Name,15,true));
        form.Children.Add(Text("仅清空此好友的AI上下文。整个消息助手会暂停，主动重新连接后从新消息开始。",14));
        form.Children.Add(new Expander{Header="保留内容与暂停范围",Content=Text("保留好友配置、处理记录、今日额度、其他好友的上下文和原聊天软件记录。打开软件自动开始也会关闭，旧任务不再继续。已提交的消息无法撤回，结果需在原软件核对。",13)});
        var confirm=new CheckBox{Content=new TextBlock{Text="我确认暂停消息助手并重置此好友",TextWrapping=TextWrapping.Wrap},MinHeight=42,Margin=new(0,8,0,8)};
        AutomationProperties.SetName(confirm,"确认重置此好友AI上下文");form.Children.Add(confirm);
        var feedback=Text("核对范围后勾选确认，再点重置。",12);bottom.Children.Add(feedback);
        var actions=new WrapPanel();var reset=Button("确认重置",()=>
        {
            try{hub.ResetContext(rule.Id);dialog.Close();Navigate("消息助手");SetStatus("已重置此好友AI上下文。消息助手和自动开始已暂停，检查后请主动重新连接。");}
            catch(Exception error){feedback.Text=SafeError(error);feedback.Foreground=System.Windows.Media.Brushes.Firebrick;}
        },true);reset.IsEnabled=false;confirm.Checked+=(_,_)=>reset.IsEnabled=true;confirm.Unchecked+=(_,_)=>reset.IsEnabled=false;
        actions.Children.Add(reset);actions.Children.Add(Button("取消",dialog.Close));bottom.Children.Add(actions);DockPanel.SetDock(bottom,Dock.Bottom);dock.Children.Add(bottom);dock.Children.Add(Scroll(form));dialog.Content=dock;return dialog;
    }
}
