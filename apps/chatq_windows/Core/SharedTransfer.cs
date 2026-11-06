using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace ChatQ.Windows;

// Deliberately independent of all native state/credential DTOs.
public sealed record TransferPersona(string Id,string Name,string Instructions,string Example);
public sealed record TransferFavorite(string Id,string Text,long SavedAt);
public sealed record TransferChat(string Id,string Title,long UpdatedAt,List<Message> Messages);
public sealed class TransferData
{
    [JsonRequired] public string Format { get; set; } = "chatq-transfer";
    [JsonRequired] public int Version { get; set; } = 1;
    [JsonRequired] public string Source { get; set; } = "windows";
    [JsonRequired] public long CreatedAt { get; set; } = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    [JsonRequired] public List<TransferPersona> Personas { get; set; } = [];
    [JsonRequired] public List<TransferFavorite> Favorites { get; set; } = [];
    [JsonRequired] public List<TransferChat> Conversations { get; set; } = [];
}
public sealed record TransferPreview(int Added,int Duplicate,int Conflict,string Fingerprint);
public sealed record TransferUndo(List<string> Personas,List<string> Favorites,List<string> Conversations,string Expected);
public static class SharedTransfer
{
    public const int MaxPlainBytes=6*1024*1024,MaxBytes=MaxPlainBytes+60,Iterations=600000;
    public static readonly JsonSerializerOptions Json=new(){PropertyNamingPolicy=JsonNamingPolicy.CamelCase,UnmappedMemberHandling=JsonUnmappedMemberHandling.Disallow,MaxDepth=16,Encoder=System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping};
    private static readonly UTF8Encoding Utf8=new(false,true);
    public static string Id(string value,string source)=>Regex.IsMatch(value,"^cq[0-9a-f]{32}$")?value:"cq"+Hash(Utf8.GetBytes(source+":"+value))[..32];
    public static string Hash(byte[] bytes)=>Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
    private static long Time(DateTime value)=>new DateTimeOffset(value.ToUniversalTime()).ToUnixTimeMilliseconds();
    public static TransferData Export(UserState state)
    {
        Validation.State(state);
        var data=new TransferData{
            Personas=state.Personas.Select(p=>new TransferPersona(Id(p.Id,"windows"),p.Name,p.Instructions,p.Example)).ToList(),
            Favorites=state.ReplyHistory.Where(r=>r.Favorite).DistinctBy(r=>r.Text).Select(r=>new TransferFavorite(Id(r.Text,"favorite"),r.Text,Time(r.CreatedAt))).ToList(),
            Conversations=state.Conversations.Select(c=>new TransferChat(Id(c.Id,"windows"),c.Name,Time(c.UpdatedAt),c.Messages.ToList())).ToList()};
        Validate(data);return data;
    }
    public static void Validate(TransferData d)
    {
        if(d.Format!="chatq-transfer"||d.Version!=1||d.Source is not("windows" or "android")||!Stamp(d.CreatedAt)||d.Personas is null||d.Favorites is null||d.Conversations is null||d.Personas.Count>20||d.Favorites.Count>100||d.Conversations.Count>50)throw Error();
        bool Ident(string s)=>s is not null&&Regex.IsMatch(s,"^cq[0-9a-f]{32}$");
        bool Text(string? s,int min,int max){if(s is null||s.Length<min||s.Length>max||(min>0&&string.IsNullOrWhiteSpace(s)))return false;try{_=Utf8.GetByteCount(s);return true;}catch(EncoderFallbackException){return false;}}
        if(d.Personas.Any(p=>p is null||!Ident(p.Id)||!Text(p.Name,1,20)||!Text(p.Instructions,1,300)||!Text(p.Example,0,120))||d.Personas.DistinctBy(p=>p.Id).Count()!=d.Personas.Count)throw Error();
        if(d.Favorites.Any(f=>f is null||!Ident(f.Id)||!Text(f.Text,1,1000)||!Stamp(f.SavedAt))||d.Favorites.DistinctBy(f=>f.Id).Count()!=d.Favorites.Count||d.Favorites.DistinctBy(f=>f.Text).Count()!=d.Favorites.Count)throw Error();
        if(d.Conversations.DistinctBy(c=>c?.Id).Count()!=d.Conversations.Count)throw Error();
        foreach(var c in d.Conversations)
        {
            if(c is null||!Ident(c.Id)||!Text(c.Title,1,40)||c.Title.Any(char.IsControl)||!Stamp(c.UpdatedAt)||c.Messages is null||c.Messages.Count>100||c.Messages.Count%2!=0)throw Error();
            for(int i=0;i<c.Messages.Count;i++){var m=c.Messages[i];if(m is null||m.Role!=(i%2==0?"user":"assistant")||!Text(m.Content,1,i%2==0?2000:10000))throw Error();}
        }
        if(JsonSerializer.SerializeToUtf8Bytes(d,Json).Length>MaxPlainBytes)throw Error();
    }
    private static bool Stamp(long n)=>n is >0 and <4102444800000;
    private static InvalidOperationException Error()=>new("跨端文件不符合通用范围：最多20个人设（指令300字）、100句收藏、50个AI会话（标题40字、每个50轮，问题2000字），总计6MiB。请先整理；原数据未修改。");
    private static void Password(string password){if(password.Length is <8 or >128||string.IsNullOrWhiteSpace(password))throw new InvalidOperationException("迁移密码需为8–128个字符。");}
    public static byte[] Encrypt(TransferData data,string password,CancellationToken token=default)
    {
        Password(password);Validate(data);token.ThrowIfCancellationRequested();byte[] plain=JsonSerializer.SerializeToUtf8Bytes(data,Json),key=[];
        try{byte[] output=new byte[plain.Length+60];"CHATQTX1"u8.CopyTo(output);BinaryPrimitives.WriteInt32LittleEndian(output.AsSpan(8),Iterations);RandomNumberGenerator.Fill(output.AsSpan(12,28));BinaryPrimitives.WriteInt32LittleEndian(output.AsSpan(40),plain.Length);key=Rfc2898DeriveBytes.Pbkdf2(password,output.AsSpan(12,16),Iterations,HashAlgorithmName.SHA256,32);token.ThrowIfCancellationRequested();using var aes=new AesGcm(key,16);aes.Encrypt(output.AsSpan(28,12),plain,output.AsSpan(44,plain.Length),output.AsSpan(44+plain.Length,16),output.AsSpan(0,44));token.ThrowIfCancellationRequested();return output;}
        finally{CryptographicOperations.ZeroMemory(plain);CryptographicOperations.ZeroMemory(key);}
    }
    public static TransferData Decrypt(byte[] bytes,string password,CancellationToken token=default)
    {
        Password(password);token.ThrowIfCancellationRequested();
        if(bytes.Length is <60 or >MaxBytes||!bytes.AsSpan(0,8).SequenceEqual("CHATQTX1"u8)||BinaryPrimitives.ReadInt32LittleEndian(bytes.AsSpan(8))!=Iterations||BinaryPrimitives.ReadInt32LittleEndian(bytes.AsSpan(40))!=bytes.Length-60)throw new InvalidOperationException("请选择完整的.cqtransfer跨端迁移文件。");
        byte[] key=Rfc2898DeriveBytes.Pbkdf2(password,bytes.AsSpan(12,16),Iterations,HashAlgorithmName.SHA256,32),plain=new byte[bytes.Length-60];
        try{token.ThrowIfCancellationRequested();using var aes=new AesGcm(key,16);aes.Decrypt(bytes.AsSpan(28,12),bytes.AsSpan(44,plain.Length),bytes.AsSpan(44+plain.Length,16),plain,bytes.AsSpan(0,44));var result=JsonSerializer.Deserialize<TransferData>(plain,Json)??throw Error();Validate(result);token.ThrowIfCancellationRequested();return result;}
        catch(Exception e)when(e is CryptographicException or JsonException){throw new InvalidOperationException("密码不正确、文件损坏或版本不支持，本机未修改。");}
        finally{CryptographicOperations.ZeroMemory(key);CryptographicOperations.ZeroMemory(plain);}
    }
    public static string Fingerprint(UserState state)=>Hash(JsonSerializer.SerializeToUtf8Bytes(PortableData.From(state),Defaults.Json));
    public static (UserState State,TransferPreview Preview,TransferUndo Undo) Merge(UserState current,TransferData data)
    {
        Validate(data);var next=JsonSerializer.Deserialize<UserState>(JsonSerializer.SerializeToUtf8Bytes(current,Defaults.Json),Defaults.Json)!;
        int added=0,duplicate=0,conflict=0;var personas=new List<string>();var favorites=new List<string>();var chats=new List<string>();
        foreach(var p in data.Personas)
        {
            var same=next.Personas.Find(x=>x.Id==p.Id||Id(x.Id,"windows")==p.Id);
            bool Equal(Persona x)=>x.Name==p.Name&&x.Instructions==p.Instructions&&x.Example==p.Example;
            if(same is not null){if(Equal(same))duplicate++;else conflict++;continue;}
            if(next.Personas.Any(Equal)){duplicate++;continue;}next.Personas.Add(new(p.Id,p.Name,p.Instructions,p.Example));personas.Add(p.Id);added++;
        }
        foreach(var f in data.Favorites)
        {
            if(next.ReplyHistory.Any(x=>x.Text==f.Text&&x.Favorite)){duplicate++;continue;}
            var same=next.ReplyHistory.Find(x=>x.Id==f.Id);if(same is not null){conflict++;continue;}
            next.ReplyHistory.Add(new(f.Id,f.Text,"","reply","跨端收藏",DateTimeOffset.FromUnixTimeMilliseconds(f.SavedAt).UtcDateTime,true));favorites.Add(f.Id);added++;
        }
        foreach(var c in data.Conversations)
        {
            var same=next.Conversations.Find(x=>x.Id==c.Id||Id(x.Id,"windows")==c.Id);
            bool Equal(Conversation x)=>x.Name==c.Title&&x.Messages.SequenceEqual(c.Messages);
            if(same is not null){if(Equal(same))duplicate++;else conflict++;continue;}
            if(next.Conversations.Any(Equal)){duplicate++;continue;}
            next.Conversations.Add(new(){Id=c.Id,Name=c.Title,UpdatedAt=DateTimeOffset.FromUnixTimeMilliseconds(c.UpdatedAt).UtcDateTime,Messages=c.Messages.ToList()});chats.Add(c.Id);added++;
        }
        Validation.State(next);if(JsonSerializer.SerializeToUtf8Bytes(next,Defaults.Json).Length>Vault.MaxPlainBytes)throw new InvalidOperationException("合并后本机容量不足，请先整理；没有删除或覆盖现有内容。");
        return(next,new(added,duplicate,conflict,Fingerprint(current)),new(personas,favorites,chats,Fingerprint(next)));
    }
}
