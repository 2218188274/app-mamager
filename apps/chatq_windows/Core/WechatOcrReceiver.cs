namespace ChatQ.Windows;

public sealed record WechatOcrReception(string Id, string Text);

/// <summary>Read-only pixel/OCR sequencing. No window capture, account login, AI, storage or send operation.</summary>
public sealed class WechatOcrReceiver : IDisposable
{
    private readonly object gate = new();
    private readonly WechatReceiveBaseline baseline = new();
    private readonly CancellationTokenSource lifetime = new();
    private readonly string session = Guid.NewGuid().ToString("N");
    private bool active = true, reading, disposed, cancelling;
    private int received;
    private string status = "not_started";
    public bool Active { get { lock (gate) return active; } }
    public string Status { get { lock (gate) return status; } }
    public int Received { get { lock (gate) return received; } }

    public string Observe(ReadOnlySpan<byte> pixels, int width, int height)
    {
        string result;
        lock (gate)
        {
            if (!active) return status;
            result = status = baseline.Observe(pixels, width, height);
        }
        if (result is not ("baseline_only" or "waiting_new_pixels" or "candidate_waiting_stability" or "candidate_stable"))
            Stop(result);
        return result;
    }

    public async Task<WechatOcrReception?> ReadNext(
        Func<WechatReceiveBaseline.Candidate, CancellationToken, Task<string>> recognize, CancellationToken token)
    {
        if (token.IsCancellationRequested)
        {
            Stop("stopped");
            token.ThrowIfCancellationRequested();
        }
        WechatReceiveBaseline.Candidate? candidate;
        CancellationTokenSource cancellation;
        lock (gate)
        {
            if (!active || reading) return null;
            candidate = baseline.CopyCandidate();
            if (candidate is null) return null;
            reading = true;
            cancellation = CancellationTokenSource.CreateLinkedTokenSource(token, lifetime.Token);
        }
        using (candidate)
        using (cancellation)
        {
            try
            {
                string text = await recognize(candidate, cancellation.Token).ConfigureAwait(false);
                cancellation.Token.ThrowIfCancellationRequested();
                lock (gate)
                {
                    if (!active || baseline.Status != "candidate_stable" || baseline.CandidateRevision != candidate.Revision) return null;
                    text = text.Trim();
                    if (text.Length is < 1 or > 2000) throw new InvalidOperationException();
                    if (!baseline.AcceptCandidate(candidate.Revision)) return null;
                    received++;
                    status = baseline.Status;
                    if (status == "no_append_space") active = false;
                    return new(session + "-" + received, text);
                }
            }
            catch (OperationCanceledException) { Stop("stopped"); throw; }
            catch
            {
                Stop("recognition_failed");
                throw new InvalidOperationException("本机文字识别未完成，请重新开始接收测试。");
            }
            finally
            {
                lock (gate)
                {
                    reading = false;
                    if (disposed && !cancelling) lifetime.Dispose();
                }
            }
        }
    }

    public void Stop(string reason = "stopped")
    {
        lock (gate)
        {
            if (!active) return;
            active = false;
            status = reason;
            baseline.Dispose();
            cancelling = true;
        }
        // OCR cancellation may invoke external callbacks. Keep those outside the receiver lock.
        try { lifetime.Cancel(); }
        catch (AggregateException) { /* Remain paused even when a cancellation callback fails. */ }
        finally
        {
            lock (gate)
            {
                cancelling = false;
                if (disposed && !reading) lifetime.Dispose();
            }
        }
    }

    public void Dispose()
    {
        Stop("disposed");
        lock (gate)
        {
            if (disposed) return;
            disposed = true;
            if (!reading && !cancelling) lifetime.Dispose();
        }
    }
}
