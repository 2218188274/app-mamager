using System.IO;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Data.Sqlite;

namespace ChatQ.Windows.Testing;

// Linked only into test projects; never included in the product.
public static class WechatDatabaseFixture
{
    public const string Peer="synthetic-peer'--",Group="synthetic-group@chatroom",Other="synthetic-other";
    public const long BaseTime=1793836800;
    public static string Table(string id)=>"Msg_"+Convert.ToHexString(MD5.HashData(Encoding.UTF8.GetBytes(id))).ToLowerInvariant();
    public static void Execute(string file,string sql)
    {
        using var db=new SqliteConnection(new SqliteConnectionStringBuilder{DataSource=file,Pooling=false}.ToString());db.Open();using var command=db.CreateCommand();command.CommandText=sql;command.ExecuteNonQuery();
    }
    public static string Create(string directory)
    {
        string root=Path.Combine(directory,"db_storage");foreach(string child in new[]{"session","contact","message"})Directory.CreateDirectory(Path.Combine(root,child));
        string session=Path.Combine(root,"session","session.db");Execute(session,"CREATE TABLE SessionTable(username TEXT,last_timestamp INTEGER);CREATE TABLE SessionNoContactInfoTable(username TEXT,session_title TEXT);");
        using(var db=new SqliteConnection(new SqliteConnectionStringBuilder{DataSource=session,Pooling=false}.ToString()))
        {
            db.Open();foreach(string id in new[]{Peer,Group,Other}){using var c=db.CreateCommand();c.CommandText="INSERT INTO SessionTable VALUES($id,$time)";c.Parameters.AddWithValue("$id",id);c.Parameters.AddWithValue("$time",BaseTime);c.ExecuteNonQuery();}
        }
        Execute(session,"INSERT INTO SessionNoContactInfoTable VALUES('"+Group+"','合成群聊');");
        Execute(Path.Combine(root,"contact","contact.db"),"CREATE TABLE contact(username TEXT,nick_name TEXT,remark TEXT);INSERT INTO contact VALUES('synthetic-peer''--','合成昵称','合成好友甲');");
        for(int shard=0;shard<2;shard++)
        {
            string path=Path.Combine(root,"message","message_"+shard+".db");Execute(path,"CREATE TABLE Name2Id(user_name TEXT);INSERT INTO Name2Id VALUES('wxid_synthetic_me'),('wxid_synthetic_peer');CREATE TABLE \""+Table(Peer)+"\"(local_id INTEGER,create_time INTEGER,local_type INTEGER,real_sender_id INTEGER,message_content);");
            using var db=new SqliteConnection(new SqliteConnectionStringBuilder{DataSource=path,Pooling=false}.ToString());db.Open();using var transaction=db.BeginTransaction();
            for(int n=1;n<=120;n++){using var c=db.CreateCommand();c.Transaction=transaction;c.CommandText="INSERT INTO \""+Table(Peer)+"\" VALUES($id,$time,1,$sender,$text)";c.Parameters.AddWithValue("$id",n);c.Parameters.AddWithValue("$time",BaseTime+n*2+shard);c.Parameters.AddWithValue("$sender",n%2+1);c.Parameters.AddWithValue("$text","合成消息 "+shard+" / "+n);c.ExecuteNonQuery();}transaction.Commit();
        }
        string first=Path.Combine(root,"message","message_0.db");Execute(first,"INSERT INTO \""+Table(Peer)+"\" VALUES(200,"+(BaseTime+1000)+",1,1,'标题:'||char(10)||'原文前后  '),(201,"+(BaseTime+1001)+",3,2,'DO_NOT_EXPORT_MEDIA'),(202,"+(BaseTime+1002)+",1,2,x'010203');CREATE TABLE \""+Table(Other)+"\"(unrelated_unsupported_field);INSERT INTO \""+Table(Other)+"\" VALUES('DO_NOT_READ_OTHER_CHAT');CREATE TABLE \""+Table(Group)+"\"(local_id,create_time,local_type,real_sender_id,message_content);INSERT INTO \""+Table(Group)+"\" VALUES(1,"+BaseTime+",1,2,'wxid_synthetic_peer:'||char(10)||'合成群消息');");return root;
    }
}
