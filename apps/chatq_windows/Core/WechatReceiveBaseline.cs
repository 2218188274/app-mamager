using System.Security.Cryptography;

namespace ChatQ.Windows;

/// <summary>
/// Conservative, read-only append detector for an explicitly selected incoming-text region.
/// It never OCRs the initial frame, scrolls, captures a window, or sends anything.
/// A changed existing row stops the run rather than exposing old text to OCR.
/// </summary>
public sealed class WechatReceiveBaseline : IDisposable
{
    private byte[]? baseline;
    private byte[]? pending;
    private int width, height, boundary;
    private bool stopped;
    public string Status { get; private set; } = "not_started";

    public string Observe(ReadOnlySpan<byte> pixels, int frameWidth, int frameHeight)
    {
        if (stopped) return Status;
        if (frameWidth is <40 or >4096 || frameHeight is <40 or >4096 ||
            (long)frameWidth * frameHeight > 4_000_000 || pixels.Length != (long)frameWidth * frameHeight * 4)
            return Stop("invalid_frame");
        if (baseline is null)
        {
            width = frameWidth; height = frameHeight;
            // A calibrated crop must have the same background at all four corners.
            // No OCR is performed to establish the existing-content baseline.
            int[] corners = [0, (width - 1) * 4, (height - 1) * width * 4, (height * width - 1) * 4];
            if (pixels[0] < 180 || pixels[1] < 180 || pixels[2] < 180) return Stop("dark_or_black_frame");
            foreach (int i in corners)
                if (Different(pixels, 0, pixels, i, 12)) return Stop("background_uncertain");
            int lastInk = -1;
            for (int y = 0; y < height; y++)
                for (int x = 0; x < width; x++)
                    if (Different(pixels, (y * width + x) * 4, pixels, 0, 28)) { lastInk = y; break; }
            boundary = Math.Max(0, lastInk + 6);
            if (height - boundary < 32) return Stop("no_append_space");
            baseline = pixels.ToArray(); Status = "baseline_only"; return Status;
        }
        if (frameWidth != width || frameHeight != height) return Stop("layout_changed");
        int changed = 0;
        for (int y = 0; y < height; y++)
            for (int x = 0; x < width; x++)
            {
                int i = (y * width + x) * 4;
                if (!Different(pixels, i, baseline, i, 12)) continue;
                if (y < boundary) return Stop("existing_region_changed");
                changed++;
            }
        if (changed < 8) { ClearPending(); Status = "waiting_new_pixels"; return Status; }
        if (pending is not null && SameRgb(pixels, pending)) { Status = "candidate_stable"; return Status; }
        ClearPending(); pending = pixels.ToArray(); Status = "candidate_waiting_stability"; return Status;
    }

    // The caller owns and must dispose this bounded copy. Baseline rows are never included.
    public Candidate? CopyCandidate()
    {
        if (stopped || Status != "candidate_stable" || pending is null) return null;
        return new Candidate(width, height - boundary, pending.AsSpan(boundary * width * 4).ToArray());
    }

    private static bool Different(ReadOnlySpan<byte> a, int ai, ReadOnlySpan<byte> b, int bi, int threshold)
        => Math.Abs(a[ai] - b[bi]) > threshold || Math.Abs(a[ai + 1] - b[bi + 1]) > threshold || Math.Abs(a[ai + 2] - b[bi + 2]) > threshold;
    private static bool SameRgb(ReadOnlySpan<byte> a, ReadOnlySpan<byte> b)
    {
        if (a.Length != b.Length) return false;
        for (int i = 0; i < a.Length; i += 4)
            if (Different(a, i, b, i, 0)) return false;
        return true;
    }
    private void ClearPending() { if (pending is not null) CryptographicOperations.ZeroMemory(pending); pending = null; }
    private string Stop(string reason) { stopped = true; Status = reason; ClearPending(); if (baseline is not null) CryptographicOperations.ZeroMemory(baseline); baseline = null; return Status; }
    public void Dispose() => Stop("disposed");

    public sealed class Candidate(int width, int height, byte[] pixels) : IDisposable
    {
        public int Width { get; } = width;
        public int Height { get; } = height;
        public byte[] Pixels { get; } = pixels;
        public void Dispose() => CryptographicOperations.ZeroMemory(Pixels);
    }
}
