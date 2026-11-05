using System.Security.Cryptography;
using ChatQ.Windows.Testing;

namespace ChatQ.Windows;

public static class WechatDatabaseChecks
{
    public static void Run(Action<bool,string> check)
    {
        check(WechatDatabase.CheckRuntime()==0,"SQLite packaged dependency initializes and meets minimum runtime version");
        void Reject(Action action,string name){bool failed=false;try{action();}catch(InvalidOperationException){failed=true;}check(failed,name);}
        string directory=Path.Combine(Path.GetTempPath(),"ChatQWechatDbChecks-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(directory);
        try
        {
            string root=WechatDatabaseFixture.Create(directory);var originals=Directory.GetFiles(root,"*.db",SearchOption.AllDirectories).ToDictionary(p=>p,p=>SHA256.HashData(File.ReadAllBytes(p)));
            var catalog=WechatDatabase.Open(directory);var peer=catalog.Sessions.Single(s=>s.Id==WechatDatabaseFixture.Peer);
            check(catalog.Sessions.Count==3 && peer.Name=="合成好友甲" && catalog.Sessions.Single(s=>s.Id==WechatDatabaseFixture.Group).Name=="合成群聊","snapshot labels resolved with parameterized IDs");
            var recent=WechatDatabase.Read(catalog,peer,WechatRange.Parse(false,"",""));
            check(recent.Thread.Lines.Count==200 && recent.AvailableText==241 && recent.NonText==1 && recent.UnsupportedText==1 && recent.RangeMessages==243,"newest200 merged across shards and excluded media/binary counts");
            check(recent.Thread.Lines.Any(l=>l.Id.StartsWith("message_0:")) && recent.Thread.Lines.Any(l=>l.Id.StartsWith("message_1:")) && recent.Thread.Lines.Select(l=>l.Id).Distinct().Count()==200,"shard-local IDs are separately scoped");
            check(recent.Thread.Lines[^1].Text=="标题:\n原文前后  " && recent.Thread.Lines.All(l=>l.IsSelf is null),"private colon newline and whitespace retained; self never guessed");
            check(recent.Thread.Lines.All(l=>l.Sender.StartsWith("wxid_synthetic_")) && !string.Join('\n',recent.Thread.Lines.Select(l=>l.Text)).Contains("DO_NOT_"),"sender table mapped; unselected conversation and media never exported");
            var all=WechatDatabase.Read(catalog,peer,WechatRange.Parse(true,"2026-11-05","2026-11-05"));check(all.Thread.Lines.Count==241 && all.Thread.Lines.Select(l=>DateTimeOffset.Parse(l.Time)).SequenceEqual(all.Thread.Lines.Select(l=>DateTimeOffset.Parse(l.Time)).Order()),"all text within inclusive UTC date in chronological order");
            foreach(string format in new[]{"json","csv"}){var file=ChatFileExport.Create(all.Thread,format,ChatImport.MaxLines);var back=ChatImport.Load(file.Bytes,"wechat."+format);check(back.Threads.Single().Lines.SequenceEqual(all.Thread.Lines),"database-"+format+"-import roundtrip");string output=Path.Combine(directory,"saved."+format);ChatFileExport.Save(output,file.Bytes,all.Sources);check(File.Exists(output),"manual source-protected database export "+format);}
            var group=WechatDatabase.Read(catalog,catalog.Sessions.Single(s=>s.Id==WechatDatabaseFixture.Group),WechatRange.Parse(false,"",""));check(group.Thread.Lines.Single().Sender=="wxid_synthetic_peer" && group.Thread.Lines.Single().Text=="合成群消息","only group message strips a recognized sender prefix");
            Reject(()=>WechatDatabase.Read(catalog,peer,WechatRange.Parse(false,"2026-11-06","2026-11-06")),"empty date range never exported as success");Reject(()=>WechatRange.Parse(false,"2026-02-30",""),"invalid date rejected");Reject(()=>WechatRange.Parse(false,"2026-11-06","2026-11-05"),"reverse dates rejected");
            Reject(()=>WechatDatabase.Read(catalog,peer,new(201,null,null)),"unsupported limit rejected");Reject(()=>WechatDatabase.Read(catalog,new("absent","absent",0),new(200,null,null)),"unlisted session rejected");Reject(()=>WechatDatabase.Open("relative"),"no implicit discovery");
            using(var cts=new CancellationTokenSource()){cts.Cancel();foreach(Action action in new Action[]{()=>WechatDatabase.Open(root,cts.Token),()=>WechatDatabase.Read(catalog,peer,new(200,null,null),cts.Token)}){bool stopped=false;try{action();}catch(OperationCanceledException){stopped=true;}check(stopped,"snapshot open/read cancellation before IO");}}
            string shard=Path.Combine(root,"message","message_0.db");using(var writer=new FileStream(shard,FileMode.Open,FileAccess.ReadWrite,FileShare.ReadWrite)){Reject(()=>WechatDatabase.Read(catalog,peer,new(200,null,null)),"writer-open snapshot refused");}
            File.WriteAllText(shard+"-wal","synthetic");Reject(()=>WechatDatabase.Open(root),"WAL snapshot refused");File.Delete(shard+"-wal");
            foreach(var pair in originals)check(SHA256.HashData(File.ReadAllBytes(pair.Key)).SequenceEqual(pair.Value),"source hash unchanged: "+Path.GetFileName(pair.Key));check(!Directory.GetFiles(root,"*-wal",SearchOption.AllDirectories).Any() && !Directory.GetFiles(root,"*-shm",SearchOption.AllDirectories).Any(),"no sidecars created by read-only queries");
            string unicodeRoot=WechatDatabaseFixture.Create(Path.Combine(directory,"合成 副本#1%"));var unicode=WechatDatabase.Open(unicodeRoot);check(WechatDatabase.Read(unicode,unicode.Sessions.Single(s=>s.Id==WechatDatabaseFixture.Peer),new(200,null,null)).Thread.Lines.Count==200,"URI encoding preserves local Unicode space hash and percent paths");
            string encRoot=WechatDatabaseFixture.Create(Path.Combine(directory,"encrypted"));File.WriteAllBytes(Path.Combine(encRoot,"message","message_0.db"),new byte[256]);Reject(()=>WechatDatabase.Open(encRoot),"encrypted header rejected without key access");
            string largeRoot=WechatDatabaseFixture.Create(Path.Combine(directory,"large"));WechatDatabaseFixture.Execute(Path.Combine(largeRoot,"message","message_0.db"),"WITH RECURSIVE n(i) AS (SELECT 1000 UNION ALL SELECT i+1 FROM n WHERE i<51000) INSERT INTO \""+WechatDatabaseFixture.Table(WechatDatabaseFixture.Peer)+"\" SELECT i,1793836800+i,1,1,'合成大范围' FROM n;");var large=WechatDatabase.Open(largeRoot);var largePeer=large.Sessions.Single(s=>s.Id==WechatDatabaseFixture.Peer);Reject(()=>WechatDatabase.Read(large,largePeer,new(ChatImport.MaxLines,null,null)),"all over50000 rejected explicitly");check(WechatDatabase.Read(large,largePeer,new(200,null,null)).Thread.Lines.Count==200,"large snapshot newest200 still works");
            string older=WechatDatabaseFixture.Create(Path.Combine(directory,"older-long"));WechatDatabaseFixture.Execute(Path.Combine(older,"message","message_0.db"),"INSERT INTO \""+WechatDatabaseFixture.Table(WechatDatabaseFixture.Peer)+"\" VALUES(900,1793830000,1,1,hex(zeroblob(15001)));");var olderCatalog=WechatDatabase.Open(older);var olderPeer=olderCatalog.Sessions.Single(s=>s.Id==WechatDatabaseFixture.Peer);check(WechatDatabase.Read(olderCatalog,olderPeer,new(200,null,null)).Thread.Lines.Count==200,"old oversized candidate outside globally newest200 does not block selected export");Reject(()=>WechatDatabase.Read(olderCatalog,olderPeer,new(ChatImport.MaxLines,null,null)),"selected oversized text rejected without truncation");
            WechatDatabaseFixture.Execute(Path.Combine(older,"message","message_0.db"),"DROP TABLE Name2Id;");WechatDatabaseFixture.Execute(Path.Combine(older,"message","message_1.db"),"DROP TABLE Name2Id;");olderCatalog=WechatDatabase.Open(older);olderPeer=olderCatalog.Sessions.Single(s=>s.Id==WechatDatabaseFixture.Peer);check(WechatDatabase.Read(olderCatalog,olderPeer,new(200,null,null)).Thread.Lines.All(l=>l.Sender.StartsWith("发送者ID:")),"missing optional sender map preserves source IDs rather than inventing names or self flags");
            File.SetLastWriteTimeUtc(shard,File.GetLastWriteTimeUtc(shard).AddSeconds(1));Reject(()=>WechatDatabase.Read(catalog,peer,new(200,null,null)),"changed database invalidates catalog");
        }
        finally{string target=Path.GetFullPath(directory);if(!target.StartsWith(Path.GetFullPath(Path.GetTempPath()),StringComparison.OrdinalIgnoreCase)||!Path.GetFileName(target).StartsWith("ChatQWechatDbChecks-"))throw new InvalidOperationException("Unexpected cleanup path");Directory.Delete(target,true);}
    }
}
