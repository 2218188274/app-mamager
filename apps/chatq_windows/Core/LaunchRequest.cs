namespace ChatQ.Windows;

// One bounded local IPC instruction. Never carries editor text, clipboard content or credentials.
public enum LaunchRequest : byte { Focus = 1, Reply = 2 }
public static class LaunchRequests
{
    public static LaunchRequest FromArguments(IEnumerable<string> arguments) => arguments.Contains("--reply", StringComparer.Ordinal) ? LaunchRequest.Reply : LaunchRequest.Focus;
    public static bool IsValid(byte value) => value is (byte)LaunchRequest.Focus or (byte)LaunchRequest.Reply;
}
