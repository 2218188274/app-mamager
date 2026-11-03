using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;

namespace ChatQ.Windows;

public sealed class SnapshotEditor : DockPanel
{
    private readonly Canvas canvas=new() {Background=Brushes.White};
    private readonly Image image=new();
    private readonly ComboBox mode=new() {ItemsSource=new[]{"裁剪区域","遮挡区域"},SelectedIndex=0,Width=140};
    private readonly Slider zoom=new() {Minimum=.1,Maximum=2,Value=.5,Width=150,Margin=new(8),VerticalAlignment=VerticalAlignment.Center};
    private readonly TextBlock hint=new() {Text="选择图片后，拖动框选裁剪或遮挡区域。",TextWrapping=TextWrapping.Wrap,Margin=new(0,6,0,8)};
    private BitmapSource? original,working;
    private readonly List<Rect> masks=[];
    private Rect selection;
    private Point? origin;
    public event Action? Changed;
    public BitmapSource? Working => working;
    public SnapshotEditor()
    {
        var tools=new WrapPanel();tools.Children.Add(mode);tools.Children.Add(zoom);
        void Add(string name,Action action) { var b=new Button {Content=name};b.Click+=(_,_)=>{try{action();}catch(Exception){hint.Text="图片操作未完成，请重新选择清晰的PNG或JPEG图片。";}};tools.Children.Add(b); }
        Add("应用裁剪",()=>Crop(selection));Add("恢复原图",Reset);
        SetDock(tools,Dock.Top);Children.Add(tools);SetDock(hint,Dock.Bottom);Children.Add(hint);
        canvas.Children.Add(image);Children.Add(new ScrollViewer {Content=canvas,HorizontalScrollBarVisibility=ScrollBarVisibility.Auto,VerticalScrollBarVisibility=ScrollBarVisibility.Auto,MinHeight=160,Height=300});
        zoom.ValueChanged+=(_,_)=>Refresh();
        canvas.MouseLeftButtonDown+=(_,e)=>{if(working is null)return;origin=e.GetPosition(canvas);canvas.CaptureMouse();e.Handled=true;};
        canvas.MouseMove+=(_,e)=>{if(origin is not Point p || working is null)return;var q=e.GetPosition(canvas);selection=Clamp(new Rect(new Point(Math.Min(p.X,q.X)/zoom.Value,Math.Min(p.Y,q.Y)/zoom.Value),new Size(Math.Abs(q.X-p.X)/zoom.Value,Math.Abs(q.Y-p.Y)/zoom.Value)));Refresh();};
        canvas.MouseLeftButtonUp+=(_,_)=>{origin=null;canvas.ReleaseMouseCapture();if(mode.SelectedIndex==1 && !selection.IsEmpty && selection.Width>=2 && selection.Height>=2)Mask(selection);};
    }
    public void Load(byte[] bytes)
    {
        _=ImageHeader.Dimensions(bytes);
        if(bytes.Length is <12 or >8_000_000 || !(bytes.AsSpan(0,8).SequenceEqual(new byte[]{137,80,78,71,13,10,26,10}) || bytes[0]==255 && bytes[1]==216 && bytes[2]==255)) throw new InvalidOperationException("请选择8MB以内的PNG或JPEG图片。");
        using var stream=new MemoryStream(bytes);var decoder=BitmapDecoder.Create(stream,BitmapCreateOptions.PreservePixelFormat,BitmapCacheOption.OnLoad);var frame=decoder.Frames[0];Load(frame);
    }
    public void Load(BitmapSource bitmap)
    {
        if(bitmap.PixelWidth<4 || bitmap.PixelHeight<4 || bitmap.PixelWidth>16384 || bitmap.PixelHeight>16384 || (long)bitmap.PixelWidth*bitmap.PixelHeight>16_000_000) throw new InvalidOperationException("图片分辨率过大，请先裁剪到1600万像素以内。");
        original=bitmap.Clone();original.Freeze();working=original;masks.Clear();selection=Rect.Empty;zoom.Value=Math.Clamp(500.0/bitmap.PixelWidth,.1,1);Refresh();Changed?.Invoke();
    }
    private Rect Clamp(Rect value) { if(working is null)return Rect.Empty;value.Intersect(new Rect(0,0,working.PixelWidth,working.PixelHeight));return value; }
    public void Mask(Rect rect)
    {
        rect=Clamp(rect);if(rect.IsEmpty || rect.Width<2 || rect.Height<2)throw new InvalidOperationException("请框选需要遮挡的区域。");
        rect=Clamp(new Rect(Math.Max(0,Math.Floor(rect.Left)-1),Math.Max(0,Math.Floor(rect.Top)-1),Math.Ceiling(rect.Right)-Math.Max(0,Math.Floor(rect.Left)-1)+1,Math.Ceiling(rect.Bottom)-Math.Max(0,Math.Floor(rect.Top)-1)+1));
        if(masks.Count>=30)throw new InvalidOperationException("最多添加30块遮挡，请先裁剪图片。");masks.Add(rect);selection=Rect.Empty;Refresh();Changed?.Invoke();
    }
    public void Crop(Rect rect)
    {
        rect=Clamp(rect);if(rect.IsEmpty || rect.Width<4 || rect.Height<4)throw new InvalidOperationException("请先框选需要保留的区域。");
        int x=(int)Math.Floor(rect.X),y=(int)Math.Floor(rect.Y),w=Math.Min(working!.PixelWidth-x,(int)Math.Ceiling(rect.Width)),h=Math.Min(working.PixelHeight-y,(int)Math.Ceiling(rect.Height));
        working=new CroppedBitmap(RenderMasked(),new Int32Rect(x,y,w,h));working.Freeze();masks.Clear();selection=Rect.Empty;Refresh();Changed?.Invoke();
    }
    public void Reset() { if(original is null)return;working=original;masks.Clear();selection=Rect.Empty;Refresh();Changed?.Invoke(); }
    private BitmapSource RenderMasked()
    {
        if(working is null)throw new InvalidOperationException("请先选择截图。");
        var visual=new DrawingVisual();using(var draw=visual.RenderOpen()){draw.DrawImage(working,new Rect(0,0,working.PixelWidth,working.PixelHeight));foreach(var rect in masks)draw.DrawRectangle(Brushes.Black,null,rect);}
        var bitmap=new RenderTargetBitmap(working.PixelWidth,working.PixelHeight,96,96,PixelFormats.Pbgra32);bitmap.Render(visual);bitmap.Freeze();return bitmap;
    }
    public byte[] ExportPng(int side=1600,int maxBytes=2_500_000)
    {
        var bitmap=RenderMasked();double scale=Math.Min(1,(double)side/Math.Max(bitmap.PixelWidth,bitmap.PixelHeight));
        if(scale<1){var resized=new TransformedBitmap(bitmap,new ScaleTransform(scale,scale));resized.Freeze();bitmap=resized;}
        var encoder=new PngBitmapEncoder();encoder.Frames.Add(BitmapFrame.Create(bitmap));using var stream=new MemoryStream();encoder.Save(stream);if(stream.Length>maxBytes)throw new InvalidOperationException("图片内容较复杂，请继续裁剪后重试。");return stream.ToArray();
    }
    private void Refresh()
    {
        if(working is null)return;image.Source=working;image.Width=canvas.Width=working.PixelWidth*zoom.Value;image.Height=canvas.Height=working.PixelHeight*zoom.Value;
        while(canvas.Children.Count>1)canvas.Children.RemoveAt(1);
        void Rectangle(Rect rect,Brush fill,Brush stroke){var shape=new Rectangle {Width=rect.Width*zoom.Value,Height=rect.Height*zoom.Value,Fill=fill,Stroke=stroke,StrokeThickness=2,IsHitTestVisible=false};Canvas.SetLeft(shape,rect.X*zoom.Value);Canvas.SetTop(shape,rect.Y*zoom.Value);canvas.Children.Add(shape);}
        foreach(var rect in masks)Rectangle(rect,Brushes.Black,Brushes.Black);
        if(!selection.IsEmpty && selection.Width>0 && selection.Height>0)Rectangle(selection,new SolidColorBrush(Color.FromArgb(40,112,84,200)),Brushes.MediumPurple);
        hint.Text=$"{working.PixelWidth} × {working.PixelHeight} · 已遮挡 {masks.Count} 处。识别前请核对预览。";
    }
}
