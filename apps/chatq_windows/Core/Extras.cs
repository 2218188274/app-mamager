using System.Buffers.Binary;
using System.Text.Json;

namespace ChatQ.Windows;

public static class HistoryPolicy
{
    public static List<SavedReply> Add(UserState state,IEnumerable<string> replies,string source,string mode,string persona)
    {
        var items=replies.Select(text=>new SavedReply(Guid.NewGuid().ToString("N"),text,source,mode,persona,DateTime.UtcNow)).ToList();
        while(state.ReplyHistory.Count+items.Count>100)
        {
            var oldest=state.ReplyHistory.Where(x=>!x.Favorite).MinBy(x=>x.CreatedAt);
            if(oldest is null)throw new InvalidOperationException("收藏记录已满，请先整理记录；本次回复仍可复制。");state.ReplyHistory.Remove(oldest);
        }
        state.ReplyHistory.AddRange(items);return items;
    }
}
public sealed record DesktopUpdate(string Version,string Url,string Sha256,string Notes);
public static class UpdateFeed
{
    public const string Address="https://lt.youling.lol/downloads/chatq-windows-latest.json";
    public static DesktopUpdate Parse(string json)
    {
        if(json.Length>20000)throw new InvalidOperationException("更新信息过大。");
        try
        {
            var item=JsonSerializer.Deserialize<DesktopUpdate>(json,Defaults.Json)??throw new InvalidOperationException();
            if(item.Version is null || item.Version.Length>20 || !System.Version.TryParse(item.Version,out var version) || version.Build<0 || version.Revision>=0 || item.Url!="https://lt.youling.lol/downloads/ChatQ-Windows-"+item.Version+"-x64-Setup.exe" || item.Sha256 is null || item.Sha256.Length!=64 || item.Sha256.Any(c=>!Uri.IsHexDigit(c)) || item.Notes is null || item.Notes.Length>3000)throw new InvalidOperationException();
            return item;
        }
        catch(Exception e) when(e is JsonException or InvalidOperationException) {throw new InvalidOperationException("更新信息暂不可用，请稍后重试。");}
    }
}
public static class ImageHeader
{
    public static (int Width,int Height) Dimensions(byte[] bytes)
    {
        if(bytes.Length<24 || bytes.Length>8_000_000)throw new InvalidOperationException("请选择8MB以内的PNG或JPEG。");
        int w=0,h=0;
        if(bytes.AsSpan(0,8).SequenceEqual(new byte[]{137,80,78,71,13,10,26,10}) && bytes.AsSpan(12,4).SequenceEqual("IHDR"u8))
        {w=BinaryPrimitives.ReadInt32BigEndian(bytes.AsSpan(16));h=BinaryPrimitives.ReadInt32BigEndian(bytes.AsSpan(20));}
        else if(bytes[0]==255 && bytes[1]==216)
        {
            int p=2;while(p+4<=bytes.Length)
            {
                if(bytes[p++]!=255)break;while(p<bytes.Length && bytes[p]==255)p++;if(p>=bytes.Length)break;byte marker=bytes[p++];if(marker is 0xD9 or 0xDA)break;if(marker is 0xD8 or 0x01 || marker>=0xD0 && marker<=0xD7)continue;
                if(p+2>bytes.Length)break;int size=BinaryPrimitives.ReadUInt16BigEndian(bytes.AsSpan(p));if(size<2 || p+size>bytes.Length)break;
                if(marker is 0xC0 or 0xC1 or 0xC2 or 0xC3 or 0xC5 or 0xC6 or 0xC7 or 0xC9 or 0xCA or 0xCB or 0xCD or 0xCE or 0xCF){if(size<7)break;h=BinaryPrimitives.ReadUInt16BigEndian(bytes.AsSpan(p+3));w=BinaryPrimitives.ReadUInt16BigEndian(bytes.AsSpan(p+5));break;}p+=size;
            }
        }
        if(w<4 || h<4 || w>16384 || h>16384 || (long)w*h>16_000_000)throw new InvalidOperationException("图片尺寸异常或超过1600万像素，请先裁剪后再导入。");return(w,h);
    }
}
