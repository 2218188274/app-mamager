package expo.modules.chatqkeyboard

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Recovery key stays in Android Keystore-wrapped app storage; never sent to the server. */
internal class SyncVault(context:Context) {
  private val prefs=context.getSharedPreferences("chatq_sync_v1",Context.MODE_PRIVATE)
  private fun key():SecretKey { val store=KeyStore.getInstance("AndroidKeyStore").apply{load(null)};return (store.getKey("chatq-sync-v1",null) as? SecretKey)?:KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply{init(KeyGenParameterSpec.Builder("chatq-sync-v1",KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())}.generateKey() }
  private fun parts(code:String):List<String> = code.split('.').also{require(it.size==3&&it[0]=="CQ1"&&it[1].matches(Regex("[a-f0-9]{32}"))&&it[2].matches(Regex("[a-f0-9]{64}"))){"同步码格式不正确"}}
  private fun hex(bytes:ByteArray)=bytes.joinToString(""){"%02x".format(it.toInt() and 255)}
  fun create():String="CQ1."+hex(ByteArray(16).also{SecureRandom().nextBytes(it)})+"."+hex(ByteArray(32).also{SecureRandom().nextBytes(it)})
  fun credentials(code:String):String {val p=parts(code);return JSONObject().put("spaceId",p[1]).put("auth",digest("chatq-sync-auth-v1:"+p[2])).toString()}
  fun digest(text:String)=hex(MessageDigest.getInstance("SHA-256").digest(text.toByteArray(Charsets.UTF_8)))
  fun save(code:String,scope:String) {parts(code);val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());cipher.updateAAD(scope.toByteArray(Charsets.UTF_8));check(prefs.edit().putString("scope",scope).putString("iv",Base64.encodeToString(cipher.iv,Base64.NO_WRAP)).putString("key",Base64.encodeToString(cipher.doFinal(code.toByteArray(Charsets.UTF_8)),Base64.NO_WRAP)).commit())}
  fun load(scope:String):String? {if(prefs.getString("scope",null)!=scope)return null;val data=prefs.getString("key",null)?:return null;try{val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,Base64.decode(prefs.getString("iv","")!!,Base64.NO_WRAP)));cipher.updateAAD(scope.toByteArray(Charsets.UTF_8));return cipher.doFinal(Base64.decode(data,Base64.NO_WRAP)).toString(Charsets.UTF_8).also{parts(it)}}catch(_:Exception){throw IllegalStateException("本机同步密钥无法读取，请使用恢复同步码重新连接")}}
  fun forget(){check(prefs.edit().clear().commit())}
  fun encrypt(text:String,code:String):String { val bytes=text.toByteArray(Charsets.UTF_8);require(bytes.size<=8*1024*1024){"同步数据超过 8MB，请减少附件或整理会话"};return BackupCrypto.encrypt(bytes,parts(code)[2]).toString(Charsets.UTF_8) }
  fun decrypt(text:String,code:String):String { require(text.length<=12*1024*1024);return try{BackupCrypto.decrypt(text.toByteArray(Charsets.UTF_8),parts(code)[2]).toString(Charsets.UTF_8)}catch(_:Exception){throw IllegalArgumentException("同步数据无法解密，请核对同步码；本机数据未修改")}}
}
