using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using Microsoft.Win32;

namespace ChatQ.Windows;

public sealed partial class MainWindow
{
    private UIElement HistoryPage()
    {
        var dock=new DockPanel();var top=Heading("记录收藏","回复、润色和话题的已完成结果保存在本机，可搜索、收藏和再次使用。");
        var search=Box("搜索生成记录","",100);var favorites=new CheckBox {Content="只看收藏",MinHeight=42};top.Children.Add(search);top.Children.Add(favorites);DockPanel.SetDock(top,Dock.Top);dock.Children.Add(top);
        var list=Stack();
        void Refresh()
        {
            list.Children.Clear();var rows=state.ReplyHistory.Where(x=>(favorites.IsChecked!=true || x.Favorite) && (x.Text+x.Source+x.Persona).Contains(search.Text,StringComparison.OrdinalIgnoreCase)).OrderByDescending(x=>x.CreatedAt).ToArray();
            list.Children.Add(Text($"共 {rows.Length} 条 · 最多保留100条，收藏优先保留",12));
            if(rows.Length==0)list.Children.Add(EmptyState("这里还没有记录","生成回复后会自动保存；也可以调整搜索条件。"));
            foreach(var row in rows)
            {
                var panel=Stack();panel.Children.Add(Text((row.Favorite?"★ 收藏 · ":"")+row.Persona+" · "+row.CreatedAt.ToLocalTime().ToString("MM-dd HH:mm"),12,true));
                var text=Box("已保存的回复",row.Text,1000,true);text.IsReadOnly=true;text.MinHeight=50;panel.Children.Add(text);
                var tools=new WrapPanel();tools.Children.Add(Button("复制",()=>Copy(row.Text),true));
                tools.Children.Add(Button(row.Favorite?"取消收藏":"收藏",()=>{state=vault.Update(s=>{int i=s.ReplyHistory.FindIndex(x=>x.Id==row.Id);if(i>=0)s.ReplyHistory[i]=s.ReplyHistory[i] with {Favorite=!row.Favorite};});Refresh();}));
                tools.Children.Add(Button("继续润色",()=>{state=vault.Update(s=>{s.PolishDraft=row.Text;s.DraftUpdatedAt=DateTime.UtcNow;});input=null;mode="polish";navigation.SelectedItem="回复助手";}));
                panel.Children.Add(tools);var details=Stack();details.Children.Add(Text("原文："+row.Source,12));details.Children.Add(Button("删除这条",()=>{state=vault.Update(s=>s.ReplyHistory.RemoveAll(x=>x.Id==row.Id));Refresh();}));panel.Children.Add(new Expander {Header="查看原文与管理",Content=details});list.Children.Add(Card(panel));
            }
        }
        search.TextChanged+=(_,_)=>Refresh();favorites.Checked+=(_,_)=>Refresh();favorites.Unchecked+=(_,_)=>Refresh();Refresh();dock.Children.Add(Scroll(list));return dock;
    }
    private UIElement DataPage(bool unreadable=false)
    {
        var root=Stack();root.Children.Add(Heading("数据与更新","备份你的日常记录，手动检查新版。"));
        var summary=Stack();summary.Children.Add(Text("我的本机数据",18,true));summary.Children.Add(Text(unreadable?"本机数据暂时无法读取。恢复前会保留原文件；API配置可能需要重新填写。":$"{state.Conversations.Count} 个会话 · {state.ReplyHistory.Count} 条生成记录 · {state.Stickers.Count} 张自定义表情"));
        var actions=new WrapPanel();var export=Button("导出加密备份",()=>BuildBackupDialog(false).ShowDialog(),true);export.IsEnabled=!unreadable;actions.Children.Add(export);actions.Children.Add(Button("恢复备份",()=>BuildBackupDialog(true).ShowDialog()));summary.Children.Add(actions);summary.Children.Add(Text("备份包含会话、人设、草稿、生成记录及自定义表情，不包含 API 配置和密钥。",12));root.Children.Add(Card(summary));
        var updates=Stack();string current=typeof(MainWindow).Assembly.GetName().Version!.ToString(3);updates.Children.Add(Text("更新中心",18,true));updates.Children.Add(Text("当前版本："+current+" 预览版",14,true));
        var details=Text("点击检查后才会联网，不自动下载或安装。",13);updates.Children.Add(details);DesktopUpdate? available=null;
        var download=Button("打开新版安装包下载",()=>{if(available is not null)Process.Start(new ProcessStartInfo(available.Url){UseShellExecute=true});},true);download.IsEnabled=false;
        updates.Children.Add(TaskButton("检查更新",()=>_=Operate(async(token,view,revision)=>
        {
            SetStatus("正在检查更新…");using var http=new HttpClient(new SocketsHttpHandler {AllowAutoRedirect=false,UseCookies=false});
            using var response=await http.GetAsync(UpdateFeed.Address,HttpCompletionOption.ResponseHeadersRead,token);if(!response.IsSuccessStatusCode)throw new InvalidOperationException("暂时无法检查更新，请稍后再试。");
            using var stream=await response.Content.ReadAsStreamAsync(token);using var memory=new MemoryStream();byte[] buffer=new byte[4096];int n;while((n=await stream.ReadAsync(buffer,token))>0){if(memory.Length+n>20000)throw new InvalidOperationException("更新信息异常。");memory.Write(buffer,0,n);}
            var update=UpdateFeed.Parse(Encoding.UTF8.GetString(memory.ToArray()));Guard(token,view,revision);bool newer=Version.Parse(update.Version)>Version.Parse(current);available=newer?update:null;download.IsEnabled=newer;
            details.Text=newer?"发现新版 "+update.Version+"\n"+update.Notes+"\nSHA256："+update.Sha256:"当前已是最新版本。";SetStatus(newer?"发现新版，可主动下载。":"当前已是最新版本。");
        },false)));updates.Children.Add(download);root.Children.Add(Card(updates));return Scroll(root);
    }
    private static byte[] ReadLimited(string path,int limit)
    {
        using var file=File.OpenRead(path);if(file.Length>limit)throw new InvalidOperationException("文件过大，请先压缩或精简。");using var memory=new MemoryStream();byte[] block=new byte[8192];int n;
        while((n=file.Read(block))>0){if(memory.Length+n>limit)throw new InvalidOperationException("文件超过容量限制。");memory.Write(block,0,n);}return memory.ToArray();
    }
    private string[] ProtectedExportSources(IEnumerable<string>? extra=null)=>importedHistorySources.Concat(wechatCatalog?.Files.Select(f=>f.Path)??[]).Concat(extra??[]).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
    private void SaveUserFile(string path,byte[] data,CancellationToken token=default,IEnumerable<string>? sources=null,int maximumBytes=ChatImport.MaxBytes)=>ChatFileExport.Save(path,data,sources??ProtectedExportSources(),token,[vault.DirectoryPath],maximumBytes);
    private Window BuildBackupDialog(bool restore)
    {
        var dialog=Dialog(restore?"恢复加密备份":"导出加密备份",580,650);var dock=new DockPanel {Margin=new(20),Background=Background};var form=Stack();var bottom=Stack();var feedback=Text("备份密码至少8个字符。请自行保管，无法替你找回。",12);dialogStatus=feedback;
        PortableData? decoded=null;byte[]? fileBytes=null;var password=new PasswordBox {MaxLength=128};var confirm=new PasswordBox {MaxLength=128};AutomationProperties.SetName(password,"备份密码");AutomationProperties.SetName(confirm,"确认备份密码");
        form.Children.Add(Field("备份密码",password));
        var apply=Button("确认恢复",()=>{} ,true);apply.IsEnabled=false;var merge=new CheckBox {Content="合并到本机（相同ID保留本机内容）",IsChecked=true,MinHeight=42};var recover=new CheckBox {Content="数据不可读时，保留原文件并重建",IsChecked=false,MinHeight=42};
        if(!restore)
        {
            password.PasswordChanged+=(_,_)=>Cancel();confirm.PasswordChanged+=(_,_)=>Cancel();
            form.Children.Add(Field("再输入一次密码",confirm));form.Children.Add(Text("会话、人设、草稿、生成记录和表情会被密码加密。API地址、模型配置和密钥不会导出。",13));
            bottom.Children.Add(TaskButton("导出加密备份",()=>_=Operate(async(token,view,revision)=>
            {
                string secret=password.Password;if(secret!=confirm.Password)throw new InvalidOperationException("两次输入的密码不一致。");SetStatus("正在加密备份…");byte[] data=await Task.Run(()=>PortableBackup.Encrypt(vault.Read(),secret),token);Guard(token,view,revision);
                var picker=new SaveFileDialog {FileName="ChatQ-backup-"+DateTime.Now.ToString("yyyyMMdd")+".cqb",Filter="聊商加密备份|*.cqb",AddExtension=true};if(picker.ShowDialog(dialog)==true){SaveUserFile(picker.FileName,data);SetStatus("加密备份已保存，不包含API配置和密钥。");}
            }),true));
        }
        else
        {
            var fileLabel=Text("尚未选择备份文件",13);form.Children.Add(Button("选择备份文件",()=>{var picker=new OpenFileDialog {Filter="聊商加密备份|*.cqb"};if(picker.ShowDialog(dialog)!=true)return;Cancel();decoded=null;apply.IsEnabled=false;fileBytes=null;fileLabel.Text="新备份尚未载入，请重新选择有效的备份文件。";fileBytes=ReadLimited(picker.FileName,PortableBackup.MaxBytes);fileLabel.Text=Path.GetFileName(picker.FileName);}));form.Children.Add(fileLabel);
            var preview=Text("先解密并预览，确认内容后再恢复。",14);form.Children.Add(preview);
            form.Children.Add(TaskButton("解密并预览",()=>_=Operate(async(token,view,revision)=>{if(fileBytes is null)throw new InvalidOperationException("请先选择备份文件。");var encrypted=fileBytes;string secret=password.Password;SetStatus("正在解密备份…");var data=await Task.Run(()=>PortableBackup.Decrypt(encrypted,secret),token);Guard(token,view,revision);decoded=data;preview.Text=$"包含 {data.Conversations.Count} 个会话、{data.Personas.Count} 个人设、{data.ReplyHistory.Count} 条记录、{data.Stickers.Count} 张表情。\nAPI配置和密钥不会被覆盖。";apply.IsEnabled=true;SetStatus("预览完成，请选择恢复方式并确认。");},false)));
            form.Children.Add(merge);form.Children.Add(Text("关闭合并会替换本机聊天、人设、草稿和表情；API配置保持。合并超过容量时会停止，保留原数据。",12));form.Children.Add(recover);
            // Replace the no-op button; a single reviewed snapshot is applied atomically.
            apply=Button("确认恢复",()=>
            {
                if(decoded is null)throw new InvalidOperationException("请先解密并预览备份。");
                if((merge.IsChecked!=true || recover.IsChecked==true) && MessageBox.Show(dialog,"按当前选项恢复数据？原文件会保留为本机加密回滚文件，API配置不从备份导入。","确认恢复",MessageBoxButton.YesNo)!=MessageBoxResult.Yes)return;
                PauseHubForSettings();Cancel();state=vault.Restore(decoded,merge.IsChecked==true,recover.IsChecked==true);input=null;editingLastQuestion=false;chatId="";dialog.Close();Navigate("数据与更新");SetStatus("备份已恢复，请到“我的 API”核对当前配置。原文件已保留为本机加密回滚文件。");
            },true);apply.IsEnabled=false;bottom.Children.Add(apply);
            password.PasswordChanged+=(_,_)=>{Cancel();decoded=null;apply.IsEnabled=false;preview.Text="密码已修改，请重新解密预览。";};
        }
        var close=Button("关闭",dialog.Close);bottom.Children.Add(feedback);bottom.Children.Add(close);DockPanel.SetDock(bottom,Dock.Bottom);dock.Children.Add(bottom);dock.Children.Add(Scroll(form));dialog.Content=dock;
        dialog.Closed+=(_,_)=>{Cancel();password.Clear();confirm.Clear();if(ReferenceEquals(dialogStatus,feedback))dialogStatus=null;};return dialog;
    }
}
