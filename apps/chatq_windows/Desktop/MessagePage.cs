using System.IO;
using System.Diagnostics;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Media;
using Microsoft.Win32;

namespace ChatQ.Windows;

public sealed partial class MainWindow
{
    private HubStore hubStore=null!;
    private MessageHub hub=null!;
    private Action? hubRefresh;
    private int hubTab;
    private string hubSelection="";
    private readonly Dictionary<string,string> hubEdits=[];
    private CheckBox? hubAutomaticStartControl;
    private TextBlock? hubAutomaticStartDetail;
    private void InitializeHub()
    {
        hubStore=new(vault.DirectoryPath);
        hub=new(hubStore,vault.Read,(profile,messages,token)=>ai.Complete(profile,messages,false,null,token));
        hub.Changed+=()=> {if(!Dispatcher.HasShutdownStarted)Dispatcher.BeginInvoke(()=> {try{hubRefresh?.Invoke();RefreshHubIndicator();}catch{hubRefresh=null;if(hub.Active)hub.Stop("消息数据无法读取或保存，已暂停");RefreshHubIndicator();SetStatus("消息助手数据暂时无法读取，原文件已保留；连接已暂停。",true);}});};
        Loaded+=async(_,_)=>{try{if(HubAutomatic.Inspect(hubStore.Read(),vault.Read()).Status=="ready")await StartHub(automatic:true);}catch{SetStatus("自动开始未完成，消息助手保持暂停；本机原数据已保留。",true);}};
    }
    private void PauseHubForSettings(){if(hub.Active)hub.Stop("API、人设或数据有变化，消息助手已暂停；请检查后重新连接");}
    private void PauseHubManually()
    {
        hub.Stop();var policy=hubStore.Update(HubAutomatic.Disable);
        if(hubAutomaticStartControl is not null)hubAutomaticStartControl.IsChecked=false;
        if(hubAutomaticStartDetail is not null)hubAutomaticStartDetail.Text=HubAutomatic.Inspect(policy,vault.Read()).Detail;
        SetStatus("已暂停，打开软件自动开始也已关闭。");
    }
    private async Task StartHub(bool automatic=false)
    {
        try
        {
            var policy=hubStore.Read();var user=vault.Read();
            if(automatic && HubAutomatic.Inspect(policy,user).Status!="ready")return;
            CheckHubBeforeStart(HubReadiness.Inspect(user,policy));var rules=policy.Rules.Where(r=>r.Platform==policy.Connection.Platform && r.Account==policy.Connection.Account && !r.Paused).ToArray();
            string platform=policy.Connection.Platform=="qq"?"QQ":"微信";
            string prompt=$"连接 {platform} 账号：{policy.Connection.Account}\n仅处理你添加的 {rules.Length} 位好友的新文本消息。\n确认模式：AI 生成后由你核对发送；自动模式：按规则直接提交。\n本次连接会主动调用你指定的 API，费用由供应商计收。每日上限：{policy.DailyRequestLimit} 次生成尝试 / {policy.DailySendLimit} 次发送尝试。\n切换聊商页面会继续运行，暂停、退出或锁屏会停止。\n请确认当前登录账号和唯一好友备注正确。";
            if(rules.Length==0)throw new InvalidOperationException("请先在“连接与额度”保存连接，再到“指定好友”添加会话。");
            if(!automatic && MessageBox.Show(this,prompt,"连接消息助手",MessageBoxButton.YesNo,MessageBoxImage.Question)!=MessageBoxResult.Yes)return;
            await hub.Start(policy.Connection.Platform=="qq"?new OneBotTransport():new WechatTransport(),automatic?policy.AutoStartScope:null);
            SetStatus(hub.Status);
        }
        catch(Exception error){SetStatus("消息助手未连接："+SafeError(error),true);}
        finally{hubRefresh?.Invoke();RefreshHubIndicator();}
    }
    private UIElement MessagePage()
    {
        var dock=new DockPanel();var top=Heading("消息助手","指定好友按人设自动回复；自动模式无需逐条确认。");
        var picker=new ComboBox {ItemsSource=new[]{"待处理消息","指定好友","连接与额度"},SelectedIndex=hubTab};AutomationProperties.SetName(picker,"消息助手版块");top.Children.Add(picker);DockPanel.SetDock(top,Dock.Top);dock.Children.Add(top);
        var main=new ContentControl();
        var bottom=Stack();var running=Text("",12,true);running.Foreground=Muted;running.MaxHeight=24*textScale;running.TextTrimming=TextTrimming.CharacterEllipsis;bottom.Children.Add(running);
        var actions=new WrapPanel();var start=Button("连接并开始",()=>_=StartHub(),true);var stop=Button("立即暂停",PauseHubManually);actions.Children.Add(start);actions.Children.Add(stop);bottom.Children.Add(actions);
        var footer=ActionBar(bottom);DockPanel.SetDock(footer,Dock.Bottom);dock.Children.Add(footer);dock.Children.Add(main);
        Action? innerRefresh=null;
        void StatusRefresh(){running.Text=hub.Status;running.ToolTip=hub.Status;start.IsEnabled=!hub.Active&&HubReadiness.Inspect(vault.Read(),hubStore.Read()).CanAttempt;start.Visibility=hub.Active?Visibility.Collapsed:Visibility.Visible;stop.IsEnabled=hub.Active;stop.Visibility=hub.Active?Visibility.Visible:Visibility.Collapsed;footer.Visibility=hubTab==0||hub.Active?Visibility.Visible:Visibility.Collapsed;innerRefresh?.Invoke();}
        void Build()
        {
            hubTab=picker.SelectedIndex;
            hubAutomaticStartControl=null;hubAutomaticStartDetail=null;
            main.Content=hubTab switch {1=>HubRules(),2=>HubSettings(),_=>HubInbox(out innerRefresh)};
            if(hubTab!=0)innerRefresh=null;
            StatusRefresh();
        }
        picker.SelectionChanged+=(_,_)=>Build();Build();hubRefresh=StatusRefresh;return dock;
    }
    private UIElement HubInbox(out Action refresh)
    {
        var dock=new DockPanel();var list=new ComboBox {DisplayMemberPath="Label",SelectedValuePath="Id"};AutomationProperties.SetName(list,"消息助手会话消息");DockPanel.SetDock(list,Dock.Top);dock.Children.Add(list);
        var sticky=new WrapPanel {Margin=new(0,8,0,0)};DockPanel.SetDock(sticky,Dock.Bottom);dock.Children.Add(sticky);
        var pane=new ContentControl();dock.Children.Add(Scroll(pane));bool filling=false;string signature="";
        void Refresh()
        {
            var policy=hubStore.Read();filling=true;
            var rows=policy.Items.OrderByDescending(i=>i.UpdatedAt).Select(i=>new HubRow(i.Id,(policy.Rules.Find(r=>r.Id==i.RuleId)?.Name??"已移除好友")+" · "+HubLabel(i.Status))).ToArray();
            if(!rows.Any(r=>r.Id==hubSelection))hubSelection=rows.FirstOrDefault()?.Id??"";
            list.ItemsSource=rows;list.SelectedValue=hubSelection;list.Visibility=rows.Length==0?Visibility.Collapsed:Visibility.Visible;filling=false;
            var selected=policy.Items.Find(i=>i.Id==hubSelection);
            if(selected is null){sticky.Children.Clear();pane.Content=hub.Active?EmptyState(hub.Running?"已连接，等待指定好友的新消息":"正在连接…","只处理连接后到达的新文本，不补发历史。可随时暂停，首次请用确认模式核对实际发送对象。"):FirstHubSetup(policy,sticky);return;}
            var rule=policy.Rules.Find(r=>r.Id==selected.RuleId);
            string current=selected.Id+selected.Status+selected.Reply+selected.Notice+hub.Active+hub.Running+rule?.Mode+rule?.Paused;
            if(signature==current)return;signature=current;
            sticky.Children.Clear();var body=Stack();
            var modeHint=Text(rule?.Mode=="auto"?"自动模式 · 合并连续消息后直接回复，无需逐条确认":"确认模式 · 生成回复后由你核对发送",12,true);AutomationProperties.SetName(modeHint,"当前好友回复方式");body.Children.Add(modeHint);
            string detail=!hub.Active&&selected.Status is "received" or "generating"?"已暂停，本条不会自动继续；重新连接也不会补发旧消息。":rule?.Paused==true&&selected.Status=="interrupted"?"此好友已人工接管，不会继续自动回复。":selected.Notice;
            var notice=Text(detail,12);notice.Foreground=Muted;body.Children.Add(notice);var original=Box("好友的新消息",selected.Source.Text,2000,true);original.IsReadOnly=true;original.MinHeight=65;
            var source=Stack();source.Children.Add(Text("对方消息",12,true));var preview=Text(selected.Source.Text,14);preview.MaxHeight=44*textScale;preview.TextTrimming=TextTrimming.CharacterEllipsis;source.Children.Add(preview);source.Children.Add(new Expander {Header="查看完整消息",Content=original});body.Children.Add(Card(source));
            bool review=rule?.Mode!="auto" || selected.Notice.Contains("转人工词");
            var draft=Box("待确认回复",hubEdits.GetValueOrDefault(selected.Id)??selected.Reply,1000,true);draft.MinHeight=90;draft.IsReadOnly=selected.Status!="ready" || !review;
            draft.TextChanged+=(_,_)=>hubEdits[selected.Id]=draft.Text;body.Children.Add(Card(Field("回复内容",draft,review?"核对内容后可发送；提交结果以原聊天软件为准。":"此好友按自动规则处理，无需点击确认；可随时暂停。")));
            var actions=new WrapPanel();var send=Button("确认发送",()=>_=HubAction(()=>hub.Approve(selected.Id,draft.Text)),true);send.IsEnabled=review && hub.Running && selected.Status=="ready" && rule is {Paused:false};send.Visibility=review?Visibility.Visible:Visibility.Collapsed;sticky.Children.Add(send);sticky.Children.Add(Button("人工接管",()=>hub.PauseRule(selected.RuleId)));
            var regenerate=Button(selected.Reply.Length==0?"生成回复":"重新生成",()=>{hubEdits.Remove(selected.Id);_=HubAction(()=>hub.Generate(selected.Id));});regenerate.IsEnabled=hub.Running && selected.Status is "received" or "ready" or "failed";actions.Children.Add(regenerate);
            var copy=Button("复制回复",()=>Copy(draft.Text));copy.IsEnabled=draft.Text.Length>0;actions.Children.Add(copy);body.Children.Add(actions);
            if(selected.Status=="unknown")body.Children.Add(Text("请先在原聊天软件核对。该条不提供重发，避免结果不明时重复发送。",13));
            body.Children.Add(new Expander {Header="记录与隐私",Content=Text("仅指定好友的新文本进入本机加密记录，最多80条；会话上下文分别保存。连接令牌不发送给 AI。当前通用 .cqb 备份不包含代回复队列、上下文和连接配置。",12)});pane.Content=body;
        }
        list.SelectionChanged+=(_,_)=>{if(!filling){hubSelection=list.SelectedValue as string??"";signature="";Refresh();}};
        refresh=Refresh;Refresh();return dock;
    }
    private async Task HubAction(Func<Task> action)
    {try{await action();}catch(Exception error){SetStatus(SafeError(error),true);}finally{hubRefresh?.Invoke();}}
    private static string HubLabel(string value)=>value switch {"received"=>"待生成","generating"=>"生成中","ready"=>"待确认","sending"=>"提交中","sent"=>"已提交","unknown"=>"请核对发送结果","failed"=>"生成失败","obsolete"=>"旧回复已失效",_=>"已中止"};
    private sealed record HubRow(string Id,string Label);
    private UIElement HubRules()
    {
        var body=Stack();var policy=hubStore.Read();body.Children.Add(Text("指定好友",18,true));body.Children.Add(Text("只处理添加的好友私聊。QQ 填准确号码，微信使用唯一备注名；群聊和图片等消息暂不处理。",13));body.Children.Add(Button("添加好友",()=>BuildHubRuleDialog(null).ShowDialog(),true));
        int activeCount=policy.Rules.Count(r=>r.Platform==policy.Connection.Platform && r.Account==policy.Connection.Account && !r.Paused);
        if(activeCount>0)body.Children.Add(Button($"将当前{activeCount}位好友设为全自动",()=>
        {
            hub.Stop();hubStore.Update(HubAutomatic.SetCurrentFriendsAutomatic);
            Navigate("消息助手");SetStatus("当前账号启用的好友已设为自动回复；暂停好友保持暂停。连接后无需逐条确认。");
        }));
        foreach(var rule in policy.Rules)
        {
            var selected=rule;var card=Stack();card.Children.Add(Text(rule.Name,17,true));card.Children.Add(Text((rule.Platform=="qq"?"QQ":"微信")+" · "+rule.Peer+" · "+(rule.Paused?"已人工接管":rule.Mode=="auto"?"自动回复":"确认回复"),13));
            card.Children.Add(Text("人设："+(state.Personas.Find(p=>p.Id==rule.PersonaId)?.Name??"已删除，请重新选择")+"　API："+(state.Profiles.Find(p=>p.Id==rule.ProfileId)?.Name??"已删除，请重新选择"),12));
            var actions=new WrapPanel();actions.Children.Add(Button("编辑",()=>BuildHubRuleDialog(selected).ShowDialog()));
            actions.Children.Add(Button(rule.Paused?"恢复此会话":"人工接管",()=>{if(rule.Paused){hub.Stop();hubStore.Update(s=>{int at=s.Rules.FindIndex(r=>r.Id==rule.Id);s.Rules[at]=s.Rules[at] with {Paused=false};s.Revision=Guid.NewGuid().ToString("N");});Navigate("消息助手");SetStatus("会话已恢复，请主动重新连接。");}else{hub.PauseRule(rule.Id);Navigate("消息助手");}}));card.Children.Add(actions);
            var more=Stack();more.Children.Add(Text($"AI上下文：{policy.Contexts.GetValueOrDefault(rule.Id)?.Count??0}/20条已确认提交的消息。重置后从新消息开始。",12));
            more.Children.Add(Button("重置此好友的AI上下文",()=>BuildHubContextResetDialog(selected).ShowDialog()));
            more.Children.Add(Button("移除好友与此会话记录",()=>{if(MessageBox.Show(this,"移除该好友及消息助手中的上下文和记录？不会删除原聊天软件消息。","移除好友",MessageBoxButton.YesNo)!=MessageBoxResult.Yes)return;hub.Stop();hubStore.Update(s=>{s.Rules.RemoveAll(r=>r.Id==selected.Id);s.Items.RemoveAll(i=>i.RuleId==selected.Id);s.Contexts.Remove(selected.Id);s.LastRequests.Remove(selected.Id);s.Revision=Guid.NewGuid().ToString("N");});Navigate("消息助手");}));
            card.Children.Add(new Expander {Header="更多",Content=more});body.Children.Add(Card(card));
        }
        return Scroll(body);
    }
    private Window BuildHubRuleDialog(HubRule? existing)
    {
        var policy=hubStore.Read();var c=policy.Connection;
        if(existing is null && (c.Account.Length==0 || state.Profiles.Count==0))throw new InvalidOperationException("请先保存连接账号和至少一套 API 配置。");
        var dialog=Dialog(existing is null?"添加指定好友":"编辑指定好友",600,720);var dock=new DockPanel {Margin=new(20)};var body=Stack();
        string platform=existing?.Platform??c.Platform,account=existing?.Account??c.Account;
        body.Children.Add(Text((platform=="qq"?"QQ":"微信")+"账号："+account,13));
        var name=Box("好友备注",existing?.Name??"",30);var peer=Box("好友标识",existing?.Peer??"",100);
        peer.IsReadOnly=existing is not null;
        var profiles=new ComboBox {ItemsSource=state.Profiles,DisplayMemberPath="Name",SelectedValuePath="Id",SelectedValue=existing?.ProfileId??state.ProfileId};AutomationProperties.SetName(profiles,"会话 API");
        var personas=new ComboBox {ItemsSource=state.Personas,DisplayMemberPath="Name",SelectedValuePath="Id",SelectedValue=existing?.PersonaId??state.PersonaId};AutomationProperties.SetName(personas,"会话人设");
        var mode=new ComboBox {ItemsSource=new[]{"生成后确认发送（默认）","自动回复指定好友"},SelectedIndex=existing?.Mode=="auto"?1:0};AutomationProperties.SetName(mode,"会话回复模式");
        body.Children.Add(Field("显示备注",name));body.Children.Add(Field(platform=="qq"?"好友 QQ 号码":"微信唯一好友备注名",peer,"接收对象绑定后不可修改；更换对象请另建好友规则，避免把原会话带给其他人。"));body.Children.Add(Field("使用 API",profiles));body.Children.Add(Field("使用人设",personas));body.Children.Add(Field("回复方式",mode,"自动模式等待连续消息结束，最多合并5条新消息后直接回复。命中转人工词或发送结果不明时停止自动提交。"));
        var feedback=Text("先用确认模式核对账号、对象和发送行为。",12);var bottom=Stack();bottom.Children.Add(feedback);bottom.Children.Add(Button("保存好友",()=>
        {
            try
            {
                if(platform=="qq" && (!long.TryParse(peer.Text,out long number)||number<=0))throw new InvalidOperationException("请输入准确的好友 QQ 号码。");
                if(mode.SelectedIndex==1 && MessageBox.Show(dialog,"为此好友开启自动回复？连接期间会使用自备 API 生成并直接提交。建议先完成确认模式的本机验证。","开启自动模式",MessageBoxButton.YesNo)!=MessageBoxResult.Yes)return;
                var rule=new HubRule(existing?.Id??Guid.NewGuid().ToString("N"),platform,account,peer.Text.Trim(),name.Text.Trim(),profiles.SelectedValue as string??"",personas.SelectedValue as string??"",mode.SelectedIndex==1?"auto":"confirm",existing?.Paused??false);
                hub.Stop();hubStore.Update(s=>{s.Rules.RemoveAll(r=>r.Id==rule.Id);s.Rules.Add(rule);s.Revision=Guid.NewGuid().ToString("N");});dialog.Close();Navigate("消息助手");SetStatus("好友规则已保存，当前保持暂停；请主动连接。");
            }
            catch(Exception error){feedback.Text=SafeError(error);feedback.Foreground=Brushes.Firebrick;}
        },true));DockPanel.SetDock(bottom,Dock.Bottom);dock.Children.Add(bottom);dock.Children.Add(Scroll(body));dialog.Content=dock;return dialog;
    }
    private UIElement HubSettings()
    {
        var policy=hubStore.Read();var c=policy.Connection;var body=Stack();if(textScale<=1.5)body.Children.Add(Text("连接与额度",18,true));
        var receiveDiagnostics=ReceiveDiagnosticsCard();body.Children.Add(receiveDiagnostics);
        var automaticStart=new CheckBox {Content="打开聊商时自动开始回复",IsChecked=HubAutomatic.HasConsent(policy,state),MinHeight=36*textScale};AutomationProperties.SetName(automaticStart,"打开聊商自动回复");
        hubAutomaticStartControl=automaticStart;
        body.Children.Add(Field("自动运行",automaticStart,"首次配好账号、指定好友、人设和 API 后开启。当前账号启用的好友均需设为自动模式；规则或 API 改动后需重新开启，已暂停好友不会恢复。"));
        hubAutomaticStartDetail=Text(HubAutomatic.Inspect(policy,state).Detail,12);body.Children.Add(hubAutomaticStartDetail);
        var setupResult=new ContentControl();var setupDetails=new Expander {Header="查看连接准备清单",Content=setupResult};setupResult.Content=SetupCard(HubReadiness.Inspect(state,policy));body.Children.Add(setupDetails);
        var platform=new ComboBox {ItemsSource=new[]{"QQ · 本机 OneBot11 桥接","微信 · wxautox4 适配（实验）"},SelectedIndex=c.Platform=="qq"?0:1};AutomationProperties.SetName(platform,"消息连接平台");
        var account=Box("本人账号",c.Account,100);var endpoint=Box("本机桥接地址",c.Endpoint,2048);var token=new PasswordBox();AutomationProperties.SetName(token,"桥接访问令牌");var python=Box("Python 程序",c.Python,2048);
        body.Children.Add(Field("连接平台",platform));body.Children.Add(Field("本人 QQ 号 / 微信显示名称",account,"连接时核对组件报告的本人账号；微信显示名需与当前客户端一致。"));
        var qq=Stack();qq.Children.Add(Field("QQ 混合 WebSocket 接口",endpoint,"例如 ws://127.0.0.1:3001/，仅允许本机地址和 / 路径。"));qq.Children.Add(Field("访问令牌（至少16位）",token,"原账号与原地址下留空保留；更换账号或地址需重新填写。"));
        qq.Children.Add(Text("需自行准备有权使用的 OneBot11 桥接服务；聊商不附带 QQ 协议组件，不安装 NapCat。请只绑定本机，并启用访问令牌。",12));body.Children.Add(qq);
        var wx=Stack();wx.Children.Add(Field("已安装 wxautox4 的 Python.exe",python));wx.Children.Add(Button("选择 Python",()=>{var picker=new OpenFileDialog {Filter="Python 程序|python.exe",Title="选择已安装依赖的 Python"};if(picker.ShowDialog(this)==true)python.Text=picker.FileName;}));
        wx.Children.Add(Text("微信适配器不附带 wxautox4，不会自动安装或激活。需自行准备授权依赖并核对分发条款；客户端须能提供账号名和输入框草稿检查，否则拒绝发送。真实微信兼容尚未验收。",12));body.Children.Add(wx);
        var guide=Stack();guide.Children.Add(Text("1 · 选择Python3.9–3.13的独立环境。Python3.14即使存在安装信息也不代表组件可运行。",13));guide.Children.Add(Text("2 · 在该环境准备有权使用的wxautox4，并由本人完成本机激活。免费版wxauto4不提供当前使用的Plus监听接口，不能直接替换。",13));guide.Children.Add(Text("3 · 官方文档当前列出微信4.1环境；更新客户端仍需实际兼容验证。不要为测试自动降级或改动现有微信。",13));guide.Children.Add(Text("4 · 本人准备一位好友的唯一备注，先选确认模式验证账号、接收对象与提交结果，再逐好友开启自动。配置、依赖信息、授权与真实收发是不同检查项。",13));
        guide.Children.Add(Button("官方安装与激活说明",()=>Process.Start(new ProcessStartInfo("https://docs.wxauto.org/docs/install.html"){UseShellExecute=true})));
        var help=new Expander{Header="微信连接准备步骤",Content=guide};AutomationProperties.SetName(help,"微信连接准备步骤");wx.Children.Add(help);
        void Platform(){qq.Visibility=platform.SelectedIndex==0?Visibility.Visible:Visibility.Collapsed;wx.Visibility=platform.SelectedIndex==1?Visibility.Visible:Visibility.Collapsed;receiveDiagnostics.Visibility=platform.SelectedIndex==0?Visibility.Visible:Visibility.Collapsed;}
        platform.SelectionChanged+=(_,_)=>Platform();Platform();
        var requests=Box("每日生成尝试上限",policy.DailyRequestLimit.ToString(),3);var sends=Box("每日发送尝试上限",policy.DailySendLimit.ToString(),3);var cooldown=Box("会话冷却秒数",policy.CooldownSeconds.ToString(),4);var replyDelay=Box("连续消息等待秒数",policy.AutoReplyDelaySeconds.ToString(),2);var words=Box("转人工关键词",string.Join("，",policy.ManualWords),820,true);words.MinHeight=60;
        var limits=Stack();limits.Children.Add(Field("连续消息等待（0–15秒）",replyDelay,"默认等2秒，最多合并5条新消息后回复，避免对方尚未说完就连续发送。"));limits.Children.Add(Field("每日生成尝试上限（1–200）",requests));limits.Children.Add(Field("每日发送尝试上限（1–200）",sends));limits.Children.Add(Field("同一好友生成间隔（5–3600秒）",cooldown,"间隔结束后自动合并尚未回复的连续新消息。暂停或人工接管会取消等待。"));limits.Children.Add(Field("转人工词（逗号分隔，最多20个）",words,"任一合并的新消息或生成回复命中时均不自动发送。每日计数按 UTC 日期重置，失败尝试也占次数。"));body.Children.Add(new Expander {Header="额度与转人工规则",Content=limits});
        HubConnection DraftConnection()=>HubReadiness.Draft(hubStore.Read().Connection,platform.SelectedIndex==0?"qq":"wechat",account.Text,endpoint.Text,token.Password,python.Text);
        var dock=new DockPanel();var buttons=new WrapPanel();
        buttons.Children.Add(TaskButton("检查连接准备",()=>_=Operate(async (cancel,view,revision)=>
        {
            var snapshot=hubStore.Read();snapshot.Connection=DraftConnection();var report=HubReadiness.Inspect(vault.Read(),snapshot);var extra=new List<SetupCheck>();
            SetStatus("正在检查当前填写的配置，不会登录或发送消息…");
            if(report.Checks.Single(x=>x.Id=="connection").Status=="ready")extra.Add(snapshot.Connection.Platform=="qq"?await HubReadiness.ProbeLocalPort(snapshot.Connection,cancel):await HubReadiness.ProbePython(snapshot.Connection.Python,cancel));
            if(snapshot.Connection.Platform=="wechat")extra.Add(new("activation","授权与微信客户端","pending","准备检查不加载wxautox4、不验证激活或微信收发。官方文档列出Python3.9–3.13与微信4.1环境；请按“微信连接准备步骤”核对，其他版本尚待实际验证。"));
            Guard(cancel,view,revision);setupResult.Content=SetupCard(report,extra);setupDetails.IsExpanded=true;setupDetails.BringIntoView();
            SetStatus(extra.Any(x=>x.Status is "missing" or "blocked")?"已查到环境阻碍项，请按清单处理后重新检查。":"准备检查完成；授权与真实微信或 QQ 收发仍需另外验证。");
        })));
        buttons.Children.Add(Button("保存连接与规则",()=>
        {
            var saved=DraftConnection();string p=saved.Platform;
            if(p=="qq")_=OneBotTransport.Endpoint(saved);
            else if(!HubReadiness.PythonPath(saved.Python)||saved.Account.Length==0)throw new InvalidOperationException("请填写微信账号名，并选择 Python.exe。");
            if(!int.TryParse(requests.Text,out int r)||!int.TryParse(sends.Text,out int s)||!int.TryParse(cooldown.Text,out int cd)||!int.TryParse(replyDelay.Text,out int rd))throw new InvalidOperationException("次数和间隔需填写整数。");
            Cancel();hub.Stop();var savedPolicy=hubStore.Update(data=>{data.Connection=saved;data.DailyRequestLimit=r;data.DailySendLimit=s;data.CooldownSeconds=cd;data.AutoReplyDelaySeconds=rd;data.ManualWords=words.Text.Split([',','，','\r','\n'],StringSplitOptions.TrimEntries|StringSplitOptions.RemoveEmptyEntries).Distinct().ToList();data.Revision=Guid.NewGuid().ToString("N");if(automaticStart.IsChecked==true)HubAutomatic.Enable(data,vault.Read());else HubAutomatic.Disable(data);});token.Clear();setupResult.Content=SetupCard(HubReadiness.Inspect(vault.Read(),savedPolicy));if(hubAutomaticStartDetail is not null)hubAutomaticStartDetail.Text=HubAutomatic.Inspect(savedPolicy,vault.Read()).Detail;SetStatus(automaticStart.IsChecked==true?"已保存，下次打开聊商会按当前指定好友规则自动连接。本次仍保持暂停。":"连接与额度已保存，当前保持暂停；好友选自动模式后可连接开始。");
        },true));
        foreach(var field in new[]{account,endpoint,python,requests,sends,cooldown,replyDelay,words})field.TextChanged+=(_,_)=>{Cancel();setupDetails.IsExpanded=false;setupResult.Content=Text("内容有修改，请重新检查准备情况。",12);};
        token.PasswordChanged+=(_,_)=>{Cancel();setupDetails.IsExpanded=false;setupResult.Content=Text("令牌有修改，请重新检查；保存后生效。",12);};platform.SelectionChanged+=(_,_)=>{Cancel();setupDetails.IsExpanded=false;setupResult.Content=Text("平台有修改，请重新检查准备情况。",12);};
        body.Children.Add(new Expander {Header="整理本机消息记录",Content=Button("清空消息助手记录和上下文",()=>{if(MessageBox.Show(this,"清空消息助手记录和上下文？保留连接、好友规则和今日额度计数。原聊天软件消息不受影响。","清空本机记录",MessageBoxButton.YesNo)!=MessageBoxResult.Yes)return;hub.Stop();hubStore.Update(s=>{s.Items.Clear();s.Contexts.Clear();});hubEdits.Clear();Navigate("消息助手");})});
        var footer=ActionBar(buttons);DockPanel.SetDock(footer,Dock.Bottom);dock.Children.Add(footer);dock.Children.Add(Scroll(Card(body)));return dock;
    }
}
