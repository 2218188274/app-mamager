package com.chatq.keyboardtests;
import android.content.*;import android.database.sqlite.*;import java.io.*;import java.lang.reflect.*;import java.util.*;import org.json.*;

final class DataChecks {
 static int checks=0;static void expect(boolean b,String label){if(!b)throw new AssertionError(label);checks++;}
 static Throwable failure(Method m,Object o,Object...args)throws Exception{try{m.invoke(o,args);throw new AssertionError("expected rejection");}catch(InvocationTargetException e){checks++;return e.getCause();}}
 static int run(Context original)throws Exception{
  final File dir=new File(original.getCacheDir(),"chatq-data-test");dir.mkdirs();
  final SharedPreferences prefs=original.getSharedPreferences("chatq_data_test_only",0);prefs.edit().clear().commit();
  Context context=new ContextWrapper(original){
    public SharedPreferences getSharedPreferences(String n,int mode){return prefs;}
    public File getDatabasePath(String name){return new File(dir,name);}
    public File getCacheDir(){return dir;}
  };
  File database=context.getDatabasePath("chatq-generations.db");SQLiteDatabase.deleteDatabase(database);
  ClassLoader l=original.getClassLoader();Class<?> t=l.loadClass("expo.modules.chatqkeyboard.GenerationStore");
  Object store=t.getConstructor(Context.class).newInstance(context);
  Method save=t.getMethod("save",String.class,List.class,String.class,String.class),list=t.getMethod("list",String.class,boolean.class),exp=t.getMethod("export"),restore=t.getMethod("restore",JSONObject.class),get=t.getMethod("get",long.class),set=t.getMethod("setEnabled",boolean.class),migrate=t.getMethod("migrate",String.class),clear=t.getMethod("clear"),validate=t.getMethod("validateBackup",JSONObject.class);
  try{
   prefs.edit().putString("apiKey","must-not-export").putString("deviceId","must-not-export").putString("typingPreferences","{\"theme\":\"dark\"}").putString("topicFavorites","[\"daily-01\"]").commit();
   save.invoke(store,"100%_test",Arrays.asList("候选甲","候选乙"),"keyboard","reply");
   Object another=t.getConstructor(Context.class).newInstance(context);
   JSONArray rows=(JSONArray)list.invoke(another,"%",false);expect(rows.length()==1,"shared stores read same records and search uses literal percent");
   JSONObject row=rows.getJSONObject(0);expect(new JSONObject((String)get.invoke(another,row.getLong("id"))).getJSONArray("replies").length()==2,"each generated candidate persists separately");
   JSONObject backup=(JSONObject)exp.invoke(store);expect(!backup.toString().contains("must-not-export"),"backup whitelist excludes identity and keys");
   expect(((Integer)restore.invoke(store,backup))==0,"restoring existing UUIDs is idempotent");
   set.invoke(store,false);expect(!((Boolean)save.invoke(store,"禁存",Arrays.asList("不可保存"),"app","reply")),"disabled history never saves on either surface");set.invoke(store,true);
   JSONObject legacy=new JSONObject().put("uid","legacy-test").put("source","app").put("kind","reply").put("prompt","旧版消息").put("replies",new JSONArray().put("旧版回复")).put("createdAt",1700000000000L);
   migrate.invoke(store,new JSONArray().put(legacy).toString());migrate.invoke(store,new JSONArray().put(legacy).toString());expect(((JSONArray)list.invoke(store,"",false)).length()==2,"legacy migration runs once without duplicates");
   clear.invoke(store);migrate.invoke(store,new JSONArray().put(legacy).toString());expect(((JSONArray)list.invoke(store,"",false)).length()==0,"clear does not resurrect migrated history");
   expect(((Integer)restore.invoke(store,backup))==1,"backup restores a missing record");expect(((Integer)restore.invoke(store,backup))==0,"repeat restore remains deduplicated");
   JSONObject bad=new JSONObject(backup.toString());bad.getJSONObject("settings").put("apiKey","forbidden");failure(validate,store,bad);
   bad=new JSONObject(backup.toString());bad.getJSONArray("records").getJSONObject(0).put("replies",new JSONArray());failure(restore,store,bad);expect(((JSONArray)list.invoke(store,"",false)).length()==1,"invalid backup changes no records");
   JSONObject incoming=new JSONObject(backup.toString());incoming.getJSONArray("records").getJSONObject(0).put("uid","new-id");incoming.getJSONObject("settings").put("topicFavorites","[\"daily-02\"]");
   SQLiteDatabase sql=((SQLiteOpenHelper)store).getWritableDatabase();sql.execSQL("CREATE TRIGGER reject_restore BEFORE INSERT ON records WHEN NEW.uid='new-id' BEGIN SELECT RAISE(ABORT,'disk fixture'); END;");
   failure(restore,store,incoming);expect(((JSONArray)list.invoke(store,"",false)).length()==1 && !prefs.getString("topicFavorites","").contains("daily-02"),"failed SQL restores both settings and records");
   sql.execSQL("DROP TRIGGER reject_restore");expect(((Integer)restore.invoke(store,incoming))==1,"valid merge inserts only missing UUID");expect(prefs.getString("topicFavorites","").contains("daily-01")&&prefs.getString("topicFavorites","").contains("daily-02"),"favorites merge preserves both devices");
   JSONObject previous=new JSONObject();previous.put("topicFavorites","[\"daily-01\"]");prefs.edit().putString("topicFavorites","[\"daily-03\"]").putString("restoreJournal",new JSONObject().put("token","not-committed").put("previous",previous).toString()).commit();list.invoke(store,"",false);expect(prefs.getString("topicFavorites","").equals("[\"daily-01\"]")&&!prefs.contains("restoreJournal"),"process interruption recovers uncommitted preference changes");
   ((SQLiteOpenHelper)another).close();
   JSONObject currentCard=new JSONObject().put("id","daily").put("name","现有人设").put("instructions","保持现有").put("length","short").put("tagWeights",new JSONObject());
   JSONObject currentPersona=new JSONObject().put("version",1).put("cards",new JSONArray().put(currentCard)).put("scenes",new JSONArray()).put("relations",new JSONArray());prefs.edit().putString("personalization",currentPersona.toString()).commit();
   JSONObject imported=new JSONObject(currentPersona.toString());imported.getJSONArray("cards").getJSONObject(0).put("instructions","备份里的表达习惯");JSONObject personaBackup=new JSONObject(backup.toString());personaBackup.getJSONObject("settings").put("personalization",imported.toString());restore.invoke(store,personaBackup);
   expect(new JSONObject(prefs.getString("personalization","{}")).getJSONArray("cards").length()==2,"conflicting default persona restores as a separate card rather than losing either version");restore.invoke(store,personaBackup);expect(new JSONObject(prefs.getString("personalization","{}")).getJSONArray("cards").length()==2,"repeated persona conflict recovery does not create more copies");
   Class<?> crypto=l.loadClass("expo.modules.chatqkeyboard.BackupCrypto");Object singleton=crypto.getField("INSTANCE").get(null);Method encrypt=crypto.getMethod("encrypt",byte[].class,String.class),decrypt=crypto.getMethod("decrypt",byte[].class,String.class);
   byte[] plain=backup.toString().getBytes("UTF-8"),a=(byte[])encrypt.invoke(singleton,plain,"test-password-123"),b=(byte[])encrypt.invoke(singleton,plain,"test-password-123");
   expect(!Arrays.equals(a,b),"random salt and IV produce distinct encrypted exports");expect(Arrays.equals(plain,(byte[])decrypt.invoke(singleton,a,"test-password-123")),"encrypted export decrypts exactly");
   failure(decrypt,singleton,a,"wrong-password");
   JSONObject tampered=new JSONObject(new String(a,"UTF-8"));String payload=tampered.getString("data");tampered.put("data",(payload.charAt(0)=='A'?"B":"A")+payload.substring(1));failure(decrypt,singleton,tampered.toString().getBytes("UTF-8"),"test-password-123");
   expect(!new String(a,"UTF-8").contains("候选甲"),"ciphertext contains no plain generation text");
   Class<?> update=l.loadClass("expo.modules.chatqkeyboard.AppUpdater");Object updater=update.getConstructor(Context.class).newInstance(context);
   Method verify=update.getDeclaredMethod("verifyPackage",JSONObject.class);verify.setAccessible(true);
   File apk=new File("/data/local/tmp/chatq-known-old.apk");if(apk.exists()){
     try(InputStream in=new FileInputStream(apk);OutputStream out=new FileOutputStream(new File(dir,"chatq-update.apk"))){byte[] buf=new byte[65536];int n;while((n=in.read(buf))!=-1)out.write(buf,0,n);}
     verify.invoke(updater,new JSONObject().put("versionCode",10).put("version","1.8.0"));expect(true,"existing APK signature and package match installed app");
     failure(verify,updater,new JSONObject().put("versionCode",99).put("version","1.8.0"));
     java.security.MessageDigest digest=java.security.MessageDigest.getInstance("SHA-256");try(InputStream in=new FileInputStream(apk)){byte[] digestBuffer=new byte[65536];int n;while((n=in.read(digestBuffer))!=-1)digest.update(digestBuffer,0,n);}StringBuilder hex=new StringBuilder();for(byte hashByte:digest.digest())hex.append(String.format("%02x",hashByte&255));
     Method integrity=update.getDeclaredMethod("verifyFile",JSONObject.class);integrity.setAccessible(true);JSONObject expected=new JSONObject().put("versionCode",10).put("version","1.8.0").put("sha256",hex.toString());integrity.invoke(updater,expected);expect(true,"real published APK passes the exact integrity and signature check used before installation");
     expected.put("sha256",String.join("",Collections.nCopies(64,"0")));failure(integrity,updater,expected);

   }
   Method valid=update.getDeclaredMethod("validate",JSONObject.class,java.net.URL.class);valid.setAccessible(true);
   JSONObject release=new JSONObject().put("schema",1).put("versionCode",12).put("version","1.10.0").put("sha256",String.join("",Collections.nCopies(64,"a"))).put("sizeBytes",100).put("url","http://103.149.91.78/downloads/app.apk").put("notes",new JSONArray().put("Update"));
   valid.invoke(updater,release,new java.net.URL("http://103.149.91.78"));expect(true,"well-formed same-origin update accepted");release.put("url","https://other.example/downloads/app.apk");failure(valid,updater,release,new java.net.URL("http://103.149.91.78"));
   release.put("url","http://103.149.91.78/downloads/app.apk").put("sha256","bad");failure(valid,updater,release,new java.net.URL("http://103.149.91.78"));
   return checks;
  }finally{((SQLiteOpenHelper)store).close();SQLiteDatabase.deleteDatabase(database);prefs.edit().clear().commit();}
 }
}
