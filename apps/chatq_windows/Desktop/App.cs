using System.IO.Pipes;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Markup;

namespace ChatQ.Windows;

public sealed class DesktopApp : Application
{
    private readonly CancellationTokenSource lifetime = new();
    private Mutex? instance;
    private HwndSource? source;
    private bool hotkey;
    [DllImport("user32.dll", SetLastError = true)] private static extern bool RegisterHotKey(IntPtr window, int id, uint modifiers, uint key);
    [DllImport("user32.dll")] private static extern bool UnregisterHotKey(IntPtr window, int id);
    [STAThread]
    public static int Main()
    {
        string pipe = "ChatQWindows-" + WindowsIdentity.GetCurrent().User!.Value;
        var desktop = new DesktopApp();
        desktop.instance = new Mutex(true, "Local\\" + pipe, out bool created);
        if (!created)
        {
            try { using var client = new NamedPipeClientStream(".", pipe, PipeDirection.Out); client.Connect(1500); client.WriteByte(1); }
            catch (IOException) { MessageBox.Show("聊商已在运行，请从任务栏打开。", "聊商"); }
            catch (TimeoutException) { MessageBox.Show("聊商正在启动，请稍后从任务栏打开。", "聊商"); }
            desktop.instance.Dispose(); return 0;
        }
        desktop.Resources = (ResourceDictionary)XamlReader.Parse(Theme);
        desktop.DispatcherUnhandledException += (_, e) => { MessageBox.Show("操作未完成，已保留现有数据。请重试或重新打开聊商。", "聊商"); e.Handled = true; };
        var main = new MainWindow(new Vault());
        main.SourceInitialized += (_, _) =>
        {
            var handle = new WindowInteropHelper(main).Handle;
            desktop.source = HwndSource.FromHwnd(handle); desktop.source?.AddHook(desktop.Hook);
            desktop.hotkey = RegisterHotKey(handle, 1, 0x4000 | 2 | 1, 0x51);
            main.HotkeyAvailable = desktop.hotkey;
        };
        _ = desktop.Listen(pipe, main);
        desktop.Run(main);
        desktop.lifetime.Cancel();
        if (desktop.hotkey && desktop.source is not null) UnregisterHotKey(desktop.source.Handle, 1);
        desktop.source?.RemoveHook(desktop.Hook); desktop.instance.ReleaseMutex(); desktop.instance.Dispose();
        desktop.lifetime.Dispose(); return 0;
    }
    private async Task Listen(string name, MainWindow main)
    {
        while (!lifetime.IsCancellationRequested)
        {
            try
            {
                using var pipe = new NamedPipeServerStream(name, PipeDirection.In, 1, PipeTransmissionMode.Byte,
                    PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
                await pipe.WaitForConnectionAsync(lifetime.Token);
                byte[] data = new byte[1]; using var timeout = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token); timeout.CancelAfter(2000);
                if (await pipe.ReadAsync(data, timeout.Token) == 1 && data[0] == 1)
                    await Dispatcher.InvokeAsync(() => { main.Show(); main.WindowState = WindowState.Normal; main.Activate(); });
            }
            catch (OperationCanceledException) { }
            catch (IOException) { await Task.Delay(500, lifetime.Token).ConfigureAwait(false); }
        }
    }
    private IntPtr Hook(IntPtr hwnd, int msg, IntPtr w, IntPtr l, ref bool handled)
    {
        if (msg == 0x0312 && w.ToInt32() == 1 && MainWindow is MainWindow main)
        { main.Show(); main.WindowState = WindowState.Normal; main.Activate(); handled = true; }
        return IntPtr.Zero;
    }
    public const string Theme = """
<ResourceDictionary xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">
  <SolidColorBrush x:Key="Accent" Color="#7054C8"/>
  <Style TargetType="Window"><Setter Property="FontFamily" Value="Microsoft YaHei UI"/><Setter Property="FontSize" Value="14"/><Setter Property="Foreground" Value="#252338"/><Setter Property="Background" Value="#F5F4F9"/></Style>
  <Style TargetType="Button"><Setter Property="MinHeight" Value="40"/><Setter Property="MinWidth" Value="70"/><Setter Property="Padding" Value="16,8"/><Setter Property="Margin" Value="0,0,8,8"/><Setter Property="Background" Value="#EDE9F7"/><Setter Property="Foreground" Value="#4F3C93"/><Setter Property="BorderThickness" Value="0"/><Setter Property="Cursor" Value="Hand"/><Setter Property="Template"><Setter.Value><ControlTemplate TargetType="Button"><Border x:Name="bg" Background="{TemplateBinding Background}" CornerRadius="9" Padding="{TemplateBinding Padding}"><ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/></Border><ControlTemplate.Triggers><Trigger Property="IsMouseOver" Value="True"><Setter TargetName="bg" Property="Opacity" Value="0.8"/></Trigger><Trigger Property="IsEnabled" Value="False"><Setter TargetName="bg" Property="Opacity" Value="0.45"/></Trigger><Trigger Property="IsKeyboardFocused" Value="True"><Setter TargetName="bg" Property="BorderBrush" Value="#7054C8"/><Setter TargetName="bg" Property="BorderThickness" Value="2"/></Trigger></ControlTemplate.Triggers></ControlTemplate></Setter.Value></Setter></Style>
  <Style TargetType="TextBox"><Setter Property="MinHeight" Value="40"/><Setter Property="Padding" Value="10,8"/><Setter Property="BorderBrush" Value="#D9D5E4"/><Setter Property="Margin" Value="0,4,0,12"/><Setter Property="VerticalContentAlignment" Value="Center"/></Style>
  <Style TargetType="PasswordBox"><Setter Property="MinHeight" Value="40"/><Setter Property="Padding" Value="10,8"/><Setter Property="BorderBrush" Value="#D9D5E4"/><Setter Property="Margin" Value="0,4,0,12"/></Style>
  <Style TargetType="ComboBox"><Setter Property="MinHeight" Value="40"/><Setter Property="Padding" Value="8,6"/><Setter Property="Margin" Value="0,4,12,12"/><Setter Property="MinWidth" Value="120"/></Style>
  <Style TargetType="ListBox"><Setter Property="BorderThickness" Value="0"/><Setter Property="Background" Value="Transparent"/><Setter Property="ScrollViewer.HorizontalScrollBarVisibility" Value="Disabled"/></Style>
  <Style TargetType="ListBoxItem"><Setter Property="Padding" Value="12,10"/><Setter Property="MinHeight" Value="44"/><Setter Property="Margin" Value="0,2"/><Setter Property="HorizontalContentAlignment" Value="Stretch"/></Style>
</ResourceDictionary>
""";
}
