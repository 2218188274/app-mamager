package expo.modules.chatqkeyboard

import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.drawable.Drawable

/** Small outline icons use the same stroke and remain decorative beside text labels. */
internal class KeyboardIcon(private val kind: String, color: Int, private val size: Int) : Drawable() {
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color; style = Paint.Style.STROKE; strokeWidth = 1.8f; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND }
  override fun getIntrinsicWidth() = size
  override fun getIntrinsicHeight() = size
  override fun setAlpha(alpha: Int) { paint.alpha = alpha }
  override fun setColorFilter(filter: ColorFilter?) { paint.colorFilter = filter }
  @Deprecated("Deprecated in Android") override fun getOpacity() = PixelFormat.TRANSLUCENT
  override fun draw(canvas: Canvas) {
    canvas.save(); canvas.translate(bounds.left.toFloat(), bounds.top.toFloat()); canvas.scale(bounds.width() / 24f, bounds.height() / 24f)
    fun path(vararg points: Float) { val p = Path(); p.moveTo(points[0], points[1]); for (i in 2 until points.size step 2) p.lineTo(points[i], points[i + 1]); canvas.drawPath(p, paint) }
    when (kind) {
      "back" -> { path(10f, 5f, 3f, 12f, 10f, 19f); path(3f, 12f, 21f, 12f) }
      "insert" -> { path(6f, 5f, 6f, 12f, 19f, 12f); path(14f, 7f, 19f, 12f, 14f, 17f) }
      "emoji" -> { canvas.drawCircle(12f, 12f, 9f, paint); canvas.drawPoint(9f, 9f, paint); canvas.drawPoint(15f, 9f, paint); canvas.drawArc(7f, 9f, 17f, 17f, 25f, 130f, false, paint) }
      "voice" -> { canvas.drawRoundRect(9f, 3f, 15f, 14f, 3f, 3f, paint); canvas.drawArc(6f, 6f, 18f, 18f, 0f, 180f, false, paint); path(12f, 18f, 12f, 21f); path(9f, 21f, 15f, 21f) }
      "more" -> { for (x in listOf(4f, 14f)) for (y in listOf(4f, 14f)) canvas.drawRoundRect(x, y, x + 6f, y + 6f, 1.5f, 1.5f, paint) }
      "tune" -> { path(3f, 7f, 21f, 7f); path(3f, 17f, 21f, 17f); path(8f, 4f, 8f, 10f); path(16f, 14f, 16f, 20f) }
      else -> path(12f, 2f, 15f, 9f, 22f, 12f, 15f, 15f, 12f, 22f, 9f, 15f, 2f, 12f, 9f, 9f, 12f, 2f)
    }
    canvas.restore()
  }
}
