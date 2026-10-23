package expo.modules.chatqkeyboard

import android.util.Base64
import org.json.JSONObject
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

internal object BackupCrypto {
  private val aad="chatq-backup-v1".toByteArray(Charsets.UTF_8)
  private fun derive(password:String,salt:ByteArray):ByteArray {
    val spec=PBEKeySpec(password.toCharArray(),salt,120000,256)
    return try { SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded }
    catch(_:java.security.NoSuchAlgorithmException) {
      // Android 7 compatibility: PBKDF2-HMAC-SHA256, one 256-bit block.
      val mac=Mac.getInstance("HmacSHA256"); mac.init(SecretKeySpec(password.toByteArray(Charsets.UTF_8),"HmacSHA256"))
      var u=mac.doFinal(salt+byteArrayOf(0,0,0,1)); val result=u.copyOf()
      repeat(119999) { u=mac.doFinal(u); for(i in result.indices) result[i]=(result[i].toInt() xor u[i].toInt()).toByte() }; result
    } finally { spec.clearPassword() }
  }
  fun encrypt(bytes:ByteArray,password:String):ByteArray {
    require(password.length in 8..128 && bytes.size<=16*1024*1024)
    val salt=ByteArray(16).also { SecureRandom().nextBytes(it) }; val iv=ByteArray(12).also { SecureRandom().nextBytes(it) }
    val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,SecretKeySpec(derive(password,salt),"AES"),GCMParameterSpec(128,iv));cipher.updateAAD(aad)
    return JSONObject().put("format","chatq-encrypted-backup").put("version",1).put("salt",encode(salt)).put("iv",encode(iv)).put("data",encode(cipher.doFinal(bytes))).toString().toByteArray(Charsets.UTF_8)
  }
  fun decrypt(bytes:ByteArray,password:String):ByteArray {
    require(bytes.size<=32*1024*1024 && password.length in 8..128)
    val e=JSONObject(bytes.toString(Charsets.UTF_8));require(e.getString("format")=="chatq-encrypted-backup" && e.getInt("version")==1)
    val salt=decode(e.getString("salt"));val iv=decode(e.getString("iv"));require(salt.size==16 && iv.size==12)
    val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,SecretKeySpec(derive(password,salt),"AES"),GCMParameterSpec(128,iv));cipher.updateAAD(aad)
    return cipher.doFinal(decode(e.getString("data"))).also { require(it.size<=16*1024*1024) }
  }
  private fun encode(value:ByteArray)=Base64.encodeToString(value,Base64.NO_WRAP)
  private fun decode(value:String)=Base64.decode(value,Base64.NO_WRAP)
}
