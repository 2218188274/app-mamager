package com.chatq.keyboardtests;
import android.content.*;import org.json.*;import java.lang.reflect.*;import java.util.*;
final class AccountChecks {
 static int run(Context context)throws Exception {
  int n=0;SharedPreferences config=context.getSharedPreferences("chatq_keyboard",0),vault=context.getSharedPreferences("chatq_account_v1",0);
  Map<String,?> oldConfig=new HashMap<>(config.getAll()),oldVault=new HashMap<>(vault.getAll());
  try {
   Class<?> type=context.getClassLoader().loadClass("expo.modules.chatqkeyboard.AccountVault");Object store=type.getConstructor(Context.class).newInstance(context);Method save=type.getMethod("save",String.class),load=type.getMethod("load"),clear=type.getMethod("clear");
   config.edit().putString("baseUrl","https://account.invalid").putString("apiKey","local-code").putString("deviceId","qa-device").commit();
   String token=String.join("",Collections.nCopies(6,"synthetic-token-"));String value=new JSONObject().put("token",token).put("expiresAt","2027-01-01T00:00:00Z").put("user",new JSONObject().put("id","qa-user").put("username","qa_tester")).toString();
   save.invoke(store,value);if(!value.equals(load.invoke(store)))throw new AssertionError("encrypted session roundtrip");n++;
   if(vault.getString("session","").contains(token))throw new AssertionError("token stored as plaintext");n++;
   Object reopened=type.getConstructor(Context.class).newInstance(context);if(!value.equals(load.invoke(reopened)))throw new AssertionError("session survives another native instance");n++;
   config.edit().putString("apiKey","other-app").commit();if(load.invoke(store)!=null)throw new AssertionError("session must not cross applications");n++;
   config.edit().putString("apiKey","local-code").putString("baseUrl","https://other.invalid").commit();if(load.invoke(store)!=null)throw new AssertionError("session must not cross servers");n++;
   config.edit().putString("baseUrl","https://account.invalid").putString("deviceId","other-device").commit();if(load.invoke(store)!=null)throw new AssertionError("session must not cross connection identities");n++;
   config.edit().putString("deviceId","qa-device").commit();vault.edit().putString("session","damaged").commit();try{load.invoke(store);throw new AssertionError("corrupt token must not silently fall back to guest");}catch(InvocationTargetException expected){if(!(expected.getCause() instanceof IllegalStateException))throw expected;}n++;
   clear.invoke(store);if(load.invoke(store)!=null)throw new AssertionError("logout clears encrypted token");n++;
  } finally {restore(config,oldConfig);restore(vault,oldVault);}
  return n;
 }
 static void restore(SharedPreferences prefs,Map<String,?> old){SharedPreferences.Editor e=prefs.edit().clear();for(Map.Entry<String,?> row:old.entrySet()){Object value=row.getValue();if(value instanceof String)e.putString(row.getKey(),(String)value);else if(value instanceof Boolean)e.putBoolean(row.getKey(),(Boolean)value);else if(value instanceof Integer)e.putInt(row.getKey(),(Integer)value);else if(value instanceof Long)e.putLong(row.getKey(),(Long)value);}e.commit();}
}
