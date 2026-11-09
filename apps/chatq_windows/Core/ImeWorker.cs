using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text;

namespace ChatQ.Windows;

// Private inherited pipes only. No window, clipboard, chat context or persisted prompt.
public static class ImeWorker
{
    public const uint Magic = 0x31495143;
    private static readonly Encoding Unicode = new UnicodeEncoding(false, false, true);
    private static async Task<uint> Number(Stream input,CancellationToken token)
    { byte[] bytes=new byte[4];await input.ReadExactlyAsync(bytes,token);return BinaryPrimitives.ReadUInt32LittleEndian(bytes); }
    private static async Task<string> Text(Stream input,int limit,CancellationToken token)
    {
        uint length=await Number(input,token);if(length>limit)throw new InvalidDataException();
        byte[] bytes=new byte[length*2];await input.ReadExactlyAsync(bytes,token);try{return Unicode.GetString(bytes);}finally{CryptographicOperations.ZeroMemory(bytes);}
    }
    private static void Number(Stream output,uint value){Span<byte> bytes=stackalloc byte[4];BinaryPrimitives.WriteUInt32LittleEndian(bytes,value);output.Write(bytes);}
    private static void Text(Stream output,string text){Number(output,(uint)text.Length);byte[] bytes=Unicode.GetBytes(text);try{output.Write(bytes);}finally{CryptographicOperations.ZeroMemory(bytes);}}
    public static async Task<int> Run(Stream input,Stream output,Vault vault,PersonalAi ai,CancellationToken lifetime=default)
    {
        using var timeout=CancellationTokenSource.CreateLinkedTokenSource(lifetime);timeout.CancelAfter(TimeSpan.FromSeconds(90));
        uint status=2;string caption="生成未完成，请手动重试或检查API。",revision="";List<string> replies=[];
        try
        {
            if(await Number(input,timeout.Token)!=Magic)throw new InvalidDataException();
            uint mode=await Number(input,timeout.Token);if(mode>2)throw new InvalidDataException();
            string prompt=await Text(input,1000,timeout.Token);
            if(prompt.Length==0||prompt.Any(c=>char.IsControl(c)&&c is not ('\r' or '\n' or '\t')))throw new InvalidDataException();
            var state=vault.Read();revision=state.ConfigurationRevision;
            if(mode==2){status=prompt==revision?0u:4u;caption=status==0?"配置已核对":"配置已变更，请重新生成。";}
            else if(state.ActiveProfile is null){status=1;caption="请先在主应用的“我的 API”保存并启用配置。";}
            else
            {
                using var request=CancellationTokenSource.CreateLinkedTokenSource(timeout.Token);
                var generation=ai.Replies(state,prompt,mode==1?"polish":"reply",request.Token);
                bool stale=false;
                try
                {
                    while(!generation.IsCompleted)
                    {
                        await Task.WhenAny(generation,Task.Delay(100,timeout.Token));timeout.Token.ThrowIfCancellationRequested();
                        if(vault.Read().ConfigurationRevision!=revision){stale=true;request.Cancel();break;}
                    }
                    replies=await generation;
                    if(stale||vault.Read().ConfigurationRevision!=revision){status=4;caption="配置已变更，请重新生成。";replies=[];}
                    else
                    {
                        if(replies.Any(x=>x.Contains(state.ActiveProfile.Key,StringComparison.Ordinal)||x.Any(c=>char.IsControl(c)&&c is not ('\r' or '\n' or '\t'))))throw new InvalidDataException();
                        caption=(state.ActivePersona?.Name??"当前人设")+" · "+replies.Count+"条";status=0;
                    }
                }
                catch(OperationCanceledException) when(stale){status=4;caption="配置已变更，请重新生成。";replies=[];}
                finally{request.Cancel();}
            }
        }
        catch(OperationCanceledException){status=3;caption="已停止，请手动重试。";replies=[];}
        catch(Exception e) when(e is IOException or InvalidDataException or InvalidOperationException or HttpRequestException or CryptographicException or System.Text.Json.JsonException or DecoderFallbackException)
        {status=2;caption="生成未完成，请检查API配置和网络后手动重试。";replies=[];}
        Number(output,Magic);Number(output,status);Number(output,(uint)replies.Count);Text(output,revision);Text(output,caption);foreach(string reply in replies)Text(output,reply);
        await output.FlushAsync();return status==0?0:1;
    }
}
