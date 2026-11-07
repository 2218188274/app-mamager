using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;

namespace ChatQ.Windows;

public sealed partial class MainWindow
{
    private ChatLibrary? chatLibrary;
    private ChatLibrary Library=>chatLibrary??=new(vault.DirectoryPath);
    private string? loadedLibraryId;
    private DateTime loadedLibraryUpdated;
    private Window BuildLibrarySaveDialog()
    {
        var archive=importedHistory??throw new InvalidOperationException("请先导入聊天记录。");var thread=archive.Threads[importedThread];string self=analysisSelf;
        _=ChatImport.Select(thread,self,1);
        var dialog=Dialog("保存聊天资料",570,540);var dock=new DockPanel{Margin=new(20)};var form=Stack();
        form.Children.Add(Text("下次继续分析这段聊天",19,true));
        form.Children.Add(Text("主动保存当前会话原文和已选身份，以当前Windows账号加密。资料库独立于普通AI对话，不进入消息助手、云同步或普通便携备份；可在资料库主动删除。",13));
        var name=Box("资料名称",thread.Name.Length>60?thread.Name[..60]:thread.Name,60);form.Children.Add(Field("资料名称",name));
        form.Children.Add(Text($"当前会话共{thread.Lines.Count}条记录。资料库最多20个会话、合计50000条、16MB；保存原文不会调用AI。",13));
        var consent=new CheckBox{Content=new TextBlock{Text="将当前会话原文加密保存在这台电脑",TextWrapping=TextWrapping.Wrap},MinHeight=42,Margin=new(0,8,0,8)};AutomationProperties.SetName(consent,"允许保存聊天资料");form.Children.Add(consent);
        var feedback=Text("请核对名称和保存范围。下次在“打开资料库”载入。",13);form.Children.Add(feedback);dialogStatus=feedback;
        var buttons=new WrapPanel();
        buttons.Children.Add(TaskButton("加密保存",()=>_=Operate(async(token,view,revision)=>
        {
            string label=name.Text;var saved=await Task.Run(()=>Library.Save(thread,self,archive.Chronological,label,token:token),token);Guard(token,view,revision);
            loadedLibraryId=saved.Id;loadedLibraryUpdated=saved.UpdatedAt;dialog.Close();SetStatus("聊天资料已在本机加密保存。打开资料库可继续分析；未调用AI。");
        }),true,ready:()=>consent.IsChecked==true && name.Text.Trim().Length>0));
        buttons.Children.Add(TaskButton("停止保存",Cancel,stop:true));
        consent.Checked+=(_,_)=>UpdateTaskButtons();consent.Unchecked+=(_,_)=>{if(operation is not null)Cancel();UpdateTaskButtons();};name.TextChanged+=(_,_)=>UpdateTaskButtons();
        DockPanel.SetDock(buttons,Dock.Bottom);dock.Children.Add(buttons);dock.Children.Add(Scroll(form));dialog.Content=dock;
        dialog.Closed+=(_,_)=>{Cancel();if(ReferenceEquals(dialogStatus,feedback))dialogStatus=null;};return dialog;
    }
    private Window BuildChatLibraryDialog()
    {
        var dialog=Dialog("聊天资料库",660,700);var dock=new DockPanel{Margin=new(20)};var form=Stack();
        form.Children.Add(Text("本机加密聊天资料库",19,true));form.Children.Add(Text("载入不调用模型，分析仍需重新核对。普通备份不含资料库；可单独设置密码导出.cqlb，在其他Windows电脑恢复。API密钥不进入备份。",13));
        var backupTools=new WrapPanel();backupTools.Children.Add(TaskButton("备份资料库",()=>{dialog.Close();BuildLibraryBackupDialog(false).ShowDialog();}));backupTools.Children.Add(TaskButton("恢复资料备份",()=>{dialog.Close();ChooseLibraryBackup();}));form.Children.Add(backupTools);
        var search=Box("搜索资料名称","",100);form.Children.Add(Field("搜索资料名称",search));
        var list=new ListBox{MinHeight=150,MaxHeight=260,Margin=new(0,0,0,10)};AutomationProperties.SetName(list,"已保存聊天资料");form.Children.Add(list);
        var name=Box("修改资料名称","",60);form.Children.Add(Field("资料名称",name));var details=Text("正在读取本机加密资料…",13);form.Children.Add(details);
        var remove=new CheckBox{Content=new TextBlock{Text="确认永久删除选中的本机资料，原导出文件保留",TextWrapping=TextWrapping.Wrap},MinHeight=42};AutomationProperties.SetName(remove,"确认删除聊天资料");form.Children.Add(remove);
        var feedback=Text("",13);form.Children.Add(feedback);dialogStatus=feedback;List<LibraryChat> cache=[];bool active=true;
        void Filter(){list.ItemsSource=cache.Where(x=>x.Name.Contains(search.Text.Trim(),StringComparison.OrdinalIgnoreCase)||x.Thread.Name.Contains(search.Text.Trim(),StringComparison.OrdinalIgnoreCase)).ToList();UpdateTaskButtons();}
        async Task Refresh()
        {
            try{var data=await Task.Run(Library.Read);if(!active)return;cache=data.Chats;Filter();details.Text=$"已保存{cache.Count}/20个会话，共{cache.Sum(x=>x.Thread.Lines.Count)}条消息。请选择一项。";}
            catch(Exception e){if(active){cache=[];Filter();details.Text=SafeError(e);}}
        }
        list.SelectionChanged+=(_,_)=>{remove.IsChecked=false;var item=list.SelectedItem as LibraryChat;name.Text=item?.Name??"";details.Text=item is null?"选择资料后可载入、改名或删除。":$"{item.Thread.Lines.Count}条消息 · 保存于{item.SavedAt.ToLocalTime():yyyy-MM-dd HH:mm} · "+(item.Analysis is null?"暂无已存分析。":"含已存分析，可直接查看，无需重新调用模型。");UpdateTaskButtons();};
        search.TextChanged+=(_,_)=>Filter();name.TextChanged+=(_,_)=>UpdateTaskButtons();remove.Checked+=(_,_)=>UpdateTaskButtons();remove.Unchecked+=(_,_)=>UpdateTaskButtons();
        var actions=new WrapPanel();actions.Children.Add(TaskButton("载入并继续分析",()=>_=Operate(async(token,view,revision)=>
        {
            var selected=(LibraryChat)list.SelectedItem;var data=await Task.Run(Library.Read,token);Guard(token,view,revision);
            var row=data.Chats.Find(x=>x.Id==selected.Id && x.UpdatedAt==selected.UpdatedAt)??throw new InvalidOperationException("资料已变化，请刷新后重新选择。");
            SetHistoryImport(new([row.Thread],0,row.Thread.Lines.Count(x=>!x.IsText),row.Chronological,"本机加密资料"));analysisSelf=row.Self;loadedLibraryId=row.Id;loadedLibraryUpdated=row.UpdatedAt;
            dialog.Close();Navigate("聊天分析");SetStatus("已载入本机资料，沿用已保存身份；核对化名摘录并允许后再生成。");
        }),true,ready:()=>list.SelectedItem is LibraryChat));
        actions.Children.Add(TaskButton("查看已存分析",()=>{var row=(LibraryChat)list.SelectedItem;BuildSavedHistoryDialog(row).ShowDialog();},ready:()=>list.SelectedItem is LibraryChat{Analysis:not null}));
        actions.Children.Add(TaskButton("保存改名",()=>_=Operate(async(token,view,revision)=>
        {
            var selected=(LibraryChat)list.SelectedItem;string label=name.Text;
            var renamed=await Task.Run(()=>Library.Rename(selected.Id,label,selected.UpdatedAt,token),token);
            Guard(token,view,revision);
            if(loadedLibraryId==selected.Id && loadedLibraryUpdated==selected.UpdatedAt)
                loadedLibraryUpdated=renamed.UpdatedAt;
            await Refresh();feedback.Text="资料已改名。";
        }),ready:()=>list.SelectedItem is LibraryChat item && name.Text.Trim().Length>0 && name.Text.Trim()!=item.Name));
        actions.Children.Add(TaskButton("删除资料",()=>_=Operate(async(token,view,revision)=>{var selected=(LibraryChat)list.SelectedItem;await Task.Run(()=>Library.Delete(selected.Id,selected.UpdatedAt,token),token);Guard(token,view,revision);if(loadedLibraryId==selected.Id)loadedLibraryId=null;await Refresh();feedback.Text="已删除选定资料；原导出文件与当前临时预览保留。";}),ready:()=>list.SelectedItem is LibraryChat && remove.IsChecked==true));
        actions.Children.Add(TaskButton("刷新列表",()=>_=Refresh()));DockPanel.SetDock(actions,Dock.Bottom);dock.Children.Add(actions);dock.Children.Add(Scroll(form));dialog.Content=dock;
        dialog.Closed+=(_,_)=>{active=false;Cancel();if(ReferenceEquals(dialogStatus,feedback))dialogStatus=null;};_=Refresh();return dialog;
    }
}
