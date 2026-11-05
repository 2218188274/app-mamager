namespace ChatQ.Windows;

public sealed record ImportedFolder(ImportedArchive Archive,List<string> SourceFiles);

/// <summary>Explicit selected export folder only. No manifests, contacts, database search or execution.</summary>
public static class ChatImportFolder
{
    public static ImportedFolder Load(string selected,CancellationToken token=default)
    {
        token.ThrowIfCancellationRequested();
        if(!Path.IsPathFullyQualified(selected))throw new InvalidOperationException("请选择完整的聊天数据文件夹路径。");
        string root=Path.GetFullPath(selected);CheckDirectory(root);
        string scan=root;bool messagesFolder=Path.GetFileName(root.TrimEnd(Path.DirectorySeparatorChar)).Equals("messages",StringComparison.OrdinalIgnoreCase);
        if(!messagesFolder)
        {
            string direct=Path.Combine(root,"messages"),agent=Path.Combine(root,"agent_data");
            if(Directory.Exists(direct)){CheckDirectory(direct);scan=direct;messagesFolder=true;}
            else if(Directory.Exists(agent))
            {
                CheckDirectory(agent);string nested=Path.Combine(agent,"messages");
                if(Directory.Exists(nested)){CheckDirectory(nested);scan=nested;messagesFolder=true;}
            }
        }
        var entries=Directory.EnumerateFileSystemEntries(scan).Take(513).ToList();
        if(entries.Count>512)throw new InvalidOperationException("文件夹条目过多，请只选择需要导入的messages数据文件夹。");
        var files=entries.Where(p=>File.Exists(p) && (messagesFolder?Path.GetExtension(p).ToLowerInvariant() is ".json" or ".csv":Path.GetFileName(p).Equals("messages.json",StringComparison.OrdinalIgnoreCase)||Path.GetFileName(p).Equals("messages.csv",StringComparison.OrdinalIgnoreCase)))
            .Where(p=>!new[]{"manifest.json","contacts.json","sessions.json"}.Contains(Path.GetFileName(p),StringComparer.OrdinalIgnoreCase)).OrderBy(p=>p,StringComparer.OrdinalIgnoreCase).ToList();
        if(files.Count is <1 or >128)throw new InvalidOperationException("请选择导出的agent_data或messages文件夹。安装包目录、数据库目录不能直接导入。");
        long total=0;var documents=new List<ImportedDocument>();
        foreach(string path in files)
        {
            token.ThrowIfCancellationRequested();
            if((File.GetAttributes(path)&FileAttributes.ReparsePoint)!=0)throw new InvalidOperationException("消息文件是链接，请选择实际导出文件。");
            using var stream=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.Read);
            long expected=stream.Length;total+=expected;if(expected is <=0 or >ChatImport.MaxBytes || total>ChatImport.MaxBytes)throw new InvalidOperationException("所选消息文件合计不能超过16MB。");
            using var memory=new MemoryStream();byte[] buffer=new byte[8192];int count;
            while((count=stream.Read(buffer))>0){token.ThrowIfCancellationRequested();if(memory.Length+count>expected)throw new InvalidOperationException("文件大小在读取中变化，请重新导出后再导入。");memory.Write(buffer,0,count);}
            if(memory.Length!=expected || stream.Length!=expected)throw new InvalidOperationException("文件大小在读取中变化，请重新导出后再导入。");
            documents.Add(new(Path.GetFileName(path),memory.ToArray()));
        }
        return new(ChatImport.LoadDocuments(documents,token),files.Select(Path.GetFullPath).ToList());
    }
    private static void CheckDirectory(string path)
    {
        var info=new DirectoryInfo(path);
        if(!info.Exists || (info.Attributes&FileAttributes.ReparsePoint)!=0)throw new InvalidOperationException("请选择实际的数据文件夹，不读取链接或不存在的目录。");
    }
}
