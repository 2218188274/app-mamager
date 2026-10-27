package expo.modules.chatqkeyboard

import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/** Only local persona data lives here; personal API secrets live separately in PersonalAiVault. */
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
  fun select(key: String, id: String): Boolean = try { patch(JSONObject().put(key, id)) } catch (_: Exception) { false }
  fun patch(patch: JSONObject): Boolean = synchronized(GenerationStore.lock) {
    val selected = objectFor("personaSelection")
    for (key in listOf("cardId", "relationId", "sceneId", "warmth", "goalId")) if (patch.has(key)) {
      val id = patch.getString(key)
      val allowed = when(key) { "cardId" -> choices("cards").map { it.first }; "relationId" -> listOf("") + choices("relations").map { it.first }; "sceneId" -> listOf("") + choices("scenes").map { it.first }; "warmth" -> warmths.map { it.first }; else -> goals.map { it.first } }
      require(id in allowed) { "选项已变化，请重新选择" }; selected.put(key, id)
      if (key == "cardId") { val recent = selected.optJSONArray("recentIds") ?: JSONArray(); selected.put("recentIds", JSONArray((listOf(id) + (0 until recent.length()).map { recent.optString(it) }).distinct().filter { it in choices("cards").map { c -> c.first } }.take(6))) }
    }
    val edit=prefs.edit().putString("personaSelection",selected.toString());ConversationProfiles.changed(prefs,selected,edit);edit.commit()
  }
  fun option(key: String): String = objectFor("personaSelection").optString(key)
  fun quick(limit: Int = 3): List<Pair<String,String>> {
    val cards = data.optJSONArray("cards") ?: JSONArray(); val available = choices("cards"); val selected = selected("cardId", available)
    val pinned = (0 until cards.length()).map { cards.getJSONObject(it) }.filter { it.optBoolean("pinned") }.map { it.optString("id") }
    val recent = objectFor("personaSelection").optJSONArray("recentIds") ?: JSONArray()
    val ids = (pinned + (0 until recent.length()).map { recent.optString(it) } + available.map { it.first }).distinct().filter { id -> available.any { it.first == id } }.take(limit).toMutableList()
    if (selected.isNotEmpty() && selected !in ids) { if (ids.size == limit) ids.removeAt(ids.lastIndex); ids.add(selected) }
    return ids.mapNotNull { id -> available.find { it.first == id } }
  }
  fun resultLabel(tone: String): String = listOf(choices("cards").find { it.first == selected("cardId", choices("cards")) }?.second ?: "自然真诚", when(tone) { "professional" -> "得体"; "funny" -> "幽默"; "emoji" -> "轻松"; else -> "自然" }, goals.find { it.first == option("goalId") && it.first.isNotEmpty() }?.second).filterNotNull().joinToString(" · ").take(80)
  fun summary(): String = listOf(choices("relations").find { it.first == option("relationId") }?.second ?: "关系不限", warmths.find { it.first == option("warmth") }?.second ?: "自然", goals.find { it.first == option("goalId") }?.second ?: "自然接话").joinToString(" · ")
  fun appendTo(payload: JSONObject): JSONObject {
    val selected = objectFor("personaSelection")
    for ((key, listKey) in listOf("sceneId" to "scenes", "relationId" to "relations")) {
      val id = selected.optString(key)
      if (choices(listKey).any { it.first == id } && id.length <= 50) payload.put(key, id)
    }
    val cards = data.optJSONArray("cards") ?: JSONArray()
    val id = selected("cardId", choices("cards"))
    val card = (0 until minOf(cards.length(), 20)).mapNotNull { cards.optJSONObject(it) }.firstOrNull { it.optString("id") == id }
    val length = if(card == null) "" else when (card.optString("length")) { "normal" -> "回复长短适中。"; "detailed" -> "根据消息适当展开，避免重复。"; else -> "回复简短，通常一到两句话。" }
    val warmth = when(option("warmth")) { "reserved" -> "表达克制，保持礼貌边界，避免过度亲昵。"; "warm" -> "表达热情有温度，但尊重边界，不预设亲密关系。"; else -> "" }
    val goal = when(option("goalId")) { "comfort" -> "先理解感受，再温柔回应，避免说教。"; "decline" -> "礼貌明确地拒绝，保持边界，不编造理由。"; "invite" -> "自然提出邀请，给对方选择余地，不施加压力。"; "continue" -> "接住当前话题，用一个容易回答的问题延续聊天。"; "thanks" -> "具体真诚地表达感谢，不夸张奉承。"; "apology" -> "真诚说明歉意，承担已有事实中的责任，不凭空承诺。"; else -> "" }
    val instructions = listOf(card?.optString("instructions")?.trim()?.take(300).orEmpty(), length, warmth, goal).filter { it.isNotBlank() }.joinToString("\n").take(500)
    if(instructions.isNotEmpty()) payload.put("customPrompt", instructions)
    val weights = JSONObject(); val tags = card?.optJSONObject("tagWeights") ?: JSONObject()
    tags.keys().asSequence().take(20).forEach { tag ->
      val value = tags.optDouble(tag, Double.NaN)
      if (tag.matches(Regex("^[\\w-]{1,50}$")) && value.isFinite() && value in 0.1..0.9) weights.put(tag, value)
    }
    if (weights.length() > 0) payload.put("personaTagWeights", weights)
    return payload
  }
  companion object {
    val warmths = listOf("" to "自然", "reserved" to "克制", "warm" to "热情")
    val goals = listOf("" to "自然接话", "comfort" to "安慰", "decline" to "拒绝", "invite" to "邀约", "continue" to "接着聊", "thanks" to "感谢", "apology" to "道歉")
  }
}
