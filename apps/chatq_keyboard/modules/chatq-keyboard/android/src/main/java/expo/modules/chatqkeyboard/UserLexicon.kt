package expo.modules.chatqkeyboard

import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/** Local, bounded, user-controlled word list. Never receives surrounding chat text. */
internal class UserLexicon(private val prefs: SharedPreferences) {
  data class Word(val pinyin: String, val text: String, val count: Int, val used: Long, val manual: Boolean) { val digits = NineKeyEngine.digits(pinyin) }
  private var cachedRaw: String? = null
  private var cached = emptyList<Word>()
  private fun read(): List<Word> {
    val raw = prefs.getString("typingLexicon", "[]") ?: "[]"
    if (raw == cachedRaw) return cached
    cached = try {
      val array = JSONArray(raw)
      (0 until minOf(array.length(), 300)).mapNotNull { i -> array.optJSONObject(i)?.let {
        val code = normalize(it.optString("pinyin")); val text = it.optString("text")
        if (valid(code, text)) Word(code, text, it.optInt("count", 1).coerceIn(1, 10000), it.optLong("used"), it.optBoolean("manual")) else null
      } }
    } catch (_: Exception) { emptyList() }
    cachedRaw = raw; return cached
  }
  private fun write(words: List<Word>, durable: Boolean = true) {
    val array = JSONArray()
    val kept = words.sortedWith(compareByDescending<Word> { it.manual }.thenByDescending { it.used }).take(300)
    kept.forEach {
      array.put(JSONObject().put("pinyin", it.pinyin).put("text", it.text).put("count", it.count).put("used", it.used).put("manual", it.manual))
    }
    val raw = array.toString(); val edit = prefs.edit().putString("typingLexicon", raw)
    if (durable) check(edit.commit()) { "无法保存常用词" } else edit.apply()
    cachedRaw = raw; cached = kept
  }
  fun list(): String = synchronized(lock) {
    JSONArray().apply { read().forEach { put(JSONObject().put("pinyin", it.pinyin).put("text", it.text).put("count", it.count).put("used", it.used).put("manual", it.manual)) } }.toString()
  }
  fun add(pinyin: String, text: String, manual: Boolean) = synchronized(lock) {
    val code = normalize(pinyin); val word = text.trim()
    require(valid(code, word)) { "拼音码需为 1–39 个字母，词语需为 1–60 个字符且不能换行" }
    val words = read(); val old = words.firstOrNull { it.pinyin == code && it.text == word }
    if (old == null && manual && words.count { it.manual } >= 300) throw IllegalStateException("最多保存 300 个自定义词语")
    write(words.filterNot { it.pinyin == code && it.text == word } + Word(code, word, ((old?.count ?: 0) + 1).coerceAtMost(10000), System.currentTimeMillis(), manual || old?.manual == true), manual)
  }
  fun remove(pinyin: String, text: String) = synchronized(lock) { write(read().filterNot { it.pinyin == normalize(pinyin) && it.text == text }) }
  fun clear() = synchronized(lock) { write(emptyList()) }
  fun rank(spelling: String, base: List<PinyinEngine.Candidate>, includeLearned: Boolean): List<PinyinEngine.Candidate> {
    val code = normalize(spelling)
    val extra = read().filter { code.startsWith(it.pinyin) && (it.manual || includeLearned) }
      .sortedWith(compareByDescending<Word> { it.manual }.thenByDescending { it.count }.thenByDescending { it.used })
      .map { word ->
        var consumed = 0; var letters = 0
        while (consumed < spelling.length && letters < word.pinyin.length) { if (spelling[consumed] != '\'') letters++; consumed++ }
        while (consumed < spelling.length && spelling[consumed] == '\'') consumed++
        base.firstOrNull { it.text == word.text && it.consumed == consumed }?.copy(pinyin = word.pinyin)
          ?: PinyinEngine.Candidate(word.text, consumed, word.pinyin)
      }
    return (extra.filter { it.consumed == spelling.length } + base.filter { it.consumed == spelling.length } + extra.filter { it.consumed != spelling.length } + base.filter { it.consumed != spelling.length }).distinctBy { it.text to it.consumed }.take(128)
  }
  fun rankNine(spelling: String, base: List<PinyinEngine.Candidate>, includeLearned: Boolean): List<PinyinEngine.Candidate> {
    val extra = read().filter { spelling.startsWith(it.digits) && (it.manual || includeLearned) }
      .sortedWith(compareByDescending<Word> { it.manual }.thenByDescending { it.count }.thenByDescending { it.used })
      .map { word -> base.firstOrNull { it.text == word.text && it.consumed == word.digits.length }?.copy(pinyin = word.pinyin)
        ?: PinyinEngine.Candidate(word.text, word.digits.length, word.pinyin) }
    return (extra.filter { it.consumed == spelling.length } + base.filter { it.consumed == spelling.length } + extra.filter { it.consumed != spelling.length } + base.filter { it.consumed != spelling.length }).distinctBy { it.text to it.consumed }.take(128)
  }
  fun complete(context: String, includeLearned: Boolean): List<String> = read().filter { (it.manual || includeLearned) && it.text.startsWith(context) && it.text.length > context.length }
    .sortedWith(compareByDescending<Word> { it.manual }.thenByDescending { it.count }).map { it.text.drop(context.length) }.distinct().take(8)
  companion object {
    private val lock = GenerationStore.lock
    private fun normalize(code: String) = code.trim().lowercase(java.util.Locale.ROOT).replace("'", "")
    private fun valid(code: String, text: String) = code.matches(Regex("^[a-z]{1,39}$")) && text.isNotBlank() && text.length <= 60 && text.none { it.isISOControl() }
  }
}
