using System.Security.Cryptography;
using System.Text.Json;

namespace ChatQ.Windows;

public sealed record SavedHistoryAnalysis(bool LongHistory,int Maximum,int ReplyCount,string Question,string Coverage,ChatAnalysis Answer,List<string> Summaries,DateTime CreatedAt,string SourceHash)
{
    public static string Hash(ImportedThread thread,string self)
    {
        byte[] bytes=JsonSerializer.SerializeToUtf8Bytes(new{thread,self},Defaults.Json);
        try{return Convert.ToHexString(SHA256.HashData(bytes));}finally{CryptographicOperations.ZeroMemory(bytes);}
    }
    public List<HistoryEvidence> Evidence(ImportedThread thread,string self)
    {
        return LongHistory?HistoryPlan.Create(thread,self,Maximum).Evidence:ChatImport.Select(thread,self,Maximum).Rows!;
    }
    public void Validate(ImportedThread thread,string self)
    {
        if(Maximum is <1 or >HistoryPlan.MaxMessages || !LongHistory && Maximum>200 || ReplyCount is <1 or >10 || Question is null || Question.Length>500 || Coverage is null || Coverage.Length is <1 or >1000 || Answer is null || Summaries is null || Summaries.Count>HistoryPlan.MaxParts || Summaries.Any(s=>s is null || s.Length is <1 or >1600) || CreatedAt.Kind!=DateTimeKind.Utc || SourceHash!=Hash(thread,self))throw new InvalidOperationException("已存分析与资料不符或格式异常，未修改原数据。");
        var evidence=Evidence(thread,self);var slice=new AnalysisSlice("",evidence.Count,evidence.Count,0,0,self,Coverage,evidence.Select(e=>e.Id).ToList());
        if(Coverage!=(LongHistory?HistoryPlan.Create(thread,self,Maximum).Coverage:ChatImport.Select(thread,self,Maximum).Coverage))throw new InvalidOperationException("已存分析的范围与资料不符。");
        _=PersonalAi.ParseAnalysis(JsonSerializer.Serialize(Answer,new JsonSerializerOptions(Defaults.Json){PropertyNamingPolicy=JsonNamingPolicy.CamelCase}),slice,ReplyCount);
    }
}
