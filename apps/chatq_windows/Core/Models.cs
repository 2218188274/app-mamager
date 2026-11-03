using System.Text.Json;
using System.Text.Json.Serialization;

namespace ChatQ.Windows;

public sealed record ApiProfile(string Id, string Name, string BaseUrl, string Model, string Key, bool Stream = true, string SpeechModel = "whisper-1")
{
    public override string ToString() => Name + " · " + Model;
}
public sealed record Persona(string Id, string Name, string Instructions, string Example = "");
public sealed record Message(string Role, string Content);
public sealed record SavedReply(string Id, string Text, string Source, string Mode, string Persona, DateTime CreatedAt, bool Favorite = false);
public sealed record ImageSticker(string Id, string Name, string Png);
public sealed class Conversation
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Name { get; set; } = "新对话";
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public List<Message> Messages { get; set; } = [];
}
public sealed class UserState
{
    public int Version { get; set; } = 2;
    public string ConfigurationRevision { get; set; } = Guid.NewGuid().ToString("N");
    public List<ApiProfile> Profiles { get; set; } = [];
    public string ProfileId { get; set; } = "";
    public List<Persona> Personas { get; set; } = Defaults.Personas.ToList();
    public string PersonaId { get; set; } = "natural";
    public string Relation { get; set; } = "不指定";
    public string Goal { get; set; } = "自然接话";
    public int ReplyCount { get; set; } = 3;
    public List<Conversation> Conversations { get; set; } = [];
    public string ReplyDraft { get; set; } = "";
    public string PolishDraft { get; set; } = "";
    public string TopicDraft { get; set; } = "";
    public DateTime DraftUpdatedAt { get; set; }
    public Dictionary<string, string> ChatDrafts { get; set; } = [];
    public List<SavedReply> ReplyHistory { get; set; } = [];
    public List<ImageSticker> Stickers { get; set; } = [];
    public List<string> StickerFavorites { get; set; } = [];
    [JsonIgnore] public ApiProfile? ActiveProfile => Profiles.Find(x => x.Id == ProfileId);
    [JsonIgnore] public Persona? ActivePersona => Personas.Find(x => x.Id == PersonaId);
}
public static class Defaults
{
    public static readonly Persona[] Personas = [
        new("natural", "自然真诚", "自然真诚地回应，不夸大关系，不编造经历。简短自然，通常一到两句话。", "听起来今天挺充实，最开心的是哪件事？"),
        new("warm", "温柔体贴", "先理解感受，用平实温柔的话回应，不说教、不使用肉麻称呼。", "今天辛苦啦，想说的话我在听。"),
        new("work", "礼貌得体", "表达清楚、礼貌得体，重点明确，保持边界，不凭空承诺。", "收到，我先确认一下安排，再和你沟通。"),
        new("funny", "轻松幽默", "轻松自然，适度幽默，不嘲讽、不冒犯，不用生硬网络梗。"),
        new("boundary", "坚定有界", "温和但明确表达自己的想法和边界，不讨好、不指责。")];
    public static readonly string[] Relations = ["不指定", "朋友", "同事", "客户", "家人", "恋人", "刚认识"];
    public static readonly Dictionary<string, string> Goals = new()
    {
        ["自然接话"] = "", ["安慰"] = "先理解感受，再温柔回应，避免说教。",
        ["拒绝"] = "礼貌明确地拒绝，保持边界，不编造理由。",
        ["邀约"] = "自然提出邀请，给对方选择余地，不施加压力。",
        ["接着聊"] = "接住当前话题，用一个容易回答的问题延续聊天。",
        ["感谢"] = "具体真诚地表达感谢，不夸张奉承。", ["道歉"] = "真诚表达歉意，不凭空承诺。"
    };
    public static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };
}

public static class Validation
{
    public static ApiProfile Profile(ApiProfile value)
    {
        string url = value.BaseUrl.Trim().TrimEnd('/');
        if (url.Length is < 8 or > 2048 || !Uri.TryCreate(url, UriKind.Absolute, out var uri) ||
            uri.UserInfo.Length > 0 || uri.Query.Length > 0 || uri.Fragment.Length > 0 ||
            url.Any(c => char.IsWhiteSpace(c) || char.IsControl(c)) ||
            (uri.Scheme != "https" && !(uri.Scheme == "http" && (uri.Host == "127.0.0.1" || uri.Host == "localhost"))))
            throw new InvalidOperationException("请填写完整 HTTPS API 基础地址；本机测试可用 localhost。");
        if (uri.AbsolutePath.EndsWith("/chat/completions", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("填写 API 基础地址，例如 https://服务商/v1，不要填写 /chat/completions。");
        if (value.Key.Length is < 1 or > 8192 || value.Key.Any(c => c < 33 || c > 126))
            throw new InvalidOperationException("请填写有效 API 密钥，不能含空格或换行。");
        string model = value.Model.Trim(), name = value.Name.Trim();
        if (model.Length is < 1 or > 200 || model.Any(c => char.IsWhiteSpace(c) || char.IsControl(c)))
            throw new InvalidOperationException("请填写模型名称，不能含空格或换行。");
        if (name.Length is < 1 or > 30) throw new InvalidOperationException("配置名称需为1–30字。");
        string speech = value.SpeechModel?.Trim() ?? "whisper-1";
        if (speech.Length is < 1 or > 200 || speech.Any(c => char.IsWhiteSpace(c) || char.IsControl(c))) throw new InvalidOperationException("请填写有效的语音模型名称。");
        return value with { BaseUrl = url, Model = model, Name = name, SpeechModel = speech };
    }
    public static void State(UserState value)
    {
        if (value.Version is not (1 or 2) || value.Profiles is null || value.Personas is null || value.Conversations is null ||
            value.Profiles.Count > 8 || value.Personas.Count is < 1 or > 30 || value.Conversations.Count > 50 ||
            value.ReplyCount is < 1 or > 10 || !Guid.TryParseExact(value.ConfigurationRevision, "N", out _))
            throw new InvalidOperationException("本机数据格式异常，已停止写入以保留原文件。");
        foreach (var p in value.Profiles) _ = Profile(p);
        if(value.Relation is null || !Defaults.Relations.Contains(value.Relation) || value.Goal is null || !Defaults.Goals.ContainsKey(value.Goal))throw new InvalidOperationException("回复偏好格式异常，已保留原数据。");
        if(value.Personas.Any(p=>p is null || string.IsNullOrEmpty(p.Id) || p.Id.Length>40) || value.Personas.Select(p=>p.Id).Distinct().Count()!=value.Personas.Count || value.Conversations.Any(c=>c is null || string.IsNullOrEmpty(c.Id) || c.Id.Length>40) || value.Conversations.Select(c=>c.Id).Distinct().Count()!=value.Conversations.Count) throw new InvalidOperationException("本机记录标识异常，已保留原数据。");
        if (value.Profiles.Any(p => string.IsNullOrEmpty(p.Id)) || value.Profiles.Select(p => p.Id).Distinct().Count() != value.Profiles.Count ||
            (value.Profiles.Count > 0 && value.ActiveProfile is null) || value.ActivePersona is null)
            throw new InvalidOperationException("本机配置关联异常，已保留原数据。");
        foreach (var p in value.Personas)
            if (p.Name.Length is < 1 or > 20 || p.Instructions.Length is < 1 or > 500 || p.Example.Length > 120)
                throw new InvalidOperationException("人设内容格式异常。");
        foreach (var c in value.Conversations)
            if (c.Name.Length is < 1 or > 60 || c.Messages.Count > 100 ||
                c.Messages.Any(m => m.Role is not ("user" or "assistant") || string.IsNullOrEmpty(m.Content) || m.Content.Length > 10000))
                throw new InvalidOperationException("会话格式或容量异常，已保留原数据。");
        if (value.ReplyDraft.Length > 1000 || value.PolishDraft.Length > 1000 || value.TopicDraft.Length > 1000) throw new InvalidOperationException("草稿过长。");
        if (value.ChatDrafts is null || value.ChatDrafts.Count > 51 || value.ChatDrafts.Any(x => x.Key.Length is < 1 or > 40 || x.Value.Length > 2000)) throw new InvalidOperationException("会话草稿格式异常。");
        if (value.ReplyHistory is null || value.ReplyHistory.Count > 100 || value.ReplyHistory.Select(x=>x.Id).Distinct().Count()!=value.ReplyHistory.Count || value.ReplyHistory.Any(x=>string.IsNullOrEmpty(x.Id) || x.Id.Length>40 || x.Text is null || x.Text.Length is <1 or >1000 || x.Source is null || x.Source.Length>1000 || x.Persona is null || x.Persona.Length>20 || x.Mode is not ("reply" or "polish" or "topics"))) throw new InvalidOperationException("生成记录格式或容量异常。");
        if (value.Stickers is null || value.Stickers.Count>20 || value.Stickers.Select(x=>x.Id).Distinct().Count()!=value.Stickers.Count || value.StickerFavorites is null || value.StickerFavorites.Count>40 || value.StickerFavorites.Distinct().Count()!=value.StickerFavorites.Count || value.StickerFavorites.Any(x=>x is null || x.Length>40)) throw new InvalidOperationException("表情库格式或容量异常。");
        foreach(var sticker in value.Stickers)
        {
            if (sticker.Id is null || sticker.Id.Length is <1 or >40 || sticker.Name is null || sticker.Name.Length is <1 or >20 || sticker.Png is null || sticker.Png.Length>180000) throw new InvalidOperationException("表情图片格式异常。");
            byte[] data;try { data=Convert.FromBase64String(sticker.Png); }catch(FormatException) { throw new InvalidOperationException("表情图片内容损坏。"); }
            if(data.Length>131072 || data.Length<45 || !data.AsSpan(0,8).SequenceEqual(new byte[]{137,80,78,71,13,10,26,10})) throw new InvalidOperationException("表情图片格式异常。");
            var dimensions=ImageHeader.Dimensions(data);if(dimensions.Width>512 || dimensions.Height>512)throw new InvalidOperationException("表情分辨率超过512像素。");
        }
    }
}
