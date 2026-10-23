package expo.modules.chatqkeyboard

import android.content.Context

/** A real offline digit/pinyin index. Prefix candidates preserve the unconsumed digits. */
internal class NineKeyEngine(context: Context) {
  private val dictionary = ChineseDictionary.get(context)
  fun decode(code: String): List<PinyinEngine.Candidate> = dictionary.nine(code)
  companion object {
    fun digits(code: String): String = buildString(code.length) { for (char in code.lowercase(java.util.Locale.ROOT)) when (char) {
      in 'a'..'c' -> append('2'); in 'd'..'f' -> append('3'); in 'g'..'i' -> append('4'); in 'j'..'l' -> append('5'); in 'm'..'o' -> append('6'); in 'p'..'s' -> append('7'); in 't'..'v' -> append('8'); in 'w'..'z' -> append('9')
    } }
  }
}
