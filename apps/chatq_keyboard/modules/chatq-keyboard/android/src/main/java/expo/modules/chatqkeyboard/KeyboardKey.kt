package expo.modules.chatqkeyboard

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.widget.Button

internal class KeyboardKey(context: Context) : Button(context) {
  var hintText: String? = null
  var hintColor = android.graphics.Color.GRAY
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    hintText?.let {
      paint.color = hintColor; paint.textSize = 9 * resources.displayMetrics.scaledDensity; paint.textAlign = Paint.Align.RIGHT
      canvas.drawText(it, width - 4 * resources.displayMetrics.density, 11 * resources.displayMetrics.density, paint)
    }
  }
}
