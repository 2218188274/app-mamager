package expo.modules.chatqkeyboard

import org.json.JSONArray
import org.json.JSONObject
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.charset.CodingErrorAction
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

/** CHATQTX1 is shared with Windows. Native backups remain separate. */
internal object SharedTransfer {
  const val MAX_PLAIN=6*1024*1024
  const val MAX=MAX_PLAIN+60
  private const val ITERATIONS=600000
  private fun rows(a:JSONArray)=(0 until a.length()).map{a.getJSONObject(it)}
  private fun array(v:List<JSONObject>)=JSONArray(v)
  private fun hash(v:ByteArray)=MessageDigest.getInstance("SHA-256").digest(v).joinToString(""){"%02x".format(it.toInt() and 255)}
  fun id(v:String,source:String)=if(v.matches(Regex("cq[0-9a-f]{32}")))v else "cq"+hash("$source:$v".toByteArray(Charsets.UTF_8)).take(32)
  private fun exact(v:JSONObject,keys:String){require(v.keys().asSequence().toSet()==keys.split(' ').toSet()){ "跨端文件包含不支持的字段" }}
  private fun text(v:JSONObject,key:String,min:Int,max:Int):String { val s=v.opt(key);require(s is String&&s.length in min..max&&(min==0||s.isNotBlank())){"跨端文字长度不符合通用范围"};Charsets.UTF_8.newEncoder().onMalformedInput(CodingErrorAction.REPORT).encode(java.nio.CharBuffer.wrap(s));return s }
  private fun stamp(v:JSONObject,key:String):Long { val n=v.opt(key);require(n is Number&&n.toDouble()==n.toLong().toDouble()&&n.toLong() in 1..4102444799999L);return n.toLong() }
  fun validate(v:JSONObject):JSONObject {
    exact(v,"format version source createdAt personas favorites conversations");require(v.getString("format")=="chatq-transfer"&&v.opt("version") is Number&&v.getDouble("version")==1.0&&v.getString("source") in listOf("windows","android"));stamp(v,"createdAt")
    for((key,max) in listOf("personas" to 20,"favorites" to 100,"conversations" to 50)) {
      val a=v.getJSONArray(key);require(a.length()<=max){"跨端最多20个人设、100句收藏和50个会话"};val ids=mutableSetOf<String>();val texts=mutableSetOf<String>()
      for(row in rows(a)) {
        val identity=text(row,"id",34,34);require(identity.matches(Regex("cq[0-9a-f]{32}"))&&ids.add(identity))
        when(key) {
          "personas"->{exact(row,"id name instructions example");text(row,"name",1,20);text(row,"instructions",1,300);text(row,"example",0,120)}
          "favorites"->{exact(row,"id text savedAt");require(texts.add(text(row,"text",1,1000)));stamp(row,"savedAt")}
          else->{exact(row,"id title updatedAt messages");require(text(row,"title",1,40).none{it.isISOControl()});stamp(row,"updatedAt");val messages=row.getJSONArray("messages");require(messages.length()<=100&&messages.length()%2==0){"跨端每个AI对话最多50轮"};for(i in 0 until messages.length()){val m=messages.getJSONObject(i);exact(m,"role content");require(m.getString("role")==if(i%2==0)"user" else "assistant");text(m,"content",1,if(i%2==0)2000 else 10000)}}
        }
      }
    };require(v.toString().toByteArray(Charsets.UTF_8).size<=MAX_PLAIN){"跨端文件超过6MiB"};return v
  }
  private fun nativeChat(c:JSONObject):JSONObject {
    val messages=JSONArray();for(t in rows(c.getJSONArray("turns"))){messages.put(JSONObject().put("role","user").put("content",t.getString("question")));messages.put(JSONObject().put("role","assistant").put("content",t.getString("answer")))}
    return JSONObject().put("id",id(c.getString("id"),"android")).put("title",c.getString("title")).put("updatedAt",c.getLong("updatedAt")).put("messages",messages)
  }
  fun export(native:JSONObject):JSONObject {
    val settings=native.getJSONObject("settings");val cards=JSONObject(settings.optString("personalization","{\"cards\":[]}")).getJSONArray("cards");val personas=JSONArray()
    for(c in rows(cards))personas.put(JSONObject().put("id",id(c.getString("id"),"android")).put("name",c.getString("name")).put("instructions",c.getString("instructions")).put("example",c.optString("example","")))
    val favorites=JSONArray();for(f in rows(JSONArray(settings.optString(SavedReplies.KEY,"[]"))))favorites.put(JSONObject().put("id",id(f.getString("text"),"favorite")).put("text",f.getString("text")).put("savedAt",maxOf(1L,f.getLong("savedAt"))))
    return validate(JSONObject().put("format","chatq-transfer").put("version",1).put("source","android").put("createdAt",System.currentTimeMillis()).put("personas",personas).put("favorites",favorites).put("conversations",array(rows(native.getJSONArray("chats")).map{nativeChat(it)})))
  }
  private fun canonical(v:Any?):String=when(v){is JSONObject->v.keys().asSequence().sorted().joinToString(",","{","}"){JSONObject.quote(it)+":"+canonical(v.get(it))};is JSONArray->(0 until v.length()).joinToString(",","[","]"){canonical(v.get(it))};is String->JSONObject.quote(v);else->v.toString()}
  fun fingerprint(native:JSONObject):String {
    val n=JSONObject(native.toString());n.remove("createdAt");n.put("chats",array(rows(n.getJSONArray("chats")).sortedBy{it.getString("id")}));n.put("records",array(rows(n.getJSONArray("records")).sortedBy{it.getString("uid")}));val settings=n.getJSONObject("settings");for(key in settings.keys().asSequence().toList()){val raw=settings.getString(key);settings.put(key,if(raw.startsWith("["))JSONArray(raw) else JSONObject(raw))};return hash(canonical(n).toByteArray(Charsets.UTF_8))
  }
  data class Merge(val native:JSONObject,val preview:JSONObject,val undo:JSONObject)
  fun merge(current:JSONObject,incoming:JSONObject):Merge {
    validate(incoming);val next=JSONObject(current.toString());val settings=next.getJSONObject("settings");var added=0;var duplicate=0;var conflict=0
    val undo=JSONObject().put("personas",JSONArray()).put("favorites",JSONArray()).put("conversations",JSONArray())
    val personalization=JSONObject(settings.optString("personalization","{\"version\":1,\"cards\":[],\"scenes\":[],\"relations\":[]}"));val cards=personalization.getJSONArray("cards")
    for(p in rows(incoming.getJSONArray("personas"))) {
      fun equal(c:JSONObject)=c.getString("name")==p.getString("name")&&c.getString("instructions")==p.getString("instructions")&&c.optString("example","")==p.getString("example")
      val same=rows(cards).firstOrNull{it.getString("id")==p.getString("id")||id(it.getString("id"),"android")==p.getString("id")}
      if(same!=null){if(equal(same))duplicate++ else conflict++;continue};if(rows(cards).any{equal(it)}){duplicate++;continue}
      cards.put(JSONObject(p.toString()).put("tagWeights",JSONObject()).put("length","short").put("category","custom"));undo.getJSONArray("personas").put(p.getString("id"));added++
    };require(cards.length()<=20){"合并后人设超过20个，请先整理"};if(incoming.getJSONArray("personas").length()>0)settings.put("personalization",personalization.toString())
    val favorites=JSONArray(settings.optString(SavedReplies.KEY,"[]"));for(f in rows(incoming.getJSONArray("favorites"))){if(rows(favorites).any{it.getString("text")==f.getString("text")}){duplicate++;continue};favorites.put(JSONObject().put("text",f.getString("text")).put("label","跨端收藏").put("savedAt",f.getLong("savedAt")));undo.getJSONArray("favorites").put(id(f.getString("text"),"favorite"));added++};require(favorites.length()<=100){"合并后常用句超过100句，请先整理"};if(incoming.getJSONArray("favorites").length()>0)settings.put(SavedReplies.KEY,favorites.toString())
    val chats=next.getJSONArray("chats");for(c in rows(incoming.getJSONArray("conversations"))) {
      fun equal(n:JSONObject):Boolean { val e=nativeChat(n);return e.getString("title")==c.getString("title")&&canonical(e.getJSONArray("messages"))==canonical(c.getJSONArray("messages")) }
      val same=rows(chats).firstOrNull{it.getString("id")==c.getString("id")||id(it.getString("id"),"android")==c.getString("id")}
      if(same!=null){if(equal(same))duplicate++ else conflict++;continue};if(rows(chats).any{equal(it)}){duplicate++;continue}
      val at=c.getLong("updatedAt");val turns=JSONArray();val messages=c.getJSONArray("messages");for(i in 0 until messages.length() step 2)turns.put(JSONObject().put("id",id(c.getString("id")+":"+i,"turn")).put("question",messages.getJSONObject(i).getString("content")).put("answer",messages.getJSONObject(i+1).getString("content")).put("at",at).put("personaName","跨端对话"))
      chats.put(JSONObject().put("id",c.getString("id")).put("title",c.getString("title")).put("createdAt",at).put("updatedAt",at).put("personaId","").put("background","").put("useContext",true).put("contextStart",0).put("draft","").put("turns",turns));undo.getJSONArray("conversations").put(c.getString("id"));added++
    };require(chats.length()<=50){"合并后会话超过50个，请先整理"};undo.put("expected",fingerprint(next));undo.put("missingSettings",JSONArray(listOf("personalization",SavedReplies.KEY).filter{!current.getJSONObject("settings").has(it)}))
    return Merge(next,JSONObject().put("added",added).put("duplicate",duplicate).put("conflict",conflict).put("fingerprint",fingerprint(current)).put("source",incoming.getString("source")).put("createdAt",incoming.getLong("createdAt")),undo)
  }
  fun undo(current:JSONObject,undo:JSONObject):JSONObject {
    require(fingerprint(current)==undo.getString("expected")){"导入后资料已修改，不能直接撤销；现有内容已保留"};val next=JSONObject(current.toString());val settings=next.getJSONObject("settings")
    fun ids(key:String)=(0 until undo.getJSONArray(key).length()).map{undo.getJSONArray(key).getString(it)}.toSet()
    if(settings.has("personalization")){val p=JSONObject(settings.getString("personalization"));p.put("cards",array(rows(p.getJSONArray("cards")).filter{it.getString("id") !in ids("personas")}));settings.put("personalization",p.toString())}
    if(settings.has(SavedReplies.KEY))settings.put(SavedReplies.KEY,array(rows(JSONArray(settings.getString(SavedReplies.KEY))).filter{id(it.getString("text"),"favorite") !in ids("favorites")}).toString())
    next.put("chats",array(rows(next.getJSONArray("chats")).filter{it.getString("id") !in ids("conversations")}));val missing=undo.getJSONArray("missingSettings");for(i in 0 until missing.length())settings.remove(missing.getString(i));return next
  }
  private fun password(p:String){require(p.length in 8..128&&p.isNotBlank()){ "迁移密码需要8–128个字符" }}
  private fun key(p:String,salt:ByteArray):ByteArray {
    val spec=PBEKeySpec(p.toCharArray(),salt,ITERATIONS,256)
    return try{SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded}catch(_:java.security.NoSuchAlgorithmException){val mac=Mac.getInstance("HmacSHA256");mac.init(SecretKeySpec(p.toByteArray(Charsets.UTF_8),"HmacSHA256"));var u=mac.doFinal(salt+byteArrayOf(0,0,0,1));val out=u.copyOf();repeat(ITERATIONS-1){u=mac.doFinal(u);for(i in out.indices)out[i]=(out[i].toInt() xor u[i].toInt()).toByte()};u.fill(0);out}finally{spec.clearPassword()}
  }
  fun encrypt(data:JSONObject,p:String):ByteArray {
    password(p);validate(data);val plain=data.toString().toByteArray(Charsets.UTF_8);val header=ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN);header.put("CHATQTX1".toByteArray()).putInt(ITERATIONS);val salt=ByteArray(16).also{SecureRandom().nextBytes(it)};val iv=ByteArray(12).also{SecureRandom().nextBytes(it)};header.put(salt).put(iv).putInt(plain.size);val derived=key(p,salt)
    try{val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,SecretKeySpec(derived,"AES"),GCMParameterSpec(128,iv));cipher.updateAAD(header.array());return header.array()+cipher.doFinal(plain)}finally{plain.fill(0);derived.fill(0)}
  }
  fun decrypt(bytes:ByteArray,p:String):JSONObject {
    password(p);require(bytes.size in 60..MAX&&bytes.copyOfRange(0,8).contentEquals("CHATQTX1".toByteArray()));val head=ByteBuffer.wrap(bytes,0,44).order(ByteOrder.LITTLE_ENDIAN);require(head.getInt(8)==ITERATIONS&&head.getInt(40)==bytes.size-60);val derived=key(p,bytes.copyOfRange(12,28));var plain=ByteArray(0)
    try{val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,SecretKeySpec(derived,"AES"),GCMParameterSpec(128,bytes.copyOfRange(28,40)));cipher.updateAAD(bytes.copyOfRange(0,44));plain=cipher.doFinal(bytes.copyOfRange(44,bytes.size));val s=Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(plain)).toString();var depth=0;var quote=false;var escape=false;for(ch in s){if(quote){if(escape)escape=false else if(ch=='\\')escape=true else if(ch=='"')quote=false}else if(ch=='"')quote=true else if(ch=='{'||ch=='['){depth++;require(depth<=16)}else if(ch=='}'||ch==']'){depth--;require(depth>=0)}};require(!quote&&depth==0);return validate(JSONObject(s))}finally{plain.fill(0);derived.fill(0)}
  }
}
