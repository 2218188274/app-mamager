package expo.modules.chatqkeyboard

import android.content.SharedPreferences
import org.json.JSONObject

internal class TypingPreferences(private val prefs: SharedPreferences) {
  private fun saved() = try { JSONObject(prefs.getString("typingPreferences", "{}") ?: "{}") } catch (_: Exception) { JSONObject() }
  fun snapshot(): JSONObject {
    val raw = saved()
    return JSONObject().put("haptic", raw.optBoolean("haptic", true)).put("sound", raw.optBoolean("sound", false))
      .put("numberRow", raw.optBoolean("numberRow", false)).put("learning", raw.optBoolean("learning", true))
      .put("chinese", raw.optBoolean("chinese", true))
      .put("cloudWords", raw.optBoolean("cloudWords", false)).put("englishCorrection", raw.optBoolean("englishCorrection", true))
      .put("predictions", raw.optBoolean("predictions", true))
      .put("layout", raw.optString("layout", "qwerty").takeIf { it in listOf("qwerty", "nine") } ?: "qwerty")
      .put("bottomSpace", raw.optString("bottomSpace", "normal").takeIf { it in listOf("low", "normal", "high") } ?: "normal")
      .put("height", raw.optString("height", "normal").takeIf { it in listOf("compact", "normal", "large") } ?: "normal")
      .put("theme", raw.optString("theme", "system").takeIf { it in listOf("system", "light", "dark") } ?: "system")
  }
  fun update(patch: JSONObject) = synchronized(lock) {
    val value = snapshot()
    for (key in listOf("haptic", "sound", "numberRow", "learning", "chinese", "cloudWords", "englishCorrection", "predictions")) if (patch.opt(key) is Boolean) value.put(key, patch.getBoolean(key))
    for ((key, options) in listOf("bottomSpace" to listOf("low", "normal", "high"), "height" to listOf("compact", "normal", "large"), "theme" to listOf("system", "light", "dark"), "layout" to listOf("qwerty", "nine"))) {
      if (patch.optString(key) in options) value.put(key, patch.getString(key))
    }
    check(prefs.edit().putString("typingPreferences", value.toString()).commit()) { "无法保存键盘设置" }
    value
  }
  companion object { private val lock = GenerationStore.lock }
}
