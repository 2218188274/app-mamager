using System.IO;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;
using Windows.Graphics.Imaging;

internal static class CalibrationWindow
{
    public static Task<bool> Show(SoftwareBitmap frame, Program.Calibration draft, string privatePath)
    {
        var completion = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        byte[] pixels = new byte[checked(frame.PixelWidth * frame.PixelHeight * 4)]; frame.CopyToBuffer(pixels.AsBuffer());
        int width = frame.PixelWidth, height = frame.PixelHeight;
        var thread = new Thread(() =>
        {
            bool saved = false; BitmapSource? bitmap = null; Image? preview = null;
            try
            {
                bitmap = BitmapSource.Create(width, height, 96, 96, PixelFormats.Bgra32, null, pixels, width * 4);
                CryptographicOperations.ZeroMemory(pixels);
                double previewHeight = Math.Clamp(SystemParameters.WorkArea.Height - 330, 160, 470);
                double scale = Math.Min(1, Math.Min(620d / width, previewHeight / height));
                double displayWidth = width * scale, displayHeight = height * scale;
                var window = new Window { Title = "聊商 · 微信只读接收校准", Width = Math.Max(510, displayWidth + 64), SizeToContent = SizeToContent.Height,
                    WindowStartupLocation = WindowStartupLocation.CenterScreen, ResizeMode = ResizeMode.NoResize, Background = new SolidColorBrush(Color.FromRgb(247, 248, 252)), FontFamily = new FontFamily("Microsoft YaHei"), FontSize = 15 };
                var panel = new StackPanel { Margin = new Thickness(24) }; window.Content = panel;
                panel.Children.Add(new TextBlock { Text = "框选左侧新消息区域", FontSize = 23, FontWeight = FontWeights.SemiBold });
                panel.Children.Add(new TextBlock { Text = "按住鼠标拖出矩形。选择左侧聊天空白追加区，排除标题、输入框和右侧消息。\n本界面只显示指定测试窗口，不上传图片、不发送消息。", TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 10, 0, 16), MaxWidth = Math.Max(460, displayWidth) });
                var canvas = new Canvas { Width = displayWidth, Height = displayHeight, Background = Brushes.White, ClipToBounds = true, Cursor = Cursors.Cross };
                preview = new Image { Source = bitmap, Width = displayWidth, Height = displayHeight }; canvas.Children.Add(preview);
                var selection = new Rectangle { Stroke = new SolidColorBrush(Color.FromRgb(93, 75, 194)), StrokeThickness = 2, Fill = new SolidColorBrush(Color.FromArgb(38, 93, 75, 194)), IsHitTestVisible = false };
                canvas.Children.Add(selection); panel.Children.Add(new Border { Child = canvas, BorderBrush = Brushes.LightGray, BorderThickness = new Thickness(1) });
                var status = new TextBlock { Text = "请先框选区域", Foreground = Brushes.DimGray, Margin = new Thickness(0, 12, 0, 10), TextWrapping = TextWrapping.Wrap }; panel.Children.Add(status);
                var confirm = new CheckBox { Content = new TextBlock { Text = "我确认这是允许测试的独立私聊窗口，所选区域只有约定测试内容。", TextWrapping = TextWrapping.Wrap }, MaxWidth = Math.Max(460, displayWidth), Margin = new Thickness(0, 0, 0, 14), MinHeight = 32 }; panel.Children.Add(confirm);
                var actions = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };
                var cancel = new Button { Content = "取消", MinWidth = 88, MinHeight = 40, Margin = new Thickness(0, 0, 10, 0), Padding = new Thickness(14, 6, 14, 6) };
                var save = new Button { Content = "保存校准", MinWidth = 112, MinHeight = 40, Padding = new Thickness(14, 6, 14, 6), IsEnabled = false, Background = new SolidColorBrush(Color.FromRgb(93, 75, 194)), Foreground = Brushes.White };
                actions.Children.Add(cancel); actions.Children.Add(save); panel.Children.Add(actions);
                System.Windows.Point? anchor = null; Program.Calibration? selected = null;
                void Update()
                {
                    selected = null;
                    if (selection.Width > 0 && selection.Height > 0)
                    {
                        var c = draft with { X = Canvas.GetLeft(selection) / displayWidth, Y = Canvas.GetTop(selection) / displayHeight,
                            Width = selection.Width / displayWidth, Height = selection.Height / displayHeight, SinglePrivateTestWindowConfirmed = true, TestContentOnlyConfirmed = true };
                        bool valid = c.X >= 0 && c.X <= .15 && c.Y >= .1 && c.Y <= .5 && c.Width >= .15 && c.Width <= .48 && c.Height >= .15 && c.Height <= .65 && c.X + c.Width <= .5 && c.Y + c.Height <= .8 &&
                            c.Width * width >= 40 && c.Height * height >= 40;
                        selected = valid ? c : null;
                        status.Text = valid ? "区域已选定。保存后测试仍未启动；请保留微信窗口的大小和位置。" : "区域不合适：请框选窗口左半侧中部，避开标题、输入框，至少保留一块消息追加空间。";
                    }
                    save.IsEnabled = selected is not null && confirm.IsChecked == true && anchor is null;
                }
                canvas.MouseLeftButtonDown += (_, e) => { anchor = e.GetPosition(canvas); selection.Width = selection.Height = 0; Canvas.SetLeft(selection, anchor.Value.X); Canvas.SetTop(selection, anchor.Value.Y); save.IsEnabled = false; canvas.CaptureMouse(); };
                canvas.MouseMove += (_, e) =>
                {
                    if (anchor is not { } start) return;
                    var point = e.GetPosition(canvas); double x = Math.Clamp(point.X, 0, displayWidth), y = Math.Clamp(point.Y, 0, displayHeight);
                    Canvas.SetLeft(selection, Math.Min(start.X, x)); Canvas.SetTop(selection, Math.Min(start.Y, y)); selection.Width = Math.Abs(x - start.X); selection.Height = Math.Abs(y - start.Y);
                };
                canvas.MouseLeftButtonUp += (_, _) => { anchor = null; canvas.ReleaseMouseCapture(); Update(); };
                confirm.Checked += (_, _) => Update(); confirm.Unchecked += (_, _) => Update();
                cancel.Click += (_, _) => window.Close();
                save.Click += (_, _) =>
                {
                    if (selected is null || confirm.IsChecked != true) return;
                    try
                    {
                        string temporary = privatePath + ".tmp";
                        File.WriteAllText(temporary, JsonSerializer.Serialize(selected, new JsonSerializerOptions { WriteIndented = true }), new UTF8Encoding(false));
                        File.Move(temporary, privatePath, overwrite: true); saved = true; window.Close();
                    }
                    catch { status.Text = "无法保存到本机私有目录，请检查路径后重试。"; }
                };
                var application = new Application(); application.Run(window);
                preview.Source = null; bitmap = null; completion.TrySetResult(saved);
            }
            catch { completion.TrySetResult(false); }
            finally { CryptographicOperations.ZeroMemory(pixels); if (preview is not null) preview.Source = null; bitmap = null; }
        });
        thread.SetApartmentState(ApartmentState.STA); thread.IsBackground = true; thread.Start(); return completion.Task;
    }
}
