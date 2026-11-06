using System.IO;
using System.Reflection;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using ChatQ.Windows;

internal static partial class Program
{
    private static void TestHubContextUi(string parent,double scale)
    {
        var vault=new Vault(Path.Combine(parent,"context-ui-"+scale));vault.SaveProfile(new("api","合成接口","https://example.invalid/v1","fixture-model","synthetic-key"));
        var store=new HubStore(vault.DirectoryPath);var rule=new HubRule("one","qq","10001","20001","合成好友","api","natural",Paused:true);
        store.Update(s=>{s.Connection=new("qq","10001","ws://127.0.0.1:3001/","synthetic-channel-token");s.Rules=[rule];s.Contexts[rule.Id]=[new("user","合成上下文")];s.Requests=4;s.Sends=3;});
        var window=new MainWindow(vault,scale);var root=(FrameworkElement)window.Content;Layout(root,640,440);
        var edit=(Window)typeof(MainWindow).GetMethod("BuildHubRuleDialog",BindingFlags.Instance|BindingFlags.NonPublic)!.Invoke(window,[rule])!;var editRoot=(FrameworkElement)edit.Content;Layout(editRoot,360,440);
        Children<Button>(editRoot).Single(x=>Equals(x.Content,"保存好友")).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        Check(store.Read().Rules.Single().Paused,"editing a paused friend preserves manual takeover instead of re-enabling it");
        var build=typeof(MainWindow).GetMethod("BuildHubContextResetDialog",BindingFlags.Instance|BindingFlags.NonPublic)!;
        var dialog=(Window)build.Invoke(window,[rule])!;var body=(FrameworkElement)dialog.Content;Layout(body,360,440);
        var reset=Children<Button>(body).Single(x=>Equals(x.Content,"确认重置"));var confirm=Children<CheckBox>(body).Single();
        Check(!reset.IsEnabled&&store.Read().Contexts.ContainsKey(rule.Id),"opening context reset requires fresh explicit confirmation and performs no write");
        Children<Button>(body).Single(x=>Equals(x.Content,"取消")).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        Check(store.Read().Contexts.ContainsKey(rule.Id),"cancelling context reset preserves selected memory");
        dialog=(Window)build.Invoke(window,[rule])!;body=(FrameworkElement)dialog.Content;Layout(body,360,440);reset=Children<Button>(body).Single(x=>Equals(x.Content,"确认重置"));confirm=Children<CheckBox>(body).Single();confirm.IsChecked=true;Layout(body,360,440);
        var scroll=Children<ScrollViewer>(body).First();scroll.ScrollToEnd();Layout(body,360,440);
        Check(reset.IsEnabled&&reset.TranslatePoint(new Point(0,reset.ActualHeight),body).Y<=440&&confirm.TranslatePoint(new Point(0,confirm.ActualHeight),scroll).Y<=scroll.ActualHeight,"context confirmation remains reachable and explanation scrollable at large text");
        Capture(body,"context-reset-"+scale,360,440);reset.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        Check(!store.Read().Contexts.ContainsKey(rule.Id)&&store.Read().Requests==4&&store.Read().Sends==3&&store.Read().Rules.Single().Paused,"confirmed reset preserves attempts and paused rule");
        Children<ListBox>(root).Single(x=>AutomationProperties.GetName(x)=="功能导航").SelectedItem="键盘设置";Layout(root,640,440);
        Children<Expander>(root).Single(x=>Equals(x.Header,"版本与安装说明")).IsExpanded=true;Layout(root,640,440);
        string version=typeof(MainWindow).Assembly.GetName().Version!.ToString(3);
        Check(Children<TextBlock>(root).Any(x=>x.Text.StartsWith("Windows "+version+" 预览版。")),"keyboard version matches running binary rather than a hardcoded old release");
        Check(!window.IsVisible&&!dialog.IsVisible,"context and rule UI tests open no visible window or real account");window.Close();
    }
}
