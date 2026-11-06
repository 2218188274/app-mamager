using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ChatQ.Windows;

internal static class LibraryBackupChecks
{
    public static void Run(string root,Action<bool,string> check)
    {
        void Reject(Action action,string label){bool rejected=false;try{action();}catch(Exception e)when(e is InvalidOperationException or CryptographicException){rejected=true;}check(rejected,label);}
        var thread=new ImportedThread("group","合成资料",[
            new("1","甲合成",false,"2026-11-06","第一条合成消息",true),new("2","自己合成",true,"2026-11-06","我想聊一聊",true),new("3","乙合成",false,"2026-11-06","另一位参与者",true)]);
        var slice=ChatImport.Select(thread,ChatImport.SelfFlags,100);
        check(slice.Rows is not null && slice.Rows.Count==slice.Count && slice.Rows.Select(e=>e.Id).SequenceEqual(slice.EvidenceIds),"quick evidence rows correspond exactly to selected preview IDs");
        check(slice.Rows!.All(e=>slice.Transcript.Contains($"[{e.Id}] {e.Time} {e.Speaker}：{e.Text}")),"group sender aliases in evidence match the outbound quick preview");
        var unicode=new ImportedThread("unicode","unicode",[new("1","我",true,"13800138000 demo@example.com",new string('x',1599)+"😀尾部",true)]);
        var redacted=ChatImport.Select(unicode,ChatImport.SelfFlags,100);
        check(!redacted.Transcript.Contains("13800138000") && !redacted.Transcript.Contains("demo@example.com"),"quick preview anonymizes contact-like time fields as well as bodies");
        check(!char.IsHighSurrogate(redacted.Rows![0].Text[1599]) && redacted.Rows[0].Text.EndsWith("[本条后文省略]"),"quick preview shortening never cuts an emoji surrogate in half");
        var answer=new ChatAnalysis("合成总结",[new("有互动",[slice.EvidenceIds[0]],"有限")],["核对情况"],["今天过得怎么样"],["合成建议"]);
        var report=new SavedHistoryAnalysis(false,100,1,"下一步怎么聊",slice.Coverage,answer,[],DateTime.UtcNow,SavedHistoryAnalysis.Hash(thread,ChatImport.SelfFlags));
        var store=new ChatLibrary(Path.Combine(root,"source"));var item=store.Save(thread,ChatImport.SelfFlags,true,"资料一");var stored=store.SaveAnalysis(item.Id,item.UpdatedAt,report);
        var reopened=new ChatLibrary(Path.Combine(root,"source")).Read();
        check(reopened.Version==2 && reopened.Chats[0].Analysis?.Answer.Summary=="合成总结","explicit analysis save survives encrypted store reopening and advances library version");
        check(!Encoding.UTF8.GetString(File.ReadAllBytes(store.FilePath)).Contains("合成总结"),"saved reports are encrypted alongside their associated raw source");
        Reject(()=>store.SaveAnalysis(item.Id,item.UpdatedAt,report),"stale save cannot replace a report on a changed library entry");
        Reject(()=>store.SaveAnalysis(item.Id,stored.UpdatedAt,report with{SourceHash=new string('A',64)}),"analysis is bound to exact source and selected self");
        Reject(()=>store.SaveAnalysis(item.Id,stored.UpdatedAt,report with{Coverage="全部聊天"}),"persisted report cannot misrepresent selected coverage");
        Reject(()=>store.SaveAnalysis(item.Id,stored.UpdatedAt,report with{Answer=answer with{Observations=[new("wrong",["M99999"],"有限")]}}),"persisted report cannot reference missing messages");
        byte[] before=File.ReadAllBytes(store.FilePath);using(var cts=new CancellationTokenSource())
        {cts.Cancel();bool stopped=false;try{store.SaveAnalysis(item.Id,stored.UpdatedAt,report,cts.Token);}catch(OperationCanceledException){stopped=true;}check(stopped && before.SequenceEqual(File.ReadAllBytes(store.FilePath)),"cancelled report save preserves prior analysis");}
        const string password="synthetic-library-password-123";byte[] archive=LibraryBackup.Encrypt(reopened,password);var decoded=LibraryBackup.Decrypt(archive,password);
        check(ChatLibrary.Fingerprint(decoded)==ChatLibrary.Fingerprint(reopened),"password library archive round-trips raw chat and stored report exactly");
        check(!Encoding.UTF8.GetString(archive).Contains("合成总结") && !Encoding.UTF8.GetString(archive).Contains("第一条合成消息"),"portable archive contains no plaintext source or report");
        check(!archive.SequenceEqual(LibraryBackup.Encrypt(reopened,password)),"fresh archive salt and nonce prevent deterministic ciphertext");
        Reject(()=>LibraryBackup.Decrypt(archive,"wrong-password"),"wrong password never produces a restore candidate");
        foreach(int position in new[]{0,8,12,28,40,44,archive.Length-1}){byte[] tampered=archive.ToArray();tampered[position]^=1;Reject(()=>LibraryBackup.Decrypt(tampered,password),"backup header and ciphertext authentication: "+position);}
        Reject(()=>LibraryBackup.Encrypt(reopened,"short"),"weak archive password rejected");
        Reject(()=>LibraryBackup.Decrypt(archive[..^1],password),"truncated archive rejected");
        Reject(()=>LibraryBackup.Decrypt(PortableBackup.Encrypt(new UserState(),password),password),"ordinary backup cannot be mistaken for chat library backup");
        Reject(()=>PortableBackup.Decrypt(archive,password),"chat library archive cannot be loaded as ordinary app state");
        var target=new ChatLibrary(Path.Combine(root,"target"));var preview=ChatLibrary.PreviewMerge(target.Read(),decoded);
        check(preview.Added==1 && preview.Total==1 && !File.Exists(target.FilePath),"restore preview never writes a destination file");
        target.Merge(decoded,preview.CurrentFingerprint);check(target.Read().Chats.Single().Analysis?.Answer.Summary=="合成总结","archive restores into an independent encrypted destination without source DPAPI data");
        preview=ChatLibrary.PreviewMerge(target.Read(),decoded);check(preview.Added==0 && preview.Duplicate==1,"repeated restore recognizes exact duplicate IDs");target.Merge(decoded,preview.CurrentFingerprint);check(target.Read().Chats.Count==1,"repeated restore is idempotent");
        var current=target.Read().Chats.Single();target.Rename(current.Id,"本机改名",current.UpdatedAt);preview=ChatLibrary.PreviewMerge(target.Read(),decoded);check(preview.Conflicts==1 && preview.Added==0,"same ID with changed local content is disclosed as conflict");target.Merge(decoded,preview.CurrentFingerprint);check(target.Read().Chats[0].Name=="本机改名","conflict always preserves the destination version");
        preview=ChatLibrary.PreviewMerge(target.Read(),decoded);target.Save(thread,ChatImport.SelfFlags,true,"后来保存的资料");before=File.ReadAllBytes(target.FilePath);Reject(()=>target.Merge(decoded,preview.CurrentFingerprint),"changes after preview invalidate restore before a write");check(before.SequenceEqual(File.ReadAllBytes(target.FilePath)),"stale restore preserves all destination ciphertext");
        using(var cts=new CancellationTokenSource()){cts.Cancel();bool stopped=false;try{LibraryBackup.Decrypt(archive,password,cts.Token);}catch(OperationCanceledException){stopped=true;}check(stopped,"backup decryption respects cancellation before derivation");}
        var corrupt=new ChatLibrary(Path.Combine(root,"corrupt"));Directory.CreateDirectory(Path.GetDirectoryName(corrupt.FilePath)!);File.WriteAllBytes(corrupt.FilePath,"corrupt-source"u8.ToArray());Reject(()=>corrupt.Merge(decoded,"wrong"),"restore cannot overwrite an unreadable existing library");
        var legacy=new ChatLibrary(Path.Combine(root,"legacy"));Directory.CreateDirectory(Path.GetDirectoryName(legacy.FilePath)!);var old=new ChatLibraryData{Version=1,Chats=[stored with{Analysis=null}]};File.WriteAllBytes(legacy.FilePath,DeviceEncryption.Protect(JsonSerializer.SerializeToUtf8Bytes(old,Defaults.Json)));
        check(legacy.Read().Version==1 && legacy.Read().Chats.Count==1,"existing 0.5.8 version1 library remains readable without rewrite");var first=legacy.Read().Chats.Single();legacy.Rename(first.Id,"升级保留",first.UpdatedAt);check(legacy.Read().Version==2 && legacy.Read().Chats.Single().Thread.Lines.Count==3,"first explicit edit migrates library without losing its messages");
        byte[] ordinary=PortableBackup.Encrypt(new UserState(),password);check(!Encoding.UTF8.GetString(JsonSerializer.SerializeToUtf8Bytes(PortableData.From(new UserState()),Defaults.Json)).Contains("合成总结") && ordinary.Length>0,"normal backup still excludes the separate chat library and report");
    }
}
