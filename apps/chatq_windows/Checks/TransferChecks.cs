using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ChatQ.Windows;

internal static class TransferChecks
{
    public static void Run(string root,Action<bool,string> check)
    {
        void Reject(Action action,string label){bool rejected=false;try{action();}catch(Exception e)when(e is InvalidOperationException or CryptographicException){rejected=true;}check(rejected,label);}
        const string password="synthetic-迁移😀-password";
        var state=new UserState{Profiles=[new("api","合成","https://example.invalid/v1","model","synthetic-private-key")],ProfileId="api",ReplyDraft="synthetic-private-draft",Conversations=[new(){Id="synthetic-chat",Name="合成跨端对话",UpdatedAt=DateTime.UtcNow,Messages=[new("user","合成问题👋"),new("assistant","合成回答，保持自然。")]}],ReplyHistory=[new("favorite","合成常用句😀","不应迁移的来源","reply","自然",DateTime.UtcNow,true),new("not-favorite","未收藏的生成记录","","reply","自然",DateTime.UtcNow)]};
        var data=SharedTransfer.Export(state);var raw=JsonSerializer.Serialize(data,SharedTransfer.Json);
        check(data.Conversations.Count==1&&data.Favorites.Count==1&&data.Personas.Count==5,"shared scope exports exact common text items");
        check(!raw.Contains("synthetic-private-key")&&!raw.Contains("synthetic-private-draft")&&!raw.Contains("不应迁移的来源")&&!raw.Contains("未收藏"),"transfer DTO never exports API, drafts, source prompts or nonfavorites");
        var encrypted=SharedTransfer.Encrypt(data,password);var decoded=SharedTransfer.Decrypt(encrypted,password);check(JsonSerializer.Serialize(decoded,SharedTransfer.Json)==raw,"authenticated transfer roundtrip Unicode payload and password");
        Reject(()=>SharedTransfer.Decrypt(encrypted,"wrong-password"),"wrong transfer password rejected");var changed=encrypted.ToArray();changed[^1]^=1;Reject(()=>SharedTransfer.Decrypt(changed,password),"tampered transfer tag rejected");changed=encrypted.ToArray();changed[12]^=1;Reject(()=>SharedTransfer.Decrypt(changed,password),"tampered transfer salt rejected");Reject(()=>SharedTransfer.Decrypt(PortableBackup.Encrypt(state,password),password),"ordinary backup cannot masquerade as shared format");
        var vault=new Vault(root);vault.SaveProfile(new("local","本机API","https://example.invalid/v1","local-model","synthetic-local-key"));var before=vault.Read();string expected=SharedTransfer.Fingerprint(before);var preview=SharedTransfer.Merge(before,decoded).Preview;
        check(preview.Added==2&&preview.Duplicate==5&&preview.Conflict==0,"shared merge previews duplicate personas and new favorite/session before mutation");
        check(vault.Read().Conversations.Count==0,"shared preview writes no data");using(var cancelled=new CancellationTokenSource()){cancelled.Cancel();try{vault.ApplyTransfer(decoded,expected,cancelled.Token);}catch(OperationCanceledException){}check(vault.Read().Conversations.Count==0,"cancelled transfer preserves destination");}
        var merged=vault.ApplyTransfer(decoded,expected);check(merged.ActiveProfile!.Key=="synthetic-local-key"&&merged.Conversations.Count==1&&merged.ReplyHistory.Single().Favorite,"shared apply preserves local API and imports favorites/conversation");
        var duplicate=SharedTransfer.Merge(merged,decoded).Preview;check(duplicate.Added==0&&duplicate.Duplicate==7,"repeat import is idempotent");vault.ApplyTransfer(decoded,SharedTransfer.Fingerprint(merged));
        check(!Encoding.UTF8.GetString(File.ReadAllBytes(Path.Combine(root,"transfer-undo.vault"))).Contains("synthetic"),"persistent transfer undo is DPAPI protected");
        var undone=new Vault(root).UndoTransfer();check(undone.Conversations.Count==0&&undone.ReplyHistory.Count==0&&undone.ActiveProfile!.Key=="synthetic-local-key"&&undone.Personas.Count==5,"reopened undo removes only imported items and preserves credentials/defaults");
        vault.ApplyTransfer(decoded,SharedTransfer.Fingerprint(vault.Read()));vault.Update(s=>s.ReplyDraft="编辑后的本机草稿");Reject(()=>vault.UndoTransfer(),"undo after local edit fails closed");check(vault.Read().Conversations.Count==1,"rejected undo keeps data");Reject(()=>vault.ApplyTransfer(decoded,expected),"stale preview cannot apply");
        var conflict=SharedTransfer.Decrypt(encrypted,password);conflict.Conversations[0]=conflict.Conversations[0] with{Title="另一端改名"};check(SharedTransfer.Merge(vault.Read(),conflict).Preview.Conflict==1,"same shared ID conflict keeps local with disclosed preview");
        var invalid=SharedTransfer.Decrypt(encrypted,password);invalid.Conversations[0].Messages[0]=new("assistant","bad ordering");Reject(()=>SharedTransfer.Validate(invalid),"shared roles must be paired, preserving Android turn mapping");invalid=SharedTransfer.Decrypt(encrypted,password);invalid.Personas[0]=invalid.Personas[0] with{Instructions=new string('x',301)};Reject(()=>SharedTransfer.Validate(invalid),"common persona length validated without silent truncation");
        var folder=Environment.GetEnvironmentVariable("CHATQ_TRANSFER_FIXTURES");if(!string.IsNullOrEmpty(folder))
        {
            Directory.CreateDirectory(folder);File.WriteAllBytes(Path.Combine(folder,"windows.cqtransfer"),encrypted);File.WriteAllText(Path.Combine(folder,"windows.json"),raw);
            string other=Path.Combine(folder,"android.cqtransfer");if(File.Exists(other)){var android=SharedTransfer.Decrypt(File.ReadAllBytes(other),password);check(android.Source=="android"&&android.Conversations.Count==1&&android.Conversations[0].Messages[0].Content=="合成问题👋"&&android.Favorites[0].Text=="合成常用句😀","actual Android-produced file decrypts and maps to Windows");}
        }
        var golden=SharedTransfer.Decrypt(File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory,"transfer-fixtures","android.cqtransfer")),password);
        check(golden.Source=="android"&&golden.Conversations.Count==1&&golden.Conversations[0].Messages[0].Content=="合成问题👋"&&golden.Favorites[0].Text=="合成常用句😀","checked-in actual Android JCA synthetic archive interoperates on every CI run");
    }
}
