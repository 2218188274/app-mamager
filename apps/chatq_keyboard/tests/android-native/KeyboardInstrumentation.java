package com.chatq.keyboardtests;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import java.lang.reflect.*;
import java.util.*;
import org.json.*;

// Runs real shipping Kotlin classes on Android; only a separate test preference file is touched.
public final class KeyboardInstrumentation extends Instrumentation {
  private int checks = 0;
  private Bundle arguments;
  private void expect(boolean value, String label) { if (!value) { String visible="";if(arguments!=null&&("true".equals(arguments.getString("candidateUi"))||"true".equals(arguments.getString("topicsUi"))||"true".equals(arguments.getString("chatUi"))||"true".equals(arguments.getString("chatToolsUi"))))for(android.view.accessibility.AccessibilityWindowInfo window:getUiAutomation().getWindows())visible+=nodeTexts(window.getRoot());throw new AssertionError(label+" "+visible); } checks++; }
  @Override public void onCreate(Bundle args) { super.onCreate(args); arguments=args; start(); }
  @Override public void onStart() {
    Bundle result = new Bundle();
    SharedPreferences prefs = getTargetContext().getSharedPreferences("chatq_native_test_only", Context.MODE_PRIVATE);
    try {
      if(arguments!=null && "true".equals(arguments.getString("backupPanelUi"))) { backupPanelUi();result.putString("stream","PASS "+checks+" backup export/cancel/preview UI checks (synthetic emulator data)\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && "true".equals(arguments.getString("referenceUi"))) { referenceUi();result.putString("stream","PASS "+checks+" AI persona/icon/input method switch checks (offline and loopback)\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && "true".equals(arguments.getString("updateUi"))) {
        android.accessibilityservice.AccessibilityServiceInfo si=getUiAutomation().getServiceInfo();si.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;getUiAutomation().setServiceInfo(si);
        shell("am start -n com.jaxon.app.chatq/.MainActivity");android.os.SystemClock.sleep(1200);hostTap("我的");hostSeek("更新中心");hostTap("更新中心");hostSeek("检查新版本");hostTap("检查新版本");
        for(int i=0;i<100&&findText("当前已是最新版本。")==null;i++)android.os.SystemClock.sleep(100);
        hostSeek("当前已是最新版本。");expect(findText("当前已是最新版本。")!=null,"update center reads the published 1.13.1 manifest");for(int i=0;i<6;i++)shell("input swipe 160 220 160 520 180");hostSeek("版本 1.13.1");sectionShot("updates");result.putString("stream","PASS live update center manifest check\n");finish(Activity.RESULT_OK,result);return;
      }
      if(arguments!=null && "true".equals(arguments.getString("lifecycleUi"))) { lifecycleUi();result.putString("stream","PASS "+checks+" keyboard hide/show lifecycle checks (offline editor and loopback)\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && "true".equals(arguments.getString("personalAiUi"))) { personalAiUi();result.putString("stream","PASS "+checks+" personal API host/save/IME/layout checks (synthetic loopback)\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && "true".equals(arguments.getString("personalAiChecks"))) { result.putString("stream","PASS "+PersonalAiChecks.run(getTargetContext())+" personal API encryption/protocol/cancellation checks (loopback only)\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && "true".equals(arguments.getString("stickerChecks"))) { result.putString("stream","PASS "+StickerChecks.run(getTargetContext())+" sticker URI/PNG/permissions checks\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && "true".equals(arguments.getString("imeExpressionsUi"))) { imeExpressionsUi();result.putString("stream","PASS "+checks+" native expression/rich-content/layout checks (separate offline editor)\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && "true".equals(arguments.getString("expressionsUi"))) { expressionsUi();result.putString("stream","PASS "+checks+" expression/share/polish/undo host UI checks (loopback)\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && "true".equals(arguments.getString("personaLayoutUi"))) { personaLayoutUi();result.putString("stream","PASS "+checks+" long persona layout and selection checks (offline)\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && "true".equals(arguments.getString("personaChecks"))) { result.putString("stream","PASS "+PersonaChecks.run(getTargetContext())+" persona/favorite/backup checks\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && "true".equals(arguments.getString("personaUi"))) { personaUi();result.putString("stream","PASS "+checks+" persona/goal/refine/favorite UI checks (loopback)\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && "true".equals(arguments.getString("personaHostUi"))) { personaHostUi();result.putString("stream","PASS "+checks+" persona center/shared favorites/reply card host UI checks (loopback)\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && "true".equals(arguments.getString("accountChecks"))) { checks += AccountChecks.run(getTargetContext());result.putString("stream","PASS "+checks+" account Keystore/scope checks\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && "true".equals(arguments.getString("paymentUi"))) { paymentUi();result.putString("stream","PASS "+checks+" payment/account UI checks (loopback, no real payment)\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && "true".equals(arguments.getString("accountUi"))) { accountUi();result.putString("stream","PASS "+checks+" account/member UI checks\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && "true".equals(arguments.getString("maintenanceUi"))) { maintenanceUi();result.putString("stream","PASS "+checks+" maintenance UI checks (loopback)\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && arguments.getString("flowReviewCase")!=null) { flowReviewUi();result.putString("stream","PASS "+checks+" flow review checks: "+arguments.getString("flowReviewCase")+" (loopback)\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && "true".equals(arguments.getString("flowDailyUi"))) { flowDailyUi();result.putString("stream","PASS "+checks+" long-result/nine-key return checks (loopback)\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && "true".equals(arguments.getString("flowUi"))) { flowUi();result.putString("stream","PASS "+checks+" paste/polish/return/editor/privacy checks (loopback)\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && "true".equals(arguments.getString("uxUi"))) { uxUi();result.putString("stream","PASS "+checks+" ergonomics/navigation/IME checks (synthetic, no paid AI)\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && "true".equals(arguments.getString("layoutUi"))) { layoutUi();result.putString("stream","PASS "+checks+" app layout/navigation checks (loopback, no generation)\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && "true".equals(arguments.getString("priceUi"))) { priceUi();result.putString("stream","PASS "+checks+" malformed plan currency UI checks\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && "true".equals(arguments.getString("centerUi"))) { centerUi();result.putString("stream","PASS "+checks+" shared history/account/SAF encrypted backup restore UI checks\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && "true".equals(arguments.getString("historySearchChecks"))) { result.putString("stream","PASS "+HistorySearchChecks.run(getTargetContext())+" literal history search checks; 1253-row full scan "+HistorySearchChecks.searchBenchmarkMs+"ms\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && "true".equals(arguments.getString("transportChecks"))) { result.putString("stream","PASS "+InputNetworkChecks.run(getTargetContext(),prefs)+" HTTP transport/cancel/request ID checks\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && "true".equals(arguments.getString("exportChecks"))) { result.putString("stream","PASS "+ExportChecks.run(this)+" native export lifecycle/error checks\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && ("true".equals(arguments.getString("chatDailyUi"))||"true".equals(arguments.getString("chatDailyBackUi")))) { arguments.putString("chatToolsUi","true");chatDailyUi();result.putString("stream","PASS "+checks+("true".equals(arguments.getString("chatDailyBackUi"))?" current chat search system-back UI checks (offline)\n":" daily chat search/copy/scroll/retry/unsaved navigation UI checks (loopback)\n"));finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && "true".equals(arguments.getString("chatToolsUi"))) { chatToolsUi();result.putString("stream","PASS "+checks+" rename/edit-branch/SAF TXT+Markdown UI checks (loopback)\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && "true".equals(arguments.getString("chatUi"))) { chatUi();result.putString("stream","PASS "+checks+" independent multi-turn chat UI checks (loopback)\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && "true".equals(arguments.getString("streamChecks"))) { result.putString("stream","PASS "+StreamChecks.run(getTargetContext())+" native SSE/cancellation checks\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && "true".equals(arguments.getString("featureUi"))) { arguments.putString("chatToolsUi","true");featureUi();result.putString("stream","PASS "+checks+" Markdown/version/branch/attachment/sync UI checks (loopback)\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && "true".equals(arguments.getString("attachmentChecks"))) { result.putString("stream","PASS "+AttachmentChecks.run(this)+" native attachment file/image/limit/lifecycle checks\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && "true".equals(arguments.getString("featureChecks"))) { result.putString("stream","PASS "+FeatureChecks.run(getTargetContext())+" native sync/metadata/Keystore checks\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && "true".equals(arguments.getString("conversationChecks"))) { result.putString("stream","PASS "+ConversationChecks.run(getTargetContext())+" native conversation migration/backup checks\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && "true".equals(arguments.getString("dataChecks"))) { result.putString("stream","PASS "+DataChecks.run(getTargetContext())+" data migration/backup/restore/crypto/update checks\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && "true".equals(arguments.getString("candidateBench"))) { result.putString("stream",CandidateChecks.benchmark(getTargetContext())+"\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && "true".equals(arguments.getString("candidateUi"))) { candidateUi();result.putString("stream","PASS "+checks+" candidate/editor checks\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && "true".equals(arguments.getString("polishUi"))) { polishUi();result.putString("stream","PASS "+checks+" cancellation/editor UI checks against local HTTP fixture\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && "true".equals(arguments.getString("hostUi"))) { hostUi();result.putString("stream","PASS "+checks+" host/real AI/history/search/copy checks\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && "true".equals(arguments.getString("sectionsUi"))) { sectionsUi();result.putString("stream","PASS "+checks+" favorites/shared host/keyboard status/help/trial checks (offline)\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && arguments.getString("prepareUi")!=null) {
        String mode=arguments.getString("prepareUi");SharedPreferences uiPrefs=getTargetContext().getSharedPreferences("chatq_keyboard",Context.MODE_PRIVATE);
        Class<?> type=getTargetContext().getClassLoader().loadClass("expo.modules.chatqkeyboard.TypingPreferences");Object config=type.getConstructor(SharedPreferences.class).newInstance(uiPrefs);
        type.getMethod("update",JSONObject.class).invoke(config,new JSONObject().put("chinese",true).put("layout","nine".equals(mode)?"nine":"qwerty").put("height","normal").put("numberRow",false).put("cloudWords",false).put("theme","system").put("englishCorrection",true));
        result.putString("stream","PASS prepared UI fixture preferences\n");finish(Activity.RESULT_OK,result);return;
      }
      if (arguments!=null && "true".equals(arguments.getString("voiceUi"))) { voiceUi();result.putString("stream","PASS voice preview waits for explicit insertion into original editor\n");finish(Activity.RESULT_OK,result);return; }
      if (arguments!=null && "true".equals(arguments.getString("cloudUi"))) { cloudUi();result.putString("stream","PASS real cloud candidate insertion, private editor isolation and voice restriction\n");finish(Activity.RESULT_OK,result);return; }
      if (arguments!=null && "true".equals(arguments.getString("stabilityUi"))) { stabilityUi();result.putString("stream","PASS " + checks + " editor stability checks\n");finish(Activity.RESULT_OK,result);return; }
      if (arguments!=null && "true".equals(arguments.getString("topicsUi"))) { topicsUi();result.putString("stream","PASS "+checks+" topic library/editor/real AI checks\n");finish(Activity.RESULT_OK,result);return; }
      if (arguments!=null && "true".equals(arguments.getString("aiUi"))) { aiUi();result.putString("stream","PASS real AI reply preview and explicit insertion without sending\n");finish(Activity.RESULT_OK,result);return; }
      if(arguments!=null && "true".equals(arguments.getString("favoritePreview"))) {
        android.accessibilityservice.AccessibilityServiceInfo si=getUiAutomation().getServiceInfo();si.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;getUiAutomation().setServiceInfo(si);
        SharedPreferences actual=getTargetContext().getSharedPreferences("chatq_keyboard",Context.MODE_PRIVATE);String previous=actual.getString("topicFavorites",null);
        try { actual.edit().putString("topicFavorites","[\"daily-01\"]").commit();shell("ime set com.jaxon.app.chatq/expo.modules.chatqkeyboard.ChatQInputMethodService");fresh("SAFE");hostTap("AI 回复与话题库");hostTap("找话题");clickText("日常破冰");clickText("我的收藏");sectionShot("keyboard-favorites"); }
        finally {if(previous==null)actual.edit().remove("topicFavorites").commit();else actual.edit().putString("topicFavorites",previous).commit();}
        result.putString("stream","PASS stable favorite preview captured\n");finish(Activity.RESULT_OK,result);return;
      }
      prefs.edit().clear().commit();
      ClassLoader loader = getTargetContext().getClassLoader();
      Class<?> favoritesClass=loader.loadClass("expo.modules.chatqkeyboard.TopicFavorites");
      Object favorites=favoritesClass.getConstructor(SharedPreferences.class,Set.class).newInstance(prefs,new HashSet<String>(Arrays.asList("daily-01","daily-02","daily-03")));
      Method favoriteRead=favoritesClass.getMethod("read"), favoriteInit=favoritesClass.getMethod("initialize",String.class), favoriteSet=favoritesClass.getMethod("set",String.class,boolean.class), favoriteReplace=favoritesClass.getMethod("replace",String.class);
      expect(favoriteRead.invoke(favorites)==null,"unmigrated favorites remain distinguishable from an intentionally empty list");
      favoriteSet.invoke(favorites,"daily-02",true);
      JSONArray merged=new JSONArray((String)favoriteInit.invoke(favorites,"[\"daily-01\",\"daily-01\",\"unknown\",123]"));
      expect(merged.length()==2,"legacy favorites merge once with IME additions and reject duplicates/unknown IDs");
      favoriteSet.invoke(favorites,"daily-01",false);favoriteInit.invoke(favorites,"[\"daily-01\"]");
      expect(!((String)favoriteRead.invoke(favorites)).contains("daily-01"),"migration never resurrects deliberately removed favorites");
      Object reopenedFavorites=favoritesClass.getConstructor(SharedPreferences.class,Set.class).newInstance(prefs,new HashSet<String>(Arrays.asList("daily-01","daily-02","daily-03")));
      expect(((String)favoriteRead.invoke(reopenedFavorites)).contains("daily-02"),"favorites survive another shared store instance");
      favoriteReplace.invoke(favorites,"[]");expect("[]".equals(favoriteRead.invoke(favorites)),"empty favorites remain empty");
      prefs.edit().putString("topicFavorites","broken").commit();expect("[]".equals(favoriteRead.invoke(favorites)),"corrupt favorites do not crash the IME");
      Class<?> configClass = loader.loadClass("expo.modules.chatqkeyboard.TypingPreferences");
      Object config = configClass.getConstructor(SharedPreferences.class).newInstance(prefs);
      Method snapshot = configClass.getMethod("snapshot"), update = configClass.getMethod("update", JSONObject.class);
      JSONObject defaults = (JSONObject)snapshot.invoke(config);
      expect(defaults.getBoolean("learning") && defaults.getBoolean("chinese") && !defaults.getBoolean("sound"), "usable defaults");
      update.invoke(config, new JSONObject().put("theme", "dark").put("learning", false).put("height", "large"));
      update.invoke(config, new JSONObject().put("theme", "invalid").put("sound", "true").put("apiKey", "must-not-save"));
      JSONObject saved = (JSONObject)snapshot.invoke(config);
      expect(saved.getString("theme").equals("dark") && saved.getString("height").equals("large") && !saved.getBoolean("learning"), "partial settings preserve unrelated choices");
      expect(!saved.getBoolean("sound") && !prefs.getString("typingPreferences", "").contains("must-not-save"), "invalid fields are ignored");
      Class<?> lexClass = loader.loadClass("expo.modules.chatqkeyboard.UserLexicon");
      Object lex = lexClass.getConstructor(SharedPreferences.class).newInstance(prefs);
      Method add = lexClass.getMethod("add", String.class, String.class, boolean.class), list = lexClass.getMethod("list"), rank = lexClass.getMethod("rank", String.class, List.class, boolean.class), remove = lexClass.getMethod("remove", String.class, String.class), clear = lexClass.getMethod("clear");
      add.invoke(lex, "LS", "聊商", true); add.invoke(lex, "nihao", "你好", false);
      List<?> noLearning = (List<?>)rank.invoke(lex, "nihao", Collections.emptyList(), false);
      List<?> custom = (List<?>)rank.invoke(lex, "ls", Collections.emptyList(), false);
      expect(noLearning.isEmpty() && custom.size() == 1, "incognito ranking suppresses learned words and retains explicit shortcuts");
      add.invoke(lex, "nihao", "你好", false);
      JSONArray words = new JSONArray((String)list.invoke(lex));
      expect(words.length() == 2, "repeated choices update an existing word");
      Object reopened = lexClass.getConstructor(SharedPreferences.class).newInstance(prefs);
      expect(((List<?>)rank.invoke(reopened, "LS", Collections.emptyList(), false)).size() == 1, "word survives a new store instance");
      add.invoke(lex, "xi'an", "西安", true);
      expect(((List<?>)rank.invoke(lex, "xian", Collections.emptyList(), false)).size() == 1, "apostrophe spelling normalizes");
      try { add.invoke(lex, "wrong123", "不能保存", true); throw new AssertionError("invalid code accepted"); } catch (InvocationTargetException expected) { expect(expected.getCause() instanceof IllegalArgumentException, "invalid spelling rejected"); }
      try { add.invoke(lex, "code", "line\nbreak", true); throw new AssertionError("newline accepted"); } catch (InvocationTargetException expected) { expect(expected.getCause() instanceof IllegalArgumentException, "multiline shortcut rejected"); }
      for (int i=0;i<310;i++) add.invoke(lex, "word", "词" + i, false);
      words = new JSONArray((String)list.invoke(lex)); expect(words.length() == 300, "word list stays bounded");
      expect(((List<?>)rank.invoke(lex, "ls", Collections.emptyList(), false)).size() == 1, "learned word eviction preserves manual shortcuts");
      remove.invoke(lex, "ls", "聊商"); expect(((List<?>)rank.invoke(lex, "ls", Collections.emptyList(), false)).isEmpty(), "deleted shortcut stops being suggested");
      clear.invoke(lex); expect(new JSONArray((String)list.invoke(lex)).length() == 0, "clear words takes effect");
      prefs.edit().putString("typingPreferences", "bad json").putString("typingLexicon", "bad json").commit();
      expect(((JSONObject)snapshot.invoke(config)).getBoolean("chinese"), "corrupt preference recovery");
      expect(((List<?>)rank.invoke(lex, "code", Collections.emptyList(), true)).isEmpty(), "corrupt dictionary recovery");
      expect(new JSONArray((String)list.invoke(lex)).length() == 0, "host receives valid JSON after dictionary corruption");
      expect(!defaults.getBoolean("cloudWords") && defaults.getBoolean("englishCorrection") && defaults.getString("layout").equals("qwerty"), "cloud opt-in and offline correction defaults");
      update.invoke(config,new JSONObject().put("layout","nine").put("cloudWords",true).put("englishCorrection",false));
      update.invoke(config,new JSONObject().put("layout","invalid").put("cloudWords","true"));
      JSONObject advanced=(JSONObject)snapshot.invoke(config);
      expect(advanced.getString("layout").equals("nine") && advanced.getBoolean("cloudWords") && !advanced.getBoolean("englishCorrection"), "advanced preference validation and preservation");
      Class<?> nineClass=loader.loadClass("expo.modules.chatqkeyboard.NineKeyEngine");
      Object nine=nineClass.getConstructor(Context.class).newInstance(getTargetContext());
      Method decode=nineClass.getMethod("decode",String.class);
      List<?> nihao=(List<?>)decode.invoke(nine,"64426");
      expect(contains(nihao,"你好",-1), "nine-key offline nihao");
      List<?> china=(List<?>)decode.invoke(nine,"94664486");
      expect(contains(china,"中国",-1), "nine-key offline zhongguo");
      List<?> partial=(List<?>)decode.invoke(nine,"644269");
      expect(contains(partial,"你好",5), "nine-key prefix preserves trailing digits");
      expect(((List<?>)decode.invoke(nine,"10")).isEmpty(), "nine-key rejects non-pinyin digits");
      clear.invoke(lex); add.invoke(lex,"ls","聊商",true);
      Method rankNine=lexClass.getMethod("rankNine",String.class,List.class,boolean.class);
      expect(((List<?>)rankNine.invoke(lex,"57",Collections.emptyList(),false)).size()==1, "nine-key manual shortcuts work with learning disabled");
      Class<?> enClass=loader.loadClass("expo.modules.chatqkeyboard.EnglishEngine");
      Object en=enClass.getConstructor(Context.class,SharedPreferences.class).newInstance(getTargetContext(),prefs);
      Method correct=enClass.getMethod("correction",String.class), suggest=enClass.getMethod("suggest",String.class), remember=enClass.getMethod("remember",String.class);
      expect("the".equals(correct.invoke(en,"teh")), "English transposition correction");
      expect("hello".equals(correct.invoke(en,"helo")), "English missing letter correction");
      expect("world".equals(correct.invoke(en,"wrold")), "English offline frequency ranking");
      expect("THE".equals(correct.invoke(en,"TEH")) && "The".equals(correct.invoke(en,"Teh")), "English correction preserves capitalization");
      expect(correct.invoke(en,"world")==null && correct.invoke(en,"ChatQ")==null && correct.invoke(en,"xy")==null, "English keeps correct words names and short codes");
      expect(!((List<?>)suggest.invoke(en,"hell")).isEmpty(), "English prefix candidates");
      remember.invoke(en,"teh"); expect(correct.invoke(en,"teh")==null, "explicitly remembered English bypasses correction");
      Class<?> wavClass=loader.loadClass("expo.modules.chatqkeyboard.VoiceRecorder");
      Object wavCompanion=wavClass.getField("Companion").get(null);
      byte[] pcm=new byte[32000], wav=(byte[])wavCompanion.getClass().getMethod("wav",byte[].class).invoke(wavCompanion,(Object)pcm);
      java.nio.ByteBuffer header=java.nio.ByteBuffer.wrap(wav).order(java.nio.ByteOrder.LITTLE_ENDIAN);
      expect(wav.length==32044 && header.getInt(24)==16000 && header.getShort(22)==1 && header.getInt(40)==32000, "voice produces bounded 16kHz mono WAV");
      Class<?> voiceClass=loader.loadClass("expo.modules.chatqkeyboard.VoiceSession"); Object voice=voiceClass.getField("INSTANCE").get(null);
      android.view.inputmethod.EditorInfo editor=new android.view.inputmethod.EditorInfo();editor.packageName="fixture";editor.fieldId=101;editor.inputType=1;
      Method begin=voiceClass.getMethod("begin",android.view.inputmethod.EditorInfo.class), complete=voiceClass.getMethod("complete",String.class,String.class), take=voiceClass.getMethod("take",android.view.inputmethod.EditorInfo.class);
      String token=(String)begin.invoke(voice,editor);
      expect(!(Boolean)complete.invoke(voice,"wrong-token","must not insert"), "voice rejects mismatched session");
      complete.invoke(voice,token,"语音预览"); expect("语音预览".equals(take.invoke(voice,editor)) && take.invoke(voice,editor)==null, "voice result consumed only once by original field");
      token=(String)begin.invoke(voice,editor);complete.invoke(voice,token,"must not insert");editor.fieldId=102;
      expect(take.invoke(voice,editor)==null,"voice never transfers transcript to another field");
      checks += InputNetworkChecks.run(getTargetContext(),prefs);
      checks += CandidateChecks.run(getTargetContext(),prefs);
      result.putString("stream", "PASS " + checks + " native preference/lexicon checks\n"); finish(Activity.RESULT_OK, result);
    } catch (Throwable failure) {
      java.io.StringWriter trace=new java.io.StringWriter();failure.printStackTrace(new java.io.PrintWriter(trace));result.putString("stream", "FAIL: " + trace.toString() + "\n"); finish(Activity.RESULT_CANCELED, result);
    } finally { prefs.edit().clear().commit(); }
  }
  private static String candidate(Object item,String method) { try { return String.valueOf(item.getClass().getMethod(method).invoke(item)); } catch(Exception e) { throw new RuntimeException(e); } }
  private static boolean contains(List<?> items,String text,int consumed) { for(Object item:items) if(candidate(item,"getText").equals(text) && (consumed<0 || candidate(item,"getConsumed").equals(String.valueOf(consumed)))) return true; return false; }
  private void shell(String command) throws Exception { android.os.ParcelFileDescriptor fd=getUiAutomation().executeShellCommand(command);try(java.io.InputStream stream=new android.os.ParcelFileDescriptor.AutoCloseInputStream(fd)){byte[] buffer=new byte[4096];while(stream.read(buffer)>=0){}} }
  private void tap(int x,int y) { tap(x,y,100); }
  private void tap(int x,int y,int delay) {
    long now=android.os.SystemClock.uptimeMillis();
    android.view.MotionEvent down=android.view.MotionEvent.obtain(now,now,0,x,y,0);down.setSource(android.view.InputDevice.SOURCE_TOUCHSCREEN);getUiAutomation().injectInputEvent(down,true);down.recycle();
    android.view.MotionEvent up=android.view.MotionEvent.obtain(now,android.os.SystemClock.uptimeMillis(),1,x,y,0);up.setSource(android.view.InputDevice.SOURCE_TOUCHSCREEN);getUiAutomation().injectInputEvent(up,true);up.recycle();android.os.SystemClock.sleep(delay);
  }
  private String field(android.view.accessibility.AccessibilityNodeInfo root) {
    if(root==null)return null;
    if("android.widget.EditText".contentEquals(root.getClassName()))return String.valueOf(root.getText());
    for(int i=0;i<root.getChildCount();i++){String text=field(root.getChild(i));if(text!=null)return text;}return null;
  }
  private String editorText() {
    for(android.view.accessibility.AccessibilityWindowInfo window:getUiAutomation().getWindows()){String text=field(window.getRoot());if(text!=null)return text;}return field(getUiAutomation().getRootInActiveWindow());
  }
  private void voiceUi() throws Exception {
    android.accessibilityservice.AccessibilityServiceInfo serviceInfo=getUiAutomation().getServiceInfo();serviceInfo.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;getUiAutomation().setServiceInfo(serviceInfo);
    shell("am start -n com.jaxon.app.chatq/.MainActivity");android.os.SystemClock.sleep(1000);
    shell("ime set com.jaxon.app.chatq/expo.modules.chatqkeyboard.ChatQInputMethodService");
    shell("am start -S -n com.chatq.keyboardfixture/.FixtureActivity --es seed Q");android.os.SystemClock.sleep(1200);
    if(findText("更多")==null)tap(32,60);
    for(int i=0;i<30&&findText("更多")==null;i++)android.os.SystemClock.sleep(100);
    if(findText("更多")==null) { String visible="";for(android.view.accessibility.AccessibilityWindowInfo window:getUiAutomation().getWindows())visible+=nodeTexts(window.getRoot());throw new AssertionError("keyboard is not visible before voice handoff: "+visible); }
    shell("input keyevent 4");android.os.SystemClock.sleep(200);
    Class<?> type=getTargetContext().getClassLoader().loadClass("expo.modules.chatqkeyboard.VoiceSession");Object voice=type.getField("INSTANCE").get(null);
    android.view.inputmethod.EditorInfo editor=new android.view.inputmethod.EditorInfo();editor.packageName="com.chatq.keyboardfixture";editor.fieldId=101;editor.inputType=0x20001;
    String token=(String)type.getMethod("begin",android.view.inputmethod.EditorInfo.class).invoke(voice,editor);
    String transcript="Hello, this is a voice typing test for the keyboard.";
    type.getMethod("complete",String.class,String.class).invoke(voice,token,transcript);
    tap(32,60);for(int i=0;i<20&&findText("填入文字")==null;i++)android.os.SystemClock.sleep(250);
    expect(findText("填入文字")!=null,"voice preview is ready before insertion test");
    expect("Q".equals(editorText()),"voice preview does not insert automatically; actual="+editorText());
    tap(240,612);android.os.SystemClock.sleep(500);
    String actual=editorText();expect(actual!=null&&actual.contains(transcript)&&actual.length()==transcript.length()+1,"voice fill targets original field");
  }
  private android.view.accessibility.AccessibilityNodeInfo findText(android.view.accessibility.AccessibilityNodeInfo root,String text) {
    if(root==null)return null;if(arguments!=null&&"true".equals(arguments.getString("chatToolsUi")))root.refresh();if(text.equals(String.valueOf(root.getText())))return root;
    for(int i=0;i<root.getChildCount();i++){android.view.accessibility.AccessibilityNodeInfo found=findText(root.getChild(i),text);if(found!=null)return found;}return null;
  }
  private android.view.accessibility.AccessibilityNodeInfo findText(String text) {
    for(android.view.accessibility.AccessibilityWindowInfo window:getUiAutomation().getWindows()){android.view.accessibility.AccessibilityNodeInfo found=findText(window.getRoot(),text);if(found!=null)return found;}return null;
  }
  private String nodeTexts(android.view.accessibility.AccessibilityNodeInfo root) { if(root==null)return "";String value=(root.getText()==null?"":root.getText()+"|")+(root.getContentDescription()==null?"":"["+root.getContentDescription()+"]");for(int i=0;i<root.getChildCount();i++)value+=nodeTexts(root.getChild(i));return value; }
  private void cloudUi() throws Exception {
    android.accessibilityservice.AccessibilityServiceInfo info=getUiAutomation().getServiceInfo();info.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;getUiAutomation().setServiceInfo(info);
    SharedPreferences actualPrefs=getTargetContext().getSharedPreferences("chatq_keyboard",Context.MODE_PRIVATE);
    Class<?> configClass=getTargetContext().getClassLoader().loadClass("expo.modules.chatqkeyboard.TypingPreferences");Object config=configClass.getConstructor(SharedPreferences.class).newInstance(actualPrefs);Method update=configClass.getMethod("update",JSONObject.class);
    JSONObject previous=(JSONObject)configClass.getMethod("snapshot").invoke(config);
    String previousLexicon=actualPrefs.getString("typingLexicon",null);
    try {
      Class<?> lexType=getTargetContext().getClassLoader().loadClass("expo.modules.chatqkeyboard.UserLexicon");Object lex=lexType.getConstructor(SharedPreferences.class).newInstance(actualPrefs);lexType.getMethod("remove",String.class,String.class).invoke(lex,"yunciku","云词库");
      update.invoke(config,new JSONObject().put("cloudWords",true).put("chinese",true).put("layout","qwerty"));
      shell("am start -n com.jaxon.app.chatq/.MainActivity");android.os.SystemClock.sleep(1000);
      shell("ime set com.jaxon.app.chatq/expo.modules.chatqkeyboard.ChatQInputMethodService");
      shell("am start -S -n com.chatq.keyboardfixture/.FixtureActivity --es seed Q");android.os.SystemClock.sleep(1300);if(findText("更多")==null)tap(32,60);
      for(int i=0;i<20&&findText("更多")==null;i++)android.os.SystemClock.sleep(250);
      if(findText("英/中")!=null){tap(64,612);android.os.SystemClock.sleep(300);}
      for(int i=0;i<20 && findText("分词")==null;i++)android.os.SystemClock.sleep(250);
      expect(findText("分词")!=null,"Chinese keyboard ready before cloud input");shell("input keyevent 67");
      String taps="input tap 175 456; input tap 206 456; input tap 223 560; input tap 127 560; input tap 238 456; input tap 253 508; input tap 206 456";
      for(String command:taps.split("; "))shell(command);for(int i=0;i<20&&findText("云词库☁")==null;i++)android.os.SystemClock.sleep(250);
      android.view.accessibility.AccessibilityNodeInfo cloud=findText("云词库☁");if(cloud==null){String visible="";for(android.view.accessibility.AccessibilityWindowInfo window:getUiAutomation().getWindows())visible+=nodeTexts(window.getRoot());throw new AssertionError("no cloud; editor="+editorText()+"; cloud="+((JSONObject)configClass.getMethod("snapshot").invoke(config)).getBoolean("cloudWords")+"; visible="+visible);}
      expect("yunciku".equals(editorText()),"cloud candidates do not auto-insert");
      android.graphics.Rect bounds=new android.graphics.Rect();cloud.getBoundsInScreen(bounds);tap(bounds.centerX(),bounds.centerY());android.os.SystemClock.sleep(300);
      expect("云词库".equals(editorText()),"cloud word inserts without cloud marker");expect(findText("action:0 count:0")!=null,"cloud selection does not send");
      shell("am start -S -n com.chatq.keyboardfixture/.FixtureActivity --es mode private --es seed Q");android.os.SystemClock.sleep(900);for(String command:taps.split("; "))shell(command);android.os.SystemClock.sleep(1800);
      expect(findText("云词库☁")==null,"private editor has no cloud candidates");tap(185,344);android.os.SystemClock.sleep(200);expect(findText("语音输入")==null,"private editor cannot launch recording");
    } finally { update.invoke(config,previous);SharedPreferences.Editor restore=actualPrefs.edit();if(previousLexicon==null)restore.remove("typingLexicon");else restore.putString("typingLexicon",previousLexicon);restore.commit(); }
  }
  private void clickText(String text) {
    android.view.accessibility.AccessibilityNodeInfo node=findText(text);
    for(int retry=0;node==null&&retry<10;retry++){android.os.SystemClock.sleep(50);node=findText(text);}
    if(node==null) { String visible="";for(android.view.accessibility.AccessibilityWindowInfo window:getUiAutomation().getWindows())visible+=nodeTexts(window.getRoot());throw new AssertionError("missing key: "+text+"; visible="+visible); }
    android.graphics.Rect bounds=new android.graphics.Rect();node.getBoundsInScreen(bounds);tap(bounds.centerX(),bounds.centerY());try { getUiAutomation().waitForIdle(150,3000); } catch (java.util.concurrent.TimeoutException ignored) {}
  }
  private android.view.accessibility.AccessibilityNodeInfo firstButton(android.view.accessibility.AccessibilityNodeInfo root) {
    if(root==null)return null;if("android.widget.Button".contentEquals(root.getClassName())&&root.getText()!=null&&!root.getText().toString().trim().isEmpty())return root;
    for(int i=0;i<root.getChildCount();i++){android.view.accessibility.AccessibilityNodeInfo found=firstButton(root.getChild(i));if(found!=null)return found;}return null;
  }
  private android.view.accessibility.AccessibilityNodeInfo replyButton(android.view.accessibility.AccessibilityNodeInfo root) {
    if(root==null)return null;if("android.widget.ScrollView".contentEquals(root.getClassName()))return firstButton(root);
    for(int i=0;i<root.getChildCount();i++){android.view.accessibility.AccessibilityNodeInfo found=replyButton(root.getChild(i));if(found!=null)return found;}return null;
  }
  private void topicsUi() throws Exception {
    android.accessibilityservice.AccessibilityServiceInfo info=getUiAutomation().getServiceInfo();info.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;getUiAutomation().setServiceInfo(info);
    SharedPreferences prefs=getTargetContext().getSharedPreferences("chatq_keyboard",Context.MODE_PRIVATE);String key=prefs.getString("apiKey",null);
    try {
      shell("am start -n com.jaxon.app.chatq/.MainActivity");for(int i=0;i<60 && findText("已连接")==null;i++)android.os.SystemClock.sleep(200);key=prefs.getString("apiKey",null);expect(key!=null && !key.isEmpty(),"host connection ready before offline and real AI tests");prefs.edit().remove("apiKey").commit();shell("ime set com.jaxon.app.chatq/expo.modules.chatqkeyboard.ChatQInputMethodService");fresh("Q");
      for(int i=0;i<100 && findText("AI/话题")==null;i++){if(i==0||i==30)tap(32,60);android.os.SystemClock.sleep(100);}
      hostTap("AI 回复与话题库");hostTap("找话题");
      expect(findText("AI 找话题")!=null && findText("生成回复")==null,"topic mode has distinct controls without requiring a message");
      String opener="今天有没有哪件小事，让你心情突然变好了？";
      expect(findText(opener)!=null,"offline topic visible without API configuration");textIs("Q","opening the library does not insert");
      clickText(opener);textIs(opener,"only explicit topic tap inserts");expect(findText("action:0 count:0")!=null,"topic never auto sends");
      clickText("怎么接着聊");expect(findText("当时是什么感觉呀？")!=null,"follow-up hint available");
      clickText("当时是什么感觉呀？");textIs(opener+"当时是什么感觉呀？","follow-up inserts only after selection");clickText("返回话题库");
      clickText("换一批");expect(findText(opener)==null,"refresh changes the local batch");
      clickText("AI 找话题");expect(findText("请先打开聊商 App，完成服务器连接")!=null,"missing configuration is actionable; offline topics remain usable");
      prefs.edit().putString("apiKey",key).commit();
      clickText("AI 找话题");
      for(int i=0;i<160 && findText("AI 正在思考…")!=null;i++)android.os.SystemClock.sleep(500);
      android.view.accessibility.AccessibilityNodeInfo reply=null;for(android.view.accessibility.AccessibilityWindowInfo window:getUiAutomation().getWindows()){reply=replyButton(window.getRoot());if(reply!=null)break;}
      expect(reply!=null && description("AI 话题："+reply.getText())!=null,"real server returns a selectable AI topic");
      String ai=reply.getText().toString();textIs(opener+"当时是什么感觉呀？","real AI preview does not insert automatically");clickText(ai);
      textIs(opener+"当时是什么感觉呀？"+ai,"explicit AI topic tap inserts");expect(findText("action:0 count:0")!=null,"AI topic never sends");
      hostTap("返回打字");expect(findText("q")!=null || findText("2 ABC")!=null,"return to normal input");
      fresh("SAFE");hostTap("AI 回复与话题库");expect(description("AI 话题："+ai)==null,"old AI topic does not leak into another input session");
      hostTap("返回打字");shell("am start -S -n com.chatq.keyboardfixture/.FixtureActivity --es mode password --es seed SAFE");android.os.SystemClock.sleep(1500);hostTap("AI 回复与话题库");expect(findText("此输入框不启用话题库与 AI")!=null || findText("此输入框已停用 AI")!=null,"password field disables topics");
    } finally { if(key!=null)prefs.edit().putString("apiKey",key).commit();else prefs.edit().remove("apiKey").commit(); }
  }
  private void aiUi() throws Exception {
    android.accessibilityservice.AccessibilityServiceInfo info=getUiAutomation().getServiceInfo();info.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;getUiAutomation().setServiceInfo(info);
    SharedPreferences prefs=getTargetContext().getSharedPreferences("chatq_keyboard",Context.MODE_PRIVATE);int previous=prefs.getInt("replyCount",1);
    try {
      prefs.edit().putInt("replyCount",1).commit();shell("am start -n com.jaxon.app.chatq/.MainActivity");for(int i=0;i<60 && findText("已连接")==null;i++)android.os.SystemClock.sleep(200);shell("ime set com.jaxon.app.chatq/expo.modules.chatqkeyboard.ChatQInputMethodService");fresh("Goodnight");
      if(findText("AI/话题")==null){tap(32,60);for(int i=0;i<20 && findText("AI/话题")==null;i++)android.os.SystemClock.sleep(100);}
      android.os.SystemClock.sleep(500);hostTap("AI 回复与话题库");clickText("写回复");clickText("读取选中");clickText("生成回复");
      for(int i=0;i<160 && findText("点击回复填入聊天框 · 1 条候选")==null;i++)android.os.SystemClock.sleep(500);
      if(findText("点击回复填入聊天框 · 1 条候选")==null){String visible="";for(android.view.accessibility.AccessibilityWindowInfo window:getUiAutomation().getWindows())visible+=nodeTexts(window.getRoot());throw new AssertionError("AI reply failed: "+visible);}
      textIs("Goodnight","AI reply does not auto insert");
      android.view.accessibility.AccessibilityNodeInfo reply=null;for(android.view.accessibility.AccessibilityWindowInfo window:getUiAutomation().getWindows()){reply=replyButton(window.getRoot());if(reply!=null)break;}
      expect(reply!=null,"real reply is a selectable candidate");String expected=reply.getText().toString();android.graphics.Rect bounds=new android.graphics.Rect();reply.getBoundsInScreen(bounds);tap(bounds.centerX(),bounds.centerY());
      textIs(expected,"AI fills only the selected reply");expect(findText("action:0 count:0")!=null,"AI reply never sends automatically");
    } finally { prefs.edit().putInt("replyCount",previous).commit(); }
  }
  private void letters(String value) { letters(value,100); }
  private void letters(String value,int delay) { Map<Character,android.graphics.Rect> keys=new HashMap<>();for(char c:value.toCharArray()){if(!keys.containsKey(c)){android.view.accessibility.AccessibilityNodeInfo n=findText(String.valueOf(c));if(n==null)throw new AssertionError("missing letter "+c);android.graphics.Rect b=new android.graphics.Rect();n.getBoundsInScreen(b);keys.put(c,b);}}for(char c:value.toCharArray()){android.graphics.Rect b=keys.get(c);tap(b.centerX(),b.centerY(),delay);} }
  private void fresh(String seed) throws Exception {
    shell("am start -S -n com.chatq.keyboardfixture/.FixtureActivity --es seed "+seed);android.os.SystemClock.sleep(1100);
    for(int i=0;i<40 && findText("更多")==null;i++){if(i==0||i==20)tap(32,60);android.os.SystemClock.sleep(100);}
    expect(findText("更多")!=null,"fixture editor has attached keyboard before typing");
    shell("am broadcast -a com.chatq.keyboardfixture.EDIT --ez selectAll true");android.os.SystemClock.sleep(100);
  }
  private void expressionEditor(String mode) throws Exception {
    shell("am start -S -n com.chatq.keyboardfixture/.FixtureActivity --es mode "+mode+" --es seed SAFE --ei start 4 --ei end 4");
    android.os.SystemClock.sleep(1100);if(findText("SAFE")!=null)hostTap("SAFE");else tap(32,60);chatWait("更多");android.os.SystemClock.sleep(300);
  }
  private void imeExpressionsUi() throws Exception {
    arguments.putString("chatToolsUi","true");
    android.accessibilityservice.AccessibilityServiceInfo si=getUiAutomation().getServiceInfo();si.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;getUiAutomation().setServiceInfo(si);
    SharedPreferences prefs=getTargetContext().getSharedPreferences("chatq_keyboard",0);String old=prefs.getString("typingPreferences",null);
    Class<?> type=getTargetContext().getClassLoader().loadClass("expo.modules.chatqkeyboard.TypingPreferences");Object config=type.getConstructor(SharedPreferences.class).newInstance(prefs);
    try {
      type.getMethod("update",JSONObject.class).invoke(config,new JSONObject().put("cloudWords",false).put("theme",arguments.getString("expressionTheme","light")).put("height","normal").put("numberRow",false).put("layout","qwerty"));
      shell("ime set com.jaxon.app.chatq/expo.modules.chatqkeyboard.ChatQInputMethodService");expressionEditor("richpng");hostTap("表情");
      expect(description("候选词栏")==null,"typing-only candidate strip is removed in expression browser");
      float density=getTargetContext().getResources().getDisplayMetrics().density;
      for(String name:new String[]{"返回打字","Emoji 表情","颜文字","图片表情包","开心 😀","删除"}) { android.graphics.Rect b=boundsOf(name);expect(b.width()>=48*density&&b.height()>=48*density,"48dp expression target: "+name+" "+b); }
      sectionShot("ime120-emoji");hostTap("开心 😀");textIs("SAFE😀","emoji inserts once at cursor");hostTap("删除");textIs("SAFE","delete removes full emoji without source loss");
      description("日常 表情分类").performAction(android.view.accessibility.AccessibilityNodeInfo.AccessibilityAction.ACTION_SHOW_ON_SCREEN.getId());android.os.SystemClock.sleep(150);hostTap("日常 表情分类");
      expect(description("日常 表情分类").isSelected(),"selected category remains announced");android.graphics.Rect category=boundsOf("日常 表情分类"),categoryBar=boundsOf("表情分类栏");expect(category.left>=categoryBar.left&&category.right<=categoryBar.right,"selected category remains fully visible after rerender");
      description("一家人 👨‍👩‍👧‍👦").performAction(android.view.accessibility.AccessibilityNodeInfo.AccessibilityAction.ACTION_SHOW_ON_SCREEN.getId());android.os.SystemClock.sleep(150);hostTap("一家人 👨‍👩‍👧‍👦");textIs("SAFE👨‍👩‍👧‍👦","legacy family grapheme remains available");hostTap("删除");textIs("SAFE","family grapheme deletes as one unit");
      hostTap("颜文字");sectionShot("ime120-kaomoji");hostTap("打招呼 (｡･ω･｡)ﾉ♡");textIs("SAFE(｡･ω･｡)ﾉ♡","kaomoji inserts once");
      hostTap("图片表情包");sectionShot("ime120-stickers");hostTap("预览打招呼图片表情");chatWait("使用表情");sectionShot("ime120-preview");
      expect(findText("images:0 attempts:0")!=null,"preview does not commit image");
      android.graphics.Rect primary=boundsOf("使用表情"),back=boundsOf("返回打字");expect(primary.height()>=48*density&&primary.bottom<=getUiAutomation().takeScreenshot().getHeight(),"primary action visible and at least 48dp");expect(back.top<primary.top,"stable return before preview action");
      android.graphics.Rect draft=boundsOf("SAFE(｡･ω･｡)ﾉ♡");expect(draft.height()>=32*density&&draft.bottom<=back.top,"preview leaves current draft readable above keyboard: "+draft+" "+back);
      if("true".equals(arguments.getString("expressionPreviewOnly"))) { hostTap("返回打字");chatWait("q");sectionShot("ime120-typing");return; }
      hostTap("使用表情");chatWait("images:1 attempts:1 PNG:512 alpha:true");chatWait("q");textIs("SAFE(｡･ω･｡)ﾉ♡","rich image preserves editor text");
      for(String mode:new String[]{"richwild","richany"}) { expressionEditor(mode);hostTap("表情");hostTap("图片表情包");hostTap("预览抱抱图片表情");hostTap("使用表情");chatWait("images:1 attempts:1 PNG:512 alpha:true");textIs("SAFE","wildcard rich receiver preserves text"); }
      expressionEditor("richreject");hostTap("表情");hostTap("图片表情包");hostTap("预览谢谢图片表情");hostTap("使用表情");chatWait("当前应用未接收图片，可改用系统分享。");expect(findText("images:0 attempts:1 rejected")!=null,"rejected image has no automatic retry");sectionShot("ime120-rejected");hostTap("返回打字");chatWait("q");textIs("SAFE","rejection keeps draft and can exit");
      expressionEditor("richjpeg");hostTap("表情");hostTap("图片表情包");hostTap("预览打招呼图片表情");expect(findText("分享表情")!=null&&findText("使用表情")==null,"JPEG-only receiver has explicit sharing fallback");hostTap("分享表情");chatWait("Share");sectionShot("ime120-share");shell("input keyevent 4");android.os.SystemClock.sleep(400);expect(findText("images:0 attempts:0")!=null,"cancelled chooser never inserts");textIs("SAFE","chooser cancel preserves editor");
      expressionEditor("richpng");hostTap("表情");hostTap("图片表情包");hostTap("预览打招呼图片表情");hostTap("返回表情包");expect(findText("images:0 attempts:0")!=null,"preview back never commits");hostTap("返回打字");chatWait("q");
      hostTap("表情");hostTap("图片表情包");hostTap("预览抱抱图片表情");shell("input keyevent 4");chatWait("q");expect(findText("images:0 attempts:0")!=null,"system back returns to typing without committing");
      for(String mode:new String[]{"private","password","uri"}) { expressionEditor(mode);hostTap("表情");hostTap("图片表情包");hostTap("预览打招呼图片表情");expect(findText("此处暂不可用")!=null&&!findText("此处暂不可用").isEnabled(),"restricted editor blocks image/share: "+mode);hostTap("返回打字"); }
      expressionEditor("send");hostTap("表情");hostTap("开心 😀");hostTap("返回打字");textIs("SAFE😀","text expression only edits even in SEND editor");expect(findText("action:0 count:0")!=null,"text expression never invokes send action");sectionShot("ime120-typing");
    } finally { if(old==null)prefs.edit().remove("typingPreferences").commit();else prefs.edit().putString("typingPreferences",old).commit(); }
  }
  private void textIs(String expected,String label) { String actual=editorText();expect(expected.equals(actual),label+" expected=["+expected+"] actual=["+actual+"]"); }
  private android.view.accessibility.AccessibilityNodeInfo description(android.view.accessibility.AccessibilityNodeInfo root,String value){if(root==null)return null;if(arguments!=null&&"true".equals(arguments.getString("chatToolsUi")))root.refresh();if(value.equals(String.valueOf(root.getContentDescription())))return root;for(int i=0;i<root.getChildCount();i++){android.view.accessibility.AccessibilityNodeInfo result=description(root.getChild(i),value);if(result!=null)return result;}return null;}
  private android.view.accessibility.AccessibilityNodeInfo description(String value){for(android.view.accessibility.AccessibilityWindowInfo window:getUiAutomation().getWindows()){android.view.accessibility.AccessibilityNodeInfo result=description(window.getRoot(),value);if(result!=null)return result;}return null;}
  private void digits(String value){String[] labels={"2 ABC","3 DEF","4 GHI","5 JKL","6 MNO","7 PQRS","8 TUV","9 WXYZ"};Map<Character,android.graphics.Rect> keys=new HashMap<>();for(char c:value.toCharArray()){if(!keys.containsKey(c)){android.view.accessibility.AccessibilityNodeInfo n=findText(labels[c-'2']);if(n==null)throw new AssertionError("missing digit "+c);android.graphics.Rect b=new android.graphics.Rect();n.getBoundsInScreen(b);keys.put(c,b);}}for(char c:value.toCharArray()){android.graphics.Rect b=keys.get(c);tap(b.centerX(),b.centerY(),20);}}
  private void clickExpanded(String text)throws Exception{
    for(int i=0;i<16;i++){
      android.view.accessibility.AccessibilityNodeInfo scroll=description("AI 结果列表"), node=findText(text);
      if(node==null)node=description(text);
      if(node!=null&&scroll!=null){node.performAction(android.view.accessibility.AccessibilityNodeInfo.AccessibilityAction.ACTION_SHOW_ON_SCREEN.getId());android.os.SystemClock.sleep(150);node=findText(text);if(node==null)node=description(text);}
      if(node!=null){android.graphics.Rect b=new android.graphics.Rect();node.getBoundsInScreen(b);if(node.isVisibleToUser()&&b.height()>=(scroll==null?1:48)){tap(b.centerX(),b.centerY());return;}}
      if(scroll!=null){android.graphics.Rect r=new android.graphics.Rect();scroll.getBoundsInScreen(r);shell("input swipe "+r.centerX()+" "+(r.bottom-8)+" "+r.centerX()+" "+(r.top+8)+" 200");}
      else shell("input swipe 160 600 160 445 200");
      android.os.SystemClock.sleep(100);
    }
    throw new AssertionError("missing expanded candidate: "+text);
  }
  private void candidateUi() throws Exception {
    android.accessibilityservice.AccessibilityServiceInfo info=getUiAutomation().getServiceInfo();info.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;getUiAutomation().setServiceInfo(info);
    SharedPreferences actual=getTargetContext().getSharedPreferences("chatq_keyboard",Context.MODE_PRIVATE);String savedLexicon=actual.getString("typingLexicon",null);
    Class<?> configType=getTargetContext().getClassLoader().loadClass("expo.modules.chatqkeyboard.TypingPreferences");Object config=configType.getConstructor(SharedPreferences.class).newInstance(actual);Method update=configType.getMethod("update",JSONObject.class);JSONObject previous=(JSONObject)configType.getMethod("snapshot").invoke(config);
    try {
      actual.edit().remove("typingLexicon").commit();update.invoke(config,new JSONObject().put("chinese",true).put("layout","qwerty").put("height","normal").put("numberRow",false).put("cloudWords",false).put("learning",true).put("predictions",true));
      shell("am start -n com.jaxon.app.chatq/.MainActivity");android.os.SystemClock.sleep(1000);shell("ime set com.jaxon.app.chatq/expo.modules.chatqkeyboard.ChatQInputMethodService");fresh("Q");if(findText("更多")==null)tap(32,60);for(int i=0;i<30&&findText("更多")==null;i++)android.os.SystemClock.sleep(100);expect(findText("更多")!=null,"keyboard is ready before candidate tests");
      letters("nihao",20);textIs("nihao","Pinyin composition waits for explicit selection");clickText("你好");textIs("你好","candidate confirms once");expect(description("联想词 呀")!=null,"selection shows local next-word association");android.os.SystemClock.sleep(350);textIs("你好","association never inserts automatically");clickText("呀");textIs("你好呀","explicit association tap inserts only suffix");clickText("空格");textIs("你好呀 ","space after association remains literal space");expect(description("联想词 呀")==null,"space clears association context");
      fresh("Q");letters("wzdl",20);clickText("我知道了");textIs("我知道了","chat initials commit whole phrase");expect(findText("action:0 count:0")!=null,"chat selection never sends");
      fresh("Q");letters("nihao",20);clickText("你好");shell("am broadcast -a com.chatq.keyboardfixture.EDIT --ei cursor 0");android.os.SystemClock.sleep(300);expect(description("联想词 呀")==null,"moving editor cursor clears old predictions");letters("mwt",20);clickText("没问题");textIs("没问题你好","typing at moved cursor keeps existing text");
      fresh("Q");letters("nihao",20);clickText("你好");hostTap("AI 回复与话题库");hostTap("返回打字");expect(description("联想词 呀")==null,"AI panel round-trip clears old association views");
      fresh("Q");letters("nihao",20);clickText("你好");tap(100,118);expect(description("联想词 呀")==null,"switching editors clears association context");
      shell("am start -S -n com.chatq.keyboardfixture/.FixtureActivity --es mode private --es seed Q");android.os.SystemClock.sleep(1100);letters("nihao",20);clickText("你好");expect(description("联想词 呀")==null,"private editor has no predictions");
      fresh("Q");tap(100,178);expect(description("联想词 呀")==null,"password field has no predictions");
      update.invoke(config,new JSONObject().put("predictions",false));fresh("Q");letters("nihao",20);clickText("你好");expect(description("联想词 呀")==null,"prediction switch disables associations");
      update.invoke(config,new JSONObject().put("predictions",true).put("layout","nine"));fresh("Q");digits("64426");clickText("你好");textIs("你好","nine-key phrase confirms once");expect(description("联想词 呀")!=null,"nine-key shares local associations");clickText("呀");textIs("你好呀","nine-key association tap inserts suffix");
      fresh("Q");digits("6442694664486");hostTap("展开候选词");expect(findText("你好中国\nni hao zhong guo")!=null,"expanded nine-key offers composed sentence with syllables");clickText("你好中国\nni hao zhong guo");textIs("你好中国","nine-key sentence commits all digits");
      fresh("Q");digits("6442694664486");hostTap("展开候选词");clickExpanded("你好\nni hao");textIs("你好94664486","partial selection leaves remaining nine-key composition");clickText("空格");textIs("你好中国","remaining digits decode independently");
      fresh("Q");digits("64");android.view.accessibility.AccessibilityNodeInfo strip=description("候选词栏");expect(strip!=null&&strip.getChildCount()<=14,"candidate strip contains at most fourteen views");hostTap("展开候选词");expect(findText("选音")!=null || findText("选择拼音")!=null || findText("你\nni")!=null,"ambiguous code retains expanded readings");
      update.invoke(config,new JSONObject().put("layout","qwerty"));fresh("Q");String burst="nihaozhongguowozhidaole";letters(burst,10);textIs(burst,"rapid Chinese typing does not drop or duplicate letters");
    } finally {update.invoke(config,previous);SharedPreferences.Editor edit=actual.edit();if(savedLexicon==null)edit.remove("typingLexicon");else edit.putString("typingLexicon",savedLexicon);edit.commit();}
  }


  private void hostTap(String label) {
    android.view.accessibility.AccessibilityNodeInfo node=description(label);
    if(node==null) {clickText(label);return;}
    android.graphics.Rect b=new android.graphics.Rect();node.getBoundsInScreen(b);tap(b.centerX(),b.centerY());android.os.SystemClock.sleep(150);
  }
  private void hostSeek(String label) throws Exception {
    for(int i=0;i<28;i++) {
      if(arguments!=null&&"true".equals(arguments.getString("chatToolsUi"))){android.view.accessibility.AccessibilityNodeInfo tool=description(label);if(tool!=null){tool.performAction(android.view.accessibility.AccessibilityNodeInfo.AccessibilityAction.ACTION_SHOW_ON_SCREEN.getId());android.os.SystemClock.sleep(200);tool=description(label);android.graphics.Rect bounds=new android.graphics.Rect();tool.getBoundsInScreen(bounds);if(bounds.height()>=40&&bounds.top>105&&bounds.bottom<620)return;}shell("input swipe 310 520 310 320 220");android.os.SystemClock.sleep(150);continue;}
      android.view.accessibility.AccessibilityNodeInfo n=findText(label);
      if(n==null)n=description(label);
      if(n!=null) {android.graphics.Rect b=new android.graphics.Rect();n.getBoundsInScreen(b);if(b.height()>20 && b.top>105 && b.bottom<565)return;}
      shell("input swipe 160 480 160 320 220");android.os.SystemClock.sleep(150);
    }
    String visible="";for(android.view.accessibility.AccessibilityWindowInfo window:getUiAutomation().getWindows())visible+=nodeTexts(window.getRoot());throw new AssertionError("missing host control "+label+"; "+visible);
  }
  private void setHostText(String label,String text) {
    android.view.accessibility.AccessibilityNodeInfo node=description(label);expect(node!=null,"host text field available: "+label);
    Bundle value=new Bundle();value.putCharSequence(android.view.accessibility.AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,text);
    expect(node.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_SET_TEXT,value),"host input accepts text: "+label);android.os.SystemClock.sleep(250);
  }
  private void hostUi() throws Exception {
    android.accessibilityservice.AccessibilityServiceInfo info=getUiAutomation().getServiceInfo();info.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;getUiAutomation().setServiceInfo(info);
    shell("am start -n com.jaxon.app.chatq/.MainActivity");for(int i=0;i<80&&findText("已连接")==null;i++)android.os.SystemClock.sleep(100);
    expect(findText("已连接")!=null,"host connects to real server");hostTap("帮回复");
    String prompt="今天有点累，先休息啦，明天再聊。";setHostText("对方消息",prompt);hostSeek("帮我想回复");hostTap("帮我想回复");
    for(int i=0;i<150 && description("复制回复")==null;i++)android.os.SystemClock.sleep(500);
    expect(description("复制回复")!=null,"real AI response appears in host");
    hostSeek("复制回复");hostTap("复制回复");expect(description("已复制 ✓")!=null,"copy uses inline feedback without blocking dialog");
    hostTap("记录");setHostText("搜索回复记录",prompt);android.os.SystemClock.sleep(450);
    expect(description("查看记录："+prompt)!=null,"history search finds newly saved original message");hostTap("查看记录："+prompt);
    hostSeek("复制这条回复");hostTap("复制这条回复");expect(description("已复制 ✓")!=null,"saved reply can be copied again");
    shell("input keyevent 4");android.os.SystemClock.sleep(300);expect(description("搜索回复记录")!=null,"back from detail returns to history list");
    setHostText("搜索回复记录","unmatched-query-"+System.currentTimeMillis());android.os.SystemClock.sleep(450);expect(findText("还没找到这条记录")!=null,"empty search has a clear state");
    hostTap("帮回复");hostSeek("轻松");hostTap("轻松");expect(description("复制回复")==null,"changing tone clears old candidates");
  }

  private void polishUi() throws Exception {
    android.accessibilityservice.AccessibilityServiceInfo info=getUiAutomation().getServiceInfo();info.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;getUiAutomation().setServiceInfo(info);
    SharedPreferences prefs=getTargetContext().getSharedPreferences("chatq_keyboard",Context.MODE_PRIVATE);
    Map<String,String> previous=new HashMap<>();for(String name:new String[]{"baseUrl","apiKey","deviceId"})previous.put(name,prefs.getString(name,null));
    try {
      shell("am start -n com.jaxon.app.chatq/.MainActivity");android.os.SystemClock.sleep(1200);
      shell("ime set com.jaxon.app.chatq/expo.modules.chatqkeyboard.ChatQInputMethodService");fresh("QA");
      for(int i=0;i<40&&findText("AI/话题")==null;i++){if(i==0||i==20)tap(32,60);android.os.SystemClock.sleep(100);}
      hostTap("AI 回复与话题库");clickText("写回复");clickText("读取选中");
      String old="{\"success\":true,\"data\":{\"candidates\":[\"stale-fixture-reply\"]}}";
      prefs.edit().putString("apiKey","ui-test-only").putString("deviceId","ui-test-only").commit();
      try(InputNetworkChecks.Server server=new InputNetworkChecks.Server(old,true)) {
        prefs.edit().putString("baseUrl","http://localhost:"+server.server.getLocalPort()).commit();clickText("生成回复");
        expect(server.received.await(3,java.util.concurrent.TimeUnit.SECONDS),"reply reaches local fixture");
        expect(findText("取消生成")!=null,"pending reply offers a visible cancellation action");clickText("取消生成");
        expect(findText("已取消生成，可手动重试")!=null,"cancel completes without leaving busy controls");server.release.countDown();android.os.SystemClock.sleep(350);
        expect(findText("stale-fixture-reply")==null,"cancelled response never reappears");textIs("QA","cancel does not touch editor");
      }
      try(InputNetworkChecks.Server server=new InputNetworkChecks.Server(old,true)) {
        prefs.edit().putString("baseUrl","http://localhost:"+server.server.getLocalPort()).commit();clickText("生成回复");
        expect(server.received.await(3,java.util.concurrent.TimeUnit.SECONDS),"second reply reaches fixture");
        clickText("清空");server.release.countDown();android.os.SystemClock.sleep(350);
        expect(findText("取消生成")==null && findText("stale-fixture-reply")==null,"clearing source cancels pending request and stale candidate");
        textIs("QA","clearing prompt preserves actual editor");
      }
      try(InputNetworkChecks.Server server=new InputNetworkChecks.Server(old,true)) {
        prefs.edit().putString("baseUrl","http://localhost:"+server.server.getLocalPort()).commit();hostTap("找话题");clickText("AI 找话题");
        expect(server.received.await(3,java.util.concurrent.TimeUnit.SECONDS),"topic reaches local fixture");clickText("取消生成");server.release.countDown();android.os.SystemClock.sleep(350);
        expect(findText("今天有没有哪件小事，让你心情突然变好了？")!=null,"cancelled AI topics restore usable offline library");
        expect(findText("stale-fixture-reply")==null,"cancelled topic never replaces offline library");
      }
      try(InputNetworkChecks.Server server=new InputNetworkChecks.Server("{\"success\":true,\"data\":{\"candidates\":[\"new-fixture-reply\"]}}",false)) {
        prefs.edit().putString("baseUrl","http://localhost:"+server.server.getLocalPort()).commit();clickText("写回复");clickText("读取选中");clickText("生成回复");
        for(int i=0;i<40&&findText("new-fixture-reply")==null;i++)android.os.SystemClock.sleep(100);
        expect(findText("new-fixture-reply")!=null,"later request succeeds after cancellation");textIs("QA","reply preview does not insert automatically");clickText("new-fixture-reply");textIs("new-fixture-reply","only explicit candidate tap inserts");
        expect(findText("action:0 count:0")!=null,"new controls never send messages");
      }
    } finally {
      SharedPreferences.Editor edit=prefs.edit();for(Map.Entry<String,String> entry:previous.entrySet())if(entry.getValue()==null)edit.remove(entry.getKey());else edit.putString(entry.getKey(),entry.getValue());edit.commit();
    }
  }

  private void sectionShot(String name) throws Exception {
    if(!"true".equals(arguments.getString("captureSections")))return;
    android.os.SystemClock.sleep(450);android.graphics.Bitmap bitmap=getUiAutomation().takeScreenshot();if(bitmap==null)throw new AssertionError("screenshot unavailable");
    try(java.io.FileOutputStream out=new java.io.FileOutputStream(new java.io.File(getTargetContext().getExternalFilesDir(null),"sections-"+name+".png"))){bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,out);}finally{bitmap.recycle();}
  }

  private void personalAiUi() throws Exception {
    android.accessibilityservice.AccessibilityServiceInfo info=getUiAutomation().getServiceInfo();info.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;getUiAutomation().setServiceInfo(info);
    Context context=getTargetContext();SharedPreferences prefs=context.getSharedPreferences("chatq_keyboard",0),vault=context.getSharedPreferences("chatq_personal_ai_v1",0);Map<String,?> old=new HashMap<>(prefs.getAll()),oldVault=new HashMap<>(vault.getAll());
    try(PersonalAiChecks.Fixture f=new PersonalAiChecks.Fixture();ChatHttpFixture platform=new ChatHttpFixture()){
      vault.edit().clear().commit();prefs.edit().putString("baseUrl","http://localhost:"+platform.listener.getLocalPort()).putString("apiKey","qa-local").putString("deviceId","qa-local").putBoolean("saveGenerationHistory",false).putString("personalization",PersonaChecks.data().toString()).putString("personaSelection","{\"cardId\":\"daily\"}").commit();
      shell("am start -a android.intent.action.VIEW -d chatq://api -n com.jaxon.app.chatq/.MainActivity");chatWait("API 基础地址");sectionShot("free-api-empty");
      layoutSeek("API 基础地址");setHostText("API 基础地址","http://localhost:"+f.server.getLocalPort()+"/custom/v1");layoutSeek("API 密钥");setHostText("API 密钥","fixture-ui-key");expect(description("API 密钥").isPassword(),"provider credential is masked");layoutSeek("模型名称");setHostText("模型名称","fixture-model");layoutSeek("保存配置");expect(boundsOf("保存配置").height()>=48,"save touch area is at least 48px on mdpi fixture");sectionShot("free-api-filled");hostTap("保存配置");chatWait("已保存，主应用与安卓键盘共用；尚未发起 API 请求。");expect(f.calls==0,"save is local only");expect(!vault.getAll().toString().contains("fixture-ui-key"),"UI writes encrypted provider config");sectionShot("free-api-saved");
      boolean delivery="true".equals(arguments.getString("deliveryUi"));
      if(delivery){
        shell("ime enable com.jaxon.app.chatq/expo.modules.chatqkeyboard.ChatQInputMethodService");shell("ime set com.jaxon.app.chatq/expo.modules.chatqkeyboard.ChatQInputMethodService");
        shell("am start -a android.intent.action.VIEW -d chatq://diagnostics -n com.jaxon.app.chatq/.MainActivity");chatWait("开始使用与自检");layoutSeek("查看我的 API");expect(boundsOf("查看我的 API").height()>=48,"diagnostic API action touch size");sectionShot("delivery-checks-top");
        layoutSeek("选择当前输入法");hostTap("选择当前输入法");android.os.SystemClock.sleep(400);sectionShot("delivery-system-picker");shell("input keyevent 4");layoutSeek("正在使用聊商键盘");expect(findText("正在使用聊商键盘")!=null,"selfcheck refreshes after picker focus");
        layoutSeek("打开试打区");hostTap("打开试打区");chatWait("自检键盘试打区");setHostText("自检键盘试打区","仅本地合成试打");shell("input keyevent 4");layoutSeek("清空试打内容");hostTap("清空试打内容");expect(description("自检键盘试打区").getText()==null||description("自检键盘试打区").getText().toString().isEmpty()||description("自检键盘试打区").getText().toString().contains("在这里"),"trial clear works");
        layoutSeek("复制检查结果");expect(boundsOf("复制检查结果").height()>=48,"diagnostic copy touch size");sectionShot("delivery-checks-bottom");expect(f.calls==0,"selfcheck and trial never invoke provider");
        shell("am start -a android.intent.action.VIEW -d chatq://api -n com.jaxon.app.chatq/.MainActivity");chatWait("API 基础地址");
      }
      if("true".equals(arguments.getString("layoutOnly")))return;
      layoutSeek("测试连接（消耗少量 API 用量）");hostTap("测试连接（消耗少量 API 用量）");chatWait("连接成功，密钥和模型可以使用。");expect(f.calls==1,"one explicit test request");
      hostTap("帮回复");layoutSeek("对方消息");setHostText("对方消息","合成对方消息");hostTap("帮我想回复");chatWait("自然回复");expect(f.calls==2,"host reply goes direct");sectionShot("free-host-reply");
      if(delivery){
        layoutSeek("改一改");hostTap("改一改");chatWait("改写与翻译");layoutSeek("更书面");expect(boundsOf("更书面").height()>=48,"rewrite row touch size");sectionShot("delivery-rewrite-top");layoutSeek("译成英文");expect(boundsOf("译成英文").height()>=48,"translation row touch size");sectionShot("delivery-rewrite-bottom");
        f.responseJson=new JSONObject().put("choices",new JSONArray().put(new JSONObject().put("message",new JSONObject().put("content","{\"candidates\":[\"Hello 42\"]}")).put("finish_reason","stop"))).toString();hostTap("译成英文");chatWait("Hello 42");expect(f.calls==3&&f.body.getJSONArray("messages").getJSONObject(0).getString("content").contains("Translate the text"),"host translation sends requested task exactly once");layoutSeek("恢复上一版");hostTap("恢复上一版");chatWait("自然回复");expect(f.calls==3,"host undo is local");f.responseJson=null;
      }
      shell("ime set com.jaxon.app.chatq/expo.modules.chatqkeyboard.ChatQInputMethodService");expressionEditor("send");hostTap("AI 回复与话题库");syntheticClipboard("合成对方消息");hostTap("粘贴并生成");chatWait("自然回复");expect(f.calls==(delivery?4:3),"IME uses saved personal API");sectionShot("free-ime-reply");
      if(delivery){hostTap("回复操作：自然回复");chatWait("更书面");sectionShot("delivery-ime-menu");clickText("翻译");chatWait("译成中文");sectionShot("delivery-ime-translation");f.responseJson=new JSONObject().put("choices",new JSONArray().put(new JSONObject().put("message",new JSONObject().put("content","{\"candidates\":[\"本地翻译42\"]}")).put("finish_reason","stop"))).toString();clickText("译成中文");chatWait("本地翻译42");expect(f.calls==5&&f.body.getJSONArray("messages").getJSONObject(0).getString("content").contains("翻译成简体中文"),"IME translation uses requested task");hostTap("回复操作：本地翻译42");clickText("恢复上一版");chatWait("自然回复");expect(f.calls==5,"IME undo does not call AI");f.responseJson=null;}
      hostTap("自然回复");chatWait("空格");textIs("SAFE自然回复","explicit insert returns to typing and preserves existing draft");expect(findText("action:0 count:0")!=null,"generated reply never sends a chat message");
      flowSeed("hello friend",12,12);hostTap("润色我的话");clickText("润色输入框");chatWait("自然回复");expect(f.calls==(delivery?6:4)&&f.body.getJSONArray("messages").getJSONObject(0).getString("content").contains("只改写"),"IME polish uses personal provider and correct intent");hostTap("返回打字");chatWait("空格");textIs("hello friend","returning from polish leaves draft intact");
      expect(platform.requests.isEmpty(),"no generated content sent to platform AI");
    }finally{AccountChecks.restore(prefs,old);AccountChecks.restore(vault,oldVault);}
  }
  private void paymentUi() throws Exception {
    arguments.putString("chatToolsUi","true");
    android.accessibilityservice.AccessibilityServiceInfo info=getUiAutomation().getServiceInfo();info.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;getUiAutomation().setServiceInfo(info);
    SharedPreferences prefs=getTargetContext().getSharedPreferences("chatq_keyboard",0),vault=getTargetContext().getSharedPreferences("chatq_account_v1",0);Map<String,?> old=new HashMap<>(prefs.getAll()),oldVault=new HashMap<>(vault.getAll());
    try(ChatHttpFixture fixture=new ChatHttpFixture()){
      fixture.paymentMode=true;vault.edit().clear().commit();prefs.edit().putString("baseUrl","http://localhost:"+fixture.listener.getLocalPort()).putString("apiKey","payment-local").putString("deviceId","payment-device").commit();
      shell("am start -n com.jaxon.app.chatq/.MainActivity");chatWait("已连接");hostTap("我的");layoutSeek("账号与会员");hostTap("账号与会员");layoutSeek("请先登录后购买");expect(!description("请先登录后购买").isEnabled(),"guest purchase requires account");
      layoutSeek("账号登录");hostTap("账号登录");layoutSeek("账号");setHostText("账号","qa_tester");layoutSeek("登录密码");setHostText("登录密码","password1");layoutSeek("登录");hostTap("登录");chatWait("qa_tester");layoutSeek("查看并购买套餐");hostTap("查看并购买套餐");chatWait("套餐与订单");
      layoutSeek("确认套餐并创建订单");expect(boundsOf("确认套餐并创建订单").height()>=48,"create touch target");sectionShot("payment-plan");hostTap("确认套餐并创建订单");chatWait("确认创建订单？");clickText("创建订单");chatWait("等待支付");expect(fixture.paymentCreates==1,"single explicit order created");
      layoutSeek("打开支付收银台");expect(boundsOf("打开支付收银台").height()>=48,"checkout touch target");sectionShot("payment-ready");hostTap("打开支付收银台");chatWait("前往支付收银台？");clickText("取消");expect(fixture.paymentChecks==0,"checkout confirmation cannot grant membership");
      layoutSeek("查询原订单并确认到账");hostTap("查询原订单并确认到账");chatWait("付款已确认，会员权益已刷新。可返回账号与会员查看。");expect(fixture.paymentChecks==1&&fixture.accountAuthSeen,"check and member refresh authenticated");layoutSeek("复制订单号");expect(boundsOf("复制订单号").height()>=48,"order copy touch target");sectionShot("payment-paid");expect(description("打开支付收银台")==null,"paid checkout removed");layoutSeek("核对到账与退款");expect(boundsOf("核对到账与退款").height()>=48,"settled receipt check touch target");hostTap("核对到账与退款");chatWait("退款待核对");expect(fixture.paymentChecks==2&&fixture.paymentCreates==1,"manual refund lookup never creates another payment");sectionShot("payment-refund");
      hostTap("返回");layoutSeek("不限次数");sectionShot("payment-member");expect(fixture.requests.isEmpty(),"payment UI never calls paid AI");
    }finally{AccountChecks.restore(prefs,old);AccountChecks.restore(vault,oldVault);}
  }
  private void accountUi() throws Exception {
    arguments.putString("chatToolsUi","true");
    android.accessibilityservice.AccessibilityServiceInfo info=getUiAutomation().getServiceInfo();info.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;getUiAutomation().setServiceInfo(info);
    SharedPreferences prefs=getTargetContext().getSharedPreferences("chatq_keyboard",0),vault=getTargetContext().getSharedPreferences("chatq_account_v1",0);
    Map<String,?> old=new HashMap<>(prefs.getAll()),oldVault=new HashMap<>(vault.getAll());
    try(ChatHttpFixture fixture=new ChatHttpFixture()) {
      vault.edit().clear().commit();prefs.edit().putString("baseUrl","http://localhost:"+fixture.listener.getLocalPort()).putString("apiKey","account-local").putString("deviceId","account-device").commit();
      shell("am start -n com.jaxon.app.chatq/.MainActivity");chatWait("已连接");hostTap("我的");layoutSeek("账号与会员");hostTap("账号与会员");chatWait("登录聊商账号");sectionShot("account-guest");
      layoutSeek("注册账号，保留设备权益");hostTap("注册账号，保留设备权益");chatWait("创建聊商账号");
      layoutSeek("账号");setHostText("账号","qa_tester");layoutSeek("新密码（8–128 位）");setHostText("新密码（8–128 位）","password1");layoutSeek("再次输入新密码");setHostText("再次输入新密码","different");layoutSeek("注册并登录");hostTap("注册并登录");chatWait("两次输入的密码不一致");expect(fixture.accountActions.isEmpty(),"mismatched passwords never upload");
      layoutSeek("再次输入新密码");setHostText("再次输入新密码","password1");layoutSeek("注册并登录");hostTap("注册并登录");chatWait("保存账号恢复码");sectionShot("account-recovery");shell("input keyevent 4");expect(findText("保存账号恢复码")!=null,"system back cannot discard unacknowledged recovery code");
      layoutSeek("我已保存，完成");hostTap("我已保存，完成");chatWait("qa_tester");expect(!vault.getString("session","").contains("synthetic-account-token"),"shipping UI saves encrypted session");layoutSeek("不限次数");sectionShot("account-member");expect(fixture.accountAuthSeen,"quota request uses account bearer");layoutSeek("重新生成恢复码");hostTap("重新生成恢复码");layoutSeek("当前密码");setHostText("当前密码","password1");layoutSeek("验证密码并生成新码");hostTap("验证密码并生成新码");chatWait("保存账号恢复码");expect(fixture.accountActions.contains("rotateRecovery"),"recovery code can be rotated after password verification");layoutSeek("我已保存，完成");hostTap("我已保存，完成");
      layoutSeek("修改密码");hostTap("修改密码");chatWait("修改登录密码");layoutSeek("当前密码");setHostText("当前密码","password1");layoutSeek("新密码（8–128 位）");setHostText("新密码（8–128 位）","new-password");layoutSeek("再次输入新密码");setHostText("再次输入新密码","new-password");layoutSeek("确认修改并登录");hostTap("确认修改并登录");chatWait("qa_tester");expect(fixture.accountActions.contains("changePassword"),"password management is connected");
      layoutSeek("退出登录");hostTap("退出登录");chatWait("退出账号？");clickText("退出登录");chatWait("登录聊商账号");expect(!vault.contains("session"),"logout clears native session");expect(fixture.accountActions.contains("logout"),"logout calls revocation endpoint");
      layoutSeek("账号登录");hostTap("账号登录");chatWait("欢迎回来");layoutSeek("账号");setHostText("账号","qa_tester");layoutSeek("登录密码");setHostText("登录密码","wrong");layoutSeek("登录");hostTap("登录");chatWait("账号或密码不正确");sectionShot("account-error");
      layoutSeek("忘记密码，用恢复码找回");hostTap("忘记密码，用恢复码找回");chatWait("找回账号密码");sectionShot("account-reset");layoutSeek("返回");expect(boundsOf("返回").height()>=48,"recovery screen return touch target");
      expect(description("账号").getText().toString().equals("qa_tester"),"forgot password preserves typed account name");
      layoutSeek("账号恢复码");setHostText("账号恢复码","short");layoutSeek("新密码（8–128 位）");setHostText("新密码（8–128 位）","recovered-password");layoutSeek("再次输入新密码");setHostText("再次输入新密码","recovered-password");layoutSeek("确认修改并登录");int beforeRecovery=fixture.accountActions.size();hostTap("确认修改并登录");chatWait("请输入完整的 32 位恢复码，可保留分隔线");expect(fixture.accountActions.size()==beforeRecovery,"incomplete recovery is rejected locally");
      layoutSeek("账号恢复码");setHostText("账号恢复码","AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-0000-1111");layoutSeek("确认修改并登录");hostTap("确认修改并登录");chatWait("保存账号恢复码");expect(fixture.accountActions.contains("recover"),"full recovery flow is connected");layoutSeek("我已保存，完成");hostTap("我已保存，完成");layoutSeek("不限次数");
      fixture.accountReject=true;layoutSeek("刷新额度");hostTap("刷新额度");layoutSeek("重新登录");expect(description("重新登录").isEnabled(),"revoked session exposes direct login");expect(findText("不限次数")==null,"revoked login removes stale unlimited membership");sectionShot("account-relogin");
      hostTap("重新登录");fixture.accountReject=false;layoutSeek("账号");expect(description("账号").getText().toString().equals("qa_tester"),"relogin keeps account name");layoutSeek("登录密码");setHostText("登录密码","recovered-password");layoutSeek("登录");hostTap("登录");layoutSeek("不限次数");expect(fixture.accountAuthSeen,"recovered login refreshes membership");
      fixture.membershipExpired=true;layoutSeek("刷新额度");hostTap("刷新额度");chatWait("会员已到期 · 使用免费额度");layoutSeek("3 次可用");sectionShot("account-expired");expect(findText("不限次数")==null,"expired membership uses actual free quota");
      expect(fixture.requests.isEmpty(),"account recovery and status refresh never call paid AI");

    } finally {AccountChecks.restore(prefs,old);AccountChecks.restore(vault,oldVault);}
  }
  private void maintenanceUi() throws Exception {
    arguments.putString("chatToolsUi","true");
    android.accessibilityservice.AccessibilityServiceInfo info=getUiAutomation().getServiceInfo();info.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;getUiAutomation().setServiceInfo(info);
    SharedPreferences prefs=getTargetContext().getSharedPreferences("chatq_keyboard",0);Map<String,String> old=new HashMap<>();
    for(String key:new String[]{"baseUrl","apiKey","deviceId","typingPreferences"})old.put(key,prefs.getString(key,null));
    try(ChatHttpFixture fixture=new ChatHttpFixture()) {
      String base="http://localhost:"+fixture.listener.getLocalPort();
      prefs.edit().putString("baseUrl",base).putString("apiKey","maintenance-local").putString("deviceId","maintenance-local").commit();
      android.content.pm.PackageInfo pkg=getTargetContext().getPackageManager().getPackageInfo(getTargetContext().getPackageName(),0);
      fixture.updateManifest=new JSONObject().put("schema",1).put("versionCode",pkg.versionCode).put("version",pkg.versionName).put("sizeBytes",100).put("sha256",String.join("",Collections.nCopies(64,"a"))).put("url",base+"/downloads/test.apk").put("publishedAt","2026-10-25T00:00:00Z").put("notes",new JSONArray().put("本地更新检查，不下载安装包"));
      shell("am start -n com.jaxon.app.chatq/.MainActivity");chatWait("已连接");hostTap("我的");layoutSeek("更新中心");hostTap("更新中心");layoutSeek("检查新版本");
      expect(findText("安卓内部测试版 · 构建 "+pkg.versionCode)!=null,"installed build is displayed in update center");sectionShot("maintenance-current");
      hostTap("检查新版本");layoutSeek("当前已是最新版本。");expect(description("下载并校验")==null,"same version has no download action");sectionShot("maintenance-latest");
      fixture.updateManifest.put("versionCode",pkg.versionCode+1).put("version","9.9.9");layoutSeek("检查新版本");hostTap("检查新版本");layoutSeek("下载并校验");
      expect(boundsOf("下载并校验").height()>=48,"explicit download has accessible touch height");sectionShot("maintenance-new");
      fixture.updateManifest.put("versionCode",0);layoutSeek("检查新版本");hostTap("检查新版本");layoutSeek("暂时无法检查更新，请稍后重试。");expect(description("下载并校验")==null,"invalid manifest removes stale download action");sectionShot("maintenance-error");
      layoutSeek("返回我的");hostTap("返回我的");layoutSeek("调整键盘布局与高度");hostTap("调整键盘布局与高度");layoutSeek("按键震动");
      boolean previous=description("按键震动").isChecked();hostTap("按键震动");android.os.SystemClock.sleep(400);expect(description("按键震动").isChecked()!=previous,"typing preference updates after successful save");sectionShot("maintenance-typing");
      expect(fixture.requests.isEmpty(),"maintenance pages issue no AI generation");
    } finally {SharedPreferences.Editor restore=prefs.edit();for(Map.Entry<String,String> e:old.entrySet())if(e.getValue()==null)restore.remove(e.getKey());else restore.putString(e.getKey(),e.getValue());restore.commit();}
  }
  private android.view.accessibility.AccessibilityNodeInfo editNode(android.view.accessibility.AccessibilityNodeInfo node) {
    if(node==null)return null;if("android.widget.EditText".contentEquals(node.getClassName()))return node;
    for(int i=0;i<node.getChildCount();i++){android.view.accessibility.AccessibilityNodeInfo child=editNode(node.getChild(i));if(child!=null)return child;}return null;
  }


  private void chatWait(String text) throws Exception { for(int i=0;i<100&&findText(text)==null&&description(text)==null;i++)android.os.SystemClock.sleep(100);if(findText(text)==null&&description(text)==null)sectionShot("chat-failure");expect(findText(text)!=null||description(text)!=null,"chat UI shows "+text); }
  private void chatIdle() throws Exception { for(int i=0;i<100&&description("停止生成")!=null;i++)android.os.SystemClock.sleep(100);expect(description("停止生成")==null,"completed stream exits generation before interaction"); }
  private android.graphics.Rect boundsOf(String text) {
    android.view.accessibility.AccessibilityNodeInfo n=description(text);if(n==null)n=findText(text);
    expect(n!=null,"accessible control present: "+text);android.graphics.Rect r=new android.graphics.Rect();n.getBoundsInScreen(r);return r;
  }
  private void syntheticClipboard(String text) {
    ((android.content.ClipboardManager)getTargetContext().getSystemService(Context.CLIPBOARD_SERVICE)).setPrimaryClip(android.content.ClipData.newPlainText("ChatQ synthetic test",text));
  }
  private void flowSeed(String text,int start,int end) throws Exception {
    shell("am start -S -n com.chatq.keyboardfixture/.FixtureActivity --es seed64 "+android.util.Base64.encodeToString(text.getBytes("UTF-8"),android.util.Base64.NO_WRAP)+" --ei start "+start+" --ei end "+end);
    android.os.SystemClock.sleep(1100);for(int i=0;i<40&&findText("空格")==null;i++){if(i==0||i==20)shell("am broadcast -a com.chatq.keyboardfixture.EDIT -p com.chatq.keyboardfixture --ez show true");android.os.SystemClock.sleep(100);}
    chatWait("空格");hostTap("AI 回复与话题库");hostTap("帮我回复");
  }
  private void expressionsUi() throws Exception {
    arguments.putString("chatToolsUi","true");
    android.accessibilityservice.AccessibilityServiceInfo info=getUiAutomation().getServiceInfo();info.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;getUiAutomation().setServiceInfo(info);
    SharedPreferences prefs=getTargetContext().getSharedPreferences("chatq_keyboard",0);Map<String,String> old=new HashMap<>();for(String key:new String[]{"baseUrl","apiKey","deviceId","personalization","personaSelection"})old.put(key,prefs.getString(key,null));boolean save=prefs.getBoolean("saveGenerationHistory",true);
    try(ChatHttpFixture fixture=new ChatHttpFixture()) {
      prefs.edit().putString("baseUrl","http://localhost:"+fixture.listener.getLocalPort()).putString("apiKey","expressions-local").putString("deviceId","expressions-local").putString("personalization",PersonaChecks.data().toString()).putString("personaSelection","{\"cardId\":\"warm\"}").putBoolean("saveGenerationHistory",false).commit();
      shell("am start -n com.jaxon.app.chatq/.MainActivity");chatWait("已连接");sectionShot("host119-home");hostTap("发现");layoutSeek("表情包");hostTap("表情包");chatWait("搜索表情");sectionShot("host119-expressions");
      layoutSeek("搜索表情");setHostText("搜索表情","抱抱");layoutSeek("复制表情：抱抱");hostTap("复制表情：抱抱");android.os.SystemClock.sleep(250);
      android.content.ClipboardManager clipboard=(android.content.ClipboardManager)getTargetContext().getSystemService(Context.CLIPBOARD_SERVICE);
      expect(clipboard.getPrimaryClip().getItemAt(0).coerceToText(getTargetContext()).toString().equals("🤗"),"explicit emoji choice copies only the chosen expression");
      layoutSeek("清空表情搜索");hostTap("清空表情搜索");expect(description("搜索表情").isShowingHintText()&&description("清空表情搜索")==null,"search can be cleared in one action");
      setHostText("搜索表情","NO_MATCH_FIXTURE");layoutSeek("查看全部表情");hostTap("查看全部表情");layoutSeek("复制表情：开心");expect(description("复制表情：开心")!=null,"empty expression search has a working reset");sectionShot("comfort-expressions-reset");
      layoutSeek("表情类型：图片表情");hostTap("表情类型：图片表情");layoutSeek("预览表情：嗨，你好");sectionShot("host119-stickers");hostTap("预览表情：嗨，你好");chatWait("关闭预览");sectionShot("host119-preview");layoutSeek("分享图片表情");hostTap("分享图片表情");android.os.SystemClock.sleep(900);
      String pkg=String.valueOf(getUiAutomation().getRootInActiveWindow().getPackageName());expect(!pkg.equals("com.jaxon.app.chatq"),"explicit share opens Android chooser, not an automatic chat send");sectionShot("host119-share");shell("input keyevent 4");chatWait("关闭预览");layoutSeek("关闭预览");hostTap("关闭预览");layoutSeek("返回首页");hostTap("返回首页");
      layoutSeek("对方消息");setHostText("对方消息","明天三点见面好吗？");hostTap("帮我想回复");chatWait(fixture.replyText);layoutSeek("加表情");hostTap("加表情");chatWait("给回复加表情");layoutSeek("添加表情：开心");hostTap("添加表情：开心");chatWait(fixture.replyText+" 😀");sectionShot("host119-reply");
      expect(fixture.requests.size()==1,"adding an expression spends no additional AI quota");layoutSeek("复制回复");hostTap("复制回复");android.os.SystemClock.sleep(200);expect(clipboard.getPrimaryClip().getItemAt(0).coerceToText(getTargetContext()).toString().equals(fixture.replyText+" 😀"),"copy includes expression and full reply");
      layoutSeek("恢复上一版");hostTap("恢复上一版");chatWait(fixture.replyText);expect(findText(fixture.replyText+" 😀")==null,"undo restores original without duplicate decoration");
      layoutSeek("润色模式");hostTap("润色模式");layoutSeek("我的草稿");expect(!description("帮我润色").isEnabled(),"polish has a separate empty draft");setHostText("我的草稿","我想明天下午过去看看你");fixture.replyText="我想明天下午去看看你，方便吗？";hostTap("帮我润色");chatWait(fixture.replyText);expect(fixture.requests.size()==2&&fixture.requests.get(1).getString("purpose").equals("polish"),"host polish uses polish intent exactly once");sectionShot("host119-polish");
      layoutSeek("回复模式");hostTap("回复模式");layoutSeek("对方消息");expect(description("对方消息").getText().toString().equals("明天三点见面好吗？"),"switching modes restores the previous reply draft");
      syntheticClipboard("");layoutSeek("粘贴消息");hostTap("粘贴消息");expect(description("对方消息").getText().toString().equals("明天三点见面好吗？"),"empty paste preserves unsent draft");
      syntheticClipboard(new String(new char[1001]).replace('\0','X'));hostTap("粘贴消息");expect(description("对方消息").getText().toString().equals("明天三点见面好吗？"),"overlong paste preserves draft rather than truncating");expect(fixture.requests.size()==2,"navigation/search/preview/copy/undo never generate");
    } finally { SharedPreferences.Editor restore=prefs.edit().putBoolean("saveGenerationHistory",save);for(Map.Entry<String,String> e:old.entrySet())if(e.getValue()==null)restore.remove(e.getKey());else restore.putString(e.getKey(),e.getValue());restore.commit();syntheticClipboard(""); }
  }
  private void personaLayoutUi() throws Exception {
    arguments.putString("chatToolsUi","true");
    android.accessibilityservice.AccessibilityServiceInfo info=getUiAutomation().getServiceInfo();info.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;getUiAutomation().setServiceInfo(info);
    SharedPreferences prefs=getTargetContext().getSharedPreferences("chatq_keyboard",0);String old=prefs.getString("personalization",null),selection=prefs.getString("personaSelection",null);
    String name="温柔真诚而且始终尊重彼此边界的自己";
    try {
      JSONObject data=PersonaChecks.data();data.getJSONArray("cards").getJSONObject(0).put("name",name);
      prefs.edit().putString("personalization",data.toString()).putString("personaSelection","{\"cardId\":\"warm\"}").commit();
      shell("ime set com.android.inputmethod.latin/.LatinIME");shell("ime set com.jaxon.app.chatq/expo.modules.chatqkeyboard.ChatQInputMethodService");flowSeed("SAFE",4,4);hostTap("更多人设");clickExpanded(name);
      expect(new JSONObject(prefs.getString("personaSelection","{}")).getString("cardId").equals("daily"),"long persona selection persists without generation");
      android.view.accessibility.AccessibilityNodeInfo node=description("常用人设："+name);expect(node!=null,"long persona remains accessible");
      node.performAction(android.view.accessibility.AccessibilityNodeInfo.AccessibilityAction.ACTION_SHOW_ON_SCREEN.getId());android.os.SystemClock.sleep(300);node=description("常用人设："+name);
      Bundle args=new Bundle();args.putInt(android.view.accessibility.AccessibilityNodeInfo.EXTRA_DATA_TEXT_CHARACTER_LOCATION_ARG_START_INDEX,0);args.putInt(android.view.accessibility.AccessibilityNodeInfo.EXTRA_DATA_TEXT_CHARACTER_LOCATION_ARG_LENGTH,name.length());
      expect(node.refreshWithExtraData(android.view.accessibility.AccessibilityNodeInfo.EXTRA_DATA_TEXT_CHARACTER_LOCATION_KEY,args),"persona exposes glyph bounds");
      android.os.Parcelable[] glyphs=node.getExtras().getParcelableArray(android.view.accessibility.AccessibilityNodeInfo.EXTRA_DATA_TEXT_CHARACTER_LOCATION_KEY);android.graphics.Rect bounds=new android.graphics.Rect();node.getBoundsInScreen(bounds);
      expect(glyphs!=null&&glyphs.length==name.length(),"all persona characters are laid out");
      for(android.os.Parcelable glyph:glyphs){expect(glyph!=null,"persona character is not clipped");android.graphics.RectF box=(android.graphics.RectF)glyph;expect(box.left>=bounds.left&&box.right<=bounds.right&&box.top>=bounds.top&&box.bottom<=bounds.bottom,"persona glyph fits target");}
      sectionShot("comfort-persona-long");hostTap("完成，返回回复");hostTap("返回打字");chatWait("空格");textIs("SAFE","selection and return preserve editor");
    } finally {SharedPreferences.Editor restore=prefs.edit();if(old==null)restore.remove("personalization");else restore.putString("personalization",old);if(selection==null)restore.remove("personaSelection");else restore.putString("personaSelection",selection);restore.commit();}
  }
  private void personaHostUi() throws Exception {
    shell("ime set com.jaxon.app.chatq/expo.modules.chatqkeyboard.ChatQInputMethodService");
    arguments.putString("chatToolsUi","true");android.accessibilityservice.AccessibilityServiceInfo info=getUiAutomation().getServiceInfo();info.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;getUiAutomation().setServiceInfo(info);
    SharedPreferences prefs=getTargetContext().getSharedPreferences("chatq_keyboard",0);Map<String,String> old=new HashMap<>();for(String key:new String[]{"baseUrl","apiKey","deviceId","personalization","personaSelection","savedReplies"})old.put(key,prefs.getString(key,null));boolean history=prefs.getBoolean("saveGenerationHistory",true);
    try(ChatHttpFixture fixture=new ChatHttpFixture()) {
      prefs.edit().putString("baseUrl","http://localhost:"+fixture.listener.getLocalPort()).putString("apiKey","persona-host-local").putString("deviceId","persona-host-local").putString("personalization",PersonaChecks.data().toString()).putString("personaSelection","{\"cardId\":\"daily\"}").putString("savedReplies","[{\"text\":\"键盘收藏的合成句子\",\"label\":\"温柔\",\"savedAt\":1}]").putBoolean("saveGenerationHistory",false).commit();
      shell("am start -n com.jaxon.app.chatq/.MainActivity");chatWait("已连接");hostTap("发现");layoutSeek("人设卡片");hostTap("人设卡片");layoutSeek("搜索人设");sectionShot("persona-center");
      layoutSeek("人设库：推荐模板");hostTap("人设库：推荐模板");layoutSeek("搜索人设");setHostText("搜索人设","坚定");layoutSeek("选用人设：坚定有界");sectionShot("persona-template");hostTap("选用人设：坚定有界");android.os.SystemClock.sleep(400);expect(new JSONObject(prefs.getString("personaSelection","{}")).getString("cardId").equals("starter-boundary"),"template can be added and used with one action");
      layoutSeek("管理人设：坚定有界");hostTap("管理人设：坚定有界");layoutSeek("设为常用");hostTap("设为常用");android.os.SystemClock.sleep(300);expect(new JSONObject(prefs.getString("personalization","{}")).getJSONArray("cards").getJSONObject(0).getString("id").equals("starter-boundary"),"pin places card first for IME quick access");
      layoutSeek("返回发现");hostTap("返回发现");layoutSeek("常用句");hostTap("常用句");chatWait("键盘收藏的合成句子");sectionShot("persona-host-saved");layoutSeek("移除常用句：键盘收藏的合成句子");hostTap("移除常用句：键盘收藏的合成句子");android.os.SystemClock.sleep(300);expect(new JSONArray(prefs.getString("savedReplies","[]")).length()==0,"host can remove a keyboard favorite");
      hostTap("返回发现");hostTap("帮回复");layoutSeek("对方消息");android.graphics.Rect input=boundsOf("对方消息");shell("input tap "+input.centerX()+" "+input.centerY());chatWait("空格");setHostText("对方消息","明天下午三点见面好吗？");shell("input keyevent 4");hostTap("帮我想回复");chatWait(fixture.replyText);layoutSeek("收藏");hostTap("收藏");android.os.SystemClock.sleep(300);expect(new JSONArray(prefs.getString("savedReplies","[]")).getJSONObject(0).getString("text").equals(fixture.replyText),"host favorite is visible to native IME storage");sectionShot("persona-host-reply");
      String original=fixture.replyText;fixture.replyText="好的，明天下午三点见。";layoutSeek("改一改");hostTap("改一改");clickText("更简短");chatWait(fixture.replyText);expect(fixture.requests.size()==2&&fixture.requests.get(1).getString("purpose").equals("polish"),"single host refine makes exactly one polish request");layoutSeek("恢复上一版");hostTap("恢复上一版");chatWait(original);expect(fixture.requests.size()==2,"restoring old text makes no AI call"); fixture.replyText=new String(new char[1001]).replace('\0','X');layoutSeek("改一改");hostTap("改一改");clickText("更自然");chatWait("改写结果不完整，请重试，原结果已保留。");expect(findText(original)!=null,"malformed long refinement keeps the original instead of crashing React");
    } catch(Exception | AssertionError failure) {sectionShot("persona-host-failure");throw failure;}
    finally{SharedPreferences.Editor restore=prefs.edit().putBoolean("saveGenerationHistory",history);for(Map.Entry<String,String> e:old.entrySet()){if(e.getValue()==null)restore.remove(e.getKey());else restore.putString(e.getKey(),e.getValue());}restore.commit();}
  }
  private void personaUi() throws Exception {
    arguments.putString("chatToolsUi","true");
    android.accessibilityservice.AccessibilityServiceInfo info=getUiAutomation().getServiceInfo();info.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;getUiAutomation().setServiceInfo(info);
    SharedPreferences prefs=getTargetContext().getSharedPreferences("chatq_keyboard",0);Map<String,String> old=new HashMap<>();for(String key:new String[]{"baseUrl","apiKey","deviceId","typingPreferences","personalization","personaSelection","savedReplies"})old.put(key,prefs.getString(key,null));boolean history=prefs.getBoolean("saveGenerationHistory",true);
    try {
      prefs.edit().putString("personalization",PersonaChecks.data().toString()).putString("personaSelection","{\"cardId\":\"warm\"}").putString("savedReplies","[]").putString("apiKey","persona-local").putString("deviceId","persona-local").putBoolean("saveGenerationHistory",false).commit();
      shell("ime set com.android.inputmethod.latin/.LatinIME");shell("ime set com.jaxon.app.chatq/expo.modules.chatqkeyboard.ChatQInputMethodService");flowSeed("SAFE",4,4);chatWait("快捷人设：温柔体贴");
      expect(boundsOf("快捷人设：温柔体贴").height()>=48,"common persona has touchable height: "+boundsOf("快捷人设：温柔体贴"));hostTap("关系与目标");chatWait("完成，返回回复");clickExpanded("拒绝");expect(new JSONObject(prefs.getString("personaSelection","{}")).getString("goalId").equals("decline"),"goal persists from quick panel");clickExpanded("克制");clickExpanded("朋友");sectionShot("persona-preferences");clickExpanded("完成，返回回复");
      syntheticClipboard("周末一起出去玩吗？");String original="谢谢你想到我，不过这周末我想休息一下。";
      try(InputNetworkChecks.Server server=new InputNetworkChecks.Server(new JSONObject().put("success",true).put("data",new JSONObject().put("candidates",new JSONArray().put(original).put("这次就先不参加了，谢谢邀请。"))).toString(),false)){
        prefs.edit().putString("baseUrl","http://localhost:"+server.server.getLocalPort()).commit();clickText("粘贴并生成");chatWait(original);expect(server.payload.getString("customPrompt").contains("拒绝")&&server.payload.getString("relationId").equals("friend"),"actual IME request carries chosen relationship and goal");
      }
      textIs("SAFE","persona preview does not change editor");sectionShot("persona-replies");hostTap("回复操作："+original);clickText("收藏这句话");expect(new JSONArray(prefs.getString("savedReplies","[]")).length()==1,"card favorite stored in shared collection");
      try(InputNetworkChecks.Server server=new InputNetworkChecks.Server("{\"success\":true,\"data\":{\"candidates\":[\"谢谢邀请，这次先不了。\"]}}",false)){
        prefs.edit().putString("baseUrl","http://localhost:"+server.server.getLocalPort()).commit();hostTap("回复操作："+original);clickText("更简短");chatWait("谢谢邀请，这次先不了。");expect(server.payload.getString("prompt").equals(original)&&server.payload.getString("purpose").equals("polish")&&server.payload.getInt("candidateCount")==1,"refine sends only selected reply with polish intent");expect(server.payload.getString("relationId").equals("friend"),"refine preserves generation settings");
      }
      hostTap("回复操作：谢谢邀请，这次先不了。");clickText("恢复上一版");chatWait(original);
      try(InputNetworkChecks.Server server=new InputNetworkChecks.Server("{\"success\":false,\"error\":{\"message\":\"fixture\"}}",false)){
        prefs.edit().putString("baseUrl","http://localhost:"+server.server.getLocalPort()).commit();hostTap("回复操作："+original);clickText("更自然");chatWait("改写失败，原结果保留，请手动重试");expect(findText(original)!=null,"failed refine keeps old text");
      }
      try(InputNetworkChecks.Server server=new InputNetworkChecks.Server("{\"success\":true,\"data\":{\"candidates\":[\"LATE-REFINE\"]}}",true)){
        prefs.edit().putString("baseUrl","http://localhost:"+server.server.getLocalPort()).commit();hostTap("回复操作："+original);clickText("更自然");expect(server.received.await(3,java.util.concurrent.TimeUnit.SECONDS),"refine reached loopback");clickText("停止生成");server.release.countDown();android.os.SystemClock.sleep(300);expect(findText("LATE-REFINE")==null&&findText(original)!=null,"cancel rejects late refinement and preserves old reply");
      }
      hostTap("偏好与记录");clickText("我的常用句");chatWait("填入常用句："+original);sectionShot("persona-saved");hostTap("填入常用句："+original);chatWait("空格");textIs("SAFE"+original,"saved reply inserts once and returns to typing");expect(findText("action:0 count:0")!=null,"persona flows never send messages");
    } catch(Exception | AssertionError failure) { sectionShot("persona-failure");throw failure; }
    finally { SharedPreferences.Editor restore=prefs.edit().putBoolean("saveGenerationHistory",history);for(Map.Entry<String,String> e:old.entrySet()){if(e.getValue()==null)restore.remove(e.getKey());else restore.putString(e.getKey(),e.getValue());}restore.commit();syntheticClipboard(""); }
  }
  private void flowReviewUi() throws Exception {
    arguments.putString("chatToolsUi","true");
    android.accessibilityservice.AccessibilityServiceInfo info=getUiAutomation().getServiceInfo();info.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;getUiAutomation().setServiceInfo(info);
    SharedPreferences prefs=getTargetContext().getSharedPreferences("chatq_keyboard",0);Map<String,String> old=new HashMap<>();
    for(String key:new String[]{"baseUrl","apiKey","deviceId","typingPreferences"})old.put(key,prefs.getString(key,null));boolean save=prefs.getBoolean("saveGenerationHistory",true);
    try {
      Class<?> type=getTargetContext().getClassLoader().loadClass("expo.modules.chatqkeyboard.TypingPreferences");Object config=type.getConstructor(SharedPreferences.class).newInstance(prefs);
      type.getMethod("update",JSONObject.class).invoke(config,new JSONObject().put("layout","qwerty").put("theme","light").put("height","normal").put("bottomSpace","normal").put("chinese",true).put("cloudWords",false));
      prefs.edit().putString("apiKey","review-test-only").putString("deviceId","review-test-only").putBoolean("saveGenerationHistory",false).commit();
      shell("ime set com.android.inputmethod.latin/.LatinIME");shell("ime set com.jaxon.app.chatq/expo.modules.chatqkeyboard.ChatQInputMethodService");
      String review=arguments.getString("flowReviewCase");
      if("polish".equals(review)) {
        flowSeed("hello world",0,5);hostTap("润色我的话");
        try(InputNetworkChecks.Server server=new InputNetworkChecks.Server("{\"success\":true,\"data\":{\"candidates\":[\"HELLO\"]}}",false)) {
          prefs.edit().putString("baseUrl","http://localhost:"+server.server.getLocalPort()).commit();clickText("润色输入框");chatWait("HELLO");expect(server.payload.getString("prompt").equals("hello"),"initial polish uses selected range");
        }
        shell("am broadcast -a com.chatq.keyboardfixture.EDIT -p com.chatq.keyboardfixture --ei cursor 11");android.os.SystemClock.sleep(300);
        try(InputNetworkChecks.Server server=new InputNetworkChecks.Server("{\"success\":true,\"data\":{\"candidates\":[\"Hello, world!\"]}}",false)) {
          prefs.edit().putString("baseUrl","http://localhost:"+server.server.getLocalPort()).commit();clickText("重新润色");expect(server.received.await(3,java.util.concurrent.TimeUnit.SECONDS),"retry reached local server");
          expect(server.payload.getString("prompt").equals("hello world"),"one-tap repolish refreshes current selection and draft");chatWait("Hello, world!");textIs("hello world","new preview preserves draft");clickText("Hello, world!");chatWait("空格");textIs("Hello, world!","refreshed target replaces whole draft once");
        }
      } else {
        flowSeed("SAFE",4,4);syntheticClipboard("明天下午三点见面可以吗？");
        try(InputNetworkChecks.Server server=new InputNetworkChecks.Server("{\"success\":true,\"data\":{\"candidates\":[\"可以呀，我们明天下午三点见。\",\"没问题，到时候见！\"]}}",false)) {
          prefs.edit().putString("baseUrl","http://localhost:"+server.server.getLocalPort()).commit();clickText("粘贴并生成");chatWait("可以呀，我们明天下午三点见。");
        }
        if("retry".equals(review)) {
          try(InputNetworkChecks.Server server=new InputNetworkChecks.Server("{\"success\":false,\"error\":{\"message\":\"fixture retry failure\"}}",false)) {
            prefs.edit().putString("baseUrl","http://localhost:"+server.server.getLocalPort()).commit();clickText("重新生成");chatWait("fixture retry failure");
            expect(findText("可以呀，我们明天下午三点见。")!=null,"failed retry retains previous usable candidates");
          }
          try(InputNetworkChecks.Server server=new InputNetworkChecks.Server("{\"success\":true,\"data\":{\"candidates\":[\"LATE-RETRY\"]}}",true)) {
            prefs.edit().putString("baseUrl","http://localhost:"+server.server.getLocalPort()).commit();clickText("重新生成");expect(server.received.await(3,java.util.concurrent.TimeUnit.SECONDS),"pending retry reached fixture");clickText("停止生成");server.release.countDown();android.os.SystemClock.sleep(250);
            expect(findText("LATE-RETRY")==null&&findText("可以呀，我们明天下午三点见。")!=null,"cancel keeps last success and rejects late retry");
          }
          hostTap("润色我的话");hostTap("帮我回复");expect(findText("可以呀，我们明天下午三点见。")!=null,"switching tasks keeps generated results without another request");
        } else {
          float density=getTargetContext().getResources().getDisplayMetrics().density;
          expect(boundsOf("返回打字").height()>=48*density,"AI return retains 48dp target");
          android.view.accessibility.AccessibilityNodeInfo backNode=description("返回打字");Bundle characters=new Bundle();
          characters.putInt(android.view.accessibility.AccessibilityNodeInfo.EXTRA_DATA_TEXT_CHARACTER_LOCATION_ARG_START_INDEX,0);characters.putInt(android.view.accessibility.AccessibilityNodeInfo.EXTRA_DATA_TEXT_CHARACTER_LOCATION_ARG_LENGTH,2);
          expect(backNode.refreshWithExtraData(android.view.accessibility.AccessibilityNodeInfo.EXTRA_DATA_TEXT_CHARACTER_LOCATION_KEY,characters),"AI return exposes real character bounds");
          android.os.Parcelable[] glyphs=backNode.getExtras().getParcelableArray(android.view.accessibility.AccessibilityNodeInfo.EXTRA_DATA_TEXT_CHARACTER_LOCATION_KEY);android.graphics.Rect buttonBounds=boundsOf("返回打字");
          expect(glyphs!=null&&glyphs.length==2&&glyphs[0]!=null&&glyphs[1]!=null,"both return characters are laid out");
          for(android.os.Parcelable glyph:glyphs) { android.graphics.RectF box=(android.graphics.RectF)glyph;expect(box.left>=buttonBounds.left&&box.right<=buttonBounds.right&&box.top>=buttonBounds.top&&box.bottom<=buttonBounds.bottom,"return character fits actual button bounds: "+box+" "+buttonBounds); }
          expect(boundsOf("AI 结果列表").height()>=80*density,"AI results retain useful viewport");
          android.graphics.Rect editor=boundsOf("SAFE"), back=boundsOf("返回打字");
          sectionShot("review-layout");
          expect(editor.height()>=32*density&&editor.bottom<=back.top,"AI leaves the current draft visible above keyboard: editor="+editor+", return="+back);
          expect(findText("表情")==null&&findText("语音")==null,"AI toolbar focuses on return and preferences");
          sectionShot("review-layout");
        }
        clickText("可以呀，我们明天下午三点见。");chatWait("空格");textIs("SAFE可以呀，我们明天下午三点见。","restored candidate inserts once and returns");
        expect(findText("表情")!=null&&findText("语音")!=null,"typing tools restore on return");
      }
      expect(findText("action:0 count:0")!=null,"review flow never sends messages");
    } finally {SharedPreferences.Editor restore=prefs.edit().putBoolean("saveGenerationHistory",save);for(Map.Entry<String,String> e:old.entrySet())if(e.getValue()==null)restore.remove(e.getKey());else restore.putString(e.getKey(),e.getValue());restore.commit();syntheticClipboard("");}
  }

  private void backupPanelUi() throws Exception {
    arguments.putString("chatToolsUi","true");android.accessibilityservice.AccessibilityServiceInfo info=getUiAutomation().getServiceInfo();info.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;getUiAutomation().setServiceInfo(info);
    SharedPreferences prefs=getTargetContext().getSharedPreferences("chatq_keyboard",0);Map<String,String> old=new HashMap<>();for(String key:new String[]{"baseUrl","apiKey","deviceId"})old.put(key,prefs.getString(key,null));String filename="ChatQ-audit-QA-"+System.currentTimeMillis()+".chatqbackup";
    try(ChatHttpFixture fixture=new ChatHttpFixture()) {
      prefs.edit().putString("baseUrl","http://localhost:"+fixture.listener.getLocalPort()).putString("apiKey","backup-local").putString("deviceId","backup-local").commit();shell("am start -n com.jaxon.app.chatq/.MainActivity");chatWait("已连接");hostTap("我的");layoutSeek("备份与恢复");hostTap("备份与恢复");layoutSeek("备份密码");setHostText("备份密码","local-test-password");layoutSeek("确认备份密码");setHostText("确认备份密码","local-test-password");layoutSeek("导出加密备份");hostTap("导出加密备份");chatWait("SAVE");shell("input keyevent 4");chatWait("已取消保存，现有数据未修改。");expect(description("导出加密备份").isEnabled(),"cancelled Android picker releases backup action lock");
      layoutSeek("导出加密备份");hostTap("导出加密备份");chatWait("SAVE");android.view.accessibility.AccessibilityNodeInfo field=editNode(getUiAutomation().getRootInActiveWindow());expect(field!=null,"backup file picker exposes a name");Bundle name=new Bundle();name.putCharSequence(android.view.accessibility.AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,filename);expect(field.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_SET_TEXT,name),"backup name can be changed");clickText("SAVE");chatWait("加密备份已保存，请妥善保管文件和密码。");sectionShot("audit-backup-saved");layoutSeek("备份密码");expect(description("备份密码").isShowingHintText()||description("备份密码").getText()==null||description("备份密码").getText().length()==0,"export clears password after writing");setHostText("备份密码","local-test-password");layoutSeek("选择备份并预览");hostTap("选择备份并预览");android.os.SystemClock.sleep(500);if(findText(filename)==null){hostTap("Show roots");clickText("Downloads");}clickText(filename);android.os.SystemClock.sleep(300);if("com.android.documentsui".contentEquals(getUiAutomation().getRootInActiveWindow().getPackageName())){shell("input keyevent 20");shell("input keyevent 66");}chatWait("确认备份内容");layoutSeek("合并恢复到本机");sectionShot("audit-backup-preview");hostTap("合并恢复到本机");chatWait("合并这份备份？");clickText("取消");expect(findText("确认备份内容")!=null,"cancel restore retains preview without applying it");expect(fixture.requests.isEmpty(),"backup file workflows make no AI requests");
    } catch(Exception | AssertionError failure) {sectionShot("audit-backup-failure");throw failure;}
    finally {SharedPreferences.Editor restore=prefs.edit();for(Map.Entry<String,String> e:old.entrySet())if(e.getValue()==null)restore.remove(e.getKey());else restore.putString(e.getKey(),e.getValue());restore.commit();try{getTargetContext().getContentResolver().delete(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI,"_display_name = ?",new String[]{filename});}catch(Exception ignored){}}
  }
  private void referenceUi() throws Exception {
    arguments.putString("chatToolsUi","true");android.accessibilityservice.AccessibilityServiceInfo info=getUiAutomation().getServiceInfo();info.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;getUiAutomation().setServiceInfo(info);
    SharedPreferences prefs=getTargetContext().getSharedPreferences("chatq_keyboard",0);Map<String,String> old=new HashMap<>();for(String key:new String[]{"baseUrl","apiKey","deviceId","typingPreferences","personalization","personaSelection"})old.put(key,prefs.getString(key,null));boolean history=prefs.getBoolean("saveGenerationHistory",true);
    try(ChatHttpFixture fixture=new ChatHttpFixture()) {
      prefs.edit().putString("baseUrl","http://localhost:"+fixture.listener.getLocalPort()).putString("apiKey","reference-local").putString("deviceId","reference-local").putBoolean("saveGenerationHistory",false).putString("personalization",PersonaChecks.data().toString()).putString("personaSelection","{\"cardId\":\"daily\"}").commit();
      Class<?> type=getTargetContext().getClassLoader().loadClass("expo.modules.chatqkeyboard.TypingPreferences");Object options=type.getConstructor(SharedPreferences.class).newInstance(prefs);type.getMethod("update",JSONObject.class).invoke(options,new JSONObject().put("theme","light").put("layout","qwerty").put("cloudWords",false).put("learning",false).put("chinese",true));
      android.graphics.drawable.Drawable icon=getTargetContext().getPackageManager().getApplicationIcon("com.jaxon.app.chatq");expect(icon instanceof android.graphics.drawable.AdaptiveIconDrawable,"installed application uses adaptive brand icon");android.graphics.Bitmap bitmap=android.graphics.Bitmap.createBitmap(192,192,android.graphics.Bitmap.Config.ARGB_8888);icon.setBounds(0,0,192,192);icon.draw(new android.graphics.Canvas(bitmap));int purple=0;for(int x=0;x<192;x++)for(int y=0;y<192;y++){int color=bitmap.getPixel(x,y);if(android.graphics.Color.blue(color)>android.graphics.Color.green(color)+40&&android.graphics.Color.alpha(color)>200)purple++;}expect(purple>8000,"installed icon has purple brand background rather than Android placeholder");if("true".equals(arguments.getString("captureSections")))try(java.io.FileOutputStream out=new java.io.FileOutputStream(new java.io.File(getTargetContext().getExternalFilesDir(null),"sections-reference-brand-icon.png"))){bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,out);}bitmap.recycle();
      shell("ime enable com.android.inputmethod.latin/.LatinIME");shell("ime set com.jaxon.app.chatq/expo.modules.chatqkeyboard.ChatQInputMethodService");flowSeed("SAFE",4,4);hostTap("返回打字");expect(boundsOf("切换输入法").height()>=48,"footer input-method switch has 48dp touch target");sectionShot("reference-keyboard");hostTap("切换输入法");chatWait("系统输入法设置");sectionShot("reference-switch-menu");
      if("menu".equals(arguments.getString("referenceCase"))) {shell("input keyevent 4");letters("ni",30);String composing=editorText();expect(composing.endsWith("ni"),"synthetic pinyin is composing before menu");hostTap("切换输入法");chatWait("系统输入法设置");shell("input keyevent 4");android.os.SystemClock.sleep(200);textIs(composing,"dismissing input-method menu leaves composing text unchanged");expect(findText("你")!=null,"dismissing menu keeps pinyin candidates available");hostTap("切换输入法");String ownLabel=null;for(android.view.inputmethod.InputMethodInfo method:((android.view.inputmethod.InputMethodManager)getTargetContext().getSystemService(Context.INPUT_METHOD_SERVICE)).getEnabledInputMethodList())if(method.getId().startsWith("com.jaxon.app.chatq/"))ownLabel=method.loadLabel(getTargetContext().getPackageManager()).toString();expect(ownLabel!=null,"current input method has a menu label");clickText(ownLabel);textIs(composing,"selecting the current keyboard preserves unchosen pinyin");expect(findText("你")!=null,"current input-method selection retains candidates");return;}

      android.view.inputmethod.InputMethodManager manager=(android.view.inputmethod.InputMethodManager)getTargetContext().getSystemService(Context.INPUT_METHOD_SERVICE);String latin=null;for(android.view.inputmethod.InputMethodInfo method:manager.getEnabledInputMethodList())if(method.getId().startsWith("com.android.inputmethod.latin/"))latin=method.loadLabel(getTargetContext().getPackageManager()).toString();expect(latin!=null,"second enabled input method is listed");clickText(latin);android.os.SystemClock.sleep(500);expect(android.provider.Settings.Secure.getString(getTargetContext().getContentResolver(),android.provider.Settings.Secure.DEFAULT_INPUT_METHOD).startsWith("com.android.inputmethod.latin/"),"footer switches the actual system input method");textIs("SAFE","switching input methods preserves the editor draft");expect(findText("action:0 count:0")!=null,"switch never sends");
      shell("ime set com.jaxon.app.chatq/expo.modules.chatqkeyboard.ChatQInputMethodService");chatWait("空格");letters("nihao",30);clickText("你好");textIs("SAFE你好","new keyboard layout retains pinyin insertion");hostTap("更多");clickText("切换九宫格");chatWait("九宫格 2 ABC");digits("64426");clickText("你好");textIs("SAFE你好你好","nine-key input remains correct");sectionShot("reference-nine");hostTap("收起键盘");android.os.SystemClock.sleep(350);expect(description("切换输入法")==null,"footer collapse hides keyboard");
      fixture.replyText=new JSONObject().put("name","AI 职场有界").put("instructions","礼貌简短，明确边界，不随便承诺。").put("example","收到，我确认后再回复你。").put("length","short").put("category","work").toString();
      shell("am start -n com.jaxon.app.chatq/.MainActivity");chatWait("已连接");hostTap("发现");layoutSeek("人设卡片");hostTap("人设卡片");layoutSeek("AI 帮我创建人设");String before=new JSONObject(prefs.getString("personalization","{}")).getJSONArray("cards").toString();hostTap("AI 帮我创建人设");layoutSeek("AI 人设需求");hostTap("AI 人设需求");chatWait("空格");setHostText("AI 人设需求","职场沟通，礼貌有边界，简短，不随便承诺");shell("input keyevent 4");android.os.SystemClock.sleep(300);if(getTargetContext().getResources().getConfiguration().fontScale<1.3f)expect(boundsOf("生成人设草稿").bottom<=boundsOf("发现").top,"normal-font persona generation primary action is visible above navigation without extra scrolling");sectionShot("reference-persona-requirements");
      if("back".equals(arguments.getString("referenceCase"))) {shell("input keyevent 4");chatWait("AI 帮我创建人设");hostTap("AI 帮我创建人设");layoutSeek("AI 人设需求");expect(description("AI 人设需求").getText().toString().contains("职场沟通"),"system back returns to persona center and reopening retains requirements");return;}
      if("stop".equals(arguments.getString("referenceCase"))) {
        fixture.hold=true;layoutSeek("生成人设草稿");hostTap("生成人设草稿");chatWait("停止生成");for(int i=0;i<30&&fixture.requests.isEmpty();i++)android.os.SystemClock.sleep(100);expect(fixture.requests.size()==1,"stop case started exactly one loopback request");layoutSeek("停止生成");hostTap("停止生成");fixture.release.countDown();android.os.SystemClock.sleep(500);expect(findText("编辑人设卡")==null,"late cancelled response never opens preview");layoutSeek("AI 人设需求");expect(description("AI 人设需求").getText().toString().contains("职场沟通"),"stopping retains editable requirements");expect(new JSONObject(prefs.getString("personalization","{}")).getJSONArray("cards").toString().equals(before),"stopping never saves a card");shell("input keyevent 4");chatWait("AI 帮我创建人设");hostTap("AI 帮我创建人设");layoutSeek("AI 人设需求");expect(description("AI 人设需求").getText().toString().contains("职场沟通"),"return and reopen retain stopped requirements");expect(fixture.requests.size()==1,"return does not retry generation automatically");sectionShot("review-persona-stopped");return;
      }
      if("failure".equals(arguments.getString("referenceCase"))) {
        String valid=fixture.replyText;fixture.replyText="not JSON";layoutSeek("生成人设草稿");hostTap("生成人设草稿");chatWait("AI 返回的人设格式不完整，请重新生成；现有人设未修改。");expect(new JSONObject(prefs.getString("personalization","{}")).getJSONArray("cards").toString().equals(before),"invalid AI format preserves saved library");expect(fixture.requests.size()==1,"failure does not auto retry");sectionShot("review-persona-error");fixture.replyText=valid;layoutSeek("生成人设草稿");hostTap("生成人设草稿");chatWait("编辑人设卡");layoutSeek("更多人设设置");hostTap("更多人设设置");layoutSeek("人设分类");expect(description("人设分类：职场")!=null||findText("职场")!=null,"generated category remains editable in optional settings");shell("input keyevent 4");chatWait("AI 帮你创建人设");layoutSeek("AI 人设需求");expect(description("AI 人设需求").getText().toString().contains("职场沟通"),"preview system back returns to original requirements");expect(fixture.requests.size()==2,"explicit retry consumes exactly one new request");expect(new JSONObject(prefs.getString("personalization","{}")).getJSONArray("cards").toString().equals(before),"returning from generated preview does not save");sectionShot("review-persona-return");return;
      }
      layoutSeek("生成人设草稿");hostTap("生成人设草稿");chatWait("编辑人设卡");expect(description("人设名称").getText().toString().equals("AI 职场有界"),"AI response opens an editable persona draft");expect(new JSONObject(prefs.getString("personalization","{}")).getJSONArray("cards").toString().equals(before),"preview does not auto-save persona");expect(fixture.requests.size()==1&&fixture.requests.get(0).getJSONArray("history").length()==0&&fixture.requests.get(0).getString("context").isEmpty(),"persona generation sends only explicit requirements without conversation history");sectionShot("reference-persona-preview");layoutSeek("保存并使用");hostTap("保存并使用");chatWait("已保存");shell("input keyevent 4");JSONObject data=new JSONObject(prefs.getString("personalization","{}")),selected=new JSONObject(prefs.getString("personaSelection","{}"));expect(data.getJSONArray("cards").length()==PersonaChecks.data().getJSONArray("cards").length()+1,"save adds exactly one persona card");expect(selected.getString("cardId").startsWith("ai-"),"saved AI persona becomes current");
      flowSeed("SAFE",4,4);expect(description("快捷人设：AI 职场有界")!=null,"saved generated persona is shared with Android keyboard");expect(fixture.requests.size()==1,"save and switch consume no additional AI requests");expect(findText("action:0 count:0")!=null,"persona and input flows never send messages");
    } catch(Exception | AssertionError failure) {sectionShot("reference-failure");throw failure;}
    finally {SharedPreferences.Editor restore=prefs.edit().putBoolean("saveGenerationHistory",history);for(Map.Entry<String,String> e:old.entrySet())if(e.getValue()==null)restore.remove(e.getKey());else restore.putString(e.getKey(),e.getValue());restore.commit();syntheticClipboard("");shell("ime set com.jaxon.app.chatq/expo.modules.chatqkeyboard.ChatQInputMethodService");}
  }
  private void lifecycleUi() throws Exception {
    arguments.putString("chatToolsUi","true");
    android.accessibilityservice.AccessibilityServiceInfo info=getUiAutomation().getServiceInfo();info.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;getUiAutomation().setServiceInfo(info);
    SharedPreferences prefs=getTargetContext().getSharedPreferences("chatq_keyboard",0);Map<String,String> old=new HashMap<>();
    for(String key:new String[]{"baseUrl","apiKey","deviceId","typingPreferences","personalization","personaSelection"})old.put(key,prefs.getString(key,null));boolean save=prefs.getBoolean("saveGenerationHistory",true);
    try {
      prefs.edit().putString("apiKey","lifecycle-local").putString("deviceId","lifecycle-local").putBoolean("saveGenerationHistory",false).putString("personalization",PersonaChecks.data().toString()).putString("personaSelection","{\"cardId\":\"warm\"}").commit();
      Class<?> type=getTargetContext().getClassLoader().loadClass("expo.modules.chatqkeyboard.TypingPreferences");Object config=type.getConstructor(SharedPreferences.class).newInstance(prefs);type.getMethod("update",JSONObject.class).invoke(config,new JSONObject().put("cloudWords",false));
      shell("ime set com.android.inputmethod.latin/.LatinIME");shell("ime set com.jaxon.app.chatq/expo.modules.chatqkeyboard.ChatQInputMethodService");flowSeed("SAFE",4,4);syntheticClipboard("合成测试消息");
      try(InputNetworkChecks.Server server=new InputNetworkChecks.Server("{\"success\":true,\"data\":{\"candidates\":[\"合成测试回复\"]}}",false)){
        prefs.edit().putString("baseUrl","http://localhost:"+server.server.getLocalPort()).commit();hostTap("粘贴并生成");chatWait("合成测试回复");
      }
      shell("am broadcast -a com.chatq.keyboardfixture.EDIT -p com.chatq.keyboardfixture --ez hide true");android.os.SystemClock.sleep(450);
      shell("am broadcast -a com.chatq.keyboardfixture.EDIT -p com.chatq.keyboardfixture --ez show true");chatWait("返回打字");android.os.SystemClock.sleep(400);
      expect(findText("合成测试回复")!=null,"reopening the same editor restores completed replies without another AI request");sectionShot("lifecycle-reply-reopen");
      hostTap("合成测试回复");chatWait("空格");textIs("SAFE合成测试回复","restored reply inserts exactly once");expect(findText("action:0 count:0")!=null,"reopen never sends");
      hostTap("AI 回复与话题库");hostTap("关系与目标");clickExpanded("拒绝");android.os.SystemClock.sleep(200);android.graphics.Rect goalBeforeHide=boundsOf("拒绝");
      shell("am broadcast -a com.chatq.keyboardfixture.EDIT -p com.chatq.keyboardfixture --ez hide true");android.os.SystemClock.sleep(350);
      shell("am broadcast -a com.chatq.keyboardfixture.EDIT -p com.chatq.keyboardfixture --ez show true");chatWait("完成，返回回复");
      expect(findText("拒绝")!=null,"reopening preferences restores its controls");expect(new JSONObject(prefs.getString("personaSelection","{}")).getString("goalId").equals("decline"),"chosen goal survives hide/show");expect(Math.abs(goalBeforeHide.top-boundsOf("拒绝").top)<=2,"preference scroll position survives hide/show");sectionShot("lifecycle-preferences-reopen");hostTap("完成，返回回复");hostTap("返回打字");
      flowSeed("SAFE",4,4);syntheticClipboard("合成延迟消息");
      try(InputNetworkChecks.Server server=new InputNetworkChecks.Server("{\"success\":true,\"data\":{\"candidates\":[\"STALE-HIDDEN-REPLY\"]}}",true)){
        prefs.edit().putString("baseUrl","http://localhost:"+server.server.getLocalPort()).commit();hostTap("粘贴并生成");expect(server.received.await(3,java.util.concurrent.TimeUnit.SECONDS),"pending request reaches loopback fixture");
        shell("am broadcast -a com.chatq.keyboardfixture.EDIT -p com.chatq.keyboardfixture --ez hide true");expect(server.disconnected.await(3,java.util.concurrent.TimeUnit.SECONDS),"hiding cancels the actual network request");server.release.countDown();
        shell("am broadcast -a com.chatq.keyboardfixture.EDIT -p com.chatq.keyboardfixture --ez show true");chatWait("重新生成");android.os.SystemClock.sleep(300);expect(findText("STALE-HIDDEN-REPLY")==null,"late hidden request is never restored");expect(findText("合成延迟消息")!=null,"cancel keeps source for explicit retry");textIs("SAFE","cancel preserves editor");sectionShot("lifecycle-cancel-reopen");
      }
      hostTap("返回打字");shell("am broadcast -a com.chatq.keyboardfixture.EDIT -p com.chatq.keyboardfixture --ez restart true");android.os.SystemClock.sleep(300);hostTap("AI 回复与话题库");expect(findText("合成延迟消息")==null,"restarted editor clears previous session source");hostTap("返回打字");
      expressionEditor("richpng");hostTap("表情");hostTap("图片表情包");hostTap("预览打招呼图片表情");
      shell("am broadcast -a com.chatq.keyboardfixture.EDIT -p com.chatq.keyboardfixture --ez hide true");android.os.SystemClock.sleep(350);
      shell("am broadcast -a com.chatq.keyboardfixture.EDIT -p com.chatq.keyboardfixture --ez show true");chatWait("图片表情包");
      expect(findText("使用表情")==null&&findText("images:0 attempts:0")!=null,"hidden image preview never commits or resumes automatically");hostTap("返回打字");chatWait("空格");textIs("SAFE","image hide/show retains draft");
    } catch(Exception | AssertionError failure) {sectionShot("lifecycle-failure");throw failure;}
    finally {SharedPreferences.Editor restore=prefs.edit().putBoolean("saveGenerationHistory",save);for(Map.Entry<String,String> e:old.entrySet())if(e.getValue()==null)restore.remove(e.getKey());else restore.putString(e.getKey(),e.getValue());restore.commit();syntheticClipboard("");}
  }
  private void flowUi() throws Exception {
    arguments.putString("chatToolsUi","true");
    android.accessibilityservice.AccessibilityServiceInfo info=getUiAutomation().getServiceInfo();info.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;getUiAutomation().setServiceInfo(info);
    SharedPreferences prefs=getTargetContext().getSharedPreferences("chatq_keyboard",0);Map<String,String> old=new HashMap<>();
    for(String key:new String[]{"baseUrl","apiKey","deviceId","typingPreferences"})old.put(key,prefs.getString(key,null));boolean save=prefs.getBoolean("saveGenerationHistory",true);
    Class<?> type=getTargetContext().getClassLoader().loadClass("expo.modules.chatqkeyboard.TypingPreferences");Object config=type.getConstructor(SharedPreferences.class).newInstance(prefs);
    try {
      type.getMethod("update",JSONObject.class).invoke(config,new JSONObject().put("layout","qwerty").put("height","normal").put("bottomSpace","normal").put("chinese",true).put("cloudWords",false));
      prefs.edit().putString("apiKey","flow-test-only").putString("deviceId","flow-test-only").putBoolean("saveGenerationHistory",false).commit();
      shell("ime set com.android.inputmethod.latin/.LatinIME");shell("ime set com.jaxon.app.chatq/expo.modules.chatqkeyboard.ChatQInputMethodService");flowSeed("DRAFT",5,5);
      float density=getTargetContext().getResources().getDisplayMetrics().density;
      expect(boundsOf("粘贴并生成").height()>=48*density,"primary action meets portrait touch size");
      expect(boundsOf("返回打字").height()>=48*density,"return stays reachable");
      syntheticClipboard("");clickText("粘贴并生成");chatWait("没有可用文字，请先复制文字或在输入框打字");textIs("DRAFT","empty clipboard keeps editor");
      syntheticClipboard("OPPONENT");
      try(InputNetworkChecks.Server server=new InputNetworkChecks.Server("{\"success\":true,\"data\":{\"candidates\":[\"READY\"]}}",false)) {
        prefs.edit().putString("baseUrl","http://localhost:"+server.server.getLocalPort()).commit();clickText("粘贴并生成");
        expect(server.received.await(3,java.util.concurrent.TimeUnit.SECONDS)&&server.payload.getString("prompt").equals("OPPONENT"),"one tap reads and requests exact clipboard text");
        expect(server.payload.getString("purpose").equals("reply"),"reply intent explicit");chatWait("READY");textIs("DRAFT","preview never touches editor");sectionShot("flow-reply");
        hostTap("返回打字");chatWait("空格");hostTap("AI 回复与话题库");chatWait("READY");clickText("READY");chatWait("空格");textIs("DRAFTREADY","candidate inserts once then returns to typing");expect(findText("action:0 count:0")!=null,"candidate never sends");
      }
      hostTap("AI 回复与话题库");syntheticClipboard("");hostTap("粘贴新消息并生成");expect(findText("OPPONENT")!=null,"empty new clipboard keeps old prompt");
      char[] longText=new char[1001];Arrays.fill(longText,'X');syntheticClipboard(new String(longText));hostTap("粘贴新消息并生成");chatWait("文字超过 1000 字，请选取较短内容；原文未改动");expect(findText("OPPONENT")!=null,"overlong clipboard never truncates or replaces source");
      hostTap("找话题");hostTap("帮我回复");expect(findText("OPPONENT")!=null,"switching tasks retains reply draft");
      try(InputNetworkChecks.Server server=new InputNetworkChecks.Server("{\"success\":false,\"error\":{\"message\":\"fixture temporary failure\"}}",false)) {
        prefs.edit().putString("baseUrl","http://localhost:"+server.server.getLocalPort()).commit();clickText("重新生成");chatWait("fixture temporary failure");expect(findText("OPPONENT")!=null&&findText("重新生成")!=null,"failure leaves source and retry in place");
      }
      try(InputNetworkChecks.Server server=new InputNetworkChecks.Server("{\"success\":true,\"data\":{\"candidates\":[\"STALE\"]}}",true)) {
        prefs.edit().putString("baseUrl","http://localhost:"+server.server.getLocalPort()).commit();clickText("重新生成");expect(server.received.await(3,java.util.concurrent.TimeUnit.SECONDS),"retry makes a new request");clickText("停止生成");chatWait("已停止，原文保留，可重新生成");server.release.countDown();android.os.SystemClock.sleep(250);expect(findText("STALE")==null,"cancel rejects late response");
      }
      try(InputNetworkChecks.Server server=new InputNetworkChecks.Server("{\"success\":true,\"data\":{\"candidates\":[\"LATE\"]}}",true)) {
        prefs.edit().putString("baseUrl","http://localhost:"+server.server.getLocalPort()).commit();clickText("重新生成");expect(server.received.await(3,java.util.concurrent.TimeUnit.SECONDS),"request pending before return");hostTap("返回打字");chatWait("空格");expect(server.disconnected.await(2,java.util.concurrent.TimeUnit.SECONDS),"return cancels actual transport");server.release.countDown();hostTap("AI 回复与话题库");expect(findText("LATE")==null&&findText("重新生成")!=null,"return retains source without stale request");
      }
      flowSeed("hello friend",12,12);hostTap("润色我的话");
      try(InputNetworkChecks.Server server=new InputNetworkChecks.Server("{\"success\":true,\"data\":{\"candidates\":[\"Hello, friend!\"]}}",false)) {
        prefs.edit().putString("baseUrl","http://localhost:"+server.server.getLocalPort()).commit();clickText("润色输入框");expect(server.received.await(3,java.util.concurrent.TimeUnit.SECONDS),"polish reads current editor explicitly");
        expect(server.payload.getString("purpose").equals("polish")&&server.payload.getString("prompt").equals("hello friend"),"polish uses separate intent and exact draft");chatWait("Hello, friend!");textIs("hello friend","polish preview preserves original");sectionShot("flow-polish");clickText("Hello, friend!");chatWait("空格");textIs("Hello, friend!","collapsed cursor polishes entire draft without duplicate append");
      }
      flowSeed("prefix hello suffix",7,12);hostTap("润色我的话");
      android.view.accessibility.AccessibilityNodeInfo selectedEditor=findText("prefix hello suffix");expect(selectedEditor!=null&&selectedEditor.getTextSelectionStart()==7&&selectedEditor.getTextSelectionEnd()==12,"selected-range fixture remains selected before polish");
      try(InputNetworkChecks.Server server=new InputNetworkChecks.Server("{\"success\":true,\"data\":{\"candidates\":[\"HELLO\"]}}",false)) {
        prefs.edit().putString("baseUrl","http://localhost:"+server.server.getLocalPort()).commit();clickText("润色输入框");expect(server.received.await(3,java.util.concurrent.TimeUnit.SECONDS)&&server.payload.getString("prompt").equals("hello"),"selected text alone is uploaded");chatWait("HELLO");clickText("HELLO");chatWait("空格");textIs("prefix HELLO suffix","only selected range replaced");
      }
      flowSeed("keep original",13,13);hostTap("润色我的话");
      try(InputNetworkChecks.Server server=new InputNetworkChecks.Server("{\"success\":true,\"data\":{\"candidates\":[\"NEW\"]}}",false)) {
        prefs.edit().putString("baseUrl","http://localhost:"+server.server.getLocalPort()).commit();clickText("润色输入框");chatWait("NEW");
        shell("am broadcast -a com.chatq.keyboardfixture.EDIT -p com.chatq.keyboardfixture --es text CHANGED --ei cursor 7");android.os.SystemClock.sleep(250);
        if(findText("NEW")!=null){clickText("NEW");chatWait("输入内容或光标已改变，未替换；点重新润色即可更新");hostTap("返回打字");}
        else expect(findText("q")!=null,"editor restart clears obsolete result");
        textIs("CHANGED","changed editor never overwritten by stale polish");chatWait("空格");
      }
      flowSeed("keep cursor",11,11);hostTap("润色我的话");
      try(InputNetworkChecks.Server server=new InputNetworkChecks.Server("{\"success\":true,\"data\":{\"candidates\":[\"CURSOR\"]}}",false)) {
        prefs.edit().putString("baseUrl","http://localhost:"+server.server.getLocalPort()).commit();clickText("润色输入框");chatWait("CURSOR");
        shell("am broadcast -a com.chatq.keyboardfixture.EDIT -p com.chatq.keyboardfixture --ei cursor 0");android.os.SystemClock.sleep(250);clickText("CURSOR");chatWait("输入内容或光标已改变，未替换；点重新润色即可更新");textIs("keep cursor","cursor movement blocks unintended replacement");hostTap("返回打字");
      }
      flowSeed("Z",1,1);hostTap("润色我的话");syntheticClipboard("draft from clipboard");
      try(InputNetworkChecks.Server server=new InputNetworkChecks.Server("{\"success\":true,\"data\":{\"candidates\":[\"PASTED\"]}}",false)) {
        prefs.edit().putString("baseUrl","http://localhost:"+server.server.getLocalPort()).commit();hostTap("粘贴并润色");expect(server.received.await(3,java.util.concurrent.TimeUnit.SECONDS)&&server.payload.getString("prompt").equals("draft from clipboard"),"clipboard polish is one action");chatWait("PASTED");clickText("PASTED");chatWait("空格");textIs("ZPASTED","clipboard polish inserts at cursor without rewriting other draft");
      }
      for(String tool:new String[]{"表情","更多"}) {clickText(tool);hostTap("返回打字");chatWait("空格");expect(findText("q")!=null,"one return always reaches letter keys from "+tool);}
      clickText("更多");clickText("编辑文字");hostTap("返回打字");chatWait("q");
      hostTap("AI 回复与话题库");shell("input keyevent 4");chatWait("空格");expect(findText("q")!=null,"system back returns from AI to typing");
      hostTap("AI 回复与话题库");hostTap("找话题");clickText("今天有没有哪件小事，让你心情突然变好了？");chatWait("空格");expect(editorText().contains("今天有没有哪件小事"),"offline topic also returns after insertion");expect(findText("action:0 count:0")!=null,"all flows leave send action untouched");
      shell("am start -S -n com.chatq.keyboardfixture/.FixtureActivity --es mode private --es seed PRIVATE");chatWait("空格");hostTap("AI 回复与话题库");hostTap("润色我的话");expect(!findText("润色输入框").isEnabled(),"private editor disables polish");expect(!description("粘贴并润色").isEnabled(),"private editor disables clipboard action");hostTap("帮我回复");expect(!findText("粘贴并生成").isEnabled(),"private editor disables reply");
    } finally { SharedPreferences.Editor restore=prefs.edit().putBoolean("saveGenerationHistory",save);for(Map.Entry<String,String> e:old.entrySet())if(e.getValue()==null)restore.remove(e.getKey());else restore.putString(e.getKey(),e.getValue());restore.commit();syntheticClipboard(""); }
  }


  private void flowDailyUi() throws Exception {
    arguments.putString("chatToolsUi","true");android.accessibilityservice.AccessibilityServiceInfo info=getUiAutomation().getServiceInfo();info.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;getUiAutomation().setServiceInfo(info);
    SharedPreferences prefs=getTargetContext().getSharedPreferences("chatq_keyboard",0);Map<String,String> old=new HashMap<>();for(String key:new String[]{"baseUrl","apiKey","deviceId","typingPreferences"})old.put(key,prefs.getString(key,null));boolean save=prefs.getBoolean("saveGenerationHistory",true);
    try {
      Class<?> type=getTargetContext().getClassLoader().loadClass("expo.modules.chatqkeyboard.TypingPreferences");Object config=type.getConstructor(SharedPreferences.class).newInstance(prefs);type.getMethod("update",JSONObject.class).invoke(config,new JSONObject().put("layout","nine").put("chinese",true).put("theme","light").put("cloudWords",false));
      prefs.edit().putString("apiKey","flow-local").putString("deviceId","flow-local").putBoolean("saveGenerationHistory",false).commit();shell("ime set com.android.inputmethod.latin/.LatinIME");shell("ime set com.jaxon.app.chatq/expo.modules.chatqkeyboard.ChatQInputMethodService");flowSeed("SAFE",4,4);syntheticClipboard("明天下午三点见面可以吗？");
      String paragraph="可以呀，明天下午三点见面。我会提前安排好时间，到时候我们再聊。";String longReply=paragraph+paragraph+paragraph+paragraph+paragraph;
      JSONArray replies=new JSONArray().put(longReply).put("好的，明天下午三点见。").put("没问题，我们明天下午三点见！");
      try(InputNetworkChecks.Server server=new InputNetworkChecks.Server(new JSONObject().put("success",true).put("data",new JSONObject().put("candidates",replies)).toString(),false)) {
        prefs.edit().putString("baseUrl","http://localhost:"+server.server.getLocalPort()).commit();clickText("粘贴并生成");chatWait(longReply);android.graphics.Rect back=boundsOf("返回打字"),generate=boundsOf("重新生成");sectionShot("flow-long-reply");clickExpanded("没问题，我们明天下午三点见！");chatWait("2 ABC");textIs("SAFE没问题，我们明天下午三点见！","scroll to last candidate inserts it once and restores nine-key layout");
        hostTap("AI 回复与话题库");expect(boundsOf("返回打字").equals(back)&&boundsOf("重新生成").equals(generate),"long result scrolling cannot move primary and return controls");hostTap("返回打字");digits("64426");chatWait("你好");hostTap("展开候选词");hostTap("返回打字");chatWait("2 ABC");textIs("SAFE没问题，我们明天下午三点见！64426","return from expanded candidates preserves unfinished spelling");clickText("你好");textIs("SAFE没问题，我们明天下午三点见！你好","typing remains functional after AI and expanded candidate return");expect(findText("action:0 count:0")!=null,"daily flow never sends automatically");
      }
    } finally {SharedPreferences.Editor restore=prefs.edit().putBoolean("saveGenerationHistory",save);for(Map.Entry<String,String> e:old.entrySet())if(e.getValue()==null)restore.remove(e.getKey());else restore.putString(e.getKey(),e.getValue());restore.commit();syntheticClipboard("");}
  }
  private void layoutSeek(String label) throws Exception {
    for(int attempt=0;attempt<24;attempt++) {
      android.view.accessibility.AccessibilityNodeInfo node=description(label);if(node==null)node=findText(label);
      android.graphics.Rect viewport=new android.graphics.Rect(0,90,320,450),bounds=new android.graphics.Rect();
      if(node!=null) {
        android.view.accessibility.AccessibilityNodeInfo parent=node.getParent();
        while(parent!=null) { if(parent.isScrollable()) { parent.getBoundsInScreen(viewport);break; } parent=parent.getParent(); }
        node.performAction(android.view.accessibility.AccessibilityNodeInfo.AccessibilityAction.ACTION_SHOW_ON_SCREEN.getId());android.os.SystemClock.sleep(400);
        node=description(label);if(node==null)node=findText(label);if(node!=null)node.getBoundsInScreen(bounds);
        if(bounds.height()>20&&bounds.top>=viewport.top&&bounds.bottom<=viewport.bottom)return;
      }
      boolean above=bounds.height()>0&&bounds.bottom<=viewport.top;
      int low=viewport.bottom-20,high=viewport.top+Math.max(30,viewport.height()/4);
      shell("input swipe "+viewport.centerX()+" "+(above?high:low)+" "+viewport.centerX()+" "+(above?low:high)+" 220");android.os.SystemClock.sleep(150);
    }
    sectionShot("layout-failure");throw new AssertionError("layout target not visible: "+label);
  }
  private void layoutUi() throws Exception {
    shell("ime set com.jaxon.app.chatq/expo.modules.chatqkeyboard.ChatQInputMethodService");
    arguments.putString("chatToolsUi","true");
    android.accessibilityservice.AccessibilityServiceInfo info=getUiAutomation().getServiceInfo();info.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;getUiAutomation().setServiceInfo(info);
    SharedPreferences prefs=getTargetContext().getSharedPreferences("chatq_keyboard",0);Map<String,String> old=new HashMap<>();
    for(String key:new String[]{"baseUrl","apiKey","deviceId","personaSelection"})old.put(key,prefs.getString(key,null));
    try(ChatHttpFixture fixture=new ChatHttpFixture()) {
      prefs.edit().putString("baseUrl","http://localhost:"+fixture.listener.getLocalPort()).putString("apiKey","layout-test-only").putString("deviceId","layout-test-only").commit();
      shell("am start -n com.jaxon.app.chatq/.MainActivity");chatWait("已连接");hostTap("帮回复");chatWait("对方消息");
      float density=getTargetContext().getResources().getDisplayMetrics().density;
      android.graphics.Bitmap shot=getUiAutomation().takeScreenshot();int screenWidth=shot.getWidth();shot.recycle();
      android.graphics.Rect primary=boundsOf("帮我想回复"),nav=boundsOf("帮回复");
      expect(primary.height()>=48*density&&primary.bottom<=nav.top,"primary action stays above navigation at current font size");
      expect(!description("帮我想回复").isEnabled(),"empty input cannot accidentally generate");
      for(String tab:new String[]{"帮回复","发现","我的"}) { android.graphics.Rect b=boundsOf(tab);expect(b.width()>=48*density&&b.left>=0&&b.right<=screenWidth,"tab stays touchable and within screen: "+tab); }
      sectionShot("layout-home");
      android.graphics.Rect firstInput=boundsOf("对方消息");expect(firstInput.height()>=48*density&&firstInput.bottom<=primary.top,"message field is visible on first screen even with large text");
      layoutSeek("对方消息");android.graphics.Rect inputBounds=boundsOf("对方消息");shell("input tap "+inputBounds.centerX()+" "+inputBounds.centerY());chatWait("空格");setHostText("对方消息","布局测试：明天见面好吗？");shell("input keyevent 4");chatWait("帮我想回复");android.os.SystemClock.sleep(250);
      expect(description("帮我想回复").isEnabled(),"draft enables generation without sending");
      layoutSeek("回复偏好");hostTap("回复偏好");layoutSeek("对方与我的关系：不指定");hostTap("对方与我的关系：不指定");android.os.SystemClock.sleep(350);expect(new JSONObject(prefs.getString("personaSelection","{}")).optString("relationId").isEmpty(),"one expansion exposes relation selector and persists choice for keyboard");layoutSeek("聊天场景：不指定");hostTap("聊天场景：不指定");android.os.SystemClock.sleep(350);expect(new JSONObject(prefs.getString("personaSelection","{}")).optString("sceneId").isEmpty(),"scene selection persists without another layer");sectionShot("layout-persona");layoutSeek("用什么语气聊？");sectionShot("layout-preferences");
      if("true".equals(arguments.getString("typographyReview"))) {layoutSeek("生成数量");sectionShot("layout-tone-grid");float scale=getTargetContext().getResources().getConfiguration().fontScale;for(String tone:new String[]{"自然","得体","幽默","轻松"}) {android.view.accessibility.AccessibilityNodeInfo text=description(tone);android.graphics.Rect rect=new android.graphics.Rect();if(text!=null)text.getBoundsInScreen(rect);expect(text!=null&&rect.height()>0&&rect.height()<=Math.ceil(22*scale*density)+28*density,"tone labels stay on one readable line at large font: "+tone+" "+rect);}}

      hostTap("发现");chatWait("聊天工具箱");sectionShot("layout-discover");layoutSeek("人设卡片");hostTap("人设卡片");chatWait("返回发现");hostTap("返回发现");layoutSeek("生成记录");hostTap("生成记录");chatWait("返回发现");hostTap("返回发现");
      hostTap("我的");chatWait("我的键盘");sectionShot("layout-mine");layoutSeek("调整键盘布局与高度");hostTap("调整键盘布局与高度");chatWait("安卓键盘偏好");hostTap("返回我的");layoutSeek("额度与套餐");hostTap("额度与套餐");chatWait("返回我的");hostTap("返回我的");
      hostTap("帮回复");layoutSeek("对方消息");expect(description("对方消息").getText().toString().contains("布局测试"),"navigation preserves unsent reply draft");
      expect(fixture.requests.size()==0,"layout and navigation spend no AI quota");sectionShot("layout-draft");
    } catch(Exception | AssertionError failure) { sectionShot("layout-failure");throw failure; }
    finally { SharedPreferences.Editor restore=prefs.edit();for(Map.Entry<String,String> e:old.entrySet()){if(e.getValue()==null)restore.remove(e.getKey());else restore.putString(e.getKey(),e.getValue());}restore.commit(); }
  }
  private void uxUi() throws Exception {
    android.accessibilityservice.AccessibilityServiceInfo info=getUiAutomation().getServiceInfo();info.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;getUiAutomation().setServiceInfo(info);
    SharedPreferences prefs=getTargetContext().getSharedPreferences("chatq_keyboard",0);
    Map<String,String> old=new HashMap<>();for(String key:new String[]{"baseUrl","apiKey","deviceId","typingPreferences"})old.put(key,prefs.getString(key,null));
    Class<?> type=getTargetContext().getClassLoader().loadClass("expo.modules.chatqkeyboard.TypingPreferences");Object config=type.getConstructor(SharedPreferences.class).newInstance(prefs);Method update=type.getMethod("update",JSONObject.class),snapshot=type.getMethod("snapshot");
    try(ChatHttpFixture fixture=new ChatHttpFixture()) {
      update.invoke(config,new JSONObject().put("layout","qwerty").put("height","normal").put("bottomSpace","normal").put("theme","light").put("numberRow",false).put("chinese",true).put("cloudWords",false));
      update.invoke(config,new JSONObject().put("bottomSpace","invalid"));expect(((JSONObject)snapshot.invoke(config)).getString("bottomSpace").equals("normal"),"invalid bottom spacing rejected");
      prefs.edit().putString("baseUrl","http://localhost:"+fixture.listener.getLocalPort()).putString("apiKey","local-ux-test").putString("deviceId","local-ux-test").commit();
      shell("ime set com.jaxon.app.chatq/expo.modules.chatqkeyboard.ChatQInputMethodService");fresh("SAFE");
      android.graphics.Rect space=boundsOf("空格"),more=boundsOf("更多");float density=getTargetContext().getResources().getDisplayMetrics().density;
      android.graphics.Bitmap shot=getUiAutomation().takeScreenshot();int screenHeight=shot.getHeight();shot.recycle();
      expect(screenHeight-space.bottom>=24*density,"bottom row lifted at least 24dp above physical bottom");
      expect(more.width()>=48*density&&more.height()>=48*density,"four toolbar targets fit 48dp width and height");
      expect(boundsOf("展开候选词").width()>=48*density,"candidate expand target enlarged");
      letters("nihao",30);expect(findText("你好")!=null,"pinyin candidate after toolbar/spacing changes");clickText("你好");textIs("你好","candidate inserts once");sectionShot("ux-keyboard");
      clickText("更多");expect(findText("编辑文字")!=null&&findText("切换输入法")!=null,"secondary typing actions grouped in more");clickText("底部留白：舒适");chatWait("底部留白：较高");hostTap("返回打字");
      expect(space.bottom-boundsOf("空格").bottom>=15*density,"higher setting lifts bottom row another 16dp");fresh("SAFE");expect(((JSONObject)snapshot.invoke(config)).getString("bottomSpace").equals("high"),"bottom setting persists on reopen");
      clickText("更多");clickText("切换九宫格");chatWait("2 ABC");clickText("6 MNO");clickText("4 GHI");clickText("4 GHI");clickText("2 ABC");clickText("6 MNO");expect(findText("你好")!=null,"nine-key candidates remain available");clickText("你好");textIs("你好","nine-key selection uses new geometry");sectionShot("ux-nine");
      hostTap("AI 回复与话题库");chatWait("粘贴并生成");android.graphics.Rect generate=boundsOf("粘贴并生成");expect(generate.height()>=48*density&&generate.bottom<screenHeight-24*density,"AI primary action visible above bottom safe area");
      hostTap("找话题");chatWait("今天有没有哪件小事，让你心情突然变好了？");sectionShot("ux-ai-topics");expect(findText("action:0 count:0")!=null,"opening AI/topic panes never sends to host editor");
      hostTap("偏好与记录");chatWait("生成记录");expect(findText("读取选中文字")!=null,"secondary AI functions reachable from one menu");shell("input keyevent 4");
      shell("am start -n com.jaxon.app.chatq/.MainActivity");chatWait("已连接");hostTap("帮回复");chatWait("对方消息");hostTap("对方消息");chatWait("空格");setHostText("对方消息","布局试用消息");shell("input keyevent 4");android.os.SystemClock.sleep(400);
      android.graphics.Rect primary=boundsOf("帮我想回复"),nav=boundsOf("帮回复");expect(primary.height()>=48*density&&primary.bottom<=nav.top,"primary generation action visible without scrolling");expect(findText("用什么语气聊？")==null,"advanced reply controls hidden initially");sectionShot("ux-home");
      hostTap("发现");chatWait("聊天工具箱");hostTap("人设卡片");chatWait("返回发现");hostTap("返回发现");hostTap("生成记录");chatWait("返回发现");hostTap("返回发现");
      hostTap("我的");chatWait("调整键盘布局与高度");sectionShot("ux-mine");hostTap("调整键盘布局与高度");chatWait("安卓键盘偏好");sectionShot("ux-settings");
      expect(fixture.requests.size()==0,"layout/settings/navigation checks make zero generation requests");
    } finally {SharedPreferences.Editor restore=prefs.edit();for(Map.Entry<String,String> e:old.entrySet()){if(e.getValue()==null)restore.remove(e.getKey());else restore.putString(e.getKey(),e.getValue());}restore.commit();}
  }
  private void chatUi() throws Exception {
    android.accessibilityservice.AccessibilityServiceInfo info=getUiAutomation().getServiceInfo();info.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;getUiAutomation().setServiceInfo(info);
    Context context=getTargetContext();SharedPreferences prefs=context.getSharedPreferences("chatq_keyboard",0);Map<String,String> previous=new HashMap<>();for(String key:new String[]{"baseUrl","apiKey","deviceId"})previous.put(key,prefs.getString(key,null));boolean oldEnabled=prefs.getBoolean("saveGenerationHistory",true);
    Class<?> type=context.getClassLoader().loadClass("expo.modules.chatqkeyboard.GenerationStore");Object store=type.getConstructor(Context.class).newInstance(context);Method list=type.getMethod("listChats"),del=type.getMethod("deleteChat",String.class);Set<String> before=new HashSet<>();JSONArray rows=new JSONArray((String)list.invoke(store));for(int i=0;i<rows.length();i++)before.add(rows.getJSONObject(i).getString("id"));
    try(ChatHttpFixture fixture=new ChatHttpFixture()) {
      prefs.edit().putString("baseUrl","http://localhost:"+fixture.listener.getLocalPort()).putString("apiKey","local-ui-test").putString("deviceId","local-ui-test").putBoolean("saveGenerationHistory",true).commit();
      shell("am start -n com.jaxon.app.chatq/.MainActivity");chatWait("已连接");hostTap("AI 对话");chatWait("AI 对话消息");android.os.SystemClock.sleep(800);hostTap("新对话");fixture.hold=true;setHostText("AI 对话消息","第一问测试");hostTap("发送给 AI");chatWait("本地测试回答 ");expect(findText("本地测试回答 第一问测试")==null,"stream first delta appears before full answer");sectionShot("chat-streaming");fixture.hold=false;fixture.release.countDown();chatWait("本地测试回答 第一问测试");chatIdle();expect(fixture.requests.size()==1&&fixture.requests.get(0).getJSONArray("history").length()==0,"first turn has no previous conversation");
      String selection=prefs.getString("personaSelection",null);hostTap("对话人设与上下文");chatWait("携带对话上下文");JSONObject persona=new JSONObject(prefs.getString("personalization","{}"));String card=persona.getJSONArray("cards").getJSONObject(0).getString("name");hostTap("对话人设："+card);setHostText("AI 对话背景","只在当前会话练习表达");hostTap("完成");
      setHostText("AI 对话消息","第二问测试");hostTap("发送给 AI");chatWait("本地测试回答 第二问测试");chatIdle();JSONObject second=fixture.requests.get(1);expect(second.getJSONArray("history").length()==2&&second.getJSONArray("history").getJSONObject(1).getString("content").equals("本地测试回答 第一问测试"),"second turn carries real structured previous answer");expect(second.getString("personaName").equals(card)&&second.getString("context").equals("只在当前会话练习表达"),"chat sends chosen persona and background");expect(Objects.equals(selection,prefs.getString("personaSelection",null)),"chat persona does not alter keyboard selection");sectionShot("chat-multi-round");
      setHostText("AI 对话消息","重新生成时保留的草稿");fixture.hold=true;fixture.release=new java.util.concurrent.CountDownLatch(1);fixture.suffix=" · 新回答";hostTap("重新生成最后回答");chatWait("本地测试回答 ");JSONArray during=new JSONArray((String)list.invoke(store));String duringId=null;for(int k=0;k<during.length();k++)if(during.getJSONObject(k).getString("title").equals("第一问测试"))duringId=during.getJSONObject(k).getString("id");expect(duringId!=null&&new JSONObject((String)type.getMethod("getChat",String.class).invoke(store,duringId)).getJSONArray("turns").getJSONObject(1).getString("answer").equals("本地测试回答 第二问测试"),"original saved answer remains while regenerating");sectionShot("chat-regenerating");fixture.hold=false;fixture.release.countDown();chatWait("本地测试回答 第二问测试 · 新回答");chatIdle();expect(description("AI 对话消息").getText().toString().equals("重新生成时保留的草稿"),"regenerate retains composer draft");JSONObject regen=fixture.requests.get(2);expect(regen.getString("prompt").equals("第二问测试")&&regen.getJSONArray("history").length()==2,"regenerate uses original question and excludes replaced answer");sectionShot("chat-regenerated");
      hostTap("会话");chatWait("搜索 AI 会话");setHostText("搜索 AI 会话","新回答");chatWait("找到 1 个会话");expect(description("继续对话：第一问测试")!=null,"search matches a full stored answer");sectionShot("chat-search");setHostText("搜索 AI 会话","%_'unmatched");chatWait("没有匹配的会话，试试其他关键词。");setHostText("搜索 AI 会话","");chatWait("继续对话：第一问测试");hostTap("继续对话：第一问测试");fixture.suffix="";
      hostTap("对话人设与上下文");sectionShot("chat-settings");hostTap("携带对话上下文");hostTap("完成");setHostText("AI 对话消息","不带上下文测试");hostTap("发送给 AI");chatWait("本地测试回答 不带上下文测试");chatIdle();expect(fixture.requests.get(3).getJSONArray("history").length()==0,"context toggle omits previous rounds");
      fixture.hold=true;fixture.release=new java.util.concurrent.CountDownLatch(1);setHostText("AI 对话消息","取消测试");hostTap("发送给 AI");for(int i=0;i<50&&fixture.requests.size()<5;i++)android.os.SystemClock.sleep(100);chatWait("停止生成");hostTap("停止生成");chatWait("复制未完成预览");sectionShot("chat-cancelled-preview");fixture.release.countDown();android.os.SystemClock.sleep(600);expect(findText("本地测试回答 取消测试")==null,"late cancelled answer stays hidden");expect(description("AI 对话消息").getText().toString().equals("取消测试"),"cancelled question stays editable");
      hostTap("新对话");expect(!description("AI 对话消息").getText().toString().equals("取消测试"),"new session clears only its own composer");hostTap("会话");chatWait("继续对话：第一问测试");sectionShot("chat-sessions");hostTap("继续对话：第一问测试");chatWait("本地测试回答 不带上下文测试");chatIdle();expect(description("AI 对话消息").getText().toString().equals("取消测试"),"reopened conversation retains unsent draft and completed messages");
      hostTap("AI 对话消息");chatWait("空格");android.graphics.Rect composer=new android.graphics.Rect();description("AI 对话消息").getBoundsInScreen(composer);int keyboardTop=640;for(android.view.accessibility.AccessibilityWindowInfo window:getUiAutomation().getWindows())if(window.getType()==android.view.accessibility.AccessibilityWindowInfo.TYPE_INPUT_METHOD){android.graphics.Rect bounds=new android.graphics.Rect();window.getBoundsInScreen(bounds);keyboardTop=bounds.top;}expect(composer.bottom<=keyboardTop,"composer stays above real IME at current font size");android.graphics.Rect sendBounds=new android.graphics.Rect();description("发送给 AI").getBoundsInScreen(sendBounds);expect(sendBounds.bottom<=keyboardTop&&sendBounds.height()>=52,"send control remains visible and touchable with keyboard open");expect(findText("聊商 ChatQ")==null&&description("对话人设与上下文")==null,"typing collapses nonessential headers on the chat screen");sectionShot("chat-keyboard");shell("input keyevent 4");
      rows=new JSONArray((String)list.invoke(store));JSONObject saved=null;for(int i=0;i<rows.length();i++)if(rows.getJSONObject(i).getString("title").equals("第一问测试"))saved=rows.getJSONObject(i);expect(saved!=null&&saved.getInt("turnCount")==3,"native store contains exactly three completed rounds");
    } finally {
      rows=new JSONArray((String)list.invoke(store));for(int i=0;i<rows.length();i++){String id=rows.getJSONObject(i).getString("id");if(!before.contains(id))del.invoke(store,id);}((android.database.sqlite.SQLiteOpenHelper)store).close();SharedPreferences.Editor edit=prefs.edit().putBoolean("saveGenerationHistory",oldEnabled);for(Map.Entry<String,String> e:previous.entrySet())if(e.getValue()==null)edit.remove(e.getKey());else edit.putString(e.getKey(),e.getValue());edit.commit();
    }
  }

  private String shellText(String command) throws Exception {
    android.os.ParcelFileDescriptor fd=getUiAutomation().executeShellCommand(command);try(java.io.InputStream input=new android.os.ParcelFileDescriptor.AutoCloseInputStream(fd);java.io.ByteArrayOutputStream output=new java.io.ByteArrayOutputStream()){byte[] bytes=new byte[4096];int n;while((n=input.read(bytes))>=0)output.write(bytes,0,n);return output.toString("UTF-8");}
  }
  private void toolTap(String label) throws Exception {
    android.os.SystemClock.sleep(500);android.view.accessibility.AccessibilityNodeInfo node=description(label);android.graphics.Rect bounds=new android.graphics.Rect();if(node!=null)node.getBoundsInScreen(bounds);expect(node!=null&&node.isEnabled()&&bounds.width()>=48&&bounds.height()>=40&&node.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK),"accessible tool touch target: "+label+" bounds="+bounds+" enabled="+(node!=null&&node.isEnabled()));android.os.SystemClock.sleep(150);
  }
  private void saveChatFile(String filename) throws Exception {
    hostSeek("选择位置并导出");toolTap("选择位置并导出");chatWait("SAVE");
    android.view.accessibility.AccessibilityNodeInfo field=editNode(getUiAutomation().getRootInActiveWindow());expect(field!=null,"SAF filename editable");Bundle args=new Bundle();args.putCharSequence(android.view.accessibility.AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,filename);field.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_SET_TEXT,args);sectionShot("chat-export-picker");clickText("SAVE");chatWait("聊天记录已保存到你选择的位置。");
  }
  private void seekEarlierQuestion(String label) throws Exception {
    android.graphics.Rect top=new android.graphics.Rect(),bottom=new android.graphics.Rect();description("对话人设与上下文").getBoundsInScreen(top);description("AI 对话消息").getBoundsInScreen(bottom);
    for(int i=0;i<25;i++){android.view.accessibility.AccessibilityNodeInfo node=description(label);if(node!=null){node.performAction(android.view.accessibility.AccessibilityNodeInfo.AccessibilityAction.ACTION_SHOW_ON_SCREEN.getId());android.os.SystemClock.sleep(300);node=description(label);android.graphics.Rect bounds=new android.graphics.Rect();node.getBoundsInScreen(bounds);if(bounds.height()>=40&&bounds.top>=top.bottom&&bounds.bottom<=bottom.top)return;if(bounds.bottom>bottom.top){shell("input swipe 160 "+(bottom.top-25)+" 160 "+(top.bottom+25)+" 200");continue;}}shell("input swipe 160 "+(top.bottom+25)+" 160 "+(bottom.top-25)+" 200");android.os.SystemClock.sleep(150);}sectionShot("chat-failure");throw new AssertionError("missing earlier question "+label);
  }
  private void chatToolsUi() throws Exception {
    android.accessibilityservice.AccessibilityServiceInfo info=getUiAutomation().getServiceInfo();info.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;getUiAutomation().setServiceInfo(info);
    Context context=getTargetContext();SharedPreferences prefs=context.getSharedPreferences("chatq_keyboard",0);Map<String,String> oldConfig=new HashMap<>();for(String key:new String[]{"baseUrl","apiKey","deviceId"})oldConfig.put(key,prefs.getString(key,null));boolean oldEnabled=prefs.getBoolean("saveGenerationHistory",true);
    Class<?> type=context.getClassLoader().loadClass("expo.modules.chatqkeyboard.GenerationStore");Object store=type.getConstructor(Context.class).newInstance(context);Method list=type.getMethod("listChats"),get=type.getMethod("getChat",String.class),save=type.getMethod("saveChat",String.class),del=type.getMethod("deleteChat",String.class);Set<String> before=new HashSet<>();JSONArray rows=new JSONArray((String)list.invoke(store));for(int i=0;i<rows.length();i++)before.add(rows.getJSONObject(i).getString("id"));
    String marker=Long.toString(System.currentTimeMillis()),id="tools-qa-"+marker,title="工具测试"+marker,renamed="我的对话"+marker,txt="ChatQ-tools-QA-"+marker+".txt",md="ChatQ-tools-QA-"+marker+".md";
    try(ChatHttpFixture fixture=new ChatHttpFixture()) {
      prefs.edit().putString("baseUrl","http://localhost:"+fixture.listener.getLocalPort()).putString("apiKey","local-tools-config").putString("deviceId","local-tools-fixture").putBoolean("saveGenerationHistory",true).commit();
      JSONObject seeded=ConversationChecks.chat(id).put("title",title).put("draft","ORIGINAL_UNSENT_TEST");JSONArray turns=new JSONArray();for(int i=0;i<3;i++)turns.put(new JSONObject().put("id","tools-turn-"+i).put("question",new String[]{"第一轮工具问题","需要修改的问题","后续问题"}[i]).put("answer",new String[]{"第一轮工具回答🙂","保留的旧回答","保留的后续回答"}[i]).put("personaName","默认助手").put("at",1700000000001L+i));seeded.put("turns",turns);expect((Boolean)save.invoke(store,seeded.toString()),"seed isolated synthetic chat");
      shell("am start -n com.jaxon.app.chatq/.MainActivity");chatWait("已连接");toolTap("AI 对话");chatWait("AI 对话消息");toolTap("会话");chatWait("搜索 AI 会话");setHostText("搜索 AI 会话",marker);chatWait("继续对话："+title);hostSeek("重命名对话："+title);toolTap("重命名对话："+title);chatWait("会话新名称");setHostText("会话新名称","");hostSeek("保存名称");toolTap("保存名称");chatWait("会话名称需要 1–40 个字，不能包含换行或控制字符");expect(new JSONObject((String)get.invoke(store,id)).getString("title").equals(title),"invalid rename preserves original title");setHostText("会话新名称",renamed);hostSeek("保存名称");toolTap("保存名称");chatWait("继续对话："+renamed);String original=(String)get.invoke(store,id);expect(new JSONObject(original).getString("draft").equals("ORIGINAL_UNSENT_TEST")&&new JSONObject(original).getJSONArray("turns").length()==3,"rename preserves all messages and draft");sectionShot("chat-renamed");
      hostSeek("导出对话："+renamed);toolTap("导出对话："+renamed);chatWait("导出聊天记录");sectionShot("chat-export-options");hostSeek("选择位置并导出");toolTap("选择位置并导出");chatWait("SAVE");shell("input keyevent 4");chatWait("已取消导出，会话记录未修改。");expect(((String)get.invoke(store,id)).equals(original),"cancel export leaves session byte-for-byte unchanged");
      saveChatFile(txt);String text=shellText("cat /sdcard/Download/"+txt);expect(text.contains("第一轮工具回答🙂")&&text.contains("保留的后续回答")&&text.contains(renamed),"SAF TXT contains complete Unicode conversation");expect(!text.contains("ORIGINAL_UNSENT_TEST")&&!text.contains("local-tools-config"),"export excludes draft and connection credentials");
      hostSeek("Markdown");toolTap("Markdown");saveChatFile(md);String markdown=shellText("cat /sdcard/Download/"+md);expect(markdown.startsWith("# "+renamed)&&markdown.contains("```text\n需要修改的问题\n```"),"SAF Markdown has headings and literal message blocks");expect(fixture.requests.size()==0,"rename/search/export never invoke AI");toolTap("返回");chatWait("继续对话："+renamed);toolTap("继续对话："+renamed);chatWait("AI 对话消息");seekEarlierQuestion("编辑问题：需要修改的问题");android.os.SystemClock.sleep(500);expect(description("编辑问题：需要修改的问题").performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK),"historical edit action is accessible");chatWait("编辑后的问题");setHostText("编辑后的问题","修改后的工具问题");sectionShot("chat-edit-question");toolTap("编辑后的问题");chatWait("空格");android.graphics.Rect editBounds=new android.graphics.Rect();description("编辑后的问题").getBoundsInScreen(editBounds);int imeTop=640;for(android.view.accessibility.AccessibilityWindowInfo window:getUiAutomation().getWindows())if(window.getType()==android.view.accessibility.AccessibilityWindowInfo.TYPE_INPUT_METHOD){android.graphics.Rect rect=new android.graphics.Rect();window.getBoundsInScreen(rect);imeTop=rect.top;}expect(editBounds.bottom<=imeTop&&editBounds.height()>=48,"edited question remains usable with real IME open");sectionShot("chat-edit-keyboard");shell("input keyevent 4");chatWait("编辑后的问题");fixture.hold=true;fixture.release=new java.util.concurrent.CountDownLatch(1);hostSeek("另开会话并回答");toolTap("另开会话并回答");chatWait("本地测试回答 ");expect(((String)get.invoke(store,id)).equals(original),"editing historical question preserves original including later messages and draft");expect(fixture.requests.size()==1,"one explicit edited question makes one request");JSONObject request=fixture.requests.get(0);expect(request.getJSONArray("history").length()==2&&request.getJSONArray("history").getJSONObject(1).getString("content").equals("第一轮工具回答🙂"),"edited request excludes replaced answer and all later context");
      fixture.hold=false;fixture.release.countDown();chatWait("本地测试回答 修改后的工具问题");chatIdle();sectionShot("chat-edited-branch");rows=new JSONArray((String)list.invoke(store));JSONObject branch=null;for(int i=0;i<rows.length();i++)if(rows.getJSONObject(i).getString("title").equals(renamed+" · 编辑"))branch=new JSONObject((String)get.invoke(store,rows.getJSONObject(i).getString("id")));expect(branch!=null&&branch.getJSONArray("turns").length()==2&&branch.getString("draft").isEmpty(),"new branch has prefix plus edited completed turn");expect(((String)get.invoke(store,id)).equals(original),"successful branch leaves original unchanged");toolTap("会话");setHostText("搜索 AI 会话",marker);chatWait("找到 2 个会话");sectionShot("chat-branch-list");
    } finally {
      rows=new JSONArray((String)list.invoke(store));for(int i=0;i<rows.length();i++){String key=rows.getJSONObject(i).getString("id");if(!before.contains(key))del.invoke(store,key);}((android.database.sqlite.SQLiteOpenHelper)store).close();SharedPreferences.Editor edit=prefs.edit().putBoolean("saveGenerationHistory",oldEnabled);for(Map.Entry<String,String> e:oldConfig.entrySet())if(e.getValue()==null)edit.remove(e.getKey());else edit.putString(e.getKey(),e.getValue());edit.commit();shell("rm -f /sdcard/Download/"+txt+" /sdcard/Download/"+md);
    }
  }

  private void chatDailyUi() throws Exception {
    android.accessibilityservice.AccessibilityServiceInfo info=getUiAutomation().getServiceInfo();info.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;getUiAutomation().setServiceInfo(info);
    Context context=getTargetContext();SharedPreferences prefs=context.getSharedPreferences("chatq_keyboard",0);Map<String,String> oldConfig=new HashMap<>();for(String key:new String[]{"baseUrl","apiKey","deviceId"})oldConfig.put(key,prefs.getString(key,null));boolean oldEnabled=prefs.getBoolean("saveGenerationHistory",true);
    Class<?> type=context.getClassLoader().loadClass("expo.modules.chatqkeyboard.GenerationStore");Object store=type.getConstructor(Context.class).newInstance(context);Method list=type.getMethod("listChats"),get=type.getMethod("getChat",String.class),save=type.getMethod("saveChat",String.class),del=type.getMethod("deleteChat",String.class);Set<String> before=new HashSet<>();JSONArray rows=new JSONArray((String)list.invoke(store));for(int i=0;i<rows.length();i++)before.add(rows.getJSONObject(i).getString("id"));
    String marker=Long.toString(System.currentTimeMillis()),id="daily-qa-"+marker,title="日常测试"+marker,question="字面.*[a] Case🙂";
    try(ChatHttpFixture fixture=new ChatHttpFixture()) {
      prefs.edit().putString("baseUrl","http://localhost:"+fixture.listener.getLocalPort()).putString("apiKey","local-daily-config").putString("deviceId","local-daily-fixture").putBoolean("saveGenerationHistory",true).commit();
      JSONObject seeded=ConversationChecks.chat(id).put("title",title).put("draft","");JSONArray turns=new JSONArray();for(int i=0;i<10;i++){String answer="较早回答 "+i;for(int k=0;k<5;k++)answer+="\n聊天回顾第"+i+"轮第"+k+"行，保留阅读位置。";turns.put(new JSONObject().put("id","daily-turn-"+i).put("question",i==0?question:"较早的问题"+i).put("answer",answer).put("personaName","默认助手").put("at",1700000000001L+i));}seeded.put("turns",turns);expect((Boolean)save.invoke(store,seeded.toString()),"seed isolated long daily conversation");
      shell("am start -n com.jaxon.app.chatq/.MainActivity");chatWait("已连接");toolTap("AI 对话");chatWait("AI 对话消息");toolTap("会话");chatWait("搜索 AI 会话");setHostText("搜索 AI 会话",marker);chatWait("继续对话："+title);toolTap("继续对话："+title);chatWait("成功回复计 1 次额度 · 0/2000");android.graphics.Rect quota=new android.graphics.Rect();findText("成功回复计 1 次额度 · 0/2000").getBoundsInScreen(quota);expect(quota.height()>=20&&quota.bottom<610,"quota and character count remain visible above navigation");chatWait("查找当前对话");toolTap("查找当前对话");chatWait("查找当前会话内容");setHostText("查找当前会话内容",".*[a]");chatWait("匹配 1/10 轮 · 仅本机查找");hostSeek("复制问题："+question);toolTap("复制问题："+question);android.content.ClipboardManager clipboard=(android.content.ClipboardManager)context.getSystemService(Context.CLIPBOARD_SERVICE);expect(clipboard.getPrimaryClip()!=null&&question.contentEquals(clipboard.getPrimaryClip().getItemAt(0).getText()),"explicit question copy preserves exact punctuation and emoji");clipboard.setPrimaryClip(android.content.ClipData.newPlainText("ChatQ QA",""));sectionShot("chat-find");setHostText("查找当前会话内容","NO_MATCH_%_");chatWait("没有匹配的问答");expect(fixture.requests.size()==0,"local find and copy never call AI");toolTap("关闭当前会话查找");chatWait("AI 对话消息");if("true".equals(arguments.getString("chatDailyBackUi"))){toolTap("查找当前对话");chatWait("查找当前会话内容");shell("input keyevent 4");chatWait("AI 对话消息");expect(description("查找当前会话内容")==null&&description("查找当前对话")!=null,"system back closes local find while retaining chat screen");expect(fixture.requests.size()==0,"search back makes no AI request");return;}
      fixture.hold=true;fixture.release=new java.util.concurrent.CountDownLatch(1);setHostText("AI 对话消息","保持阅读位置测试");toolTap("发送给 AI");chatWait("本地测试回答 ");shell("input swipe 160 260 160 430 500");android.os.SystemClock.sleep(300);seekEarlierQuestion("复制问题："+question);android.os.SystemClock.sleep(500);android.graphics.Rect reading=new android.graphics.Rect();description("复制问题："+question).getBoundsInScreen(reading);sectionShot("chat-reading-stream");fixture.hold=false;fixture.release.countDown();for(int i=0;i<80&&new JSONObject((String)get.invoke(store,id)).getJSONArray("turns").length()!=11;i++)android.os.SystemClock.sleep(100);android.os.SystemClock.sleep(700);android.view.accessibility.AccessibilityNodeInfo oldQuestion=description("复制问题："+question);android.graphics.Rect after=new android.graphics.Rect();if(oldQuestion!=null)oldQuestion.getBoundsInScreen(after);expect(oldQuestion!=null&&Math.abs(after.top-reading.top)<=4&&after.height()>=40,"stream completion preserves earlier reading position instead of forcing bottom");expect(new JSONObject((String)get.invoke(store,id)).getJSONArray("turns").length()==11,"completed offscreen answer still saved");chatWait("查看最新消息");sectionShot("chat-reading-complete");toolTap("查看最新消息");chatWait("本地测试回答 保持阅读位置测试");chatIdle();
      fixture.failNext=true;setHostText("AI 对话消息","失败重试问题");toolTap("发送给 AI");chatWait("重试本次问题");expect(fixture.requests.size()==2,"failed send makes one request");android.os.SystemClock.sleep(700);expect(fixture.requests.size()==2,"no automatic retry");sectionShot("chat-retry");toolTap("重试本次问题");chatWait("本地测试回答 失败重试问题");chatIdle();expect(fixture.requests.size()==3&&fixture.requests.get(2).getString("prompt").equals("失败重试问题"),"one explicit retry sends the failed question once");
      setHostText("AI 对话消息","不要发送这个草稿");fixture.failNext=true;toolTap("重新生成最后回答");chatWait("重试重新生成");String previous=new JSONObject((String)get.invoke(store,id)).getJSONArray("turns").getJSONObject(11).getString("answer");expect(previous.equals("本地测试回答 失败重试问题"),"failed regenerate keeps old complete answer");fixture.suffix=" · 重试";toolTap("重试重新生成");chatWait("本地测试回答 失败重试问题 · 重试");chatIdle();expect(fixture.requests.size()==5&&fixture.requests.get(4).getString("prompt").equals("失败重试问题"),"regenerate retry never sends the unrelated draft");expect(description("AI 对话消息").getText().toString().equals("不要发送这个草稿"),"retry preserves unsent draft");sectionShot("chat-daily");
      prefs.edit().putBoolean("saveGenerationHistory",false).commit();setHostText("AI 对话消息","未保存的临时草稿");toolTap("新对话");chatWait("离开未保存的对话？");sectionShot("chat-unsaved");clickText("留下");chatWait("AI 对话消息");expect(description("AI 对话消息").getText().toString().equals("未保存的临时草稿"),"cancel navigation retains temporary draft");toolTap("新对话");chatWait("离开未保存的对话？");clickText("放弃并继续");chatWait("想说的，慢慢聊");expect(!description("AI 对话消息").getText().toString().equals("未保存的临时草稿"),"confirmed navigation opens clean session");expect(new JSONObject((String)get.invoke(store,id)).getJSONArray("turns").length()==12,"navigation does not delete persisted conversation");expect(fixture.requests.size()==5,"local navigation never invokes AI");
    } finally {
      rows=new JSONArray((String)list.invoke(store));for(int i=0;i<rows.length();i++){String key=rows.getJSONObject(i).getString("id");if(!before.contains(key))del.invoke(store,key);}((android.database.sqlite.SQLiteOpenHelper)store).close();SharedPreferences.Editor edit=prefs.edit().putBoolean("saveGenerationHistory",oldEnabled);for(Map.Entry<String,String> e:oldConfig.entrySet())if(e.getValue()==null)edit.remove(e.getKey());else edit.putString(e.getKey(),e.getValue());edit.commit();
    }
  }


  private void featureUi() throws Exception {
    android.accessibilityservice.AccessibilityServiceInfo info=getUiAutomation().getServiceInfo();info.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;getUiAutomation().setServiceInfo(info);
    Context context=getTargetContext();SharedPreferences prefs=context.getSharedPreferences("chatq_keyboard",0);Map<String,String> old=new HashMap<>();for(String key:new String[]{"baseUrl","apiKey","deviceId"})old.put(key,prefs.getString(key,null));boolean enabled=prefs.getBoolean("saveGenerationHistory",true);
    Class<?> type=context.getClassLoader().loadClass("expo.modules.chatqkeyboard.GenerationStore");Object store=type.getConstructor(Context.class).newInstance(context);Method save=type.getMethod("saveChat",String.class),get=type.getMethod("getChat",String.class),del=type.getMethod("deleteChat",String.class);String id="feature-ui-"+System.currentTimeMillis(),title="新版功能测试";String codeText="const hello = '你好';";
    JSONObject chat=ConversationChecks.chat(id).put("title",title).put("draft","").put("updatedAt",System.currentTimeMillis());JSONObject turn=chat.getJSONArray("turns").getJSONObject(0);turn.put("answer","# 新版排版\n\n```js\n"+codeText+"\n```").put("alternatives",new JSONArray().put(new JSONObject().put("answer","保留的历史版本").put("at",1700000000000L).put("personaName","助手")));save.invoke(store,chat.toString());
    Class<?> vt=context.getClassLoader().loadClass("expo.modules.chatqkeyboard.SyncVault");Object vault=vt.getConstructor(Context.class).newInstance(context);Method vaultLoad=vt.getMethod("load",String.class),vaultSave=vt.getMethod("save",String.class,String.class);String scope=null;android.net.Uri attachmentUri=null;
    try(ChatHttpFixture fixture=new ChatHttpFixture()){
      String url="http://localhost:"+fixture.listener.getLocalPort();scope=url+"|local-ui-test";prefs.edit().putString("baseUrl",url).putString("apiKey","local-ui-test").putString("deviceId","local-ui-test").putBoolean("saveGenerationHistory",true).commit();
      shell("am start -n com.jaxon.app.chatq/.MainActivity");chatWait("已连接");toolTap("AI 对话");chatWait("AI 对话消息");toolTap("会话");chatWait("搜索 AI 会话");setHostText("搜索 AI 会话",title);chatWait("继续对话："+title);toolTap("继续对话："+title);chatWait("复制代码块 2");hostSeek("复制代码块 2");toolTap("复制代码块 2");android.content.ClipboardManager clipboard=(android.content.ClipboardManager)context.getSystemService(Context.CLIPBOARD_SERVICE);expect(codeText.contentEquals(clipboard.getPrimaryClip().getItemAt(0).getText()),"code copy excludes Markdown fences");clipboard.setPrimaryClip(android.content.ClipData.newPlainText("ChatQ QA",""));sectionShot("features-markdown");
      hostSeek("回答版本 · 2 个");toolTap("回答版本 · 2 个");chatWait("回答版本与对比");hostSeek("使用此版本");sectionShot("features-versions");toolTap("使用此版本");chatWait("保留的历史版本");expect(new JSONObject((String)get.invoke(store,id)).getJSONArray("turns").getJSONObject(0).getString("answer").equals("保留的历史版本"),"version switch persists without AI");
      toolTap("添加图片或文件附件");chatWait("添加附件");clickText("选择文件");android.os.SystemClock.sleep(700);expect("com.android.documentsui".contentEquals(getUiAutomation().getRootInActiveWindow().getPackageName()),"explicit attachment opens system SAF");shell("input keyevent 4");chatWait("AI 对话消息");expect(fixture.requests.size()==0,"picker cancellation makes no AI request");
      android.content.ContentValues document=new android.content.ContentValues();document.put("_display_name","ChatQ-feature114.txt");document.put("mime_type","text/plain");document.put("relative_path","Download/");attachmentUri=context.getContentResolver().insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI,document);try(java.io.OutputStream out=context.getContentResolver().openOutputStream(attachmentUri)){out.write("SYNTHETIC_ATTACHMENT_BODY".getBytes("UTF-8"));}toolTap("添加图片或文件附件");clickText("选择文件");android.os.SystemClock.sleep(600);if(findText("ChatQ-feature114.txt")==null){android.view.accessibility.AccessibilityNodeInfo roots=description("Show roots");if(roots!=null)roots.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK);android.os.SystemClock.sleep(200);clickText("Downloads");}android.os.SystemClock.sleep(300);for(String filter:new String[]{"Remove Large files","Remove This week"}){android.view.accessibility.AccessibilityNodeInfo chip=description(filter);if(chip!=null){chip.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK);android.os.SystemClock.sleep(200);}}chatWait("ChatQ-feature114.txt");clickText("ChatQ-feature114.txt");android.os.SystemClock.sleep(300);if("com.android.documentsui".contentEquals(getUiAutomation().getRootInActiveWindow().getPackageName())){shell("input keyevent 20");shell("input keyevent 66");}chatWait("移除附件：ChatQ-feature114.txt");sectionShot("features-attachment");expect(new JSONObject((String)get.invoke(store,id)).getJSONArray("turns").length()==1,"selecting a text file does not generate AI reply");
      toolTap("对话人设与上下文");hostSeek("查看会话分支");toolTap("查看会话分支");chatWait("会话分支");hostSeek("返回当前会话");sectionShot("features-branches");toolTap("返回当前会话");chatWait("AI 对话消息");toolTap("对话人设与上下文");hostSeek("加密会话同步");toolTap("加密会话同步");hostSeek("创建加密同步空间");toolTap("创建加密同步空间");chatWait("空间已创建。请保存同步码，然后点“立即同步会话”。");String code=(String)vaultLoad.invoke(vault,scope);expect(code!=null&&!fixture.syncBlob.contains(title)&&!fixture.syncRequests.get(0).toString().contains(code.split("\\.")[2]),"create uploads encrypted empty space and no decryption secret");
      for(int i=0;i<8;i++)shell("input swipe 160 230 160 520 150");hostSeek("立即同步会话");toolTap("立即同步会话");clickText("开始同步");for(int i=0;i<150&&fixture.revision<2;i++)android.os.SystemClock.sleep(100);chatWait("已同步 1 个会话。");expect(!fixture.syncBlob.contains(title)&&fixture.revision==2,"explicit UI sync uploads only ciphertext");String decrypted=(String)vt.getMethod("decrypt",String.class,String.class).invoke(vault,fixture.syncBlob,code);expect(decrypted.contains(title)&&decrypted.contains("保留的历史版本")&&decrypted.contains("SYNTHETIC_ATTACHMENT_BODY"),"cloud ciphertext contains full version history after decryption");hostSeek("隐藏同步码");toolTap("隐藏同步码");for(int j=0;j<8;j++)shell("input swipe 160 230 160 520 150");sectionShot("features-sync");expect(fixture.requests.size()==0,"version tree picker and sync spend no AI quota");
    }finally{if(attachmentUri!=null)context.getContentResolver().delete(attachmentUri,null,null);del.invoke(store,id);((android.database.sqlite.SQLiteOpenHelper)store).close();SharedPreferences.Editor edit=prefs.edit().putBoolean("saveGenerationHistory",enabled);for(Map.Entry<String,String> e:old.entrySet())if(e.getValue()==null)edit.remove(e.getKey());else edit.putString(e.getKey(),e.getValue());edit.commit();}
  }

  private void priceUi() throws Exception {
    android.accessibilityservice.AccessibilityServiceInfo info=getUiAutomation().getServiceInfo();info.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;getUiAutomation().setServiceInfo(info);
    SharedPreferences prefs=getTargetContext().getSharedPreferences("chatq_keyboard",0);
    Map<String,String> previous=new HashMap<>();for(String key:new String[]{"baseUrl","apiKey","deviceId"})previous.put(key,prefs.getString(key,null));
    java.net.ServerSocket listener=new java.net.ServerSocket(0);listener.setSoTimeout(10000);
    Thread fixture=new Thread(new Runnable(){public void run(){while(!listener.isClosed())try(java.net.Socket socket=listener.accept()){
      socket.setSoTimeout(3000);java.io.InputStream input=socket.getInputStream();java.io.ByteArrayOutputStream headers=new java.io.ByteArrayOutputStream();int b;
      while((b=input.read())>=0&&headers.size()<8192){headers.write(b);if(headers.toString("UTF-8").endsWith("\r\n\r\n"))break;}
      String head=headers.toString("UTF-8");int length=0;for(String line:head.split("\r\n"))if(line.toLowerCase(java.util.Locale.ROOT).startsWith("content-length:"))length=Integer.parseInt(line.substring(15).trim());for(int i=0;i<length;i++)if(input.read()<0)break;
      JSONObject data=new JSONObject();
      if(head.startsWith("GET /api/aikeyboard/account ")){
        data.put("quota",new JSONObject().put("enabled",true).put("used",0).put("limit",10).put("remaining",10).put("isPro",false).put("candidateLimit",1).put("resetsAt","2026-10-24T00:00:00Z"));
        data.put("subscription",new JSONObject().put("tier","free").put("status","active"));
        data.put("plans",new JSONArray().put(new JSONObject().put("id","bad").put("name","异常币种示例").put("priceCents",1200).put("currency","12!").put("billingPeriod","monthly")).put(new JSONObject().put("id","good").put("name","正常人民币示例").put("priceCents",990).put("currency"," cny ").put("billingPeriod","monthly")));
      }
      byte[] body=new JSONObject().put("success",true).put("data",data).toString().getBytes("UTF-8");java.io.OutputStream output=socket.getOutputStream();output.write(("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: "+body.length+"\r\n\r\n").getBytes("UTF-8"));output.write(body);output.flush();
    }catch(Exception e){if(listener.isClosed())break;}}},"chatq-account-fixture");fixture.setDaemon(true);fixture.start();
    try {
      prefs.edit().putString("baseUrl","http://localhost:"+listener.getLocalPort()).putString("apiKey","test-only").putString("deviceId","test-only").commit();
      shell("am start -n com.jaxon.app.chatq/.MainActivity");android.os.SystemClock.sleep(2000);hostTap("我的");hostSeek("额度与套餐");hostTap("额度与套餐");
      hostSeek("12.00（币种待确认） / 月");expect(findText("12.00（币种待确认） / 月")!=null,"malformed plan currency is readable without crashing");sectionShot("plan-currency-fallback");
      hostSeek("正常人民币示例");hostSeek("¥9.90 / 月");expect(findText("¥9.90 / 月")!=null,"valid normalized currency still renders its price");expect(findText("9.90（币种待确认）")==null,"valid CNY is not mislabeled");sectionShot("plan-valid-currency");
    } finally {listener.close();SharedPreferences.Editor edit=prefs.edit();for(Map.Entry<String,String> e:previous.entrySet())if(e.getValue()==null)edit.remove(e.getKey());else edit.putString(e.getKey(),e.getValue());edit.commit();}
  }

  private void centerUi() throws Exception {
    android.accessibilityservice.AccessibilityServiceInfo info=getUiAutomation().getServiceInfo();info.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;getUiAutomation().setServiceInfo(info);
    Context context=getTargetContext();SharedPreferences prefs=context.getSharedPreferences("chatq_keyboard",0);boolean oldEnabled=prefs.getBoolean("saveGenerationHistory",true);
    Class<?> type=context.getClassLoader().loadClass("expo.modules.chatqkeyboard.GenerationStore");Object store=type.getConstructor(Context.class).newInstance(context);
    Method save=type.getMethod("save",String.class,List.class,String.class,String.class),list=type.getMethod("list",String.class,boolean.class),del=type.getMethod("delete",long.class);
    Map<String,String> previous=new HashMap<>();for(String key:new String[]{"baseUrl","apiKey","deviceId"})previous.put(key,prefs.getString(key,null));
    String marker="互通检查"+System.currentTimeMillis(), candidate="共用记录候选"+System.currentTimeMillis();
    String backupFilename="ChatQ-center-QA-"+System.currentTimeMillis()+".chatqbackup";
    try {
      prefs.edit().putBoolean("saveGenerationHistory",true).commit();save.invoke(store,marker,Arrays.asList(candidate),"app","reply");
      shell("am start -n com.jaxon.app.chatq/.MainActivity");android.os.SystemClock.sleep(1200);hostTap("记录");hostSeek("搜索回复记录");setHostText("搜索回复记录",marker);android.os.SystemClock.sleep(500);hostSeek("查看记录："+marker);expect(description("查看记录："+marker)!=null,"host reads shared native generation");
      shell("ime set com.jaxon.app.chatq/expo.modules.chatqkeyboard.ChatQInputMethodService");fresh("SAFE");hostTap("AI 回复与话题库");clickText("记录");
      for(int i=0;i<30&&findText(candidate)==null;i++)android.os.SystemClock.sleep(100);
      expect(findText(candidate)!=null,"keyboard history reads host generation");textIs("SAFE","opening shared history never inserts");clickText(candidate);textIs(candidate,"explicit shared history candidate inserts once");expect(findText("action:0 count:0")!=null,"history never sends");
      // A local HTTP fixture checks IME success persistence without a paid model call.
      fresh("CENTER");hostTap("AI 回复与话题库");clickText("写回复");clickText("读取选中");
      try(InputNetworkChecks.Server server=new InputNetworkChecks.Server("{\"success\":true,\"data\":{\"candidates\":[\""+candidate+"键盘\"]}}",false)){
        prefs.edit().putString("baseUrl","http://localhost:"+server.server.getLocalPort()).putString("apiKey","test-only").putString("deviceId","test-only").commit();clickText("生成回复");
        for(int i=0;i<40&&findText(candidate+"键盘")==null;i++)android.os.SystemClock.sleep(100);
        expect(findText(candidate+"键盘")!=null,"keyboard success preview appears");
        JSONArray found=(JSONArray)list.invoke(store,candidate+"键盘",false);expect(found.length()==1&&"keyboard".equals(found.getJSONObject(0).getString("source")),"successful IME generation persists with keyboard source");
      }
      SharedPreferences.Editor edit=prefs.edit();for(Map.Entry<String,String> e:previous.entrySet())if(e.getValue()==null)edit.remove(e.getKey());else edit.putString(e.getKey(),e.getValue());edit.commit();
      shell("am start -n com.jaxon.app.chatq/.MainActivity");android.os.SystemClock.sleep(500);hostSeek("搜索回复记录");setHostText("搜索回复记录",candidate+"键盘");android.os.SystemClock.sleep(500);hostSeek("查看记录：CENTER");expect(description("查看记录：CENTER")!=null,"resuming host exposes the new keyboard generation");hostTap("查看记录：CENTER");hostSeek(candidate+"键盘");expect(findText(candidate+"键盘")!=null,"host opens the keyboard candidate without regenerating");
      hostTap("我的");hostSeek("额度与套餐");hostTap("额度与套餐");for(int i=0;i<60&&findText("每日免费额度")==null;i++)android.os.SystemClock.sleep(100);hostSeek("刷新额度");expect(description("刷新额度")!=null,"real account page loads");sectionShot("account");
      hostTap("返回键盘设置");hostSeek("备份与恢复");hostTap("备份与恢复");hostSeek("备份密码");setHostText("备份密码","test-password-123");hostSeek("确认备份密码");setHostText("确认备份密码","test-password-123");hostSeek("导出加密备份");hostTap("导出加密备份");
      for(int i=0;i<50&&findText("SAVE")==null;i++)android.os.SystemClock.sleep(100);
      expect(findText("SAVE")!=null,"export opens Android create-document picker");
      android.view.accessibility.AccessibilityNodeInfo filename=editNode(getUiAutomation().getRootInActiveWindow());expect(filename!=null,"system save filename is editable");
      Bundle name=new Bundle();name.putCharSequence(android.view.accessibility.AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,backupFilename);filename.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_SET_TEXT,name);clickText("SAVE");android.os.SystemClock.sleep(700);
      hostSeek("加密备份已保存，请妥善保管文件和密码。");expect(findText("加密备份已保存，请妥善保管文件和密码。")!=null,"SAF export resolves only after writing file");
      shell("input swipe 160 220 160 520 200");shell("input swipe 160 220 160 520 200");hostSeek("备份密码");setHostText("备份密码","wrong-password");hostSeek("选择备份并预览");hostTap("选择备份并预览");android.os.SystemClock.sleep(500);
      if(findText(backupFilename)==null){hostTap("Show roots");clickText("Downloads");}
      clickText(backupFilename);android.os.SystemClock.sleep(300);if("com.android.documentsui".contentEquals(getUiAutomation().getRootInActiveWindow().getPackageName())){shell("input keyevent 20");shell("input keyevent 66");}android.os.SystemClock.sleep(600);hostSeek("选择备份并预览");sectionShot("backup-wrong-password");
      shell("input swipe 160 220 160 520 200");shell("input swipe 160 220 160 520 200");hostSeek("备份密码");setHostText("备份密码","test-password-123");hostSeek("选择备份并预览");hostTap("选择备份并预览");android.os.SystemClock.sleep(400);clickText(backupFilename);android.os.SystemClock.sleep(300);if("com.android.documentsui".contentEquals(getUiAutomation().getRootInActiveWindow().getPackageName())){shell("input keyevent 20");shell("input keyevent 66");}android.os.SystemClock.sleep(700);hostSeek("确认备份内容");expect(findText("确认备份内容")!=null,"correct password previews backup without restoring");sectionShot("backup-preview");
      hostSeek("合并恢复到本机");hostTap("合并恢复到本机");clickText("合并恢复");android.os.SystemClock.sleep(500);expect(((JSONArray)list.invoke(store,marker,false)).length()==1,"UI restore keeps shared record deduplicated");
    } finally {
      SharedPreferences.Editor edit=prefs.edit().putBoolean("saveGenerationHistory",oldEnabled);for(Map.Entry<String,String> e:previous.entrySet())if(e.getValue()==null)edit.remove(e.getKey());else edit.putString(e.getKey(),e.getValue());edit.commit();
      JSONArray records=(JSONArray)list.invoke(store,"共用记录候选",false);for(int i=0;i<records.length();i++)del.invoke(store,records.getJSONObject(i).getLong("id"));
      records=(JSONArray)list.invoke(store,"互通检查",false);for(int i=0;i<records.length();i++)del.invoke(store,records.getJSONObject(i).getLong("id"));((android.database.sqlite.SQLiteOpenHelper)store).close();
    }
  }

  private void sectionsUi() throws Exception {
    android.accessibilityservice.AccessibilityServiceInfo info=getUiAutomation().getServiceInfo();info.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;getUiAutomation().setServiceInfo(info);
    SharedPreferences prefs=getTargetContext().getSharedPreferences("chatq_keyboard",Context.MODE_PRIVATE);
    String oldFavorites=prefs.getString("topicFavorites",null);boolean hadMigration=prefs.contains("topicFavoritesMigrated"),oldMigration=prefs.getBoolean("topicFavoritesMigrated",false);
    try {
      prefs.edit().putString("topicFavorites","[\"daily-01\"]").putBoolean("topicFavoritesMigrated",true).commit();
      shell("ime set com.jaxon.app.chatq/expo.modules.chatqkeyboard.ChatQInputMethodService");
      shell("am start -n com.jaxon.app.chatq/.MainActivity");android.os.SystemClock.sleep(1800);
      hostTap("发现");hostTap("我的收藏");hostSeek("今天的小开心");expect(findText("今天的小开心")!=null,"host reads native favorite");
      hostSeek("取消收藏：今天的小开心");hostTap("取消收藏：今天的小开心");android.os.SystemClock.sleep(250);
      expect(!prefs.getString("topicFavorites","").contains("daily-01"),"host favorite removal updates shared native storage");
      fresh("SAFE");hostTap("AI 回复与话题库");hostTap("找话题");
      android.view.accessibility.AccessibilityNodeInfo star=description("收藏：今天的小开心");expect(star!=null,"IME offers an explicit favorite action");hostTap("收藏：今天的小开心");
      expect(prefs.getString("topicFavorites","").contains("daily-01"),"IME addition persists to shared store");
      clickText("日常破冰");clickText("我的收藏");
      expect(findText("今天有没有哪件小事，让你心情突然变好了？")!=null,"IME favorite filter shows saved opener");sectionShot("keyboard-favorites");
      expect(findText("离线收藏")!=null && !findText("离线收藏").isEnabled(),"favorite filter does not send an invalid AI category");
      textIs("SAFE","opening favorites never inserts automatically");clickText("今天有没有哪件小事，让你心情突然变好了？");
      textIs("今天有没有哪件小事，让你心情突然变好了？","explicit saved opener tap replaces selection once");expect(findText("action:0 count:0")!=null,"favorite insertion never sends a chat");
      shell("am start -n com.jaxon.app.chatq/.MainActivity");android.os.SystemClock.sleep(900);
      hostSeek("今天的小开心");expect(findText("今天的小开心")!=null,"resuming host reloads IME additions");
      hostTap("我的");hostSeek("正在使用聊商键盘");expect(findText("正在使用聊商键盘")!=null,"system status reflects selected ChatQ IME");sectionShot("keyboard-status");
      hostSeek("键盘试打区");setHostText("键盘试打区","试打不发消息");hostSeek("清空试打内容");hostTap("清空试打内容");
      expect(description("键盘试打区")!=null && String.valueOf(description("键盘试打区").getText()).contains("点这里"),"trial content clears without changing saved history");
      hostSeek("使用帮助与隐私");hostTap("使用帮助与隐私");hostSeek("怎样切换九宫格、主题和常用词？");expect(findText("常见问题")!=null,"help opens with readable FAQ");sectionShot("help");
      hostSeek("复制问题反馈模板");sectionShot("feedback");hostTap("复制问题反馈模板");expect(description("已复制 ✓")!=null || findText("已复制 ✓")!=null,"safe diagnostic template can be copied");
      shell("input keyevent 4");android.os.SystemClock.sleep(300);expect(findText("聊天，从键盘开始")!=null,"help system back returns to keyboard setup");
      shell("ime set com.android.inputmethod.latin/.LatinIME");shell("am start -a android.settings.SETTINGS");android.os.SystemClock.sleep(300);shell("am start -n com.jaxon.app.chatq/.MainActivity");android.os.SystemClock.sleep(700);
      hostSeek("已启用，请切换到聊商");expect(findText("已启用，请切换到聊商")!=null,"returning from system settings refreshes keyboard status");
      hostSeek("切换到聊商键盘");hostTap("切换到聊商键盘");android.os.SystemClock.sleep(300);
      expect(findText("聊商 AI 回复")!=null,"system IME picker offers ChatQ");clickText("聊商 AI 回复");shell("input swipe 160 210 160 520 220");shell("input swipe 160 210 160 520 220");
      for(int i=0;i<40&&findText("正在使用聊商键盘")==null;i++)android.os.SystemClock.sleep(100);
      hostSeek("正在使用聊商键盘");expect(findText("正在使用聊商键盘")!=null,"dismissing system picker refreshes selected status without navigating away");
    } finally {
      SharedPreferences.Editor edit=prefs.edit();if(oldFavorites==null)edit.remove("topicFavorites");else edit.putString("topicFavorites",oldFavorites);if(hadMigration)edit.putBoolean("topicFavoritesMigrated",oldMigration);else edit.remove("topicFavoritesMigrated");edit.commit();
      shell("ime set com.jaxon.app.chatq/expo.modules.chatqkeyboard.ChatQInputMethodService");
    }
  }

  private void stabilityUi() throws Exception {
    android.accessibilityservice.AccessibilityServiceInfo info=getUiAutomation().getServiceInfo();info.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;getUiAutomation().setServiceInfo(info);
    SharedPreferences actualPrefs=getTargetContext().getSharedPreferences("chatq_keyboard",Context.MODE_PRIVATE);
    Class<?> configClass=getTargetContext().getClassLoader().loadClass("expo.modules.chatqkeyboard.TypingPreferences");Object config=configClass.getConstructor(SharedPreferences.class).newInstance(actualPrefs);Method update=configClass.getMethod("update",JSONObject.class);
    JSONObject previous=(JSONObject)configClass.getMethod("snapshot").invoke(config);
    try {
      update.invoke(config,new JSONObject().put("chinese",false).put("layout","qwerty").put("height","normal").put("numberRow",false).put("cloudWords",false).put("englishCorrection",true));
      shell("ime set com.jaxon.app.chatq/expo.modules.chatqkeyboard.ChatQInputMethodService");fresh("Q");
      if(findText("中/英")!=null)clickText("中/英");
      letters("hello");textIs("hello","initial composing text is present before restart");shell("am broadcast -a com.chatq.keyboardfixture.EDIT --ez restart true");android.os.SystemClock.sleep(500);textIs("hello","restart leaves existing text visible");letters("x");
      textIs("hellox","editor restart preserves previous composition");
      fresh("Q");letters("hell");hostTap("展开候选词");clickText("原文 hell");expect(findText("q")!=null,"raw English confirmation restores letter keys");letters("o");clickText("空格");textIs("hello ","typing continues after expanded raw candidate");
      // External text changes must not leave a candidate from the previous composition.
      shell("am broadcast -a com.chatq.keyboardfixture.EDIT --es text replacement --ei cursor 11 --ez restart true");android.os.SystemClock.sleep(400);letters("x");textIs("replacementx","external replacement is not overwritten by stale composition");
      fresh("Q");letters("helo");shell("input swipe 19 456 19 456 700");textIs("helo1","digit suffix preserves identifier spelling");
      fresh("Q");letters("helo");clickText("空格");textIs("hello ","ordinary English correction remains enabled");clickText("⌫");textIs("helo","immediate delete undoes correction");
      shell("am broadcast -a com.chatq.keyboardfixture.EDIT --ei cursor 0");android.os.SystemClock.sleep(300);letters("x");textIs("xhelo","external cursor movement ends old composition");
      fresh("Q");letters("nihao");tap(100,118);letters("test");expect(findText("test")!=null,"switching to email accepts fresh direct text");tap(280,60);clickText("空格");textIs("nihao ","switching editors does not insert into the old composing range");
      fresh("Q");String burst="abcdefghijklmnopqrstuvwxyzaa";letters(burst,15);textIs(burst,"rapid letter burst does not drop or duplicate input");
      shell("input swipe 296 560 296 560 1000");String shortened=editorText();expect(shortened.length()<burst.length()-2,"long press delete repeats");android.os.SystemClock.sleep(400);textIs(shortened,"delete repeat stops on release");
      fresh("SAFE");android.os.SystemClock.sleep(300);textIs("SAFE","delete repeat never leaks to another editor");
      clickText("设置");expect(description("返回打字")!=null,"settings has an explicit return key");hostTap("返回打字");expect(findText("q")!=null,"settings returns to letters");
      // Invalidate a live voice session without waiting two minutes; check the same expiry UI path.
      Class<?> voiceClass=getTargetContext().getClassLoader().loadClass("expo.modules.chatqkeyboard.VoiceSession");Object voice=voiceClass.getField("INSTANCE").get(null);
      android.view.inputmethod.EditorInfo editor=new android.view.inputmethod.EditorInfo();editor.packageName="com.chatq.keyboardfixture";editor.fieldId=101;editor.inputType=0x20001;
      String token=(String)voiceClass.getMethod("begin",android.view.inputmethod.EditorInfo.class).invoke(voice,editor);
      getTargetContext().startActivity(new android.content.Intent().setClassName(getTargetContext(),"expo.modules.chatqkeyboard.VoiceInputActivity").putExtra("session",token).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK));
      for(int i=0;i<20&&findText("开始录音")==null;i++)android.os.SystemClock.sleep(100);
      expect(findText("开始录音")!=null,"voice activity opens before recording");
      voiceClass.getMethod("cancel",String.class).invoke(voice,token);
      for(int i=0;i<20&&findText("返回键盘")==null;i++)android.os.SystemClock.sleep(100);
      expect(findText("返回键盘")!=null && findText("语音会话已超时，请返回键盘重新开始。")!=null,"expired voice session offers return instead of a stuck button");clickText("返回键盘");
    } finally { update.invoke(config,previous); }
  }
}
