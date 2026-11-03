using System.IO;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Threading;
using Microsoft.Win32;

namespace ChatQ.Windows;

public sealed partial class MainWindow
{
    private Button AuxiliaryButton(TextBox target)
    {
        var menu=new ContextMenu();var button=Button("添加内容",()=>menu.IsOpen=true);button.ContextMenu=menu;menu.PlacementTarget=button;
        foreach(var pair in new (string,Action)[]{("截图辅助回复",()=>BuildScreenshotDialog(target).ShowDialog()),("语音转文字",()=>BuildVoiceDialog(target).ShowDialog()),("表情和图片",()=>BuildStickersDialog(target).ShowDialog())})
        {var action=pair.Item2;var item=new MenuItem {Header=pair.Item1};item.Click+=(_,_)=>{try{action();}catch(Exception error){SetStatus(SafeError(error),true);}};menu.Items.Add(item);}return button;
    }
    private void AppendAuxiliary(TextBox target,string value)
    {
        value=value.Trim();if(value.Length==0)throw new InvalidOperationException("请先核对并填写文字。");
        if(!ReferenceEquals(target,input) || page is not ("回复助手" or "AI 对话"))throw new InvalidOperationException("输入页面已经切换，请关闭后重新打开辅助工具。");
        string text=target.Text.Trim();if(text.Length>0)text+="\n";text+=value;
        if(text.Length>target.MaxLength)throw new InvalidOperationException($"追加后超过{target.MaxLength}字，请先精简文字，或关闭工具后清空旧内容。");
        target.Text=text;SaveDraft();SetStatus("文字已追加到输入框，检查后再生成。");
    }
    private Window BuildScreenshotDialog(TextBox target)
    {
        var dialog=Dialog("截图辅助回复",780,860);var dock=new DockPanel {Margin=new(20),Background=Background};var form=Stack();var bottom=Stack();var feedback=Text("先裁剪、遮挡，再点击识别。只会发送当前预览图片到你配置的模型。",12);dialogStatus=feedback;
        var editor=new SnapshotEditor();var preview=Box("截图识别文字","",10000,true);preview.MinHeight=110;preview.MaxHeight=220;
        var side=new ComboBox {ItemsSource=new[]{"对方在左侧","对方在右侧"},SelectedIndex=0};AutomationProperties.SetName(side,"对方气泡方向");List<RecognizedLine>? recognized=null;bool filling=false,closed=false;
        void RefreshPreview(){if(recognized is null)return;filling=true;try{preview.Text=string.Join("\n",recognized.Where(x=>x.Side==(side.SelectedIndex==0?"left":"right")).Select(x=>x.Text));}finally{filling=false;}UpdateTaskButtons();}
        void LoadFile(){var picker=new OpenFileDialog {Filter="图片|*.png;*.jpg;*.jpeg"};if(picker.ShowDialog(dialog)==true)editor.Load(ReadLimited(picker.FileName,8_000_000));}
        var choose=new WrapPanel();choose.Children.Add(TaskButton("选择截图",LoadFile));choose.Children.Add(TaskButton("粘贴图片",()=>{if(!Clipboard.ContainsImage())throw new InvalidOperationException("剪贴板中没有图片，请先复制截图。");var bitmap=Clipboard.GetImage();if(bitmap is null)throw new InvalidOperationException("图片暂时无法打开。");editor.Load(bitmap);}));form.Children.Add(choose);form.Children.Add(editor);
        form.Children.Add(Field("选择对方的气泡方向",side));
        form.Children.Add(TaskButton("识别截图文字",()=>_=Operate(async(token,view,revision)=>
        {
            byte[] png=editor.ExportPng();filling=true;preview.Clear();filling=false;recognized=null;SetStatus("正在识别。需要当前模型支持图片理解…");
            var lines=await ai.RecognizeScreenshot(state.ActiveProfile??throw new InvalidOperationException("请先在“我的 API”配置支持图片理解的模型。"),png,token);Guard(token,view,revision);if(closed)return;recognized=lines;RefreshPreview();SetStatus("识别完成。请核对文字、说话方向和遮挡内容，再追加到输入框。");
        }),true,ready:()=>editor.Working is not null));
        form.Children.Add(Field("核对并编辑对方的话",preview,"识别可能有误，确认无误后再使用；不会直接生成或发送回复。"));
        editor.Changed+=()=>{Cancel();recognized=null;filling=true;preview.Clear();filling=false;SetStatus("图片已修改，请核对遮挡后重新识别。");UpdateTaskButtons();};
        side.SelectionChanged+=(_,_)=>RefreshPreview();preview.TextChanged+=(_,_)=>{if(!filling)Cancel();UpdateTaskButtons();};
        var actions=new WrapPanel();actions.Children.Add(TaskButton("确认并追加文字",()=>{AppendAuxiliary(target,preview.Text);dialog.Close();},true,ready:()=>preview.Text.Trim().Length>0));actions.Children.Add(TaskButton("停止",Cancel,stop:true));actions.Children.Add(Button("关闭",dialog.Close));bottom.Children.Add(feedback);bottom.Children.Add(actions);DockPanel.SetDock(bottom,Dock.Bottom);dock.Children.Add(bottom);dock.Children.Add(Scroll(form));dialog.Content=dock;
        dialog.Closed+=(_,_)=>{closed=true;Cancel();if(ReferenceEquals(dialogStatus,feedback))dialogStatus=null;};return dialog;
    }
    private Window BuildVoiceDialog(TextBox target,byte[]? initialAudio=null)
    {
        var dialog=Dialog("语音转文字",640,650);var dock=new DockPanel {Margin=new(20),Background=Background};var form=Stack();var bottom=Stack();var feedback=Text("开始录音只使用本机麦克风；点击识别才发送给当前供应商。",12);dialogStatus=feedback;
        byte[]? audio=null;MicrophoneCapture? capture=null;bool closed=false,filling=false,finishing=false;var timer=new DispatcherTimer {Interval=TimeSpan.FromMilliseconds(250)};var began=DateTime.UtcNow;
        var info=Text("尚未录音。可录制0.2–120秒，或导入PCM WAV。",14,true);var preview=Box("语音识别文字","",2000,true);preview.MinHeight=160;
        var stopRecord=Button("停止录音",()=>{});stopRecord.IsEnabled=false;
        async Task Finish()
        {
            if(capture is null || finishing)return;finishing=true;timer.Stop();var current=capture;stopRecord.IsEnabled=false;
            try{var value=await current.StopAsync();double duration=AudioClip.Duration(value);if(closed)return;audio=value;info.Text=$"录音已准备 · {duration:F1} 秒。确认后点击识别。";}
            catch(Exception e){if(!closed){audio=null;info.Text="录音未就绪，请重新录音或导入WAV。";SetStatus(SafeError(e),true);}}
            finally{capture=null;finishing=false;current.Dispose();if(!closed)UpdateTaskButtons();}
        }
        stopRecord=Button("停止录音",()=>_=Finish());stopRecord.IsEnabled=false;
        var tools=new WrapPanel();tools.Children.Add(TaskButton("开始录音",()=>{Cancel();audio=null;filling=true;preview.Clear();filling=false;capture=new MicrophoneCapture();began=DateTime.UtcNow;info.Text="录音中…";stopRecord.IsEnabled=true;timer.Start();UpdateTaskButtons();},ready:()=>capture is null));tools.Children.Add(stopRecord);
        tools.Children.Add(TaskButton("导入WAV音频",()=>{var picker=new OpenFileDialog {Filter="PCM WAV音频|*.wav"};if(picker.ShowDialog(dialog)!=true)return;Cancel();audio=null;filling=true;preview.Clear();filling=false;info.Text="新音频尚未就绪，请重新选择或核对文件格式。";UpdateTaskButtons();var value=ReadLimited(picker.FileName,AudioClip.MaxBytes);double duration=AudioClip.Duration(value);audio=value;info.Text=$"音频已准备 · {duration:F1} 秒。确认后点击识别。";UpdateTaskButtons();},ready:()=>capture is null));form.Children.Add(tools);form.Children.Add(info);
        timer.Tick+=(_,_)=>{if(capture is null)return;if(capture.Completion.IsCompleted)_=Finish();else info.Text=$"录音中 · {(DateTime.UtcNow-began).TotalSeconds:F0} 秒 / 120秒";};
        form.Children.Add(TaskButton("识别语音",()=>_=Operate(async(token,view,revision)=>{if(audio is null)throw new InvalidOperationException("请先录音或导入WAV。");var bytes=audio;SetStatus("正在转写语音，会调用你的语音模型…");string value=await ai.Transcribe(state.ActiveProfile??throw new InvalidOperationException("请先配置支持语音转写的 API。"),bytes,token);Guard(token,view,revision);if(closed)return;filling=true;try{preview.Text=value;}finally{filling=false;}SetStatus("转写完成，请核对后追加到输入框。");}),true,ready:()=>audio is not null && capture is null));
        form.Children.Add(Field("核对并编辑文字",preview));form.Children.Add(Text("语音模型可在“我的 API → 语音转写设置”填写。需要供应商支持 /audio/transcriptions。录音不写入聊天记录和备份。",12));
        preview.TextChanged+=(_,_)=>{if(!filling)Cancel();UpdateTaskButtons();};var actions=new WrapPanel();actions.Children.Add(TaskButton("确认并追加文字",()=>{AppendAuxiliary(target,preview.Text);dialog.Close();},true,ready:()=>preview.Text.Trim().Length>0 && capture is null));actions.Children.Add(TaskButton("停止识别",Cancel,stop:true));actions.Children.Add(Button("关闭",dialog.Close));bottom.Children.Add(feedback);bottom.Children.Add(actions);DockPanel.SetDock(bottom,Dock.Bottom);dock.Children.Add(bottom);dock.Children.Add(Scroll(form));dialog.Content=dock;
        if(initialAudio is not null){double duration=AudioClip.Duration(initialAudio);audio=initialAudio;info.Text=$"音频已准备 · {duration:F1} 秒。确认后点击识别。";UpdateTaskButtons();}
        dialog.Closed+=(_,_)=>{closed=true;timer.Stop();capture?.Dispose();Cancel();if(ReferenceEquals(dialogStatus,feedback))dialogStatus=null;};return dialog;
    }
}
