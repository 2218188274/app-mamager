using System.Globalization;
using System.IO;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Microsoft.Win32;

namespace ChatQ.Windows;

public static class StickerArt
{
    public static readonly string[] Labels=["收到","抱抱","加油","晚安","谢谢","好耶"];
    public static BitmapSource BuiltIn(int index)
    {
        var colors=new[]{"#DFCFFF","#FFD6E7","#FFE4B5","#D6E4FF","#D3F3E0","#F9DBFF"};var visual=new DrawingVisual();
        using(var draw=visual.RenderOpen())
        {
            draw.DrawRoundedRectangle(new SolidColorBrush(Color.FromRgb(249,247,255)),null,new Rect(0,0,256,256),28,28);
            Geometry cloud=new EllipseGeometry(new Point(118,106),64,52);
            foreach(var circle in new[]{new EllipseGeometry(new Point(66,116),28,30),new EllipseGeometry(new Point(86,84),32,32),new EllipseGeometry(new Point(126,72),36,35),new EllipseGeometry(new Point(168,94),34,35),new EllipseGeometry(new Point(188,119),28,30)})cloud=new CombinedGeometry(GeometryCombineMode.Union,cloud,circle);
            var fill=new LinearGradientBrush(Colors.White,(Color)ColorConverter.ConvertFromString(colors[index%colors.Length]),90);draw.DrawGeometry(fill,new Pen(Brushes.MediumPurple,3),cloud);
            draw.DrawEllipse(Brushes.DarkSlateBlue,null,new Point(103,108),4,6);draw.DrawEllipse(Brushes.DarkSlateBlue,null,new Point(151,108),4,6);
            draw.DrawEllipse(new SolidColorBrush(Color.FromRgb(255,188,211)),null,new Point(84,124),9,5);draw.DrawEllipse(new SolidColorBrush(Color.FromRgb(255,188,211)),null,new Point(171,124),9,5);
            var mouth=new StreamGeometry();using(var path=mouth.Open()){path.BeginFigure(new Point(116,123),false,false);path.QuadraticBezierTo(new Point(128,142),new Point(140,123),true,false);}draw.DrawGeometry(null,new Pen(Brushes.DarkSlateBlue,3),mouth);
            var text=new FormattedText(Labels[index],CultureInfo.GetCultureInfo("zh-CN"),FlowDirection.LeftToRight,new Typeface(new FontFamily("Microsoft YaHei UI"),FontStyles.Normal,FontWeights.SemiBold,FontStretches.Normal),25,Brushes.DarkSlateBlue,1);draw.DrawText(text,new Point((256-text.Width)/2,190));
        }
        var result=new RenderTargetBitmap(256,256,96,96,PixelFormats.Pbgra32);result.Render(visual);result.Freeze();return result;
    }
    public static byte[] Png(BitmapSource source) {var encoder=new PngBitmapEncoder();encoder.Frames.Add(BitmapFrame.Create(source));using var data=new MemoryStream();encoder.Save(data);return data.ToArray();}
}
public sealed partial class MainWindow
{
    private static readonly (string Text,string Name)[] Emoji=[("😊","开心"),("😄","大笑"),("🥰","喜欢"),("😘","亲亲"),("🤗","抱抱"),("❤️","爱心"),("🥺","委屈"),("😭","哭泣"),("😅","尴尬"),("🤔","思考"),("🙃","无奈"),("😴","困了"),("😤","生气"),("🤭","偷笑"),("👋","你好"),("👍","点赞"),("👌","好的"),("🙏","谢谢"),("👏","鼓掌"),("💪","加油"),("☕","咖啡"),("✅","收到"),("(｡･ω･｡)ﾉ♡","打招呼"),("(づ｡◕‿‿◕｡)づ","抱抱"),("(๑•̀ㅂ•́)و✧","加油"),("ヾ(≧▽≦*)o","开心"),("(•̀ᴗ•́)و","没问题"),("(｡•́︿•̀｡)","委屈"),("( ˘ω˘ )","晚安"),("(人´∀`)","谢谢")];
    private UIElement StickersPage()=>StickersContent(null);
    private Window BuildStickersDialog(TextBox target)
    {
        var dialog=Dialog("表情和图片",760,760);var dock=new DockPanel {Margin=new(20),Background=Background};var footer=Stack();var feedback=Text("复制图片后请回聊天窗口自行粘贴。",12);dialogStatus=feedback;footer.Children.Add(feedback);footer.Children.Add(Button("关闭",dialog.Close));DockPanel.SetDock(footer,Dock.Bottom);dock.Children.Add(footer);dock.Children.Add(StickersContent(target));dialog.Content=dock;dialog.Closed+=(_,_)=>{if(ReferenceEquals(dialogStatus,feedback))dialogStatus=null;};return dialog;
    }
    private UIElement StickersContent(TextBox? target)
    {
        var dock=new DockPanel();var top=Heading("表情包","先预览，再主动复制图片或文字；回聊天窗口自行粘贴。");var search=Box("搜索表情","",60);top.Children.Add(search);
        var filters=new WrapPanel();var kind=new ComboBox {ItemsSource=new[]{"图片表情","Emoji与颜文字"},SelectedIndex=0,Width=170};var favorites=new CheckBox {Content="只看收藏",MinHeight=42,Margin=new(12,0,0,6)};filters.Children.Add(kind);filters.Children.Add(favorites);top.Children.Add(filters);var cards=new WrapPanel();
        void Refresh()
        {
            cards.Children.Clear();if(kind.SelectedIndex==1)
            {
                foreach(var emoji in Emoji.Where(x=>(x.Text+x.Name).Contains(search.Text,StringComparison.OrdinalIgnoreCase)))
                {var pane=Stack();pane.Children.Add(Text(emoji.Text,23));pane.Children.Add(Text(emoji.Name,12));pane.Children.Add(Button(target is null?"复制文字":"加入输入框",()=>{if(target is null)Copy(emoji.Text);else AppendAuxiliary(target,emoji.Text);}));cards.Children.Add(Card(pane));}
            }
            else
            {
                var rows=Enumerable.Range(0,StickerArt.Labels.Length).Select(i=>(Id:"cloud-"+i,Name:StickerArt.Labels[i],Source:(Func<BitmapSource>)(()=>StickerArt.BuiltIn(i)))).Concat(state.Stickers.Select(sticker=>(Id:sticker.Id,Name:sticker.Name,Source:(Func<BitmapSource>)(()=>{var editor=new SnapshotEditor();editor.Load(Convert.FromBase64String(sticker.Png));return editor.Working!;}))));
                foreach(var row in rows.Where(x=>(favorites.IsChecked!=true || state.StickerFavorites.Contains(x.Id)) && x.Name.Contains(search.Text,StringComparison.OrdinalIgnoreCase)).OrderByDescending(x=>state.StickerFavorites.Contains(x.Id)))
                {
                    var pane=Stack();BitmapSource bitmap;try{bitmap=row.Source();}catch(Exception e) when(e is InvalidOperationException or NotSupportedException or FileFormatException or ArgumentException){var broken=Stack();broken.Children.Add(Text(row.Name+" · 图片不可用",14,true));broken.Children.Add(Button("删除损坏表情",()=>{state=vault.Update(s=>{s.Stickers.RemoveAll(x=>x.Id==row.Id);s.StickerFavorites.Remove(row.Id);});Refresh();}));cards.Children.Add(Card(broken));continue;}pane.Children.Add(new Image {Source=bitmap,Width=112,Height=112,Margin=new(0,0,0,8)});pane.Children.Add(Text(row.Name,14,true));var tools=new WrapPanel();
                    tools.Children.Add(Button("复制图片",()=>{var data=new DataObject();data.SetImage(bitmap);data.SetData("PNG",new MemoryStream(StickerArt.Png(bitmap)));Clipboard.SetDataObject(data,true);SetStatus("图片已复制，请回聊天窗口自行粘贴。");},true));
                    tools.Children.Add(Button(state.StickerFavorites.Contains(row.Id)?"★ 收藏":"☆ 收藏",()=>{state=vault.Update(s=>{if(!s.StickerFavorites.Remove(row.Id))s.StickerFavorites.Add(row.Id);});Refresh();}));
                    pane.Children.Add(tools);var extra=Stack();extra.Children.Add(Button("导出PNG",()=>{var picker=new SaveFileDialog {FileName="聊商表情.png",Filter="PNG图片|*.png",AddExtension=true};if(picker.ShowDialog(Window.GetWindow(dock))==true){SaveUserFile(picker.FileName,StickerArt.Png(bitmap));SetStatus("表情图片已导出。");}}));
                    if(!row.Id.StartsWith("cloud-",StringComparison.Ordinal))extra.Children.Add(Button("删除表情",()=>{state=vault.Update(s=>{s.Stickers.RemoveAll(x=>x.Id==row.Id);s.StickerFavorites.Remove(row.Id);});Refresh();}));pane.Children.Add(new Expander {Header="更多",Content=extra});cards.Children.Add(Card(pane));
                }
            }
            if(cards.Children.Count==0)cards.Children.Add(EmptyState("没有找到表情","换个关键词，或导入你喜欢的PNG/JPEG图片。"));Reflow();
        }
        void Reflow(){int columns=cards.ActualWidth>=900 && textScale<=1.5?3:cards.ActualWidth>=580 && textScale<=1.5?2:1;int gap=columns>1?8:0;foreach(FrameworkElement card in cards.Children){card.Width=Math.Max(120,(cards.ActualWidth-gap*columns)/columns);card.Margin=new(0,0,gap,12);}}
        var import=Button("导入图片表情",()=>
        {
            var picker=new OpenFileDialog {Filter="图片|*.png;*.jpg;*.jpeg"};if(picker.ShowDialog(Window.GetWindow(dock))!=true)return;
            var editor=new SnapshotEditor();editor.Load(ReadLimited(picker.FileName,8_000_000));byte[]? png=null;
            foreach(int side in new[]{512,384,256,192,128}){try{png=editor.ExportPng(side,131072);break;}catch(InvalidOperationException){}}
            if(png is null)throw new InvalidOperationException("图片过于复杂，请先裁剪后重试。");string name=Path.GetFileNameWithoutExtension(picker.FileName);name=new string(name.Where(c=>!char.IsControl(c)).Take(20).ToArray());if(name.Length==0)name="我的表情";
            var sticker=new ImageSticker("custom-"+Guid.NewGuid().ToString("N"),name,Convert.ToBase64String(png));state=vault.Update(s=>{if(s.Stickers.Count>=20)throw new InvalidOperationException("最多导入20张表情，请先整理。");s.Stickers.Add(sticker);});Refresh();SetStatus("图片已加入本机加密表情库。");
        });top.Children.Add(import);DockPanel.SetDock(top,Dock.Top);dock.Children.Add(top);dock.Children.Add(Scroll(cards));cards.SizeChanged+=(_,_)=>Reflow();search.TextChanged+=(_,_)=>Refresh();kind.SelectionChanged+=(_,_)=>{favorites.Visibility=kind.SelectedIndex==0?Visibility.Visible:Visibility.Collapsed;Refresh();};favorites.Checked+=(_,_)=>Refresh();favorites.Unchecked+=(_,_)=>Refresh();Refresh();return dock;
    }
}
