using System.IO;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using ChatQ.Windows;

internal static partial class Program
{
    private static void TestReceiveDiagnosticUi(string parent,double scale)
    {
        var vault=new Vault(Path.Combine(parent,"receive-diagnostics-"+scale));var window=new MainWindow(vault,scale);var root=(FrameworkElement)window.Content;Layout(root,640,440);
        Children<ListBox>(root).Single(x=>AutomationProperties.GetName(x)=="功能导航").SelectedItem="消息助手";Layout(root,640,440);
        Children<ComboBox>(root).Single(x=>AutomationProperties.GetName(x)=="消息助手版块").SelectedIndex=2;Layout(root,640,440);
        var expander=Children<Expander>(root).Single(x=>x.Header.ToString()=="QQ接收诊断 · 不展示消息原文");Check(!expander.IsExpanded,"receive diagnostics stay secondary and collapsed by default");expander.IsExpanded=true;Layout(root,640,440);
        var refresh=Children<Button>(root).Single(x=>Equals(x.Content,"刷新接收计数"));refresh.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));Layout(root,640,440);
        Check(Children<TextBlock>(root).Any(x=>x.Text=="尚无QQ连接诊断"),"empty diagnostic state does not claim that a bridge is online");
        Check(!window.IsVisible&&vault.Read().Profiles.Count==0&&!File.Exists(Path.Combine(vault.DirectoryPath,"messages.vault")),"view/refresh diagnostics never opens a window, connects or writes a message vault");
        Check(refresh.MinHeight>=40,"diagnostic refresh retains standard mouse/touch target");Capture(root,"receive-diagnostics-"+scale,640,660);window.Close();
    }
}
