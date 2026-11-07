using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text.Json;

namespace ChatQ.Windows;

public sealed record LibraryChat(string Id,string Name,ImportedThread Thread,string Self,bool Chronological,DateTime SavedAt,DateTime UpdatedAt,SavedHistoryAnalysis? Analysis=null)
{
    public override string ToString()=>Name+" · "+Thread.Lines.Count+"条";
}
public sealed class ChatLibraryData
{
    public int Version { get; set; } = 2;
    public List<LibraryChat> Chats { get; set; } = [];
}

/// <summary>Explicitly saved imports only. Separate from normal conversations, backups and MessageHub.</summary>
public sealed class ChatLibrary(string root)
{
    public const int MaxEntries=20,MaxPlainBytes=16*1024*1024,MaxLines=50000;
    private static readonly ConcurrentDictionary<string,object> Gates=new(StringComparer.OrdinalIgnoreCase);
    public string FilePath { get; } = Path.Combine(Path.GetFullPath(root),"chat-library.vault");
    private object Gate=>Gates.GetOrAdd(FilePath,_=>new());
    public ChatLibraryData Read()
    {
        lock(Gate)
        {
            if(!File.Exists(FilePath))return new();
            if(new FileInfo(FilePath).Length>MaxPlainBytes+1024*1024)throw new InvalidOperationException("聊天资料库大小异常，原文件已保留。");
            byte[] plain=DeviceEncryption.Unprotect(File.ReadAllBytes(FilePath));
            try
            {
                if(plain.Length>MaxPlainBytes)throw new InvalidOperationException("聊天资料库超过容量，原文件已保留。");
                var data=JsonSerializer.Deserialize<ChatLibraryData>(plain,Defaults.Json)??throw new InvalidOperationException("聊天资料库不可用。");
                Validate(data);return data;
            }
            catch(JsonException){throw new InvalidOperationException("聊天资料库损坏，原文件已保留；不会创建空库覆盖。");}
            finally{CryptographicOperations.ZeroMemory(plain);}
        }
    }
    public LibraryChat Save(ImportedThread thread,string self,bool chronological,string name,CancellationToken token=default)
    {
        lock(Gate)
        {
            name=Name(name);var data=Read();DateTime now=DateTime.UtcNow;
            // Validate identity using the same explicit selection contract as analysis.
            _=ChatImport.Select(thread,self,1);
            byte[] snapshot=JsonSerializer.SerializeToUtf8Bytes(thread,Defaults.Json);ImportedThread copy;
            try{copy=JsonSerializer.Deserialize<ImportedThread>(snapshot,Defaults.Json)!;}finally{CryptographicOperations.ZeroMemory(snapshot);}
            var item=new LibraryChat(Guid.NewGuid().ToString("N"),name,copy,self,chronological,now,now);
            data.Chats.Insert(0,item);Write(data,token);return item;
        }
    }
    public LibraryChat Rename(string id,string name,DateTime expectedUpdate,CancellationToken token=default)
    {
        lock(Gate)
        {
            token.ThrowIfCancellationRequested();
            var data=Read();var item=Find(data,id,expectedUpdate);
            var renamed=item with{Name=Name(name),UpdatedAt=DateTime.UtcNow};
            data.Chats[data.Chats.IndexOf(item)]=renamed;
            Write(data,token);
            return renamed;
        }
    }
    public void Delete(string id,DateTime expectedUpdate,CancellationToken token=default)
    {
        lock(Gate){token.ThrowIfCancellationRequested();var data=Read();data.Chats.Remove(Find(data,id,expectedUpdate));Write(data,token);}
    }
    public LibraryChat SaveAnalysis(string id,DateTime expectedUpdate,SavedHistoryAnalysis analysis,CancellationToken token=default)
    {
        lock(Gate)
        {
            var data=Read();var current=Find(data,id,expectedUpdate);analysis.Validate(current.Thread,current.Self);
            var updated=current with{Analysis=analysis,UpdatedAt=DateTime.UtcNow};data.Chats[data.Chats.IndexOf(current)]=updated;Write(data,token);return updated;
        }
    }
    public static string Fingerprint(ChatLibraryData data)
    {
        byte[] bytes=JsonSerializer.SerializeToUtf8Bytes(data,Defaults.Json);
        try{return Convert.ToHexString(SHA256.HashData(bytes));}finally{CryptographicOperations.ZeroMemory(bytes);}
    }
    public static LibraryMergePreview PreviewMerge(ChatLibraryData current,ChatLibraryData incoming)
    {
        Validate(current);Validate(incoming);var ids=current.Chats.ToDictionary(x=>x.Id);int duplicate=0,conflict=0;
        var added=new List<LibraryChat>();
        foreach(var item in incoming.Chats)
        {
            if(!ids.TryGetValue(item.Id,out var old)){added.Add(item);continue;}
            if(Fingerprint(new(){Chats=[old]})==Fingerprint(new(){Chats=[item]}))duplicate++;else conflict++;
        }
        var result=new ChatLibraryData{Chats=current.Chats.Concat(added).ToList()};Validate(result);
        byte[] bytes=JsonSerializer.SerializeToUtf8Bytes(result,Defaults.Json);
        try{if(bytes.Length>MaxPlainBytes)throw new InvalidOperationException("合并后资料库超过16MB，请先整理本机资料；原数据保留。");}finally{CryptographicOperations.ZeroMemory(bytes);}
        return new(added.Count,duplicate,conflict,result.Chats.Count,Fingerprint(current));
    }
    public LibraryMergePreview Merge(ChatLibraryData incoming,string expectedFingerprint,CancellationToken token=default)
    {
        lock(Gate)
        {
            var current=Read();if(Fingerprint(current)!=expectedFingerprint)throw new InvalidOperationException("本机资料库已变化，请重新预览后恢复，未覆盖任何资料。");
            var preview=PreviewMerge(current,incoming);var ids=current.Chats.Select(x=>x.Id).ToHashSet();current.Chats.AddRange(incoming.Chats.Where(x=>!ids.Contains(x.Id)));Write(current,token);return preview;
        }
    }
    private static LibraryChat Find(ChatLibraryData data,string id,DateTime updated)=>data.Chats.Find(x=>x.Id==id && x.UpdatedAt==updated)??throw new InvalidOperationException("资料已更新或删除，请刷新列表后重试。");
    private static string Name(string name)
    {
        name=name.Trim();if(name.Length is <1 or >60 || name.Any(char.IsControl))throw new InvalidOperationException("资料名称需为1–60个字符，不能包含换行。");return name;
    }
    public static void Validate(ChatLibraryData data)
    {
        if(data.Version is not (1 or 2) || data.Chats is null || data.Chats.Count>MaxEntries)throw new InvalidOperationException("聊天资料库版本或数量不受支持，未修改原文件。");
        var ids=new HashSet<string>();long lines=0;
        foreach(var item in data.Chats)
        {
            if(item is null || !Guid.TryParseExact(item.Id,"N",out _) || !ids.Add(item.Id) || item.Name is null || Name(item.Name)!=item.Name || item.Thread is null || item.Thread.Lines is null || item.Thread.Id is null || item.Thread.Name is null || item.Thread.Id.Length>200 || item.Thread.Name.Length>200 || item.Self is null || item.Self.Length>200 || item.SavedAt.Kind!=DateTimeKind.Utc || item.UpdatedAt.Kind!=DateTimeKind.Utc || item.UpdatedAt<item.SavedAt)throw new InvalidOperationException("聊天资料格式异常，未修改原文件。");
            lines+=item.Thread.Lines.Count;if(lines>MaxLines)throw new InvalidOperationException("资料库合计最多50000条消息，请先整理已有资料。");
            foreach(var line in item.Thread.Lines)
                if(line is null || line.Id is null || line.Sender is null || line.Time is null || line.Text is null || line.Id.Length>200 || line.Sender.Length>200 || line.Time.Length>100 || line.Text.Length>20000)throw new InvalidOperationException("聊天资料中有不受支持的字段，未保存。");
            _=ChatImport.Select(item.Thread,item.Self,1);
            if(data.Version==1 && item.Analysis is not null)throw new InvalidOperationException("资料库分析版本不受支持，未修改原文件。");
            item.Analysis?.Validate(item.Thread,item.Self);
        }
    }
    private void Write(ChatLibraryData data,CancellationToken token=default)
    {
        token.ThrowIfCancellationRequested();data.Version=2;Validate(data);byte[] plain=JsonSerializer.SerializeToUtf8Bytes(data,Defaults.Json);
        try
        {
            if(plain.Length>MaxPlainBytes)throw new InvalidOperationException("聊天资料库最多16MB，请先另存并整理已有资料；原数据已保留。");
            byte[] encrypted=DeviceEncryption.Protect(plain);string directory=Path.GetDirectoryName(FilePath)!;Directory.CreateDirectory(directory);
            string temporary=Path.Combine(directory,"library-"+Guid.NewGuid().ToString("N")+".tmp");
            try
            {
                using(var stream=new FileStream(temporary,FileMode.CreateNew,FileAccess.Write,FileShare.None)){stream.Write(encrypted);stream.Flush(true);}
                // No plaintext or hidden duplicate backup. Failed atomic writes preserve the old library.
                token.ThrowIfCancellationRequested();if(File.Exists(FilePath))File.Replace(temporary,FilePath,null);else File.Move(temporary,FilePath);
            }
            finally{if(File.Exists(temporary))File.Delete(temporary);}
        }
        finally{CryptographicOperations.ZeroMemory(plain);}
    }
}
public sealed record LibraryMergePreview(int Added,int Duplicate,int Conflicts,int Total,string CurrentFingerprint);
