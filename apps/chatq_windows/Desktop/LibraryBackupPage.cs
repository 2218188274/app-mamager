using System.IO;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using Microsoft.Win32;

namespace ChatQ.Windows;

public sealed partial class MainWindow
{
    private void ChooseLibraryBackup()
    {
        var picker=new OpenFileDialog{Title="选择资料库加密备份",Filter="聊商资料库备份|*.cqlb"};if(picker.ShowDialog(this)!=true)return;
        byte[] bytes=ReadLimited(picker.FileName,LibraryBackup.MaxBytes);BuildLibraryBackupDialog(true,bytes,picker.FileName).ShowDialog();
    }
    private Window BuildLibraryBackupDialog(bool restore,byte[]? archive=null,string? source=null)
    {
        var dialog=Dialog(restore?"恢复资料库备份":"备份聊天资料库",590,670);var dock=new DockPanel{Margin=new(20),Background=Background};var form=Stack();var bottom=Stack();
        form.Children.Add(Text(restore?"预览资料备份":"加密备份资料",19,true));
        form.Children.Add(Text(restore?"仅新增缺少资料，同ID保留本机。不会调用AI。":"包含聊天原文和已存分析；独立密码保护，不含API密钥。",13));
        var help=Stack();help.Children.Add(Text(restore?"合并不改变API、消息助手或普通AI对话。若预览后本机资料变化，需要重新预览。":"可在其他Windows账号凭密码恢复；安卓暂不支持此格式。密码无法找回，请自行保管。",13));form.Children.Add(new Expander{Header="范围与注意事项",Content=help});
        var password=new PasswordBox{MaxLength=128};var repeat=new PasswordBox{MaxLength=128};AutomationProperties.SetName(password,"资料备份密码");AutomationProperties.SetName(repeat,"确认资料备份密码");form.Children.Add(Field("密码（8–128个字符）",password));
        var consent=new CheckBox{Content=new TextBlock{Text=restore?"已核对预览，允许将这些资料合并到本机":"允许导出所有已保存资料的加密备份",TextWrapping=TextWrapping.Wrap},MinHeight=42};AutomationProperties.SetName(consent,"确认资料备份操作");
        var feedback=Text(restore?"尚未写入任何数据。输入密码并解密预览。":"选择保存位置后才导出，不调用AI。",13);form.Children.Add(feedback);dialogStatus=feedback;ChatLibraryData? decoded=null;LibraryMergePreview? preview=null;
        if(restore)
        {
            form.Children.Add(TaskButton("解密资料并预览",()=>_=Operate(async(token,view,revision)=>
            {
                if(archive is null)throw new InvalidOperationException("请重新选择资料备份文件。");string secret=password.Password;
                var prepared=await Task.Run(()=>{var data=LibraryBackup.Decrypt(archive,secret,token);return (Data:data,Plan:ChatLibrary.PreviewMerge(Library.Read(),data));},token);Guard(token,view,revision);var data=prepared.Data;var plan=prepared.Plan;
                decoded=data;preview=plan;consent.IsChecked=false;
                feedback.Foreground=Muted;feedback.Text=$"备份{data.Chats.Count}份，含{data.Chats.Count(c=>c.Analysis is not null)}份分析。新增{plan.Added}份 · 重复{plan.Duplicate}份 · 冲突{plan.Conflicts}份（保留本机）。合并后{plan.Total}/20份，尚未写入。";UpdateTaskButtons();feedback.BringIntoView();
            }),ready:()=>archive is not null));
            form.Children.Add(consent);
            bottom.Children.Add(TaskButton("确认合并资料",()=>_=Operate(async(token,view,revision)=>
            {
                var data=decoded??throw new InvalidOperationException("请先解密预览。");var plan=preview??throw new InvalidOperationException("请重新预览。");
                await Task.Run(()=>Library.Merge(data,plan.CurrentFingerprint,token),token);Guard(token,view,revision);dialog.Close();SetStatus($"资料库合并完成，新增{plan.Added}份，原本机资料保留。没有发起模型请求。");
            }),true,ready:()=>decoded is not null && preview is not null && consent.IsChecked==true));
        }
        else
        {
            form.Children.Add(Field("再输入一次密码",repeat));form.Children.Add(consent);
            bottom.Children.Add(TaskButton("导出资料备份",()=>_=Operate(async(token,view,revision)=>
            {
                string secret=password.Password;if(secret!=repeat.Password)throw new InvalidOperationException("两次密码不一致。");
                byte[] bytes=await Task.Run(()=>LibraryBackup.Encrypt(Library.Read(),secret,token),token);Guard(token,view,revision);
                var picker=new SaveFileDialog{Title="保存资料库加密备份",FileName="ChatQ-library-"+DateTime.Now.ToString("yyyyMMdd")+".cqlb",Filter="聊商资料库备份|*.cqlb",AddExtension=true};
                if(picker.ShowDialog(dialog)!=true)return;if(!Path.GetExtension(picker.FileName).Equals(".cqlb",StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("请使用.cqlb扩展名。");
                await Task.Run(()=>SaveUserFile(picker.FileName,bytes,token,ProtectedExportSources(source is null?[]:[source])),token);Guard(token,view,revision);SetStatus("资料库加密备份已保存。其他Windows账号可凭密码恢复；请自行妥善保管。");
            }),true,ready:()=>consent.IsChecked==true && password.Password.Length>=8 && password.Password==repeat.Password));
        }
        void Invalidate(){Cancel();decoded=null;preview=null;consent.IsChecked=false;feedback.Foreground=Muted;feedback.Text=restore?"密码或选项已变化，请重新解密预览。":"输入密码后主动确认导出。";UpdateTaskButtons();}
        password.PasswordChanged+=(_,_)=>Invalidate();repeat.PasswordChanged+=(_,_)=>Invalidate();consent.Checked+=(_,_)=>UpdateTaskButtons();consent.Unchecked+=(_,_)=>{if(operation is not null)Cancel();UpdateTaskButtons();};
        var secondary=new WrapPanel();secondary.Children.Add(TaskButton("停止",Cancel,stop:true));secondary.Children.Add(Button("关闭",dialog.Close));bottom.Children.Add(secondary);DockPanel.SetDock(bottom,Dock.Bottom);dock.Children.Add(bottom);dock.Children.Add(Scroll(form));dialog.Content=dock;
        dialog.Closed+=(_,_)=>{Cancel();password.Clear();repeat.Clear();decoded=null;archive=null;if(ReferenceEquals(dialogStatus,feedback))dialogStatus=null;};return dialog;
    }
}
