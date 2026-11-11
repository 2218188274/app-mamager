using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Data;
using System.Globalization;

namespace ChatQ.Windows;

public sealed partial class MainWindow
{
    private static readonly Brush Ink = new SolidColorBrush(Color.FromRgb(32, 37, 54));
    private static readonly Brush Muted = new SolidColorBrush(Color.FromRgb(77, 86, 109));
    private static readonly Brush Line = new SolidColorBrush(Color.FromRgb(216, 221, 232));
    private static readonly Brush Soft = new SolidColorBrush(Color.FromRgb(238, 240, 245));
    private static readonly Brush SelectedSurface = new SolidColorBrush(Color.FromRgb(236, 236, 249));
    private static readonly Brush Danger = new SolidColorBrush(Color.FromRgb(180, 35, 60));
    private readonly List<WeakReference<Button>> taskButtons = [];
    private readonly System.Runtime.CompilerServices.ConditionalWeakTable<Button,Func<bool>> taskConditions=new();
    private TextBlock? dialogStatus;
    private readonly List<Button> hubIndicators=[];
    private void RefreshHubIndicator(){foreach(var indicator in hubIndicators){indicator.Visibility=hub.Active && page!="消息助手"?Visibility.Visible:Visibility.Collapsed;indicator.Content=hub.Running?"代回复运行中 · 暂停":"连接中 · 暂停";}}

    private void BuildShell()
    {
        var shell = new Grid { Margin = new(24), Background = new SolidColorBrush(Color.FromRgb(246,247,250)), UseLayoutRounding = true, SnapsToDevicePixels = true };
        shell.ColumnDefinitions.Add(new() { Width = new(224) }); shell.ColumnDefinitions.Add(new() { Width = new(1, GridUnitType.Star) });
        var rail = new DockPanel { Margin = new(0, 0, 24, 0) };
        var brand = Stack(); brand.Margin = new(12, 8, 0, 24);
        brand.Children.Add(Text("聊商", 24, true)); brand.Children.Add(Text("让表达更自然", 12));
        DockPanel.SetDock(brand, Dock.Top); rail.Children.Add(brand);
        var foot = Stack(); foot.Margin = new(12, 16, 0, 8);
        var plan = Text("免费 · 自备 API", 12); plan.Foreground = Muted; foot.Children.Add(plan);
        var shortcut = new WrapPanel { Margin = new(0, 0, 0, 8) };
        var key = Text("Ctrl + Alt + Q", 11); key.Margin = new(0); key.FontFamily = new FontFamily("Consolas"); key.Foreground = Muted;
        shortcut.Children.Add(new Border { Child=key, Background=Soft, BorderBrush=Line, BorderThickness=new(1), Padding=new(6,4,6,4), CornerRadius=new(4) });
        var hint = Text("唤出", 12); hint.Margin = new(8, 4, 0, 0); hint.Foreground = Muted; shortcut.Children.Add(hint); foot.Children.Add(shortcut);
        var version = Text("Windows "+typeof(MainWindow).Assembly.GetName().Version?.ToString(3)+" 预览版", 11); version.Foreground=Muted; version.Margin=new(0); foot.Children.Add(version);
        DockPanel.SetDock(foot, Dock.Bottom); rail.Children.Add(foot);
        string[] pages = ["回复助手", "AI 对话", "微信导出", "聊天分析", "消息助手", "人设中心", "记录收藏", "表情包", "我的 API", "数据与更新", "键盘设置"];
        navigation = new ListBox { ItemsSource = pages, SelectedIndex = 0 };
        var navTemplate = new DataTemplate(); var navRow = new FrameworkElementFactory(typeof(StackPanel)); navRow.SetValue(StackPanel.OrientationProperty, Orientation.Horizontal);
        var glyph = new FrameworkElementFactory(typeof(TextBlock)); glyph.SetValue(TextBlock.FontFamilyProperty, new FontFamily("Segoe MDL2 Assets")); glyph.SetValue(TextBlock.MarginProperty, new Thickness(0, 0, 8, 0)); glyph.SetValue(TextBlock.FontSizeProperty, 16.0 * textScale); glyph.SetValue(TextBlock.WidthProperty, 20.0 * textScale); glyph.SetValue(TextBlock.ForegroundProperty, Muted); glyph.SetBinding(TextBlock.TextProperty, new Binding { Converter = new NavigationGlyph() }); navRow.AppendChild(glyph);
        var caption = new FrameworkElementFactory(typeof(TextBlock)); caption.SetBinding(TextBlock.TextProperty, new Binding()); navRow.AppendChild(caption); navTemplate.VisualTree = navRow; navigation.ItemTemplate = navTemplate;
        AutomationProperties.SetName(navigation, "功能导航");
        navigation.SelectionChanged += (_, _) => { if (navigation.SelectedItem is string selected) Navigate(selected); };
        rail.Children.Add(new Border { Child = navigation, Background = Brushes.White, BorderBrush = Line,
            BorderThickness = new(1), CornerRadius = new(12), Padding = new(4), Margin = new(0, 0, 0, 8) });
        shell.Children.Add(rail);
        var right = new DockPanel(); Grid.SetColumn(right, 1); shell.Children.Add(right);
        var pauseHub=Button("代回复运行中 · 暂停",PauseHubManually);pauseHub.Visibility=Visibility.Collapsed;pauseHub.Margin=new(0,0,0,8);hubIndicators.Add(pauseHub);DockPanel.SetDock(pauseHub,Dock.Top);right.Children.Add(pauseHub);
        var compact = new Grid { Margin = new(0, 0, 0, 12) };
        compact.ColumnDefinitions.Add(new() { Width = new(1, GridUnitType.Star) }); compact.ColumnDefinitions.Add(new() { Width = GridLength.Auto });
        var compactBrand = Text("聊商", 21, true); compactBrand.VerticalAlignment = VerticalAlignment.Center; compactBrand.Margin = new(0); compact.Children.Add(compactBrand);
        var compactNav = new ComboBox { ItemsSource = pages, SelectedItem = page, MinWidth = 180, Margin = new(12, 0, 0, 0), MaxWidth = 300 };
        AutomationProperties.SetName(compactNav, "紧凑功能导航"); Grid.SetColumn(compactNav, 1); compact.Children.Add(compactNav);
        compactNav.SelectionChanged += (_, _) => { if (compactNav.SelectedItem is string selected && !Equals(navigation.SelectedItem, selected)) navigation.SelectedItem = selected; };
        navigation.SelectionChanged += (_, _) => compactNav.SelectedItem = navigation.SelectedItem;
        DockPanel.SetDock(compact, Dock.Top); right.Children.Add(compact);
        var notice = new Border { Child = status, Padding = new(12, 8, 12, 0), Margin = new(0, 12, 0, 0), Background = Soft, CornerRadius = new(8), MaxHeight = 100 * textScale };
        status.FontSize = 12 * textScale; status.Margin = new(0, 0, 0, 8); status.Foreground = Muted;status.MaxHeight=42*textScale;status.TextTrimming=TextTrimming.CharacterEllipsis;
        AutomationProperties.SetName(status, "操作提示"); AutomationProperties.SetLiveSetting(status, AutomationLiveSetting.Polite);
        DockPanel.SetDock(notice, Dock.Bottom); right.Children.Add(notice); right.Children.Add(content);
        void ResizeShell()
        {
            bool small = shell.ActualWidth < 920 || textScale > 1.5;
            rail.Visibility = small ? Visibility.Collapsed : Visibility.Visible;
            shell.ColumnDefinitions[0].Width = small ? new(0) : new(224);
            compact.Visibility = small ? Visibility.Visible : Visibility.Collapsed;
        }
        shell.SizeChanged += (_, _) => ResizeShell(); ResizeShell(); Content = shell;
    }
    private StackPanel Heading(string title, string description)
    {
        var pane = Stack(); pane.Margin = new(0, 0, 0, 16);
        if (textScale <= 1.5) { var heading = Text(title, 24, true); heading.Foreground = Ink; heading.Margin = new(0, 0, 0, 8); pane.Children.Add(heading); }
        if (textScale <= 1.5) { var hint = Text(description.TrimEnd('。'), 13); hint.Foreground = Muted; hint.Margin = new(0); pane.Children.Add(hint); } return pane;
    }
    private static Border Card(UIElement child) => new() { Child = child, Background = Brushes.White, BorderBrush = Line, BorderThickness = new(1), Padding = new(20), Margin = new(0, 0, 0, 12), CornerRadius = new(12) };
    private StackPanel Field(string label, UIElement control, string? hint = null)
    {
        var pane = Stack(); pane.Margin = new(0, 0, 0, 8); pane.Children.Add(Text(label, 14, true)); pane.Children.Add(control);
        if (hint is not null) { var note = Text(hint, 12); note.Foreground = Muted; pane.Children.Add(note); } return pane;
    }
    private UIElement EmptyState(string title, string description)
    {
        var pane = Stack(); pane.Margin = new(0, 8, 0, 8);
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
    private static Border ActionBar(UIElement actions) => new() { Child = actions, Background = Brushes.White, BorderBrush = Line, BorderThickness = new(1), Padding = new(12, 12, 4, 4), CornerRadius = new(12), Margin = new(0, 12, 0, 0) };
}

internal sealed class NavigationGlyph : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture) => (value as string) switch { "回复助手" => "\uE8F2", "AI 对话" => "\uE8BD", "消息助手"=>"\uE8F2", "聊天分析"=>"\uE9D9", "微信导出"=>"\uE898", "人设中心" => "\uE77B", "我的 API" => "\uE8D7", "表情包"=>"\uE76E", "记录收藏"=>"\uE8A5", "数据与更新"=>"\uE895",_ => "\uE765" };
    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) => throw new NotSupportedException();
}

// UI refinement process: unslop by Damir Sokolovsky (@heydamir), CC BY 4.0.
// https://heydamir.design/unslop — attribution and direction: docs/UNSLOP-UI.md.
public static class VisualDesign
{
    public const string Theme = """
<ResourceDictionary xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">
  <Style TargetType="Window"><Setter Property="FontFamily" Value="Microsoft YaHei UI"/><Setter Property="FontSize" Value="14"/><Setter Property="Foreground" Value="#202536"/><Setter Property="Background" Value="#F6F7FA"/><Setter Property="UseLayoutRounding" Value="True"/></Style>
  <Style TargetType="Button">
    <Setter Property="MinHeight" Value="44"/><Setter Property="MinWidth" Value="76"/><Setter Property="HorizontalAlignment" Value="Left"/><Setter Property="Padding" Value="16,8"/><Setter Property="Margin" Value="0,0,8,8"/><Setter Property="Background" Value="#EEF0F5"/><Setter Property="Foreground" Value="#202536"/><Setter Property="BorderBrush" Value="#D8DDE8"/><Setter Property="BorderThickness" Value="1"/><Setter Property="Cursor" Value="Hand"/>
    <Setter Property="ContentTemplate"><Setter.Value><DataTemplate><TextBlock Text="{Binding}" TextWrapping="Wrap" TextAlignment="Center"><TextBlock.Style><Style TargetType="TextBlock"><Style.Triggers><DataTrigger Binding="{Binding IsEnabled, RelativeSource={RelativeSource AncestorType=Button}}" Value="False"><Setter Property="Foreground" Value="#5F697E"/></DataTrigger></Style.Triggers></Style></TextBlock.Style></TextBlock></DataTemplate></Setter.Value></Setter>
    <Setter Property="Template"><Setter.Value><ControlTemplate TargetType="Button"><Grid>
      <Border x:Name="bg" Background="{TemplateBinding Background}" BorderBrush="{TemplateBinding BorderBrush}" BorderThickness="{TemplateBinding BorderThickness}" CornerRadius="8"/>
      <Border x:Name="interaction" Margin="1" Background="Black" Opacity="0" CornerRadius="7" IsHitTestVisible="False"/>
      <ContentPresenter x:Name="content" Margin="{TemplateBinding Padding}" HorizontalAlignment="Center" VerticalAlignment="Center"/>
      <Border x:Name="focus" Margin="3" BorderBrush="{TemplateBinding Foreground}" BorderThickness="1" CornerRadius="5" Visibility="Collapsed" IsHitTestVisible="False"/>
    </Grid><ControlTemplate.Triggers>
      <Trigger Property="IsMouseOver" Value="True"><Setter TargetName="interaction" Property="Opacity" Value="0.05"/></Trigger>
      <Trigger Property="IsPressed" Value="True"><Setter TargetName="interaction" Property="Opacity" Value="0.10"/></Trigger>
      <Trigger Property="IsEnabled" Value="False"><Setter TargetName="bg" Property="Background" Value="#EEF0F5"/><Setter TargetName="bg" Property="BorderBrush" Value="#D8DDE8"/><Setter TargetName="interaction" Property="Opacity" Value="0"/></Trigger>
      <Trigger Property="IsKeyboardFocused" Value="True"><Setter TargetName="focus" Property="Visibility" Value="Visible"/></Trigger>
    </ControlTemplate.Triggers></ControlTemplate></Setter.Value></Setter>
  </Style>
  <Style TargetType="TextBox"><Setter Property="MinHeight" Value="44"/><Setter Property="Padding" Value="12,8"/><Setter Property="Margin" Value="0,0,0,12"/><Setter Property="VerticalContentAlignment" Value="Center"/><Setter Property="Background" Value="White"/><Setter Property="BorderBrush" Value="#8792A8"/><Setter Property="BorderThickness" Value="1"/>
    <Setter Property="Template"><Setter.Value><ControlTemplate TargetType="TextBox"><Border x:Name="box" Background="{TemplateBinding Background}" BorderBrush="{TemplateBinding BorderBrush}" BorderThickness="{TemplateBinding BorderThickness}" CornerRadius="8"><ScrollViewer x:Name="PART_ContentHost" Padding="{TemplateBinding Padding}"/></Border><ControlTemplate.Triggers><Trigger Property="IsKeyboardFocusWithin" Value="True"><Setter TargetName="box" Property="BorderBrush" Value="#4F55A7"/></Trigger><Trigger Property="IsReadOnly" Value="True"><Setter TargetName="box" Property="Background" Value="Transparent"/><Setter TargetName="box" Property="BorderBrush" Value="Transparent"/></Trigger></ControlTemplate.Triggers></ControlTemplate></Setter.Value></Setter>
  </Style>
  <Style TargetType="PasswordBox"><Setter Property="MinHeight" Value="44"/><Setter Property="Padding" Value="12,8"/><Setter Property="BorderBrush" Value="#8792A8"/><Setter Property="Margin" Value="0,0,0,12"/></Style>
  <Style TargetType="ComboBox"><Setter Property="MinHeight" Value="44"/><Setter Property="Padding" Value="12,8"/><Setter Property="Margin" Value="0,0,0,12"/><Setter Property="MinWidth" Value="120"/><Setter Property="MaxDropDownHeight" Value="320"/><Setter Property="HorizontalContentAlignment" Value="Stretch"/><Setter Property="Background" Value="White"/><Setter Property="BorderBrush" Value="#8792A8"/>
    <Setter Property="Template"><Setter.Value><ControlTemplate TargetType="ComboBox"><Grid>
      <ToggleButton Focusable="False" ClickMode="Press" Background="{TemplateBinding Background}" BorderBrush="{TemplateBinding BorderBrush}" IsChecked="{Binding IsDropDownOpen, RelativeSource={RelativeSource TemplatedParent}, Mode=TwoWay}"><ToggleButton.Template><ControlTemplate TargetType="ToggleButton"><Border x:Name="frame" Background="{TemplateBinding Background}" BorderBrush="{TemplateBinding BorderBrush}" BorderThickness="1" CornerRadius="8"><Path HorizontalAlignment="Right" VerticalAlignment="Center" Margin="0,0,12,0" Data="M 0 0 L 4 4 L 8 0" Stroke="#5F697E" StrokeThickness="1.5"/></Border><ControlTemplate.Triggers><Trigger Property="IsMouseOver" Value="True"><Setter TargetName="frame" Property="BorderBrush" Value="#5F697E"/></Trigger></ControlTemplate.Triggers></ControlTemplate></ToggleButton.Template></ToggleButton>
      <ContentPresenter IsHitTestVisible="False" Margin="12,8,36,8" VerticalAlignment="Center" Content="{TemplateBinding SelectionBoxItem}" ContentTemplate="{TemplateBinding SelectionBoxItemTemplate}" ContentTemplateSelector="{TemplateBinding ItemTemplateSelector}"/>
      <Border x:Name="focus" BorderBrush="#4F55A7" BorderThickness="2" CornerRadius="8" Visibility="Collapsed" IsHitTestVisible="False"/>
      <Popup x:Name="PART_Popup" Placement="Bottom" AllowsTransparency="True" Focusable="False" IsOpen="{TemplateBinding IsDropDownOpen}" PopupAnimation="Fade"><Border Background="White" BorderBrush="#8792A8" BorderThickness="1" CornerRadius="8" MinWidth="{Binding ActualWidth, RelativeSource={RelativeSource TemplatedParent}}" MaxHeight="{TemplateBinding MaxDropDownHeight}" Padding="4"><ScrollViewer CanContentScroll="True"><ItemsPresenter KeyboardNavigation.DirectionalNavigation="Contained"/></ScrollViewer></Border></Popup>
    </Grid><ControlTemplate.Triggers><Trigger Property="IsEnabled" Value="False"><Setter Property="Opacity" Value="0.5"/></Trigger><Trigger Property="IsKeyboardFocusWithin" Value="True"><Setter TargetName="focus" Property="Visibility" Value="Visible"/></Trigger></ControlTemplate.Triggers></ControlTemplate></Setter.Value></Setter>
  </Style>
  <Style TargetType="ListBox"><Setter Property="BorderThickness" Value="0"/><Setter Property="Background" Value="Transparent"/><Setter Property="ScrollViewer.HorizontalScrollBarVisibility" Value="Disabled"/></Style>
  <Style TargetType="ListBoxItem"><Setter Property="Padding" Value="12,8"/><Setter Property="MinHeight" Value="40"/><Setter Property="Margin" Value="0,2"/><Setter Property="HorizontalContentAlignment" Value="Stretch"/>
    <Setter Property="Template"><Setter.Value><ControlTemplate TargetType="ListBoxItem"><Border x:Name="item" Background="Transparent" BorderBrush="Transparent" BorderThickness="3,0,0,0" CornerRadius="8" Padding="{TemplateBinding Padding}"><ContentPresenter/></Border><ControlTemplate.Triggers><Trigger Property="IsMouseOver" Value="True"><Setter TargetName="item" Property="Background" Value="#E1E5EE"/></Trigger><Trigger Property="IsSelected" Value="True"><Setter TargetName="item" Property="Background" Value="#ECECF9"/><Setter TargetName="item" Property="BorderBrush" Value="#4F55A7"/><Setter Property="Foreground" Value="#202536"/><Setter Property="FontWeight" Value="Medium"/></Trigger><Trigger Property="IsKeyboardFocused" Value="True"><Setter TargetName="item" Property="BorderBrush" Value="#4F55A7"/></Trigger></ControlTemplate.Triggers></ControlTemplate></Setter.Value></Setter>
  </Style>
  <Style TargetType="Expander"><Setter Property="Margin" Value="0,8,0,12"/><Setter Property="Padding" Value="0,8,0,0"/><Setter Property="HorizontalContentAlignment" Value="Stretch"/></Style>
</ResourceDictionary>
""";
}
