using System.IO;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Media;
using ChatQ.Windows;

internal static partial class Program
{
    private static void PolishChecks(string directory)
    {
        var actions = new WrapPanel();
        var action = new Button { Content = "打开 Windows 语言和键盘设置", FontSize = 28 };
        actions.Children.Add(action); Layout(actions, 260, 220);
        Check(action.ActualHeight >= 80, "long action label wraps completely at large text instead of clipping");
        Check(action.ActualWidth <= 260, "wrapped action remains inside narrow parent");

        var window = new MainWindow(new Vault(Path.Combine(directory, "polish")), 2);
        var root = (FrameworkElement)window.Content; Layout(root, 640, 440);
        var selectedMode=Children<Button>(root).Single(b=>Equals(b.Content,"帮回复"));
        Check(PaletteContrast(((SolidColorBrush)selectedMode.Foreground).Color,((SolidColorBrush)selectedMode.Background).Color)>=4.5,"selected mode keeps readable text on its selected surface");
        Check(PaletteContrast(((SolidColorBrush)selectedMode.BorderBrush).Color,Colors.White)>=3,"selected mode boundary remains distinct on white");
        var editor=Children<TextBox>(root).First();
        Check(PaletteContrast(((SolidColorBrush)editor.BorderBrush).Color,Colors.White)>=3,"input field boundary remains identifiable before focus");
        var nav = Children<ListBox>(root).Single(x => AutomationProperties.GetName(x) == "功能导航");
        nav.SelectedItem = "数据与更新"; Layout(root, 640, 440);
        var notice = Children<TextBlock>(root).Single(x => AutomationProperties.GetName(x) == "操作提示");
        Check(!notice.Text.Contains("我的 API"), "local data tools do not display an unrelated missing-API instruction");
        nav.SelectedItem = "人设中心"; Layout(root, 640, 660);
        var largeCards=Children<WrapPanel>(root).Single(x=>AutomationProperties.GetName(x)=="人设卡片列表");
        var largeFrames=largeCards.Children.OfType<Border>().Take(2).ToArray();
        Check(largeFrames.Length==2&&largeFrames[1].TranslatePoint(new Point(),largeCards).Y>largeFrames[0].TranslatePoint(new Point(),largeCards).Y,"large-text persona cards retain a single readable column");
        nav.SelectedItem = "回复助手"; Layout(root, 640, 440);
        Check(notice.Text.Contains("我的 API"), "generation still explains missing API configuration");
        nav.SelectedItem = "微信导出"; Layout(root, 640, 440);
        Check(notice.Text.Contains("不需要API"), "local export retains its own API-free guidance");
        Check(!window.IsVisible, "polish regression never opens a user window"); window.Close();
        var wideWindow=new MainWindow(new Vault(Path.Combine(directory,"polish-wide")),1);
        var wideRoot=(FrameworkElement)wideWindow.Content;Layout(wideRoot,1200,780);
        Children<ListBox>(wideRoot).Single(x=>AutomationProperties.GetName(x)=="功能导航").SelectedItem="人设中心";Layout(wideRoot,1200,780);
        var cards=Children<WrapPanel>(wideRoot).Single(x=>AutomationProperties.GetName(x)=="人设卡片列表");
        var frames=cards.Children.OfType<Border>().Take(2).ToArray();
        var first=frames[0].TranslatePoint(new Point(),cards);var second=frames[1].TranslatePoint(new Point(),cards);
        Check(Math.Abs(first.Y-second.Y)<1,"wide persona cards do not fall to a new row from fractional layout rounding");
        Check(second.X>=first.X+frames[0].ActualWidth+15,"persona grid keeps its readable column gutter");
        wideWindow.Close();
    }
    private static double PaletteContrast(Color a,Color b)
    {
        static double Linear(byte value){double c=value/255.0;return c<=.04045?c/12.92:Math.Pow((c+.055)/1.055,2.4);}
        static double Light(Color c)=>Linear(c.R)*.2126+Linear(c.G)*.7152+Linear(c.B)*.0722;
        double x=Light(a),y=Light(b);return (Math.Max(x,y)+.05)/(Math.Min(x,y)+.05);
    }
}
