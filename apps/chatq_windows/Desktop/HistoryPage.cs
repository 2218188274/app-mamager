using System.IO;
using System.Text;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using Microsoft.Win32;

namespace ChatQ.Windows;

public sealed partial class MainWindow
{
    // Explicit imports stay in memory. Never add raw chats to UserState, portable backup or MessageHub.
    private ImportedArchive? importedHistory;
    private int importedThread,analysisRange=100,analysisReplyCount=3;
    private string analysisSelf="",analysisQuestion="",analysisConfiguration="";
    private AnalysisSlice? analysisSlice;
    private ChatAnalysis? historyAnalysis;
    private StackPanel? analysisOutput;
    private TextBox? analysisPreview;
    private TextBlock? analysisScope;
    private CheckBox? analysisConsent;

    private UIElement ChatHistoryPage()
    {
        if(analysisConfiguration!=state.ConfigurationRevision){historyAnalysis=null;analysisConfiguration=state.ConfigurationRevision;}
        var dock=new DockPanel();var heading=Heading("聊天分析","主动导入微信导出文件，先核对再分析。结论附消息依据，建议由你选择使用。");DockPanel.SetDock(heading,Dock.Top);dock.Children.Add(heading);
        var actions=new WrapPanel();actions.Children.Add(TaskButton("生成分析",()=>_=AnalyzeImportedHistory(),true,ready:()=>analysisSlice is not null && analysisConsent?.IsChecked==true && state.ActiveProfile is not null));actions.Children.Add(TaskButton("停止",Cancel,stop:true));
        actions.Children.Add(TaskButton("导出分析TXT",ExportHistoryAnalysis,ready:()=>historyAnalysis is not null));var bar=ActionBar(actions);DockPanel.SetDock(bar,Dock.Bottom);dock.Children.Add(bar);
        var body=Stack();var setup=Stack();setup.Children.Add(Text("1 · 导入需要分析的会话",17,true));
        var tools=new WrapPanel();tools.Children.Add(TaskButton(importedHistory is null?"选择聊天文件":"重新选择文件",()=>_=ChooseHistoryFile()));tools.Children.Add(TaskButton("清除本次导入",()=>{ClearHistoryImport();Navigate("聊天分析");},ready:()=>importedHistory is not null));setup.Children.Add(tools);
        var help=Stack();help.Children.Add(Text("支持工具导出的 messages.json、messages.csv、messages/*.json，以及只含聊天数据的ZIP。安装包、微信数据库、manifest与联系人清单不能直接分析。",13));
        help.Children.Add(Text("原文与结果只在本次打开期间暂存，退出后不保留；不会加入消息助手或自动发送。需要保留建议时请导出分析TXT。",13));setup.Children.Add(new Expander{Header="支持格式与暂存说明",Content=help});
        if(importedHistory is not null)
        {
            setup.Children.Add(Text($"已导入 {importedHistory.Threads.Count} 个会话 · 去除 {importedHistory.DuplicateCount} 条同ID重复记录 · {importedHistory.MediaCount} 条非文本不参与分析。",13,true));
            if(!importedHistory.Chronological)setup.Children.Add(Text("部分时间无法识别，相应会话保留导出文件的消息顺序；请核对预览是否为最新聊天。",13));
            var threads=new ComboBox{ItemsSource=importedHistory.Threads,SelectedIndex=importedThread};AutomationProperties.SetName(threads,"导入会话");
            threads.SelectionChanged+=(_,_)=>{if(threads.SelectedIndex>=0 && threads.SelectedIndex!=importedThread){Cancel();importedThread=threads.SelectedIndex;analysisSelf="";historyAnalysis=null;Navigate("聊天分析");}};setup.Children.Add(Field("选择一个会话",threads));
            var thread=importedHistory.Threads[importedThread];var participants=thread.Lines.Where(l=>l.IsText).Select(l=>l.Sender).Distinct().ToList();
            if(thread.Lines.Where(l=>l.IsText).Any() && thread.Lines.Where(l=>l.IsText).All(l=>l.IsSelf.HasValue))participants.Insert(0,ChatImport.SelfFlags);
            var self=new ComboBox{ItemsSource=participants,SelectedItem=analysisSelf};AutomationProperties.SetName(self,"聊天中哪位是我");
            self.SelectionChanged+=(_,_)=>{analysisSelf=self.SelectedItem as string??"";RefreshAnalysisPreview();};setup.Children.Add(Field("2 · 确认哪位是我",self,"不会根据名字猜测双方身份，请主动选择并核对下方化名预览。"));
            var choices=new WrapPanel();
            var range=new ComboBox{ItemsSource=new[]{50,100,200},SelectedItem=analysisRange,MinWidth=160,Margin=new(0,0,12,10)};AutomationProperties.SetName(range,"分析最近文本条数");range.SelectionChanged+=(_,_)=>{if(range.SelectedItem is int n){analysisRange=n;RefreshAnalysisPreview();}};choices.Children.Add(Field("分析最近文本条数",range));
            var count=new ComboBox{ItemsSource=Enumerable.Range(1,10).ToArray(),SelectedItem=analysisReplyCount,MinWidth=160};AutomationProperties.SetName(count,"分析建议回复条数");count.SelectionChanged+=(_,_)=>{if(count.SelectedItem is int n){analysisReplyCount=n;RefreshAnalysisPreview();}};choices.Children.Add(Field("回复建议条数",count));setup.Children.Add(choices);
            var question=Box("分析关注点",analysisQuestion,500,true);question.MinHeight=70;question.MaxHeight=120;question.TextChanged+=(_,_)=>{analysisQuestion=question.Text;RefreshAnalysisPreview();};setup.Children.Add(Field("这次想解决什么（选填）",question,"例如：最近回复变短，下一次怎么自然开启话题？再次填写新问题后可重新分析。"));
        }
        body.Children.Add(Card(setup));
        var preview=Stack();preview.Children.Add(Text("3 · 核对将发送给模型的内容",17,true));
        analysisScope=Text("选择文件后，先确认聊天双方，再查看分析范围。",13);preview.Children.Add(analysisScope);
        analysisPreview=Box("将发送的化名聊天摘录","",ChatImport.MaxPromptChars+100,true);analysisPreview.IsReadOnly=true;analysisPreview.MinHeight=140;analysisPreview.MaxHeight=230;preview.Children.Add(analysisPreview);
        preview.Children.Add(Text("发送人以“我/对方”展示，并替换已知称呼、手机号和邮箱；这不能识别所有隐私，请核对预览。仅在勾选并点击生成后直连当前API，不上传聊商平台。",12));
        analysisConsent=new CheckBox{Content=new TextBlock{Text="我已核对预览，允许将这些内容发送到当前自备API",TextWrapping=TextWrapping.Wrap},Margin=new(0,8,0,6),MinHeight=42};AutomationProperties.SetName(analysisConsent,"允许发送聊天摘录");analysisConsent.Checked+=(_,_)=>UpdateTaskButtons();analysisConsent.Unchecked+=(_,_)=>{if(operation is not null)Cancel();UpdateTaskButtons();};preview.Children.Add(analysisConsent);body.Children.Add(Card(preview));
        analysisOutput=Stack();var workspace=new Grid();workspace.ColumnDefinitions.Add(new());workspace.ColumnDefinitions.Add(new());workspace.RowDefinitions.Add(new(){Height=GridLength.Auto});workspace.RowDefinitions.Add(new(){Height=GridLength.Auto});workspace.Children.Add(body);workspace.Children.Add(analysisOutput);
        void Reflow(){bool wide=workspace.ActualWidth>=860 && textScale<=1.5;workspace.ColumnDefinitions[1].Width=wide?new(1.08,GridUnitType.Star):new(0);Grid.SetColumn(analysisOutput,wide?1:0);Grid.SetRow(analysisOutput,wide?0:1);body.Margin=wide?new(0,0,18,0):new(0);}
        workspace.SizeChanged+=(_,_)=>Reflow();Reflow();dock.Children.Add(Scroll(workspace));RefreshAnalysisPreview(false);RenderHistoryAnalysis();return dock;
    }
    private void RefreshAnalysisPreview(bool invalidate=true)
    {
        if(invalidate){Cancel();historyAnalysis=null;if(analysisConsent is not null)analysisConsent.IsChecked=false;RenderHistoryAnalysis();}
        analysisSlice=null;
        if(analysisPreview is null || analysisScope is null)return;
        try
        {
            if(importedHistory is null){analysisPreview.Text="";return;}
            analysisSlice=ChatImport.Select(importedHistory.Threads[importedThread],analysisSelf,analysisRange);analysisPreview.Text=analysisSlice.Transcript;
            string destination=state.ActiveProfile is { } p?new Uri(p.BaseUrl).Host+" · "+p.Model:"尚未配置API";
            analysisScope.Text=analysisSlice.Coverage+"\n目标API："+destination+" · "+analysisSlice.Transcript.Length+"字 · 建议最多"+analysisReplyCount+"条。";
        }
        catch(InvalidOperationException e){analysisPreview.Text="";analysisScope.Text=e.Message;}
        UpdateTaskButtons();
    }
    private async Task ChooseHistoryFile()
    {
        var picker=new OpenFileDialog{Filter="聊天导出文件|*.json;*.csv;*.zip",Title="选择主动导出的聊天文件（不是安装包）"};if(picker.ShowDialog(this)!=true)return;
        await Operate(async(token,view,revision)=>
        {
            SetStatus("正在本机解析导出文件，不调用AI…");
            string path=picker.FileName;var imported=await Task.Run(()=>ChatImport.Load(ReadLimited(path,ChatImport.MaxBytes),Path.GetFileName(path),token),token);Guard(token,view,revision);
            SetHistoryImport(imported);Navigate("聊天分析");SetStatus("已在本机导入。确认谁是我，核对预览后再生成。");
        });
    }
    private void SetHistoryImport(ImportedArchive imported)
    {
        importedHistory=imported;importedThread=0;analysisSelf="";historyAnalysis=null;analysisSlice=null;analysisQuestion="";
    }
    private void ClearHistoryImport(){Cancel();importedHistory=null;importedThread=0;analysisSelf="";analysisQuestion="";analysisSlice=null;historyAnalysis=null;}
    private async Task AnalyzeImportedHistory()
    {
        var slice=analysisSlice;if(slice is null || analysisConsent?.IsChecked!=true){SetStatus("请先确认聊天双方、核对预览并允许发送。",true);return;}
        string question=analysisQuestion;int count=analysisReplyCount;
        await Operate(async(token,view,revision)=>
        {
            SetStatus("正在分析选中的聊天摘录，可随时停止…");var answer=await ai.AnalyzeHistory(state,slice,question,count,token);Guard(token,view,revision);
            if(!ReferenceEquals(slice,analysisSlice) || analysisConsent?.IsChecked!=true)throw new OperationCanceledException();
            historyAnalysis=answer;analysisConfiguration=revision;RenderHistoryAnalysis();
            if(analysisOutput is not null){analysisOutput.UpdateLayout();if(analysisOutput.Children[0] is FrameworkElement first)first.BringIntoView(new Rect(0,0,1,Math.Max(1,Math.Min(first.ActualHeight,160*textScale))));}
            SetStatus("分析已完成。依据对应预览中的消息编号，选择建议后可复制或继续润色。");
        });
    }
    private void RenderHistoryAnalysis()
    {
        if(analysisOutput is null)return;analysisOutput.Children.Clear();var answer=historyAnalysis;
        if(answer is null){analysisOutput.Children.Add(EmptyState("从这段聊天，找到下一步","生成后可查看有依据的观察、下一步行动、延续话题和回复建议；只覆盖本次选择的文本。"));return;}
        var overview=Stack();overview.Children.Add(Text("聊天总结",18,true));overview.Children.Add(Text(answer.Summary));analysisOutput.Children.Add(Card(overview));
        var observations=Stack();observations.Children.Add(Text("有依据的观察",17,true));
        foreach(var item in answer.Observations){observations.Children.Add(Text(item.Point,14,true));observations.Children.Add(Text(item.Confidence+" · 依据 "+string.Join("、",item.Evidence),13));}analysisOutput.Children.Add(Card(observations));
        foreach(var group in new[]{(Title:"下一步怎么聊",Values:answer.NextSteps),(Title:"可以延续的话题",Values:answer.Topics)}){var card=Stack();card.Children.Add(Text(group.Title,17,true));foreach(string value in group.Values)card.Children.Add(Text("• "+value));analysisOutput.Children.Add(Card(card));}
        int index=0;foreach(string reply in answer.Replies)
        {
            var card=Stack();card.Children.Add(Text("回复建议 "+(++index).ToString("00"),13,true));var value=Box("分析回复建议",reply,1000,true);value.IsReadOnly=true;value.MinHeight=65;card.Children.Add(value);
            var tools=new WrapPanel();tools.Children.Add(Button("复制这条",()=>Copy(reply),true));tools.Children.Add(Button("继续润色",()=>{state=vault.Update(s=>{s.PolishDraft=reply;s.DraftUpdatedAt=DateTime.UtcNow;});input=null;mode="polish";navigation.SelectedItem="回复助手";}));card.Children.Add(tools);analysisOutput.Children.Add(Card(card));
        }
        analysisOutput.Children.Add(Text("建议基于不完整聊天摘录，无法确定他人真实想法。请结合实际关系自行判断。",12));
    }
    private void ExportHistoryAnalysis()
    {
        if(historyAnalysis is not { } answer || analysisSlice is null)return;
        var picker=new SaveFileDialog{Filter="文本文件|*.txt",FileName="聊商-聊天分析.txt",Title="导出分析建议（明文TXT，请妥善保存）"};if(picker.ShowDialog(this)!=true)return;
        string report="聊商聊天分析\n"+analysisSlice.Coverage+"\n\n总结\n"+answer.Summary+"\n\n观察\n"+string.Join("\n",answer.Observations.Select(x=>x.Point+"（"+x.Confidence+"，依据 "+string.Join("、",x.Evidence)+"）"))+"\n\n下一步\n"+string.Join("\n",answer.NextSteps)+"\n\n话题\n"+string.Join("\n",answer.Topics)+"\n\n回复建议\n"+string.Join("\n\n",answer.Replies)+"\n\n本报告仅基于选中摘录，不代表对他人心理或关系的确定判断。\n";
        File.WriteAllText(picker.FileName,report,new UTF8Encoding(false));SetStatus("已导出分析TXT，未附带聊天原文或API密钥。");
    }
}
