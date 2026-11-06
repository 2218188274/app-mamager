using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ChatQ.Windows;

/// <summary>Explicit password-protected library archive, separate from .cqb and machine DPAPI.</summary>
public static class LibraryBackup
{
    public const int Iterations=600000,HeaderBytes=44,MaxBytes=ChatLibrary.MaxPlainBytes+60;
    private static ReadOnlySpan<byte> Magic=>"CHATQLB1"u8;
    private static readonly JsonSerializerOptions Json=new(Defaults.Json){UnmappedMemberHandling=JsonUnmappedMemberHandling.Disallow};
    private static void Password(string value)
    {if(value.Length is <8 or >128 || string.IsNullOrWhiteSpace(value))throw new InvalidOperationException("资料备份密码需为8–128个字符，请自行保管。");}
    public static byte[] Encrypt(ChatLibraryData library,string password,CancellationToken token=default)
    {
        token.ThrowIfCancellationRequested();Password(password);ChatLibrary.Validate(library);byte[] plain=JsonSerializer.SerializeToUtf8Bytes(library,Json);
        try
        {
            if(plain.Length>ChatLibrary.MaxPlainBytes)throw new InvalidOperationException("资料备份超出16MB，请先整理。");
            byte[] output=new byte[plain.Length+60];Magic.CopyTo(output);BinaryPrimitives.WriteInt32LittleEndian(output.AsSpan(8),Iterations);RandomNumberGenerator.Fill(output.AsSpan(12,28));BinaryPrimitives.WriteInt32LittleEndian(output.AsSpan(40),plain.Length);
            byte[] key=Rfc2898DeriveBytes.Pbkdf2(password,output.AsSpan(12,16),Iterations,HashAlgorithmName.SHA256,32);
            try{token.ThrowIfCancellationRequested();using var cipher=new AesGcm(key,16);cipher.Encrypt(output.AsSpan(28,12),plain,output.AsSpan(HeaderBytes,plain.Length),output.AsSpan(HeaderBytes+plain.Length,16),output.AsSpan(0,HeaderBytes));token.ThrowIfCancellationRequested();return output;}
            finally{CryptographicOperations.ZeroMemory(key);}
        }
        finally{CryptographicOperations.ZeroMemory(plain);}
    }
    public static ChatLibraryData Decrypt(byte[] bytes,string password,CancellationToken token=default)
    {
        token.ThrowIfCancellationRequested();Password(password);
        if(bytes.Length is <60 or >MaxBytes || !bytes.AsSpan(0,8).SequenceEqual(Magic) || BinaryPrimitives.ReadInt32LittleEndian(bytes.AsSpan(8))!=Iterations || BinaryPrimitives.ReadInt32LittleEndian(bytes.AsSpan(40))!=bytes.Length-60)throw new InvalidOperationException("资料备份格式或版本不支持，请选择.cqlb文件。");
        byte[] key=Rfc2898DeriveBytes.Pbkdf2(password,bytes.AsSpan(12,16),Iterations,HashAlgorithmName.SHA256,32),plain=new byte[bytes.Length-60];
        try
        {
            token.ThrowIfCancellationRequested();using var cipher=new AesGcm(key,16);cipher.Decrypt(bytes.AsSpan(28,12),bytes.AsSpan(HeaderBytes,plain.Length),bytes.AsSpan(HeaderBytes+plain.Length,16),plain,bytes.AsSpan(0,HeaderBytes));
            var library=JsonSerializer.Deserialize<ChatLibraryData>(plain,Json)??throw new InvalidOperationException("备份没有有效资料。");ChatLibrary.Validate(library);token.ThrowIfCancellationRequested();return library;
        }
        catch(CryptographicException){throw new InvalidOperationException("密码不正确或资料备份已损坏，本机数据未修改。");}
        catch(JsonException){throw new InvalidOperationException("资料备份内容格式不受支持，本机数据未修改。");}
        finally{CryptographicOperations.ZeroMemory(key);CryptographicOperations.ZeroMemory(plain);}
    }
}
