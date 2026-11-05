using System.Text;
using Microsoft.Data.Sqlite;
using ZstdSharp;
using ZstdSharp.Unsafe;
using ChatQ.Windows.Testing;

namespace ChatQ.Windows;

public static class WechatTextChecks
{
    private static byte[] Compress(string text,bool size=true){using var compressor=new Compressor();if(!size)compressor.SetParameter(ZSTD_cParameter.ZSTD_c_contentSizeFlag,0);return compressor.Wrap(Encoding.UTF8.GetBytes(text)).ToArray();}
    public static void Run(Action<bool,string> check,string root)
    {
        string text="  合成压缩文字👋\r\n第二行 &lt;原文&gt;  ";
        foreach(bool size in new[]{true,false}){var decoded=WechatText.Decode(Compress(text,size));check(decoded.Text==text && decoded.Compressed && !decoded.TooLarge,"bounded Zstd roundtrip with "+(size?"known":"unknown")+" frame length preserves exact UTF8 text");}
        check(WechatText.Decode("[文本]",Compress(text)).Text==text,"compressed secondary field preferred over plaintext placeholder");
        check(WechatText.Decode(Encoding.UTF8.GetBytes(text)).Text==text,"plain UTF8 BLOB text supported without replacement characters");
        foreach(byte[] invalid in new byte[][]{[1,2,3],[255,254],[0x28,0xb5,0x2f,0xfd,0]})check(WechatText.Decode(invalid).Text is null,"unknown malformed or invalid UTF8 data remains unsupported");
        check(WechatText.Decode(Compress(new string('x',WechatText.MaxDecodedBytes+1000))).TooLarge,"compressed oversized output rejected using fixed destination");
        check(WechatText.Decode(Compress(new string('字',20001))).TooLarge,"character bound enforced after decompression");
        check(WechatText.Decode(null,null,true).TooLarge,"SQL-omitted oversized content never becomes a blank success");
        using(var cancelled=new CancellationTokenSource()){cancelled.Cancel();bool stopped=false;try{WechatText.Decode(Compress(text),token:cancelled.Token);}catch(OperationCanceledException){stopped=true;}check(stopped,"decode cancellation before work");}
        string snapshot=WechatDatabaseFixture.Create(Path.Combine(root,"codec-snapshot"));string file=Path.Combine(snapshot,"message","message_0.db"),table=WechatDatabaseFixture.Table(WechatDatabaseFixture.Peer);
        WechatDatabaseFixture.Execute(file,"ALTER TABLE \""+table+"\" ADD COLUMN compress_content;");
        using(var db=new SqliteConnection(new SqliteConnectionStringBuilder{DataSource=file,Pooling=false}.ToString()))
        {
            db.Open();using var command=db.CreateCommand();command.CommandText="INSERT INTO \""+table+"\"(local_id,create_time,local_type,real_sender_id,message_content,compress_content) VALUES(900,1793839000,4294967297,1,'[文本]',$content)";command.Parameters.AddWithValue("$content",Compress(text));command.ExecuteNonQuery();
        }
        var catalog=WechatDatabase.Open(snapshot);var peer=catalog.Sessions.Single(s=>s.Id==WechatDatabaseFixture.Peer);var read=WechatDatabase.Read(catalog,peer,new(200,null,null));
        check(read.Thread.Lines.Count==200 && read.Thread.Lines[^1].Text==text && read.Decompressed==1 && read.Inspected==201 && read.UnsupportedText==1,"global newest readable200 fills around unsupported records and restores compound-type compressed text");
        var back=ChatImport.Load(ChatFileExport.Create(read.Thread,"json",50000).Bytes,"roundtrip.json");check(back.Threads[0].Lines.SequenceEqual(read.Thread.Lines),"decoded snapshot export and JSON import exact roundtrip");
        // More than one metadata page of malformed rows must not shrink a requested200 to zero.
        WechatDatabaseFixture.Execute(file,"WITH RECURSIVE n(i) AS (SELECT 1000 UNION ALL SELECT i+1 FROM n WHERE i<1249) INSERT INTO \""+table+"\"(local_id,create_time,local_type,real_sender_id,message_content) SELECT i,1793840000+i,1,1,x'0102' FROM n;");
        catalog=WechatDatabase.Open(snapshot);peer=catalog.Sessions.Single(s=>s.Id==WechatDatabaseFixture.Peer);read=WechatDatabase.Read(catalog,peer,new(200,null,null));check(read.Thread.Lines.Count==200 && read.UnsupportedText==251 && read.Inspected==451,"cursor paging continues past250 unreadable newer rows with truthful inspected counts");
        WechatDatabaseFixture.Execute(file,"INSERT INTO \""+table+"\"(local_id,create_time,local_type,real_sender_id,message_content) VALUES(999,0,1,1,'未知时间原文');");catalog=WechatDatabase.Open(snapshot);peer=catalog.Sessions.Single(s=>s.Id==WechatDatabaseFixture.Peer);check(WechatDatabase.Read(catalog,peer,new(50000,null,null)).Thread.Lines[0].Time=="","zero source timestamp remains unknown rather than fabricating1970");
        WechatDatabaseFixture.Execute(file,"ALTER TABLE \""+table+"\" ADD COLUMN sort_seq INTEGER;INSERT INTO \""+table+"\"(local_id,create_time,local_type,real_sender_id,message_content,sort_seq) VALUES(1300,1793845000,1,1,'同秒后发',20),(1301,1793845000,1,1,'同秒先发',10);");catalog=WechatDatabase.Open(snapshot);peer=catalog.Sessions.Single(s=>s.Id==WechatDatabaseFixture.Peer);check(WechatDatabase.Read(catalog,peer,new(200,null,null)).Thread.Lines.TakeLast(2).Select(l=>l.Text).SequenceEqual(new[]{"同秒先发","同秒后发"}),"source sort sequence preserves same-second order instead of reversing conversation context");
    }
}
