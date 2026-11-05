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
            var app = new Application { Resources = (ResourceDictionary)XamlReader.Parse(DesktopApp.Theme), ShutdownMode=ShutdownMode.OnExplicitShutdown };
            SynchronizationContext.SetSynchronizationContext(new DispatcherSynchronizationContext(Dispatcher.CurrentDispatcher));
            var vault = new Vault(directory); string? fixture = Environment.GetEnvironmentVariable("CHATQ_TEST_URL");
            if (fixture is not null) vault.SaveProfile(new("qa", "合成接口", fixture, "fixture-model", "synthetic-test-key"));
            foreach (double scale in new[] { 1.0, 2.0 })
            {
                var window = new MainWindow(vault, scale); var root = (FrameworkElement)window.Content;
                Layout(root, 1060, 720);
                var navigation = Children<ListBox>(root).Single(x => AutomationProperties.GetName(x) == "功能导航");
                foreach (string section in new[] { "回复助手", "我的 API", "人设中心", "AI 对话", "微信导出", "聊天分析", "消息助手", "记录收藏","表情包","数据与更新","键盘设置" })
                {
                    navigation.SelectedItem = section; Layout(root, 640, 440);
                    Capture(root, section.Replace(" ", "") + "-" + scale, scale == 1 ? 1200 : 640, scale == 1 ? 780 : 660); Layout(root, 640, 440);
                    Check(!window.IsVisible, "fixture never opens a visible window");
                    Check(Children<TextBlock>(root).Any(t => t.Text == section || (section == "键盘设置" && t.Text == "聊商输入法")), "section heading " + section);
                    Check(Children<Button>(root).All(b => b.MinHeight >= 40), "button touch/mouse target " + section);
                    Check(!Children<TextBox>(root).Any(t => t.Text.Contains("synthetic-test-key")), "key not exposed in editable text " + section);
                    Check(Children<ScrollViewer>(root).Any(), "scrollable section " + section);
                    foreach (var text in Children<TextBox>(root).Where(t => t.ActualWidth > 0)) Check(text.ActualWidth <= 640, "input fits narrow layout");
                    if(section=="消息助手")
                    {
                        var tab=Children<ComboBox>(root).Single(c=>AutomationProperties.GetName(c)=="消息助手版块");
                        for(int n=1;n<=2;n++){tab.SelectedIndex=n;Layout(root,640,660);Capture(root,"message-setup-"+scale+"-"+n,640,660);Check(Children<ScrollViewer>(root).Any(),"message configuration remains scrollable");Check(Children<Button>(root).Where(b=>b.ActualWidth>0).All(b=>b.MinHeight>=40),"message configuration targets respect UI size");}
                        tab.SelectedIndex=0;Layout(root,640,440);var connect=Children<Button>(root).Single(b=>(string)b.Content=="连接并开始");Check(connect.TranslatePoint(new Point(0,connect.ActualHeight),root).Y<=440,"message connect/pause action stays visible in short large-text layout");
                        Check(!Children<Button>(root).Single(b=>(string)b.Content=="立即暂停").IsEnabled,"message assistant defaults to paused without connecting");
                    }
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
                typeof(MainWindow).GetMethod("SetStatus",BindingFlags.NonPublic|BindingFlags.Instance)!.Invoke(window,[new string('字',400),true]);Layout(root,640,440);Check(Children<TextBlock>(root).Single(t=>AutomationProperties.GetName(t)=="操作提示").ActualHeight<=84,"long status cannot consume the whole narrow large-text workspace");
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
                    Check(vault.Read().ReplyHistory.Count==3,"completed reply candidates saved to encrypted history");
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
                    navigation.SelectedItem="回复助手";Layout(root,1060,720);var target=Children<TextBox>(root).Single(t=>AutomationProperties.GetName(t)=="生成内容");
                    var screenshot=(Window)typeof(MainWindow).GetMethod("BuildScreenshotDialog",BindingFlags.NonPublic|BindingFlags.Instance)!.Invoke(window,[target])!;var screenRoot=(FrameworkElement)screenshot.Content;Layout(screenRoot,720,760);
                    var editor=Children<SnapshotEditor>(screenRoot).Single();byte[] pixels=Enumerable.Range(0,96*64).SelectMany(_=>new byte[]{40,40,240,255}).ToArray();editor.Load(BitmapSource.Create(96,64,96,96,PixelFormats.Bgra32,null,pixels,96*4));editor.Mask(new Rect(20,20,20,20));editor.Crop(new Rect(10,10,60,40));
                    byte[] png=editor.ExportPng();using(var stream=new MemoryStream(png)){var decoded=BitmapDecoder.Create(stream,BitmapCreateOptions.None,BitmapCacheOption.OnLoad).Frames[0];var bitmap=new FormatConvertedBitmap(decoded,PixelFormats.Bgra32,null,0);byte[] sample=new byte[4];bitmap.CopyPixels(new Int32Rect(15,15,1,1),sample,4,0);Check(sample[0]==0 && sample[1]==0 && sample[2]==0 && sample[3]==255,"redaction remains opaque after crop and PNG export");Check(bitmap.PixelWidth==60 && bitmap.PixelHeight==40,"crop contains only selected pixels");}
                    Children<Button>(screenRoot).Single(b=>(string)b.Content=="识别截图文字").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));Wait(()=>Children<TextBox>(screenRoot).Single(t=>AutomationProperties.GetName(t)=="截图识别文字").Text=="合成截图消息");
                    var sides=Children<ComboBox>(screenRoot).Single(b=>AutomationProperties.GetName(b)=="对方气泡方向");sides.SelectedIndex=1;Check(Children<TextBox>(screenRoot).Single(t=>AutomationProperties.GetName(t)=="截图识别文字").Text=="合成截图回复","speaker-side change selects explicit opposite bubble");
                    editor.Mask(new Rect(1,1,5,5));Check(Children<TextBox>(screenRoot).Single(t=>AutomationProperties.GetName(t)=="截图识别文字").Text.Length==0,"editing masks invalidates old recognized text");
                    Children<TextBox>(screenRoot).Single(t=>AutomationProperties.GetName(t)=="截图识别文字").Text="核对后的截图文字";Capture(screenRoot,"screenshot-helper",720,760);Children<Button>(screenRoot).Single(b=>(string)b.Content=="确认并追加文字").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));Check(target.Text.Contains("核对后的截图文字") && !screenshot.IsVisible,"recognized text requires confirmation and no visible fixture window");
                    var voice=(Window)typeof(MainWindow).GetMethod("BuildVoiceDialog",BindingFlags.NonPublic|BindingFlags.Instance)!.Invoke(window,[target,AudioClip.Wave(new byte[32000])])!;var voiceRoot=(FrameworkElement)voice.Content;Layout(voiceRoot,600,620);Children<Button>(voiceRoot).Single(b=>(string)b.Content=="识别语音").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));Wait(()=>Children<TextBox>(voiceRoot).Single(t=>AutomationProperties.GetName(t)=="语音识别文字").Text=="合成语音文字");Capture(voiceRoot,"voice-helper",600,620);Children<Button>(voiceRoot).Single(b=>(string)b.Content=="确认并追加文字").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));Check(target.Text.Contains("合成语音文字") && !voice.IsVisible,"imported synthetic WAV result appended only after confirmation");
                    var backup=(Window)typeof(MainWindow).GetMethod("BuildBackupDialog",BindingFlags.NonPublic|BindingFlags.Instance)!.Invoke(window,[true])!;var backupRoot=(FrameworkElement)backup.Content;Layout(backupRoot,540,620);Check(!Children<Button>(backupRoot).Single(b=>(string)b.Content=="确认恢复").IsEnabled,"backup cannot be applied before decrypt and preview");Capture(backupRoot,"backup-preview",540,620);backup.Close();
                    byte[] brokenPng=new byte[64];new byte[]{137,80,78,71,13,10,26,10}.CopyTo(brokenPng,0);"IHDR"u8.CopyTo(brokenPng.AsSpan(12));System.Buffers.Binary.BinaryPrimitives.WriteInt32BigEndian(brokenPng.AsSpan(16),8);System.Buffers.Binary.BinaryPrimitives.WriteInt32BigEndian(brokenPng.AsSpan(20),8);
                    vault.Update(s=>s.Stickers.Add(new("custom-bad","损坏样本",Convert.ToBase64String(brokenPng))));navigation.SelectedItem="表情包";Layout(root,1060,720);Check(Children<TextBlock>(root).Any(t=>t.Text.Contains("图片不可用")),"one malformed image does not hide the whole sticker library");Children<Button>(root).Single(b=>(string)b.Content=="删除损坏表情").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));Check(vault.Read().Stickers.Count==0,"broken custom sticker can be removed without deleting other data");
                }
                if(fixture is not null){TestWechatExport(window,root,navigation,vault,scale);TestHistoryImport(window,root,navigation,vault,scale);TestPreparation(window,root,navigation,scale);TestHub(window,root,navigation,scale);}
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
    private static void TestWechatExport(MainWindow window,FrameworkElement root,ListBox navigation,Vault vault,double scale)
    {
        navigation.SelectedItem="微信导出";Layout(root,640,440);
        Check(!Children<Button>(root).Single(b=>(string)b.Content=="读取会话文字").IsEnabled,"no database read without deliberate source and session selection");
        string fixture=ChatQ.Windows.Testing.WechatDatabaseFixture.Create(Path.Combine(vault.DirectoryPath,"synthetic-db-"+scale));var catalog=WechatDatabase.Open(fixture);
        typeof(MainWindow).GetField("wechatCatalog",BindingFlags.Instance|BindingFlags.NonPublic)!.SetValue(window,catalog);
        navigation.SelectedItem="人设中心";navigation.SelectedItem="微信导出";Layout(root,640,440);
        var session=Children<ComboBox>(root).Single(c=>AutomationProperties.GetName(c)=="微信导出会话");Check(session.SelectedIndex==-1,"database session starts unselected");session.SelectedItem=catalog.Sessions.Single(s=>s.Id==ChatQ.Windows.Testing.WechatDatabaseFixture.Peer);
        var read=Children<Button>(root).Single(b=>(string)b.Content=="读取会话文字");Check(read.IsEnabled && read.TranslatePoint(new Point(0,read.ActualHeight),root).Y<=440,"read action pinned at small viewport and 200 percent text");
        read.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));Wait(()=>typeof(MainWindow).GetField("wechatRead",BindingFlags.Instance|BindingFlags.NonPublic)!.GetValue(window) is WechatReadResult);
        var result=(WechatReadResult)typeof(MainWindow).GetField("wechatRead",BindingFlags.Instance|BindingFlags.NonPublic)!.GetValue(window)!;Check(result.Thread.Lines.Count==200,"invisible UI reads only selected recent text using synthetic SQLite");
        Layout(root,640,440);var previewTitle=Children<TextBlock>(root).Single(t=>t.Text=="3 · 核对文字后导出");var previewBox=Children<TextBox>(root).Single(t=>AutomationProperties.GetName(t)=="微信导出文字预览");var outerScroll=Children<ScrollViewer>(root).First(s=>Children<TextBox>(s).Contains(previewBox));Check(previewTitle.TranslatePoint(new Point(0,0),root).Y>=outerScroll.TranslatePoint(new Point(0,0),root).Y && previewTitle.TranslatePoint(new Point(0,previewTitle.ActualHeight),root).Y<read.TranslatePoint(new Point(0,0),root).Y,"loaded preview reveals complete heading above pinned actions instead of clipping large text");
        Check(Children<Button>(root).Single(b=>(string)b.Content=="导出文件").IsEnabled && Children<Button>(root).Single(b=>(string)b.Content=="转到聊天分析").IsEnabled,"loaded snapshot enables manual export and analysis transfer");
        Check(!JsonSerializer.Serialize(vault.Read(),new JsonSerializerOptions{Encoder=System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping}).Contains("原文前后"),"database raw text never persists in user vault");
        Layout(root,scale==1?1200:640,scale==1?800:700);Capture(root,"wechat-export-loaded-"+scale,scale==1?1200:640,scale==1?800:700);
        var from=Children<TextBox>(root).Single(c=>AutomationProperties.GetName(c)=="微信导出开始日期");from.Text="bad";Check(!Children<Button>(root).Single(b=>(string)b.Content=="转到聊天分析").IsEnabled && Children<TextBox>(root).Single(c=>AutomationProperties.GetName(c)=="微信导出文字预览").Text.Length==0,"edited range invalidates old export text and analyze action");
        read.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));Wait(()=>typeof(MainWindow).GetField("operation",BindingFlags.Instance|BindingFlags.NonPublic)!.GetValue(window) is null);Check(Children<TextBlock>(root).Any(t=>t.Text.Contains("日期请填写")),"invalid date reports next action without database read");
        from.Text="2026-11-05";Children<ComboBox>(root).Single(c=>AutomationProperties.GetName(c)=="微信导出条数").SelectedIndex=1;
        read.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));Wait(()=>typeof(MainWindow).GetField("wechatRead",BindingFlags.Instance|BindingFlags.NonPublic)!.GetValue(window) is WechatReadResult);
        Children<Button>(root).Single(b=>(string)b.Content=="转到聊天分析").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));Layout(root,640,440);
        Check((string)navigation.SelectedItem=="聊天分析" && Children<ComboBox>(root).Single(c=>AutomationProperties.GetName(c)=="聊天中哪位是我").SelectedIndex==-1,"database transfer uses existing analysis and still requires manual self selection");
        Check(Children<CheckBox>(root).Single(c=>AutomationProperties.GetName(c)=="允许发送聊天摘录").IsChecked!=true && !Children<Button>(root).Single(b=>(string)b.Content=="生成分析").IsEnabled,"database transfer never authorizes or invokes AI");
        Check(Children<TextBlock>(root).Any(t=>t.Text.Contains("压缩或二进制文字 1")),"transferred source coverage still discloses excluded data");
        Invoke(window,"ClearHistoryImport");Invoke(window,"ClearWechatSource");navigation.SelectedItem="微信导出";Layout(root,640,440);Check(!Children<Button>(root).Single(b=>(string)b.Content=="读取会话文字").IsEnabled && !window.IsVisible,"clear releases source and test never launches a visible app");
    }
    private static void TestHistoryImport(MainWindow window,FrameworkElement root,ListBox navigation,Vault vault,double scale)
    {
        navigation.SelectedItem="聊天分析";Layout(root,640,440);
        Check(!Children<Button>(root).Single(b=>(string)b.Content=="生成分析").IsEnabled,"history never analyzes before explicit import and consent");
        string json=JsonSerializer.Serialize(new{Session=new{UserName="synthetic-peer",DisplayName="合成会话"},Messages=new[]{new{Id="1",Sender="合成自己",IsSelf=true,Time="2026-11-04 12:01:00",Type=1,Content="synthetic-private-chat:今天想出去走走。"},new{Id="2",Sender="合成好友",IsSelf=false,Time="2026-11-04 12:02:00",Type=1,Content="合成自己，下次一起散步？13800138000 demo@example.com"}}});
        var archive=ChatImport.Load(System.Text.Encoding.UTF8.GetBytes(json),"messages.json");
        typeof(MainWindow).GetMethod("SetHistoryImport",BindingFlags.Instance|BindingFlags.NonPublic)!.Invoke(window,[archive]);
        navigation.SelectedItem="人设中心";navigation.SelectedItem="聊天分析";Layout(root,1060,720);
        Check(Children<Button>(root).Any(b=>(string)b.Content=="导入读取包文件夹") && Children<Button>(root).Single(b=>(string)b.Content=="导出聊天文字").IsEnabled,"file and folder import plus selected text export are available");
        var export=(Window)typeof(MainWindow).GetMethod("BuildHistoryExportDialog",BindingFlags.Instance|BindingFlags.NonPublic)!.Invoke(window,null)!;
        var exportRoot=(FrameworkElement)export.Content;Layout(exportRoot,360,440);
        var exportFormat=Children<ComboBox>(exportRoot).Single(c=>AutomationProperties.GetName(c)=="聊天文字导出格式");
        var exportRange=Children<ComboBox>(exportRoot).Single(c=>AutomationProperties.GetName(c)=="聊天文字导出范围");
        Check(exportFormat.SelectedIndex==0 && exportRange.SelectedIndex==0,"text export defaults to reimportable JSON and recent200");exportRange.SelectedIndex=1;Layout(exportRoot,360,440);
        var saveText=Children<Button>(exportRoot).Single(b=>(string)b.Content=="另存聊天文件");
        Check(saveText.TranslatePoint(new Point(0,saveText.ActualHeight),exportRoot).Y<=440 && saveText.ActualHeight>=40,"export save action stays pinned in narrow short large-font dialog");
        Check(Children<ScrollViewer>(exportRoot).Any() && Children<TextBlock>(exportRoot).Any(t=>t.Text.Contains("2 / 已导入2")),"export details scroll and selected coverage is visible");
        Check(!export.IsVisible && !Children<Button>(exportRoot).Single(b=>(string)b.Content=="停止导出").IsEnabled,"export fixture opens no window or picker and starts no work");
        Capture(exportRoot,"chat-text-export-"+scale,360,580);export.Close();
        var self=Children<ComboBox>(root).Single(c=>AutomationProperties.GetName(c)=="聊天中哪位是我");Check(self.SelectedIndex==-1,"import identity starts unselected even with self flags");self.SelectedItem=ChatImport.SelfFlags;
        var preview=Children<TextBox>(root).Single(c=>AutomationProperties.GetName(c)=="将发送的化名聊天摘录");Check(preview.Text.Contains("M00002") && !preview.Text.Contains("13800138000") && !preview.Text.Contains("demo@example.com") && !preview.Text.Contains("合成自己"),"invisible UI shows exact anonymized outbound preview");
        var consent=Children<CheckBox>(root).Single(c=>AutomationProperties.GetName(c)=="允许发送聊天摘录");Check(consent.IsChecked!=true,"selecting self does not consent or call model");
        var count=Children<ComboBox>(root).Single(c=>AutomationProperties.GetName(c)=="分析建议回复条数");count.SelectedItem=7;consent.IsChecked=true;
        var generate=Children<Button>(root).Single(b=>(string)b.Content=="生成分析");Check(generate.IsEnabled,"explicit consent enables analysis with saved own API");
        Layout(root,640,440);Check(generate.TranslatePoint(new Point(0,generate.ActualHeight),root).Y<=440 && generate.ActualHeight>=40,"analysis primary action stays visible in short large-font layout");Layout(root,scale==1?1200:640,scale==1?800:700);
        generate.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));Wait(()=>Children<TextBox>(root).Any(t=>AutomationProperties.GetName(t)=="分析回复建议"));
        Check(Children<TextBlock>(root).Any(t=>t.Text.Contains("M00002") && t.Text.Contains("依据")),"rendered observations retain source evidence");
        var summary=Children<TextBlock>(root).Single(t=>t.Text=="聊天总结");double summaryTop=summary.TranslatePoint(new Point(0,0),root).Y,actionsTop=generate.TranslatePoint(new Point(0,0),root).Y;Check(summaryTop>=0 && summaryTop+summary.ActualHeight<actionsTop,"finished analysis reveals summary above pinned actions instead of below viewport or at report bottom");Capture(root,"chat-history-analysis-"+scale,scale==1?1200:640,scale==1?800:700);
        Check(!JsonSerializer.Serialize(vault.Read()).Contains("synthetic-private-chat"),"imported raw history never enters normal vault or backup DTO");
        var question=Children<TextBox>(root).Single(t=>AutomationProperties.GetName(t)=="分析关注点");question.Text="fixture-history-slow";Check(consent.IsChecked!=true && !Children<TextBox>(root).Any(t=>AutomationProperties.GetName(t)=="分析回复建议"),"edited question clears consent and old analysis");
        consent.IsChecked=true;generate.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        var range=Children<ComboBox>(root).Single(c=>AutomationProperties.GetName(c)=="分析最近文本条数");range.SelectedItem=50;
        Wait(()=>typeof(MainWindow).GetField("operation",BindingFlags.Instance|BindingFlags.NonPublic)!.GetValue(window) is null);
        Check(!Children<TextBox>(root).Any(t=>AutomationProperties.GetName(t)=="分析回复建议") && consent.IsChecked!=true,"changed selection cancels pending analysis and prevents late overwrite");
        Capture(root,"chat-history-preview-"+scale,640,700);Invoke(window,"ClearHistoryImport");navigation.SelectedItem="人设中心";navigation.SelectedItem="聊天分析";Layout(root,640,440);
        Check(Children<TextBox>(root).Single(t=>AutomationProperties.GetName(t)=="将发送的化名聊天摘录").Text.Length==0,"clear releases imported view and disables generation");Check(!window.IsVisible,"history tests never open a visible application");
    }
    private sealed class UiHubAdapter : IHubTransport
    {
        public Action<HubIncoming>? Incoming;
        public List<(string Peer,string Text)> Sent=[];
        public Task Connect(HubConnection c,IReadOnlyList<HubRule> r,Action<HubIncoming> incoming,Action<string> disconnected,CancellationToken token){Incoming=incoming;return Task.CompletedTask;}
        public Task<string> Send(HubIncoming target,string text,CancellationToken token){token.ThrowIfCancellationRequested();Sent.Add((target.Peer,text));return Task.FromResult("synthetic-ui-receipt");}
        public void Dispose(){}
    }
    private static void TestPreparation(MainWindow window,FrameworkElement root,ListBox navigation,double scale)
    {
        var store=(HubStore)typeof(MainWindow).GetField("hubStore",BindingFlags.NonPublic|BindingFlags.Instance)!.GetValue(window)!;
        string endpoint=Environment.GetEnvironmentVariable("CHATQ_ONEBOT_FIXTURE")??"ws://127.0.0.1:3001/";
        store.Update(s=>{s.Connection=new("qq","10001",endpoint,"old-synthetic-token");s.Rules.Clear();s.Items.Clear();s.Contexts.Clear();});
        navigation.SelectedItem="消息助手";Layout(root,640,440);var picker=Children<ComboBox>(root).Single(c=>AutomationProperties.GetName(c)=="消息助手版块");picker.SelectedIndex=0;Layout(root,640,440);
        Check(!Children<Button>(root).Single(b=>(string)b.Content=="连接并开始").IsEnabled,"incomplete preparation disables connection before any confirmation dialog");
        var next=Children<Button>(root).Single(b=>(string)b.Content=="指定好友");Check(next.TranslatePoint(new Point(0,next.ActualHeight),root).Y<=440,"first setup next-step actions remain pinned for large font");
        picker.SelectedIndex=2;Layout(root,640,660);
        Check(Children<CheckBox>(root).Single(c=>AutomationProperties.GetName(c)=="打开聊商自动回复").IsChecked!=true,"unattended startup remains off until a deliberate user setup");
        var secret=Children<PasswordBox>(root).Single(c=>AutomationProperties.GetName(c)=="桥接访问令牌");secret.Password="new-synthetic-bridge-token";
        var save=Children<Button>(root).Single(b=>(string)b.Content=="保存连接与规则");save.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));Check(store.Read().Connection.Token=="new-synthetic-bridge-token","updated bridge token saved from current form");
        save.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));Check(store.Read().Connection.Token=="new-synthetic-bridge-token","second save after clearing password box cannot restore stale old token");
        Layout(root,640,440);Check(save.TranslatePoint(new Point(0,save.ActualHeight),root).Y<=440,"save action pinned in short large-font connection settings");
        if(Environment.GetEnvironmentVariable("CHATQ_ONEBOT_FIXTURE") is not null)
        {
            Children<Button>(root).Single(b=>(string)b.Content=="检查连接准备").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
            Wait(()=>Children<TextBlock>(root).Any(t=>t.Text.Contains("本机端口可达")));Layout(root,640,660);Capture(root,"connection-preparation-"+scale,640,660);
            Check(!Children<TextBox>(root).Any(t=>t.Text.Contains("new-synthetic-bridge-token")),"preparation result never reveals channel token");
            Children<TextBox>(root).Single(t=>AutomationProperties.GetName(t)=="本人账号").Text="10002";
            var details=Children<Expander>(root).Single(e=>(string)e.Header=="查看连接准备清单");details.IsExpanded=true;Layout(root,640,660);
            Check(Children<TextBlock>(root).Any(t=>t.Text=="内容有修改，请重新检查准备情况。") && !Children<TextBlock>(root).Any(t=>t.Text.Contains("本机端口可达")),"editing connection clears previously successful preparation result");
        }
        Children<ComboBox>(root).Single(c=>AutomationProperties.GetName(c)=="消息连接平台").SelectedIndex=1;Layout(root,640,660);
        var help=Children<Expander>(root).Single(e=>AutomationProperties.GetName(e)=="微信连接准备步骤");help.IsExpanded=true;Layout(root,640,660);
        Check(Children<TextBlock>(root).Any(t=>t.Text.Contains("Python3.9–3.13")),"WeChat setup documents compatible isolated interpreter range");
        Check(Children<TextBlock>(root).Any(t=>t.Text.Contains("免费版wxauto4") && t.Text.Contains("不能直接替换")),"free library is not silently substituted for required listener API");
        Check(Children<TextBlock>(root).Any(t=>t.Text.Contains("不要为测试自动降级")),"client compatibility caveat avoids changing installed WeChat");
        Layout(root,640,440);Check(save.TranslatePoint(new Point(0,save.ActualHeight),root).Y<=440,"setup guide keeps save action pinned at 200 percent");
        Layout(root,640,700);help.BringIntoView(new Rect(0,0,1,Math.Min(help.ActualHeight,300*scale)));Capture(root,"wechat-preparation-guide-"+scale,640,700);
    }
    private static void TestHub(MainWindow window,FrameworkElement root,ListBox navigation,double scale)
    {
        var store=(HubStore)typeof(MainWindow).GetField("hubStore",BindingFlags.NonPublic|BindingFlags.Instance)!.GetValue(window)!;
        var hub=(MessageHub)typeof(MainWindow).GetField("hub",BindingFlags.NonPublic|BindingFlags.Instance)!.GetValue(window)!;
        store.Update(s=>{s.Connection=new("qq","10001","ws://127.0.0.1:3001/","synthetic-bridge-token");s.Rules=[new("qa-a","qq","10001","20001","合成好友甲","qa","natural"),new("qa-b","qq","10001","20002","合成好友乙","qa","warm")];s.Items.Clear();s.Contexts.Clear();s.LastRequests.Clear();s.Seen.Clear();});
        navigation.SelectedItem="消息助手";Layout(root,1060,720);Children<ComboBox>(root).Single(c=>AutomationProperties.GetName(c)=="消息助手版块").SelectedIndex=0;Layout(root,1060,720);var adapter=new UiHubAdapter();var started=hub.Start(adapter);Wait(()=>started.IsCompleted);Check(started.IsCompletedSuccessfully,"synthetic transport starts without opening external applications");Layout(root,1060,720);Check(Children<TextBlock>(root).Any(t=>t.Text=="已连接，等待指定好友的新消息"),"connected empty inbox shows waiting rather than incomplete configuration");
        adapter.Incoming!(new("qq","10001","20001","ui-1","今天有点累，想早点休息。",DateTime.UtcNow));Check(store.Read().Items.Count>0,"synthetic incoming accepted: "+hub.Status);Wait(()=>store.Read().Items.LastOrDefault()?.Status=="ready");
        string selected=store.Read().Items.Last().Id;Layout(root,1060,720);
        Check(Children<TextBlock>(root).Single(t=>AutomationProperties.GetName(t)=="当前好友回复方式").Text.StartsWith("确认模式"),"message view explains whether this friend requires confirmation");
        Children<ComboBox>(root).Single(x=>AutomationProperties.GetName(x)=="消息助手会话消息").SelectedValue=selected;Layout(root,1060,720);
        var draft=Children<TextBox>(root).Single(t=>AutomationProperties.GetName(t)=="待确认回复");draft.Text="核对并修改后的合成回复";
        adapter.Incoming!(new("qq","10001","20002","ui-2","另一个会话的合成新消息。",DateTime.UtcNow));Wait(()=>store.Read().Items.Last().Status=="ready");Layout(root,1060,720);
        Check(Children<TextBox>(root).Single(t=>AutomationProperties.GetName(t)=="待确认回复").Text=="核对并修改后的合成回复","another friend arriving cannot replace edited confirmation draft");
        Capture(root,"message-confirm-"+scale,scale==1?1200:640,scale==1?780:660);
        Layout(root,640,440);var pinned=Children<Button>(root).Single(b=>(string)b.Content=="确认发送");Check(pinned.TranslatePoint(new Point(0,pinned.ActualHeight),root).Y<=440,"confirmation action stays visible at 200 percent and short viewport");Layout(root,1060,720);
        Check(adapter.Sent.Count==0,"invisible UI confirmation flow never auto sends");
        Children<Button>(root).Single(b=>(string)b.Content=="确认发送").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));Wait(()=>store.Read().Items.Single(i=>i.Id==selected).Status=="sent");
        Check(adapter.Sent.Single()==("20001","核对并修改后的合成回复"),"confirm button passes edited reply and original friend to synthetic transport");
        var ruleDialog=(Window)typeof(MainWindow).GetMethod("BuildHubRuleDialog",BindingFlags.NonPublic|BindingFlags.Instance)!.Invoke(window,[null])!;var ruleRoot=(FrameworkElement)ruleDialog.Content;Layout(ruleRoot,540,620);
        Check(Children<ComboBox>(ruleRoot).Single(c=>AutomationProperties.GetName(c)=="会话回复模式").SelectedIndex==0,"new friend defaults to confirmation mode");Check(!ruleDialog.IsVisible,"friend dialog is rendered offscreen only");Capture(ruleRoot,"message-rule-"+scale,540,620);ruleDialog.Close();
        hub.Stop();Layout(root,640,440);Check(!hub.Active,"pause settles synthetic message session");
        store.Update(s=>{s.Rules[0]=s.Rules[0] with{Mode="auto"};s.Items.Add(new HubItem{Run="synthetic-paused-run",RuleId="qa-a",Source=new("qq","10001","20001","paused-auto","合成等待消息",DateTime.UtcNow),Notice="冷却中，间隔结束后自动处理此好友最新一条消息"});});
        typeof(MainWindow).GetField("hubSelection",BindingFlags.NonPublic|BindingFlags.Instance)!.SetValue(window,store.Read().Items.Last().Id);
        navigation.SelectedItem="人设中心";navigation.SelectedItem="消息助手";Layout(root,640,440);
        Check(Children<TextBlock>(root).Single(t=>AutomationProperties.GetName(t)=="当前好友回复方式").Text.StartsWith("自动模式"),"automatic friend policy is visibly distinct at small and large text sizes");
        Check(Children<TextBlock>(root).Any(t=>t.Text.StartsWith("已暂停，本条不会自动继续"))&&!Children<TextBlock>(root).Any(t=>t.Text=="冷却中，间隔结束后自动处理此好友最新一条消息"),"paused view never promises deferred auto sending");
        Check(!Children<Button>(root).Single(b=>(string)b.Content=="确认发送").IsEnabled,"paused automatic row cannot be manually submitted");
        Capture(root,"message-paused-auto-"+scale,640,660);
        byte[] preserved=File.ReadAllBytes(store.FilePath);File.WriteAllBytes(store.FilePath,"corrupt-synthetic-hub"u8.ToArray());hub.Stop();Wait(()=>Children<TextBlock>(root).Any(t=>AutomationProperties.GetName(t)=="操作提示" && t.Text.Contains("消息助手数据暂时无法读取")));Check(!hub.Active,"unreadable message file on background refresh pauses without UI crash");File.WriteAllBytes(store.FilePath,preserved);
        store.Update(HubAutomatic.SetCurrentFriendsAutomatic);
        navigation.SelectedItem="人设中心";navigation.SelectedItem="消息助手";Layout(root,640,660);Children<ComboBox>(root).Single(c=>AutomationProperties.GetName(c)=="消息助手版块").SelectedIndex=2;Layout(root,640,660);
        var automaticStart=Children<CheckBox>(root).Single(c=>AutomationProperties.GetName(c)=="打开聊商自动回复");automaticStart.IsChecked=true;
        Children<Button>(root).Single(b=>(string)b.Content=="保存连接与规则").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        var fixtureVault=(Vault)typeof(MainWindow).GetField("vault",BindingFlags.NonPublic|BindingFlags.Instance)!.GetValue(window)!;
        Check(HubAutomatic.Inspect(store.Read(),fixtureVault.Read()).Status=="ready"&&!hub.Active,"automatic-start opt-in is saved by UI without immediately connecting or sending");
        Check(Children<TextBlock>(root).Any(t=>t.Text==HubAutomatic.Inspect(store.Read(),fixtureVault.Read()).Detail),"saving automatic start immediately updates the displayed readiness rather than stale disabled text");
        Layout(root,640,440);Check(automaticStart.TranslatePoint(new Point(0,automaticStart.ActualHeight),root).Y<400,"automatic-start control is near the top in short and large-text layouts");
        Capture(root,"automatic-start-settings-"+scale,640,660);
        var automaticAdapter=new UiHubAdapter();var automaticConnection=hub.Start(automaticAdapter,store.Read().AutoStartScope);Wait(()=>automaticConnection.IsCompleted);
        Check(automaticConnection.IsCompletedSuccessfully&&automaticAdapter.Sent.Count==0,"authorized synthetic automatic startup connects without replaying existing queue");
        Wait(()=>Children<Button>(root).Single(b=>(string)b.Content=="立即暂停").IsEnabled);
        Children<Button>(root).Single(b=>(string)b.Content=="立即暂停").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        Check(!hub.Active&&store.Read().AutoStartRevision.Length==0,"pause UI cancels both active automation and future automatic startup");
        Check(automaticStart.IsChecked!=true,"pause immediately updates the automatic-start checkbox rather than leaving a stale enabled display");
    }
}
