package com.chatq.keyboardtests;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import org.json.*;
import expo.modules.chatqkeyboard.SharedTransfer;

/** Pure crypto/mapping checks on JVM. Android provider/transaction acceptance is separate. */
public final class TransferChecks {
  private static int checks;
  private static void check(boolean value,String label){if(!value)throw new AssertionError(label);checks++;}
  private static void reject(Runnable action,String label){boolean failed=false;try{action.run();}catch(Exception e){failed=true;}check(failed,label);}
  private static JSONObject empty(){return new JSONObject().put("format","chatq-backup").put("version",2).put("createdAt",System.currentTimeMillis()).put("records",new JSONArray()).put("settings",new JSONObject()).put("chats",new JSONArray());}
  public static int run(byte[] windows,java.util.function.Consumer<byte[]> android) throws Exception {
    checks=0;SharedTransfer t=SharedTransfer.INSTANCE;String password="synthetic-迁移😀-password";
    JSONObject data=t.decrypt(windows,password);check(data.getString("source").equals("windows"),"Windows-produced authenticated file decrypts in Kotlin/JCA");
    check(data.getJSONArray("conversations").getJSONObject(0).getJSONArray("messages").getJSONObject(0).getString("content").equals("合成问题👋"),"Unicode message survives cross-language crypto");
    reject(()->t.decrypt(windows,"wrong-password"),"wrong password rejected");byte[] broken=windows.clone();broken[broken.length-1]^=1;reject(()->t.decrypt(broken,password),"tamper rejected");
    JSONObject current=empty();String before=t.fingerprint(current);SharedTransfer.Merge merged=t.merge(current,data);
    check(merged.getPreview().getInt("added")==7&&merged.getPreview().getInt("duplicate")==0,"native mapping previews personas/favorite/session");check(t.fingerprint(current).equals(before),"preview does not mutate source");
    JSONObject next=merged.getNative();JSONObject chat=next.getJSONArray("chats").getJSONObject(0);check(chat.getJSONArray("turns").length()==1&&chat.getJSONArray("turns").getJSONObject(0).getString("question").equals("合成问题👋"),"Windows messages become Android question/answer turn");
    check(t.merge(next,data).getPreview().getInt("added")==0&&t.merge(next,data).getPreview().getInt("duplicate")==7,"repeated migration remains idempotent");
    JSONObject restored=t.undo(next,merged.getUndo());check(t.fingerprint(restored).equals(before),"undo restores original subset including previously absent settings");
    JSONObject modified=new JSONObject(next.toString());modified.getJSONArray("chats").getJSONObject(0).put("title","修改后的会话");reject(()->t.undo(modified,merged.getUndo()),"edited native destination prevents destructive undo");
    check(t.merge(modified,data).getPreview().getInt("conflict")==1,"conflicting shared ID disclosed and kept locally");
    JSONObject export=t.export(next);check(export.getString("source").equals("android")&&export.getJSONArray("favorites").getJSONObject(0).getString("text").equals("合成常用句😀"),"Android export maps favorites and marks source");
    byte[] encrypted=t.encrypt(export,password);check(t.decrypt(encrypted,password).getJSONArray("personas").length()==5,"native authenticated roundtrip");android.accept(encrypted);
    JSONObject unknown=new JSONObject(export.toString()).put("apiKey","synthetic-forbidden");reject(()->t.validate(unknown),"unknown credential field rejected");
    JSONObject invalid=new JSONObject(export.toString());invalid.getJSONArray("conversations").getJSONObject(0).getJSONArray("messages").getJSONObject(0).put("role","assistant");reject(()->t.validate(invalid),"invalid role order rejected");
    JSONObject full=new JSONObject(next.toString());JSONArray cards=new JSONObject(full.getJSONObject("settings").getString("personalization")).getJSONArray("cards");for(int n=cards.length();n<20;n++)cards.put(new JSONObject().put("id","local"+n).put("name","local"+n).put("instructions","local").put("example","").put("tagWeights",new JSONObject()).put("length","short"));JSONObject pref=new JSONObject(full.getJSONObject("settings").getString("personalization")).put("cards",cards);full.getJSONObject("settings").put("personalization",pref.toString());JSONObject add=new JSONObject(export.toString());add.getJSONArray("personas").getJSONObject(0).put("id",t.id("new-persona","synthetic")).put("name","新增人设");reject(()->t.merge(full,add),"capacity error does not evict old cards");check(cards.length()==20,"capacity failure preserves original cards");
    return checks;
  }
  public static void main(String[] args)throws Exception {
    Path folder=Path.of(args[0]);int count=run(Files.readAllBytes(folder.resolve("windows.cqtransfer")),bytes->{try{Files.write(folder.resolve("android.cqtransfer"),bytes);}catch(Exception e){throw new RuntimeException(e);}});
    System.out.println("{\"crossLanguageTransferChecks\":"+count+",\"runtime\":\"JVM JCA and shipping Kotlin\",\"androidDeviceValidated\":false,\"realChatsRead\":false}");
  }
}
