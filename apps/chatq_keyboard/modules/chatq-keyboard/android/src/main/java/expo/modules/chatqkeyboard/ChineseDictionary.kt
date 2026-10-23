package expo.modules.chatqkeyboard

import android.content.Context
import java.io.DataInputStream
import java.util.PriorityQueue
import kotlin.math.ln

/** Immutable shared data; bounded range maxima avoid scanning thousands of ambiguous prefixes. */
internal class ChineseDictionary private constructor(context: Context) {
  private data class Entry(val code: String, val text: String, val weight: Int, val reading: String, val digits: String, val chat: Boolean) {
    val initials = if (chat) reading.split(' ').joinToString("") { it.take(1) } else ""
    fun candidate(consumed: Int) = PinyinEngine.Candidate(text, consumed, code, false, reading)
    fun accepts(raw: String): Boolean {
      if (!raw.contains('\'')) return true
      val boundaries = mutableSetOf<Int>(); var offset = 0
      reading.split(' ').dropLast(1).forEach { offset += it.length; boundaries.add(offset) }
      var letters = 0
      return raw.all { if (it == '\'') letters in boundaries else { letters++; true } }
    }
  }
  private class Index(entries: List<Entry>, order: IntArray, key: (Entry) -> String) {
    private val sorted = order.map { entries[it] }
    private val keys = sorted.map(key)
    private var size = 1
    private val tree: IntArray
    init {
      while (size < sorted.size) size *= 2
      tree = IntArray(size * 2) { -1 }; sorted.indices.forEach { tree[size + it] = it }
      for (i in size - 1 downTo 1) tree[i] = better(tree[i * 2], tree[i * 2 + 1])
    }
    private fun better(a: Int, b: Int): Int = when { a < 0 -> b; b < 0 -> a; sorted[a].weight >= sorted[b].weight -> a; else -> b }
    private fun lower(value: String): Int {
      var lo = 0; var hi = keys.size
      while (lo < hi) { val mid = (lo + hi) ushr 1; if (keys[mid] < value) lo = mid + 1 else hi = mid }
      return lo
    }
    private fun maximum(start: Int, end: Int): Int {
      var lo = start + size; var hi = end + size; var best = -1
      while (lo < hi) { if (lo and 1 == 1) best = better(best, tree[lo++]); if (hi and 1 == 1) best = better(best, tree[--hi]); lo /= 2; hi /= 2 }
      return best
    }
    fun prefix(prefix: String, limit: Int): List<Entry> {
      data class Range(val start: Int, val end: Int, val best: Int)
      val queue = PriorityQueue<Range>(compareByDescending<Range> { sorted[it.best].weight }.thenBy { it.best })
      fun add(start: Int, end: Int) { if (start < end) queue.add(Range(start, end, maximum(start, end))) }
      add(lower(prefix), lower(prefix + '\uffff'))
      val result = ArrayList<Entry>(limit)
      while (queue.isNotEmpty() && result.size < limit) { val range = queue.remove(); result.add(sorted[range.best]); add(range.start, range.best); add(range.best + 1, range.end) }
      return result
    }
  }
  private val pinyin: Map<String, List<Entry>>
  private val digits: Map<String, List<Entry>>
  private val initials: Map<String, List<Entry>>
  private val digitIndex: Index
  private val textIndex: Index
  private val associations: Map<String, List<String>>
  private val nineCache = object : LinkedHashMap<String, List<PinyinEngine.Candidate>>(96, .75f, true) {
    override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, List<PinyinEngine.Candidate>>?) = size > 96
  }
  init {
    DataInputStream(context.assets.open("chinese-index.bin").buffered()).use { input ->
      check(input.readInt() == 0x43514431) { "无效的中文词库" }
      val count = input.readInt(); check(count in 1..100000)
      fun string(): String { val bytes = ByteArray(input.readUnsignedShort()); input.readFully(bytes); return String(bytes, Charsets.UTF_8) }
      val entries = List(count) { Entry(string(), string(), input.readInt(), string(), string(), input.readBoolean()) }
      fun order() = IntArray(count) { input.readInt().also { check(it in 0 until count) } }
      pinyin = entries.groupBy { it.code }; digits = entries.groupBy { it.digits }
      initials = entries.filter { it.chat && it.initials.length in 2..8 }.groupBy { it.initials }
      digitIndex = Index(entries, order()) { it.digits }; textIndex = Index(entries, order()) { it.text }
    }
    val pairs = LinkedHashMap<String, MutableList<String>>()
    context.assets.open("chat-associations.tsv").bufferedReader().useLines { lines -> lines.forEach { line ->
      val pair = line.split('\t'); if (!line.startsWith('#') && pair.size == 2) pairs.getOrPut(pair[0]) { mutableListOf() }.add(pair[1])
    } }
    associations = pairs
  }
  fun fullPinyin(raw: String, native: List<PinyinEngine.Candidate>): List<PinyinEngine.Candidate> {
    val code = raw.replace("'", "")
    val exact = pinyin[code].orEmpty().filter { it.accepts(raw) }
    val short = if (!raw.contains('\'')) initials[raw].orEmpty() else emptyList()
    return (exact.filter { it.chat }.map { it.candidate(raw.length) } + short.map { it.candidate(raw.length) } +
      native.filter { it.consumed == raw.length } + exact.take(48).map { it.candidate(raw.length) } + native.filter { it.consumed != raw.length })
      .distinctBy { it.text to it.consumed }.take(128)
  }
  @Synchronized fun nine(code: String): List<PinyinEngine.Candidate> {
    if (code.isEmpty() || code.length > 39 || code.any { it !in '2'..'9' }) return emptyList()
    nineCache[code]?.let { return it }
    val exact = digits[code].orEmpty().take(48).map { it.candidate(code.length) }
    val complete = digitIndex.prefix(code, 48).filter { it.digits.length - code.length in 1..3 }
      .sortedByDescending { ln(it.weight + 1.0) - (it.digits.length - code.length) * 1.5 }.take(8).map { it.candidate(code.length) }
    val combined = if (code.length >= 7) sentences(code) else emptyList()
    val result = ArrayList<PinyinEngine.Candidate>()
    result.addAll(exact); result.addAll(combined); result.addAll(complete)
    for (length in code.length - 1 downTo 1) {
      result.addAll(digits[code.take(length)].orEmpty().take(12).map { it.candidate(length) })
      if (result.size >= 128) break
    }
    return result.distinctBy { it.text to it.consumed }.take(128).also { nineCache[code] = it }
  }
  private fun sentences(code: String): List<PinyinEngine.Candidate> {
    data class Path(val text: String, val pinyin: String, val reading: String, val cost: Double, val parts: Int)
    val beam = Array(code.length + 1) { mutableListOf<Path>() }; beam[0].add(Path("", "", "", 0.0, 0))
    for (start in code.indices) {
      val paths = beam[start].sortedBy { it.cost }.distinctBy { it.text }.take(4)
      if (paths.isEmpty()) continue
      for (end in start + 2..minOf(code.length, start + 24)) {
        val matching = digits[code.substring(start, end)].orEmpty().take(3)
        if (matching.isEmpty()) continue
        for (path in paths) for (word in matching) {
          if (path.text.length + word.text.length > 16 || path.parts >= 6) continue
          beam[end].add(Path(path.text + word.text, path.pinyin + word.code, (path.reading + " " + word.reading).trim(), path.cost + 18 - ln(word.weight + 1.0), path.parts + 1))
        }
        if (beam[end].size > 24) { val best = beam[end].sortedBy { it.cost }.distinctBy { it.text }.take(6); beam[end].clear(); beam[end].addAll(best) }
      }
    }
    return beam.last().filter { it.parts > 1 }.sortedBy { it.cost }.distinctBy { it.text }.take(6)
      .map { PinyinEngine.Candidate(it.text, code.length, it.pinyin, false, it.reading) }
  }
  fun predict(context: String): List<String> {
    if (context.isEmpty()) return emptyList()
    val prefixes = (listOf(context) + (minOf(context.length - 1, 4) downTo 1).map { context.takeLast(it) }).distinct()
    val result = ArrayList<String>()
    for (prefix in prefixes) {
      result.addAll(associations[prefix].orEmpty())
      result.addAll(textIndex.prefix(prefix, 24).filter { it.text.length > prefix.length && it.text.length - prefix.length <= 8 }.map { it.text.drop(prefix.length) })
      if (result.size >= 12) break
    }
    return result.distinct().take(12)
  }
  companion object {
    @Volatile private var shared: ChineseDictionary? = null
    fun get(context: Context): ChineseDictionary = shared ?: synchronized(this) { shared ?: ChineseDictionary(context.applicationContext).also { shared = it } }
  }
}
