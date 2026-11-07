using System.IO;
using System.Text;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using Microsoft.Win32;

namespace ChatQ.Windows;

public sealed partial class MainWindow
{
    // Imports stay in memory unless explicitly saved to the separate encrypted library.
    private ImportedArchive? importedHistory;
    private int importedThread,analysisRange=100,analysisReplyCount=3;
    private string analysisSelf="",analysisQuestion="",analysisConfiguration="";
    private AnalysisSlice? analysisSlice;
    private HistoryPlan? analysisPlan;
    private HistoryAnalysisJob? historyJob;
    private bool longHistory;
    private int longRange=1000,analysisPart;
    private ComboBox? analysisPartChoice;
    private ChatAnalysis? historyAnalysis;
    private Button? analysisGenerate;
    private StackPanel? analysisOutput;
    private TextBox? analysisPreview;
    private TextBlock? analysisScope;
    private CheckBox? analysisConsent;
    private List<string> importedHistorySources=[];
    private string importedHistoryNote="";

    private UIElement ChatHistoryPage()
    {
        if(analysisConfiguration!=state.ConfigurationRevision){historyAnalysis=null;historyJob=null;analysisConfiguration=state.ConfigurationRevision;}
        var dock=new DockPanel();var heading=Heading("聊天分析","主动导入微信导出文件，先核对再分析。结论附消息依据，建议由你选择使用。");DockPanel.SetDock(heading,Dock.Top);dock.Children.Add(heading);
        var actions=new WrapPanel();analysisGenerate=TaskButton("生成分析",()=>_=AnalyzeImportedHistory(),true,ready:()=>(analysisSlice is not null || analysisPlan is not null) && analysisConsent?.IsChecked==true && state.ActiveProfile is not null);actions.Children.Add(analysisGenerate);actions.Children.Add(TaskButton("停止",Cancel,stop:true));
        actions.Children.Add(TaskButton("导出分析TXT",ExportHistoryAnalysis,ready:()=>historyAnalysis is not null));actions.Children.Add(TaskButton("保存分析到资料",()=>_=SaveCurrentHistoryAnalysis(),ready:()=>historyAnalysis is not null && loadedLibraryId is not null));var bar=ActionBar(actions);DockPanel.SetDock(bar,Dock.Bottom);dock.Children.Add(bar);
        var body=Stack();var setup=Stack();setup.Children.Add(Text("1 · 导入需要分析的会话",17,true));
        var tools=new WrapPanel();tools.Children.Add(TaskButton(importedHistory is null?"选择聊天文件":"重新选择文件",()=>_=ChooseHistoryFile()));tools.Children.Add(TaskButton("导入读取包文件夹",()=>_=ChooseHistoryFolder()));tools.Children.Add(TaskButton("打开资料库",()=>BuildChatLibraryDialog().ShowDialog()));tools.Children.Add(TaskButton("保存到资料库",()=>BuildLibrarySaveDialog().ShowDialog(),ready:()=>importedHistory is not null && analysisSelf.Length>0));tools.Children.Add(TaskButton("导出聊天文字",()=>BuildHistoryExportDialog().ShowDialog(),ready:()=>importedHistory is not null));tools.Children.Add(TaskButton("清除本次导入",()=>{ClearHistoryImport();Navigate("聊天分析");},ready:()=>importedHistory is not null));setup.Children.Add(tools);
        var help=Stack();help.Children.Add(Text("支持工具导出的JSON、CSV、聊天数据ZIP，也可直接选择agent_data或messages文件夹。只读取消息文件；安装包、微信数据库、manifest与联系人清单不能直接分析。",13));
        help.Children.Add(Text("导入默认只暂存。主动“保存到资料库”后可在本机加密保留，下次直接载入；资料不进入普通备份、云同步或消息助手。也可另存JSON/CSV重新导入，TXT便于阅读。分析结果另用“导出分析TXT”。",13));setup.Children.Add(new Expander{Header="支持格式与保存说明",Content=help});
        if(importedHistory is not null)
        {
            if(importedHistoryNote.Length>0)setup.Children.Add(Text(importedHistoryNote,13,true));
            setup.Children.Add(Text($"已导入 {importedHistory.Threads.Count} 个会话 · 去除 {importedHistory.DuplicateCount} 条同ID重复记录 · {importedHistory.MediaCount} 条非文本不参与分析。",13,true));
            if(!importedHistory.Chronological)setup.Children.Add(Text("部分时间无法识别，相应会话保留导出文件的消息顺序；请核对预览是否为最新聊天。",13));
            var threads=new ComboBox{ItemsSource=importedHistory.Threads,SelectedIndex=importedThread};AutomationProperties.SetName(threads,"导入会话");
            threads.SelectionChanged+=(_,_)=>{if(threads.SelectedIndex>=0 && threads.SelectedIndex!=importedThread){Cancel();importedThread=threads.SelectedIndex;analysisSelf="";historyAnalysis=null;analysisPlan=null;historyJob=null;analysisPart=0;loadedLibraryId=null;Navigate("聊天分析");}};setup.Children.Add(Field("选择一个会话",threads));
            var thread=importedHistory.Threads[importedThread];var participants=thread.Lines.Where(l=>l.IsText).Select(l=>l.Sender).Distinct().ToList();
            if(thread.Lines.Where(l=>l.IsText).Any() && thread.Lines.Where(l=>l.IsText).All(l=>l.IsSelf.HasValue))participants.Insert(0,ChatImport.SelfFlags);
            var self=new ComboBox{ItemsSource=participants,SelectedItem=analysisSelf};AutomationProperties.SetName(self,"聊天中哪位是我");
            self.SelectionChanged+=(_,_)=>{analysisSelf=self.SelectedItem as string??"";RefreshAnalysisPreview();};setup.Children.Add(Field("2 · 确认哪位是我",self,"不会根据名字猜测双方身份，请主动选择并核对下方化名预览。"));
            var depth=new ComboBox{ItemsSource=new[]{"快速分析 · 最近摘录","分段分析 · 长记录"},SelectedIndex=longHistory?1:0};AutomationProperties.SetName(depth,"聊天分析方式");depth.SelectionChanged+=(_,_)=>{longHistory=depth.SelectedIndex==1;historyAnalysis=null;historyJob=null;analysisSlice=null;analysisPlan=null;analysisPart=0;Navigate("聊天分析");};setup.Children.Add(Field("分析方式",depth,"分段分析先核对范围和调用次数，点击生成才逐段请求。暂停后可继续；退出前可在下方保存进度。"));
            var choices=new WrapPanel();
            var range=new ComboBox{ItemsSource=longHistory?new[]{500,1000,2000}:new[]{50,100,200},SelectedItem=longHistory?longRange:analysisRange,MinWidth=160,Margin=new(0,0,12,10)};AutomationProperties.SetName(range,"分析最近文本条数");range.SelectionChanged+=(_,_)=>{if(range.SelectedItem is int n){if(longHistory)longRange=n;else analysisRange=n;RefreshAnalysisPreview();}};choices.Children.Add(Field("分析最近文本条数",range));
            var count=new ComboBox{ItemsSource=Enumerable.Range(1,10).ToArray(),SelectedItem=analysisReplyCount,MinWidth=160};AutomationProperties.SetName(count,"分析建议回复条数");count.SelectionChanged+=(_,_)=>{if(count.SelectedItem is int n){analysisReplyCount=n;RefreshAnalysisPreview(true,false);}};choices.Children.Add(Field("回复建议条数",count));setup.Children.Add(choices);
            var question=Box("分析关注点",analysisQuestion,500,true);question.MinHeight=70;question.MaxHeight=120;question.TextChanged+=(_,_)=>{analysisQuestion=question.Text;RefreshAnalysisPreview(true,false);};setup.Children.Add(Field("这次想解决什么（选填）",question,"例如：最近回复变短，下一次怎么自然开启话题？再次填写新问题后可重新分析。"));
        }
        body.Children.Add(Card(setup));
        var preview=Stack();preview.Children.Add(Text("3 · 核对将发送给模型的内容",17,true));
        analysisScope=Text("选择文件后，先确认聊天双方，再查看分析范围。",13);preview.Children.Add(analysisScope);
        analysisPartChoice=new ComboBox{Visibility=Visibility.Collapsed};AutomationProperties.SetName(analysisPartChoice,"预览分段");analysisPartChoice.SelectionChanged+=(_,_)=>{if(analysisPartChoice.SelectedIndex>=0){analysisPart=analysisPartChoice.SelectedIndex;ShowAnalysisPart();}};preview.Children.Add(analysisPartChoice);
        analysisPreview=Box("将发送的化名聊天摘录","",ChatImport.MaxPromptChars+100,true);analysisPreview.IsReadOnly=true;analysisPreview.MinHeight=140;analysisPreview.MaxHeight=230;preview.Children.Add(analysisPreview);
        preview.Children.Add(Text("发送人以“我/对方”展示，并替换已知称呼、手机号和邮箱；这不能识别所有隐私，请核对预览。仅在勾选并点击生成后直连当前API，不上传聊商平台。",12));
        analysisConsent=new CheckBox{Content=new TextBlock{Text="我已核对预览，允许将这些内容发送到当前自备API",TextWrapping=TextWrapping.Wrap},Margin=new(0,8,0,6),MinHeight=42};AutomationProperties.SetName(analysisConsent,"允许发送聊天摘录");analysisConsent.Checked+=(_,_)=>UpdateTaskButtons();analysisConsent.Unchecked+=(_,_)=>{if(operation is not null)Cancel();UpdateTaskButtons();};preview.Children.Add(analysisConsent);if(longHistory)preview.Children.Add(HistoryProgressTools());body.Children.Add(Card(preview));
        analysisOutput=Stack();var workspace=new Grid();workspace.ColumnDefinitions.Add(new());workspace.ColumnDefinitions.Add(new());workspace.RowDefinitions.Add(new(){Height=GridLength.Auto});workspace.RowDefinitions.Add(new(){Height=GridLength.Auto});workspace.Children.Add(body);workspace.Children.Add(analysisOutput);
        void Reflow(){bool wide=workspace.ActualWidth>=860 && textScale<=1.5;workspace.ColumnDefinitions[1].Width=wide?new(1.08,GridUnitType.Star):new(0);Grid.SetColumn(analysisOutput,wide?1:0);Grid.SetRow(analysisOutput,wide?0:1);body.Margin=wide?new(0,0,18,0):new(0);}
        workspace.SizeChanged+=(_,_)=>Reflow();Reflow();dock.Children.Add(Scroll(workspace));RefreshAnalysisPreview(false);RenderHistoryAnalysis();return dock;
    }
    private void RefreshAnalysisPreview(bool invalidate=true,bool rebuild=true)
    {
        if(invalidate){Cancel();historyAnalysis=null;historyJob=null;if(rebuild)analysisPlan=null;if(analysisConsent is not null)analysisConsent.IsChecked=false;RenderHistoryAnalysis();}
        analysisSlice=null;
        if(analysisPreview is null || analysisScope is null)return;
        try
        {
            if(importedHistory is null){analysisPreview.Text="";return;}
            if(longHistory)
            {
                analysisPlan??=HistoryPlan.Create(importedHistory.Threads[importedThread],analysisSelf,longRange);
                var labels = analysisPlan.Parts.Select((part, i) => $"第{i+1}/{analysisPlan.Parts.Count}段 · {part.Count}条").ToList();
                bool synthesisOnly = historyJob is { Finished: false } && historyJob.Completed == analysisPlan.Parts.Count && analysisPlan.Parts.Count > 1;
                if (synthesisOnly) labels.Add("综合分析 · 将发送的分段摘要");
                int selection = synthesisOnly ? labels.Count - 1 : Math.Clamp(analysisPart, 0, labels.Count - 1);
                analysisPartChoice!.Visibility = Visibility.Visible;
                analysisPartChoice.ItemsSource = labels;
                analysisPartChoice.SelectedIndex = selection;
                ShowAnalysisPart();
            }
            else{analysisPlan=null;analysisSlice=ChatImport.Select(importedHistory.Threads[importedThread],analysisSelf,analysisRange);analysisPreview.Text=analysisSlice.Transcript;analysisPartChoice!.Visibility=Visibility.Collapsed;}
            bool paused = analysisPlan is not null && historyJob is { Completed: > 0, Finished: false };
            if (analysisGenerate is not null) analysisGenerate.Content = paused ? "继续分析" : "生成分析";
            string destination=state.ActiveProfile is { } p?new Uri(p.BaseUrl).Host+" · "+p.Model:"尚未配置API";
            analysisScope.Text=(analysisPlan?.Coverage??analysisSlice!.Coverage)+"\n目标API："+destination+" · 建议最多"+analysisReplyCount+"条。"+(analysisPlan is null?"":"\n分段分析可能产生供应商费用，请逐段核对；不会自动开始。"+(historyJob is {Finished:true}?" 本次分析已完成，再次生成会重新请求。":paused?$" 已完成 {historyJob!.Completed}/{analysisPlan.Parts.Count} 段，继续需 {analysisPlan.Requests-historyJob.Completed} 次调用。":""));
        }
        catch(InvalidOperationException e){analysisPlan=null;analysisPreview.Text="";analysisScope.Text=e.Message;analysisPartChoice!.Visibility=Visibility.Collapsed;}
        UpdateTaskButtons();
    }
    private void ShowAnalysisPart()
    {
        if (analysisPlan is not { } plan || analysisPreview is null || analysisPart < 0) return;
        if (analysisPart < plan.Parts.Count) analysisPreview.Text = plan.Parts[analysisPart].Transcript;
        else if (historyJob is { Finished: false } job && job.Completed == plan.Parts.Count)
            analysisPreview.Text = PersonalAi.SynthesisInput(plan, analysisQuestion, analysisReplyCount, job).Payload;
    }
    private async Task ChooseHistoryFile()
    {
        var picker=new OpenFileDialog{Filter="聊天导出文件|*.json;*.csv;*.zip",Title="选择主动导出的聊天文件（不是安装包）"};if(picker.ShowDialog(this)!=true)return;
        await Operate(async(token,view,revision)=>
        {
            SetStatus("正在本机解析导出文件，不调用AI…");
            string path=picker.FileName;var imported=await Task.Run(()=>ChatImport.Load(ReadLimited(path,ChatImport.MaxBytes),Path.GetFileName(path),token),token);Guard(token,view,revision);
            SetHistoryImport(imported);importedHistorySources=[Path.GetFullPath(path)];Navigate("聊天分析");SetStatus("已在本机导入。确认谁是我，核对预览后再生成。");
        });
    }
    private void SetHistoryImport(ImportedArchive imported)
    {
        importedHistory=imported;importedThread=0;analysisSelf="";historyAnalysis=null;analysisSlice=null;analysisPlan=null;historyJob=null;analysisPart=0;longHistory=false;loadedLibraryId=null;analysisQuestion="";importedHistorySources=[];importedHistoryNote="";
    }
    private void ClearHistoryImport(){Cancel();importedHistory=null;importedThread=0;analysisSelf="";analysisQuestion="";analysisSlice=null;analysisPlan=null;historyJob=null;loadedLibraryId=null;historyAnalysis=null;importedHistorySources=[];importedHistoryNote="";}
    private async Task ChooseHistoryFolder()
    {
        var picker=new OpenFolderDialog{Title="选择导出的agent_data或messages数据文件夹"};if(picker.ShowDialog(this)!=true)return;
        await Operate(async(token,view,revision)=>
        {
            SetStatus("正在本机读取消息文件，不读取联系人或数据库，不调用AI…");
            var folder=await Task.Run(()=>ChatImportFolder.Load(picker.FolderName,token),token);Guard(token,view,revision);
            SetHistoryImport(folder.Archive);importedHistorySources=folder.SourceFiles;Navigate("聊天分析");SetStatus("读取包已导入，原文件未修改。确认谁是我后可分析，或另存聊天文字。");
        });
    }
    private Window BuildHistoryExportDialog()
    {
        var archive=importedHistory??throw new InvalidOperationException("请先导入聊天文件。");var thread=archive.Threads[importedThread];string[] sources=ProtectedExportSources();
        var dialog=Dialog("另存聊天文字",580,650);var dock=new DockPanel {Margin=new(20)};var form=Stack();var bottom=Stack();
        form.Children.Add(Text("导出当前会话的文字",19,true));form.Children.Add(Text(thread.Name,15,true));
        var format=new ComboBox{ItemsSource=new[]{"JSON · 可重新导入","CSV · 表格及重新导入","TXT · 便于阅读"},SelectedIndex=0};AutomationProperties.SetName(format,"聊天文字导出格式");
        var range=new ComboBox{ItemsSource=new[]{"最近200条文字","全部已导入文字"},SelectedIndex=0};AutomationProperties.SetName(range,"聊天文字导出范围");
        form.Children.Add(Field("文件格式",format));form.Children.Add(Field("导出范围",range));var coverage=Text("",13,true);form.Children.Add(coverage);
        form.Children.Add(Text("导出的是已导入的会话文字，不会向微信发送或恢复消息。图片、语音和其他媒体不包含在文件中。",13));
        form.Children.Add(Text("文件包含当前会话的原始称呼和文字，为明文；请选择本机保存位置。不会附带其他会话、API密钥或连接令牌，也不会覆盖原始导入文件。",12));
        var feedback=Text("JSON/CSV可在聊商重新导入；TXT用于阅读。",12);dialogStatus=feedback;bottom.Children.Add(feedback);
        void Refresh(){Cancel();int count=thread.Lines.Count(l=>l.IsText);coverage.Text=$"本次导出{(range.SelectedIndex==0?Math.Min(200,count):count)} / 已导入{count}条文字；{thread.Lines.Count(l=>!l.IsText)}条非文本不包含。";}
        format.SelectionChanged+=(_,_)=>Refresh();range.SelectionChanged+=(_,_)=>Refresh();Refresh();
        var buttons=new WrapPanel();buttons.Children.Add(TaskButton("另存聊天文件",()=>
        {
            string kind=format.SelectedIndex switch{1=>"csv",2=>"txt",_=>"json"};int limit=range.SelectedIndex==0?200:ChatImport.MaxLines;
            var picker=new SaveFileDialog{Filter=kind.ToUpperInvariant()+"文件|*."+kind,DefaultExt=kind,FileName="聊商-聊天文字."+kind,Title="另存已导入的聊天文字",OverwritePrompt=true};if(picker.ShowDialog(dialog)!=true)return;
            if(!Path.GetExtension(picker.FileName).Equals("."+kind,StringComparison.OrdinalIgnoreCase)){feedback.Text="请使用所选格式的扩展名：."+kind;return;}
            _=Operate(async(token,view,revision)=>
            {
                var result=await Task.Run(()=>ChatFileExport.Create(thread,kind,limit,token),token);Guard(token,view,revision);
                if(!ReferenceEquals(archive,importedHistory))throw new OperationCanceledException();
                await Task.Run(()=>SaveUserFile(picker.FileName,result.Bytes,token,sources),token);Guard(token,view,revision);
                dialog.Close();SetStatus($"已另存{result.Count}条聊天文字；{result.MediaSkipped}条非文本未导出，原始导入文件保留。");
            });
        },true));buttons.Children.Add(TaskButton("停止导出",Cancel,stop:true));bottom.Children.Add(buttons);
        dialog.Closed+=(_,_)=>{Cancel();if(ReferenceEquals(dialogStatus,feedback))dialogStatus=null;};DockPanel.SetDock(bottom,Dock.Bottom);dock.Children.Add(bottom);dock.Children.Add(Scroll(form));dialog.Content=dock;return dialog;
    }
    private async Task AnalyzeImportedHistory()
    {
        var slice=analysisSlice;var plan=analysisPlan;if(slice is null && plan is null || analysisConsent?.IsChecked!=true){SetStatus("请先确认聊天双方、核对预览并允许发送。",true);return;}
        string question=analysisQuestion;int count=analysisReplyCount;
        await Operate(async(token,view,revision)=>
        {
            if (revision != analysisConfiguration)
            {
                Navigate("聊天分析");
                SetStatus("API 或人设已更新。请核对新的目标和预览，再勾选生成。", true);
                return;
            }
            SetStatus("正在分析选中的聊天摘录，可随时停止…");ChatAnalysis answer;
            if(plan is null)answer=await ai.AnalyzeHistory(state,slice!,question,count,token);
            else
            {
                if(historyJob is null || historyJob.Finished)historyJob=new(state,plan,question,count);var job=historyJob;
                try{answer=await ai.AnalyzeLongHistory(state,plan,question,count,job,progress=>{if(ReferenceEquals(plan,analysisPlan)&&!token.IsCancellationRequested)SetStatus(progress.Stage+$" · {progress.Completed}/{progress.Requests}次完成，可停止");},token);}
                finally{if(ReferenceEquals(plan,analysisPlan))RefreshAnalysisPreview(false,false);}
            }
            Guard(token,view,revision);
            if(!ReferenceEquals(slice,analysisSlice) || !ReferenceEquals(plan,analysisPlan) || analysisConsent?.IsChecked!=true)throw new OperationCanceledException();
            historyAnalysis=answer;analysisConfiguration=revision;RenderHistoryAnalysis();
            if(analysisOutput is not null){analysisOutput.UpdateLayout();if(analysisOutput.Children[0] is FrameworkElement first)first.BringIntoView(new Rect(0,0,1,Math.Max(1,Math.Min(first.ActualHeight,160*textScale))));}
            SetStatus("分析已完成。依据对应预览中的消息编号，选择建议后可复制或继续润色。");
        },timeoutSeconds:plan is null?80:600);
    }
    private void RenderHistoryAnalysis()
    {
        if(analysisOutput is null)return;analysisOutput.Children.Clear();var answer=historyAnalysis;
        if(answer is null){analysisOutput.Children.Add(EmptyState("从这段聊天，找到下一步","生成后可查看有依据的观察、下一步行动、延续话题和回复建议；只覆盖本次选择的文本。"));return;}
        var overview=Stack();overview.Children.Add(Text("聊天总结",18,true));overview.Children.Add(Text(answer.Summary));analysisOutput.Children.Add(Card(overview));
        var observations=Stack();observations.Children.Add(Text("有依据的观察",17,true));
        foreach(var item in answer.Observations){observations.Children.Add(Text(item.Point,14,true));observations.Children.Add(Text(item.Confidence+" · 依据 "+string.Join("、",item.Evidence),13));observations.Children.Add(Button("查看依据 "+string.Join("、",item.Evidence),()=>BuildHistoryEvidenceDialog(item.Evidence).ShowDialog()));}analysisOutput.Children.Add(Card(observations));
        if(analysisPlan is { } plan && historyJob is {Finished:true} job)
        {
            var segments=Stack();var summaries=job.Summaries;for(int i=0;i<summaries.Count;i++){segments.Children.Add(Text(plan.Parts[i].Coverage,13,true));segments.Children.Add(Text(summaries[i]));}
            analysisOutput.Children.Add(new Expander{Header="分段摘要 · 按所选记录顺序",Content=segments});
        }
        foreach(var group in new[]{(Title:"下一步怎么聊",Values:answer.NextSteps),(Title:"可以延续的话题",Values:answer.Topics)}){var card=Stack();card.Children.Add(Text(group.Title,17,true));foreach(string value in group.Values)card.Children.Add(Text("• "+value));analysisOutput.Children.Add(Card(card));}
        int index=0;foreach(string reply in answer.Replies)
        {
            var card=Stack();card.Children.Add(Text("回复建议 "+(++index).ToString("00"),13,true));var value=Box("分析回复建议",reply,1000,true);value.IsReadOnly=true;value.MinHeight=65;card.Children.Add(value);
            var tools=new WrapPanel();tools.Children.Add(Button("复制这条",()=>Copy(reply),true));tools.Children.Add(Button("继续润色",()=>{state=vault.Update(s=>{s.PolishDraft=reply;s.DraftUpdatedAt=DateTime.UtcNow;});input=null;mode="polish";navigation.SelectedItem="回复助手";}));card.Children.Add(tools);analysisOutput.Children.Add(Card(card));
        }
        analysisOutput.Children.Add(Text("建议基于不完整聊天摘录，无法确定他人真实想法。请结合实际关系自行判断。",12));
    }
    private Window BuildHistoryEvidenceDialog(List<string> ids)
    {
        var archive=importedHistory??throw new InvalidOperationException("原始预览已清除，请重新导入。");
        var rows=analysisPlan?.Evidence??analysisSlice?.Rows??throw new InvalidOperationException("本次分析预览已变化，请重新分析。");
        var allowed=analysisPlan?.Evidence.Select(e=>e.Id).ToHashSet()??analysisSlice?.EvidenceIds.ToHashSet()??[];
        if(ids.Count is <1 or >5 || ids.Any(id=>!allowed.Contains(id)))throw new InvalidOperationException("依据不在本次选定范围，请重新分析。");
        var dialog=Dialog("核对消息依据",640,620);var form=Stack();form.Margin=new(20);form.Children.Add(Text("依据来自本次选定记录",19,true));
        foreach(string id in ids)
        {
            var row=rows.Single(e=>e.Id==id);form.Children.Add(Text(id+" · "+row.Time+" · "+row.Speaker,14,true));
            var text=Box("依据 "+id,row.Text,20000,true);text.IsReadOnly=true;text.MinHeight=80;form.Children.Add(text);
        }
        form.Children.Add(Text("显示本机化名摘录；长消息可能已缩短。此查看操作不调用AI或发送聊天。",12));dialog.Content=Scroll(form);return dialog;
    }
    private void ExportHistoryAnalysis()
    {
        if(historyAnalysis is not { } answer || analysisSlice is null && analysisPlan is null)return;
        var picker=new SaveFileDialog{Filter="文本文件|*.txt",FileName="聊商-聊天分析.txt",Title="导出分析建议（明文TXT，请妥善保存）"};if(picker.ShowDialog(this)!=true)return;
        string report="聊商聊天分析\n"+(analysisPlan?.Coverage??analysisSlice!.Coverage)+"\n\n总结\n"+answer.Summary+"\n\n观察\n"+string.Join("\n",answer.Observations.Select(x=>x.Point+"（"+x.Confidence+"，依据 "+string.Join("、",x.Evidence)+"）"))+"\n\n下一步\n"+string.Join("\n",answer.NextSteps)+"\n\n话题\n"+string.Join("\n",answer.Topics)+"\n\n回复建议\n"+string.Join("\n\n",answer.Replies)+"\n\n本报告仅基于选中摘录，不代表对他人心理或关系的确定判断。\n";
        SaveUserFile(picker.FileName,Encoding.UTF8.GetBytes(report));SetStatus("已导出分析TXT，原始导入文件保留，未附带聊天原文或API密钥。");
    }
}
