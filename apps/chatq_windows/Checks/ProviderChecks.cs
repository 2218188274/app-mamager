using System.Net;
using System.Text;
using System.Text.Json;
using ChatQ.Windows;

internal static class ProviderChecks
{
    private sealed class Handler(Func<HttpRequestMessage,HttpResponseMessage> response):HttpMessageHandler
    {protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken token){token.ThrowIfCancellationRequested();return Task.FromResult(response(request));}}
    public static async Task Run(Action<bool,string> check)
    {
        var profile=new ApiProfile("synthetic","MiniMax",ProviderCompatibility.MinimaxAddress,ProviderCompatibility.MinimaxModel,"synthetic-test-key");
        using(var body=JsonDocument.Parse(ProviderCompatibility.ChatBody(profile,new[]{new{role="user",content="合成问题"}},false)))
        {var b=body.RootElement;check(b.GetProperty("reasoning_effort").GetString()=="low"&&b.GetProperty("reasoning_split").GetBoolean()&&b.GetProperty("max_completion_tokens").GetInt32()==16384,"MiniMax Flash uses separated low reasoning and bounded completion budget");check(!b.TryGetProperty("thinking",out _)&&!b.TryGetProperty("service_tier",out _),"Flash never disables required reasoning or opts into priority billing");}
        foreach(string url in new[]{"https://example.invalid/v1","https://api.minimax.cn.attacker.invalid/v1","https://api.minimax.cn:9443/v1","https://api.minimax.cn/anthropic"})
        {using var json=JsonDocument.Parse(ProviderCompatibility.ChatBody(profile with{BaseUrl=url},Array.Empty<object>(),true));check(!json.RootElement.TryGetProperty("reasoning_effort",out _),"provider-specific options do not affect lookalike hosts or other protocols");}
        foreach(string model in new[]{"MiniMax-M3","MiniMax-M3.10-Flash","other-model"})
        {using var json=JsonDocument.Parse(ProviderCompatibility.ChatBody(profile with{Model=model},Array.Empty<object>(),false));check(!json.RootElement.TryGetProperty("reasoning_effort",out _),"only the exact Flash model receives compatibility options");}
        int calls=0;
        using(var client=new PersonalAi(new Handler(request=>{calls++;check(request.Headers.Authorization?.Parameter=="synthetic-test-key"&&request.RequestUri!.AbsoluteUri==ProviderCompatibility.MinimaxAddress+"/chat/completions","profile key remains restricted to requested provider endpoint");return new(HttpStatusCode.OK){Content=new StringContent("{\"base_resp\":{\"status_code\":2056,\"status_msg\":\"synthetic-test-key must not escape\"}}")};})))
        {bool rejected=false;try{await client.Complete(profile,[new("user","synthetic")],false,null,CancellationToken.None);}catch(InvalidOperationException e){rejected=e.Message.Contains("资源额度")&&!e.Message.Contains("synthetic-test-key");}check(rejected&&calls==1,"HTTP200 provider errors give safe actionable notice without retry");}
        using(var client=new PersonalAi(new Handler(_=>new(HttpStatusCode.BadRequest){Content=new StringContent("{\"error\":{\"code\":2013,\"message\":\"synthetic-test-key\"}}",Encoding.UTF8,"application/json")})))
        {bool rejected=false;try{await client.Complete(profile,[new("user","synthetic")],false,null,CancellationToken.None);}catch(InvalidOperationException e){rejected=e.Message.Contains("参数")&&!e.Message.Contains("synthetic-test-key");}check(rejected,"HTTP400 MiniMax error code is interpreted without reflecting provider text");}
        using(var client=new PersonalAi(new Handler(_=>new(HttpStatusCode.OK){Content=new StringContent("{\"base_resp\":{\"status_code\":0},\"choices\":[{\"finish_reason\":\"stop\",\"message\":{\"reasoning_content\":\"never display this synthetic reasoning\",\"content\":\"合成回答\"}}]}",Encoding.UTF8,"application/json")})))
        {check(await client.Complete(profile,[new("user","synthetic")],false,null,CancellationToken.None)=="合成回答","MiniMax final answer excludes reasoning_content");}
        var stream=new EventStream();bool stopped=false;try{stream.Feed(Encoding.UTF8.GetBytes("data: {\"base_resp\":{\"status_code\":2067,\"status_msg\":\"synthetic-test-key\"}}\n\n"));}catch(InvalidOperationException e){stopped=e.Message.Contains("积分")&&!e.Message.Contains("synthetic-test-key");}check(stopped,"stream provider error is safe and never treated as a successful completion");
    }
}
