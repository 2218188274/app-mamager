using System.Security.Cryptography;
using System.Text.Json;

namespace ChatQ.Windows;

public sealed partial class Vault
{
    private string TransferUndoPath=>Path.Combine(DirectoryPath,"transfer-undo.vault");
    public UserState ApplyTransfer(TransferData data,string expected,CancellationToken token=default)
    {
        lock(gate)
        {
            token.ThrowIfCancellationRequested();var current=Read();
            if(SharedTransfer.Fingerprint(current)!=expected)throw new InvalidOperationException("本机数据已变化，请重新预览迁移文件。");
            var result=SharedTransfer.Merge(current,data);if(result.Preview.Added==0)return current;
            Directory.CreateDirectory(DirectoryPath);byte[] plain=JsonSerializer.SerializeToUtf8Bytes(result.Undo,SharedTransfer.Json);
            byte[]? previous=File.Exists(TransferUndoPath)?File.ReadAllBytes(TransferUndoPath):null;bool staged=false,committed=false;
            string temporary=TransferUndoPath+"."+Guid.NewGuid().ToString("N")+".tmp";
            try
            {
                byte[] encrypted=DeviceEncryption.Protect(plain);token.ThrowIfCancellationRequested();using(var output=new FileStream(temporary,FileMode.CreateNew,FileAccess.Write,FileShare.None)){output.Write(encrypted);output.Flush(true);}
                if(File.Exists(TransferUndoPath))File.Replace(temporary,TransferUndoPath,TransferUndoPath+".bak");else File.Move(temporary,TransferUndoPath);
                staged=true;token.ThrowIfCancellationRequested();result.State.ConfigurationRevision=Guid.NewGuid().ToString("N");var written=Write(result.State);committed=true;return written;
            }
            catch
            {
                if(staged&&!committed)
                {
                    if(previous is null)File.Delete(TransferUndoPath);
                    else{using(var output=new FileStream(temporary,FileMode.CreateNew,FileAccess.Write,FileShare.None)){output.Write(previous);output.Flush(true);}File.Replace(temporary,TransferUndoPath,null);}
                }
                throw;
            }
            finally{CryptographicOperations.ZeroMemory(plain);if(File.Exists(temporary))File.Delete(temporary);}
        }
    }
    public UserState UndoTransfer()
    {
        lock(gate)
        {
            if(!File.Exists(TransferUndoPath)||new FileInfo(TransferUndoPath).Length>100000)throw new InvalidOperationException("没有可撤销的跨端导入。");
            byte[] plain=DeviceEncryption.Unprotect(File.ReadAllBytes(TransferUndoPath));
            try
            {
                var undo=JsonSerializer.Deserialize<TransferUndo>(plain,SharedTransfer.Json)??throw new InvalidOperationException("撤销信息不可用。");var current=Read();
                if(undo.Expected!=SharedTransfer.Fingerprint(current))throw new InvalidOperationException("导入后本机资料已修改，已保留现有内容。请手动管理新增内容，不能直接撤销。");
                current.Personas.RemoveAll(x=>undo.Personas.Contains(x.Id));current.ReplyHistory.RemoveAll(x=>undo.Favorites.Contains(x.Id));current.Conversations.RemoveAll(x=>undo.Conversations.Contains(x.Id));
                current.ConfigurationRevision=Guid.NewGuid().ToString("N");var result=Write(current);File.Delete(TransferUndoPath);return result;
            }
            finally{CryptographicOperations.ZeroMemory(plain);}
        }
    }
}
