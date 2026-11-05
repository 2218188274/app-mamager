using System.Text;

namespace ChatQ.Windows;

// Only synthetic exports and temporary folders. No exporter binaries, live chat or provider.
public static class ChatFileChecks
{
    public static void Run(Action<bool,string> check)
    {
        void Reject(Action action,string name){bool rejected=false;try{action();}catch(InvalidOperationException){rejected=true;}check(rejected,name);}
        void Cancelled(Action<CancellationToken> action,string name){using var cts=new CancellationTokenSource();cts.Cancel();bool stopped=false;try{action(cts.Token);}catch(OperationCanceledException){stopped=true;}check(stopped,name);}
        string[] contents=["  前后空格  ","=SUM(1,2)","+123","-123","@名称","'原始单引号","他说\"好呀\",\r\n下一行👋","\t缩进",new string(' ',1)+new string('字',19999)];
        var lines=contents.Select((text,n)=>new ImportedLine("id-"+n,n%2==0?"自己":"好友",n%2==0,"2026-11-05 12:00:"+n.ToString("00"),text,true)).ToList();
        lines.Add(new("media","好友",false,"2026-11-05 12:00:30","not-exported-media",false));
        var thread=new ImportedThread("synthetic-peer","合成会话",lines);
        foreach(string kind in new[]{"json","csv"})
        {
            var export=ChatFileExport.Create(thread,kind,ChatImport.MaxLines);
            var back=ChatImport.Load(export.Bytes,"saved."+kind).Threads.Single();
            check(back.Id==thread.Id && back.Name==thread.Name && back.Lines.SequenceEqual(lines.Where(x=>x.IsText)),kind+" exact roundtrip of whitespace unicode quotes CRLF self time and IDs including max-length escape");
            check(export.Count==contents.Length && export.Available==contents.Length && export.MediaSkipped==1 && !Encoding.UTF8.GetString(export.Bytes).Contains("not-exported-media"),kind+" excludes media and discloses counts");
        }
        string csv=Encoding.UTF8.GetString(ChatFileExport.Create(thread,"csv",200).Bytes);
        check(csv.Contains("\"'=SUM(1,2)\"") && csv.Contains("\"''原始单引号\"") && csv.Contains("v1:3"),"CSV text is formula-escaped with reversible column markers");
        var ordinary=ChatImport.Load(Encoding.UTF8.GetBytes("发送人,内容\n我,'=external\n"),"external.csv");
        check(ordinary.Threads[0].Lines[0].Text=="'=external","ordinary external CSV apostrophes never silently stripped");
        foreach(string marker in new[]{"bad","v1:3","v1:0;0","v1:1"})Reject(()=>ChatImport.Load(Encoding.UTF8.GetBytes("发送人,内容,ChatQEscaped\n我,文字,"+marker+"\n"),"bad.csv"),"malformed CSV escape rejected: "+marker);
        Reject(()=>ChatImport.Load(Encoding.UTF8.GetBytes("发送人,内容\n我,"+new string('x',20001)+"\n"),"bad.csv"),"unescaped overlength CSV is still rejected");
        var many=new ImportedThread("synthetic-peer","会话",Enumerable.Range(1,205).Select(n=>new ImportedLine(n.ToString(),"我",true,"",n.ToString(),true)).ToList());
        var recent=ChatFileExport.Create(many,"json",200);var recentBack=ChatImport.Load(recent.Bytes,"recent.json").Threads[0];
        check(recent.Count==200 && recent.Available==205 && recentBack.Lines[0].Id=="6" && recentBack.Lines[^1].Id=="205","export recent200 uses latest text and truthful full count");
        string txt=Encoding.UTF8.GetString(ChatFileExport.Create(thread,"txt",200).Bytes);check(txt.Contains("非文本不包含") && txt.Contains(contents[6]) && !txt.Contains("not-exported-media"),"readable TXT retains multiline text and excludes media");
        Reject(()=>ChatFileExport.Create(thread,"xlsx",200),"unsupported format rejected");
        Reject(()=>ChatFileExport.Create(thread,"json",50001),"export range bounded");
        Reject(()=>ChatFileExport.Create(thread with {Lines=lines.Where(l=>!l.IsText).ToList()},"json",200),"media-only export rejected");
        Cancelled(t=>ChatFileExport.Create(thread,"json",200,t),"export cancellation");
        string root=Path.Combine(Path.GetTempPath(),"ChatQFileChecks-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);
        try
        {
            string messages=Path.Combine(root,"agent_data","messages");Directory.CreateDirectory(messages);
            byte[] source=Encoding.UTF8.GetBytes(ChatImportChecks.FixtureJson);string first=Path.Combine(messages,"peer.json");File.WriteAllBytes(first,source);File.WriteAllBytes(Path.Combine(messages,"copy.json"),source);
            File.WriteAllText(Path.Combine(root,"agent_data","manifest.json"),"malformed and ../../outside");File.WriteAllText(Path.Combine(root,"agent_data","contacts.json"),"do-not-read");
            File.WriteAllText(Path.Combine(messages,"manifest.json"),"not-message");
            foreach(string folder in new[]{root,Path.Combine(root,"agent_data"),messages})
            {
                var imported=ChatImportFolder.Load(folder);check(imported.Archive.Threads.Single().Lines.Count==2 && imported.Archive.DuplicateCount==2 && imported.SourceFiles.Count==2,"selected folder shape merges and deduplicates without manifests: "+Path.GetFileName(folder));
            }
            File.WriteAllBytes(Path.Combine(root,"messages.json"),source);
            string plain=Path.Combine(root,"plain");Directory.CreateDirectory(plain);File.WriteAllBytes(Path.Combine(plain,"messages.csv"),ChatFileExport.Create(thread,"csv",200).Bytes);
            check(ChatImportFolder.Load(plain).Archive.Threads[0].Lines.Count==contents.Length,"single messages.csv folder accepted");
            string empty=Path.Combine(root,"installer");Directory.CreateDirectory(empty);File.WriteAllText(Path.Combine(empty,"wrapper.exe"),"never-executed");Reject(()=>ChatImportFolder.Load(empty),"installer folder is not chat data");
            Reject(()=>ChatImportFolder.Load("relative"),"relative folder rejected");
            Cancelled(t=>ChatImportFolder.Load(root,t),"folder cancellation");
            Reject(()=>ChatImport.LoadDocuments(Enumerable.Repeat(new ImportedDocument("peer.json",source),129).ToArray()),"aggregate message file count bounded");
            Reject(()=>ChatImport.LoadDocuments([new("peer.json",new byte[ChatImport.MaxBytes]),new("other.json",[1])]),"aggregate message bytes bounded");
            string output=Path.Combine(root,"saved.json");byte[] exported=ChatFileExport.Create(thread,"json",200).Bytes;
            ChatFileExport.Save(output,exported,[first]);check(File.ReadAllBytes(output).SequenceEqual(exported),"new export file written");
            ChatFileExport.Save(output,source,[first]);check(File.ReadAllBytes(output).SequenceEqual(source),"explicit existing destination replaced atomically");
            Reject(()=>ChatFileExport.Save(first,exported,[first]),"original imported file cannot be overwritten");check(File.ReadAllBytes(first).SequenceEqual(source),"original bytes unchanged after attempted overwrite");
            Cancelled(t=>ChatFileExport.Save(output,exported,[],t),"save cancellation");check(File.ReadAllBytes(output).SequenceEqual(source),"cancelled save retains existing destination");
            using(var locked=new FileStream(output,FileMode.Open,FileAccess.Read,FileShare.Read))
            {
                bool failed=false;try{ChatFileExport.Save(output,exported,[]);}catch(IOException){failed=true;}check(failed,"locked destination reports failure");
            }
            check(File.ReadAllBytes(output).SequenceEqual(source) && !Directory.EnumerateFiles(root,".chatq-export-*.tmp").Any(),"failed save retains old file and removes only own temporary file");
            Reject(()=>ChatFileExport.Save("relative.json",exported,[]),"save requires full path");
            Reject(()=>ChatFileExport.Save(Path.Combine(root,"data.vault"),exported,[],protectedDirectories:[root]),"all local app-data paths protected from every export format");check(!File.Exists(Path.Combine(root,"data.vault")),"blocked local data write creates no file");
        }
        finally
        {
            string target=Path.GetFullPath(root);if(!target.StartsWith(Path.GetFullPath(Path.GetTempPath()),StringComparison.OrdinalIgnoreCase)||!Path.GetFileName(target).StartsWith("ChatQFileChecks-"))throw new InvalidOperationException("Unexpected cleanup path");
            Directory.Delete(target,true);
        }
    }
}
