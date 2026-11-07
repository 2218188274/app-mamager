using System.IO;
using System.Reflection;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using ChatQ.Windows;

internal static partial class Program
{
    private static Button RestoreSyntheticProgress(MainWindow window, FrameworkElement root, Vault vault,
        ImportedThread thread, Button generate)
    {
        // Simulate the API settings changing after the preview, before the user clicks.
        vault.Update(_ => { }, true);
        generate.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        Layout(root, 640, 440);
        Check(Children<TextBlock>(root).Any(t => t.Text.Contains("核对新的目标")) &&
            Children<CheckBox>(root).Single(t => AutomationProperties.GetName(t) == "允许发送聊天摘录").IsChecked != true,
            "a stale preview cannot send under a changed configuration");

        var settings = vault.Read();
        Check(new Uri(settings.ActiveProfile!.BaseUrl).IsLoopback, "checkpoint UI regression uses only the local fixture");
        const string question = "合成测试关注点";
        var plan = HistoryPlan.Create(thread, ChatImport.SelfFlags, 500);
        var job = new HistoryAnalysisJob(settings, plan, question, 3);
        using var ai = new PersonalAi();
        using var stop = new CancellationTokenSource();
        var partial = ai.AnalyzeLongHistory(settings, plan, question, 3, job, p =>
        {
            if (p.Completed == 1) stop.Cancel();
        }, stop.Token);
        Wait(() => partial.IsCompleted);
        Check(partial.IsCanceled && job.Completed == 1, "manual stop creates a single completed segment");
        string path = Path.Combine(vault.DirectoryPath, "synthetic-progress.cqprogress");
        File.WriteAllBytes(path, HistoryCheckpoint.Save(settings, thread, ChatImport.SelfFlags, 500, question, 3, plan, job, default));
        var restore = (Task)typeof(MainWindow).GetMethod("RestoreProgressFile", BindingFlags.NonPublic | BindingFlags.Instance)!
            .Invoke(window, [path])!;
        Wait(() => restore.IsCompleted);
        restore.GetAwaiter().GetResult();
        Layout(root, 640, 440);
        var consent = Children<CheckBox>(root).Single(t => AutomationProperties.GetName(t) == "允许发送聊天摘录");
        var resume = Children<Button>(root).Single(b => Equals(b.Content, "继续分析"));
        Check(consent.IsChecked != true && !resume.IsEnabled, "restoring a progress file always requires fresh consent");
        Check(Children<TextBlock>(root).Any(t => t.Text.Contains("继续需 3 次调用")) &&
            Children<TextBox>(root).Single(t => AutomationProperties.GetName(t) == "分析关注点").Text == question,
            "restore shows remaining calls and the saved question");
        Check(Children<ComboBox>(root).Single(c => AutomationProperties.GetName(c) == "预览分段").SelectedIndex == 1 &&
            Children<TextBox>(root).Single(t => AutomationProperties.GetName(t) == "将发送的化名聊天摘录").Text.Contains("M00201"),
            "restore previews the first unfinished segment");
        consent.IsChecked = true;
        Check(resume.IsEnabled && resume.TranslatePoint(new Point(0, resume.ActualHeight), root).Y <= 440,
            "manual continue stays reachable in a short viewport");
        return resume;
    }
}
