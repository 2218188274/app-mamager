using System.Runtime.InteropServices.WindowsRuntime;
using System.Security.Cryptography;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using ChatQ.Windows;
using Windows.Graphics.Imaging;

internal static partial class Program
{
    private static async Task<int> SequenceSelfTest()
    {
        var engine = Engine();
        if (engine is null)
        {
            Emit(new { status = "synthetic_ocr_unavailable", realWindowCaptures = 0, aiCalls = 0, messagesSent = 0 });
            return 2;
        }
        const int width = 640, height = 360;
        byte[] Render(int additions)
        {
            var visual = new DrawingVisual();
            using (var drawing = visual.RenderOpen())
            {
                drawing.DrawRectangle(Brushes.White, null, new Rect(0, 0, width, height));
                for (int i = 0; i <= additions; i++)
                    drawing.DrawText(new FormattedText(i == 0 ? "之前的合成内容" : "聊商连接测试",
                        System.Globalization.CultureInfo.GetCultureInfo("zh-CN"), FlowDirection.LeftToRight,
                        new Typeface("Microsoft YaHei"), 46, Brushes.Black, 1), new Point(24, 16 + i * 110));
            }
            var bitmap = new RenderTargetBitmap(width, height, 96, 96, PixelFormats.Pbgra32);
            bitmap.Render(visual);
            byte[] pixels = new byte[width * height * 4];
            bitmap.CopyPixels(pixels, width * 4, 0);
            return pixels;
        }
        byte[][] frames = [Render(0), Render(1), Render(2)];
        using var receiver = new WechatOcrReceiver();
        int calls = 0;
        async Task<string> Recognize(WechatReceiveBaseline.Candidate candidate, CancellationToken token)
        {
            calls++;
            using var bitmap = new SoftwareBitmap(BitmapPixelFormat.Bgra8, candidate.Width, candidate.Height, BitmapAlphaMode.Ignore);
            bitmap.CopyFromBuffer(candidate.Pixels.AsBuffer());
            var text = await engine.RecognizeAsync(bitmap).AsTask(token);
            return text.Text;
        }
        try
        {
            receiver.Observe(frames[0], width, height);
            bool oldExcluded = await receiver.ReadNext(Recognize, default) is null && calls == 0;
            bool allMatched = true, duplicatesSkipped = true;
            var ids = new HashSet<string>();
            for (int i = 1; i < frames.Length; i++)
            {
                receiver.Observe(frames[i], width, height); receiver.Observe(frames[i], width, height);
                var received = await receiver.ReadNext(Recognize, default);
                allMatched &= received is not null &&
                    string.Concat(received.Text.Where(c => !char.IsWhiteSpace(c))) == "聊商连接测试" && ids.Add(received.Id);
                receiver.Observe(frames[i], width, height); receiver.Observe(frames[i], width, height);
                duplicatesSkipped &= await receiver.ReadNext(Recognize, default) is null;
            }
            receiver.Stop("synthetic_disconnect");
            bool paused = !receiver.Active && await receiver.ReadNext(Recognize, default) is null;
            bool passed = oldExcluded && allMatched && duplicatesSkipped && paused && receiver.Received == 2 && calls == 2;
            Emit(new { status = passed ? "synthetic_sequence_passed" : "synthetic_sequence_failed",
                oldContentExcluded = oldExcluded, duplicatesSkipped, pausedAfterDisconnect = paused, received = receiver.Received,
                ocrCalls = calls, realWindowCaptures = 0, aiCalls = 0, messagesSent = 0 });
            return passed ? 0 : 2;
        }
        finally { foreach (var frame in frames) CryptographicOperations.ZeroMemory(frame); }
    }
}
