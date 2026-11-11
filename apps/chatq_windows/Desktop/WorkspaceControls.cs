using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Media;

namespace ChatQ.Windows;

public sealed partial class MainWindow
{
    private Border ModeSelector(IEnumerable<(string Id, string Label)> choices, string selected, Action<string> select)
    {
        var items = new WrapPanel();
        foreach (var choice in choices)
        {
            var item = choice;
            var control = Button(item.Label, () => select(item.Id));
            bool current = item.Id == selected;
            control.Background = current ? Brushes.White : Brushes.Transparent;
            control.BorderBrush = current ? Line : Brushes.Transparent;
            control.Foreground = current ? Accent : Muted;
            control.Margin = new(0);
            AutomationProperties.SetItemStatus(control, current ? "当前模式" : "可切换");
            items.Children.Add(control);
        }
        return new Border
        {
            Child = items, Background = Soft, CornerRadius = new(12), Padding = new(4),
            HorizontalAlignment = HorizontalAlignment.Left, Margin = new(0, 8, 0, 0)
        };
    }

    private static Border SettingsCard(UIElement content) => new()
    {
        Child = content, Background = Soft, CornerRadius = new(8), Padding = new(12, 0, 12, 0),
        Margin = new(0, 8, 0, 0)
    };
}
