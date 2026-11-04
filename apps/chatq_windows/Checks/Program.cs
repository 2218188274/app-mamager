using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ChatQ.Windows;

int passed = 0;
void Check(bool result, string message) { if (!result) throw new Exception(message); passed++; }
void Reject(Action action, string name) { bool failed = false; try { action(); } catch (Exception e) when (e is InvalidOperationException or CryptographicException) { failed = true; } Check(failed, name); }
ApiProfile Profile(string url = "https://example.invalid/v1", string key = "synthetic-test-key") => new("test", "测试配置", url, "fixture-model", key);
string root = Path.Combine(Path.GetTempPath(), "ChatQChecks-" + Guid.NewGuid().ToString("N"));
try
{
    Check(Validation.Profile(Profile()).BaseUrl == "https://example.invalid/v1", "valid profile");
    Check(!Profile().ToString().Contains("synthetic-test-key"), "profile display never includes key");
    foreach (string url in new[] { "http://example.invalid/v1", "https://user:pw@example.invalid", "https://example.invalid?q=x", "https://example.invalid/#key", "https://example.invalid/v1/chat/completions", "https://exa mple.invalid" }) Reject(() => Validation.Profile(Profile(url)), "reject unsafe URL");
    foreach (string key in new[] { "", "secret\r\nX: 1", "a b", "中文" }) Reject(() => Validation.Profile(Profile(key: key)), "reject invalid key");
    var vault = new Vault(root); var state = vault.SaveProfile(Profile()); string revision = state.ConfigurationRevision;
    Check(state.ActiveProfile?.Key == "synthetic-test-key", "vault profile roundtrip");
    Check(!Encoding.UTF8.GetString(File.ReadAllBytes(Path.Combine(root, "data.vault"))).Contains("synthetic-test-key"), "key not plaintext");
    state = vault.SaveProfile(Profile(key: "")); Check(state.ActiveProfile!.Key == "synthetic-test-key", "same endpoint key reuse");
    Reject(() => vault.SaveProfile(Profile("https://other.invalid/v1", "")), "key reuse cannot cross endpoint");
    Check(vault.Read().ActiveProfile!.BaseUrl == "https://example.invalid/v1", "failed save preserves profile");
    Check(revision != state.ConfigurationRevision, "configuration invalidation");
    for (int i = 1; i < 8; i++) vault.SaveProfile(Profile() with { Id = "profile" + i, Name = "配置" + i });
    Reject(() => vault.SaveProfile(Profile() with { Id = "overflow" }), "profile capacity");
    Check(vault.Read().Profiles.Count == 8, "capacity failure is atomic");
    vault.Update(s => { s.ReplyDraft = "合成草稿"; s.DraftUpdatedAt = DateTime.UtcNow; });
    Check(vault.Read().ReplyDraft == "合成草稿", "draft encryption roundtrip");
    vault.Update(s => s.TopicDraft = "独立话题草稿");
    Check(vault.Read().TopicDraft == "独立话题草稿" && vault.Read().ReplyDraft == "合成草稿", "independent encrypted topic draft");
    Reject(() => vault.Update(s => s.TopicDraft = new string('x',1001)), "topic draft length bounded before write");
    Reject(() => vault.Update(s => s.ReplyCount = 0), "invalid count rejected");
    Check(vault.Read().ReplyCount == 3, "invalid update preserves state");
    byte[] beforeCapacity = File.ReadAllBytes(Path.Combine(root, "data.vault"));
    Reject(() => vault.Update(s => s.Conversations = Enumerable.Range(0,10).Select(_ => new Conversation { Messages = Enumerable.Range(0,100).Select(_ => new Message("user",new string('x',8000))).ToList() }).ToList()), "oversized snapshot rejected before write");
    Check(File.ReadAllBytes(Path.Combine(root, "data.vault")).SequenceEqual(beforeCapacity), "capacity failure preserves readable vault");
    Check(LaunchRequests.FromArguments(["--reply"]) == LaunchRequest.Reply, "IME launch opens reply mode");
    Check(LaunchRequests.FromArguments([]) == LaunchRequest.Focus, "normal launch preserves current view");
    Check(LaunchRequests.FromArguments(["--reply=secret", "--unknown"]) == LaunchRequest.Focus, "arbitrary launch arguments ignored");
    Check(LaunchRequests.IsValid(1) && LaunchRequests.IsValid(2) && !LaunchRequests.IsValid(0) && !LaunchRequests.IsValid(255), "bounded IPC request values");
    Check(PersonalAi.ParseReplies("{\"replies\":[\"你好\",\"你好\",\"好呀\"]}", 3).Count == 2, "reply deduplication");
    Check(PersonalAi.ParseReplies("```json\n{\"replies\":[\"你好\"]}\n```", 1)[0] == "你好", "JSON fence");
    Check(PersonalAi.ParseReplies("直接回复", 1)[0] == "直接回复", "single reply fallback");
    Reject(() => PersonalAi.ParseReplies("任意文本", 3), "multi reply format enforced");
    Reject(() => PersonalAi.ParseReplies("{\"replies\":[4]}", 1), "reply types enforced");
    Reject(() => PersonalAi.ParseReplies("{\"replies\":[]}", 3), "empty replies rejected");
    Reject(() => PersonalAi.ParseReplies("{\"replies\":[\"a\",\"b\"]}", 1), "excess replies rejected");
    Check(PersonalAi.ParsePersona("{\"name\":\"合成人设\",\"instructions\":\"简短真诚\",\"example\":\"你好\"}").Instructions == "简短真诚", "persona draft validated");
    Reject(() => PersonalAi.ParsePersona("{\"name\":\"合成人设\"}"), "partial persona rejected");
    state = new UserState { Goal = "拒绝", Relation = "同事" };
    string system = PersonalAi.PersonaInstruction(state); Check(system.Contains("拒绝") && system.Contains("同事") && system.Contains("真诚"), "persona, relation, goal reach prompt");
    var messages = PersonalAi.ChatMessages(state, [new("user", new string('a', 9000)), new("assistant", new string('b', 9000)), new("user", "最新内容")], "继续");
    Check(messages.Any(m => m.Content == "最新内容") && !messages.Any(m => m.Content[0] == 'a'), "retain newest context within bound");
    string sse = "data: {\"choices\":[{\"delta\":{\"content\":\"你好👋\"},\"finish_reason\":null}]}\r\n\r\ndata: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}\r\n\r\ndata: [DONE]\r\n\r\n";
    var wire = Encoding.UTF8.GetBytes(sse);
    for (int size = 1; size <= 8; size++) { var stream = new EventStream(); for (int i = 0; i < wire.Length; i += size) stream.Feed(wire.AsSpan(i, Math.Min(size, wire.Length - i))); Check(stream.Finish() == "你好👋", "UTF8 streaming split " + size); }
    Reject(() => { var stream = new EventStream(); stream.Feed(Encoding.UTF8.GetBytes("data: {\"choices\":[{\"delta\":{\"content\":\"不完整\"},\"finish_reason\":null}]}\n\n")); stream.Finish(); }, "truncated stream rejected");
    Reject(() => { var stream = new EventStream(); stream.Feed(Encoding.UTF8.GetBytes("data: {\"choices\":[{\"delta\":{\"content\":\"不完整\"},\"finish_reason\":\"length\"}]}\n\ndata: [DONE]\n\n")); }, "length finish rejected");
    Reject(() => { var stream = new EventStream(); stream.Feed(Encoding.UTF8.GetBytes(new string('a', 65537))); }, "bounded stream line");
    byte[] corrupt = Encoding.UTF8.GetBytes("not-a-valid-DPAPI-vault"); File.WriteAllBytes(Path.Combine(root, "data.vault"), corrupt);
    Reject(() => vault.Update(s => s.Profiles.Clear()), "corrupt vault blocks overwrite");
    Check(File.ReadAllBytes(Path.Combine(root, "data.vault")).SequenceEqual(corrupt), "corrupt source preserved");

    string? fixture = Environment.GetEnvironmentVariable("CHATQ_TEST_URL");
    if (fixture is not null)
    {
        using var client = new PersonalAi(); var profile = Profile(fixture); state = new UserState { Profiles = [profile], ProfileId = profile.Id };
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        string complete = await client.Complete(profile, [new("user", "fixture-json")], false, null, timeout.Token); Check(complete == "合成回答", "real HTTP JSON");
        var replies = await client.Replies(state, "fixture-reply", "reply", timeout.Token); Check(replies.Count == 3, "real HTTP candidates");
        string streamed = await client.Complete(profile, [new("user", "fixture-stream")], true, null, timeout.Token); Check(streamed == "你好👋", "real HTTP SSE");
        var models = await client.Models(profile, timeout.Token); Check(models.SequenceEqual(new[] { "fixture-model", "fixture-model-2" }), "real HTTP model list");
        bool redirected = false; try { await client.Complete(profile, [new("user", "fixture-redirect")], false, null, timeout.Token); } catch (InvalidOperationException) { redirected = true; } Check(redirected, "redirect blocked");
        bool error = false; try { await client.Complete(profile, [new("user", "fixture-auth-error")], false, null, timeout.Token); } catch (InvalidOperationException e) { error = !e.Message.Contains("synthetic-test-key"); } Check(error, "provider errors do not expose secrets");
        using var cancel = new CancellationTokenSource(150); bool cancelled = false;
        try { await client.Complete(profile, [new("user", "fixture-slow")], true, null, cancel.Token); } catch (OperationCanceledException) { cancelled = true; } Check(cancelled, "cancel actual pending HTTP");
    }
    await FeatureChecks.Run(Path.Combine(root,"features"),fixture,Check);
    await HubChecks.Run(Path.Combine(root,"hub"),Check);
    Console.WriteLine(JsonSerializer.Serialize(new { passed, failed = 0, localHttpFixture = fixture is not null, realAiCalls = 0, userChatRead = false }));
}
finally { string path = Path.GetFullPath(root); if (!path.StartsWith(Path.GetFullPath(Path.GetTempPath()), StringComparison.OrdinalIgnoreCase) || !Path.GetFileName(path).StartsWith("ChatQChecks-")) throw new InvalidOperationException("Unexpected cleanup path"); if (Directory.Exists(path)) Directory.Delete(path, true); }
