using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace ChatQ.Windows;

public static class DeviceEncryption
{
    [StructLayout(LayoutKind.Sequential)] private struct Blob { public int Length; public IntPtr Data; }
    [DllImport("crypt32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    [return: MarshalAs(UnmanagedType.Bool)] private static extern bool CryptProtectData(ref Blob input, string description, IntPtr entropy, IntPtr reserved, IntPtr prompt, uint flags, out Blob output);
    [DllImport("crypt32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)] private static extern bool CryptUnprotectData(ref Blob input, IntPtr description, IntPtr entropy, IntPtr reserved, IntPtr prompt, uint flags, out Blob output);
    [DllImport("kernel32.dll")] private static extern IntPtr LocalFree(IntPtr memory);
    public static byte[] Protect(byte[] value) => Transform(value, true);
    public static byte[] Unprotect(byte[] value) => Transform(value, false);
    private static byte[] Transform(byte[] value, bool encrypt)
    {
        var input = new Blob { Length = value.Length, Data = Marshal.AllocHGlobal(value.Length) };
        try
        {
            Marshal.Copy(value, 0, input.Data, value.Length);
            Blob output;
            bool ok = encrypt ? CryptProtectData(ref input, "ChatQ Windows local data", IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 1, out output) :
                                CryptUnprotectData(ref input, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 1, out output);
            if (!ok) throw new CryptographicException("本机加密操作失败。请使用原来的 Windows 账号打开应用。");
            try { byte[] result = new byte[output.Length]; Marshal.Copy(output.Data, result, 0, output.Length); return result; }
            finally { LocalFree(output.Data); }
        }
        finally { unsafeZero(input.Data, value.Length); Marshal.FreeHGlobal(input.Data); }
    }
    private static void unsafeZero(IntPtr pointer, int count) { for (int i = 0; i < count; i++) Marshal.WriteByte(pointer, i, 0); }
}

public sealed class Vault(string? root = null)
{
    public const int MaxPlainBytes = 7_500_000;
    public string DirectoryPath { get; } = root ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ChatQWindows");
    private string DataPath => Path.Combine(DirectoryPath, "data.vault");
    private readonly object gate = new();
    public UserState Read()
    {
        lock (gate)
        {
            if (!File.Exists(DataPath)) return new();
            if (new FileInfo(DataPath).Length > 8 * 1024 * 1024) throw new InvalidOperationException("本机数据文件过大，未修改原文件。");
            byte[] plain = DeviceEncryption.Unprotect(File.ReadAllBytes(DataPath));
            try
            {
                var state = JsonSerializer.Deserialize<UserState>(plain, Defaults.Json) ?? throw new InvalidOperationException("本机数据不可用。");
                Validation.State(state); return state;
            }
            catch (JsonException) { throw new InvalidOperationException("本机数据损坏，未覆盖原文件。备份位于应用数据目录。"); }
            finally { CryptographicOperations.ZeroMemory(plain); }
        }
    }
    public UserState Update(Action<UserState> change, bool configuration = false)
    {
        lock (gate)
        {
            var state = Read(); change(state);
            if (configuration) state.ConfigurationRevision = Guid.NewGuid().ToString("N");
            Validation.State(state);
            byte[] plain = JsonSerializer.SerializeToUtf8Bytes(state, Defaults.Json);
            try
            {
                if (plain.Length > MaxPlainBytes) throw new InvalidOperationException("本机记录容量已满，请先导出并删除不用的会话；原数据没有被覆盖。");
                byte[] encrypted = DeviceEncryption.Protect(plain);
                Directory.CreateDirectory(DirectoryPath);
                string temporary = Path.Combine(DirectoryPath, Guid.NewGuid().ToString("N") + ".tmp");
                try
                {
                    using (var file = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                    { file.Write(encrypted); file.Flush(true); }
                    if (File.Exists(DataPath)) File.Replace(temporary, DataPath, DataPath + ".bak"); else File.Move(temporary, DataPath);
                }
                finally { if (File.Exists(temporary)) File.Delete(temporary); }
                return state;
            }
            finally { CryptographicOperations.ZeroMemory(plain); }
        }
    }
    public UserState SaveProfile(ApiProfile input)
    {
        return Update(state =>
        {
            var old = state.Profiles.Find(p => p.Id == input.Id);
            if (string.IsNullOrWhiteSpace(input.Key))
            {
                if (old is null || old.BaseUrl != input.BaseUrl.Trim().TrimEnd('/'))
                    throw new InvalidOperationException("新地址需要重新填写密钥；不会把旧密钥发送到其他地址。");
                input = input with { Key = old.Key };
            }
            input = Validation.Profile(input);
            if (old is not null) state.Profiles.Remove(old);
            else if (state.Profiles.Count >= 8) throw new InvalidOperationException("最多保存8套配置，请先移除不用的配置。");
            state.Profiles.Add(input); state.ProfileId = input.Id;
        }, true);
    }
}
