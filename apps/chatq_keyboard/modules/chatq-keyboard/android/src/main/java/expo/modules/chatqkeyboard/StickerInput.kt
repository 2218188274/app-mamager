package expo.modules.chatqkeyboard

import android.content.ClipDescription
import android.net.Uri
import android.os.Build
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import androidx.core.view.inputmethod.EditorInfoCompat
import androidx.core.view.inputmethod.InputConnectionCompat
import androidx.core.view.inputmethod.InputContentInfoCompat

/** An accepted commit is handed to the editor; the editor decides how to send it. */
object StickerInput {
  @JvmStatic fun supports(info: EditorInfo?): Boolean = Build.VERSION.SDK_INT >= 25 && info != null &&
    EditorInfoCompat.getContentMimeTypes(info).any { ClipDescription.compareMimeTypes("image/png", it) }

  @JvmStatic fun commit(connection: InputConnection, info: EditorInfo, uri: Uri): Boolean {
    if (!supports(info)) return false
    connection.finishComposingText()
    return InputConnectionCompat.commitContent(connection, info,
      InputContentInfoCompat(uri, ClipDescription("聊商图片表情", arrayOf("image/png")), null),
      InputConnectionCompat.INPUT_CONTENT_GRANT_READ_URI_PERMISSION, null)
  }
}
