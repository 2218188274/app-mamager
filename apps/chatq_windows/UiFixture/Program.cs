using System.IO;
using System.Windows;
using System.Windows.Markup;
using ChatQ.Windows;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        string directory = Path.Combine(Path.GetTempPath(), "ChatQUIFixture-" + Guid.NewGuid().ToString("N"));
        try
        {
            var vault = new Vault(directory);
            if (args.Length == 1 && Uri.TryCreate(args[0], UriKind.Absolute, out var uri) &&
                uri.Scheme == "http" && uri.Host == "127.0.0.1")
                vault.SaveProfile(new("qa", "本地合成接口", args[0], "fixture-model", "synthetic-test-key"));
            var app = new Application { Resources = (ResourceDictionary)XamlReader.Parse(DesktopApp.Theme) };
            var window = new MainWindow(vault) { Title = "聊商 Windows UI 合成测试", HotkeyAvailable = false };
            app.Run(window);
        }
        finally { if (Directory.Exists(directory)) Directory.Delete(directory, true); }
    }
}
