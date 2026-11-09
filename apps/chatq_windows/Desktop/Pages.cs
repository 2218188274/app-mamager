using System.Diagnostics;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;

namespace ChatQ.Windows;

public sealed partial class MainWindow
{
    private void Settings(StackPanel root)
    {
        var row = new WrapPanel();
        var persona = new ComboBox { ItemsSource = state.Personas, DisplayMemberPath = "Name", SelectedValuePath = "Id", SelectedValue = state.PersonaId, MinWidth = 180 };
        var relation = new ComboBox { ItemsSource = Defaults.Relations, SelectedItem = state.Relation };
        var goal = new ComboBox { ItemsSource = Defaults.Goals.Keys, SelectedItem = state.Goal };
        AutomationProperties.SetName(persona, "当前人设"); AutomationProperties.SetName(relation, "聊天关系"); AutomationProperties.SetName(goal, "回复目标");
        persona.SelectionChanged += (_, _) => { if (!loading && persona.SelectedValue is string id) ChangeSettings(s => s.PersonaId = id); };
        relation.SelectionChanged += (_, _) => { if (!loading && relation.SelectedItem is string id) ChangeSettings(s => s.Relation = id); };
        goal.SelectionChanged += (_, _) => { if (!loading && goal.SelectedItem is string id) ChangeSettings(s => s.Goal = id); };
        foreach (var pair in new (string, UIElement)[] { ("当前人设", persona), ("聊天关系", relation), ("回复目标", goal) })
        { var field = Field(pair.Item1, pair.Item2); field.Margin = new(0, 8, 16, 0); row.Children.Add(field); }
        root.Children.Add(row);
    }
    private UIElement ReplyPage()
    {
        var dock = new DockPanel(); var heading = Heading("回复助手", "把难开口的话，说得自然一点。");
        var tabs = new WrapPanel();
        foreach (var item in new[] { ("reply", "帮回复"), ("polish", "润色我的话"), ("topics", "找话题") })
        { var captured = item; tabs.Children.Add(Button(item.Item2, () => { SaveDraft(); input = null; mode = captured.Item1; Navigate("回复助手"); }, mode == item.Item1)); }
        heading.Children.Add(tabs); DockPanel.SetDock(heading, Dock.Top); dock.Children.Add(heading);
        var actions = new WrapPanel { Margin = new(0, 10, 0, 0) };
        actions.Children.Add(TaskButton("粘贴并生成", () => { if (Paste()) _ = GenerateReply(); }, true));
        actions.Children.Add(TaskButton("生成", () => _ = GenerateReply())); actions.Children.Add(TaskButton("停止", Cancel, stop: true));
        var footer = ActionBar(actions); DockPanel.SetDock(footer, Dock.Bottom); dock.Children.Add(footer);
        var editor = Stack(); editor.Children.Add(Text(mode == "polish" ? "我想表达的话" : mode == "topics" ? "聊天背景或兴趣" : "对方的消息", 15, true));
        string draft = DateTime.UtcNow - state.DraftUpdatedAt < TimeSpan.FromDays(7) ? mode switch { "polish" => state.PolishDraft, "topics" => state.TopicDraft, _ => state.ReplyDraft } : "";
        input = Box("生成内容", draft, 1000, true); input.MinHeight = 150; editor.Children.Add(input);
        var details = Text(mode == "polish" ? "保持你的原意，让表达更顺畅。" : mode == "topics" ? "写下对方的兴趣、你们的关系或想聊的方向。" : "粘贴对方的话，或直接输入需要回复的内容。", 12); details.Foreground = Muted; editor.Children.Add(details);
        var utility = new WrapPanel();utility.Children.Add(AuxiliaryButton(input)); utility.Children.Add(Button("清空内容", () => { input.Text = ""; SaveDraft(); }));
        var length = Text($"{input.Text.Length} / 1000", 12); length.VerticalAlignment = VerticalAlignment.Center; utility.Children.Add(length); editor.Children.Add(utility);
        input.TextChanged += (_, _) =>
        {
            length.Text = $"{input.Text.Length} / 1000";
            if (!loading) { Cancel(); replyResults.Children.Clear(); replyResults.Children.Add(EmptyState("准备好新的回复", "内容已更新，点击下方按钮生成。")); draftTimer.Stop(); draftTimer.Start(); }
        };
        var preferences = Stack(); Settings(preferences);
        var count = new ComboBox { ItemsSource = Enumerable.Range(1, 10), SelectedItem = state.ReplyCount, Width = 120 }; AutomationProperties.SetName(count, "回复条数");
        count.SelectionChanged += (_, _) => { if (!loading && count.SelectedItem is int value) ChangeSettings(s => s.ReplyCount = value); };
        preferences.Children.Add(Field("回复条数", count));
        var preferencePane = new Expander { Header = "回复偏好 · " + (state.ActivePersona?.Name ?? "自然真诚"), Content = preferences };
        preferenceSummaryChanged = () => preferencePane.Header = "回复偏好 · " + (state.ActivePersona?.Name ?? "自然真诚") + " · " + state.ReplyCount + "条";
        AutomationProperties.SetName(preferencePane, "回复偏好"); editor.Children.Add(preferencePane);
        var editorCard = Card(editor); editorCard.VerticalAlignment = VerticalAlignment.Top; editorCard.Tag = "reply-editor";
        replyResults = Stack(); replyResults.Children.Add(EmptyState("好回复，从这里开始", "生成的建议会显示在这里。选择一条复制，也可以继续润色。"));
        if (state.ActiveProfile is null) replyResults.Children.Add(Button("先配置我的 API",()=>navigation.SelectedItem="我的 API",true));
        var workspace = new Grid(); workspace.ColumnDefinitions.Add(new()); workspace.ColumnDefinitions.Add(new()); workspace.RowDefinitions.Add(new() { Height = GridLength.Auto }); workspace.RowDefinitions.Add(new() { Height = GridLength.Auto });
        workspace.Children.Add(editorCard); workspace.Children.Add(replyResults);
        void Reflow()
        {
            bool wide = workspace.ActualWidth >= 760 && textScale <= 1.5;
            workspace.ColumnDefinitions[0].Width = wide ? new(1, GridUnitType.Star) : new(1, GridUnitType.Star);
            workspace.ColumnDefinitions[1].Width = wide ? new(1.08, GridUnitType.Star) : new(0);
            Grid.SetColumn(replyResults, wide ? 1 : 0); Grid.SetRow(replyResults, wide ? 0 : 1);
            editorCard.Margin = wide ? new(0, 0, 18, 12) : new(0, 0, 0, 12);
        }
        workspace.SizeChanged += (_, _) => Reflow(); Reflow();
        replyScroll = Scroll(workspace); dock.Children.Add(replyScroll); return dock;
    }
    private UIElement ApiPage()
    {
        var dock = new DockPanel(); var heading = Heading("我的 API", "连接你自己的模型，配置由当前 Windows 账号加密保存。"); DockPanel.SetDock(heading, Dock.Top); dock.Children.Add(heading);
        var selected = state.ActiveProfile; string editingId = selected?.Id ?? Guid.NewGuid().ToString("N");
        var form = Stack();
        var list = new ComboBox { ItemsSource = state.Profiles, DisplayMemberPath = "Name", SelectedValuePath = "Id", SelectedValue = state.ProfileId };
        AutomationProperties.SetName(list, "API 配置列表");
        list.SelectionChanged += (_, _) => { if (!loading && list.SelectedValue is string id) { ChangeSettings(s => s.ProfileId = id); Navigate("我的 API"); } };
        var savedField = Field("已保存的配置", list);
        var name = Box("配置名称", selected?.Name ?? "我的 API", 30); var address = Box("API 基础地址", selected?.BaseUrl ?? "", 2048); var model = Box("模型名称", selected?.Model ?? "", 200);
        var key = new PasswordBox(); AutomationProperties.SetName(key, "API 密钥"); InputMethod.SetIsInputMethodEnabled(address, false); InputMethod.SetIsInputMethodEnabled(model, false);
        var naming = new Grid(); naming.ColumnDefinitions.Add(new()); naming.ColumnDefinitions.Add(new()); naming.RowDefinitions.Add(new() { Height = GridLength.Auto }); naming.RowDefinitions.Add(new() { Height = GridLength.Auto });
        var nameField = Field("配置名称", name); naming.Children.Add(savedField); naming.Children.Add(nameField);
        naming.SizeChanged += (_, _) => { bool wide = naming.ActualWidth >= 720 && textScale <= 1.5; naming.ColumnDefinitions[1].Width = wide ? new(1,GridUnitType.Star) : new(0); Grid.SetColumn(nameField,wide ? 1 : 0); Grid.SetRow(nameField,wide ? 0 : 1); savedField.Margin = wide ? new(0,0,18,8) : new(0,0,0,8); };
        form.Children.Add(naming); form.Children.Add(Field("API 基础地址", address, "例如 https://服务商地址/v1，使用兼容 OpenAI 的接口。"));
        form.Children.Add(Field("API 密钥", key, "原配置和原地址下留空可保留密钥；新建或更换地址时请重新填写。"));
        form.Children.Add(Field("模型名称", model, "可直接填写模型 ID，或主动获取模型列表。"));
        ApiProfile DraftProfile(bool forModels = false)
        {
            string secret = key.Password;
            var previous = state.Profiles.Find(p => p.Id == editingId);
            if (secret.Length == 0 && previous is not null && previous.BaseUrl == address.Text.Trim().TrimEnd('/')) secret = previous.Key;
            return Validation.Profile(new(editingId, name.Text, address.Text, forModels && model.Text.Trim().Length == 0 ? "model-list" : model.Text, secret));
        }
        var streaming = new CheckBox { Content = "AI 对话使用流式回复", IsChecked = selected?.Stream ?? true, MinHeight = 42, Margin = new(0, 4, 0, 14) }; form.Children.Add(streaming);
        var speechModel=Box("语音模型",selected?.SpeechModel??"whisper-1",200);form.Children.Add(new Expander {Header="语音转写设置",Content=Field("语音模型",speechModel,"当前供应商需要支持 /audio/transcriptions；识别前由你主动确认。")});
        var actions = new WrapPanel();
        var delete = Button("删除当前配置", () =>
        {
            var previous = state.Profiles.Find(p => p.Id == editingId); if (previous is null) return;
            if (MessageBox.Show(this, "删除配置“" + previous.Name + "”？", "删除配置", MessageBoxButton.YesNo) != MessageBoxResult.Yes) return;
            ChangeSettings(s => { s.Profiles.RemoveAll(p => p.Id == editingId); s.ProfileId = s.Profiles.FirstOrDefault()?.Id ?? ""; }); Navigate("我的 API");
        }); delete.IsEnabled = selected is not null;
        var minimax=Stack();minimax.Children.Add(Text("使用OpenAI兼容接口。填入地址和模型后，请在下方输入自己的Key，再保存并启用。M Plan订阅Key与按量Key的额度和权限不同。",12));
        minimax.Children.Add(Button("填入 MiniMax",()=>
        {
            if(state.Profiles.Count>=8)throw new InvalidOperationException("最多保存8套API配置，请先整理不需要的配置。");
            PauseHubForSettings();Cancel();loading=true;
            try{list.SelectedIndex=-1;editingId=Guid.NewGuid().ToString("N");name.Text="MiniMax";address.Text=ProviderCompatibility.MinimaxAddress;model.Text=ProviderCompatibility.MinimaxModel;speechModel.Text="whisper-1";key.Clear();streaming.IsChecked=true;delete.IsEnabled=false;}
            finally{loading=false;}
            SetStatus("已填入MiniMax官方地址与模型。请填写Key并保存；尚未联网或修改原配置。M3.1 Flash使用低思考深度以便日常聊天。");
        }));form.Children.Add(new Expander{Header="MiniMax 快速配置",Content=minimax});
        actions.Children.Add(Button("保存并启用", () => { PauseHubForSettings(); Cancel(); state = vault.SaveProfile(new(editingId, name.Text, address.Text, model.Text, key.Password, streaming.IsChecked == true,speechModel.Text)); key.Clear(); Navigate("我的 API"); SetStatus("已保存并启用，可以开始生成。"); }, true));
        actions.Children.Add(Button("新增配置", () =>
        {
            Cancel(); loading = true; list.SelectedIndex = -1; editingId = Guid.NewGuid().ToString("N"); name.Text = "新的 API"; address.Text = ""; model.Text = "";speechModel.Text="whisper-1"; key.Clear(); streaming.IsChecked = true; delete.IsEnabled = false; loading = false;
            SetStatus("正在新建配置，填写后点击“保存并启用”。");
        }));
        var footer = ActionBar(actions); DockPanel.SetDock(footer, Dock.Bottom); dock.Children.Add(footer);
        var tools = new WrapPanel();
        tools.Children.Add(TaskButton("获取模型列表", () => _ = Operate(async (token, view, revision) =>
        {
            var draft = DraftProfile(true); SetStatus("正在获取模型列表…"); var models = await ai.Models(draft, token); Guard(token, view, revision);
            if (models.Length == 0) throw new InvalidOperationException("供应商没有返回可用模型，请手动填写模型名称。");
            var chooser = Dialog("选择模型", 520, 580); var pane = new DockPanel { Margin = new(20) }; var top = Stack(); var search = Box("搜索模型", "", 200); top.Children.Add(search); DockPanel.SetDock(top, Dock.Top); pane.Children.Add(top);
            var items = new ListBox { ItemsSource = models }; AutomationProperties.SetName(items, "模型列表"); search.TextChanged += (_, _) => items.ItemsSource = models.Where(m => m.Contains(search.Text, StringComparison.OrdinalIgnoreCase)).ToArray();
            var use = Button("使用选中模型", () => { if (items.SelectedItem is string item) { model.Text = item; chooser.Close(); SetStatus("模型已填入，保存后生效。"); } }, true);
            DockPanel.SetDock(use, Dock.Bottom); pane.Children.Add(use); pane.Children.Add(items); chooser.Content = pane; chooser.ShowDialog();
        })));
        tools.Children.Add(TaskButton("测试当前填写的配置", () => _ = Operate(async (token, view, revision) =>
        { var draft = DraftProfile(); SetStatus("正在测试，会主动调用你填写的供应商…"); _ = await ai.Complete(draft, [new("user", "请只回复：连接成功")], false, null, token); Guard(token, view, revision); SetStatus("当前填写的配置连接成功。未保存的修改仍需点击保存。"); })));
        tools.Children.Add(TaskButton("停止", Cancel, stop: true)); form.Children.Add(tools);
        form.Children.Add(new Expander { Header = "管理配置", Content = delete });
        foreach (var box in new[] { name, address, model,speechModel }) box.TextChanged += (_, _) => { if (!loading) { Cancel(); SetStatus("配置有修改，保存后用于日常生成。"); } };
        key.PasswordChanged += (_, _) => { if (!loading) { Cancel(); SetStatus("密钥有修改，保存后生效。"); } };
        dock.Children.Add(Scroll(Card(form))); return dock;
    }
    private UIElement PersonaPage()
    {
        var dock = new DockPanel(); var top = Heading("人设中心", "选择一种舒服的表达方式，用在回复和 AI 对话中。"); var create = Button("创建人设 / AI 生成", () => EditPersona(null), true); create.HorizontalAlignment = HorizontalAlignment.Left; top.Children.Add(create); DockPanel.SetDock(top, Dock.Top); dock.Children.Add(top);
        var cards = new WrapPanel();
        foreach (var persona in state.Personas)
        {
            var selected = persona; bool active = persona.Id == state.PersonaId; var card = Stack();
            var tag = Text(active ? "● 当前使用" : "○ 可切换", 12, true); tag.Foreground = active ? Accent : Muted; card.Children.Add(tag);
            card.Children.Add(Text(persona.Name, 18, true));
            var summary = Text(persona.Instructions, 14); summary.MaxHeight = 84 * textScale; summary.TextTrimming = TextTrimming.CharacterEllipsis; card.Children.Add(summary);
            if (persona.Example.Length > 0) { var sample = Text("“" + persona.Example + "”", 13); sample.Foreground = Muted; card.Children.Add(sample); }
            var actions = new WrapPanel(); var choose = Button(active ? "正在使用" : "使用人设", () => { ChangeSettings(s => s.PersonaId = selected.Id); Navigate("人设中心"); }, !active); choose.IsEnabled = !active; actions.Children.Add(choose);
            actions.Children.Add(Button("编辑", () => EditPersona(selected)));
            var remove = Button("删除人设", () => { if (state.Personas.Count <= 1) throw new InvalidOperationException("请至少保留一个人设。"); if (MessageBox.Show(this, "删除人设“" + selected.Name + "”？", "删除人设", MessageBoxButton.YesNo) != MessageBoxResult.Yes) return; ChangeSettings(s => { s.Personas.RemoveAll(p => p.Id == selected.Id); if (s.PersonaId == selected.Id) s.PersonaId = s.Personas[0].Id; }); Navigate("人设中心"); });
            card.Children.Add(actions); card.Children.Add(new Expander { Header = "更多", Content = remove });
            var frame = Card(card); if (active) frame.BorderBrush = Accent; cards.Children.Add(frame);
        }
        cards.SizeChanged += (_, _) => { int columns = cards.ActualWidth >= 720 && textScale <= 1.5 ? 2 : 1; foreach (Border frame in cards.Children) { frame.Width = Math.Max(100, (cards.ActualWidth - (columns == 2 ? 14 : 0)) / columns); frame.Margin = new(0, 0, columns == 2 ? 7 : 0, 14); } };
        dock.Children.Add(Scroll(cards)); return dock;
    }
    private void EditPersona(Persona? persona) => BuildPersonaDialog(persona).ShowDialog();
    private Window BuildPersonaDialog(Persona? persona)
    {
        var dialog = Dialog(persona is null ? "创建人设" : "编辑人设"); bool closed = false, filling = false;
        var dock = new DockPanel { Margin = new(20) }; var form = Stack();
        var feedback = Text("先描述需求，让 AI 生成草稿；也可以直接手动填写。", 12); dialogStatus = feedback;
        var bottom = Stack(); bottom.Children.Add(feedback); DockPanel.SetDock(bottom, Dock.Bottom); dock.Children.Add(bottom);
        var requirements = Box("人设需求", "", 500, true); requirements.MinHeight = 80;
        var name = Box("人设名称", persona?.Name ?? "", 20); var instructions = Box("说话习惯", persona?.Instructions ?? "", 500, true); var example = Box("示例回复", persona?.Example ?? "", 120, true); example.MinHeight = 60;
        form.Children.Add(Field("告诉 AI，你希望怎样表达", requirements));
        form.Children.Add(TaskButton("AI 生成人设草稿", () => _ = Operate(async (token, view, revision) =>
        {
            if (requirements.Text.Trim().Length == 0) throw new InvalidOperationException("请先描述你想要的人设。");
            SetStatus("正在生成人设草稿…");
            string raw = await ai.Complete(state.ActiveProfile ?? throw new InvalidOperationException("请先在“我的 API”配置模型。"),
                [new("system", "根据用户需求生成人设卡，只返回JSON：{\"name\":\"20字内名称\",\"instructions\":\"500字内说话习惯\",\"example\":\"120字内示例\"}。不编造真实个人身份。"), new("user", requirements.Text.Trim())], false, null, token);
            Guard(token, view, revision); if (closed) return;
            var generated = PersonalAi.ParsePersona(raw); filling = true;
            try { name.Text = generated.Name; instructions.Text = generated.Instructions; example.Text = generated.Example; } finally { filling = false; }
            SetStatus("草稿已生成，检查后点击保存人设。");
        })));
        foreach (var pair in new[] { ("名称", name), ("说话习惯", instructions), ("示例（选填）", example) }) form.Children.Add(Field(pair.Item1, pair.Item2));
        foreach (var box in new[] { requirements, name, instructions, example }) box.TextChanged += (_, _) => { if (!filling) Cancel(); };
        var actions = new WrapPanel(); actions.Children.Add(Button("保存人设", () =>
        {
            string n = name.Text.Trim(), i = instructions.Text.Trim(); if (n.Length == 0 || i.Length == 0) throw new InvalidOperationException("请填写名称和说话习惯。");
            ChangeSettings(s => { if (persona is null && s.Personas.Count >= 30) throw new InvalidOperationException("最多保存30个人设。"); string id = persona?.Id ?? Guid.NewGuid().ToString("N"); s.Personas.RemoveAll(p => p.Id == id); s.Personas.Add(new(id, n, i, example.Text.Trim())); s.PersonaId = id; });
            dialog.Close(); Navigate("人设中心");
        }, true)); actions.Children.Add(TaskButton("停止", Cancel, stop: true)); actions.Children.Add(Button("取消", dialog.Close)); bottom.Children.Add(actions);
        dialog.Closed += (_, _) => { closed = true; Cancel(); if (ReferenceEquals(dialogStatus, feedback)) dialogStatus = null; }; dock.Children.Add(Scroll(form)); dialog.Content = dock; return dialog;
    }
    private UIElement ChatPage()
    {
        var dock = new DockPanel();
        var header = Stack(); if(textScale<=1.5) header.Children.Add(Text("AI 对话", 23, true)); chatTitle = Text(state.Conversations.Find(c => c.Id == chatId)?.Name ?? "新对话", 13); chatTitle.Foreground = Muted; chatTitle.TextTrimming = TextTrimming.CharacterEllipsis; chatTitle.MaxHeight = 42 * textScale; header.Children.Add(chatTitle);
        var management = Stack(); var row = new WrapPanel(); row.Children.Add(Button("新对话", () => SwitchChat(""), true)); row.Children.Add(Button("重命名", RenameChat)); row.Children.Add(Button("导出文本", ExportChat)); row.Children.Add(Button("删除会话", DeleteChat)); management.Children.Add(row);
        var search = Box("搜索会话", "", 100); management.Children.Add(search);
        sessions = new ListBox { Height = 150, ItemsSource = state.Conversations.OrderByDescending(c => c.UpdatedAt).ToArray(), DisplayMemberPath = "Name", SelectedValuePath = "Id", SelectedValue = chatId };
        AutomationProperties.SetName(sessions, "会话列表");
        search.TextChanged += (_, _) => { bool old = loading; loading = true; sessions.ItemsSource = state.Conversations.Where(c => c.Name.Contains(search.Text, StringComparison.OrdinalIgnoreCase) || c.Messages.Any(m => m.Content.Contains(search.Text, StringComparison.OrdinalIgnoreCase))).OrderByDescending(c => c.UpdatedAt).ToArray(); sessions.SelectedValue = chatId; loading = old; };
        sessions.SelectionChanged += (_, _) => { if (!loading && sessions.SelectedValue is string id && id != chatId) SwitchChat(id); }; management.Children.Add(sessions); Settings(management);
        var managerScroll = Scroll(management); managerScroll.MaxHeight = 280; header.Children.Add(new Expander { Header = "会话与人设偏好", Content = managerScroll }); DockPanel.SetDock(header, Dock.Top); dock.Children.Add(header);
        var composer = Stack(); string draftKey = chatId.Length == 0 ? "new" : chatId;
        var editTools = new WrapPanel(); var editingLabel = Text("正在编辑上一问",12,true); editingLabel.VerticalAlignment=VerticalAlignment.Center; editTools.Children.Add(editingLabel); editTools.Children.Add(Button("取消编辑",()=>{RestoreBeforeEdit(); SetStatus("已取消编辑，原草稿已恢复。");}));
        editBanner = new Border { Child=editTools, Background=Soft, Padding=new(10,6,4,0), CornerRadius=new(10), Visibility=Visibility.Collapsed }; composer.Children.Add(editBanner);
        input = Box("聊天问题", state.ChatDrafts.GetValueOrDefault(draftKey) ?? "", 2000, true); input.MinHeight = 64; input.MaxHeight = 110;
        input.TextChanged += (_, _) => { if (!loading) { Cancel(); draftTimer.Stop(); draftTimer.Start(); } }; composer.Children.Add(input);
        var actions = new WrapPanel(); actions.Children.Add(TaskButton("发送问题", () => _ = SendChat(false), true)); actions.Children.Add(TaskButton("停止", Cancel, stop: true));
        actions.Children.Add(AuxiliaryButton(input));
        var extra = new ContextMenu();
        foreach (var pair in new (string, Action)[] { ("重新回答", () => _ = SendChat(true)), ("编辑上一问", BeginEditQuestion), ("取消编辑", () => { RestoreBeforeEdit(); SetStatus("已取消编辑，恢复未发送的草稿。"); }) })
        { var menu = new MenuItem { Header = pair.Item1 }; var action = pair.Item2; menu.Click += (_, _) => { try { action(); } catch (Exception error) { SetStatus(SafeError(error),true); } }; extra.Items.Add(menu); }
        var more = Button("更多操作", () => { extra.IsOpen = true; }); more.ContextMenu = extra; extra.PlacementTarget = more; actions.Children.Add(more); composer.Children.Add(actions);
        DockPanel.SetDock(composer, Dock.Bottom); dock.Children.Add(composer);
        chatMessages = Stack(); var history = state.Conversations.Find(c => c.Id == chatId)?.Messages ?? [];
        if (history.Count == 0) chatMessages.Children.Add(EmptyState("想聊点什么？", "写下问题，聊商会结合当前人设连续回答。Ctrl + Enter 发送，Enter 换行。")); else foreach (var message in history) AddMessage(message);
        chatScroll = Scroll(chatMessages); dock.Children.Add(chatScroll); return dock;
    }
    private UIElement KeyboardPage()
    {
        var root = Stack(); root.Children.Add(Heading("聊商输入法", "系统拼音输入，配合桌面 AI 助手使用。"));
        var start = Stack(); start.Children.Add(Text("快速开始", 18, true)); start.Children.Add(Text("1. 安装完整版，选择系统输入法。\n2. 按 Win + 空格，切换到“聊商拼音”。\n3. 点击候选栏 AI，在输入法内粘贴生成、复制或填入。")); start.Children.Add(Button("打开 Windows 语言和键盘设置", () => Process.Start(new ProcessStartInfo("ms-settings:regionlanguage") { UseShellExecute = true }), true)); root.Children.Add(Card(start));
        var shortcuts = Stack(); shortcuts.Children.Add(Text("常用快捷键", 18, true)); shortcuts.Children.Add(Text("空格 / 1–5　选择候选\n左右键　切换候选\nPage Up / Down　翻页\n退格　删除拼音\nEsc　取消拼音\nEnter　确认原始拼音\n单按 Shift　切换中英\nCtrl + 空格　松开空格后切换中英\nCtrl + Shift + 空格　打开输入法快捷回复\n右键中英状态　打开快捷回复\n其余 Shift 组合键保留应用操作")); root.Children.Add(Card(shortcuts));
        root.Children.Add(Text(HotkeyAvailable ? "Ctrl + Alt + Q 已启用，应用运行时可随时唤出。" : "Ctrl + Alt + Q 未启用或被占用，可从任务栏打开聊商。", 13));
        root.Children.Add(new Expander { Header = "版本与安装说明", Content = Text("Windows "+typeof(MainWindow).Assembly.GetName().Version!.ToString(3)+" 预览版。完整安装需要管理员确认；便携版仅含桌面助手。输入法列表未刷新时，可退出登录后重进。正式签名、第三方软件兼容和长期输入体验仍需验收。", 13) }); return Scroll(root);
    }
}
