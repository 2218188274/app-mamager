using ChatQ.Windows;

internal static class WechatReceiveChecks
{
    public static void Run(Action<bool, string> check)
    {
        const int width = 160, height = 180;
        byte[] Blank() { var data = new byte[width * height * 4]; Array.Fill(data, (byte)245); return data; }
        void Ink(byte[] data, int top, int bottom, int shade = 20)
        {
            for (int y = top; y < bottom; y++) for (int x = 12; x < 100; x++)
                for (int c = 0; c < 3; c++) data[(y * width + x) * 4 + c] = (byte)shade;
        }
        var old = Blank(); Ink(old, 15, 45);
        using (var detector = new WechatReceiveBaseline())
        {
            check(detector.Observe(old, width, height) == "baseline_only" && detector.CopyCandidate() is null, "visual baseline never yields historical text for OCR");
            for (int i = 0; i < 4; i++) check(detector.Observe(old, width, height) == "waiting_new_pixels", "unchanged test window does not yield OCR work");
            var newMessage = old.ToArray(); Ink(newMessage, 80, 105);
            check(detector.Observe(newMessage, width, height) == "candidate_waiting_stability" && detector.CopyCandidate() is null, "animating new bubble is not yet recognized");
            var fragment = newMessage.ToArray(); Ink(fragment, 107, 110);
            check(detector.Observe(fragment, width, height) == "candidate_waiting_stability", "changing text restarts stability gate");
            check(detector.Observe(fragment, width, height) == "candidate_stable", "new appended content requires consecutive stable frames");
            using var candidate = detector.CopyCandidate();
            check(candidate is not null && candidate.Height < height - 45 && candidate.Width == width, "OCR candidate excludes all existing rows");
            check(candidate is not null && candidate.Pixels.Any(b => b == 20), "only appended synthetic ink is supplied to OCR");
            candidate!.Dispose(); check(candidate.Pixels.All(b => b == 0), "candidate pixel memory cleared on disposal");
        }
        using (var detector = new WechatReceiveBaseline())
        {
            detector.Observe(old, width, height);
            var scrolled = old.ToArray(); Ink(scrolled, 8, 14); Ink(scrolled, 90, 100);
            check(detector.Observe(scrolled, width, height) == "existing_region_changed" && detector.CopyCandidate() is null, "scroll or existing message changes stop before OCR");
            check(detector.Observe(old, width, height) == "existing_region_changed", "a stopped run never silently re-baselines history");
        }
        using (var detector = new WechatReceiveBaseline())
        {
            detector.Observe(old, width, height);
            check(detector.Observe(new byte[(width + 4) * height * 4], width + 4, height) == "layout_changed", "resize invalidates calibrated receive crop");
        }
        using (var detector = new WechatReceiveBaseline())
        {
            check(detector.Observe(new byte[width * height * 4], width, height) == "dark_or_black_frame", "black capture never becomes a valid receive baseline");
        }
        using (var detector = new WechatReceiveBaseline())
        {
            var full = Blank(); Ink(full, 150, 170);
            check(detector.Observe(full, width, height) == "no_append_space", "full visible region requires a new manual calibration instead of scrolling");
        }
        using (var detector = new WechatReceiveBaseline())
        {
            var ambiguous = Blank(); ambiguous[^4] = 0;
            check(detector.Observe(ambiguous, width, height) == "background_uncertain", "uncertain crop background is rejected");
        }
        using (var detector = new WechatReceiveBaseline())
        {
            check(detector.Observe([1, 2, 3], 160, 180) == "invalid_frame", "malformed pixel buffers are rejected before access");
        }
        var disposed = new WechatReceiveBaseline(); disposed.Observe(old, width, height); disposed.Dispose();
        check(disposed.Observe(old, width, height) == "disposed" && disposed.CopyCandidate() is null, "closed receive run cannot restart");
    }
}
