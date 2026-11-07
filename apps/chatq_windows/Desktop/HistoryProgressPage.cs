using System.IO;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Win32;

namespace ChatQ.Windows;

public sealed partial class MainWindow
{
    private UIElement HistoryProgressTools()
    {
        var form = Stack();
        form.Children.Add(Text("退出前可以将已完成的分段加密保存。下次用同一 Windows 账号载入原会话，确认哪位是我，再打开进度文件。", 13));
        var actions = new WrapPanel();
        actions.Children.Add(TaskButton("保存分段进度", ChooseProgressDestination,
            ready: () => historyJob is { Completed: > 0, Finished: false } && analysisPlan?.Parts.Count > 1));
        actions.Children.Add(TaskButton("打开进度文件", ChooseProgressSource,
            ready: () => analysisPlan is not null && historyJob?.Completed is not > 0 && state.ActiveProfile is not null));
        form.Children.Add(actions);
        return new Expander { Header = "退出后继续分析", Content = form };
    }

    private void ChooseProgressDestination()
    {
        if (importedHistory is null || analysisPlan is not { } plan || historyJob is not { } job) return;
        var picker = new SaveFileDialog { Title = "保存本机分析进度", Filter = "聊商分析进度|*.cqprogress",
            DefaultExt = ".cqprogress", FileName = "聊商-分析进度.cqprogress", OverwritePrompt = true };
        if (picker.ShowDialog(this) != true) return;
        var thread = importedHistory.Threads[importedThread];
        string self = analysisSelf, question = analysisQuestion, path = picker.FileName;
        int maximum = longRange, replyCount = analysisReplyCount;
        string[] protectedSources = ProtectedExportSources();
        _ = Operate(async (token, view, revision) =>
        {
            if (!Path.GetExtension(path).Equals(".cqprogress", StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("请使用 .cqprogress 扩展名。");
            var snapshot = state;
            await Task.Run(() =>
            {
                var file = HistoryCheckpoint.Save(snapshot, thread, self, maximum, question, replyCount, plan, job, token);
                SaveUserFile(path, file, token, protectedSources);
            }, token);
            Guard(token, view, revision);
            SetStatus($"已保存 {job.Completed}/{plan.Parts.Count} 段。现在可以退出，下次从此进度继续。");
        });
    }

    private void ChooseProgressSource()
    {
        var picker = new OpenFileDialog { Title = "打开本机分析进度", Filter = "聊商分析进度|*.cqprogress" };
        if (picker.ShowDialog(this) == true) _ = RestoreProgressFile(picker.FileName);
    }

    private async Task RestoreProgressFile(string path)
    {
        if (importedHistory is null || analysisSelf.Length == 0 || historyJob?.Completed > 0) return;
        var thread = importedHistory.Threads[importedThread];
        string self = analysisSelf;
        await Operate(async (token, view, revision) =>
        {
            var snapshot = state;
            var progress = await Task.Run(() => HistoryCheckpoint.Restore(ReadLimited(path, HistoryCheckpoint.MaxBytes),
                snapshot, thread, self, token), token);
            Guard(token, view, revision);
            longHistory = true;
            longRange = progress.Maximum;
            analysisQuestion = progress.Question;
            analysisReplyCount = progress.ReplyCount;
            analysisPart = Math.Min(progress.Job.Completed, progress.Plan.Parts.Count - 1);
            analysisPlan = progress.Plan;
            historyJob = progress.Job;
            historyAnalysis = null;
            analysisConfiguration = revision;
            Navigate("聊天分析");
            if (ReferenceEquals(historyJob, progress.Job))
                SetStatus($"已恢复 {progress.Job.Completed}/{progress.Plan.Parts.Count} 段。核对预览并勾选后，可以继续。");
            else
                SetStatus("载入期间 API 或人设已变化，请重新核对当前配置。", true);
        });
    }
}
