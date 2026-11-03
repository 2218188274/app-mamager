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
    public static int Main(string[] args)
    {
        var request = LaunchRequests.FromArguments(args);
        string pipe = "ChatQWindows-" + WindowsIdentity.GetCurrent().User!.Value;
        var desktop = new DesktopApp();
        desktop.instance = new Mutex(true, "Local\\" + pipe, out bool created);
        if (!created)
        {
            try { using var client = new NamedPipeClientStream(".", pipe, PipeDirection.Out); client.Connect(1500); client.WriteByte((byte)request); }
            catch (IOException) { MessageBox.Show("聊商已在运行，请从任务栏打开。", "聊商"); }
            catch (TimeoutException) { MessageBox.Show("聊商正在启动，请稍后从任务栏打开。", "聊商"); }
            desktop.instance.Dispose(); return 0;
        }
        desktop.Resources = (ResourceDictionary)XamlReader.Parse(Theme);
        desktop.DispatcherUnhandledException += (_, e) => { MessageBox.Show("操作未完成，已保留现有数据。请重试或重新打开聊商。", "聊商"); e.Handled = true; };
        var main = new MainWindow(new Vault());
        main.AcceptLaunchRequest(request);
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
                if (await pipe.ReadAsync(data, timeout.Token) == 1 && LaunchRequests.IsValid(data[0]))
                    await Dispatcher.InvokeAsync(() => { main.AcceptLaunchRequest((LaunchRequest)data[0]); main.Show(); main.WindowState = WindowState.Normal; main.Activate(); });
            }
            catch (OperationCanceledException) { }
            catch (IOException) { try { await Task.Delay(500, lifetime.Token).ConfigureAwait(false); } catch (OperationCanceledException) { break; } }
        }
    }
    private IntPtr Hook(IntPtr hwnd, int msg, IntPtr w, IntPtr l, ref bool handled)
    {
        if (msg == 0x0312 && w.ToInt32() == 1 && MainWindow is MainWindow main)
        { main.Show(); main.WindowState = WindowState.Normal; main.Activate(); handled = true; }
        return IntPtr.Zero;
    }
    public const string Theme = VisualDesign.Theme;
}
