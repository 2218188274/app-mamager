package expo.modules.chatqkeyboard

import android.os.SystemClock
import android.view.inputmethod.EditorInfo
import java.util.UUID

internal object VoiceSession {
  private data class Pending(val token: String, val editor: String, val expires: Long, var text: String? = null)
  private var pending: Pending? = null
  private fun editor(info: EditorInfo) = "${info.packageName}:${info.fieldId}:${info.fieldName}:${info.inputType}"
  @Synchronized fun begin(info: EditorInfo): String = UUID.randomUUID().toString().also { pending = Pending(it, editor(info), SystemClock.elapsedRealtime() + 120000) }
  @Synchronized fun valid(token: String) = pending?.let { it.token == token && it.expires > SystemClock.elapsedRealtime() } == true
  @Synchronized fun complete(token: String, text: String): Boolean {
    if (!valid(token)) return false
    pending?.text = text.take(1000); return true
  }
  @Synchronized fun cancel(token: String) { if (pending?.token == token) pending = null }
  @Synchronized fun take(info: EditorInfo?): String? {
    val item = pending ?: return null
    if (item.expires < SystemClock.elapsedRealtime()) { pending = null; return null }
    if (item.text == null) return null
    pending = null
    return if (info != null && item.editor == editor(info)) item.text else null
  }
}
