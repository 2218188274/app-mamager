package expo.modules.chatqkeyboard

import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.view.inputmethod.InputMethodManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID
import expo.modules.kotlin.Promise
import org.json.JSONObject

class ChatQKeyboardModule : Module() {
  private val store by lazy { GenerationStore(requireNotNull(appContext.reactContext)) }
  private val backup by lazy { BackupFiles({ requireNotNull(appContext.currentActivity) }, { store }) }
  private val chatExports by lazy { ChatExports { requireNotNull(appContext.currentActivity) } }
  private val chatAttachments by lazy { ChatAttachments { requireNotNull(appContext.currentActivity) } }
  private val syncVault by lazy { SyncVault(requireNotNull(appContext.reactContext)) }
  private val chatStream by lazy { ChatStream(requireNotNull(appContext.reactContext).getSharedPreferences("chatq_keyboard", Context.MODE_PRIVATE)) }
  private val updater by lazy { AppUpdater(requireNotNull(appContext.reactContext)) }
  private fun favorites(): TopicFavorites {
    val context = requireNotNull(appContext.reactContext)
    return TopicFavorites(context.getSharedPreferences("chatq_keyboard", Context.MODE_PRIVATE), TopicLibrary(context).categories.flatMap { it.topics }.map { it.id }.toSet())
  }
  override fun definition() = ModuleDefinition {
    Name("ChatQKeyboard")
    AsyncFunction("shareSticker") { id: String, promise: Promise ->
      try {
        val activity = requireNotNull(appContext.currentActivity) { "请回到应用后重试" }
        val intent = StickerShare(activity).intent(id)
        activity.runOnUiThread { try { activity.startActivity(intent); promise.resolve(null) } catch (e: Exception) { promise.reject("STICKER_SHARE", "暂时无法打开分享面板", e) } }
      } catch (e: Exception) { promise.reject("STICKER_SHARE", e.message ?: "图片准备失败", e) }
    }
    OnActivityResult { _, result -> backup.result(result.requestCode, result.resultCode, result.data); chatExports.result(result.requestCode,result.resultCode,result.data); chatAttachments.result(result.requestCode,result.resultCode,result.data) }
    OnDestroy { chatStream.destroy(); backup.destroy(); chatExports.destroy(); chatAttachments.destroy(); updater.cancel(); store.close() }
    AsyncFunction("pickChatAttachment") { kind:String,promise:Promise -> chatAttachments.pick(kind,promise) }
    AsyncFunction("createSyncCode") { syncVault.create() }
    AsyncFunction("syncCredentials") { code:String -> syncVault.credentials(code) }
    AsyncFunction("saveSyncCode") { code:String,scope:String -> syncVault.save(code,scope) }
    AsyncFunction("loadSyncCode") { scope:String -> syncVault.load(scope) }
    AsyncFunction("forgetSyncCode") { syncVault.forget() }
    AsyncFunction("encryptSync") { text:String,code:String -> syncVault.encrypt(text,code) }
    AsyncFunction("decryptSync") { text:String,code:String -> syncVault.decrypt(text,code) }
    AsyncFunction("syncFingerprint") { text:String -> syncVault.digest(text) }
    AsyncFunction("mergeSyncChats") { expected:String,value:String -> store.mergeSyncChats(expected,value) }
    AsyncFunction("migrateGenerationHistory") { value: String -> store.migrate(value); Unit }
    AsyncFunction("getGenerationHistory") { id: Int -> store.get(id.toLong()) }
    AsyncFunction("listGenerationHistory") { query: String -> store.list(query).toString() }
    AsyncFunction("saveGenerationHistory") { prompt: String, replies: String, kind: String -> store.save(prompt, org.json.JSONArray(replies).let { a -> (0 until a.length()).map { a.getString(it) } }, "app", kind) }
    AsyncFunction("deleteGenerationHistory") { id: Int -> store.delete(id.toLong()) }
    AsyncFunction("clearGenerationHistory") { store.clear() }
    AsyncFunction("startChatStream") { id:String,payload:String -> chatStream.start(id,payload) }
    AsyncFunction("readChatStream") { id:String -> chatStream.snapshot(id) }
    AsyncFunction("cancelChatStream") { id:String -> chatStream.cancel(id) }
    AsyncFunction("releaseChatStream") { id:String -> chatStream.release(id) }
    AsyncFunction("searchChats") { query:String -> store.searchChats(query) }
    AsyncFunction("listChats") { store.listChats() }
    AsyncFunction("getChat") { id: String -> store.getChat(id) }
    AsyncFunction("saveChat") { value: String -> store.saveChat(value) }
    AsyncFunction("deleteChat") { id: String -> store.deleteChat(id) }
    AsyncFunction("exportChat") { text:String,format:String,promise:Promise -> chatExports.start(text,format,promise) }
    AsyncFunction("getHistoryEnabled") { store.enabled() }
    AsyncFunction("setHistoryEnabled") { value: Boolean -> store.setEnabled(value); Unit }
    AsyncFunction("exportBackup") { password: String, promise: Promise -> backup.export(password,promise) }
    AsyncFunction("inspectBackup") { password: String, promise: Promise -> backup.inspect(password,promise) }
    AsyncFunction("applyBackup") { backup.apply() }
    AsyncFunction("cancelBackup") { backup.cancel() }
    AsyncFunction("discardBackup") { backup.discard() }
    AsyncFunction("checkForUpdate") { base: String -> updater.check(base) }
    AsyncFunction("downloadUpdate") { value: String, base: String, promise: Promise ->
      Thread { try { promise.resolve(updater.download(value,base)) } catch(e:Exception) { promise.reject("UPDATE_FAILED",e.message ?: "下载失败",null) } }.start()
    }
    AsyncFunction("getUpdateProgress") { updater.progress }
    AsyncFunction("cancelUpdate") { updater.cancel() }
    AsyncFunction("installUpdate") { updater.install() }

    AsyncFunction("getConfig") {
      val context = requireNotNull(appContext.reactContext)
      val prefs = context.getSharedPreferences("chatq_keyboard", Context.MODE_PRIVATE)
      val id = prefs.getString("deviceId", null) ?: UUID.randomUUID().toString().also { prefs.edit().putString("deviceId", it).commit() }
      mapOf("baseUrl" to (prefs.getString("baseUrl", "") ?: ""), "apiKey" to (prefs.getString("apiKey", "") ?: ""), "deviceId" to id)
    }
    AsyncFunction("saveConfig") { config: Map<String, String> ->
      val context = requireNotNull(appContext.reactContext)
      context.getSharedPreferences("chatq_keyboard", Context.MODE_PRIVATE).edit()
        .putString("baseUrl", config["baseUrl"] ?: "")
        .putString("apiKey", config["apiKey"] ?: "")
        .putString("deviceId", config["deviceId"] ?: "").commit()
      Unit
    }
    AsyncFunction("openKeyboardSettings") {
      val context = requireNotNull(appContext.reactContext)
      context.startActivity(Intent(Settings.ACTION_INPUT_METHOD_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
    AsyncFunction("getKeyboardStatus") {
      val context = requireNotNull(appContext.reactContext)
      val manager = context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
      val component = android.content.ComponentName(context, ChatQInputMethodService::class.java)
      val enabled = manager.enabledInputMethodList.any { it.packageName == component.packageName && it.serviceName == component.className }
      val current = android.content.ComponentName.unflattenFromString(Settings.Secure.getString(context.contentResolver, Settings.Secure.DEFAULT_INPUT_METHOD) ?: "") == component
      mapOf("enabled" to enabled, "selected" to current)
    }
    AsyncFunction("getTopicFavorites") { favorites().read() }
    AsyncFunction("getSavedReplies") { SavedReplies(requireNotNull(appContext.reactContext).getSharedPreferences("chatq_keyboard", Context.MODE_PRIVATE)).read().toString() }
    AsyncFunction("setSavedReply") { text: String, label: String, saved: Boolean -> SavedReplies(requireNotNull(appContext.reactContext).getSharedPreferences("chatq_keyboard", Context.MODE_PRIVATE)).set(text, label, saved) }
    AsyncFunction("patchPersonaSelection") { value: String ->
      require(value.length <= 1000)
      check(PersonaPreferences(requireNotNull(appContext.reactContext).getSharedPreferences("chatq_keyboard", Context.MODE_PRIVATE)).patch(JSONObject(value))) { "选择未保存" }
      Unit
    }
    AsyncFunction("initializeTopicFavorites") { value: String -> require(value.length <= 10000); favorites().initialize(value) }
    AsyncFunction("saveTopicFavorites") { value: String -> require(value.length <= 10000); favorites().replace(value) }
    AsyncFunction("setTopicFavorite") { id: String, saved: Boolean -> favorites().set(id, saved) }
    AsyncFunction("getPersonalization") { requireNotNull(appContext.reactContext).getSharedPreferences("chatq_keyboard", Context.MODE_PRIVATE).getString("personalization", null) }
    AsyncFunction("savePersonalization") { value: String ->
      require(value.length <= 100000) { "人设数据过大" }
      check(requireNotNull(appContext.reactContext).getSharedPreferences("chatq_keyboard", Context.MODE_PRIVATE).edit().putString("personalization", value).commit())
      Unit
    }
    AsyncFunction("getPersonaSelection") { requireNotNull(appContext.reactContext).getSharedPreferences("chatq_keyboard", Context.MODE_PRIVATE).getString("personaSelection", null) }
    AsyncFunction("savePersonaSelection") { value: String ->
      require(value.length <= 1000)
      check(requireNotNull(appContext.reactContext).getSharedPreferences("chatq_keyboard", Context.MODE_PRIVATE).edit().putString("personaSelection", value).commit())
      Unit
    }
    AsyncFunction("getTypingPreferences") { TypingPreferences(requireNotNull(appContext.reactContext).getSharedPreferences("chatq_keyboard", Context.MODE_PRIVATE)).snapshot().toString() }
    AsyncFunction("saveTypingPreferences") { value: String ->
      require(value.length <= 2000)
      TypingPreferences(requireNotNull(appContext.reactContext).getSharedPreferences("chatq_keyboard", Context.MODE_PRIVATE)).update(JSONObject(value)).toString()
    }
    AsyncFunction("listUserWords") { UserLexicon(requireNotNull(appContext.reactContext).getSharedPreferences("chatq_keyboard", Context.MODE_PRIVATE)).list() }
    AsyncFunction("addUserWord") { pinyin: String, text: String -> UserLexicon(requireNotNull(appContext.reactContext).getSharedPreferences("chatq_keyboard", Context.MODE_PRIVATE)).add(pinyin, text, true); Unit }
    AsyncFunction("removeUserWord") { pinyin: String, text: String -> UserLexicon(requireNotNull(appContext.reactContext).getSharedPreferences("chatq_keyboard", Context.MODE_PRIVATE)).remove(pinyin, text); Unit }
    AsyncFunction("clearUserWords") { UserLexicon(requireNotNull(appContext.reactContext).getSharedPreferences("chatq_keyboard", Context.MODE_PRIVATE)).clear(); Unit }
    AsyncFunction("showKeyboardPicker") {
      val activity = requireNotNull(appContext.currentActivity)
      activity.runOnUiThread { (activity.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).showInputMethodPicker() }
    }
  }
}
