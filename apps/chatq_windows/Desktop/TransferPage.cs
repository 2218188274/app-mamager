using System.IO;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using Microsoft.Win32;

namespace ChatQ.Windows;

public sealed partial class MainWindow
{
    private const string TransferScope="跨端文件包含人设的名称/指令/示例、收藏句文字和AI对话主线文字。最多20个人设、100句收藏、50个会话且每个50轮。其他标签、长度偏好、会话背景、分支、附件、草稿、图片表情及聊天资料库不迁移；原设备内容保留。API配置、密钥、自动回复账号及规则不迁移。";
    private Window BuildTransferDialog(bool restore,byte[]? supplied=null)
    {
        var dialog=Dialog(restore?"从安卓或Windows导入":"导出给安卓或Windows",560,650);var dock=new DockPanel{Margin=new(20),Background=Background};var form=Stack();var bottom=Stack();var feedback=Text("先核对范围；密码至少8个字符。",13);dialogStatus=feedback;
        var note=Stack();note.Children.Add(Text(TransferScope,13));form.Children.Add(new Expander{Header="迁移范围与容量",Content=note,IsExpanded=false});
        var password=new PasswordBox{MaxLength=128};AutomationProperties.SetName(password,"跨端迁移密码");form.Children.Add(Field("迁移密码（8–128个字符）",password));var repeat=new PasswordBox{MaxLength=128};AutomationProperties.SetName(repeat,"确认迁移密码");
        var consent=new CheckBox{Content=Text(restore?"已核对预览，合并到本机；冲突保留本机":"已了解迁移范围，导出加密文件",13),MinHeight=42};AutomationProperties.SetName(consent,"跨端迁移确认");
        byte[]? bytes=supplied;TransferData? decoded=null;TransferPreview? preview=null;string? source=null;
        void Invalidate(){Cancel();decoded=null;preview=null;consent.IsChecked=false;feedback.Foreground=Muted;feedback.Text="密码或文件变化，请重新核对。";UpdateTaskButtons();}
        if(restore)
        {
            form.Children.Add(Button("选择跨端文件",()=>{var picker=new OpenFileDialog{Filter="聊商跨端文件|*.cqtransfer"};if(picker.ShowDialog(dialog)!=true)return;Invalidate();bytes=null;source=picker.FileName;bytes=ReadLimited(source,SharedTransfer.MaxBytes);}));
            form.Children.Add(TaskButton("解密并预览",()=>_=Operate(async(token,view,revision)=>{if(bytes is null)throw new InvalidOperationException("先选择.cqtransfer文件。");var encrypted=bytes;string secret=password.Password;SetStatus("正在解密并核对跨端资料…");var result=await Task.Run(()=>{var data=SharedTransfer.Decrypt(encrypted,secret,token);return(data,SharedTransfer.Merge(vault.Read(),data).Preview);},token);Guard(token,view,revision);decoded=result.data;preview=result.Preview;consent.IsChecked=false;feedback.Foreground=Muted;feedback.Text=$"来自{(decoded.Source=="android"?"安卓":"Windows")}：{decoded.Personas.Count}个人设 · {decoded.Favorites.Count}句收藏 · {decoded.Conversations.Count}个会话。\n新增{preview.Added} · 重复{preview.Duplicate} · 冲突{preview.Conflict}（保留本机）；尚未写入。";UpdateTaskButtons();},false),ready:()=>bytes is not null));
            bottom.Children.Add(TaskButton("确认合并",()=>_=Operate(async(token,view,revision)=>{if(decoded is null||preview is null)throw new InvalidOperationException("请先预览。");PauseHubForSettings();var data=decoded;string expected=preview.Fingerprint;UserState updated;try{updated=await Task.Run(()=>vault.ApplyTransfer(data,expected,token),token);}catch{decoded=null;preview=null;consent.IsChecked=false;UpdateTaskButtons();throw;}Guard(token,view,revision);state=updated;dialog.Close();Navigate("数据与更新");SetStatus("跨端资料已合并。可在数据页撤销本次新增；已有内容未替换。");}),true,ready:()=>decoded is not null&&preview is not null&&consent.IsChecked==true));
        }
        else
        {
            form.Children.Add(Field("再次输入密码",repeat));form.Children.Add(Text("人设文本、收藏句和AI对话主线将被密码加密。范围详情可展开核对。",13));
            bottom.Children.Add(TaskButton("导出跨端文件",()=>_=Operate(async(token,view,revision)=>{string secret=password.Password;if(secret!=repeat.Password)throw new InvalidOperationException("两次密码不一致。");var data=await Task.Run(()=>SharedTransfer.Encrypt(SharedTransfer.Export(vault.Read()),secret,token),token);Guard(token,view,revision);var picker=new SaveFileDialog{FileName="ChatQ-transfer-"+DateTime.Now.ToString("yyyyMMdd")+".cqtransfer",Filter="聊商跨端文件|*.cqtransfer",AddExtension=true};if(picker.ShowDialog(dialog)!=true)return;if(!Path.GetExtension(picker.FileName).Equals(".cqtransfer",StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("请使用.cqtransfer扩展名。");await Task.Run(()=>SaveUserFile(picker.FileName,data,token,ProtectedExportSources(source is null?[]:[source])),token);Guard(token,view,revision);SetStatus("跨端文件已加密保存；请在另一端手动选择并预览。");}),true,ready:()=>consent.IsChecked==true&&password.Password.Length>=8&&password.Password==repeat.Password));
        }
        password.PasswordChanged+=(_,_)=>Invalidate();repeat.PasswordChanged+=(_,_)=>Invalidate();consent.Checked+=(_,_)=>UpdateTaskButtons();consent.Unchecked+=(_,_)=>UpdateTaskButtons();form.Children.Add(consent);bottom.Children.Add(feedback);var secondary=new WrapPanel();secondary.Children.Add(TaskButton("停止",Cancel,stop:true));secondary.Children.Add(Button("关闭",dialog.Close));bottom.Children.Add(secondary);DockPanel.SetDock(bottom,Dock.Bottom);dock.Children.Add(bottom);dock.Children.Add(Scroll(form));dialog.Content=dock;
        dialog.Closed+=(_,_)=>{Cancel();password.Clear();repeat.Clear();decoded=null;bytes=null;if(ReferenceEquals(dialogStatus,feedback))dialogStatus=null;};return dialog;
    }
}
