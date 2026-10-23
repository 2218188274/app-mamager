package com.chatq.keyboardtests;
import android.content.*;import android.database.sqlite.*;import java.io.*;import java.lang.reflect.*;import org.json.*;

final class ConversationChecks {
 static int checks=0;static void expect(boolean b,String label){if(!b)throw new AssertionError(label);checks++;}
 static void reject(Method m,Object o,Object...a)throws Exception{try{m.invoke(o,a);throw new AssertionError("expected rejection");}catch(InvocationTargetException e){checks++;}}
 static JSONObject chat(String id)throws Exception{return new JSONObject().put("id",id).put("title","测试对话").put("createdAt",1700000000000L).put("updatedAt",1700000000100L).put("personaId","daily").put("background","背景").put("useContext",true).put("contextStart",0).put("draft","草稿").put("turns",new JSONArray().put(new JSONObject().put("id","turn1").put("question","第一问").put("answer","第一答").put("at",1700000000001L).put("personaName","测试人设")));}
 static int run(Context original)throws Exception{
  final File dir=new File(original.getCacheDir(),"chatq-conversation-tests");dir.mkdirs();final SharedPreferences prefs=original.getSharedPreferences("chatq_conversation_tests",0);prefs.edit().clear().commit();
  Context context=new ContextWrapper(original){public SharedPreferences getSharedPreferences(String n,int mode){return prefs;}public File getDatabasePath(String n){return new File(dir,n);}public File getCacheDir(){return dir;}};
  File file=context.getDatabasePath("chatq-generations.db");SQLiteDatabase.deleteDatabase(file);
  SQLiteDatabase old=SQLiteDatabase.openOrCreateDatabase(file,null);old.execSQL("CREATE TABLE records(id INTEGER PRIMARY KEY AUTOINCREMENT,uid TEXT UNIQUE NOT NULL,source TEXT NOT NULL,kind TEXT NOT NULL,prompt TEXT NOT NULL,replies TEXT NOT NULL,created INTEGER NOT NULL)");old.execSQL("CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)");old.execSQL("INSERT INTO records(uid,source,kind,prompt,replies,created) VALUES('old','app','reply','旧记录','[\"旧回答\"]',1700000000000)");old.setVersion(1);old.close();
  Class<?> t=original.getClassLoader().loadClass("expo.modules.chatqkeyboard.GenerationStore");Object store=t.getConstructor(Context.class).newInstance(context);Method save=t.getMethod("saveChat",String.class),get=t.getMethod("getChat",String.class),list=t.getMethod("listChats"),exp=t.getMethod("export"),restore=t.getMethod("restore",JSONObject.class),clear=t.getMethod("clear"),set=t.getMethod("setEnabled",boolean.class),del=t.getMethod("deleteChat",String.class);
  try{
   expect(((JSONArray)t.getMethod("list",String.class,boolean.class).invoke(store,"旧记录",false)).length()==1,"v1 database upgrades without losing shared records");expect(new JSONArray((String)list.invoke(store)).length()==0,"upgrade creates empty chat table");
   JSONObject first=chat("chat-test");expect((Boolean)save.invoke(store,first.toString()),"native chat save succeeds");expect(new JSONObject((String)get.invoke(store,"chat-test")).getJSONArray("turns").getJSONObject(0).getString("answer").equals("第一答"),"round trip preserves messages and settings");
   Method search=t.getMethod("searchChats",String.class);
   for(String query:new String[]{"第一答","第一问","测试对话","草稿","背景","测试人设"})expect(new JSONArray((String)search.invoke(store,query)).length()==1,"search full session field: "+query);
   expect(new JSONArray((String)search.invoke(store,"%_'")).length()==0,"search SQL wildcard and quote are literal");
   expect(new JSONArray((String)search.invoke(store," 第一答 ")).getJSONObject(0).getString("snippet").contains("第一答"),"search trims and returns matching answer preview");
   clear.invoke(store);expect(new JSONArray((String)list.invoke(store)).length()==1,"clearing reply records does not delete chats");
   JSONObject stale=chat("chat-test").put("updatedAt",1700000000002L).put("draft","过时");save.invoke(store,stale.toString());expect(!new JSONObject((String)get.invoke(store,"chat-test")).getString("draft").equals("过时"),"stale queued revision cannot overwrite newer draft");
   set.invoke(store,false);expect(!(Boolean)save.invoke(store,chat("disabled").toString()),"record saving switch also controls conversations");set.invoke(store,true);
   JSONObject malformed=chat("bad").put("extra",true);reject(save,store,malformed.toString());expect(new JSONArray((String)list.invoke(store)).length()==1,"invalid chat leaves existing data intact");
   JSONObject backup=(JSONObject)exp.invoke(store);expect(backup.getInt("version")==2&&backup.getJSONArray("chats").length()==1,"v2 backup includes complete chats");expect((Integer)restore.invoke(store,backup)==0,"same chat restore is deduplicated");
   JSONObject conflict=new JSONObject(backup.toString());conflict.getJSONArray("chats").getJSONObject(0).put("draft","另一设备草稿");expect((Integer)restore.invoke(store,conflict)==1,"conflicting same-ID chat preserved as separate copy");expect((Integer)restore.invoke(store,conflict)==0,"repeat conflict restore creates no additional copies");
   JSONObject card=new JSONObject().put("id","daily").put("name","原人设").put("instructions","本机").put("length","short").put("tagWeights",new JSONObject());JSONObject persona=new JSONObject().put("version",1).put("cards",new JSONArray().put(card)).put("scenes",new JSONArray()).put("relations",new JSONArray());prefs.edit().putString("personalization",persona.toString()).commit();
   JSONObject incoming=new JSONObject(persona.toString());incoming.getJSONArray("cards").getJSONObject(0).put("instructions","备份人设");JSONObject personalized=new JSONObject(backup.toString());personalized.getJSONObject("settings").put("personalization",incoming.toString());personalized.getJSONArray("chats").getJSONObject(0).put("id","persona-chat");restore.invoke(store,personalized);String remapped=new JSONObject((String)get.invoke(store,"persona-chat")).getString("personaId");expect(remapped.startsWith("daily-restore-"),"restored chat follows the restored conflicting persona card");expect((Integer)restore.invoke(store,personalized)==0,"persona remapping remains idempotent");
   JSONObject v1=new JSONObject().put("format","chatq-backup").put("version",1).put("records",new JSONArray()).put("settings",new JSONObject());expect((Integer)restore.invoke(store,v1)==0,"old v1 encrypted backup content remains supported");
   JSONObject invalid=new JSONObject(backup.toString());invalid.getJSONArray("chats").getJSONObject(0).put("contextStart",999);reject(restore,store,invalid);
   int count=new JSONArray((String)list.invoke(store)).length();for(int i=count;i<50;i++)save.invoke(store,chat("limit-"+i).toString());reject(save,store,chat("over-limit").toString());expect(new JSONArray((String)list.invoke(store)).length()==50,"capacity never evicts existing conversations");
   JSONObject overflow=new JSONObject(v1.toString()).put("version",2).put("chats",new JSONArray().put(chat("import-overflow")));reject(restore,store,overflow);expect(new JSONArray((String)list.invoke(store)).length()==50&&!prefs.contains("restoreJournal"),"failed capacity restore rolls back and clears journal");
   del.invoke(store,"chat-test");expect(new JSONArray((String)list.invoke(store)).length()==49,"explicit delete removes only one conversation");
   return checks;
  }finally{((SQLiteOpenHelper)store).close();SQLiteDatabase.deleteDatabase(file);prefs.edit().clear().commit();}
 }
}
