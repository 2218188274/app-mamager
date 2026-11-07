using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using ChatQ.Windows;
using Windows.Globalization;
using Windows.Graphics.Capture;
using Windows.Graphics.DirectX;
using Windows.Graphics.DirectX.Direct3D11;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;

[assembly: DefaultDllImportSearchPaths(DllImportSearchPath.System32)]

// Separate read-only diagnostic, deliberately excluded from installer/portable packages.
// --check and --self-test never enumerate/capture/control another application.
internal static partial class Program
{
    internal sealed record Calibration(string Title, string Executable, double X, double Y, double Width, double Height,
        string ExpectedText, bool SinglePrivateTestWindowConfirmed, bool TestContentOnlyConfirmed, int Seconds = 90);
    private sealed class ProbeFailure(string code) : Exception { public string Code { get; } = code; }
    private static void Emit(object value) => Console.WriteLine(JsonSerializer.Serialize(value));

    [STAThread]
    private static async Task<int> Main(string[] args)
    {
        try
        {
            if (args is ["--check"])
            {
                Emit(new { status = "metadata_only", captureSupported = GraphicsCaptureSession.IsSupported(), chineseOcrAvailable = Engine() is not null,
                    screenshots = 0, aiCalls = 0, messagesSent = 0 }); return 0;
            }
            if (args is ["--self-test"]) return await SelfTest();
            if (args is ["--self-test-sequence"]) return await SequenceSelfTest();
            if (args is ["--calibrate", var privatePath, "--accept-test-window-capture"])
            {
                if (!Path.IsPathFullyQualified(privatePath) || new FileInfo(privatePath).Length > 8192) throw new ProbeFailure("invalid_calibration");
                var draft = JsonSerializer.Deserialize<Calibration>(File.ReadAllText(privatePath)) ?? throw new ProbeFailure("invalid_calibration");
                // Validate coordinates and scope without changing either user's confirmation flag.
                Validate(draft with { SinglePrivateTestWindowConfirmed = true, TestContentOnlyConfirmed = true });
                var guard = WindowGuard.Bind(draft.Title, draft.Executable, requireForeground: false);
                using var calibrationTimeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
                using var frame = await Capture(guard.Handle, calibrationTimeout.Token);
                guard.Check(requireForeground: false);
                bool saved = await CalibrationWindow.Show(frame, draft, privatePath);
                Emit(new { status = saved ? "calibration_saved" : "calibration_cancelled", aiCalls = 0, messagesSent = 0, listenerStarted = false });
                return saved ? 0 : 2;
            }
            if (args is not [var mode, var configPath, "--accept-test-window-capture"] || mode is not ("--listen" or "--listen-sequence"))
                throw new ProbeFailure("explicit_capture_argument_required");
            // This switch is a product-level opt-in, not authorization for agent-driven live testing.
            // The invoking person still has to approve the exact capture scope before this mode runs.
            if (!Path.IsPathFullyQualified(configPath) || new FileInfo(configPath).Length > 8192) throw new ProbeFailure("invalid_calibration");
            var calibration = JsonSerializer.Deserialize<Calibration>(File.ReadAllText(configPath)) ?? throw new ProbeFailure("invalid_calibration");
            Validate(calibration);
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(calibration.Seconds));
            await Listen(calibration, mode == "--listen-sequence" ? 3 : 1, timeout.Token); return 0;
        }
        catch (ProbeFailure failure) { Emit(new { status = failure.Code, aiCalls = 0, messagesSent = 0, automaticReplyEnabled = false }); return 2; }
        catch (OperationCanceledException) { Emit(new { status = "stopped_or_timed_out", aiCalls = 0, messagesSent = 0 }); return 3; }
        catch { Emit(new { status = "probe_failed_no_retry", aiCalls = 0, messagesSent = 0 }); return 4; } // Never print titles, paths, OCR, exception text or screenshots.
    }

    private static OcrEngine? Engine() => OcrEngine.TryCreateFromLanguage(new Language("zh-Hans"));
    private static void Validate(Calibration c)
    {
        if (!c.SinglePrivateTestWindowConfirmed || !c.TestContentOnlyConfirmed || string.IsNullOrWhiteSpace(c.Title) || c.Title.Length > 100 ||
            c.Title.Any(char.IsControl) || !Path.IsPathFullyQualified(c.Executable) || !Path.GetFileName(c.Executable).Equals("Weixin.exe", StringComparison.OrdinalIgnoreCase) ||
            c.ExpectedText != "聊商连接测试" || c.Seconds is <10 or >90 ||
            !double.IsFinite(c.X + c.Y + c.Width + c.Height) || c.X < 0 || c.X > .15 || c.Y < .1 || c.Y > .5 ||
            c.Width is <.15 or >.48 || c.Height is <.15 or >.65 || c.X + c.Width > .5 || c.Y + c.Height > .8)
            throw new ProbeFailure("invalid_calibration");
    }

    private static async Task Listen(Calibration calibration, int maximumMatches, CancellationToken token)
    {
        var engine = Engine() ?? throw new ProbeFailure("local_chinese_ocr_unavailable");
        if (!GraphicsCaptureSession.IsSupported()) throw new ProbeFailure("window_capture_unavailable");
        var guard = WindowGuard.Bind(calibration.Title, calibration.Executable, requireForeground: false);
        Emit(new { status = "waiting_for_test_window_foreground", screenshots = 0, aiCalls = 0, messagesSent = 0 });
        while (!guard.IsForeground)
        {
            token.ThrowIfCancellationRequested(); guard.Check(requireForeground: false);
            await Task.Delay(300, token);
        }
        using var receiver = new WechatOcrReceiver();
        int frames = 0, fullWidth = 0, fullHeight = 0, matches = 0;
        async Task ObserveCurrentFrame(CancellationToken cancellation)
        {
            guard.Check();
            using var full = await Capture(guard.Handle, cancellation);
            guard.Check();
            if (frames == 0) { fullWidth = full.PixelWidth; fullHeight = full.PixelHeight; }
            else if (full.PixelWidth != fullWidth || full.PixelHeight != fullHeight) throw new ProbeFailure("layout_changed");
            using var crop = Crop(full, calibration);
            byte[] pixels = new byte[checked(crop.PixelWidth * crop.PixelHeight * 4)];
            try
            {
                crop.CopyToBuffer(pixels.AsBuffer());
                receiver.Observe(pixels, crop.PixelWidth, crop.PixelHeight);
                frames++;
            }
            finally { CryptographicOperations.ZeroMemory(pixels); }
        }
        while (receiver.Active)
        {
            token.ThrowIfCancellationRequested();
            await ObserveCurrentFrame(token);
            if (frames == 1) Emit(new { status = receiver.Status, frames, initialFrameOcr = false });
            if (!receiver.Active) throw new ProbeFailure(receiver.Status);
            WechatOcrReception? reception;
            try
            {
                reception = await receiver.ReadNext(async (candidate, cancellation) =>
                {
                    using var image = new SoftwareBitmap(BitmapPixelFormat.Bgra8, candidate.Width, candidate.Height, BitmapAlphaMode.Ignore);
                    image.CopyFromBuffer(candidate.Pixels.AsBuffer());
                    var result = await engine.RecognizeAsync(image).AsTask(cancellation);
                    // Re-capture after OCR. A changed window or candidate invalidates a late result.
                    try { await ObserveCurrentFrame(cancellation); }
                    catch (ProbeFailure failure) { receiver.Stop(failure.Code); throw; }
                    return result.Text;
                }, token);
            }
            catch (InvalidOperationException) when (!receiver.Active) { throw new ProbeFailure(receiver.Status); }
            catch (OperationCanceledException) when (!token.IsCancellationRequested && !receiver.Active) { throw new ProbeFailure(receiver.Status); }
            if (reception is not null)
            {
                guard.Check();
                bool matched = string.Concat(reception.Text.Where(c => !char.IsWhiteSpace(c))) == calibration.ExpectedText;
                if (matched) matches++;
                Emit(new { status = matched ? "new_test_text_detected" : "new_region_did_not_match", frames,
                    expectedTextMatched = matched, matchedCount = matches, maximumMatches, initialFrameOcr = false,
                    accountIdentityVerified = false, realMessageHubConnected = false, aiCalls = 0, messagesSent = 0,
                    automaticReplyEnabled = false });
                if (!matched || matches >= maximumMatches) return;
            }
            if (!receiver.Active) throw new ProbeFailure(receiver.Status);
            await Task.Delay(1200, token);
        }
    }

    private static SoftwareBitmap Crop(SoftwareBitmap full, Calibration c)
    {
        int x = (int)(full.PixelWidth * c.X), y = (int)(full.PixelHeight * c.Y), width = (int)(full.PixelWidth * c.Width), height = (int)(full.PixelHeight * c.Height);
        if (width < 40 || height < 40 || width > OcrEngine.MaxImageDimension || height > OcrEngine.MaxImageDimension) throw new ProbeFailure("crop_size_unsupported");
        byte[] source = new byte[checked(full.PixelWidth * full.PixelHeight * 4)], target = new byte[checked(width * height * 4)];
        try
        {
            full.CopyToBuffer(source.AsBuffer());
            for (int row = 0; row < height; row++) source.AsSpan(((y + row) * full.PixelWidth + x) * 4, width * 4).CopyTo(target.AsSpan(row * width * 4));
            var bitmap = new SoftwareBitmap(BitmapPixelFormat.Bgra8, width, height, BitmapAlphaMode.Ignore);
            try { bitmap.CopyFromBuffer(target.AsBuffer()); return bitmap; } catch { bitmap.Dispose(); throw; }
        }
        finally { CryptographicOperations.ZeroMemory(source); CryptographicOperations.ZeroMemory(target); }
    }

    private static async Task<int> SelfTest()
    {
        var engine = Engine();
        if (engine is null) { Emit(new { status = "synthetic_ocr_unavailable", realWindowCaptures = 0, aiCalls = 0, messagesSent = 0 }); return 2; }
        // Render only locally authored synthetic text. This creates no Window and captures no screen.
        const int width = 640, height = 180;
        var visual = new DrawingVisual();
        using (var drawing = visual.RenderOpen())
        {
            drawing.DrawRectangle(Brushes.White, null, new Rect(0, 0, width, height));
            drawing.DrawText(new FormattedText("聊商连接测试", System.Globalization.CultureInfo.GetCultureInfo("zh-CN"), FlowDirection.LeftToRight,
                new Typeface("Microsoft YaHei"), 46, Brushes.Black, 1), new System.Windows.Point(24, 60));
        }
        var render = new RenderTargetBitmap(width, height, 96, 96, PixelFormats.Pbgra32); render.Render(visual);
        byte[] pixels = new byte[width * height * 4]; render.CopyPixels(pixels, width * 4, 0);
        try
        {
            using var bitmap = new SoftwareBitmap(BitmapPixelFormat.Bgra8, width, height, BitmapAlphaMode.Ignore); bitmap.CopyFromBuffer(pixels.AsBuffer());
            var result = await engine.RecognizeAsync(bitmap);
            bool matched = result.Lines.Any(line => string.Concat(line.Text.Where(c => !char.IsWhiteSpace(c))) == "聊商连接测试");
            Emit(new { status = matched ? "synthetic_ocr_passed" : "synthetic_ocr_mismatch", expectedTextMatched = matched, realWindowCaptures = 0, aiCalls = 0, messagesSent = 0 });
            return matched ? 0 : 2;
        }
        finally { CryptographicOperations.ZeroMemory(pixels); }
    }

    private static async Task<SoftwareBitmap> Capture(nint window, CancellationToken token)
    {
        nint nativeDevice = 0, context = 0, dxgi = 0, inspectable = 0, factory = 0, itemPointer = 0, name = 0;
        IDirect3DDevice? device = null; GraphicsCaptureItem? item = null; IGraphicsCaptureItemInterop? interop = null;
        string stage = "device";
        try
        {
            Marshal.ThrowExceptionForHR(D3D11CreateDevice(0, 1, 0, 0x20, 0, 0, 7, out nativeDevice, out _, out context));
            var dxgiId = new Guid("54ec77fa-1377-44e6-8c32-88fd5f44c84c"); Marshal.ThrowExceptionForHR(Marshal.QueryInterface(nativeDevice, in dxgiId, out dxgi));
            Marshal.ThrowExceptionForHR(CreateDirect3D11DeviceFromDXGIDevice(dxgi, out inspectable));
            device = WinRT.MarshalInterface<IDirect3DDevice>.FromAbi(inspectable);
            stage = "factory";
            string runtime = "Windows.Graphics.Capture.GraphicsCaptureItem";
            Marshal.ThrowExceptionForHR(WindowsCreateString(runtime, runtime.Length, out name));
            var interopId = typeof(IGraphicsCaptureItemInterop).GUID;
            Marshal.ThrowExceptionForHR(RoGetActivationFactory(name, ref interopId, out factory));
            interop = (IGraphicsCaptureItemInterop)Marshal.GetObjectForIUnknown(factory);
            stage = "item";
            var itemId = new Guid("79c3f95b-31f7-4ec2-a464-632ef5d30760");
            Marshal.ThrowExceptionForHR(interop.CreateForWindow(window, ref itemId, out itemPointer));
            item = WinRT.MarshalInspectable<GraphicsCaptureItem>.FromAbi(itemPointer);
            if (item.Size.Width is <100 or >4096 || item.Size.Height is <100 or >4096 || (long)item.Size.Width * item.Size.Height > 8_000_000) throw new ProbeFailure("window_size_unsupported");
            stage = "frame_pool";
            using var pool = Direct3D11CaptureFramePool.CreateFreeThreaded(device, DirectXPixelFormat.B8G8R8A8UIntNormalized, 1, item.Size);
            using var session = pool.CreateCaptureSession(item); session.IsCursorCaptureEnabled = false;
            var completion = new TaskCompletionSource<SoftwareBitmap>(TaskCreationOptions.RunContinuationsAsynchronously);
            int claimed = 0;
            pool.FrameArrived += async (sender, _) =>
            {
                try
                {
                    using var frame = sender.TryGetNextFrame();
                    if (frame is null || Interlocked.CompareExchange(ref claimed, 1, 0) != 0) return;
                    if (frame.ContentSize.Width != item.Size.Width || frame.ContentSize.Height != item.Size.Height) throw new ProbeFailure("layout_changed");
                    using var raw = await SoftwareBitmap.CreateCopyFromSurfaceAsync(frame.Surface);
                    var converted = SoftwareBitmap.Convert(raw, BitmapPixelFormat.Bgra8, BitmapAlphaMode.Ignore);
                    if (!completion.TrySetResult(converted)) converted.Dispose();
                }
                catch { completion.TrySetException(new ProbeFailure("capture_failed")); }
            };
            session.StartCapture();
            stage = "frame";
            using var limit = CancellationTokenSource.CreateLinkedTokenSource(token); limit.CancelAfter(TimeSpan.FromSeconds(5));
            try { return await completion.Task.WaitAsync(limit.Token); }
            catch { completion.TrySetCanceled(); if (completion.Task.IsCompletedSuccessfully) completion.Task.Result.Dispose(); throw; }
        }
        catch (COMException) { throw new ProbeFailure("capture_" + stage + "_failed"); }
        finally
        {
            // These are private per-capture projections. Do not wait for GC to release GPU resources.
            if (item is WinRT.IWinRTObject itemObject) itemObject.NativeObject.Dispose();
            if (device is WinRT.IWinRTObject deviceObject) deviceObject.NativeObject.Dispose();
            if (interop is not null) Marshal.ReleaseComObject(interop);
            if (name != 0) WindowsDeleteString(name);
            foreach (nint pointer in new[] { itemPointer, factory, inspectable, dxgi, context, nativeDevice }) if (pointer != 0) Marshal.Release(pointer);
        }
    }

    [ComImport, Guid("3628e81b-3cac-4c60-b7f4-23ce0e0c3356"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IGraphicsCaptureItemInterop
    {
        [PreserveSig] int CreateForWindow(nint window, ref Guid iid, out nint item);
        [PreserveSig] int CreateForMonitor(nint monitor, ref Guid iid, out nint item);
    }
    [DllImport("d3d11.dll")] private static extern int D3D11CreateDevice(nint adapter, int driver, nint software, uint flags, nint levels, uint count, uint sdk, out nint device, out int feature, out nint context);
    [DllImport("d3d11.dll")] private static extern int CreateDirect3D11DeviceFromDXGIDevice(nint device, out nint result);
    [DllImport("combase.dll", CharSet = CharSet.Unicode)] private static extern int WindowsCreateString(string value, int length, out nint result);
    [DllImport("combase.dll")] private static extern int WindowsDeleteString(nint value);
    [DllImport("combase.dll")] private static extern int RoGetActivationFactory(nint name, ref Guid iid, out nint factory);

    private sealed class WindowGuard(nint handle, uint processId, DateTime processStarted, uint dpi, string title, string executable)
    {
        public nint Handle { get; } = handle;
        public bool IsForeground => GetForegroundWindow() == Handle;
        public static WindowGuard Bind(string title, string executable, bool requireForeground = true)
        {
            List<(nint Handle, uint Process, DateTime Started)> matches = [];
            EnumWindows((window, _) =>
            {
                if (!IsWindowVisible(window) || Title(window) != title) return true;
                GetWindowThreadProcessId(window, out uint id);
                try
                {
                    using var process = Process.GetProcessById((int)id);
                    if (string.Equals(Path.GetFullPath(process.MainModule!.FileName), Path.GetFullPath(executable), StringComparison.OrdinalIgnoreCase)) matches.Add((window, id, process.StartTime.ToUniversalTime()));
                }
                catch { }
                return true;
            }, 0);
            if (matches.Count != 1) throw new ProbeFailure("unique_test_window_not_found");
            var match = matches[0]; uint dpi = GetDpiForWindow(match.Handle);
            if (dpi == 0) throw new ProbeFailure("test_window_dpi_unavailable");
            var guard = new WindowGuard(match.Handle, match.Process, match.Started, dpi, title, executable); guard.Check(requireForeground); return guard;
        }
        public void Check(bool requireForeground = true)
        {
            if (!IsWindow(Handle) || IsIconic(Handle) || !IsWindowVisible(Handle) || (requireForeground && GetForegroundWindow() != Handle) || Title(Handle) != title || GetDpiForWindow(Handle) != dpi) throw new ProbeFailure("test_window_changed_or_not_foreground");
            GetWindowThreadProcessId(Handle, out uint current);
            using var process = Process.GetProcessById((int)current);
            if (current != processId || process.StartTime.ToUniversalTime() != processStarted || !string.Equals(process.MainModule?.FileName, executable, StringComparison.OrdinalIgnoreCase)) throw new ProbeFailure("test_process_changed");
            nint desktop = OpenInputDesktop(0, false, 1);
            if (desktop == 0) throw new ProbeFailure("desktop_unavailable");
            try
            {
                var name = new StringBuilder(256);
                if (!GetUserObjectInformation(desktop, 2, name, 512, out _) || name.ToString() != "Default") throw new ProbeFailure("desktop_unavailable");
            }
            finally { CloseDesktop(desktop); }
        }
        private static string Title(nint window) { var text = new StringBuilder(512); GetWindowText(window, text, text.Capacity); return text.ToString(); }
        private delegate bool WindowCallback(nint window, nint argument);
        [DllImport("user32.dll")] private static extern bool EnumWindows(WindowCallback callback, nint argument);
        [DllImport("user32.dll")] private static extern bool IsWindow(nint window);
        [DllImport("user32.dll")] private static extern bool IsWindowVisible(nint window);
        [DllImport("user32.dll")] private static extern bool IsIconic(nint window);
        [DllImport("user32.dll")] private static extern nint GetForegroundWindow();
        [DllImport("user32.dll")] private static extern uint GetDpiForWindow(nint window);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(nint window, StringBuilder text, int capacity);
        [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(nint window, out uint process);
        [DllImport("user32.dll")] private static extern nint OpenInputDesktop(uint flags, bool inherit, uint access);
        [DllImport("user32.dll")] private static extern bool CloseDesktop(nint desktop);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern bool GetUserObjectInformation(nint handle, int index, StringBuilder value, int length, out int needed);
    }
}
