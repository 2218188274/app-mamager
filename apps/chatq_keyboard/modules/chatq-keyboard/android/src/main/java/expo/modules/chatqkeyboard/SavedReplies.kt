package expo.modules.chatqkeyboard

import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

internal class SavedReplies(private val prefs: SharedPreferences) {
  fun read(): JSONArray = synchronized(GenerationStore.lock) { validate(JSONArray(prefs.getString(KEY, "[]"))) }
  fun set(text: String, label: String, saved: Boolean): String = synchronized(GenerationStore.lock) {
    require(text.isNotBlank() && text.length <= 1000) { "常用句需要 1–1000 字" }
    val old = read(); val rows = (0 until old.length()).map { old.getJSONObject(it) }.filter { it.getString("text") != text }.toMutableList()
    if (saved) { require(rows.size < 100) { "最多收藏 100 句，请先整理" }; rows.add(0, JSONObject().put("text", text).put("label", label.take(80)).put("savedAt", System.currentTimeMillis())) }
    val raw = JSONArray(rows).toString()
    check(prefs.edit().putString(KEY, raw).commit()) { "收藏未保存，请稍后重试" }
    raw
  }
  companion object {
    const val KEY = "savedReplies"
    fun validate(rows: JSONArray): JSONArray {
      require(rows.length() <= 100) { "常用句超过 100 条" }; val texts = mutableSetOf<String>()
      for (i in 0 until rows.length()) { val row = rows.getJSONObject(i); val text = row.getString("text"); require(text.isNotBlank() && text.length <= 1000 && texts.add(text) && row.getString("label").length <= 80 && row.getLong("savedAt") >= 0) { "常用句数据异常" } }
      return rows
    }
    fun merge(current: String, incoming: String): String {
      val rows = linkedMapOf<String, JSONObject>()
      listOf(current, incoming).forEach { raw -> val data = validate(JSONArray(raw)); for (i in 0 until data.length()) { val row = data.getJSONObject(i); rows.putIfAbsent(row.getString("text"), row) } }
      require(rows.size <= 100) { "合并后常用句超过 100 条，请先整理" }
      return JSONArray(rows.values.toList()).toString()
    }
  }
}
