package expo.modules.chatqkeyboard

import android.content.SharedPreferences
import org.json.JSONArray

/** Shared by the host and IME. Only authored topic IDs are stored, never chat text. */
class TopicFavorites(private val prefs: SharedPreferences, private val valid: Set<String>) {
  companion object { private val lock = GenerationStore.lock; private const val KEY = "topicFavorites" }
  private fun parse(value: String?): List<String> = try {
    val data = JSONArray(value ?: "[]")
    (0 until minOf(data.length(), 256)).mapNotNull { data.opt(it) as? String }.filter { it in valid }.distinct()
  } catch (_: Exception) { emptyList() }
  fun read(): String? = synchronized(lock) { if (prefs.contains(KEY)) JSONArray(parse(prefs.getString(KEY, null))).toString() else null }
  private fun write(ids: List<String>): String {
    val value = JSONArray(ids.filter { it in valid }.distinct()).toString()
    check(prefs.edit().putString(KEY, value).commit()) { "收藏保存失败，请稍后重试" }
    return value
  }
  fun initialize(value: String): String = synchronized(lock) {
    if (prefs.getBoolean("topicFavoritesMigrated", false)) return@synchronized read() ?: "[]"
    val result = write(parse(read()) + parse(value))
    check(prefs.edit().putBoolean("topicFavoritesMigrated", true).commit())
    result
  }
  fun replace(value: String): String = synchronized(lock) { write(parse(value)) }
  fun set(id: String, saved: Boolean): String = synchronized(lock) {
    require(id in valid) { "话题不存在" }
    val ids = parse(prefs.getString(KEY, null)).toMutableList()
    ids.remove(id); if (saved) ids.add(id)
    write(ids)
  }
}
