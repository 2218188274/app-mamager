using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Data.Sqlite;

namespace ChatQ.Windows;

public sealed record WechatSession(string Id,string Name,long LastTime)
{
    public override string ToString()=>Name+(Name==Id?"":" · "+Id)+(Id.EndsWith("@chatroom",StringComparison.Ordinal)?" · 群聊":"");
}
public sealed record WechatSourceFile(string Path,long Length,DateTime LastWrite);
public sealed record WechatCatalog(string Root,List<WechatSession> Sessions,List<WechatSourceFile> Files);
public sealed record WechatReadResult(ImportedThread Thread,int AvailableText,int NonText,int UnsupportedText,int RangeMessages,List<string> Sources,int Decompressed=0,int Inspected=0)
{
    public string Coverage=>$"范围内 {RangeMessages} 条消息，{AvailableText} 条文字记录。本次检查 {Inspected} 条，读取 {Thread.Lines.Count} 条，压缩还原 {Decompressed} 条。未解析或空白 {UnsupportedText} 条、非文本 {NonText} 条未导出。";
}
public sealed record WechatRange(int Limit,long? From,long? Until)
{
    public static WechatRange Parse(bool all,string from,string to)
    {
        long? Date(string value,bool end)
        {
            if(string.IsNullOrWhiteSpace(value))return null;
            if(!DateTime.TryParseExact(value.Trim(),"yyyy-MM-dd",CultureInfo.InvariantCulture,DateTimeStyles.AssumeUniversal|DateTimeStyles.AdjustToUniversal,out var date))throw new InvalidOperationException("日期请填写YYYY-MM-DD，或留空。");
            if(end && date.Year==9999)throw new InvalidOperationException("结束日期超出支持范围。");
            return new DateTimeOffset(end?date.AddDays(1):date).ToUnixTimeSeconds();
        }
        long? start=Date(from,false),until=Date(to,true);
        if(start.HasValue && until.HasValue && start>=until)throw new InvalidOperationException("开始日期不能晚于结束日期。");
        return new(all?ChatImport.MaxLines:200,start,until);
    }
}

/// <summary>Only a deliberately selected, closed, plaintext WeChat4 database snapshot. No discovery, decryption, client or AI.</summary>
public static class WechatDatabase
{
    // Explicit noninteractive packaged-runtime diagnostic: RAM only, before app/vault initialization.
    public static int CheckRuntime()
    {
        try{using var db=new SqliteConnection("Data Source=:memory:;Pooling=False");db.Open();using var command=db.CreateCommand();command.CommandText="SELECT sqlite_version()";return command.ExecuteScalar() is string version && Version.TryParse(version,out var parsed) && parsed>=new Version(3,50,2) && WechatText.Decode(new byte[]{0x28,0xb5,0x2f,0xfd,0x20,5,0x29,0,0,67,104,97,116,81}).Text=="ChatQ"?0:2;}catch{return 2;}
    }
    private static InvalidOperationException Invalid(string message)=>new("微信导出未完成："+message);
    private static void DirectoryCheck(string path)
    {
        var directory=new DirectoryInfo(path);
        if(!directory.Exists || (directory.Attributes&FileAttributes.ReparsePoint)!=0)throw Invalid("请选择实际的数据副本文件夹，不使用链接目录。");
    }
    private static string Root(string selected)
    {
        if(!Path.IsPathFullyQualified(selected) || selected.StartsWith(@"\\",StringComparison.Ordinal))throw Invalid("请选择本机已解密的数据副本文件夹。");
        string root=Path.GetFullPath(selected);DirectoryCheck(root);
        if(Directory.Exists(Path.Combine(root,"db_storage"))){root=Path.Combine(root,"db_storage");DirectoryCheck(root);}
        DirectoryCheck(Path.Combine(root,"session"));DirectoryCheck(Path.Combine(root,"message"));return root;
    }
    private static List<WechatSourceFile> Files(string root)
    {
        var paths=new List<string>{Path.Combine(root,"session","session.db")};
        string contacts=Path.Combine(root,"contact","contact.db");
        if(File.Exists(contacts)){DirectoryCheck(Path.GetDirectoryName(contacts)!);paths.Add(contacts);}
        var entries=Directory.EnumerateFileSystemEntries(Path.Combine(root,"message")).Take(513).ToList();
        if(entries.Count>512)throw Invalid("消息目录条目过多，请选择单个账号的数据副本。");
        var shards=entries.Where(p=>File.Exists(p)&&System.Text.RegularExpressions.Regex.IsMatch(Path.GetFileName(p),@"^message_[0-9]+\.db$",System.Text.RegularExpressions.RegexOptions.IgnoreCase|System.Text.RegularExpressions.RegexOptions.CultureInvariant)).OrderBy(p=>p,StringComparer.OrdinalIgnoreCase).ToList();
        if(shards.Count is 0 or >128)throw Invalid("未找到message/message_数字.db，当前支持参考工具使用的微信4数据结构。");
        paths.AddRange(shards);long total=0;var result=new List<WechatSourceFile>();
        foreach(string path in paths)
        {
            var info=new FileInfo(path);
            if(!info.Exists || (info.Attributes&FileAttributes.ReparsePoint)!=0 || info.Length is <100 or >2L*1024*1024*1024)throw Invalid("数据库不存在、为链接或大小超出限制。");
            foreach(string suffix in new[]{"-wal","-shm","-journal"})if(File.Exists(path+suffix))throw Invalid("数据仍带有WAL/日志文件，请提供已完成备份的独立数据副本，不使用正在运行的微信目录。");
            total+=info.Length;if(total>8L*1024*1024*1024)throw Invalid("所选数据库合计超过8GB，请先缩小数据副本范围。");
            result.Add(new(Path.GetFullPath(path),info.Length,info.LastWriteTimeUtc));
        }
        return result;
    }
    private sealed class Snapshot : IDisposable
    {
        private readonly List<FileStream> guards=[];
        public Snapshot(List<WechatSourceFile> files)
        {
            try
            {
                byte[] header=new byte[16];foreach(var file in files)
                {
                    var stream=new FileStream(file.Path,FileMode.Open,FileAccess.Read,FileShare.Read);guards.Add(stream);
                    var info=new FileInfo(file.Path);if(info.Length!=file.Length || info.LastWriteTimeUtc!=file.LastWrite)throw Invalid("数据已变化，请重新选择已完成备份的数据目录。");
                    if(stream.Read(header)!=16 || !header.AsSpan().SequenceEqual("SQLite format 3\0"u8))throw Invalid("此文件不是可读SQLite数据库。请先准备已解密的数据副本；聊商不获取微信密钥。");
                }
            }
            catch{Dispose();throw;}
        }
        public void Dispose(){foreach(var stream in guards)stream.Dispose();guards.Clear();}
    }
    private sealed class Db : IDisposable
    {
        public SqliteConnection Connection {get;}
        private readonly CancellationToken token;
        private CancellationTokenRegistration interrupt;
        public Db(string path,CancellationToken token)
        {
            this.token=token;token.ThrowIfCancellationRequested();
            Connection=new(new SqliteConnectionStringBuilder{DataSource=new Uri(path).AbsoluteUri+"?immutable=1",Mode=SqliteOpenMode.ReadOnly,Cache=SqliteCacheMode.Private,Pooling=false,DefaultTimeout=2}.ToString());
            try
            {
                Connection.Open();interrupt=token.Register(()=>SQLitePCL.raw.sqlite3_interrupt(Connection.Handle!));
                using var setup=Connection.CreateCommand();setup.CommandText="PRAGMA query_only=ON; PRAGMA trusted_schema=OFF; PRAGMA temp_store=MEMORY; PRAGMA cache_size=-256;";setup.ExecuteNonQuery();
            }
            catch{Dispose();throw;}
        }
        public SqliteCommand Command(string sql,params (string Name,object? Value)[] values)
        {
            token.ThrowIfCancellationRequested();var cmd=Connection.CreateCommand();cmd.CommandText=sql;
            foreach(var value in values)cmd.Parameters.AddWithValue(value.Name,value.Value??DBNull.Value);return cmd;
        }
        public bool Table(string name,params string[] fields)=>CheckTable(name,false,fields);
        public bool OptionalTable(string name,params string[] fields)=>CheckTable(name,true,fields);
        private bool CheckTable(string name,bool optional,string[] fields)
        {
            using var command=Command("SELECT CASE WHEN length(sql)<=16384 THEN sql END FROM sqlite_schema WHERE type='table' AND name=$name",("$name",name));
            if(command.ExecuteScalar() is not string sql)return false;
            if(System.Text.RegularExpressions.Regex.IsMatch(sql,@"\bVIRTUAL\s+TABLE\b",System.Text.RegularExpressions.RegexOptions.IgnoreCase))throw Invalid("不读取虚拟表，请重新导出标准数据库副本。");
            // All callers use fixed identifiers or Msg_ + an MD5 hex digest, never file/SQL text.
            using var columns=Command("PRAGMA table_info(\""+name+"\")");using var reader=columns.ExecuteReader();var names=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            while(reader.Read()){token.ThrowIfCancellationRequested();names.Add(reader.GetString(1));}
            if(fields.Any(field=>!names.Contains(field))){if(optional)return false;throw Invalid("数据库字段与当前支持的微信4格式不同，请使用JSON/CSV导入或重新准备兼容副本。");}return true;
        }
        public void Dispose(){interrupt.Dispose();Connection.Dispose();}
    }
    public static WechatCatalog Open(string selected,CancellationToken token=default)
    {
        token.ThrowIfCancellationRequested();using var timeout=CancellationTokenSource.CreateLinkedTokenSource(token);timeout.CancelAfter(TimeSpan.FromSeconds(35));
        try
        {
            string root=Root(selected);var files=Files(root);using var snapshot=new Snapshot(files);var sessions=new List<WechatSession>();
            using(var db=new Db(Path.Combine(root,"session","session.db"),timeout.Token))
            {
                if(!db.Table("SessionTable","username","last_timestamp"))throw Invalid("没有找到会话表，当前仅支持微信4数据结构。");
                bool title=db.Table("SessionNoContactInfoTable","username","session_title");
                using var command=db.Command("SELECT substr(s.username,1,201),s.last_timestamp,"+(title?"(SELECT substr(session_title,1,301) FROM SessionNoContactInfoTable n WHERE n.username=s.username LIMIT 1)":"''")+" FROM SessionTable s ORDER BY s.last_timestamp DESC,s.username LIMIT 2001");
                using var rows=command.ExecuteReader();var seen=new HashSet<string>(StringComparer.Ordinal);
                while(rows.Read())
                {
                    timeout.Token.ThrowIfCancellationRequested();string id=rows.IsDBNull(0)?"":rows.GetString(0);if(id.Length==0)continue;
                    if(id.Length>200 || !seen.Add(id) || id.Contains('\0'))throw Invalid("会话标识重复或无效，已停止以免错配会话。");
                    string name=rows.IsDBNull(2)?id:rows.GetString(2);if(string.IsNullOrWhiteSpace(name))name=id;if(name.Length>300)throw Invalid("会话名称过长。");
                    sessions.Add(new(id,name,rows.IsDBNull(1)?0:rows.GetInt64(1)));
                }
            }
            if(sessions.Count>2000)throw Invalid("会话超过2000个，请准备较小的数据副本。");if(sessions.Count==0)throw Invalid("副本中没有会话。");
            var contact=files.FirstOrDefault(f=>Path.GetFileName(f.Path).Equals("contact.db",StringComparison.OrdinalIgnoreCase));
            if(contact is not null)
            {
                using var db=new Db(contact.Path,timeout.Token);
                if(!db.Table("contact","username","nick_name","remark"))throw Invalid("联系人表格式不支持；可移除副本中可选的contact目录后使用原始会话ID。");
                using var command=db.Command("SELECT username,substr(nick_name,1,301),substr(remark,1,301) FROM contact WHERE username IN ("+string.Join(',',sessions.Select((_,n)=>"$p"+n))+") LIMIT 2001",sessions.Select((s,n)=>("$p"+n,(object?)s.Id)).ToArray());
                using var rows=command.ExecuteReader();var names=new Dictionary<string,string>(StringComparer.Ordinal);
                while(rows.Read())
                {
                    timeout.Token.ThrowIfCancellationRequested();string id=rows.GetString(0),nick=rows.IsDBNull(1)?"":rows.GetString(1),remark=rows.IsDBNull(2)?"":rows.GetString(2);string name=string.IsNullOrWhiteSpace(remark)?nick:remark;
                    if(name.Length>300)throw Invalid("会话备注过长。");if(!string.IsNullOrWhiteSpace(name))names[id]=name;
                }
                sessions=sessions.Select(s=>s.Name==s.Id && names.TryGetValue(s.Id,out var name)?s with{Name=name}:s).ToList();
            }
            timeout.Token.ThrowIfCancellationRequested();return new(root,sessions,files);
        }
        catch(SqliteException){token.ThrowIfCancellationRequested();if(timeout.IsCancellationRequested)throw Invalid("读取超时，请缩小数据副本范围。");throw Invalid("数据库无法只读解析，请确认副本完整且已解密，原数据未修改。");}
        catch(IOException){throw Invalid("数据文件正在使用或无法读取，请选择已完成备份的独立副本。");}
    }
    private sealed record MessagePosition(long Row,long Id,long Time,long Sequence);
    private sealed class MessageCursor : IDisposable
    {
        private readonly Db db;
        private readonly string table,where;
        private readonly WechatRange range;
        private readonly CancellationToken token;
        private readonly bool senderNames,secondary,sequence;
        private readonly List<MessagePosition> page=[];
        private int offset,index;
        public readonly string Shard;
        public readonly bool Exists;
        public readonly int Total,TextRecords;
        public MessagePosition Head {get;private set;}=new(0,0,0,0);
        public MessageCursor(string file,string table,WechatRange range,CancellationToken token)
        {
            this.table=table;this.range=range;this.token=token;Shard=Path.GetFileNameWithoutExtension(file);where=" WHERE ($from IS NULL OR create_time>=$from) AND ($until IS NULL OR create_time<$until)";
            db=new Db(file,token);
            try
            {
                Exists=db.Table(table,"local_id","create_time","local_type","real_sender_id","message_content");if(!Exists)return;
                senderNames=db.OptionalTable("Name2Id","user_name");secondary=db.OptionalTable(table,"compress_content");sequence=db.OptionalTable(table,"sort_seq");
                using var count=db.Command("SELECT COUNT(*),COALESCE(SUM(CASE WHEN (local_type & 4294967295)=1 THEN 1 ELSE 0 END),0) FROM \""+table+"\""+where,("$from",range.From),("$until",range.Until));using var values=count.ExecuteReader();values.Read();Total=values.GetInt32(0);TextRecords=values.GetInt32(1);
            }
            catch{Dispose();throw;}
        }
        public bool Move()
        {
            token.ThrowIfCancellationRequested();if(!Exists)return false;
            if(index>=page.Count)
            {
                page.Clear();index=0;
                // Page only row identities. Sorting never retains every message body or compressed buffer.
                string sort=sequence?"COALESCE(sort_seq,local_id)":"local_id";
                using var command=db.Command("SELECT rowid,local_id,create_time,"+sort+" FROM \""+table+"\""+where+" AND (local_type & 4294967295)=1 ORDER BY create_time DESC,"+sort+" DESC,local_id DESC,rowid DESC LIMIT 200 OFFSET $offset",("$from",range.From),("$until",range.Until),("$offset",offset));
                using var rows=command.ExecuteReader();while(rows.Read()){token.ThrowIfCancellationRequested();if(rows.IsDBNull(1))throw Invalid("消息缺少来源ID。");page.Add(new(rows.GetInt64(0),rows.GetInt64(1),rows.IsDBNull(2)?0:rows.GetInt64(2),rows.GetInt64(3)));}offset+=page.Count;
                if(page.Count==0)return false;
            }
            Head=page[index++];return true;
        }
        public (string Sender,WechatTextResult Text) Body()
        {
            string fallback="CASE WHEN m.real_sender_id IS NULL THEN '' ELSE '发送者ID:'||substr(CAST(m.real_sender_id AS TEXT),1,201) END";
            string sender=senderNames?"COALESCE((SELECT substr(user_name,1,201) FROM Name2Id WHERE rowid=m.real_sender_id),"+fallback+")":fallback;
            string Value(string column)=>"CASE WHEN (typeof(m."+column+")='text' AND length(m."+column+")<=20000) OR (typeof(m."+column+")='blob' AND length(m."+column+")<="+WechatText.MaxEncodedBytes+") THEN m."+column+" END";
            string Omitted(string column)=>"CASE WHEN (typeof(m."+column+")='text' AND length(m."+column+")>20000) OR (typeof(m."+column+")='blob' AND length(m."+column+")>"+WechatText.MaxEncodedBytes+") THEN 1 ELSE 0 END";
            using var command=db.Command("SELECT "+sender+","+Value("message_content")+","+(secondary?Value("compress_content"):"NULL")+","+Omitted("message_content")+","+(secondary?Omitted("compress_content"):"0")+" FROM \""+table+"\" m WHERE m.rowid=$row",("$row",Head.Row));using var row=command.ExecuteReader();if(!row.Read())throw Invalid("所选消息已变化，请重新选择副本。");
            return(row.GetString(0),WechatText.Decode(row.IsDBNull(1)?null:row.GetValue(1),row.IsDBNull(2)?null:row.GetValue(2),row.GetInt32(3)!=0,row.GetInt32(4)!=0,token));
        }
        public void Dispose()=>db.Dispose();
    }
    public static WechatReadResult Read(WechatCatalog catalog,WechatSession session,WechatRange range,CancellationToken token=default)
    {
        token.ThrowIfCancellationRequested();if(range.Limit is not (200 or ChatImport.MaxLines) || range.From.HasValue&&range.Until.HasValue&&range.From>=range.Until || !catalog.Sessions.Any(s=>s==session))throw Invalid("请选择当前目录的会话和有效范围。");
        using var timeout=CancellationTokenSource.CreateLinkedTokenSource(token);timeout.CancelAfter(TimeSpan.FromSeconds(45));
        try
        {
            string root=Root(catalog.Root);var files=Files(root);if(!files.SequenceEqual(catalog.Files))throw Invalid("数据文件发生变化，请重新选择目录。");using var snapshot=new Snapshot(files);
            string table="Msg_"+Convert.ToHexString(MD5.HashData(Encoding.UTF8.GetBytes(session.Id))).ToLowerInvariant();
            var cursors=new List<MessageCursor>();
            try
            {
                int total=0,available=0,unsupported=0,inspected=0,decompressed=0;long bytes=0;var lines=new List<ImportedLine>();
                var order=Comparer<(long Time,long Sequence,long Id,string Shard,long Row)>.Create((a,b)=>{int result=b.Time.CompareTo(a.Time);if(result==0)result=b.Sequence.CompareTo(a.Sequence);if(result==0)result=b.Id.CompareTo(a.Id);if(result==0)result=StringComparer.Ordinal.Compare(b.Shard,a.Shard);if(result==0)result=b.Row.CompareTo(a.Row);return result;});
                var queue=new PriorityQueue<MessageCursor,(long Time,long Sequence,long Id,string Shard,long Row)>(order);
                foreach(var file in files.Where(f=>Path.GetFileName(f.Path).StartsWith("message_",StringComparison.OrdinalIgnoreCase)))
                {
                    var cursor=new MessageCursor(file.Path,table,range,timeout.Token);cursors.Add(cursor);total=checked(total+cursor.Total);available=checked(available+cursor.TextRecords);
                    if(range.Limit==ChatImport.MaxLines && available>ChatImport.MaxLines)throw Invalid("范围内文字记录超过50000条，请选择最近200条或缩小日期范围，不会静默丢弃较早消息。");
                    if(cursor.Move())queue.Enqueue(cursor,(cursor.Head.Time,cursor.Head.Sequence,cursor.Head.Id,cursor.Shard,cursor.Head.Row));
                }
                if(!cursors.Any(c=>c.Exists))throw Invalid("未找到这段会话的消息表，未生成空导出文件。");
                while(queue.Count>0 && lines.Count<range.Limit)
                {
                    timeout.Token.ThrowIfCancellationRequested();if(inspected>=ChatImport.MaxLines)throw Invalid("已检查50000条文字记录仍不足所选条数，请缩小日期范围后重试。");
                    var cursor=queue.Dequeue();var position=cursor.Head;var body=cursor.Body();inspected++;
                    if(body.Text.TooLarge)throw Invalid("所选文字或解压结果超出单条20000字限制，请缩小日期范围；没有截断原消息。");
                    if(body.Text.Text is not string content)unsupported++;
                    else
                    {
                        string who=body.Sender;if(who.Length is 0 or >200)throw Invalid("消息缺少可用发送人标记，请使用兼容的数据副本。");
                        if(session.Id.EndsWith("@chatroom",StringComparison.Ordinal)){int split=content.IndexOf(":\n",StringComparison.Ordinal);if(split is >0 and <200 && (content[..split]==who||content[..split].StartsWith("wxid_",StringComparison.Ordinal))){who=content[..split];content=content[(split+2)..];}}
                        if(string.IsNullOrWhiteSpace(content))unsupported++;
                        else
                        {
                            string formatted="";if(position.Time!=0){try{formatted=DateTimeOffset.FromUnixTimeSeconds(position.Time).ToString("yyyy-MM-dd HH:mm:ss zzz",CultureInfo.InvariantCulture);}catch(ArgumentOutOfRangeException){throw Invalid("消息时间超出范围。");}}
                            bytes+=Encoding.UTF8.GetByteCount(content)+Encoding.UTF8.GetByteCount(who)+128;if(bytes>ChatImport.MaxBytes)throw Invalid("所选文字过大，请缩小日期范围。");
                            string id=cursor.Shard+":"+(position.Id==0?"row:"+position.Row.ToString(CultureInfo.InvariantCulture):position.Id.ToString(CultureInfo.InvariantCulture));lines.Add(new(id,who,null,formatted,content,true));if(body.Text.Compressed)decompressed++;
                        }
                    }
                    if(lines.Count<range.Limit && cursor.Move())queue.Enqueue(cursor,(cursor.Head.Time,cursor.Head.Sequence,cursor.Head.Id,cursor.Shard,cursor.Head.Row));
                }
                if(lines.Count==0)throw Invalid($"范围内没有可读取的文字；已检查{inspected}条，未解析或空白{unsupported}条。");
                lines.Reverse();timeout.Token.ThrowIfCancellationRequested();return new(new(session.Id,session.Name,lines),available,total-available,unsupported,total,files.Select(f=>f.Path).ToList(),decompressed,inspected);
            }
            finally{foreach(var cursor in cursors)cursor.Dispose();}
        }
        catch(SqliteException){token.ThrowIfCancellationRequested();if(timeout.IsCancellationRequested)throw Invalid("读取超时，请缩小日期范围。");throw Invalid("消息数据库不完整或格式不同，已停止读取；原文件未修改。");}
        catch(IOException){throw Invalid("数据副本正在使用或已变化，请重新准备后选择。");}
        catch(OverflowException){throw Invalid("消息数量超出支持范围，请缩小日期范围。");}
        catch(Exception e) when(e is InvalidCastException or FormatException){throw Invalid("消息字段格式不兼容，请准备标准微信4数据副本。");}
    }
}
