using ChatQ.Windows;

internal static class WechatOcrReceiverChecks
{
    private const int Width = 120, Height = 220;
    private static byte[] Frame(params int[] rows)
    {
        var pixels = Enumerable.Repeat((byte)245, Width * Height * 4).ToArray();
        foreach (int top in rows)
            for (int y = top; y < top + 10; y++)
                for (int x = 16; x < 88; x++)
                    pixels.AsSpan((y * Width + x) * 4, 3).Fill(35);
        return pixels;
    }
    private static void Stable(WechatOcrReceiver receiver, byte[] frame)
    {
        receiver.Observe(frame, Width, Height);
        receiver.Observe(frame, Width, Height);
    }
    public static async Task Run(Action<bool, string> check)
    {
        byte[] old = Frame(20), first = Frame(20, 65), second = Frame(20, 65, 110);
        using (var receiver = new WechatOcrReceiver())
        {
            int reads = 0;
            byte[]? owned = null;
            Task<string> Recognize(WechatReceiveBaseline.Candidate crop, CancellationToken token)
            {
                reads++;
                owned = crop.Pixels;
                check(crop.Height < Height - 20, "OCR crop excludes the old-content baseline");
                return Task.FromResult("合成消息");
            }
            receiver.Observe(old, Width, Height);
            check(await receiver.ReadNext(Recognize, default) is null && reads == 0, "starting a receiver never OCRs existing content");
            receiver.Observe(first, Width, Height);
            check(await receiver.ReadNext(Recognize, default) is null && reads == 0, "an unstable frame never reaches OCR");
            receiver.Observe(first, Width, Height);
            var a = await receiver.ReadNext(Recognize, default);
            check(a?.Text == "合成消息" && reads == 1 && receiver.Received == 1, "a stable new region produces one reception");
            check(owned!.All(x => x == 0), "recognized pixel copies are zeroed after use");
            Stable(receiver, first);
            check(await receiver.ReadNext(Recognize, default) is null && reads == 1, "the accepted frame cannot trigger OCR again");
            Stable(receiver, second);
            var b = await receiver.ReadNext(Recognize, default);
            check(b?.Text == a!.Text && b!.Id != a.Id && receiver.Received == 2, "equal text appended later gets its own reception identity");
            byte[] changed = second.ToArray(); changed[(22 * Width + 18) * 4] = 245;
            receiver.Observe(changed, Width, Height);
            check(!receiver.Active && receiver.Status == "existing_region_changed", "scrolling or changes to old pixels pause continuous reception");
            check(await receiver.ReadNext(Recognize, default) is null && reads == 2, "a paused receiver cannot silently restart OCR");
        }
        using (var receiver = new WechatOcrReceiver())
        {
            receiver.Observe(old, Width, Height);
            Stable(receiver, first);
            var pending = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
            var read = receiver.ReadNext((_, _) => pending.Task, default);
            int extra = 0;
            check(await receiver.ReadNext((_, _) => { extra++; return Task.FromResult("unexpected"); }, default) is null && extra == 0,
                "only one OCR operation can own a stable candidate");
            Stable(receiver, second);
            pending.SetResult("过期结果");
            check(await read is null && receiver.Received == 0 && receiver.Active, "a late result from an older frame is discarded");
            var current = await receiver.ReadNext((_, _) => Task.FromResult("新的合成内容"), default);
            check(current?.Text == "新的合成内容" && receiver.Received == 1, "the current stable frame remains available after discarding old OCR");
        }
        foreach (string reason in new[] { "binding_changed", "window_changed", "capture_failed" })
        {
            using var receiver = new WechatOcrReceiver();
            receiver.Observe(old, Width, Height); Stable(receiver, first);
            var pending = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
            var read = receiver.ReadNext((_, _) => pending.Task, default);
            receiver.Stop(reason); pending.SetResult("晚到内容");
            bool stopped = false;
            try { await read; } catch (OperationCanceledException) { stopped = true; }
            check(stopped && receiver.Received == 0 && receiver.Status == reason, "window/binding/disconnection pause cancels late OCR without accepting it");
        }
        using (var receiver = new WechatOcrReceiver())
        using (var stop = new CancellationTokenSource())
        {
            receiver.Observe(old, Width, Height); Stable(receiver, first);
            var pending = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
            var read = receiver.ReadNext((_, _) => pending.Task, stop.Token);
            stop.Cancel(); pending.SetResult("取消后的内容");
            bool cancelled = false;
            try { await read; } catch (OperationCanceledException) { cancelled = true; }
            check(cancelled && !receiver.Active && receiver.Received == 0, "external cancellation prevents late recognition from resuming");
        }
        using (var receiver = new WechatOcrReceiver())
        {
            receiver.Observe(old, Width, Height); Stable(receiver, first);
            bool masked = false;
            try { await receiver.ReadNext((_, _) => throw new IOException("synthetic-private-diagnostic"), default); }
            catch (InvalidOperationException e) { masked = !e.ToString().Contains("synthetic-private-diagnostic"); }
            check(masked && !receiver.Active && receiver.Status == "recognition_failed", "recognition failure stops the receiver and hides external diagnostics");
        }
        foreach (string text in new[] { "", "  ", new string('x', 2001) })
        {
            using var receiver = new WechatOcrReceiver();
            receiver.Observe(old, Width, Height); Stable(receiver, first);
            bool invalid = false;
            try { await receiver.ReadNext((_, _) => Task.FromResult(text), default); }
            catch (InvalidOperationException) { invalid = true; }
            check(invalid && receiver.Received == 0 && !receiver.Active, "blank or oversized recognition cannot become a new reception");
        }
        using (var baseline = new WechatReceiveBaseline())
        {
            baseline.Observe(old, Width, Height); baseline.Observe(first, Width, Height); baseline.Observe(first, Width, Height);
            using var candidate = baseline.CopyCandidate()!;
            baseline.Observe(second, Width, Height); baseline.Observe(second, Width, Height);
            check(!baseline.AcceptCandidate(candidate.Revision), "an older acknowledgement cannot advance a replacement candidate");
        }
        using (var receiver = new WechatOcrReceiver())
        {
            receiver.Observe(old, Width, Height); Stable(receiver, Frame(20, 205));
            var last = await receiver.ReadNext((_, _) => Task.FromResult("最后一条合成消息"), default);
            check(last is not null && receiver.Received == 1 && !receiver.Active && receiver.Status == "no_append_space",
                "the final visible reception is retained before pausing for exhausted append space");
        }
        var disposed = new WechatOcrReceiver();
        disposed.Observe(old, Width, Height); Stable(disposed, first);
        var late = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
        var work = disposed.ReadNext((_, _) => late.Task, default);
        disposed.Dispose(); disposed.Dispose(); late.SetResult("关闭后内容");
        bool ended = false;
        try { await work; } catch (OperationCanceledException) { ended = true; }
        check(ended && disposed.Received == 0 && disposed.Status == "disposed", "dispose during uncooperative OCR is idempotent and cannot publish");
        using (var receiver = new WechatOcrReceiver())
        {
            receiver.Observe(old, Width, Height); Stable(receiver, first);
            var pending = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
            bool callbackCouldRead = false;
            CancellationTokenRegistration registration = default;
            var read = receiver.ReadNext((_, token) =>
            {
                registration = token.Register(() =>
                {
                    callbackCouldRead = Task.Run(() => receiver.Status).Wait(TimeSpan.FromSeconds(2));
                    receiver.Dispose();
                    throw new InvalidOperationException("synthetic-private-cancellation-error");
                });
                return pending.Task;
            }, default);
            receiver.Stop("window_changed");
            check(callbackCouldRead && receiver.Status == "window_changed" && !receiver.Active,
                "cancellation callbacks can query state and dispose without blocking or overriding the original pause");
            pending.SetResult("回调后的过期内容");
            bool cancelled = false;
            try { await read; } catch (OperationCanceledException) { cancelled = true; }
            registration.Dispose();
            check(cancelled && receiver.Received == 0, "callback exceptions stay contained while late OCR remains cancelled");
        }
        using (var receiver = new WechatOcrReceiver())
        using (var cancelled = new CancellationTokenSource())
        {
            receiver.Observe(old, Width, Height); Stable(receiver, first); cancelled.Cancel();
            int reads = 0; bool stopped = false;
            try { await receiver.ReadNext((_, _) => { reads++; return Task.FromResult("unexpected"); }, cancelled.Token); }
            catch (OperationCanceledException) { stopped = true; }
            check(stopped && !receiver.Active && reads == 0 && receiver.Received == 0,
                "a token cancelled before recognition immediately pauses without starting OCR");
        }
    }
}
