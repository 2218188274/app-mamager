package expo.modules.chatqkeyboard

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import org.json.JSONArray
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
  private fun state(): JSONObject {
    val encrypted = prefs.getString("value", null) ?: run { check(!prefs.contains("profilesValue")){"API 配置无法读取，请清除后重新配置"};return JSONObject().put("activeId", "").put("profiles", JSONArray()) }
    try {
      fun decrypt(value:String,iv:String):JSONObject {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
          init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,Base64.decode(iv,Base64.NO_WRAP)));updateAAD("chatq-personal-ai-v1".toByteArray())
        }
        return JSONObject(cipher.doFinal(Base64.decode(value,Base64.NO_WRAP)).toString(Charsets.UTF_8))
      }
      val legacy=decrypt(encrypted,prefs.getString("iv","")?:"")
      val decoded=prefs.getString("profilesValue",null)?.let{decrypt(it,prefs.getString("profilesIv","")?:"")}?:legacy
      if(!decoded.has("profiles")) return JSONObject().put("activeId","default").put("profiles",JSONArray().put(validate(decoded).put("id","default").put("name","默认配置")))
      val rows=decoded.getJSONArray("profiles");require(rows.length() in 1..8);val clean=JSONArray();val ids=mutableSetOf<String>()
      for(i in 0 until rows.length()){val row=rows.getJSONObject(i);val id=row.getString("id");require(id.matches(Regex("[a-zA-Z0-9_-]{1,80}"))&&ids.add(id));val name=row.getString("name");require(name.isNotBlank()&&name.length<=30&&name.none{it.isISOControl()});clean.put(validate(row).put("id",id).put("name",name))}
      require(decoded.getString("activeId") in ids)
      // Older APKs can still read/write the active legacy record. Preserve other profiles on return.
      if(!legacy.has("profiles")) {
        val active=clean.getJSONObject((0 until clean.length()).first{clean.getJSONObject(it).getString("id")==decoded.getString("activeId")})
        val legacyConfig=validate(legacy)
        if(prefs.getString("profilesRevision","")!=revision())for(field in listOf("baseUrl","apiKey","model","stream"))active.put(field,legacyConfig.get(field))
        else require(validate(active).toString()==legacyConfig.toString())
      }
      return JSONObject().put("activeId",decoded.getString("activeId")).put("profiles",clean)
    } catch (_: Exception) { throw IllegalStateException("API 配置无法读取，请重新保存自己的 API 配置") }
  }
  private fun row(state:JSONObject,id:String):JSONObject? { val rows=state.getJSONArray("profiles");for(i in 0 until rows.length())if(rows.getJSONObject(i).getString("id")==id)return rows.getJSONObject(i);return null }
  fun load():JSONObject?=synchronized(lock){val s=state();row(s,s.getString("activeId"))?.let{validate(it)}}
  fun metadata():String=synchronized(lock){
    val s=state();val active=row(s,s.getString("activeId"));val list=JSONArray();val rows=s.getJSONArray("profiles")
    for(i in 0 until rows.length()){val p=rows.getJSONObject(i);list.put(JSONObject().put("id",p.getString("id")).put("name",p.getString("name")).put("baseUrl",p.getString("baseUrl")).put("model",p.getString("model")))}
    JSONObject().put("baseUrl",active?.getString("baseUrl")?:"").put("model",active?.getString("model")?:"").put("stream",active?.getBoolean("stream")?:true).put("hasKey",active!=null).put("profileId",s.getString("activeId")).put("profileName",active?.getString("name")?:"").put("profiles",list).toString()
  }
  /** Empty keys may only reuse the explicitly selected profile on its exact endpoint. */
  private fun resolve(input:JSONObject,s:JSONObject):JSONObject {
    val id=if(input.has("profileId"))input.getString("profileId") else s.getString("activeId")
    val previous=row(s,id)
    if(input.optString("apiKey").isBlank()){
      require(previous!=null){"请填写此配置的 API 密钥"}
      require(input.optString("baseUrl").trim().trimEnd('/')==previous.getString("baseUrl")){"更换 API 地址时请重新输入密钥"}
      input.put("apiKey",previous.getString("apiKey"))
    }
    return validate(input)
  }
  fun resolveForModels(input:JSONObject):JSONObject=synchronized(lock){require(input.toString().length<=12000);resolve(JSONObject(input.toString()).put("model","model-list-only"),state())}
  private fun persist(clean:JSONObject) {
    fun encrypt(value:JSONObject):Pair<String,String>{val cipher=Cipher.getInstance("AES/GCM/NoPadding").apply{init(Cipher.ENCRYPT_MODE,key());updateAAD("chatq-personal-ai-v1".toByteArray())};return Pair(Base64.encodeToString(cipher.iv,Base64.NO_WRAP),Base64.encodeToString(cipher.doFinal(value.toString().toByteArray(Charsets.UTF_8)),Base64.NO_WRAP))}
    val legacy=encrypt(validate(requireNotNull(row(clean,clean.getString("activeId")))));val profiles=encrypt(clean);val revision=java.util.UUID.randomUUID().toString()
    check(prefs.edit().putString("revision",revision).putString("profilesRevision",revision).putString("iv",legacy.first).putString("value",legacy.second).putString("profilesIv",profiles.first).putString("profilesValue",profiles.second).commit()){ "API 配置未保存，请重试" }
  }
  fun save(value: String) = synchronized(lock) {
    require(value.length <= 12000) { "API 配置过长" }
    val input = JSONObject(value)
    val s=state();val requested=if(input.has("profileId"))input.getString("profileId") else s.getString("activeId");val previous=row(s,requested)
    require(requested.isEmpty()||previous!=null){"配置已变化，请重新打开"}
    val clean=resolve(input,s);val name=input.optString("profileName",previous?.getString("name")?:"默认配置").trim()
    require(name.isNotBlank()&&name.length<=30&&name.none{it.isISOControl()}){"配置名称需为1–30字"}
    val rows=s.getJSONArray("profiles");require(previous!=null||rows.length()<8){"最多保存8套配置，请先删除不再使用的配置"}
    val id=previous?.getString("id")?:java.util.UUID.randomUUID().toString();clean.put("id",id).put("name",name)
    val updated=JSONArray();for(i in 0 until rows.length())updated.put(if(rows.getJSONObject(i).getString("id")==id)clean else rows.getJSONObject(i));if(previous==null)updated.put(clean)
    persist(JSONObject().put("activeId",id).put("profiles",updated))
    metadata()
  }
  fun select(id:String):String=synchronized(lock){val s=state();require(row(s,id)!=null){"配置不存在，请重新读取"};persist(s.put("activeId",id));metadata()}
  fun remove(id:String):String=synchronized(lock){val s=state();require(row(s,id)!=null){"配置不存在，请重新读取"};val rows=s.getJSONArray("profiles");val next=JSONArray();for(i in 0 until rows.length())if(rows.getJSONObject(i).getString("id")!=id)next.put(rows.getJSONObject(i));if(next.length()==0)clear() else persist(JSONObject().put("profiles",next).put("activeId",if(s.getString("activeId")==id)next.getJSONObject(0).getString("id") else s.getString("activeId")));metadata()}
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
