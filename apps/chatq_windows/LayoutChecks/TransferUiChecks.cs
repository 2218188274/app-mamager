using System.IO;
using System.Reflection;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Media;
using ChatQ.Windows;

internal static partial class Program
{
    private static void TestSharedTransferUi(string parent,double scale)
    {
        var vault=new Vault(Path.Combine(parent,"shared-ui-"+scale));var window=new MainWindow(vault,scale);var root=(FrameworkElement)window.Content;Layout(root,640,440);Children<ListBox>(root).Single(x=>AutomationProperties.GetName(x)=="功能导航").SelectedItem="数据与更新";Layout(root,640,440);
        var source=new UserState{Conversations=[new(){Name="合成迁移会话",Messages=[new("user","合成问题"),new("assistant","合成回答")]}],ReplyHistory=[new("favorite","合成收藏","","reply","自然",DateTime.UtcNow,true)]};byte[] bytes=SharedTransfer.Encrypt(SharedTransfer.Export(source),"synthetic-password");
        var build=typeof(MainWindow).GetMethod("BuildTransferDialog",BindingFlags.Instance|BindingFlags.NonPublic)!;
        var dialog=(Window)build.Invoke(window,[true,bytes])!;var body=(FrameworkElement)dialog.Content;Layout(body,360,440);
        var password=Children<PasswordBox>(body).Single(x=>AutomationProperties.GetName(x)=="跨端迁移密码");var consent=Children<CheckBox>(body).Single(x=>AutomationProperties.GetName(x)=="跨端迁移确认");var apply=Children<Button>(body).Single(x=>(string)x.Content=="确认合并");var decrypt=Children<Button>(body).Single(x=>(string)x.Content=="解密并预览");
        Check(!apply.IsEnabled&&vault.Read().Conversations.Count==0,"shared restore cannot apply before password preview and consent");password.Password="wrong-password";decrypt.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));Wait(()=>typeof(MainWindow).GetField("operation",BindingFlags.Instance|BindingFlags.NonPublic)!.GetValue(window)is null);Check(Children<TextBlock>(body).Any(x=>x.Text.Contains("密码不正确"))&&vault.Read().Conversations.Count==0,"wrong shared password displays safe notice without writes");
        password.Password="synthetic-password";decrypt.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));Wait(()=>typeof(MainWindow).GetField("operation",BindingFlags.Instance|BindingFlags.NonPublic)!.GetValue(window)is null);Layout(body,360,440);
        var preview=Children<TextBlock>(body).Single(x=>x.Text.Contains("尚未写入"));Check(preview.Text.Contains("新增2")&&preview.Foreground!=Brushes.Firebrick&&!apply.IsEnabled,"successful shared preview clears old error color and requires new consent");consent.IsChecked=true;Layout(body,360,440);Check(apply.IsEnabled&&apply.TranslatePoint(new Point(0,apply.ActualHeight),body).Y<=440,"shared primary restore remains reachable in small window with large text");
        Capture(body,"shared-transfer-preview-"+scale,360,440);
        vault.Update(s=>s.TopicDraft="本机在预览后编辑");apply.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));Wait(()=>typeof(MainWindow).GetField("operation",BindingFlags.Instance|BindingFlags.NonPublic)!.GetValue(window)is null);Check(!apply.IsEnabled&&consent.IsChecked!=true&&vault.Read().Conversations.Count==0,"stale shared preview fails closed and is invalidated before another apply");
        decrypt.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));Wait(()=>typeof(MainWindow).GetField("operation",BindingFlags.Instance|BindingFlags.NonPublic)!.GetValue(window)is null);consent.IsChecked=true;apply.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));Wait(()=>typeof(MainWindow).GetField("operation",BindingFlags.Instance|BindingFlags.NonPublic)!.GetValue(window)is null);Check(vault.Read().Conversations.Count==1&&vault.Read().ReplyHistory.Count==1&&!dialog.IsVisible,"confirmed shared restore imports exact text and opens no visible window");
        var restored=new Vault(vault.DirectoryPath).UndoTransfer();Check(restored.Conversations.Count==0&&restored.ReplyHistory.Count==0&&restored.TopicDraft=="本机在预览后编辑","persistent shared undo preserves edits made before the reviewed import");
        var export=(Window)build.Invoke(window,[false,null])!;var exportRoot=(FrameworkElement)export.Content;Layout(exportRoot,360,440);var keys=Children<PasswordBox>(exportRoot).ToArray();keys[0].Password="synthetic-password";keys[1].Password="different-password";var save=Children<Button>(exportRoot).Single(x=>(string)x.Content=="导出跨端文件");var approve=Children<CheckBox>(exportRoot).Single();approve.IsChecked=true;Check(!save.IsEnabled,"shared export requires matching passwords");keys[1].Password="synthetic-password";approve.IsChecked=true;Layout(exportRoot,360,440);Check(save.IsEnabled&&save.TranslatePoint(new Point(0,save.ActualHeight),exportRoot).Y<=440,"shared export keeps one pinned action and reviewed scope at large text");Capture(exportRoot,"shared-transfer-export-"+scale,360,440);export.Close();window.Close();
    }
}
