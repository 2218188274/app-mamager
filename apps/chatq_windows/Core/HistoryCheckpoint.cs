using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ChatQ.Windows;

public sealed record RestoredHistoryProgress(HistoryPlan Plan, HistoryAnalysisJob Job, int Maximum, string Question, int ReplyCount);

public static class HistoryCheckpoint
{
    public const int MaxBytes = 2 * 1024 * 1024;
    private const string Format = "chatq-history-progress-v1";
    private sealed record Snapshot(string Format, string SourceHash, string Scope, int Maximum, string Question, int ReplyCount, List<ChatAnalysis> Parts);
    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
        MaxDepth = 12
    };

    public static byte[] Save(UserState state, ImportedThread thread, string self, int maximum, string question,
        int replyCount, HistoryPlan plan, HistoryAnalysisJob job, CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        job.Check(state, plan, question, replyCount);
        if (maximum is not (500 or 1000 or 2000) || job.Finished || job.Completed == 0 || plan.Parts.Count < 2)
            throw new InvalidOperationException("请先停止分段分析，至少完成一段后可以保存进度。");
        var snapshot = new Snapshot(Format, SavedHistoryAnalysis.Hash(thread, self), job.ScopeSignature,
            maximum, question, replyCount, [..job.Results]);
        byte[] plain = JsonSerializer.SerializeToUtf8Bytes(snapshot, Json);
        try
        {
            if (plain.Length > MaxBytes) throw new InvalidOperationException("分析进度超过文件容量。");
            token.ThrowIfCancellationRequested();
            byte[] file = DeviceEncryption.Protect(plain);
            if (file.Length > MaxBytes) throw new InvalidOperationException("分析进度超过文件容量。");
            return file;
        }
        finally { CryptographicOperations.ZeroMemory(plain); }
    }

    public static RestoredHistoryProgress Restore(byte[] file, UserState state, ImportedThread thread, string self, CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        if (file.Length is 0 or > MaxBytes) throw new InvalidOperationException("进度文件大小异常。");
        byte[] plain = DeviceEncryption.Unprotect(file);
        try
        {
            var data = JsonSerializer.Deserialize<Snapshot>(plain, Json);
            if (data is null || data.Format != Format || data.Maximum is not (500 or 1000 or 2000) ||
                data.Question is null || data.Question.Length > 500 || data.ReplyCount is < 1 or > 10 ||
                data.Parts is null || data.Parts.Count is < 1 or > HistoryPlan.MaxParts)
                throw new InvalidOperationException("进度文件格式或版本不受支持。");
            if (SavedHistoryAnalysis.Hash(thread, self) != data.SourceHash)
                throw new InvalidOperationException("所选会话或“哪位是我”与进度文件不匹配，请重新选择。");
            var plan = HistoryPlan.Create(thread, self, data.Maximum, token);
            var job = new HistoryAnalysisJob(state, plan, data.Question, data.ReplyCount);
            if (job.ScopeSignature != data.Scope)
                throw new InvalidOperationException("当前人设、API 配置或分析范围与保存时不同，请重新开始分析。");
            if (plan.Parts.Count < 2 || data.Parts.Count > plan.Parts.Count)
                throw new InvalidOperationException("进度文件中的分段数量异常。");
            foreach (var part in data.Parts)
            {
                token.ThrowIfCancellationRequested();
                if (part is null) throw new InvalidOperationException("进度文件缺少分段结果。");
                var checkedPart = PersonalAi.ParseAnalysis(JsonSerializer.Serialize(part, Json), plan.Parts[job.Completed], 1);
                job.Add(checkedPart);
            }
            token.ThrowIfCancellationRequested();
            return new(plan, job, data.Maximum, data.Question, data.ReplyCount);
        }
        catch (JsonException) { throw new InvalidOperationException("无法读取这个分析进度文件。"); }
        finally { CryptographicOperations.ZeroMemory(plain); }
    }
}
