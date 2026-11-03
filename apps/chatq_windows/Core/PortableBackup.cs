using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text.Json;

namespace ChatQ.Windows;

// This explicit allowlist intentionally has no API profiles, addresses, tokens or key fields.
public sealed class PortableData
{
    public int Version { get; set; } = 1;
    public List<Persona> Personas { get; set; } = [];
    public string PersonaId { get; set; } = "natural";
    public string Relation { get; set; } = "不指定";
    public string Goal { get; set; } = "自然接话";
    public int ReplyCount { get; set; } = 3;
    public List<Conversation> Conversations { get; set; } = [];
    public List<SavedReply> ReplyHistory { get; set; } = [];
    public List<ImageSticker> Stickers { get; set; } = [];
    public List<string> StickerFavorites { get; set; } = [];
    public string ReplyDraft { get; set; } = "";
    public string PolishDraft { get; set; } = "";
    public string TopicDraft { get; set; } = "";
    public DateTime DraftUpdatedAt { get; set; }
    public Dictionary<string,string> ChatDrafts { get; set; } = [];
    public static PortableData From(UserState s) => new() { Personas=s.Personas, PersonaId=s.PersonaId, Relation=s.Relation, Goal=s.Goal, ReplyCount=s.ReplyCount, Conversations=s.Conversations, ReplyHistory=s.ReplyHistory, Stickers=s.Stickers, StickerFavorites=s.StickerFavorites, ReplyDraft=s.ReplyDraft, PolishDraft=s.PolishDraft, TopicDraft=s.TopicDraft, DraftUpdatedAt=s.DraftUpdatedAt, ChatDrafts=s.ChatDrafts };
    public UserState ToState()
    {
        if(Version!=1) throw new InvalidOperationException("此备份版本暂不支持。");
        var state=new UserState { Personas=Personas,PersonaId=PersonaId,Relation=Relation,Goal=Goal,ReplyCount=ReplyCount,Conversations=Conversations,ReplyHistory=ReplyHistory,Stickers=Stickers,StickerFavorites=StickerFavorites,ReplyDraft=ReplyDraft,PolishDraft=PolishDraft,TopicDraft=TopicDraft,DraftUpdatedAt=DraftUpdatedAt,ChatDrafts=ChatDrafts };
        try { Validation.State(state); } catch(Exception e) when(e is NullReferenceException or ArgumentException or InvalidOperationException) { throw new InvalidOperationException("备份内容格式异常，未修改本机数据。"); }
        return state;
    }
}
public static class PortableBackup
{
    public const int Iterations=600000, HeaderBytes=44, MaxBytes=Vault.MaxPlainBytes+60;
    private static ReadOnlySpan<byte> Magic => "CHATQBK1"u8;
    private static void Password(string password) { if(password.Length is <8 or >128 || string.IsNullOrWhiteSpace(password)) throw new InvalidOperationException("备份密码需为8–128个字符，请妥善保管。"); }
    public static byte[] Encrypt(UserState state,string password)
    {
        Password(password); Validation.State(state);
        byte[] plain=JsonSerializer.SerializeToUtf8Bytes(PortableData.From(state),Defaults.Json);
        if(plain.Length>Vault.MaxPlainBytes) throw new InvalidOperationException("备份内容超过容量限制。");
        byte[] result=new byte[plain.Length+60];Magic.CopyTo(result);BinaryPrimitives.WriteInt32LittleEndian(result.AsSpan(8),Iterations);
        RandomNumberGenerator.Fill(result.AsSpan(12,28));BinaryPrimitives.WriteInt32LittleEndian(result.AsSpan(40),plain.Length);
        byte[] key=Rfc2898DeriveBytes.Pbkdf2(password,result.AsSpan(12,16),Iterations,HashAlgorithmName.SHA256,32);
        try { using var aes=new AesGcm(key,16);aes.Encrypt(result.AsSpan(28,12),plain,result.AsSpan(HeaderBytes,plain.Length),result.AsSpan(HeaderBytes+plain.Length,16),result.AsSpan(0,HeaderBytes));return result; }
        finally { CryptographicOperations.ZeroMemory(key);CryptographicOperations.ZeroMemory(plain); }
    }
    public static PortableData Decrypt(byte[] data,string password)
    {
        Password(password);
        if(data.Length is <60 or >MaxBytes || !data.AsSpan(0,8).SequenceEqual(Magic) || BinaryPrimitives.ReadInt32LittleEndian(data.AsSpan(8))!=Iterations || BinaryPrimitives.ReadInt32LittleEndian(data.AsSpan(40))!=data.Length-60) throw new InvalidOperationException("备份文件不完整或版本不支持。");
        byte[] key=Rfc2898DeriveBytes.Pbkdf2(password,data.AsSpan(12,16),Iterations,HashAlgorithmName.SHA256,32),plain=new byte[data.Length-60];
        try
        {
            using var aes=new AesGcm(key,16);aes.Decrypt(data.AsSpan(28,12),data.AsSpan(HeaderBytes,plain.Length),data.AsSpan(HeaderBytes+plain.Length,16),plain,data.AsSpan(0,HeaderBytes));
            var value=JsonSerializer.Deserialize<PortableData>(plain,Defaults.Json)??throw new InvalidOperationException("备份没有有效内容。");_ = value.ToState();return value;
        }
        catch(CryptographicException) { throw new InvalidOperationException("密码不正确或备份已损坏，未修改本机数据。"); }
        catch(JsonException) { throw new InvalidOperationException("备份内容格式异常，未修改本机数据。"); }
        finally { CryptographicOperations.ZeroMemory(key);CryptographicOperations.ZeroMemory(plain); }
    }
    public static void Apply(UserState target,PortableData data,bool merge)
    {
        var source=data.ToState();
        if(merge)
        {
            target.Personas=target.Personas.Concat(source.Personas).DistinctBy(x=>x.Id).ToList();
            target.Conversations=target.Conversations.Concat(source.Conversations).DistinctBy(x=>x.Id).ToList();
            target.ReplyHistory=target.ReplyHistory.Concat(source.ReplyHistory).DistinctBy(x=>x.Id).OrderByDescending(x=>x.CreatedAt).ToList();
            target.Stickers=target.Stickers.Concat(source.Stickers).DistinctBy(x=>x.Id).ToList();
            target.StickerFavorites=target.StickerFavorites.Concat(source.StickerFavorites).Distinct().ToList();
            foreach(var pair in source.ChatDrafts) target.ChatDrafts.TryAdd(pair.Key,pair.Value);
        }
        else
        {
            target.Personas=source.Personas;target.PersonaId=source.PersonaId;target.Relation=source.Relation;target.Goal=source.Goal;target.ReplyCount=source.ReplyCount;
            target.Conversations=source.Conversations;target.ReplyHistory=source.ReplyHistory;target.Stickers=source.Stickers;target.StickerFavorites=source.StickerFavorites;
            target.ReplyDraft=source.ReplyDraft;target.PolishDraft=source.PolishDraft;target.TopicDraft=source.TopicDraft;target.DraftUpdatedAt=source.DraftUpdatedAt;target.ChatDrafts=source.ChatDrafts;
        }
        // Validation occurs before Vault writes. Capacity conflicts preserve the original file.
        Validation.State(target);
    }
}
