using System.Globalization;
using System.IO.Compression;
using System.Text;
using System.Text.Json;

namespace ChatQ.Windows;

public sealed record ImportedLine(string Id,string Sender,bool? IsSelf,string Time,string Text,bool IsText);
public sealed record ImportedThread(string Id,string Name,List<ImportedLine> Lines)
{
    public override string ToString() => Name + " · " + Lines.Count + "条";
}
public sealed record ImportedArchive(List<ImportedThread> Threads,int DuplicateCount,int MediaCount,bool Chronological,string Format);
public sealed record ImportedDocument(string Name,byte[] Bytes);
public sealed record AnalysisSlice(string Transcript,int Count,int Available,int MediaSkipped,int Shortened,string Self,string Coverage,List<string> EvidenceIds);

/// <summary>Explicit file bytes only. No database, process, manifest path, network or executable access.</summary>
public static class ChatImport
{
    public const int MaxBytes=16*1024*1024, MaxLines=50000, MaxPromptChars=24000;
    public const string SelfFlags="按文件中的我方标记";
    private sealed record Row(string Thread,string Name,ImportedLine Line,int Order,DateTimeOffset? SortTime);
    private static InvalidOperationException Invalid(string detail)=>new("聊天导入未完成："+detail);
    public static ImportedArchive Load(byte[] bytes,string fileName,CancellationToken token=default)
    {
        token.ThrowIfCancellationRequested();if(bytes.Length is 0 or >MaxBytes)throw Invalid("请选择不超过16MB的聊天导出文件。");
        var rows=new List<Row>();string extension=Path.GetExtension(fileName).ToLowerInvariant();
        try
        {
            if(extension==".zip")
            {
                using var memory=new MemoryStream(bytes,false);using var zip=new ZipArchive(memory,ZipArchiveMode.Read);
                if(zip.Entries.Count>512)throw Invalid("压缩包文件太多，请只打包需要分析的会话。");
                if(zip.Entries.Any(e=>Path.GetExtension(e.FullName).ToLowerInvariant() is ".exe" or ".dll"))throw Invalid("这是程序安装包；请选择工具导出的 messages.json、messages.csv 或聊天数据ZIP。");
                var candidates=zip.Entries.Where(e=>e.Name.Length>0 && (e.Name.Equals("messages.json",StringComparison.OrdinalIgnoreCase)||e.Name.Equals("messages.csv",StringComparison.OrdinalIgnoreCase)||e.FullName.Replace('\\','/').Split('/').Contains("messages",StringComparer.OrdinalIgnoreCase)&&Path.GetExtension(e.Name).ToLowerInvariant() is ".json" or ".csv"))
                    .Where(e=>!new[]{"manifest.json","contacts.json","sessions.json"}.Contains(e.Name,StringComparer.OrdinalIgnoreCase)).ToArray();
                if(candidates.Length is 0 or >128 || candidates.Sum(e=>e.Length)>MaxBytes)throw Invalid("未找到有界的messages.json、messages.csv或messages目录中的JSON/CSV。请勿选择安装包或数据库。");
                foreach(var entry in candidates)
                {
                    token.ThrowIfCancellationRequested();
                    if(entry.Length>MaxBytes || entry.FullName.Replace('\\','/').Split('/').Any(p=>p=="..") || entry.FullName.StartsWith('/') || entry.FullName.Contains(':'))throw Invalid("压缩包路径或大小不符合导入要求。");
                    using var stream=entry.Open();using var value=new MemoryStream();byte[] block=new byte[8192];int n;
                    while((n=stream.Read(block))>0){token.ThrowIfCancellationRequested();if(value.Length+n>entry.Length || value.Length+n>MaxBytes)throw Invalid("压缩文件展开过大。");value.Write(block,0,n);}
                    Parse(value.ToArray(),entry.FullName,rows,token);
                }
            }
            else if(extension is ".json" or ".csv")Parse(bytes,Path.GetFileName(fileName),rows,token);
            else throw Invalid("支持JSON、CSV及聊天数据ZIP；请先从导出工具导出记录，不能直接读取微信数据库。");
        }
        catch(Exception e) when(e is JsonException or DecoderFallbackException or InvalidDataException or FormatException or OverflowException or ArgumentOutOfRangeException)
        {throw Invalid("文件格式或编码无法识别，请重新导出UTF-8 JSON/CSV。原文件未修改。");}
        return BuildArchive(rows,extension==".zip"?"聊天数据ZIP":extension.TrimStart('.').ToUpperInvariant(),token);
    }
    public static ImportedArchive LoadDocuments(IReadOnlyList<ImportedDocument> documents,CancellationToken token=default)
    {
        token.ThrowIfCancellationRequested();
        if(documents.Count is <1 or >128 || documents.Any(d=>d.Bytes.Length==0) || documents.Sum(d=>(long)d.Bytes.Length)>MaxBytes)throw Invalid("消息文件数量或合计大小超出限制，最多128个文件、合计16MB。");
        var rows=new List<Row>();
        try
        {
            foreach(var document in documents)
            {
                token.ThrowIfCancellationRequested();string name=Path.GetFileName(document.Name);
                if(Path.GetExtension(name).ToLowerInvariant() is not (".json" or ".csv"))throw Invalid("只导入消息JSON或CSV。");
                Parse(document.Bytes,name,rows,token);
            }
        }
        catch(Exception e) when(e is JsonException or DecoderFallbackException or InvalidDataException or FormatException or OverflowException or ArgumentOutOfRangeException)
        {throw Invalid("文件格式或编码无法识别，原文件未修改。");}
        return BuildArchive(rows,"消息文件夹",token);
    }
    private static ImportedArchive BuildArchive(List<Row> rows,string format,CancellationToken token)
    {
        if(rows.Count==0)throw Invalid("文件中没有可识别的聊天消息；manifest.json和联系人清单不是消息文件。");
        bool chronological=rows.All(r=>r.SortTime.HasValue);int duplicate=0;
        var unique=new List<Row>();var seen=new HashSet<string>(StringComparer.Ordinal);
        foreach(var row in rows)
        {
            token.ThrowIfCancellationRequested();
            if(row.Line.Id.Length>0 && !seen.Add(JsonSerializer.Serialize(new[]{row.Thread,row.Line.Id,row.Line.Sender,row.Line.Time,row.Line.Text,row.Line.IsSelf?.ToString()??""}))) {duplicate++;continue;}
            unique.Add(row);
        }
        var threads=unique.GroupBy(r=>r.Thread).Select(g=>new ImportedThread(g.Key,g.First().Name,(g.All(r=>r.SortTime.HasValue)?g.OrderBy(r=>r.SortTime).ThenBy(r=>r.Order):g.OrderBy(r=>r.Order)).Select(r=>r.Line).ToList())).ToList();
        if(threads.Count>100)throw Invalid("最多导入100个会话，请缩小导出范围。");
        return new(threads,duplicate,unique.Count(r=>!r.Line.IsText),chronological,format);
    }
    private static string Decode(byte[] bytes)
    {
        if(bytes.AsSpan().StartsWith(new byte[]{255,254}))return new UnicodeEncoding(false,true,true).GetString(bytes,2,bytes.Length-2);
        if(bytes.AsSpan().StartsWith(new byte[]{254,255}))return new UnicodeEncoding(true,true,true).GetString(bytes,2,bytes.Length-2);
        return new UTF8Encoding(false,true).GetString(bytes).TrimStart('\uFEFF');
    }
    private static void Parse(byte[] bytes,string name,List<Row> rows,CancellationToken token)
    {
        string text=Decode(bytes),fallback=Path.GetFileNameWithoutExtension(name);
        if(name.EndsWith(".csv",StringComparison.OrdinalIgnoreCase))
        {
            var records=Csv(text,token);if(records.Count<2)throw Invalid("CSV中没有消息。");var header=records[0];
            int Field(params string[] options)=>header.FindIndex(h=>options.Any(o=>h.Trim().Equals(o,StringComparison.OrdinalIgnoreCase)));
            int sender=Field("发送人","发送者","sender","SenderName"),content=Field("内容","content","StrContent"),time=Field("时间","time","CreateTime"),type=Field("类型","type","local_type"),self=Field("IsSelf","IsSender","is_sender","is_self"),talker=Field("Talker","会话","chat_id"),id=Field("ServerId","MsgSvrID","Id","localId","local_id"),displayColumn=Field("会话名称","chat_name"),escaped=Field("ChatQEscaped");
            if(sender<0 || content<0)throw Invalid("CSV需包含“发送人、内容”列；支持“时间、发送人、类型、内容”。");
            foreach(var record in records.Skip(1))
            {
                token.ThrowIfCancellationRequested();if(record.Count!=header.Count)throw Invalid("CSV列数不一致，请核对引号或重新导出。");
                if(escaped>=0)ChatFileExport.DecodeCells(record,escaped);
                string At(int index)=>index<0?"":record[index];
                Add(rows,At(talker),At(displayColumn).Length>0?At(displayColumn):fallback,At(id),At(sender),Self(At(self)),At(time),At(content),At(type),token);
            }
            return;
        }
        using var doc=JsonDocument.Parse(text,new JsonDocumentOptions{MaxDepth=24});var root=doc.RootElement;var messages=root;string thread="",display=fallback;
        if(root.ValueKind==JsonValueKind.Object)
        {
            var session=Property(root,"Session");thread=Value(Property(session,"UserName","Talker","Id"));display=Value(Property(session,"DisplayName","Name"));if(display.Length==0)display=Value(Property(root,"chat_name","display_name"));if(display.Length==0)display=fallback;
            if(thread.Length==0)thread=Value(Property(root,"Talker","chat_id"));messages=Property(root,"Messages");
            if(messages.ValueKind!=JsonValueKind.Array)throw Invalid("JSON需为消息数组，或包含Messages数组；请在messages目录中选择会话文件。");
        }
        if(messages.ValueKind!=JsonValueKind.Array)throw Invalid("JSON消息列表无法识别。");
        foreach(var item in messages.EnumerateArray())
        {
            token.ThrowIfCancellationRequested();if(item.ValueKind!=JsonValueKind.Object)throw Invalid("消息列表包含非消息对象。");
            string ownThread=Value(Property(item,"Talker","StrTalker","chat_id"));if(ownThread.Length==0)ownThread=thread;
            string id=Value(Property(item,"ServerId","MsgSvrID"));if(id.Length==0 || id=="0")id=Value(Property(item,"Id","localId","local_id"));
            Add(rows,ownThread,display,id,Value(Property(item,"Sender","SenderName","sender_name","fromUser")),Self(Value(Property(item,"IsSelf","IsSender","is_sender","is_self"))),Value(Property(item,"Time","CreateTime","create_time","timestamp")),Value(Property(item,"Content","StrContent","message_content")),Value(Property(item,"Type","local_type")),token);
        }
    }
    private static JsonElement Property(JsonElement root,params string[] names)
    {
        if(root.ValueKind!=JsonValueKind.Object)return default;
        foreach(string name in names)foreach(var property in root.EnumerateObject())if(property.Name.Equals(name,StringComparison.OrdinalIgnoreCase))return property.Value;
        return default;
    }
    private static string Value(JsonElement item)=>item.ValueKind switch{JsonValueKind.String=>item.GetString()??"",JsonValueKind.Number=>item.GetRawText(),JsonValueKind.True=>"true",JsonValueKind.False=>"false",_=>""};
    private static bool? Self(string value)=>value.Trim().ToLowerInvariant() switch{"true" or "1"=>true,"false" or "0"=>false,_=>null};
    private static void Add(List<Row> rows,string thread,string name,string id,string sender,bool? self,string time,string content,string type,CancellationToken token)
    {
        token.ThrowIfCancellationRequested();if(rows.Count>=MaxLines)throw Invalid("最多导入50000条消息，请缩小导出范围。");
        sender=sender.Trim();thread=thread.Trim();name=name.Trim();if(thread.Length==0)thread=name;
        bool isText=type.Trim().ToLowerInvariant() is "" or "1" or "text" or "文本" or "文字" || long.TryParse(type,NumberStyles.Integer,CultureInfo.InvariantCulture,out long packed)&&(packed&0xffffffffL)==1;
        if(sender.Length==0 && self.HasValue)sender=self.Value?"我方（文件标记）":"对方（文件标记）";
        if(sender.Length==0 && !isText)sender="系统或非文本";
        if(sender.Length is 0 or >200 || thread.Length is 0 or >300 || name.Length>300 || time.Length>100 || id.Length>200 || content.Length>20000 || content.Contains('\0'))throw Invalid("消息字段缺失或过长，已停止导入以免错配聊天双方。");
        if(isText && string.IsNullOrWhiteSpace(content))return;
        if(long.TryParse(time,NumberStyles.None,CultureInfo.InvariantCulture,out long unix) && unix>0)
            time=(unix>99999999999?DateTimeOffset.FromUnixTimeMilliseconds(unix):DateTimeOffset.FromUnixTimeSeconds(unix)).ToString("yyyy-MM-dd HH:mm:ss zzz",CultureInfo.InvariantCulture);
        DateTimeOffset? sort=DateTimeOffset.TryParse(time,CultureInfo.InvariantCulture,DateTimeStyles.AssumeUniversal,out var date)?date:null;
        rows.Add(new(thread,name,new(id,sender,self,time,isText?content:"[非文本消息，不参与分析]",isText),rows.Count,sort));
    }
    // RFC4180 quoted cells, including commas, escaped quotes and multiline content. No formulas executed.
    private static List<List<string>> Csv(string text,CancellationToken token)
    {
        var result=new List<List<string>>();var row=new List<string>();var cell=new StringBuilder();bool quoted=false,closed=false;
        void Cell(){row.Add(cell.ToString());cell.Clear();closed=false;if(row.Count>100)throw Invalid("CSV列太多。");}
        void Row(){Cell();if(row.Any(x=>x.Length>0)){result.Add(row);if(result.Count>MaxLines+1)throw Invalid("CSV消息数量过多。");}row=[];}
        for(int i=0;i<text.Length;i++)
        {
            if(i%4096==0)token.ThrowIfCancellationRequested();char c=text[i];
            if(quoted){if(c=='"'){if(i+1<text.Length && text[i+1]=='"'){cell.Append('"');i++;}else{quoted=false;closed=true;}}else cell.Append(c);}
            else if(c=='"'){if(cell.Length>0 || closed)throw Invalid("CSV引号位置无效。");quoted=true;}
            else if(c==',')Cell();else if(c is '\n' or '\r'){if(c=='\r' && i+1<text.Length && text[i+1]=='\n')i++;Row();}
            else{if(closed)throw Invalid("CSV引号后有多余字符。");cell.Append(c);}
            // One leading apostrophe may be the reversible ChatQ spreadsheet escape.
            // Add still enforces the original 20000-character message limit after decoding.
            if(cell.Length>20001)throw Invalid("CSV字段过长。");
        }
        if(quoted)throw Invalid("CSV引号未闭合。");if(cell.Length>0 || row.Count>0 || closed)Row();return result;
    }
    public static AnalysisSlice Select(ImportedThread thread,string self,int maximum)
    {
        if(maximum is <1 or >200)throw Invalid("分析范围需为1–200条。");
        var text=thread.Lines.Where(l=>l.IsText).ToList();
        if(self==SelfFlags){if(text.Any(l=>!l.IsSelf.HasValue))throw Invalid("部分消息没有我方标记，请手动选择谁是我。");}
        else if(string.IsNullOrEmpty(self) || !text.Any(l=>l.Sender==self))throw Invalid("请先选择聊天中哪位是自己。");
        if(text.Count==0)throw Invalid("该会话没有可分析的文本消息，图片和语音暂不识别。");
        string[] participants=text.Select(l=>l.Sender).Distinct().ToArray();if(participants.Length>100)throw Invalid("参与者超过100位，请先导出单个好友或缩小会话范围。");
        var aliases=new Dictionary<string,string>(StringComparer.Ordinal);var selected=new List<string>();var ids=new List<string>();int total=0,shortened=0;
        foreach(var (line,index) in text.Select((line,index)=>(line,index)).TakeLast(maximum).Reverse())
        {
            bool mine=self==SelfFlags?line.IsSelf==true:line.Sender==self;
            if(!mine && !aliases.ContainsKey(line.Sender))aliases[line.Sender]="对方"+(aliases.Count+1);
            string body=Anonymize(line.Text,participants);bool truncated=body.Length>1600;if(truncated){body=body[..1600]+" [本条后文省略]";}
            string id="M"+(index+1).ToString("D5",CultureInfo.InvariantCulture);string entry=$"[{id}] {line.Time} {(mine?"我":aliases[line.Sender])}：{body}";
            if(total+entry.Length>MaxPromptChars)break;
            if(truncated)shortened++;selected.Insert(0,entry);ids.Insert(0,id);total+=entry.Length+1;
        }
        if(selected.Count==0)throw Invalid("没有可用的分析文本。");
        int media=thread.Lines.Count(l=>!l.IsText);string coverage=$"本次仅分析最近 {selected.Count} / {text.Count} 条文本；非文本 {media} 条未发送，缩短 {shortened} 条长消息。结论仅覆盖下方预览。";
        return new(string.Join('\n',selected),selected.Count,text.Count,media,shortened,self,coverage,ids);
    }
    internal static string Anonymize(string text,IEnumerable<string> senders)
    {
        // Deterministic longest-name replacement plus common contact details. This is not perfect semantic anonymization.
        foreach(string name in senders.Distinct().Where(n=>n.Length>=2).OrderByDescending(n=>n.Length))text=text.Replace(name,"[称呼]",StringComparison.Ordinal);
        text=System.Text.RegularExpressions.Regex.Replace(text,@"(?<!\d)1[3-9]\d{9}(?!\d)","[手机号]",System.Text.RegularExpressions.RegexOptions.None,TimeSpan.FromMilliseconds(100));
        text=System.Text.RegularExpressions.Regex.Replace(text,@"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}","[邮箱]",System.Text.RegularExpressions.RegexOptions.None,TimeSpan.FromMilliseconds(100));
        return text;
    }
}
