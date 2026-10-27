package expo.modules.chatqkeyboard

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.core.content.FileProvider
import java.io.File
import kotlin.math.roundToInt

class StickerFileProvider : FileProvider()

/** Shares only bundled IDs or explicitly imported and validated local PNGs. */
class StickerShare(private val context: Context) {
  fun uri(id: String): Uri = synchronized(fileLock) {
    val custom=StickerLibrary(context).content(id)
    val directory = File(context.cacheDir, "chatq-stickers").apply { mkdirs() }
    val file = File(directory, "$id-512.png")
    if (!file.isFile || file.length() == 0L) {
      val decoded = (if(custom!=null)android.util.Base64.decode(custom.substringAfter(','),android.util.Base64.NO_WRAP).let{BitmapFactory.decodeByteArray(it,0,it.size)}else context.assets.open("stickers/$id.png").use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = 2 }) })
        ?: error("表情图片暂时无法打开")
      val scale = minOf(1f,512f / maxOf(decoded.width, decoded.height))
      val bitmap = Bitmap.createScaledBitmap(decoded, (decoded.width * scale).roundToInt().coerceAtLeast(1), (decoded.height * scale).roundToInt().coerceAtLeast(1), true)
      val temp = File(directory, "$id.tmp")
      try { temp.outputStream().use { check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)) }; check(temp.renameTo(file)) { "无法准备图片，请稍后重试" } }
      finally { if (bitmap !== decoded) bitmap.recycle(); decoded.recycle(); temp.delete() }
    }
    FileProvider.getUriForFile(context, context.packageName + ".chatq.stickers", file)
  }
  companion object { private val fileLock = Any() }
  fun intent(id: String): Intent {
    val uri = uri(id)
    val send = Intent(Intent.ACTION_SEND).apply {
      type = "image/png"
      putExtra(Intent.EXTRA_STREAM, uri)
      clipData = ClipData.newUri(context.contentResolver, "聊商图片表情", uri)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    return Intent.createChooser(send, "分享图片表情").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
  }
}
