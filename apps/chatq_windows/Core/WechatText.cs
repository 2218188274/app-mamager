using System.Text;
using System.Buffers;
using ZstdSharp;
using ZstdSharp.Unsafe;

namespace ChatQ.Windows;

public sealed record WechatTextResult(string? Text,bool Compressed=false,bool TooLarge=false);

/// <summary>Bounded text decoding only; never decrypts a database or reads an attachment.</summary>
public static class WechatText
{
    public const int MaxEncodedBytes=131072,MaxDecodedBytes=80000,MaxChars=20000;
    private static bool Frame(object? value)=>value is byte[] b && b.AsSpan().StartsWith(new byte[]{0x28,0xb5,0x2f,0xfd});
    public static WechatTextResult Decode(object? primary,object? secondary=null,bool primaryOmitted=false,bool secondaryOmitted=false,CancellationToken token=default)
    {
        token.ThrowIfCancellationRequested();bool frame=false;
        foreach(object? value in new[]{primary,secondary})
        {
            if(!Frame(value))continue;frame=true;var bytes=(byte[])value!;
            if(bytes.Length>MaxEncodedBytes)return new(null,true,true);
            try
            {
                using var decoder=new Decompressor();byte[] destination=ArrayPool<byte>.Shared.Rent(MaxDecodedBytes+1);
                try{int length=decoder.Unwrap(bytes,destination.AsSpan(0,MaxDecodedBytes+1));token.ThrowIfCancellationRequested();if(length>MaxDecodedBytes)return new(null,true,true);var result=Utf8(destination.AsSpan(0,length),true);if(result.Text is not null || result.TooLarge)return result;}
                finally{ArrayPool<byte>.Shared.Return(destination,true);}
            }
            catch(ZstdException e){if(e.Code==ZSTD_ErrorCode.ZSTD_error_dstSize_tooSmall)return new(null,true,true);}
        }
        // Never turn a malformed known compressed frame into a misleading plaintext placeholder.
        if(frame)return new(null);
        foreach(object? value in new[]{secondary,primary})
        {
            WechatTextResult result;
            if(value is string text)result=Text(text,false);
            else if(value is byte[] bytes){if(bytes.Length>MaxEncodedBytes)return new(null,false,true);result=Utf8(bytes,false);}
            else continue;
            if(result.Text is not null || result.TooLarge)return result;
        }
        return new(null,false,primaryOmitted||secondaryOmitted);
    }
    private static WechatTextResult Utf8(ReadOnlySpan<byte> bytes,bool compressed)
    {
        if(bytes.Length>MaxDecodedBytes)return new(null,compressed,true);
        try{return Text(new UTF8Encoding(false,true).GetString(bytes),compressed);}catch(DecoderFallbackException){return new(null);}
    }
    private static WechatTextResult Text(string text,bool compressed)
    {
        if(text.Length>MaxChars)return new(null,compressed,true);
        if(string.IsNullOrWhiteSpace(text)||!HubStore.Small(text,MaxChars))return new(null);
        return new(text,compressed);
    }
}
