using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Data;
using System.Globalization;

namespace ChatQ.Windows;

public sealed partial class MainWindow
{
    private static readonly Brush Ink = new SolidColorBrush(Color.FromRgb(33, 37, 52));
    private static readonly Brush Muted = new SolidColorBrush(Color.FromRgb(102, 112, 133));
    private static readonly Brush Line = new SolidColorBrush(Color.FromRgb(228, 231, 239));
    private static readonly Brush Soft = new SolidColorBrush(Color.FromRgb(241, 237, 255));
    private readonly List<WeakReference<Button>> taskButtons = [];
    private readonly System.Runtime.CompilerServices.ConditionalWeakTable<Button,Func<bool>> taskConditions=new();
    private TextBlock? dialogStatus;
    private readonly List<Button> hubIndicators=[];
    private void RefreshHubIndicator(){foreach(var indicator in hubIndicators){indicator.Visibility=hub.Active && page!="消息助手"?Visibility.Visible:Visibility.Collapsed;indicator.Content=hub.Running?"代回复运行中 · 暂停":"连接中 · 暂停";}}

    private void BuildShell()
    {
        var shell = new Grid { Margin = new(16), Background = new SolidColorBrush(Color.FromRgb(245,246,251)), UseLayoutRounding = true, SnapsToDevicePixels = true };
        shell.ColumnDefinitions.Add(new() { Width = new(176) }); shell.ColumnDefinitions.Add(new() { Width = new(1, GridUnitType.Star) });
        var rail = new DockPanel { Margin = new(0, 0, 18, 0) };
        var brand = Stack(); brand.Margin = new(12, 8, 0, 24);
        brand.Children.Add(Text("聊商", 25, true)); brand.Children.Add(Text("让表达更自然", 12));
        DockPanel.SetDock(brand, Dock.Top); rail.Children.Add(brand);
        var foot = Text("免费 · 自备 API\nCtrl + Alt + Q 唤出\nWindows 0.5.3 预览版", 11); foot.Foreground = Muted; foot.Margin = new(12, 12, 0, 8);
        DockPanel.SetDock(foot, Dock.Bottom); rail.Children.Add(foot);
        string[] pages = ["回复助手", "AI 对话", "聊天分析", "消息助手", "人设中心", "记录收藏", "表情包", "我的 API", "数据与更新", "键盘设置"];
        navigation = new ListBox { ItemsSource = pages, SelectedIndex = 0 };
        var navTemplate = new DataTemplate(); var navRow = new FrameworkElementFactory(typeof(StackPanel)); navRow.SetValue(StackPanel.OrientationProperty, Orientation.Horizontal);
        var glyph = new FrameworkElementFactory(typeof(TextBlock)); glyph.SetValue(TextBlock.FontFamilyProperty, new FontFamily("Segoe MDL2 Assets")); glyph.SetValue(TextBlock.MarginProperty, new Thickness(0, 2, 10, 0)); glyph.SetBinding(TextBlock.TextProperty, new Binding { Converter = new NavigationGlyph() }); navRow.AppendChild(glyph);
        var caption = new FrameworkElementFactory(typeof(TextBlock)); caption.SetBinding(TextBlock.TextProperty, new Binding()); navRow.AppendChild(caption); navTemplate.VisualTree = navRow; navigation.ItemTemplate = navTemplate;
        AutomationProperties.SetName(navigation, "功能导航");
        navigation.SelectionChanged += (_, _) => { if (navigation.SelectedItem is string selected) Navigate(selected); };
        rail.Children.Add(navigation); shell.Children.Add(rail);
        var right = new DockPanel(); Grid.SetColumn(right, 1); shell.Children.Add(right);
        var pauseHub=Button("代回复运行中 · 暂停",()=>hub.Stop());pauseHub.Visibility=Visibility.Collapsed;pauseHub.Margin=new(0,0,0,8);hubIndicators.Add(pauseHub);DockPanel.SetDock(pauseHub,Dock.Top);right.Children.Add(pauseHub);
        var compact = new Grid { Margin = new(0, 0, 0, 12) };
        compact.ColumnDefinitions.Add(new() { Width = new(1, GridUnitType.Star) }); compact.ColumnDefinitions.Add(new() { Width = GridLength.Auto });
        var compactBrand = Text("聊商", 21, true); compactBrand.VerticalAlignment = VerticalAlignment.Center; compactBrand.Margin = new(0); compact.Children.Add(compactBrand);
        var compactNav = new ComboBox { ItemsSource = pages, SelectedItem = page, MinWidth = 180, Margin = new(12, 0, 0, 0), MaxWidth = 300 };
        AutomationProperties.SetName(compactNav, "紧凑功能导航"); Grid.SetColumn(compactNav, 1); compact.Children.Add(compactNav);
        compactNav.SelectionChanged += (_, _) => { if (compactNav.SelectedItem is string selected && !Equals(navigation.SelectedItem, selected)) navigation.SelectedItem = selected; };
        navigation.SelectionChanged += (_, _) => compactNav.SelectedItem = navigation.SelectedItem;
        DockPanel.SetDock(compact, Dock.Top); right.Children.Add(compact);
        var notice = new Border { Child = status, Padding = new(12, 8, 12, 0), Margin = new(0, 10, 0, 0), Background = Brushes.White, CornerRadius = new(10), MaxHeight = 100 * textScale };
        status.FontSize = 12 * textScale; status.Margin = new(0, 0, 0, 8); status.Foreground = Muted;status.MaxHeight=42*textScale;status.TextTrimming=TextTrimming.CharacterEllipsis;
        AutomationProperties.SetName(status, "操作提示"); AutomationProperties.SetLiveSetting(status, AutomationLiveSetting.Polite);
        DockPanel.SetDock(notice, Dock.Bottom); right.Children.Add(notice); right.Children.Add(content);
        void ResizeShell()
        {
            bool small = shell.ActualWidth < 920 || textScale > 1.5;
            rail.Visibility = small ? Visibility.Collapsed : Visibility.Visible;
            shell.ColumnDefinitions[0].Width = small ? new(0) : new(176);
            compact.Visibility = small ? Visibility.Visible : Visibility.Collapsed;
        }
        shell.SizeChanged += (_, _) => ResizeShell(); ResizeShell(); Content = shell;
    }
    private StackPanel Heading(string title, string description)
    {
        var pane = Stack(); pane.Margin = new(0, 0, 0, 14);
        if (textScale <= 1.5) { var heading = Text(title, 23, true); heading.Foreground = Ink; heading.Margin = new(0, 0, 0, 5); pane.Children.Add(heading); }
        if (textScale <= 1.5) { var hint = Text(description, 13); hint.Foreground = Muted; hint.Margin = new(0); pane.Children.Add(hint); } return pane;
    }
    private static Border Card(UIElement child) => new() { Child = child, Background = Brushes.White, BorderBrush = Line, BorderThickness = new(1), Padding = new(18), Margin = new(0, 0, 0, 12), CornerRadius = new(14) };
    private StackPanel Field(string label, UIElement control, string? hint = null)
    {
        var pane = Stack(); pane.Margin = new(0, 0, 0, 8); pane.Children.Add(Text(label, 13, true)); pane.Children.Add(control);
        if (hint is not null) { var note = Text(hint, 12); note.Foreground = Muted; pane.Children.Add(note); } return pane;
    }
    private UIElement EmptyState(string title, string description)
    {
        var pane = Stack(); pane.Margin = new(16, 26, 16, 26);
        var icon = Text("✦", 32); icon.Foreground = Accent; pane.Children.Add(icon);
        pane.Children.Add(Text(title, 18, true)); var hint = Text(description, 14); hint.Foreground = Muted; pane.Children.Add(hint); return Card(pane);
    }
    private Button TaskButton(string label, Action click, bool primary = false, bool stop = false,Func<bool>? ready=null)
    {
        var button = Button(label, click, primary); button.Tag = stop ? "stop" : "start";
        if(ready is not null)taskConditions.Add(button,ready);taskButtons.Add(new(button)); UpdateTaskButtons(); return button;
    }
    private void UpdateTaskButtons()
    {
        taskButtons.RemoveAll(reference => !reference.TryGetTarget(out _));
        foreach (var reference in taskButtons) if (reference.TryGetTarget(out var button))
            button.IsEnabled = Equals(button.Tag, "stop") ? operation is { IsCancellationRequested: false } : operation is null && (!taskConditions.TryGetValue(button,out var condition) || condition());
    }
    private Window Dialog(string title, double width = 580, double height = 650)
    {
        return new Window { Owner = IsVisible ? this : null, Title = title, Width = Math.Min(width, SystemParameters.WorkArea.Width * .9), Height = Math.Min(height, SystemParameters.WorkArea.Height * .9), MinWidth = Math.Min(360, SystemParameters.WorkArea.Width * .85), MinHeight = Math.Min(300, SystemParameters.WorkArea.Height * .85), FontSize = FontSize, FontFamily = FontFamily, Foreground = Ink, Background = Background, WindowStartupLocation = WindowStartupLocation.CenterOwner };
    }
    private static Border ActionBar(UIElement actions) => new() { Child = actions, Background = Brushes.White, BorderBrush = Line, BorderThickness = new(1), Padding = new(12, 10, 4, 2), CornerRadius = new(12), Margin = new(0, 10, 0, 0) };
}

internal sealed class NavigationGlyph : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture) => (value as string) switch { "回复助手" => "\uE8F2", "AI 对话" => "\uE8BD", "消息助手"=>"\uE8F2", "聊天分析"=>"\uE9D9", "人设中心" => "\uE77B", "我的 API" => "\uE8D7", "表情包"=>"\uE76E", "记录收藏"=>"\uE8A5", "数据与更新"=>"\uE895",_ => "\uE765" };
    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) => throw new NotSupportedException();
}

public static class VisualDesign
{
    public const string Theme = """
<ResourceDictionary xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">
  <Style TargetType="Window"><Setter Property="FontFamily" Value="Microsoft YaHei UI"/><Setter Property="FontSize" Value="14"/><Setter Property="Foreground" Value="#212534"/><Setter Property="Background" Value="#F5F6FB"/><Setter Property="UseLayoutRounding" Value="True"/></Style>
  <Style TargetType="Button">
    <Setter Property="MinHeight" Value="42"/><Setter Property="MinWidth" Value="76"/><Setter Property="HorizontalAlignment" Value="Left"/><Setter Property="Padding" Value="14,9"/><Setter Property="Margin" Value="0,0,8,8"/><Setter Property="Background" Value="#F1EDFF"/><Setter Property="Foreground" Value="#5D42B9"/><Setter Property="BorderBrush" Value="Transparent"/><Setter Property="BorderThickness" Value="1"/><Setter Property="Cursor" Value="Hand"/>
    <Setter Property="Template"><Setter.Value><ControlTemplate TargetType="Button"><Border x:Name="bg" Background="{TemplateBinding Background}" BorderBrush="{TemplateBinding BorderBrush}" BorderThickness="{TemplateBinding BorderThickness}" CornerRadius="10" Padding="{TemplateBinding Padding}"><ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/></Border><ControlTemplate.Triggers><Trigger Property="IsMouseOver" Value="True"><Setter TargetName="bg" Property="Opacity" Value="0.84"/></Trigger><Trigger Property="IsPressed" Value="True"><Setter TargetName="bg" Property="Opacity" Value="0.68"/></Trigger><Trigger Property="IsEnabled" Value="False"><Setter TargetName="bg" Property="Opacity" Value="0.42"/></Trigger><Trigger Property="IsKeyboardFocused" Value="True"><Setter TargetName="bg" Property="BorderBrush" Value="#4528A5"/></Trigger></ControlTemplate.Triggers></ControlTemplate></Setter.Value></Setter>
  </Style>
  <Style TargetType="TextBox"><Setter Property="MinHeight" Value="42"/><Setter Property="Padding" Value="12,10"/><Setter Property="Margin" Value="0,0,0,10"/><Setter Property="VerticalContentAlignment" Value="Center"/><Setter Property="Background" Value="#FCFCFE"/><Setter Property="BorderBrush" Value="#DDE1EA"/><Setter Property="BorderThickness" Value="1"/><Setter Property="Template"><Setter.Value><ControlTemplate TargetType="TextBox"><Border x:Name="box" Background="{TemplateBinding Background}" BorderBrush="{TemplateBinding BorderBrush}" BorderThickness="1" CornerRadius="10"><ScrollViewer x:Name="PART_ContentHost" Padding="{TemplateBinding Padding}"/></Border><ControlTemplate.Triggers><Trigger Property="IsKeyboardFocusWithin" Value="True"><Setter TargetName="box" Property="BorderBrush" Value="#7054C8"/></Trigger><Trigger Property="IsReadOnly" Value="True"><Setter TargetName="box" Property="Background" Value="Transparent"/><Setter TargetName="box" Property="BorderBrush" Value="Transparent"/></Trigger></ControlTemplate.Triggers></ControlTemplate></Setter.Value></Setter></Style>
  <Style TargetType="PasswordBox"><Setter Property="MinHeight" Value="42"/><Setter Property="Padding" Value="12,10"/><Setter Property="BorderBrush" Value="#DDE1EA"/><Setter Property="Margin" Value="0,0,0,10"/></Style>
  <Style TargetType="ComboBox"><Setter Property="MinHeight" Value="42"/><Setter Property="Padding" Value="10,8"/><Setter Property="Margin" Value="0,0,0,10"/><Setter Property="MinWidth" Value="120"/><Setter Property="MaxDropDownHeight" Value="320"/><Setter Property="HorizontalContentAlignment" Value="Stretch"/>
    <Setter Property="Template"><Setter.Value><ControlTemplate TargetType="ComboBox"><Grid>
      <ToggleButton Focusable="False" ClickMode="Press" IsChecked="{Binding IsDropDownOpen, RelativeSource={RelativeSource TemplatedParent}, Mode=TwoWay}"><ToggleButton.Template><ControlTemplate TargetType="ToggleButton"><Border x:Name="frame" Background="#FCFCFE" BorderBrush="#DDE1EA" BorderThickness="1" CornerRadius="10"><Path HorizontalAlignment="Right" VerticalAlignment="Center" Margin="0,0,12,0" Data="M 0 0 L 4 4 L 8 0" Stroke="#667085" StrokeThickness="1.5"/></Border><ControlTemplate.Triggers><Trigger Property="IsMouseOver" Value="True"><Setter TargetName="frame" Property="BorderBrush" Value="#7054C8"/></Trigger></ControlTemplate.Triggers></ControlTemplate></ToggleButton.Template></ToggleButton>
      <ContentPresenter IsHitTestVisible="False" Margin="12,8,34,8" VerticalAlignment="Center" Content="{TemplateBinding SelectionBoxItem}" ContentTemplate="{TemplateBinding SelectionBoxItemTemplate}" ContentTemplateSelector="{TemplateBinding ItemTemplateSelector}"/>
      <Popup x:Name="PART_Popup" Placement="Bottom" AllowsTransparency="True" Focusable="False" IsOpen="{TemplateBinding IsDropDownOpen}" PopupAnimation="Fade"><Border Background="White" BorderBrush="#DDE1EA" BorderThickness="1" CornerRadius="10" MinWidth="{Binding ActualWidth, RelativeSource={RelativeSource TemplatedParent}}" MaxHeight="{TemplateBinding MaxDropDownHeight}" Padding="4"><ScrollViewer CanContentScroll="True"><ItemsPresenter KeyboardNavigation.DirectionalNavigation="Contained"/></ScrollViewer></Border></Popup>
    </Grid><ControlTemplate.Triggers><Trigger Property="IsEnabled" Value="False"><Setter Property="Opacity" Value="0.45"/></Trigger></ControlTemplate.Triggers></ControlTemplate></Setter.Value></Setter>
  </Style>
  <Style TargetType="ListBox"><Setter Property="BorderThickness" Value="0"/><Setter Property="Background" Value="Transparent"/><Setter Property="ScrollViewer.HorizontalScrollBarVisibility" Value="Disabled"/></Style>
  <Style TargetType="ListBoxItem"><Setter Property="Padding" Value="12,12"/><Setter Property="MinHeight" Value="46"/><Setter Property="Margin" Value="0,3"/><Setter Property="HorizontalContentAlignment" Value="Stretch"/><Setter Property="Template"><Setter.Value><ControlTemplate TargetType="ListBoxItem"><Border x:Name="item" Background="Transparent" CornerRadius="10" Padding="{TemplateBinding Padding}"><ContentPresenter/></Border><ControlTemplate.Triggers><Trigger Property="IsMouseOver" Value="True"><Setter TargetName="item" Property="Background" Value="#EDEFF6"/></Trigger><Trigger Property="IsSelected" Value="True"><Setter TargetName="item" Property="Background" Value="#EAE3FF"/><Setter Property="Foreground" Value="#5D3CB5"/><Setter Property="FontWeight" Value="SemiBold"/></Trigger><Trigger Property="IsKeyboardFocused" Value="True"><Setter TargetName="item" Property="BorderBrush" Value="#7054C8"/><Setter TargetName="item" Property="BorderThickness" Value="1"/></Trigger></ControlTemplate.Triggers></ControlTemplate></Setter.Value></Setter></Style>
  <Style TargetType="Expander"><Setter Property="Margin" Value="0,6,0,10"/><Setter Property="Padding" Value="0,10,0,0"/><Setter Property="HorizontalContentAlignment" Value="Stretch"/></Style>
</ResourceDictionary>
""";
}
