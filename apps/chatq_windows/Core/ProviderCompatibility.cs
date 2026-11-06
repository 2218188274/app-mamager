using System.Text.Json;

namespace ChatQ.Windows;

public static class ProviderCompatibility
{
    public const string MinimaxAddress="https://api.minimax.cn/v1",MinimaxModel="MiniMax-M3.1-Flash";
    public static bool IsMinimax(ApiProfile profile)=>Uri.TryCreate(profile.BaseUrl,UriKind.Absolute,out var uri)&&uri.Scheme=="https"&&uri.IsDefaultPort&&uri.UserInfo.Length==0&&uri.Query.Length==0&&uri.Fragment.Length==0&&uri.AbsolutePath.TrimEnd('/')=="/v1"&&uri.Host is "api.minimax.cn" or "api.minimaxi.com" or "api.minimax.io";
    public static string ChatBody(ApiProfile profile,object messages,bool stream)
    {
        var body=new Dictionary<string,object>{{"model",profile.Model},{"stream",stream},{"messages",messages}};
        if(IsMinimax(profile)&&profile.Model.Equals(MinimaxModel,StringComparison.OrdinalIgnoreCase))
        {body["reasoning_split"]=true;body["reasoning_effort"]="low";body["max_completion_tokens"]=16384;}
        return JsonSerializer.Serialize(body);
    }
    public static void CheckBody(JsonElement root)
    {
        if(root.ValueKind!=JsonValueKind.Object)throw new InvalidOperationException("供应商响应格式异常，请检查接口地址。");
        int? code=null;bool error=false;
        if(root.TryGetProperty("base_resp",out var basic)&&basic.ValueKind==JsonValueKind.Object&&basic.TryGetProperty("status_code",out var n)&&n.ValueKind==JsonValueKind.Number&&n.TryGetInt32(out int value)&&value!=0){code=value;error=true;}
        if(root.TryGetProperty("error",out var item)&&item.ValueKind!=JsonValueKind.Null)
        {
            error=true;if(item.ValueKind==JsonValueKind.Object&&item.TryGetProperty("code",out var number))
            {if(number.ValueKind==JsonValueKind.Number&&number.TryGetInt32(out int numeric))code=numeric;else if(number.ValueKind==JsonValueKind.String&&int.TryParse(number.GetString(),out numeric))code=numeric;}
        }
        if(error)throw new InvalidOperationException(Error(code));
    }
    public static string Error(int? code)=>code switch
    {
        1004 or 2049=>"MiniMax密钥无效或未授权。订阅Key与按量Key不通用，请核对获取位置和接口地址。",
        1008=>"MiniMax按量账户余额不足，请核对当前使用的Key类型。",
        2053 or 2067=>"MiniMax套餐额度或积分不足。请到供应商平台查看用量，软件不会自动重试。",
        2056=>"MiniMax当前M Plan资源额度受限，请等待额度窗口恢复后手动重试。",
        1002 or 1041 or 1045 or 2045 or 2046 or 2047 or 2062=>"MiniMax请求频率或并发受限，请降低频率并检查套餐用量后手动重试。",
        2022 or 2061 or 2068=>"当前MiniMax套餐没有此模型权限，请核对模型名称和套餐支持范围。",
        2057=>"该MiniMax接口需要M Plan订阅Key，请勿混用按量计费Key。",
        1039 or 2013 or 2014=>"MiniMax请求参数不受支持，请核对模型名称与软件版本；M3.1 Flash不能关闭思考。",
        1026 or 1027=>"MiniMax未接受本次内容，请调整输入后手动重试。",
        2069=>"MiniMax模型已下线，请在供应商平台核对新的模型名称。",
        _=>"供应商返回了错误，未生成有效回复。请检查当前接口、模型权限或供应商用量；软件不会自动重试。"
    };
}
