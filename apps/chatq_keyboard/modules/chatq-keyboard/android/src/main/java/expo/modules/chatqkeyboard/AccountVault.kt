package expo.modules.chatqkeyboard

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Account tokens stay in Keystore-encrypted storage shared only with our IME. */
internal class AccountVault(context: Context) {
  private val prefs = context.getSharedPreferences("chatq_account_v1", Context.MODE_PRIVATE)
  private val connection = context.getSharedPreferences("chatq_keyboard", Context.MODE_PRIVATE)
  private fun scope() = listOf("baseUrl", "apiKey", "deviceId").joinToString("\n") { connection.getString(it, "") ?: "" }
  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    return (store.getKey("chatq-account-v1", null) as? SecretKey) ?: KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder("chatq-account-v1", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    }.generateKey()
  }
  @Synchronized fun save(value: String) {
    require(value.length <= 12000)
    val session = JSONObject(value)
    require(session.getString("token").length in 32..8192 && session.getJSONObject("user").getString("username").isNotBlank())
    val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()); updateAAD(scope().toByteArray(Charsets.UTF_8)) }
    check(prefs.edit().putString("scope", scope()).putString("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP)).putString("session", Base64.encodeToString(cipher.doFinal(value.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)).commit()) { "登录状态未保存，请重试" }
  }
  @Synchronized fun load(): String? {
    if (prefs.getString("scope", null) != scope()) return null
    val data = prefs.getString("session", null) ?: return null
    try {
      val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(prefs.getString("iv", "")!!, Base64.NO_WRAP))); updateAAD(scope().toByteArray(Charsets.UTF_8)) }
      return cipher.doFinal(Base64.decode(data, Base64.NO_WRAP)).toString(Charsets.UTF_8)
    } catch (_: Exception) { throw IllegalStateException("登录状态无法读取，请在我的账号中重新登录") }
  }
  fun authorization(): String? = load()?.let { "Bearer " + JSONObject(it).getString("token") }
  @Synchronized fun clear() { check(prefs.edit().clear().commit()) { "退出状态未保存，请重试" } }
}
