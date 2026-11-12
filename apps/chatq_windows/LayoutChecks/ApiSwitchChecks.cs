using System.IO;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using ChatQ.Windows;

internal static partial class Program
{
    private static void ApiSwitchChecks(string directory)
    {
        foreach(string field in new[]{"模型名称","API 密钥","API 基础地址","配置名称","语音模型","stream"})
        {
            var vault=new Vault(Path.Combine(directory,"api-switch-"+field));
            vault.SaveProfile(new("one","合成配置一","https://one.example/v1","model-one","synthetic-one"));
            vault.SaveProfile(new("two","合成配置二","https://two.example/v1","model-two","synthetic-two"));
            var window=new MainWindow(vault,2);var root=(FrameworkElement)window.Content;
            Layout(root,640,660);Children<ListBox>(root).Single(n=>AutomationProperties.GetName(n)=="功能导航").SelectedItem="我的 API";Layout(root,640,660);
            if(field=="语音模型"){Children<Expander>(root).Single(n=>Equals(n.Header,"语音转写设置")).IsExpanded=true;Layout(root,640,660);}
            if(field=="stream")Children<CheckBox>(root).Single().IsChecked=false;
            else if(field=="API 密钥")Children<PasswordBox>(root).Single().Password="synthetic-new-key";
            else Children<TextBox>(root).Single(n=>AutomationProperties.GetName(n)==field).Text="unsaved-value";
            var profiles=Children<ComboBox>(root).Single(n=>AutomationProperties.GetName(n)=="API 配置列表");
            profiles.SelectedValue="one";Layout(root,640,660);
            Check(vault.Read().ProfileId=="two","dirty "+field+" cannot silently activate another API profile");
            Check(Equals(profiles.SelectedValue,"two"),"profile selector restores current choice while discard is pending");
            var discard=Children<Button>(root).Single(b=>Equals(b.Content,"放弃修改并切换配置"));
            Check(discard.Visibility==Visibility.Visible,"discard action is available for explicit decision");
            discard.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));Layout(root,640,660);
            Check(vault.Read().ProfileId=="one"&&vault.Read().Profiles.Single(p=>p.Id=="two").Model=="model-two","explicit discard switches without saving an edited value");
            profiles=Children<ComboBox>(root).Single(n=>AutomationProperties.GetName(n)=="API 配置列表");profiles.SelectedValue="two";Layout(root,640,660);
            Check(vault.Read().ProfileId=="two","unchanged API form switches directly");
            Check(!window.IsVisible,"configuration regression never opens a visible window");window.Close();
        }
    }
}
