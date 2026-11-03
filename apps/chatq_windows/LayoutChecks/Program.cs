// In-process WPF control tests. Never calls Show/Run, never opens a visible window or injects user input.
using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Markup;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Reflection;
using System.Windows.Threading;
using ChatQ.Windows;

internal static class Program
{
    private static int checks;
    private static void Check(bool value, string message) { if (!value) throw new Exception(message); checks++; }
    private static IEnumerable<T> Children<T>(DependencyObject root) where T : DependencyObject
    {
        if (root is T value) yield return value;
        for (int i = 0; i < VisualTreeHelper.GetChildrenCount(root); i++) foreach (var item in Children<T>(VisualTreeHelper.GetChild(root, i))) yield return item;
    }
    private static void Layout(FrameworkElement root, double width, double height)
    { root.Measure(new Size(width, height)); root.Arrange(new Rect(0, 0, width, height)); root.UpdateLayout(); }
    private static void Capture(FrameworkElement root, string name, double width, double height)
    {
        string? output = Environment.GetEnvironmentVariable("CHATQ_LAYOUT_SCREENSHOTS"); if (output is null) return;
        Layout(root, width, height); var image = new RenderTargetBitmap((int)width, (int)height, 96, 96, PixelFormats.Pbgra32); image.Render(root);
        Directory.CreateDirectory(output); var png = new PngBitmapEncoder(); png.Frames.Add(BitmapFrame.Create(image)); using var file = File.Create(Path.Combine(output, name + ".png")); png.Save(file);
    }
    private static void Invoke(MainWindow window, string name) => typeof(MainWindow).GetMethod(name, BindingFlags.NonPublic | BindingFlags.Instance)!.Invoke(window, null);
    private static void Wait(Func<bool> completed)
    {
        var frame = new DispatcherFrame(); var end = DateTime.UtcNow.AddSeconds(15); var timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(25) };
        timer.Tick += (_, _) => { if (completed() || DateTime.UtcNow > end) frame.Continue = false; }; timer.Start(); Dispatcher.PushFrame(frame); timer.Stop(); Check(completed(), "asynchronous control operation completed");
    }
    [STAThread]
    private static int Main()
    {
        string directory = Path.Combine(Path.GetTempPath(), "ChatQLayoutChecks-" + Guid.NewGuid().ToString("N"));
        try
        {
            var app = new Application { Resources = (ResourceDictionary)XamlReader.Parse(DesktopApp.Theme) };
            SynchronizationContext.SetSynchronizationContext(new DispatcherSynchronizationContext(Dispatcher.CurrentDispatcher));
            var vault = new Vault(directory); string? fixture = Environment.GetEnvironmentVariable("CHATQ_TEST_URL");
            if (fixture is not null) vault.SaveProfile(new("qa", "合成接口", fixture, "fixture-model", "synthetic-test-key"));
            foreach (double scale in new[] { 1.0, 2.0 })
            {
                var window = new MainWindow(vault, scale); var root = (FrameworkElement)window.Content;
                Layout(root, 1060, 720);
                var navigation = Children<ListBox>(root).Single(x => AutomationProperties.GetName(x) == "功能导航");
                foreach (string section in new[] { "回复助手", "我的 API", "人设中心", "AI 对话", "键盘设置" })
                {
                    navigation.SelectedItem = section; Layout(root, 640, 440);
                    Capture(root, section.Replace(" ", "") + "-" + scale, scale == 1 ? 1200 : 640, scale == 1 ? 780 : 660); Layout(root, 640, 440);
                    Check(!window.IsVisible, "fixture never opens a visible window");
                    Check(Children<TextBlock>(root).Any(t => t.Text == section || (section == "键盘设置" && t.Text == "聊商输入法")), "section heading " + section);
                    Check(Children<Button>(root).All(b => b.MinHeight >= 40), "button touch/mouse target " + section);
                    Check(!Children<TextBox>(root).Any(t => t.Text.Contains("synthetic-test-key")), "key not exposed in editable text " + section);
                    Check(Children<ScrollViewer>(root).Any(), "scrollable section " + section);
                    foreach (var text in Children<TextBox>(root).Where(t => t.ActualWidth > 0)) Check(text.ActualWidth <= 640, "input fits narrow layout");
                    if (section is "回复助手" or "AI 对话")
                    {
                        string label = section == "回复助手" ? "生成" : "发送问题";
                        var button = Children<Button>(root).Single(b => (string)b.Content == label);
                        var bottom = button.TranslatePoint(new Point(0, button.ActualHeight), root);
                        Check(button.ActualHeight > 0 && bottom.Y <= 440 && bottom.Y >= 0, "primary action stays inside short viewport");
                    }
                }
                navigation.SelectedItem = "回复助手"; Layout(root, 1060, 720);
                var input = Children<TextBox>(root).Single(t => AutomationProperties.GetName(t) == "生成内容"); input.Text = "合成草稿，不包含真实聊天";
                navigation.SelectedItem = "我的 API"; Layout(root, 1060, 720); navigation.SelectedItem = "回复助手"; Layout(root, 1060, 720);
                Check(Children<TextBox>(root).Single(t => AutomationProperties.GetName(t) == "生成内容").Text == "合成草稿，不包含真实聊天", "draft survives section changes");
                Children<Button>(root).Single(b => (string)b.Content == "润色我的话").RaiseEvent(new RoutedEventArgs(Button.ClickEvent)); Layout(root,1060,720);
                Children<TextBox>(root).Single(t => AutomationProperties.GetName(t) == "生成内容").Text = "润色独立草稿";
                Children<Button>(root).Single(b => (string)b.Content == "帮回复").RaiseEvent(new RoutedEventArgs(Button.ClickEvent)); Layout(root,1060,720);
                Check(Children<TextBox>(root).Single(t => AutomationProperties.GetName(t) == "生成内容").Text == "合成草稿，不包含真实聊天", "reply and polish drafts stay separate");
                Children<Button>(root).Single(b => (string)b.Content == "润色我的话").RaiseEvent(new RoutedEventArgs(Button.ClickEvent)); Layout(root,1060,720);
                Children<TextBox>(root).Single(t => AutomationProperties.GetName(t) == "生成内容").Text = "唤出前的润色草稿";
                window.AcceptLaunchRequest(LaunchRequest.Reply); Layout(root,1060,720);
                Check(Children<TextBox>(root).Single(t => AutomationProperties.GetName(t) == "生成内容").Text == "合成草稿，不包含真实聊天", "IME launch returns from polish to reply without mixing drafts");
                Check(vault.Read().PolishDraft == "唤出前的润色草稿", "IME launch preserves previous polish draft");
                navigation.SelectedItem = "人设中心"; Layout(root,1060,720); window.AcceptLaunchRequest(LaunchRequest.Focus); Layout(root,1060,720);
                Check((string)navigation.SelectedItem == "人设中心", "normal foreground request preserves current page");
                window.AcceptLaunchRequest(LaunchRequest.Reply); Layout(root,1060,720);
                Check((string)navigation.SelectedItem == "回复助手", "IME launch also updates navigation selection");
                Check(!window.IsVisible, "launch route checks open no visible window");
                Children<Button>(root).Single(b => (string)b.Content == "找话题").RaiseEvent(new RoutedEventArgs(Button.ClickEvent)); Layout(root,1060,720);
                Children<TextBox>(root).Single(t => AutomationProperties.GetName(t) == "生成内容").Text = "独立的话题背景";
                Children<Button>(root).Single(b => (string)b.Content == "帮回复").RaiseEvent(new RoutedEventArgs(Button.ClickEvent)); Layout(root,1060,720);
                Check(Children<TextBox>(root).Single(t => AutomationProperties.GetName(t) == "生成内容").Text == "合成草稿，不包含真实聊天", "topic draft cannot overwrite reply draft");
                Children<Button>(root).Single(b => (string)b.Content == "找话题").RaiseEvent(new RoutedEventArgs(Button.ClickEvent)); Layout(root,1060,720);
                Check(Children<TextBox>(root).Single(t => AutomationProperties.GetName(t) == "生成内容").Text == "独立的话题背景", "topic draft restored separately");
                Children<Button>(root).Single(b => (string)b.Content == "帮回复").RaiseEvent(new RoutedEventArgs(Button.ClickEvent)); Layout(root,1060,720);
                navigation.SelectedItem = "我的 API"; Layout(root,1060,720);
                Children<Button>(root).Single(b => (string)b.Content == "新增配置").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                var manager = Children<Expander>(root).Single(x => (string)x.Header == "管理配置"); manager.IsExpanded = true; Layout(root,1060,720);
                Check(!Children<Button>(root).Single(b => (string)b.Content == "删除当前配置").IsEnabled, "new API form cannot delete previously active profile");
                Check(vault.Read().Profiles.Count == (fixture is null ? 0 : 1), "new unsaved form preserves existing profile");
                navigation.SelectedItem = "回复助手"; Layout(root,1060,720);
                if (fixture is not null && scale == 1)
                {
                    Children<Button>(root).Single(b => (string)b.Content == "生成").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                    Wait(() => Children<TextBlock>(root).Any(t => t.Text == "为你生成 3 条回复")); Layout(root, 1060, 720);
                    Check(Children<TextBox>(root).Count(t => AutomationProperties.GetName(t) == "回复内容") == 3, "reply cards rendered after synthetic HTTP");
                    Capture(root,"reply-generated",1200,780);
                    var editorCard=Children<Border>(root).Single(b=>Equals(b.Tag,"reply-editor"));
                    Check(editorCard.ActualHeight<=editorCard.DesiredSize.Height+1,"reply editor does not stretch to the entire height of generated cards");
                    Children<TextBox>(root).Single(t => AutomationProperties.GetName(t) == "生成内容").Text = "内容改变";
                    Check(!Children<TextBox>(root).Any(t => AutomationProperties.GetName(t) == "回复内容"), "editing invalidates old reply cards");
                    navigation.SelectedItem = "AI 对话"; Layout(root, 1060, 720); Children<TextBox>(root).Single(t => AutomationProperties.GetName(t) == "聊天问题").Text = "合成问题";
                    Children<Button>(root).Single(b => (string)b.Content == "发送问题").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                    Wait(() => vault.Read().Conversations.Count == 1); Layout(root, 1060, 720); Check(vault.Read().Conversations[0].Messages.Count == 2, "multi-turn first exchange saved");
                    Children<TextBox>(root).Single(t => AutomationProperties.GetName(t) == "聊天问题").Text = "继续合成问题";
                    Children<Button>(root).Single(b => (string)b.Content == "发送问题").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                    Wait(() => vault.Read().Conversations[0].Messages.Count == 4); Layout(root, 1060, 720); Check(vault.Read().Conversations[0].Messages[^1].Content == "合成回答", "multi-turn context exchange saved");
                    var chatInput = Children<TextBox>(root).Single(t => AutomationProperties.GetName(t) == "聊天问题"); chatInput.Text = "下一条还没发送的问题";
                    var regenerate = (Task)typeof(MainWindow).GetMethod("SendChat", BindingFlags.NonPublic | BindingFlags.Instance)!.Invoke(window, [true])!; Wait(() => regenerate.IsCompleted); Layout(root,1060,720);
                    Check(chatInput.Text == "下一条还没发送的问题" && vault.Read().ChatDrafts.Values.Contains(chatInput.Text), "regeneration preserves unsent composer and encrypted draft");
                    Invoke(window,"BeginEditQuestion"); Check(chatInput.Text == "继续合成问题", "edit previous question loads the last user turn"); chatInput.Text = "修改后的合成问题";
                    Children<Button>(root).Single(b => (string)b.Content == "发送问题").RaiseEvent(new RoutedEventArgs(Button.ClickEvent)); Wait(() => vault.Read().Conversations[0].Messages[^2].Content == "修改后的合成问题");
                    Check(vault.Read().Conversations[0].Messages.Count == 4, "editing replaces only the last exchange");
                    Check(chatInput.Text == "下一条还没发送的问题", "editing preserves pre-existing unsent draft");
                    Capture(root, "chat-generated", 1200,780);
                    Children<TextBox>(root).Single(t => AutomationProperties.GetName(t) == "聊天问题").Text = "fixture-slow";
                    Children<Button>(root).Single(b => (string)b.Content == "发送问题").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                    Check(!Children<Button>(root).Single(b => (string)b.Content == "发送问题").IsEnabled && Children<Button>(root).Single(b => (string)b.Content == "停止").IsEnabled, "pending request disables send and enables cancellation");
                    Children<TextBox>(root).Single(t => AutomationProperties.GetName(t) == "聊天问题").Text = "改过的新问题";
                    var settle = DateTime.UtcNow.AddMilliseconds(1200); Wait(() => DateTime.UtcNow >= settle);
                    Check(vault.Read().Conversations[0].Messages.Count == 4, "edited/cancelled request cannot overwrite conversation");
                    Layout(root,1060,720); Check(!Children<TextBox>(root).Any(t => AutomationProperties.GetName(t) == "正在生成的回答"), "cancelled preview removed without leaving a partial answer");
                    Check(Children<Button>(root).Single(b => (string)b.Content == "发送问题").IsEnabled && !Children<Button>(root).Single(b => (string)b.Content == "停止").IsEnabled, "cancelled request restores idle controls");
                    navigation.SelectedItem = "人设中心"; Layout(root, 1060, 720); navigation.SelectedItem = "AI 对话"; Layout(root, 1060, 720);
                    Check(Children<TextBox>(root).Single(t => AutomationProperties.GetName(t) == "聊天问题").Text == "改过的新问题", "chat draft survives navigation");
                    navigation.SelectedItem = "人设中心"; Layout(root,1060,720);
                    var dialog = (Window)typeof(MainWindow).GetMethod("BuildPersonaDialog", BindingFlags.NonPublic | BindingFlags.Instance)!.Invoke(window, [null])!;
                    var dialogRoot=(FrameworkElement)dialog.Content; Layout(dialogRoot,540,620);
                    Children<Button>(dialogRoot).Single(b => (string)b.Content == "保存人设").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                    Check(Children<TextBlock>(dialogRoot).Any(t=>t.Text.Contains("请填写名称")), "persona validation error is visible in its own dialog");
                    Children<TextBox>(dialogRoot).Single(t=>AutomationProperties.GetName(t)=="人设需求").Text="希望简短真诚，适合与同事沟通";
                    Children<Button>(dialogRoot).Single(b=>(string)b.Content=="AI 生成人设草稿").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                    Wait(()=>Children<TextBox>(dialogRoot).Single(t=>AutomationProperties.GetName(t)=="人设名称").Text=="合成测试人设");
                    Check(!dialog.IsVisible, "AI persona fixture opens no visible dialog"); Capture(dialogRoot,"persona-dialog",540,620); dialog.Close();
                }
                window.Close();
            }
            Console.WriteLine(JsonSerializer.Serialize(new { checks, visibleWindowsOpened = 0, inputInjected = false, userChatRead = false, paidAiCalls = 0 })); app.Shutdown(); return 0;
        }
        catch (Exception e) { Console.Error.WriteLine(e); return 1; }
        finally
        {
            string target = Path.GetFullPath(directory), parent = Path.GetFullPath(Path.GetTempPath());
            if (!target.StartsWith(parent, StringComparison.OrdinalIgnoreCase) || !Path.GetFileName(target).StartsWith("ChatQLayoutChecks-")) throw new InvalidOperationException("Unexpected cleanup path");
            if (Directory.Exists(target)) Directory.Delete(target, true);
        }
    }
}
