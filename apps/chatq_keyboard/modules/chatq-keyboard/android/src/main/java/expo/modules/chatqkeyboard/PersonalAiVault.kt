package expo.modules.chatqkeyboard

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.net.URI
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Device-only BYOK settings. Never included in account sync or exported backups. */
internal class PersonalAiVault(context: Context) {
  private val prefs = context.getSharedPreferences("chatq_personal_ai_v1", Context.MODE_PRIVATE)
  fun snapshot(): Pair<JSONObject?, String> = synchronized(lock) { Pair(load(), revision()) }
  fun revision(): String = prefs.getString("revision", "") ?: ""
  fun load(): JSONObject? = synchronized(lock) {
    val encrypted = prefs.getString("value", null) ?: return@synchronized null
    try {
      val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
        init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(prefs.getString("iv", ""), Base64.NO_WRAP)))
        updateAAD("chatq-personal-ai-v1".toByteArray())
      }
      validate(JSONObject(cipher.doFinal(Base64.decode(encrypted, Base64.NO_WRAP)).toString(Charsets.UTF_8)))
    } catch (_: Exception) { throw IllegalStateException("API 配置无法读取，请重新保存自己的 API 配置") }
  }
  fun metadata(): String = (load()?.let { JSONObject().put("baseUrl", it.getString("baseUrl")).put("model", it.getString("model")).put("stream", it.getBoolean("stream")).put("hasKey", true) } ?: JSONObject().put("baseUrl", "").put("model", "").put("stream", true).put("hasKey", false)).toString()
  fun save(value: String) = synchronized(lock) {
    require(value.length <= 12000) { "API 配置过长" }
    val input = JSONObject(value)
    if (input.optString("apiKey").isBlank()) {
      val previous = load() ?: throw IllegalArgumentException("请填写 API 密钥")
      // An existing credential must never silently move to a different host or path.
      require(input.optString("baseUrl").trim().trimEnd('/') == previous.getString("baseUrl")) { "更换 API 地址时请重新输入密钥" }
      input.put("apiKey", previous.getString("apiKey"))
    }
    val clean = validate(input)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()); updateAAD("chatq-personal-ai-v1".toByteArray()) }
    check(prefs.edit().putString("revision", java.util.UUID.randomUUID().toString()).putString("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP)).putString("value", Base64.encodeToString(cipher.doFinal(clean.toString().toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)).commit()) { "API 配置未保存，请重试" }
    metadata()
  }
  fun clear() = synchronized(lock) { check(prefs.edit().clear().putString("revision", java.util.UUID.randomUUID().toString()).commit()) { "API 配置未清除，请重试" }; Unit }
  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    return store.getKey("chatq-personal-ai-v1", null) as? SecretKey ?: KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder("chatq-personal-ai-v1", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    }.generateKey()
  }
  companion object {
    private val lock = Any()
    fun validate(input: JSONObject): JSONObject {
      val base = input.optString("baseUrl").trim().trimEnd('/')
      val url = try { URI(base) } catch (_: Exception) { throw IllegalArgumentException("API 地址格式不正确") }
      require(base.length in 8..2048 && url.host != null && url.rawUserInfo == null && url.rawQuery == null && url.rawFragment == null && (url.port == -1 || url.port in 1..65535) && (url.scheme == "https" || url.scheme == "http" && url.host in listOf("127.0.0.1", "localhost"))) { "请填写 HTTPS API 地址，不要包含账号、查询参数或片段" }
      require(!base.endsWith("/chat/completions")) { "请填写基础地址，例如 https://供应商域名/v1，不含 /chat/completions" }
      val secret = input.optString("apiKey").trim(); val model = input.optString("model").trim()
      require(secret.length in 1..8192 && secret.all { it.code in 33..126 }) { "请填写有效 API 密钥，不要包含空格或换行" }
      require(model.length in 1..200 && model.none { it.code < 33 || it.code == 127 }) { "请填写供应商提供的模型名称" }
      return JSONObject().put("baseUrl", base).put("apiKey", secret).put("model", model).put("stream", input.optBoolean("stream", true))
    }
  }
}
