package com.chatq.keyboardtests;
import android.content.*;import android.database.sqlite.*;import java.io.*;import java.lang.reflect.*;import org.json.*;
final class PersonaChecks {
 static int checks;static void expect(boolean b,String label){if(!b)throw new AssertionError(label);checks++;}
 static void rejects(Method m,Object o,Object...args)throws Exception{try{m.invoke(o,args);throw new AssertionError("expected rejection");}catch(InvocationTargetException e){checks++;}}
 static JSONObject data()throws Exception{return new JSONObject("{\"version\":1,\"cards\":[{\"id\":\"daily\",\"name\":\"自然真诚\",\"instructions\":\"自然回应\",\"length\":\"short\",\"tagWeights\":{},\"category\":\"daily\",\"example\":\"明天见\"},{\"id\":\"warm\",\"name\":\"温柔体贴\",\"instructions\":\"先理解感受\",\"length\":\"short\",\"tagWeights\":{},\"pinned\":true},{\"id\":\"work\",\"name\":\"礼貌得体\",\"instructions\":\"礼貌明确\",\"length\":\"short\",\"tagWeights\":{}}],\"scenes\":[{\"id\":\"daily\",\"name\":\"日常\"}],\"relations\":[{\"id\":\"friend\",\"name\":\"朋友\"}]}");}
 static int run(Context original)throws Exception{
  final SharedPreferences p=original.getSharedPreferences("chatq_persona_test_only",0);p.edit().clear().commit();final File dir=new File(original.getCacheDir(),"persona-checks");dir.mkdirs();
  Context context=new ContextWrapper(original){public SharedPreferences getSharedPreferences(String n,int mode){return p;}public File getDatabasePath(String n){return new File(dir,n);}};
  SQLiteDatabase.deleteDatabase(context.getDatabasePath("chatq-generations.db"));ClassLoader loader=original.getClassLoader();
  Class<?> persona=loader.loadClass("expo.modules.chatqkeyboard.PersonaPreferences"),saved=loader.loadClass("expo.modules.chatqkeyboard.SavedReplies"),storeType=loader.loadClass("expo.modules.chatqkeyboard.GenerationStore");
  Object person=persona.getConstructor(SharedPreferences.class).newInstance(p),replies=saved.getConstructor(SharedPreferences.class).newInstance(p),store=storeType.getConstructor(Context.class).newInstance(context);
  Method patch=persona.getMethod("patch",JSONObject.class),append=persona.getMethod("appendTo",JSONObject.class),quick=persona.getMethod("quick",int.class),set=saved.getMethod("set",String.class,String.class,boolean.class),read=saved.getMethod("read"),exp=storeType.getMethod("export"),restore=storeType.getMethod("restore",JSONObject.class);
  try{
   p.edit().putString("personalization",data().toString()).commit();patch.invoke(person,new JSONObject().put("cardId","warm"));patch.invoke(person,new JSONObject().put("relationId","friend").put("warmth","reserved").put("goalId","decline"));
   JSONObject selection=new JSONObject(p.getString("personaSelection","{}"));expect(selection.getString("cardId").equals("warm")&&selection.getString("relationId").equals("friend"),"partial patches preserve other choices");expect(selection.getJSONArray("recentIds").length()==1,"recent persona retained");
   JSONObject payload=(JSONObject)append.invoke(person,new JSONObject());expect(payload.getString("customPrompt").contains("拒绝")&&payload.getString("customPrompt").contains("克制")&&payload.getString("relationId").equals("friend"),"goal and boundary reach AI payload");
   String before=p.getString("personaSelection","");rejects(patch,person,new JSONObject().put("goalId","missing"));expect(p.getString("personaSelection","").equals(before),"invalid patch changes nothing");
   expect(quick.invoke(person,1).toString().contains("warm"),"large text quick strip keeps selected persona");
   set.invoke(replies,"常用句一","温柔 · 拒绝",true);set.invoke(replies,"常用句二","自然",true);set.invoke(replies,"常用句一","新标签",true);expect(((JSONArray)read.invoke(replies)).length()==2,"native favorites deduplicate across bridge instances");
   JSONObject backup=(JSONObject)exp.invoke(store);expect(backup.getJSONObject("settings").getString("savedReplies").contains("常用句一"),"favorites export with personas");
   set.invoke(replies,"本机新句","",true);restore.invoke(store,backup);expect(((JSONArray)read.invoke(replies)).length()==3,"restore merges without dropping current favorites");restore.invoke(store,backup);expect(((JSONArray)read.invoke(replies)).length()==3,"restore repeat is idempotent");
   JSONArray full=new JSONArray();for(int i=0;i<100;i++)full.put(new JSONObject().put("text","F"+i).put("label","").put("savedAt",i));p.edit().putString("savedReplies",full.toString()).commit();rejects(restore,store,backup);expect(((JSONArray)read.invoke(replies)).length()==100,"oversize restore rolls back without truncating");
   p.edit().putString("savedReplies","[{}").commit();rejects(set,replies,"新句","",true);expect(p.getString("savedReplies","").equals("[{}"),"corrupt data is not overwritten");
   p.edit().putString("savedReplies","[]").putString("personalization",data().put("cards",new JSONArray()).toString()).commit();JSONObject empty=(JSONObject)exp.invoke(store);restore.invoke(store,empty);expect(new JSONObject(p.getString("personalization","{}")).getJSONArray("cards").length()==0,"empty persona library supports backup restore");
   return checks;
  }finally{((SQLiteOpenHelper)store).close();SQLiteDatabase.deleteDatabase(context.getDatabasePath("chatq-generations.db"));p.edit().clear().commit();}
 }
}
