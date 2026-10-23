package expo.modules.chatqkeyboard

import android.content.Context
import androidx.annotation.Keep
import java.io.File

@Keep
class PinyinEngine(context: Context) {
  data class Candidate(val text: String, val consumed: Int, val pinyin: String = "", val cloud: Boolean = false, val reading: String = pinyin)
  private external fun nativeOpen(dictionary: String, userDictionary: String): Boolean
  private external fun nativeDecode(spelling: String): Array<String>
  private external fun nativeClose()
  val ready: Boolean
  init {
    System.loadLibrary("chatqpinyin")
    val directory = File(context.filesDir, "pinyin").apply { mkdirs() }
    val dictionary = File(directory, "aosp-49aebad.dat")
    if (!dictionary.exists()) {
      val temporary = File(directory, "dictionary.tmp")
      context.assets.open("dict_pinyin.dat").use { input -> temporary.outputStream().use { input.copyTo(it) } }
      check(temporary.renameTo(dictionary)) { "无法准备离线拼音词库" }
    }
    ready = nativeOpen(dictionary.absolutePath, File(directory, "user.dat").absolutePath)
  }
  fun decode(spelling: String): List<Candidate> = if (!ready) emptyList() else
    nativeDecode(spelling).toList().chunked(2).map { Candidate(it[0], it[1].toInt()) }
  fun close() = nativeClose()
}
