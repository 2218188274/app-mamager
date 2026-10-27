package expo.modules.chatqkeyboard

import android.content.SharedPreferences
import org.json.JSONObject
import org.json.JSONArray

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
      .put("oneHand",raw.optString("oneHand","off").takeIf{it in listOf("off","left","right")}?:"off")
      .put("toolbar",toolbar(raw.optJSONArray("toolbar")))
      .put("bottomSpace", raw.optString("bottomSpace", "normal").takeIf { it in listOf("low", "normal", "high") } ?: "normal")
      .put("height", raw.optString("height", "normal").takeIf { it in listOf("compact", "normal", "large") } ?: "normal")
      .put("theme", raw.optString("theme", "light").takeIf { it in listOf("system", "light", "dark") } ?: "light")
  }
  fun update(patch: JSONObject) = synchronized(lock) {
    val value = snapshot()
    for (key in listOf("haptic", "sound", "numberRow", "learning", "chinese", "cloudWords", "englishCorrection", "predictions")) if (patch.opt(key) is Boolean) value.put(key, patch.getBoolean(key))
    for ((key, options) in listOf("oneHand" to listOf("off","left","right"), "bottomSpace" to listOf("low", "normal", "high"), "height" to listOf("compact", "normal", "large"), "theme" to listOf("system", "light", "dark"), "layout" to listOf("qwerty", "nine"))) {
      if (patch.optString(key) in options) value.put(key, patch.getString(key))
    }
    if(patch.has("toolbar")){val next=patch.getJSONArray("toolbar");require(validToolbar(next)){"请选择两个不同的工具"};value.put("toolbar",toolbar(next))}
    check(prefs.edit().putString("typingPreferences", value.toString()).commit()) { "无法保存键盘设置" }
    value
  }
  fun recent():List<String> {val raw=try{JSONArray(prefs.getString("recentKeyboardTools","[]"))}catch(_:Exception){JSONArray()};return (0 until raw.length()).mapNotNull{raw.opt(it) as? String}.filter{it in toolNames}.distinct().take(4)}
  fun recordTool(id:String)=synchronized(lock){if(id in toolNames)check(prefs.edit().putString("recentKeyboardTools",JSONArray((listOf(id)+recent()).distinct().take(4)).toString()).commit()){"最近工具暂未保存"}}
  companion object {
    private val lock = GenerationStore.lock
    val toolNames=linkedMapOf("emoji" to "表情","voice" to "语音","edit" to "编辑","saved" to "常用句","screenshot" to "截图")
    private fun validToolbar(v:JSONArray)=v.length()==2&&(0..1).all{v.opt(it) is String && v.getString(it) in toolNames}&&v.getString(0)!=v.getString(1)
    private fun toolbar(v:JSONArray?)=if(v!=null&&validToolbar(v))JSONArray(v.toString())else JSONArray().put("emoji").put("voice")
  }
}
