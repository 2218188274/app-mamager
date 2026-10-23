package expo.modules.chatqkeyboard

import android.content.Context
import org.json.JSONObject

internal class TopicLibrary(context: Context) {
  data class Topic(val id: String, val title: String, val opener: String, val followUp: String)
  data class Category(val id: String, val name: String, val topics: List<Topic>)
  val categories: List<Category> = try {
    val data = context.assets.open("topics.json").bufferedReader().use { JSONObject(it.readText()).getJSONArray("categories") }
    (0 until data.length()).map { i ->
      val c = data.getJSONObject(i); val items = c.getJSONArray("topics")
      Category(c.getString("id"), c.getString("name"), (0 until items.length()).map { j ->
        val t = items.getJSONObject(j); Topic(t.getString("id"), t.getString("title"), t.getString("opener"), t.getString("followUp"))
      })
    }
  } catch (_: Exception) { emptyList() }
  fun batch(category: String, page: Int): List<Topic> {
    val items = categories.firstOrNull { it.id == category }?.topics ?: return emptyList()
    return (0 until minOf(3, items.size)).map { items[((page.toLong().coerceAtLeast(0) * 3 + it) % items.size).toInt()] }
  }
}
