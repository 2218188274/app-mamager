package expo.modules.chatqkeyboard

import android.database.DatabaseUtils
import android.database.sqlite.SQLiteDatabase
import org.json.JSONArray
import org.json.JSONObject

/** Uses GenerationStore's lock and transaction so encrypted restore stays atomic. */
internal object ConversationStore {
  fun create(db: SQLiteDatabase) { db.execSQL("CREATE TABLE IF NOT EXISTS chat_sessions(id TEXT PRIMARY KEY, data TEXT NOT NULL, updated INTEGER NOT NULL)") }
  private fun text(value: JSONObject, key: String, min: Int, max: Int): String {
    require(value.opt(key) is String) { "对话字段格式异常" }; val s=value.getString(key); require(s.length in min..max); return s
  }
  private fun time(value: JSONObject, key: String): Long { val n=value.opt(key); require(n is Number && n.toDouble().isFinite() && n.toDouble()==n.toLong().toDouble()); return n.toLong().also { require(it in 1..4102444799999L) } }
  fun validate(value: JSONObject): JSONObject {
    val required=setOf("id","title","createdAt","updatedAt","personaId","background","useContext","contextStart","draft","turns")
    require(value.keys().asSequence().toSet().let { it.containsAll(required)&&it.all { k->k in required||k in setOf("parent","attachments") } }) { "对话包含不支持的字段" }
    require(text(value,"id",1,80).matches(Regex("[a-zA-Z0-9_-]+")))
    require(text(value,"title",1,40).none { it.isISOControl() })
    val created=time(value,"createdAt"); val updated=time(value,"updatedAt"); require(updated>=created)
    text(value,"personaId",0,80); text(value,"background",0,1000); text(value,"draft",0,2000); require(value.opt("useContext") is Boolean)
    if(value.has("parent")) { val p=value.getJSONObject("parent");require(p.keys().asSequence().toSet()==setOf("sessionId","turnId"));require(text(p,"sessionId",1,80)!=value.getString("id"));text(p,"turnId",1,80) }
    attachments(value)
    val turns=value.getJSONArray("turns"); require(turns.length()<=100)
    val start=value.opt("contextStart"); require(start is Number && start.toDouble()==start.toInt().toDouble() && start.toInt() in 0..turns.length())
    val ids=mutableSetOf<String>()
    for(i in 0 until turns.length()) {
      val turn=turns.getJSONObject(i); val fields=setOf("id","question","answer","at","personaName");require(turn.keys().asSequence().toSet().let { it.containsAll(fields)&&it.all { k->k in fields||k in setOf("alternatives","attachments") } })
      require(ids.add(text(turn,"id",1,80))); require(text(turn,"question",1,2000).isNotBlank()); require(text(turn,"answer",1,10000).isNotBlank());text(turn,"personaName",1,20); require(time(turn,"at")<=updated)
      if(turn.has("alternatives")) { val a=turn.getJSONArray("alternatives");require(a.length()<=3);for(j in 0 until a.length()) { val v=a.getJSONObject(j);require(v.keys().asSequence().toSet()==setOf("answer","at","personaName"));require(text(v,"answer",1,10000).isNotBlank());text(v,"personaName",1,20);require(time(v,"at")<=updated) } }
      attachments(turn)
    }
    require(value.toString().length<=4000000); return value
  }
  private fun attachments(value:JSONObject) {
    if(!value.has("attachments"))return
    val rows=value.getJSONArray("attachments");require(rows.length()<=2);var total=0;var chars=0;val ids=mutableSetOf<String>()
    for(i in 0 until rows.length()) { val a=rows.getJSONObject(i);require(a.keys().asSequence().toSet()==setOf("id","name","mime","content"));require(text(a,"id",1,80).matches(Regex("[a-zA-Z0-9_-]+"))&&ids.add(a.getString("id")));require(text(a,"name",1,100).none{it.isISOControl()});val mime=text(a,"mime",1,30);val data=text(a,"content",1,700000);total+=data.length
      if(mime=="text/plain")chars+=data.length else { require(mime in setOf("image/jpeg","image/png","application/pdf"));val prefix="data:$mime;base64,";require(data.startsWith(prefix)&&data.removePrefix(prefix).matches(Regex("[A-Za-z0-9+/]+={0,2}"))) }
    };require(chars<=12000&&total<=1400000)
  }
  fun list(db: SQLiteDatabase,query:String=""): JSONArray {
    val result=JSONArray()
    for(id in ids(db)) {
      val v=JSONObject(get(db,id));val turns=v.getJSONArray("turns")
      val fields=sequence { yield(v.getString("title"));yield(v.getString("background"));yield(v.getString("draft"));for(i in 0 until turns.length()) { val turn=turns.getJSONObject(i);yield(turn.getString("question"));yield(turn.getString("answer"));yield(turn.getString("personaName")) } }
      val match=if(query.isNotEmpty())fields.firstOrNull { it.contains(query,ignoreCase=true) } else null
      if(query.isNotEmpty()&&match==null)continue
      val summary=JSONObject().put("id",v.getString("id")).put("title",v.getString("title")).put("updatedAt",v.getLong("updatedAt")).put("turnCount",turns.length())
      if(match!=null) { val start=maxOf(0,match.indexOf(query,ignoreCase=true)-24);val end=minOf(match.length,start+140);summary.put("snippet",(if(start>0)"…" else "")+match.substring(start,end)+(if(end<match.length)"…" else "")) }
      result.put(summary)
    };return result
  }
  private fun ids(db:SQLiteDatabase):List<String> { val result=mutableListOf<String>();db.rawQuery("SELECT id FROM chat_sessions ORDER BY updated DESC,id DESC",null).use { c -> while(c.moveToNext())result.add(c.getString(0)) };return result }
  // A full attachment-bearing row can exceed Android's 2MB CursorWindow, including on API 24.
  // Bound each SQLite result instead of changing global CursorWindow limits or truncating records.
  fun get(db: SQLiteDatabase,id:String): String {
    val size=db.rawQuery("SELECT length(data) FROM chat_sessions WHERE id=?",arrayOf(id)).use { c -> require(c.moveToFirst()) { "会话已被删除" };c.getInt(0) };require(size<=4000000)
    val out=StringBuilder();var offset=1
    while(offset<=size) { db.rawQuery("SELECT substr(data,?,100000) FROM chat_sessions WHERE id=?",arrayOf(offset.toString(),id)).use { c -> require(c.moveToFirst()) { "会话已被删除" };out.append(c.getString(0)) };offset+=100000 }
    return out.toString()
  }
  private fun exists(db: SQLiteDatabase,id:String) = DatabaseUtils.longForQuery(db,"SELECT COUNT(*) FROM chat_sessions WHERE id=?",arrayOf(id))>0
  private fun insert(db: SQLiteDatabase,v:JSONObject) { db.execSQL("INSERT INTO chat_sessions(id,data,updated) VALUES(?,?,?)",arrayOf(v.getString("id"),v.toString(),v.getLong("updatedAt"))) }
  fun save(db:SQLiteDatabase,value:JSONObject) {
    validate(value);val id=value.getString("id")
    if(exists(db,id)) db.execSQL("UPDATE chat_sessions SET data=?,updated=? WHERE id=? AND updated<=?",arrayOf(value.toString(),value.getLong("updatedAt"),id,value.getLong("updatedAt")))
    else { require(DatabaseUtils.queryNumEntries(db,"chat_sessions")<50) { "本机已保存 50 个对话，请先删除不需要的会话" };insert(db,value) }
  }
  fun export(db:SQLiteDatabase):JSONArray {
    val size=DatabaseUtils.longForQuery(db,"SELECT COALESCE(SUM(length(data)),0) FROM chat_sessions",null);require(size<=8000000) { "AI 对话超过备份容量，请先整理后再备份" }
    val result=JSONArray();for(id in ids(db))result.put(JSONObject(get(db,id)));return result
  }
  fun validateBackup(rows:JSONArray) { require(rows.length()<=50);val ids=mutableSetOf<String>();for(i in 0 until rows.length())require(ids.add(validate(rows.getJSONObject(i)).getString("id"))) }
  fun restore(db:SQLiteDatabase,rows:JSONArray):Int {
    validateBackup(rows);var added=0
    for(i in 0 until rows.length()) {
      val v=JSONObject(rows.getJSONObject(i).toString());val id=v.getString("id")
      if(exists(db,id)) {
        if(get(db,id)==v.toString())continue
        val hash=java.security.MessageDigest.getInstance("SHA-256").digest(v.toString().toByteArray(Charsets.UTF_8)).take(6).joinToString("") { "%02x".format(it.toInt() and 255) }
        v.put("id",id.take(55)+"-restore-"+hash).put("title",v.getString("title").take(36)+"（恢复）")
        if(exists(db,v.getString("id")))continue
      }
      require(DatabaseUtils.queryNumEntries(db,"chat_sessions")<50) { "合并后对话超过 50 个，请先整理" };validate(v);insert(db,v);added++
    };return added
  }
}
