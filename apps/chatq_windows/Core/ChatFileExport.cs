using System.Text;
using System.Text.Json;

namespace ChatQ.Windows;

public sealed record ChatFileResult(byte[] Bytes,string Format,int Count,int Available,int MediaSkipped);

/// <summary>Only explicitly imported text. No live client, database, AI, credentials or other conversations.</summary>
public static class ChatFileExport
{
    public static ChatFileResult Create(ImportedThread thread,string format,int limit,CancellationToken token=default)
    {
        token.ThrowIfCancellationRequested();format=format.ToLowerInvariant();
        if(format is not ("json" or "csv" or "txt") || limit is <1 or >ChatImport.MaxLines)throw new InvalidOperationException("请选择聊天导出格式和范围。");
        var texts=thread.Lines.Where(l=>l.IsText).ToList();var lines=texts.TakeLast(limit).ToList();
        if(lines.Count==0)throw new InvalidOperationException("所选会话没有可导出的文字消息。");
        if(lines.Any(l=>!HubStore.Small(l.Text,20000)||!HubStore.Small(l.Sender,200)) || lines.Sum(l=>(long)l.Text.Length+l.Sender.Length+l.Time.Length)>ChatImport.MaxBytes)throw new InvalidOperationException("聊天文字超出可导出范围，请缩小范围。");
        byte[] bytes;
        if(format=="json")
        {
            var messages=new List<object>();
            foreach(var line in lines){token.ThrowIfCancellationRequested();messages.Add(new{line.Id,Talker=thread.Id,line.Sender,line.IsSelf,Type=1,line.Time,Content=line.Text});}
            bytes=JsonSerializer.SerializeToUtf8Bytes(new{Format="chatq_chat_v1",Session=new{UserName=thread.Id,DisplayName=thread.Name},ExportedAt=DateTimeOffset.UtcNow,Messages=messages},new JsonSerializerOptions{WriteIndented=true});
        }
        else
        {
            var text=new StringBuilder();
            if(format=="csv")text.AppendLine("时间,发送人,类型,内容,会话,会话名称,Id,IsSelf,ChatQEscaped");
            else text.AppendLine("聊商 · 导入会话文字").AppendLine(thread.Name).AppendLine($"导出{lines.Count} / 已导入{texts.Count}条文字；非文本不包含。").AppendLine();
            foreach(var line in lines)
            {
                token.ThrowIfCancellationRequested();
                if(format=="csv")
                {
                    string[] cells=[line.Time,line.Sender,"文本",line.Text,thread.Id,thread.Name,line.Id,line.IsSelf?.ToString().ToLowerInvariant()??""];
                    var escaped=new List<int>();
                    for(int i=0;i<cells.Length;i++)if(cells[i].Length>0&&(char.IsWhiteSpace(cells[i][0])||"=+-@'".Contains(cells[i][0]))){cells[i]="'"+cells[i];escaped.Add(i);}
                    text.AppendLine(string.Join(',',cells.Select(Quote))+",v1:"+string.Join(';',escaped));
                }
                else text.AppendLine($"[{line.Time}] {line.Sender}").AppendLine(line.Text).AppendLine();
                if(text.Length>ChatImport.MaxBytes)throw new InvalidOperationException("导出内容过大，请缩小范围。");
            }
            bytes=Encoding.UTF8.GetBytes(text.ToString());if(format=="csv")bytes=[..Encoding.UTF8.GetPreamble(),..bytes];
        }
        if(bytes.Length>ChatImport.MaxBytes)throw new InvalidOperationException("导出文件超过16MB，请选择最近200条或缩小原导入范围。");
        token.ThrowIfCancellationRequested();return new(bytes,format,lines.Count,texts.Count,thread.Lines.Count(l=>!l.IsText));
    }
    private static string Quote(string value)=>"\""+value.Replace("\"","\"\"")+"\"";
    internal static void DecodeCells(List<string> row,int marker)
    {
        string value=row[marker];
        if(!value.StartsWith("v1:",StringComparison.Ordinal))throw new InvalidOperationException("CSV的聊商转义标记无效，原文件未修改。");
        var indices=new HashSet<int>();
        foreach(string part in value[3..].Split(';',StringSplitOptions.RemoveEmptyEntries))
        {
            if(!int.TryParse(part,out int index)||index<0||index>=row.Count||index==marker||!indices.Add(index)||!row[index].StartsWith('\''))throw new InvalidOperationException("CSV转义列不符合要求，已停止导入。");
            row[index]=row[index][1..];
        }
    }
    public static void Save(string path,byte[] bytes,IEnumerable<string> protectedSources,CancellationToken token=default,IEnumerable<string>? protectedDirectories=null,int maximumBytes=ChatImport.MaxBytes)
    {
        token.ThrowIfCancellationRequested();
        if(maximumBytes is not (ChatImport.MaxBytes or LibraryBackup.MaxBytes) || !Path.IsPathFullyQualified(path) || bytes.Length<1 || bytes.Length>maximumBytes)throw new InvalidOperationException("导出路径或大小不符合要求。");
        string target=Path.GetFullPath(path);
        if(protectedDirectories?.Any(p=>{string directory=Path.GetFullPath(p).TrimEnd(Path.DirectorySeparatorChar,Path.AltDirectorySeparatorChar);return target.Equals(directory,StringComparison.OrdinalIgnoreCase)||target.StartsWith(directory+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase);})==true)throw new InvalidOperationException("请另选保存位置，不能覆盖聊商本机数据目录中的文件。");
        if(protectedSources.Any(p=>Path.GetFullPath(p).Equals(target,StringComparison.OrdinalIgnoreCase)))throw new InvalidOperationException("请另存为新文件，不能覆盖原始导入文件。");
        if(File.Exists(target)&&(File.GetAttributes(target)&FileAttributes.ReparsePoint)!=0)throw new InvalidOperationException("导出目标是链接，请选择实际新文件。");
        string directory=Path.GetDirectoryName(target)??throw new InvalidOperationException("导出目录无效。");
        string temporary=Path.Combine(directory,".chatq-export-"+Guid.NewGuid().ToString("N")+".tmp");
        try
        {
            using(var stream=new FileStream(temporary,FileMode.CreateNew,FileAccess.Write,FileShare.None))
            {
                for(int offset=0;offset<bytes.Length;offset+=8192){token.ThrowIfCancellationRequested();stream.Write(bytes,offset,Math.Min(8192,bytes.Length-offset));}
                stream.Flush(true);
            }
            token.ThrowIfCancellationRequested();if(File.Exists(target))File.Replace(temporary,target,null);else File.Move(temporary,target);
        }
        finally{if(File.Exists(temporary))File.Delete(temporary);}
    }
}
