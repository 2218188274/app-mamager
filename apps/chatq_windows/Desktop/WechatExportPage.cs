using System.IO;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using Microsoft.Win32;

namespace ChatQ.Windows;

public sealed partial class MainWindow
{
    // Explicit selection only; never persist paths, session lists or raw messages into any vault.
    private WechatCatalog? wechatCatalog;
    private WechatReadResult? wechatRead;
    private string wechatSessionId="",wechatSessionSearch="",wechatFrom="",wechatUntil="";
    private bool wechatAll;
    private int wechatFormat;
    private TextBox? wechatPreview;
    private TextBlock? wechatCoverage;
    private Button? wechatPrimary;
    private FrameworkElement? wechatPreviewStart;

    private UIElement WechatExportPage()
    {
        var dock=new DockPanel();var heading=Heading("微信导出","选择自己的数据副本，在本机导出文字或继续分析。");DockPanel.SetDock(heading,Dock.Top);dock.Children.Add(heading);
        var actions=new WrapPanel();wechatPrimary=TaskButton(wechatRead is null?"读取会话文字":"导出文件",()=>{if(wechatRead is null)_=ReadWechatSession();else SaveWechatExport();},true,ready:()=>wechatCatalog is not null && wechatCatalog.Sessions.Any(s=>s.Id==wechatSessionId));actions.Children.Add(wechatPrimary);
        actions.Children.Add(TaskButton("转到聊天分析",AnalyzeWechatExport,ready:()=>wechatRead is not null));actions.Children.Add(TaskButton("停止",Cancel,stop:true));
        var bar=ActionBar(actions);DockPanel.SetDock(bar,Dock.Bottom);dock.Children.Add(bar);
        var body=Stack();var source=Stack();source.Children.Add(Text("1 · 选择微信数据副本",17,true));
        var tools=new WrapPanel();tools.Children.Add(TaskButton(wechatCatalog is null?"选择数据副本":"更换数据副本",()=>_=ChooseWechatDatabase()));tools.Children.Add(TaskButton("导入已有聊天文件",()=>Navigate("聊天分析")));tools.Children.Add(TaskButton("清除本次数据",()=>{ClearWechatSource();Navigate("微信导出");},ready:()=>wechatCatalog is not null));source.Children.Add(tools);
        source.Children.Add(Text(wechatCatalog is null?"请先准备已解密的独立数据副本。导出不需要API，也不会启动微信。":$"已读取 {wechatCatalog.Sessions.Count} 个会话标签；选择一个会话后才读取文字。",13,true));
        var help=Stack();help.Children.Add(Text("选择已解密、已完成备份的微信4数据目录：其中应有session/session.db和message/message_数字.db；也可选择包含db_storage的上一层。可选contact/contact.db用于显示会话备注。",13));
        help.Children.Add(Text("不支持直接读取加密数据库、手机迁移备份或正在使用的微信目录，不获取密钥。带WAL/日志、链接、未解密或不兼容数据会提示原因。只读取用户选择的副本，不自动搜索其他目录。",13));
        help.Children.Add(Text("支持普通文字、UTF-8文字数据和标准Zstd压缩文字。图片、语音及未知格式不导出；会显示检查、还原和未解析条数。发送人标记不完整时保留原始ID，分析前由你确认哪位是自己。数据只在本次打开期间暂存。",13));
        source.Children.Add(new Expander{Header="支持的数据格式与准备说明",Content=help});body.Children.Add(Card(source));
        if(wechatCatalog is not null)
        {
            var options=Stack();options.Children.Add(Text("2 · 选择会话和范围",17,true));
            var search=Box("搜索微信导出会话",wechatSessionSearch,100);options.Children.Add(Field("搜索会话",search));
            var sessions=new ComboBox{ItemsSource=wechatCatalog.Sessions.Where(s=>MatchesWechatSession(s,wechatSessionSearch)).ToList(),SelectedItem=wechatCatalog.Sessions.Find(s=>s.Id==wechatSessionId)};AutomationProperties.SetName(sessions,"微信导出会话");
            sessions.SelectionChanged+=(_,_)=>{string id=(sessions.SelectedItem as WechatSession)?.Id??"";if(id!=wechatSessionId){wechatSessionId=id;InvalidateWechatRead();}};
            search.TextChanged+=(_,_)=>{wechatSessionSearch=search.Text;string selected=wechatSessionId;sessions.ItemsSource=wechatCatalog!.Sessions.Where(s=>MatchesWechatSession(s,wechatSessionSearch)).ToList();sessions.SelectedItem=wechatCatalog.Sessions.Find(s=>s.Id==selected && MatchesWechatSession(s,wechatSessionSearch));};options.Children.Add(Field("会话",sessions,"仅导出当前选择的一个会话，不批量读取其他聊天。"));
            var range=new ComboBox{ItemsSource=new[]{"最近200条文字","全部文字（最多50000条）"},SelectedIndex=wechatAll?1:0};AutomationProperties.SetName(range,"微信导出条数");range.SelectionChanged+=(_,_)=>{wechatAll=range.SelectedIndex==1;InvalidateWechatRead();};options.Children.Add(Field("导出范围",range));
            var dates=new WrapPanel();var from=Box("微信导出开始日期",wechatFrom,10);var until=Box("微信导出结束日期",wechatUntil,10);from.Width=200;until.Width=200;
            from.TextChanged+=(_,_)=>{wechatFrom=from.Text;InvalidateWechatRead();};until.TextChanged+=(_,_)=>{wechatUntil=until.Text;InvalidateWechatRead();};
            var first=Field("开始日期 · UTC",from,"YYYY-MM-DD，留空不限");first.Margin=new(0,0,14,0);dates.Children.Add(first);dates.Children.Add(Field("结束日期 · UTC",until,"包含当天，留空不限"));options.Children.Add(dates);
            var format=new ComboBox{ItemsSource=new[]{"JSON · 可重新导入","CSV · 表格及重新导入","TXT · 便于阅读"},SelectedIndex=wechatFormat};AutomationProperties.SetName(format,"微信导出文件格式");format.SelectionChanged+=(_,_)=>{wechatFormat=format.SelectedIndex;Cancel();};options.Children.Add(Field("保存格式",format));body.Children.Add(Card(options));
        }
        var preview=Stack();wechatPreviewStart=Text("3 · 核对文字后导出",17,true);preview.Children.Add(wechatPreviewStart);wechatCoverage=Text("选择会话和范围后点击“读取会话文字”。",13,true);preview.Children.Add(wechatCoverage);
        wechatPreview=Box("微信导出文字预览","",24000,true);wechatPreview.IsReadOnly=true;wechatPreview.MinHeight=140;wechatPreview.MaxHeight=300;preview.Children.Add(wechatPreview);
        preview.Children.Add(Text("预览最多显示最近20条。导出文件包含原始称呼和文字，为明文；JSON/CSV可在聊商重新导入。转到分析不会自动调用AI，仍需核对摘录并明确允许。",12));body.Children.Add(Card(preview));dock.Children.Add(Scroll(body));RenderWechatRead();return dock;
    }
    private static bool MatchesWechatSession(WechatSession s,string text)=>s.Name.Contains(text.Trim(),StringComparison.OrdinalIgnoreCase)||s.Id.Contains(text.Trim(),StringComparison.OrdinalIgnoreCase);
    private void InvalidateWechatRead(){Cancel();wechatRead=null;RenderWechatRead();}
    private void ClearWechatSource(){Cancel();wechatCatalog=null;wechatRead=null;wechatSessionId="";wechatSessionSearch="";wechatFrom="";wechatUntil="";wechatAll=false;}
    private void RenderWechatRead()
    {
        if(wechatPreview is null || wechatCoverage is null || wechatPrimary is null)return;
        wechatPrimary.Content=wechatRead is null?"读取会话文字":"导出文件";
        wechatCoverage.Text=wechatRead?.Coverage??"选择会话和范围后点击“读取会话文字”。";
        wechatPreview.Text=wechatRead is null?"":string.Join("\n\n",wechatRead.Thread.Lines.TakeLast(20).Select(l=>$"[{l.Time}] {l.Sender}\n{(l.Text.Length>900?l.Text[..900]+" [预览省略后文]":l.Text)}"));UpdateTaskButtons();
    }
    private async Task ChooseWechatDatabase()
    {
        var picker=new OpenFolderDialog{Title="选择已解密、独立备份的微信db_storage数据副本"};if(picker.ShowDialog(this)!=true)return;
        // A new attempted source must not leave old messages available for export on failure.
        ClearWechatSource();Navigate("微信导出");
        await Operate(async(token,view,revision)=>
        {
            SetStatus("正在本机检查数据副本并读取会话标签，不调用AI…");var catalog=await Task.Run(()=>WechatDatabase.Open(picker.FolderName,token),token);Guard(token,view,revision);
            wechatCatalog=catalog;Navigate("微信导出");SetStatus("目录已读取。请选择一个会话，再读取所选范围内的文字。");
        });
    }
    private async Task ReadWechatSession()
    {
        var catalog=wechatCatalog;var session=catalog?.Sessions.Find(s=>s.Id==wechatSessionId);if(catalog is null || session is null)return;
        InvalidateWechatRead();
        await Operate(async(token,view,revision)=>
        {
            var range=WechatRange.Parse(wechatAll,wechatFrom,wechatUntil);SetStatus("正在只读解析所选会话，可点击停止…");var result=await Task.Run(()=>WechatDatabase.Read(catalog,session,range,token),token);Guard(token,view,revision);
            wechatRead=result;RenderWechatRead();wechatPreviewStart?.BringIntoView(new Rect(0,0,1,60));SetStatus("文字已读取。核对预览后可导出文件，或转到聊天分析。");
        });
    }
    private void SaveWechatExport()
    {
        var result=wechatRead;if(result is null)return;string kind=wechatFormat switch{1=>"csv",2=>"txt",_=>"json"};var sources=ProtectedExportSources(result.Sources);
        var picker=new SaveFileDialog{Title="导出所选微信会话文字（明文）",Filter=kind.ToUpperInvariant()+"文件|*."+kind,FileName="聊商-微信聊天文字."+kind,DefaultExt=kind,OverwritePrompt=true};if(picker.ShowDialog(this)!=true)return;
        _=Operate(async(token,view,revision)=>
        {
            if(!Path.GetExtension(picker.FileName).Equals("."+kind,StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("请使用所选格式的扩展名：."+kind);
            var file=await Task.Run(()=>ChatFileExport.Create(result.Thread,kind,ChatImport.MaxLines,token),token);Guard(token,view,revision);
            await Task.Run(()=>SaveUserFile(picker.FileName,file.Bytes,token,sources),token);Guard(token,view,revision);
            SetStatus($"已导出{file.Count}条文字，原数据库未修改。未导出项见范围说明。");
        });
    }
    private void AnalyzeWechatExport()
    {
        var result=wechatRead;if(result is null)return;Cancel();SetHistoryImport(new([result.Thread],0,0,result.Thread.Lines.All(l=>DateTimeOffset.TryParse(l.Time,out _)),"微信数据副本"));importedHistorySources=result.Sources;importedHistoryNote=result.Coverage;
        navigation.SelectedItem="聊天分析";SetStatus("所选文字已转到聊天分析，尚未调用AI。请确认哪位是我、核对摘录，再允许生成。");
    }
}
