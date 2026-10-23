package expo.modules.chatqkeyboard

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import java.util.Locale
import java.util.TreeMap
import kotlin.math.ln

/** Offline weighted spelling edits. No typing text is sent to Android services or a network. */
internal class EnglishEngine(context: Context, private val prefs: SharedPreferences) {
  private val dictionary = TreeMap<String, Int>()
  init { context.assets.open("english-frequency.tsv").bufferedReader().useLines { lines -> lines.forEach { line -> val pair = line.split('\t'); if (pair.size == 2) dictionary[pair[0]] = pair[1].toIntOrNull() ?: 1 } } }
  private fun personal(): Set<String> = try { val array = JSONArray(prefs.getString("englishWords", "[]")); (0 until array.length()).map { array.getString(it) }.toSet() } catch (_: Exception) { emptySet() }
  fun remember(word: String) {
    val value = word.lowercase(Locale.ROOT)
    if (value.matches(Regex("^[a-z']{2,30}$"))) check(prefs.edit().putString("englishWords", JSONArray((listOf(value) + personal()).distinct().take(300)).toString()).commit())
  }
  private fun caseLike(value: String, original: String): String = when { original.all { !it.isLetter() || it.isUpperCase() } -> value.uppercase(Locale.ROOT); original.firstOrNull()?.isUpperCase() == true -> value.replaceFirstChar { it.uppercase() }; else -> value }
  private data class Match(val word: String, val cost: Int, val score: Double)
  private fun edits(original: String): List<Match> {
    val value = original.lowercase(Locale.ROOT)
    if (value.length !in 2..24 || value.any { it !in 'a'..'z' }) return emptyList()
    val found = mutableMapOf<String, Int>()
    fun add(word: String, cost: Int) { if (word != value && dictionary.containsKey(word)) found[word] = minOf(found[word] ?: Int.MAX_VALUE, cost) }
    for (i in value.indices) {
      add(value.removeRange(i, i + 1), 100)
      if (i < value.lastIndex) add(value.take(i) + value[i + 1] + value[i] + value.drop(i + 2), 65)
      for (c in 'a'..'z') add(value.take(i) + c + value.drop(i + 1), 120)
    }
    for (i in 0..value.length) for (c in 'a'..'z') add(value.take(i) + c + value.drop(i), 90)
    return found.map { (word,cost) -> Match(word,cost,cost + ln(10_000_000.0 / (dictionary[word] ?: 1).coerceAtLeast(1)).coerceAtLeast(0.0) * 7) }.sortedBy { it.score }
  }
  fun suggest(original: String): List<PinyinEngine.Candidate> {
    val value = original.lowercase(Locale.ROOT)
    val corrections = if (dictionary.containsKey(value) || value in personal()) emptyList() else edits(original).take(4).map { it.word }
    val completions = if (value.length >= 2) dictionary.tailMap(value).keys.asSequence().takeWhile { it.startsWith(value) }.filter { it != value }.take(100).sortedByDescending { dictionary[it] }.take(3).toList() else emptyList()
    return (corrections + completions).distinct().take(5).map { PinyinEngine.Candidate(caseLike(it, original), original.length) }
  }
  fun correction(original: String): String? {
    val value = original.lowercase(Locale.ROOT)
    if (original.drop(1).any { it.isUpperCase() } && !original.all { it.isUpperCase() }) return null
    if (value in personal()) return null
    // A few common omissions also occur as rare abbreviations in subtitle data.
    val common = mapOf("helo" to "hello", "teh" to "the", "adn" to "and")
    common[value]?.let { return caseLike(it, original) }
    if (dictionary.containsKey(value) || value in personal() || value.length < 3 || (value.length == 3 && value !in setOf("teh", "adn"))) return null
    val matches = edits(original); val best = matches.firstOrNull() ?: return null
    if (best.cost > 100 || best.score > 160 || (matches.size > 1 && matches[1].score - best.score < 8)) return null
    return caseLike(best.word, original)
  }
}
