package com.chatq.keyboardtests;

import android.content.*;
import android.database.sqlite.*;
import android.util.Base64;
import java.io.*;
import java.lang.reflect.*;
import java.util.*;
import org.json.*;

final class TransferNativeChecks {
  static int count;
  static void check(boolean value,String label){if(!value)throw new AssertionError(label);count++;}
  static Object invoke(Object owner,String name,Class<?>[] types,Object... args)throws Exception{return owner.getClass().getMethod(name,types).invoke(owner,args);}
  static Object call(Object owner,String name)throws Exception{return invoke(owner,name,new Class<?>[0]);}
  static void reject(Object owner,String name,Class<?>[] types,Object... args)throws Exception{boolean failed=false;try{invoke(owner,name,types,args);}catch(InvocationTargetException e){failed=true;}check(failed,"expected rejection: "+name);}
  static JSONObject snapshot(Object store)throws Exception{return (JSONObject)call(store,"export");}
  static String fingerprint(Object crypto,JSONObject value)throws Exception{return (String)invoke(crypto,"fingerprint",new Class<?>[]{JSONObject.class},value);}
  static Object field(Object owner,String name)throws Exception{Field f=owner.getClass().getDeclaredField(name);f.setAccessible(true);return f.get(owner);}
  static void lifecycle(ClassLoader loader,Object store)throws Exception{
    Object lease=loader.loadClass("expo.modules.chatqkeyboard.BackupFileLease").getField("INSTANCE").get(null);Object a=new Object(),b=new Object();Class<?>[] object={Object.class};
    try{check((Boolean)invoke(lease,"acquire",object,a),"file lease acquired");check(!(Boolean)invoke(lease,"acquire",object,b),"another picker cannot overlap");invoke(lease,"release",object,b);check(!(Boolean)invoke(lease,"acquire",object,b),"foreign cancel cannot release picker");invoke(lease,"release",object,a);check((Boolean)invoke(lease,"acquire",object,b),"correct owner releases picker");}finally{invoke(lease,"release",object,a);invoke(lease,"release",object,b);}
    Class<?> fn=loader.loadClass("kotlin.jvm.functions.Function0");Object activity=Proxy.newProxyInstance(loader,new Class<?>[]{fn},new InvocationHandler(){public Object invoke(Object proxy,Method method,Object[] args){return null;}});Object database=Proxy.newProxyInstance(loader,new Class<?>[]{fn},new InvocationHandler(){public Object invoke(Object proxy,Method method,Object[] args){return store;}});
    for(String name:new String[]{"BackupFiles","TransferFiles"}){
      Object files=loader.loadClass("expo.modules.chatqkeyboard."+name).getConstructor(fn,fn).newInstance(activity,database);
      try{
        boolean shared=name.equals("TransferFiles");call(files,shared?"discard":"cancel");
        Method complete=files.getClass().getDeclaredMethod("completePreview",shared?new Class<?>[]{int.class,JSONObject.class,JSONObject.class}:new Class<?>[]{JSONObject.class,String.class,int.class});complete.setAccessible(true);
        JSONObject payload=new JSONObject().put("synthetic",true),preview=new JSONObject().put("fingerprint","synthetic-hash");
        if(shared)complete.invoke(files,0,payload,preview);else complete.invoke(files,payload,"synthetic",0);
        check(field(files,shared?"decoded":"preview")==null,"cancelled "+name+" cannot revive stale preview");
        if(shared)complete.invoke(files,1,payload,preview);else complete.invoke(files,payload,"synthetic",1);
        check(field(files,shared?"decoded":"preview")!=null,"current "+name+" preview can publish");call(files,shared?"discard":"cancel");
        invoke(lease,"acquire",object,files);if(shared)complete.invoke(files,1,payload,preview);else complete.invoke(files,payload,"synthetic",1);
        check(!(Boolean)invoke(lease,"acquire",object,b),"late "+name+" completion cannot release replacement file operation");invoke(lease,"release",object,files);
      }finally{call(files,"destroy");invoke(lease,"release",object,files);invoke(lease,"release",object,b);}
    }
  }
  static JSONObject run(Context original,Context fixture)throws Exception{
    count=0;String suffix="chatq_transfer_test_"+UUID.randomUUID().toString().replace("-","");File dir=new File(original.getCacheDir(),suffix);check(dir.mkdir(),"isolated fixture directory");SharedPreferences prefs=original.getSharedPreferences(suffix,0);
    Context context=new ContextWrapper(original){public SharedPreferences getSharedPreferences(String n,int mode){return prefs;}public File getDatabasePath(String name){return new File(dir,name);}public File getCacheDir(){return dir;}};
    ClassLoader loader=original.getClassLoader();Class<?> type=loader.loadClass("expo.modules.chatqkeyboard.GenerationStore");Object store=type.getConstructor(Context.class).newInstance(context);Object crypto=loader.loadClass("expo.modules.chatqkeyboard.SharedTransfer").getField("INSTANCE").get(null);
    String password="synthetic-迁移😀-password";Class<?>[] json={JSONObject.class},apply={JSONObject.class,String.class};
    try{
      lifecycle(loader,store);
      prefs.edit().putString("apiKey","synthetic-do-not-export").putString("deviceId","synthetic-device").putString("topicFavorites","[\"daily-01\"]").commit();
      ByteArrayOutputStream data=new ByteArrayOutputStream();try(InputStream in=fixture.getAssets().open("windows.cqtransfer")){byte[] block=new byte[8192];int n;while((n=in.read(block))!=-1)data.write(block,0,n);}
      JSONObject incoming=(JSONObject)invoke(crypto,"decrypt",new Class<?>[]{byte[].class,String.class},data.toByteArray(),password);check(incoming.getString("source").equals("windows"),"actual Android JCA decrypts Windows vector");
      JSONObject before=snapshot(store);String expected=fingerprint(crypto,before);JSONObject preview=(JSONObject)invoke(store,"transferPreview",json,incoming);check(preview.getInt("added")==7&&fingerprint(crypto,snapshot(store)).equals(expected),"preview counts without writing data");
      check((Integer)invoke(store,"applyTransfer",apply,incoming,expected)==7,"explicit native merge adds expected text records");JSONObject after=snapshot(store);check(after.getJSONArray("chats").length()==1&&prefs.getString("apiKey","").equals("synthetic-do-not-export"),"native transaction preserves API and device settings");
      check((Integer)invoke(store,"applyTransfer",apply,incoming,fingerprint(crypto,after))==0,"repeated native import idempotent");((SQLiteOpenHelper)store).close();store=type.getConstructor(Context.class).newInstance(context);call(store,"undoTransfer");check(fingerprint(crypto,snapshot(store)).equals(expected),"restart undo removes only previous additions and restores absent settings");
      invoke(store,"applyTransfer",apply,incoming,expected);prefs.edit().putString("typingPreferences","{\"theme\":\"dark\"}").commit();reject(store,"undoTransfer",new Class<?>[0]);check(snapshot(store).getJSONArray("chats").length()==1,"changed destination prevents undo without losing chat");reject(store,"applyTransfer",apply,incoming,expected);
      prefs.edit().remove("typingPreferences").commit();SQLiteDatabase sql=((SQLiteOpenHelper)store).getWritableDatabase();String oldUndo;try(android.database.Cursor c=sql.rawQuery("SELECT value FROM meta WHERE key='transferUndo'",null)){check(c.moveToFirst(),"persistent undo exists");oldUndo=c.getString(0);}
      JSONObject extra=new JSONObject(incoming.toString());extra.getJSONArray("personas").getJSONObject(0).put("id","cq00000000000000000000000000000001").put("name","合成新卡");extra.getJSONArray("conversations").getJSONObject(0).put("id","cq00000000000000000000000000000002").put("title","合成另一个会话");String stable=fingerprint(crypto,snapshot(store));
      sql.execSQL("CREATE TRIGGER transfer_fail BEFORE INSERT ON chat_sessions BEGIN SELECT RAISE(ABORT,'synthetic transfer write failure'); END");reject(store,"applyTransfer",apply,extra,stable);sql.execSQL("DROP TRIGGER transfer_fail");check(fingerprint(crypto,snapshot(store)).equals(stable)&&!prefs.contains("restoreJournal"),"failed transaction restores settings and original chats");
      String retained;try(android.database.Cursor c=sql.rawQuery("SELECT value FROM meta WHERE key='transferUndo'",null)){check(c.moveToFirst(),"prior undo retained after write failure");retained=c.getString(0);}check(retained.equals(oldUndo),"failed import cannot replace prior undo metadata");
      JSONObject exported=(JSONObject)invoke(crypto,"export",json,snapshot(store));check(!exported.toString().contains("synthetic-do-not-export")&&!exported.toString().contains("synthetic-device"),"common DTO excludes all native secrets and identity");byte[] encrypted=(byte[])invoke(crypto,"encrypt",new Class<?>[]{JSONObject.class,String.class},exported,password);JSONObject decoded=(JSONObject)invoke(crypto,"decrypt",new Class<?>[]{byte[].class,String.class},encrypted,password);check(decoded.getJSONArray("conversations").getJSONObject(0).getJSONArray("messages").getJSONObject(0).getString("content").equals("合成问题👋"),"native export preserves exact Unicode mainline");
      call(store,"undoTransfer");check(fingerprint(crypto,snapshot(store)).equals(expected),"previous valid undo still works after failed import");return new JSONObject().put("checks",count).put("androidVector",Base64.encodeToString(encrypted,Base64.NO_WRAP));
    }finally{((SQLiteOpenHelper)store).close();SQLiteDatabase.deleteDatabase(context.getDatabasePath("chatq-generations.db"));prefs.edit().clear().commit();if(dir.list().length!=0||!dir.delete())throw new AssertionError("isolated cleanup failed");}
  }
}
