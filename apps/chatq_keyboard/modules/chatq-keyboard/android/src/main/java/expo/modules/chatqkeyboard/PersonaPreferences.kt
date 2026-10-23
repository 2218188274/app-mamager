package expo.modules.chatqkeyboard

import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/** Only local persona data lives here; provider credentials remain on the server. */
internal class PersonaPreferences(private val prefs: SharedPreferences) {
  private fun objectFor(key: String) = try { JSONObject(prefs.getString(key, "{}") ?: "{}") } catch (_: Exception) { JSONObject() }
  private val data get() = objectFor("personalization").takeIf { it.optInt("version") == 1 } ?: JSONObject()
  fun choices(key: String): List<Pair<String, String>> {
    val items = data.optJSONArray(key) ?: JSONArray()
    return (0 until minOf(items.length(), 100)).mapNotNull { i -> items.optJSONObject(i)?.let { item ->
      val id = item.optString("id").take(80); val name = item.optString("name").take(30)
      if (id.isNotEmpty() && name.isNotEmpty()) Pair(id, name) else null
    } }
  }
  fun selected(key: String, list: List<Pair<String, String>>): String {
    val id = objectFor("personaSelection").optString(key)
    return if (list.any { it.first == id }) id else if (key == "cardId") list.firstOrNull()?.first ?: "" else ""
  }
  fun select(key: String, id: String): Boolean {
    val selected = objectFor("personaSelection").put(key, id)
    return prefs.edit().putString("personaSelection", selected.toString()).commit()
  }
  fun appendTo(payload: JSONObject): JSONObject {
    val selected = objectFor("personaSelection")
    for ((key, listKey) in listOf("sceneId" to "scenes", "relationId" to "relations")) {
      val id = selected.optString(key)
      if (choices(listKey).any { it.first == id } && id.length <= 50) payload.put(key, id)
    }
    val cards = data.optJSONArray("cards") ?: JSONArray()
    val id = selected("cardId", choices("cards"))
    val card = (0 until minOf(cards.length(), 20)).mapNotNull { cards.optJSONObject(it) }.firstOrNull { it.optString("id") == id } ?: return payload
    val length = when (card.optString("length")) { "normal" -> "回复长短适中。"; "detailed" -> "根据消息适当展开，避免重复。"; else -> "回复简短，通常一到两句话。" }
    payload.put("customPrompt", listOf(card.optString("instructions").trim().take(300), length).filter { it.isNotBlank() }.joinToString("\n"))
    val weights = JSONObject(); val tags = card.optJSONObject("tagWeights") ?: JSONObject()
    tags.keys().asSequence().take(20).forEach { tag ->
      val value = tags.optDouble(tag, Double.NaN)
      if (tag.matches(Regex("^[\\w-]{1,50}$")) && value.isFinite() && value in 0.1..0.9) weights.put(tag, value)
    }
    if (weights.length() > 0) payload.put("personaTagWeights", weights)
    return payload
  }
}
