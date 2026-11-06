using System.Windows;
using System.Windows.Controls;

namespace ChatQ.Windows;

public sealed partial class MainWindow
{
    private async Task SaveCurrentHistoryAnalysis()
    {
        var archive=importedHistory;var answer=historyAnalysis;string? id=loadedLibraryId;
        if(archive is null || answer is null || id is null)throw new InvalidOperationException("请先将当前会话保存到资料库，再保存分析。");
        var thread=archive.Threads[importedThread];string self=analysisSelf;
        var record=new SavedHistoryAnalysis(analysisPlan is not null,analysisPlan is null?analysisRange:longRange,analysisReplyCount,analysisQuestion,analysisPlan?.Coverage??analysisSlice!.Coverage,answer,historyJob is{Finished:true}?historyJob.Summaries.ToList():[],DateTime.UtcNow,SavedHistoryAnalysis.Hash(thread,self));
        await Operate(async(token,view,revision)=>
        {
            var saved=await Task.Run(()=>Library.SaveAnalysis(id,loadedLibraryUpdated,record,token),token);Guard(token,view,revision);loadedLibraryUpdated=saved.UpdatedAt;
            SetStatus("已加密保存本次分析到对应资料，下次可直接查看。每份资料保留最近一次主动保存的分析；未调用AI。");
        });
    }
    private Window BuildSavedHistoryDialog(LibraryChat item)
    {
        var report=item.Analysis??throw new InvalidOperationException("此资料没有已存分析。");report.Validate(item.Thread,item.Self);
        var dialog=Dialog("查看已存分析",710,740);var form=Stack();form.Margin=new(20);form.Children.Add(Text(item.Name,19,true));
        form.Children.Add(Text($"历史分析 · 保存于{report.CreatedAt.ToLocalTime():yyyy-MM-dd HH:mm} · 本地查看，不重新生成。",13));form.Children.Add(Text(report.Coverage,13));
        if(report.Question.Length>0){form.Children.Add(Text("当时的关注点",15,true));form.Children.Add(Text(report.Question));}
        form.Children.Add(Text("聊天总结",18,true));form.Children.Add(Text(report.Answer.Summary));var evidence=report.Evidence(item.Thread,item.Self).ToDictionary(e=>e.Id);
        foreach(var observation in report.Answer.Observations)
        {
            form.Children.Add(Text(observation.Point,15,true));form.Children.Add(Text(observation.Confidence+" · "+string.Join("、",observation.Evidence),13));var rows=Stack();
            foreach(string id in observation.Evidence){var row=evidence[id];rows.Children.Add(Text(id+" · "+row.Time+" · "+row.Speaker,13,true));rows.Children.Add(Text(row.Text));}
            form.Children.Add(new Expander{Header="核对这条观察的消息依据",Content=rows});
        }
        foreach(var group in new[]{("下一步",report.Answer.NextSteps),("话题",report.Answer.Topics),("回复建议",report.Answer.Replies)})
        {form.Children.Add(Text(group.Item1,17,true));foreach(string text in group.Item2)form.Children.Add(Text(text));}
        if(report.Summaries.Count>0){var parts=Stack();for(int i=0;i<report.Summaries.Count;i++){parts.Children.Add(Text("第"+(i+1)+"段",14,true));parts.Children.Add(Text(report.Summaries[i]));}form.Children.Add(new Expander{Header="当时的分段摘要",Content=parts});}
        form.Children.Add(Text("这是已保存的历史建议，仅对应当时选定的范围；当前关系和情况可能变化。不会自动调用模型或发送消息。",12));dialog.Content=Scroll(form);return dialog;
    }
}
