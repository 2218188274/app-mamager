package expo.modules.chatqkeyboard

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Explicit host text drafts only. No screenshots, credentials, IME editor text or backup export. */
internal class ReplyDraftStore(context: Context) {
  private val prefs = context.getSharedPreferences("chatq_reply_drafts_v1", Context.MODE_PRIVATE)
  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    return (store.getKey("chatq-reply-drafts-v1", null) as? SecretKey) ?: KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder("chatq-reply-drafts-v1", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    }.generateKey()
  }
  private fun validate(value: JSONObject) {
    require(value.keys().asSequence().toSet() == setOf("schema", "mode", "reply", "polish", "context", "goal", "style", "hadScreenshot")) { "草稿格式不正确" }
    require(value.opt("schema") == 1 && value.opt("mode") in listOf("reply", "polish"))
    require(value.opt("style") in listOf("friendly", "professional", "funny", "emoji") && value.opt("hadScreenshot") is Boolean)
    for ((field, limit) in listOf("reply" to 1000, "polish" to 1000, "context" to 200, "goal" to 100)) require(value.opt(field) is String && value.getString(field).length <= limit)
  }
  fun load(): String = synchronized(lock) {
    val result = JSONObject().put("enabled", prefs.getBoolean("enabled", true)).put("value", JSONObject.NULL).put("expired", false)
    if (!prefs.getBoolean("enabled", true)) return@synchronized result.toString()
    val data = prefs.getString("value", null) ?: return@synchronized result.toString()
    if (System.currentTimeMillis() - prefs.getLong("updatedAt", 0) > 7L * 24 * 60 * 60 * 1000) { clear(); return@synchronized result.put("expired", true).toString() }
    try {
      val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(prefs.getString("iv", ""), Base64.NO_WRAP))) }
      val value = JSONObject(cipher.doFinal(Base64.decode(data, Base64.NO_WRAP)).toString(Charsets.UTF_8)); validate(value)
      result.put("value", value).toString()
    } catch (_: Exception) { throw IllegalStateException("草稿无法读取，未覆盖原数据；可清空保存的草稿后重试") }
  }
  fun save(raw: String) = synchronized(lock) {
    require(raw.length <= 10000); validate(JSONObject(raw))
    if (!prefs.getBoolean("enabled", true)) return@synchronized
    val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
    check(prefs.edit().putString("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP)).putString("value", Base64.encodeToString(cipher.doFinal(raw.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)).putLong("updatedAt", System.currentTimeMillis()).commit()) { "草稿未保存，请重试" }
  }
  fun clear() = synchronized(lock) { check(prefs.edit().remove("value").remove("iv").remove("updatedAt").commit()) { "草稿清空失败，请重试" } }
  fun setEnabled(enabled: Boolean) = synchronized(lock) {
    val edit = prefs.edit().putBoolean("enabled", enabled)
    if (!enabled) edit.remove("value").remove("iv").remove("updatedAt")
    check(edit.commit()) { "草稿设置未保存，请重试" }
  }
  companion object { private val lock = Any() }
}
