using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using Microsoft.Win32;

namespace ChatQ.Windows;

public sealed partial class MainWindow : Window
{
    private readonly Vault vault;
    private readonly PersonalAi ai = new();
    private readonly ContentControl content = new();
    private ListBox navigation = null!;
    private readonly TextBlock status = new() { TextWrapping = TextWrapping.Wrap };
    private readonly DispatcherTimer draftTimer = new() { Interval = TimeSpan.FromMilliseconds(700) };
    private UserState state = new();
    private CancellationTokenSource? operation;
    private int viewId;
    private string page = "回复助手", mode = "reply", chatId = "";
    private TextBox? input;
    private bool loading, editingLastQuestion;
    private string beforeEditDraft = "";
    private readonly double textScale;
    private static readonly Brush Accent = new SolidColorBrush(Color.FromRgb(112, 84, 200));
    private StackPanel replyResults = new(), chatMessages = new();
    private ScrollViewer? replyScroll, chatScroll;
    private ListBox? sessions;
    private TextBlock? chatTitle;
    private Border? editBanner;
    private Action? preferenceSummaryChanged;
    public bool HotkeyAvailable { get; set; }

    public MainWindow(Vault store, double? scale = null)
    {
        textScale = Math.Clamp(scale ?? Convert.ToDouble(Registry.GetValue(@"HKEY_CURRENT_USER\Software\Microsoft\Accessibility", "TextScaleFactor", 100)) / 100.0, 1, 2.25);
        FontSize = 14 * textScale; FontFamily = new FontFamily("Microsoft YaHei UI"); Foreground = Ink; Background = new SolidColorBrush(Color.FromRgb(245,246,251)); vault = store; Title = "聊商 · Windows";
        Icon = BitmapFrame.Create(new Uri("pack://application:,,,/ChatQ;component/Brand.ico"));
        Width = Math.Min(1200, SystemParameters.WorkArea.Width * .94); Height = Math.Min(820, SystemParameters.WorkArea.Height * .94);
        MinWidth = Math.Min(600, SystemParameters.WorkArea.Width * .9); MinHeight = Math.Min(460, SystemParameters.WorkArea.Height * .9);
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        InitializeHub(); BuildShell();
        draftTimer.Tick += (_, _) => { draftTimer.Stop(); SaveDraft(); };
        PreviewKeyDown += (_, e) =>
        {
            if (e.Key == Key.Enter && Keyboard.Modifiers == ModifierKeys.Control && !OwnedWindows.Cast<Window>().Any())
            { e.Handled = true; if (page == "回复助手") _ = GenerateReply(); else if (page == "AI 对话") _ = SendChat(false); }
            if (e.Key == Key.Escape && operation is not null) Cancel();
        };
        SessionSwitchEventHandler? sessionChanged=null;
        Loaded+=(_,_)=>{sessionChanged=(_,e)=>{if(e.Reason is SessionSwitchReason.SessionLock or SessionSwitchReason.SessionLogoff)hub.Stop("Windows 会话已锁定或退出，消息助手已暂停");};SystemEvents.SessionSwitch+=sessionChanged;};
        Closing += (_, _) => { if(sessionChanged is not null)SystemEvents.SessionSwitch-=sessionChanged;hub.Dispose(); RestoreBeforeEdit(); SaveDraft(); Cancel(); ai.Dispose(); };
        try { state = vault.Read(); Navigate("回复助手"); }
        catch (Exception e) { content.Content = EmptyState("本机数据暂时无法读取", "已保留原文件。请使用原 Windows 账号检查本机加密备份。"); SetStatus(SafeError(e), true); }
    }
    public void AcceptLaunchRequest(LaunchRequest request)
    {
        if (request != LaunchRequest.Reply) return;
        RestoreBeforeEdit(); SaveDraft(); input = null; mode = "reply";
        if ((string?)navigation.SelectedItem != "回复助手") navigation.SelectedItem = "回复助手";
        else Navigate("回复助手");
    }
    private TextBlock Text(string value, double size = 14, bool bold = false) => new() { Text = value, FontSize = size * textScale, FontWeight = bold ? FontWeights.SemiBold : FontWeights.Normal, TextWrapping = TextWrapping.Wrap, Margin = new(0, 0, 0, 8) };
    private static StackPanel Stack() => new() { Margin = new(0, 0, 0, 6) };
    private Button Button(string label, Action click, bool primary = false)
    {
        var button = new Button { Content = label }; AutomationProperties.SetName(button, label);
        button.Click += (_, _) => { try { click(); } catch (Exception e) { SetStatus(SafeError(e), true); } };
        if (primary) { button.Background = Accent; button.Foreground = Brushes.White; } return button;
    }
    private TextBox Box(string label, string value = "", int limit = 2000, bool multiline = false)
    {
        var box = new TextBox { Text = value, MaxLength = limit, AcceptsReturn = multiline, TextWrapping = TextWrapping.Wrap, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
        if (multiline) { box.MinHeight = 110; box.MaxHeight = 230; box.VerticalContentAlignment = VerticalAlignment.Top; }
        AutomationProperties.SetName(box, label); return box;
    }
    private static ScrollViewer Scroll(UIElement child) => new() { Content = child, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled, CanContentScroll = false };
    private void SetStatus(string value, bool error = false)
    {
        status.Text = value;status.ToolTip=value;AutomationProperties.SetHelpText(status,value); status.Foreground = error ? Brushes.Firebrick : Muted;
        if (dialogStatus is not null) { dialogStatus.Text = value; dialogStatus.Foreground = status.Foreground; }
    }
    private static string SafeError(Exception error) => error switch
    {
        OperationCanceledException => "生成已停止，内容和草稿已保留。",
        HttpRequestException => "连接失败，请检查网络、API 地址和代理设置。",
        JsonException => "供应商返回格式异常，请重试或更换模型。",
        IOException => "文件操作失败，请检查磁盘空间与权限。原数据已保留。",
        InvalidOperationException or System.Security.Cryptography.CryptographicException => error.Message,
        _ => "操作未完成，请重试；现有数据已保留。"
    };
    private void Cancel()
    {
        if (operation is { IsCancellationRequested: false }) { operation.Cancel(); SetStatus(page=="微信导出"?"已停止当前任务，原数据库未修改。":"已停止生成，草稿和原回答已保留。"); }
        viewId++; UpdateTaskButtons();
    }
    private void Navigate(string target)
    {
        RestoreBeforeEdit(); SaveDraft(); Cancel(); page = target; input = null; loading = true; taskButtons.Clear(); preferenceSummaryChanged = null;hubRefresh=null;
        try
        {
            state = vault.Read();
            content.Content = target switch { "微信导出"=>WechatExportPage(),"聊天分析"=>ChatHistoryPage(),"消息助手"=>MessagePage(),"AI 对话" => ChatPage(), "人设中心" => PersonaPage(), "我的 API" => ApiPage(), "记录收藏"=>HistoryPage(),"表情包"=>StickersPage(),"数据与更新"=>DataPage(),"键盘设置" => KeyboardPage(), _ => ReplyPage() };
            SetStatus(target=="微信导出"?"导出只在本机读取和另存文件，不需要API。":state.ActiveProfile is { } profile ? "当前 API：" + profile.Name + " · " + profile.Model : "先在“我的 API”保存配置，即可开始生成。");
        }
        catch (Exception e) { content.Content = target=="数据与更新"?DataPage(true):EmptyState("页面暂时无法加载", SafeError(e)); SetStatus(SafeError(e), true); }
        finally { loading = false; UpdateTaskButtons();RefreshHubIndicator(); }
    }
    private void SaveDraft()
    {
        draftTimer.Stop(); if (loading || input is null || (page != "回复助手" && page != "AI 对话")) return;
        string value = editingLastQuestion ? beforeEditDraft : input.Text;
        try
        {
            state = vault.Update(s =>
            {
                if (page == "AI 对话") { string key = chatId.Length == 0 ? "new" : chatId; if (value.Length == 0) s.ChatDrafts.Remove(key); else s.ChatDrafts[key] = value; }
                else if (mode == "polish") s.PolishDraft = value; else if (mode == "topics") s.TopicDraft = value; else s.ReplyDraft = value;
                s.DraftUpdatedAt = DateTime.UtcNow;
            });
        }
        catch (Exception e) { SetStatus("草稿保存失败：" + SafeError(e), true); }
    }
    private void ChangeSettings(Action<UserState> action)
    { PauseHubForSettings();Cancel(); state = vault.Update(action, true); replyResults.Children.Clear(); if (page == "回复助手") replyResults.Children.Add(EmptyState("偏好已更新", "下次生成将使用新的选择。")); preferenceSummaryChanged?.Invoke(); SetStatus("偏好已更新，下次生成时生效。"); }
    private bool Paste()
    {
        try { string value = Clipboard.ContainsText() ? Clipboard.GetText() : ""; if (value.Trim().Length is < 1 or > 1000) { SetStatus("请复制1–1000字的文本；过长内容请先精简。", true); return false; } input!.Text = value.Trim(); return true; }
        catch (System.Runtime.InteropServices.COMException) { SetStatus("剪贴板暂时被占用，请手动粘贴或稍后重试。", true); return false; }
    }
    private async Task Operate(Func<CancellationToken, int, string, Task> action,bool requireState=true)
    {
        if (operation is not null) { SetStatus("当前任务正在结束，请稍后再试。"); return; }
        var current = new CancellationTokenSource(TimeSpan.FromSeconds(80)); operation = current; int view = viewId; UpdateTaskButtons();
        try { if(requireState)state = vault.Read(); string revision = state.ConfigurationRevision; await action(current.Token, view, revision); }
        catch (Exception e) { if (view == viewId) SetStatus(SafeError(e), true); }
        finally { operation = null; current.Dispose(); UpdateTaskButtons(); }
    }
    private void Guard(CancellationToken token, int view, string revision)
    { token.ThrowIfCancellationRequested(); if (view != viewId || state.ConfigurationRevision != revision) throw new OperationCanceledException(); }
    private async Task GenerateReply()
    {
        if (input is null) return; string prompt = input.Text, requestedMode = mode;
        await Operate(async (token, view, revision) =>
        {
            SetStatus("正在生成…点击停止或按 Esc 可取消。");
            var replies = await ai.Replies(state, prompt, requestedMode, token); Guard(token, view, revision);
            List<SavedReply> saved=[];string? recordError=null;
            try {state=vault.Update(s=>saved=HistoryPolicy.Add(s,replies,prompt,requestedMode,s.ActivePersona?.Name??"自然真诚"));}catch(Exception e) when(e is IOException or InvalidOperationException or System.Security.Cryptography.CryptographicException){recordError=SafeError(e);}
            replyResults.Children.Clear(); replyResults.Children.Add(Text($"为你生成 {replies.Count} 条回复", 17, true));
            int index = 0;
            foreach (string reply in replies)
            {
                var card = Stack(); var heading = Text($"建议 {++index:00}", 12, true); heading.Foreground = Accent; card.Children.Add(heading);
                var text = Box("回复内容", reply, 1000, true); text.IsReadOnly = true; text.MinHeight = 60; text.MaxHeight = 320; card.Children.Add(text);
                var actions = new WrapPanel(); actions.Children.Add(Button("复制这条", () => Copy(reply), true));
                var record=saved.Find(x=>x.Text==reply);if(record is not null)actions.Children.Add(Button("收藏",()=>{state=vault.Update(s=>{int at=s.ReplyHistory.FindIndex(x=>x.Id==record.Id);if(at>=0)s.ReplyHistory[at]=s.ReplyHistory[at] with {Favorite=true};});SetStatus("已收藏，可到“记录收藏”查看。");}));
                actions.Children.Add(Button("再润色", () => { SaveDraft(); state = vault.Update(s => { s.PolishDraft = reply; s.DraftUpdatedAt = DateTime.UtcNow; }); input = null; mode = "polish"; Navigate("回复助手"); }));
                card.Children.Add(actions); replyResults.Children.Add(Card(card));
            }
            replyResults.BringIntoView(); SetStatus(recordError is null?"已生成并保存记录，选择一条复制后回聊天窗口粘贴。":"已生成，但记录未保存："+recordError,recordError is not null);
        });
    }
    private void Copy(string text)
    { try { Clipboard.SetText(text); SetStatus("已复制。按 Alt + Tab 返回聊天窗口粘贴。"); } catch (System.Runtime.InteropServices.COMException) { SetStatus("剪贴板被占用，请稍后再复制。", true); } }
    private void RestoreBeforeEdit()
    {
        if (!editingLastQuestion) return;
        editingLastQuestion = false; if (editBanner is not null) editBanner.Visibility = Visibility.Collapsed; if (input is not null) { bool old = loading; loading = true; input.Text = beforeEditDraft; loading = old; } beforeEditDraft = "";
    }
    private void SwitchChat(string id) { RestoreBeforeEdit(); SaveDraft(); input = null; chatId = id; Navigate("AI 对话"); }
    private void BeginEditQuestion()
    {
        Cancel();
        var chat = state.Conversations.Find(c => c.Id == chatId);
        if (chat?.Messages.Count < 2 || chat is null || input is null) { SetStatus("请先完成一轮对话。"); return; }
        if (!editingLastQuestion) beforeEditDraft = input.Text;
        editingLastQuestion = true; bool old = loading; loading = true; input.Text = chat.Messages[^2].Content; loading = old;
        if (editBanner is not null) editBanner.Visibility = Visibility.Visible;
        SetStatus("正在编辑上一问；发送后替换这一轮，失败时保留原回答。"); input.Focus();
    }
    private void AddMessage(Message message)
    {
        var panel = Stack(); var header = new DockPanel(); var copy = Button("复制", () => Copy(message.Content)); copy.HorizontalAlignment = HorizontalAlignment.Right; DockPanel.SetDock(copy,Dock.Right); header.Children.Add(copy);
        var role = Text(message.Role == "user" ? "我" : "聊商 AI", 12, true); role.VerticalAlignment = VerticalAlignment.Center; header.Children.Add(role); panel.Children.Add(header);
        var text = Box("对话内容", message.Content, 10000, true); text.IsReadOnly = true; text.MinHeight = 40; text.MaxHeight = 500; panel.Children.Add(text);
        var card = Card(panel); if (message.Role == "user") { card.Background = Soft; card.Margin = new(36, 0, 0, 14); } else card.Margin = new(0, 0, 24, 14);
        chatMessages.Children.Add(card);
    }
    private async Task SendChat(bool regenerate)
    {
        if (input is null) return;
        if (regenerate && editingLastQuestion) { SetStatus("请先发送修改，或取消编辑后再重新回答。"); return; }
        var existing = state.Conversations.Find(c => c.Id == chatId); var history = existing?.Messages.ToList() ?? [];
        bool edit = editingLastQuestion && !regenerate;
        string prompt = input.Text.Trim(), unsentDraft = regenerate ? input.Text : edit ? beforeEditDraft : "";
        if (regenerate || edit)
        {
            if (history.Count < 2 || history[^1].Role != "assistant" || history[^2].Role != "user") { SetStatus("没有可重新生成的问题。"); return; }
            history.RemoveAt(history.Count - 1); if (regenerate) prompt = history[^1].Content; history.RemoveAt(history.Count - 1);
        }
        string target = chatId;
        await Operate(async (token, view, revision) =>
        {
            if (history.Count > 98) throw new InvalidOperationException("本会话已达到100条消息，请新建对话继续。");
            if (state.Conversations.Count >= 50 && state.Conversations.All(c => c.Id != target)) throw new InvalidOperationException("最多保存50个会话，请先导出并删除不用的会话。");
            if (JsonSerializer.SerializeToUtf8Bytes(state, Defaults.Json).Length + 100000 > Vault.MaxPlainBytes) throw new InvalidOperationException("本机记录剩余容量不足，请先导出并删除不用的会话。");
            var messages = PersonalAi.ChatMessages(state, history, prompt); var profile = state.ActiveProfile ?? throw new InvalidOperationException("请先配置 API。");
            SetStatus(regenerate ? "正在重新回答，原回答会保留到完成。" : "正在回答…点击停止或按 Esc 可取消。");
            var pending = Stack(); pending.Children.Add(Text("正在回答 · " + prompt[..Math.Min(70, prompt.Length)], 13, true));
            var live = Box("正在生成的回答", "", 10000, true); live.IsReadOnly = true; live.MinHeight = 70; pending.Children.Add(live);
            var pendingCard = Card(pending); var pendingPanel = chatMessages; pendingPanel.Children.Add(pendingCard); chatScroll?.ScrollToEnd();
            try
            {
                string answer = await ai.Complete(profile, messages, profile.Stream, text =>
                {
                    Guard(token, view, revision); bool follow = chatScroll is null || chatScroll.ScrollableHeight - chatScroll.VerticalOffset < 60;
                    live.Text = text; if (follow) chatScroll?.ScrollToEnd();
                }, token); Guard(token, view, revision);
                string savedId = target;
                state = vault.Update(s =>
                {
                    var conversation = s.Conversations.Find(c => c.Id == target);
                    if (conversation is null) { if (s.Conversations.Count >= 50) throw new InvalidOperationException("最多保存50个会话。"); conversation = new Conversation { Name = prompt[..Math.Min(30, prompt.Length)] }; s.Conversations.Add(conversation); }
                    conversation.Messages = [.. history, new("user", prompt), new("assistant", answer)]; conversation.UpdatedAt = DateTime.UtcNow;
                    s.ChatDrafts.Remove(target.Length == 0 ? "new" : target); if (unsentDraft.Length > 0) s.ChatDrafts[conversation.Id] = unsentDraft; savedId = conversation.Id;
                });
                chatId = savedId; editingLastQuestion = false; if (editBanner is not null) editBanner.Visibility = Visibility.Collapsed; beforeEditDraft = ""; draftTimer.Stop();
                chatMessages.Children.Clear(); foreach (var message in state.Conversations.Find(c => c.Id == chatId)!.Messages) AddMessage(message);
                loading = true;
                try { input!.Text = unsentDraft; if (sessions is not null) { sessions.ItemsSource = state.Conversations.OrderByDescending(c => c.UpdatedAt).ToArray(); sessions.SelectedValue = chatId; } }
                finally { loading = false; }
                if (chatTitle is not null) chatTitle.Text = state.Conversations.Find(c => c.Id == chatId)!.Name;
                chatScroll?.ScrollToEnd(); SetStatus("回答已保存。" + (unsentDraft.Length > 0 ? "未发送的草稿也已保留。" : "可以继续提问。"));
            }
            finally { pendingPanel.Children.Remove(pendingCard); }
        });
    }
    private void RenameChat()
    {
        var chat = state.Conversations.Find(c => c.Id == chatId); if (chat is null) { SetStatus("请先选择一个已保存会话。"); return; }
        var dialog = Dialog("重命名会话", 460, 260); var dock = new DockPanel { Margin = new(20) }; var actions = new WrapPanel();
        var name = Box("会话名称", chat.Name, 60);
        actions.Children.Add(Button("保存", () => { if (name.Text.Trim().Length == 0) { name.ToolTip = "请输入会话名称"; name.Focus(); return; } Cancel(); state = vault.Update(s => s.Conversations.Single(c => c.Id == chat.Id).Name = name.Text.Trim()); dialog.Close(); Navigate("AI 对话"); }, true));
        actions.Children.Add(Button("取消", dialog.Close)); DockPanel.SetDock(actions, Dock.Bottom); dock.Children.Add(actions); dock.Children.Add(Scroll(Field("会话名称", name))); dialog.Content = dock; dialog.ShowDialog();
    }
    private void DeleteChat()
    {
        var chat = state.Conversations.Find(c => c.Id == chatId); if (chat is null) { SetStatus("请先选择一个会话。"); return; }
        if (MessageBox.Show(this, "删除当前会话？本机操作无法撤销。", "删除会话", MessageBoxButton.YesNo) != MessageBoxResult.Yes) return;
        Cancel(); state = vault.Update(s => { s.Conversations.RemoveAll(c => c.Id == chatId); s.ChatDrafts.Remove(chatId); }); editingLastQuestion = false; input = null; chatId = ""; Navigate("AI 对话");
    }
    private void ExportChat()
    {
        var chat = state.Conversations.Find(c => c.Id == chatId); if (chat is null) { SetStatus("请先选择已保存会话。"); return; }
        var dialog = new SaveFileDialog { FileName = "聊商会话.txt", Filter = "纯文本|*.txt|Markdown|*.md", AddExtension = true };
        if (dialog.ShowDialog(this) == true) { File.WriteAllText(dialog.FileName, string.Join("\r\n\r\n", chat.Messages.Select(m => (m.Role == "user" ? "我：" : "AI：") + "\r\n" + m.Content)), new UTF8Encoding(false)); SetStatus("会话已导出，导出的文本请自行保管。"); }
    }
}
