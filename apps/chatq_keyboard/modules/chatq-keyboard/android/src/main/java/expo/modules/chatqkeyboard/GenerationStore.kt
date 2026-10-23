package expo.modules.chatqkeyboard

import android.content.Context
import android.content.SharedPreferences
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/** One local database shared by the host and IME; cloud sync requires explicit opt-in. */
internal class GenerationStore(context: Context) : SQLiteOpenHelper(context, "chatq-generations.db", null, 2) {
  fun mergeSyncChats(expected:String,value:String) = synchronized(lock) {
    recover();check(enabled()) { "请先开启本机记录保存" }
    val before=org.json.JSONArray(expected);val rows=org.json.JSONArray(value);ConversationStore.validateBackup(rows)
    val db=writableDatabase;db.beginTransaction()
    try {
      val current=ConversationStore.export(db);val old=(0 until before.length()).associate{before.getJSONObject(it).getString("id") to before.getJSONObject(it).toString()}
      val actual=(0 until current.length()).associate{current.getJSONObject(it).getString("id") to current.getJSONObject(it).toString()}
      check(old==actual) { "本机会话在同步时发生变化，请重新同步；现有记录未覆盖" }
      val incoming=(0 until rows.length()).map{rows.getJSONObject(it).getString("id")}.toSet();require(incoming.containsAll(old.keys)) { "同步不能删除现有会话" }
      for(i in 0 until rows.length()) { val row=rows.getJSONObject(i);val id=row.getString("id");check(!old.containsKey(id)||rows.length()>=before.length());db.execSQL("INSERT OR REPLACE INTO chat_sessions(id,data,updated) VALUES(?,?,?)",arrayOf(id,row.toString(),row.getLong("updatedAt"))) }
      db.setTransactionSuccessful()
    }finally{db.endTransaction()}
  }
  private val prefs = context.getSharedPreferences("chatq_keyboard", Context.MODE_PRIVATE)
  override fun onConfigure(db: SQLiteDatabase) { db.rawQuery("PRAGMA secure_delete=ON",null).use { it.moveToFirst() } }
  override fun onCreate(db: SQLiteDatabase) {
    ConversationStore.create(db)
    db.execSQL("CREATE TABLE records(id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT UNIQUE NOT NULL, source TEXT NOT NULL, kind TEXT NOT NULL, prompt TEXT NOT NULL, replies TEXT NOT NULL, created INTEGER NOT NULL)")
    db.execSQL("CREATE INDEX records_created ON records(created DESC)")
    db.execSQL("CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)")
  }
  override fun onUpgrade(db: SQLiteDatabase, old: Int, new: Int) { if(old<2) ConversationStore.create(db) }
  private fun recover() {
    val journal = prefs.getString("restoreJournal", null) ?: return
    val data = JSONObject(journal)
    val committed = readableDatabase.rawQuery("SELECT value FROM meta WHERE key='restoreToken'", null).use { it.moveToFirst() && it.getString(0) == data.getString("token") }
    val edit = prefs.edit()
    if (!committed) { val previous = data.getJSONObject("previous"); keys.forEach { key -> if (previous.isNull(key)) edit.remove(key) else edit.putString(key, previous.getString(key)) } }
    check(edit.remove("restoreJournal").commit()) { "恢复日志处理失败，请重试" }
  }
  fun enabled(): Boolean = prefs.getBoolean("saveGenerationHistory", true)
  fun setEnabled(value: Boolean) { check(prefs.edit().putBoolean("saveGenerationHistory", value).commit()) }
  private fun validate(row: JSONObject): JSONObject {
    val uid = row.getString("uid"); require(uid.length in 1..100)
    require(row.getString("source") in listOf("app", "keyboard"))
    require(row.getString("kind") in listOf("reply", "topic", "polish"))
    require(row.getString("prompt").length <= 1000)
    val time = row.getLong("createdAt"); require(time > 0 && time < 4102444800000)
    val replies = row.getJSONArray("replies"); require(replies.length() in 1..3)
    for (i in 0 until replies.length()) require(replies.getString(i).isNotBlank() && replies.getString(i).length <= 10000)
    return row
  }
  private fun insert(db: SQLiteDatabase, row: JSONObject) {
    validate(row)
    db.execSQL("INSERT OR IGNORE INTO records(uid,source,kind,prompt,replies,created) VALUES(?,?,?,?,?,?)", arrayOf(row.getString("uid"), row.getString("source"), row.getString("kind"), row.getString("prompt"), row.getJSONArray("replies").toString(), row.getLong("createdAt")))
  }
  fun save(prompt: String, replies: List<String>, source: String, kind: String): Boolean = synchronized(lock) {
    recover()
    if (!enabled()) return@synchronized false
    insert(writableDatabase, JSONObject().put("uid", UUID.randomUUID().toString()).put("source", source).put("kind", kind).put("prompt", prompt).put("replies", JSONArray(replies)).put("createdAt", System.currentTimeMillis()))
    true
  }
  fun migrate(value: String) = synchronized(lock) {
    recover(); val db = writableDatabase
    if (db.rawQuery("SELECT value FROM meta WHERE key='legacyMigrated'", null).use { it.moveToFirst() }) return@synchronized
    val rows = JSONArray(value); db.beginTransaction()
    try { for (i in 0 until rows.length()) insert(db, rows.getJSONObject(i)); db.execSQL("INSERT INTO meta(key,value) VALUES('legacyMigrated','1')"); db.setTransactionSuccessful() } finally { db.endTransaction() }
  }
  fun list(query: String = "", all: Boolean = false): JSONArray = synchronized(lock) {
    recover()
    val result = JSONArray()
    val limit = if (all) 10001 else 100
    // Match displayed text, not JSON escapes or delimiters between candidates.
    // Apply the limit after matching so newer unrelated rows cannot hide results.
    readableDatabase.rawQuery("SELECT * FROM records ORDER BY created DESC,id DESC", null).use { cursor ->
      while (result.length() < limit && cursor.moveToNext()) {
        val prompt = cursor.getString(4)
        val replies = JSONArray(cursor.getString(5))
        if (query.isNotEmpty() && !prompt.contains(query, ignoreCase = true) &&
          (0 until replies.length()).none { replies.getString(it).contains(query, ignoreCase = true) }) continue
        result.put(JSONObject().put("id",cursor.getLong(0)).put("uid",cursor.getString(1)).put("source",cursor.getString(2)).put("kind",cursor.getString(3)).put("prompt",prompt).put("replies",replies).put("createdAt",cursor.getLong(6)))
      }
    }
    result
  }
  fun get(id:Long):String = synchronized(lock) {
    recover()
    readableDatabase.rawQuery("SELECT source,kind,prompt,replies,created FROM records WHERE id=?",arrayOf(id.toString())).use { c ->
      require(c.moveToFirst()) { "记录已被删除" }
      JSONObject().put("source",c.getString(0)).put("kind",c.getString(1)).put("prompt",c.getString(2)).put("replies",JSONArray(c.getString(3))).put("createdAt",c.getLong(4)).toString()
    }
  }
  fun delete(id: Long) = synchronized(lock) { recover(); writableDatabase.delete("records","id=?",arrayOf(id.toString())); Unit }
  fun clear() = synchronized(lock) { recover(); writableDatabase.delete("records",null,null); Unit }
  fun searchChats(query:String): String = synchronized(lock) { recover();require(query.length<=200);ConversationStore.list(readableDatabase,query.trim()).toString() }
  fun listChats(): String = synchronized(lock) { recover();ConversationStore.list(readableDatabase).toString() }
  fun getChat(id:String): String = synchronized(lock) { recover();ConversationStore.get(readableDatabase,id) }
  fun saveChat(value:String): Boolean = synchronized(lock) { recover();if(!enabled())return@synchronized false;ConversationStore.save(writableDatabase,JSONObject(value));true }
  fun deleteChat(id:String) = synchronized(lock) { recover();writableDatabase.delete("chat_sessions","id=?",arrayOf(id));Unit }
  fun export(): JSONObject = synchronized(lock) {
    recover(); val rows = list(all=true); require(rows.length() <= 10000) { "记录超过 10000 条，请先整理后再备份" }
    val settings = JSONObject()
    keys.forEach { key -> prefs.getString(key,null)?.let { settings.put(key,it) } }
    JSONObject().put("format","chatq-backup").put("version",2).put("createdAt",System.currentTimeMillis()).put("records",rows).put("settings",settings).put("chats",ConversationStore.export(readableDatabase))
  }
  fun validateBackup(value: JSONObject): JSONObject {
    require(value.getString("format") == "chatq-backup" && value.getInt("version") in 1..2) { "不支持的备份格式" }
    if(value.getInt("version")==2) ConversationStore.validateBackup(value.getJSONArray("chats"))
    val rows=value.getJSONArray("records"); require(rows.length() <= 10000)
    for (i in 0 until rows.length()) validate(rows.getJSONObject(i))
    val data=value.getJSONObject("settings")
    require(data.keys().asSequence().all { it in keys }) { "备份包含不支持的字段" }
    for (key in keys) if(data.has(key)) {
      val raw=data.getString(key); require(raw.length <= 100000)
      if (key == "topicFavorites" || key == "typingLexicon") JSONArray(raw) else JSONObject(raw)
    }
    data.optString("typingLexicon").takeIf { it.isNotEmpty() }?.let { raw -> val words=JSONArray(raw); require(words.length() <= 300); for(i in 0 until words.length()) { val w=words.getJSONObject(i); require(w.getString("pinyin").matches(Regex("[a-z]{1,39}"))); require(w.getString("text").length in 1..60 && w.getString("text").none { it.isISOControl() }) } }
    if(data.has("personalization")) {
      val persona=JSONObject(data.getString("personalization")); require(persona.getInt("version")==1)
      val cards=persona.getJSONArray("cards"); require(cards.length() in 1..20)
      for(i in 0 until cards.length()) { val c=cards.getJSONObject(i); require(c.getString("id").length in 1..80 && c.getString("name").length in 1..20 && c.getString("instructions").length<=300); require(c.getString("length") in listOf("short","normal","detailed")); val weights=c.getJSONObject("tagWeights"); require(weights.length()<=20); weights.keys().forEach { require(weights.getDouble(it) in 0.1..0.9) } }
      listOf("scenes","relations").forEach { name -> val a=persona.getJSONArray(name); require(a.length()<=100); for(i in 0 until a.length()) { val item=a.getJSONObject(i); require(item.getString("id").length<=50 && item.getString("name").length<=30) } }
    }
    return value
  }
  /** Merge stable UUIDs and favorites/words; only missing persona IDs are added. */
  fun restore(value: JSONObject): Int = synchronized(lock) {
    recover(); validateBackup(value)
    val db=writableDatabase; val token=UUID.randomUUID().toString()
    val old=JSONObject(); keys.forEach { old.put(it,prefs.getString(it,null) ?: JSONObject.NULL) }
    check(prefs.edit().putString("restoreJournal",JSONObject().put("token",token).put("previous",old).toString()).commit())
    db.beginTransaction(); var added=0
    try {
      val before=android.database.DatabaseUtils.queryNumEntries(db,"records")
      val rows=value.getJSONArray("records"); for(i in 0 until rows.length()) insert(db,rows.getJSONObject(i))
      added=(android.database.DatabaseUtils.queryNumEntries(db,"records")-before).toInt()
      val personaRemap=mutableMapOf<String,String>()
      val settings=value.getJSONObject("settings"); val edit=prefs.edit()
      keys.forEach { key -> if(settings.has(key)) {
        val incoming=settings.getString(key); val current=prefs.getString(key,null)
        val merged = when {
          current == null -> incoming
          key == "topicFavorites" -> {
            val ids=LinkedHashSet<String>(); listOf(current,incoming).forEach { raw -> val array=JSONArray(raw); for(i in 0 until array.length()) ids.add(array.getString(i)) }; JSONArray(ids.toList()).toString()
          }
          key == "typingLexicon" -> {
            val words=linkedMapOf<String,JSONObject>(); listOf(current,incoming).forEach { raw -> val a=JSONArray(raw); for(i in 0 until a.length()) { val w=a.getJSONObject(i); val id=w.getString("pinyin")+":"+w.getString("text"); if(!words.containsKey(id)) words[id]=w } }; require(words.size <= 300) { "合并后常用词超过 300 条，请先整理" }; JSONArray(words.values.toList()).toString()
          }
          key == "personalization" -> {
            val base=JSONObject(current); val add=JSONObject(incoming)
            listOf("cards","scenes","relations").forEach { name -> val a=base.optJSONArray(name) ?: JSONArray(); val ids=(0 until a.length()).map { a.getJSONObject(it).getString("id") }.toMutableSet(); val b=add.optJSONArray(name) ?: JSONArray(); for(i in 0 until b.length()) {
              val incomingCard=JSONObject(b.getJSONObject(i).toString()); val id=incomingCard.getString("id")
              if(ids.add(id)) a.put(incomingCard)
              else if(name=="cards") {
                val existing=(0 until a.length()).map { a.getJSONObject(it) }.first { it.getString("id")==id }
                if(existing.toString()!=incomingCard.toString()) {
                  val suffix=java.security.MessageDigest.getInstance("SHA-256").digest(incomingCard.toString().toByteArray()).take(6).joinToString("") { "%02x".format(it.toInt() and 255) }
                  val copyId=id.take(58)+"-restore-"+suffix
                  personaRemap[id]=copyId
                  if(ids.add(copyId)) { incomingCard.put("id",copyId).put("name",incomingCard.getString("name").take(16)+"（恢复）");a.put(incomingCard) }
                }
              }
            }; require(a.length() <= if(name=="cards") 20 else 100) { "合并后的人设或目录超过上限，请先整理" }; base.put(name,a) }; base.toString()
          }
          else -> current
        }
        edit.putString(key,merged)
      } }
      if(value.getInt("version")==2) {
        val chats=JSONArray(value.getJSONArray("chats").toString())
        for(i in 0 until chats.length()) { val chat=chats.getJSONObject(i);personaRemap[chat.getString("personaId")]?.let { chat.put("personaId",it) } }
        added+=ConversationStore.restore(db,chats)
      }
      check(edit.commit()) { "无法恢复设置" }
      db.execSQL("INSERT OR REPLACE INTO meta(key,value) VALUES('restoreToken',?)",arrayOf(token)); db.setTransactionSuccessful()
    } finally { db.endTransaction(); recover() }
    added
  }
  companion object {
    val lock=Any()
    // Credentials, device identity, usage and download state are deliberately absent.
    val keys=listOf("personalization","personaSelection","typingPreferences","typingLexicon","topicFavorites")
  }
}
