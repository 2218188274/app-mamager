using System.Reflection;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using ChatQ.Windows;

internal static partial class Program
{
    private static LibraryChat TestLoadedLibraryRename(MainWindow window, ChatLibrary store, LibraryChat saved)
    {
        var dialog = (Window)typeof(MainWindow).GetMethod("BuildChatLibraryDialog", BindingFlags.NonPublic | BindingFlags.Instance)!
            .Invoke(window, null)!;
        var root = (FrameworkElement)dialog.Content;
        Layout(root, 500, 440);
        var list = Children<ListBox>(root).Single(x => AutomationProperties.GetName(x) == "已保存聊天资料");
        Wait(() => list.Items.Count > 0);
        Children<TextBox>(root).Single(x => AutomationProperties.GetName(x) == "搜索资料名称").Text = saved.Name;
        list.SelectedIndex = 0;
        Children<TextBox>(root).Single(x => AutomationProperties.GetName(x) == "修改资料名称").Text = saved.Name + "-续";
        Children<Button>(root).Single(x => Equals(x.Content, "保存改名")).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        Wait(() => typeof(MainWindow).GetField("operation", BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(window) is null);
        var renamed = store.Read().Chats.Single(x => x.Id == saved.Id);
        var loadedAt = (DateTime)typeof(MainWindow).GetField("loadedLibraryUpdated", BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(window)!;
        Check(renamed.Name == saved.Name + "-续" && loadedAt == renamed.UpdatedAt,
            "renaming the loaded library entry advances the current analysis save revision");
        dialog.Close();
        var save = (Task)typeof(MainWindow).GetMethod("SaveCurrentHistoryAnalysis", BindingFlags.NonPublic | BindingFlags.Instance)!
            .Invoke(window, null)!;
        Wait(() => save.IsCompleted);
        save.GetAwaiter().GetResult();
        var updated = store.Read().Chats.Single(x => x.Id == saved.Id);
        Check(updated.Analysis!.CreatedAt > saved.Analysis!.CreatedAt,
            "saving analysis after renaming succeeds through the ordinary UI operation");
        return updated;
    }
}
