package expo.modules.chatqkeyboard

import android.graphics.*
import android.util.Base64
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.util.UUID

/** Edits are burned into new pixels in memory. No source URI, file, EXIF or hidden layer survives. */
internal object ScreenshotProcessor {
  private fun rect(value: JSONObject, width: Int, height: Int): Rect {
    val x=value.getDouble("x");val y=value.getDouble("y");val w=value.getDouble("width");val h=value.getDouble("height")
    require(listOf(x,y,w,h).all { it.isFinite() } && x>=0 && y>=0 && w>0 && h>0 && x+w<=1.000001 && y+h<=1.000001) { "编辑范围无效，请重新框选" }
    return Rect(kotlin.math.floor(x*width).toInt().coerceIn(0,width-1),kotlin.math.floor(y*height).toInt().coerceIn(0,height-1),kotlin.math.ceil((x+w)*width).toInt().coerceIn(1,width),kotlin.math.ceil((y+h)*height).toInt().coerceIn(1,height))
  }
  fun edit(raw: String, specification: String): String {
    require(raw.length<=700500 && specification.length<=6000) { "截图或编辑范围过大" }
    val image=JSONObject(raw);val mime=image.getString("mime");val content=image.getString("content")
    require(mime in listOf("image/jpeg","image/png") && content.startsWith("data:$mime;base64,")) { "请选择有效截图" }
    val bytes=Base64.decode(content.substringAfter(','),Base64.NO_WRAP)
    val bounds=BitmapFactory.Options().apply { inJustDecodeBounds=true };BitmapFactory.decodeByteArray(bytes,0,bytes.size,bounds)
    require(bounds.outWidth in 16..2048 && bounds.outHeight in 16..2048) { "截图尺寸无效，请重新选择" }
    val source=requireNotNull(BitmapFactory.decodeByteArray(bytes,0,bytes.size)) { "截图读取失败" }
    val spec=JSONObject(specification);val masks=spec.getJSONArray("masks");require(masks.length()<=20) { "最多添加20处遮挡" }
    var output: Bitmap?=null
    try {
      val crop=rect(spec.getJSONObject("crop"),source.width,source.height);require(crop.width()>=16 && crop.height()>=16) { "裁剪范围过小，请重新框选" }
      output=Bitmap.createBitmap(crop.width(),crop.height(),Bitmap.Config.ARGB_8888)
      val canvas=Canvas(output);canvas.drawColor(Color.WHITE);canvas.drawBitmap(source,crop,Rect(0,0,crop.width(),crop.height()),null)
      val paint=Paint().apply { color=Color.BLACK;style=Paint.Style.FILL;isAntiAlias=false }
      for(i in 0 until masks.length()) { val r=rect(masks.getJSONObject(i),source.width,source.height);r.offset(-crop.left,-crop.top);canvas.drawRect(r,paint) }
      val encoded=ByteArrayOutputStream();output.compress(Bitmap.CompressFormat.PNG,100,encoded);var type="image/png"
      if(encoded.size()>512000) { type="image/jpeg";for(quality in listOf(90,75,60)){encoded.reset();output.compress(Bitmap.CompressFormat.JPEG,quality,encoded);if(encoded.size()<=512000)break} }
      require(encoded.size()<=512000) { "编辑后图片仍过大，请缩小裁剪范围" }
      return JSONObject().put("id",UUID.randomUUID().toString()).put("name",if(type=="image/png")"编辑后的截图.png" else "编辑后的截图.jpg").put("mime",type).put("content","data:$type;base64,"+Base64.encodeToString(encoded.toByteArray(),Base64.NO_WRAP)).toString()
    } finally { output?.recycle();source.recycle() }
  }
  fun testImage(): String {
    val bitmap=Bitmap.createBitmap(320,160,Bitmap.Config.ARGB_8888)
    try { val canvas=Canvas(bitmap);canvas.drawColor(Color.WHITE);canvas.drawText("4726",35f,115f,Paint(Paint.ANTI_ALIAS_FLAG).apply { color=Color.BLACK;textSize=92f;typeface=Typeface.MONOSPACE });val bytes=ByteArrayOutputStream();bitmap.compress(Bitmap.CompressFormat.PNG,100,bytes);return "data:image/png;base64,"+Base64.encodeToString(bytes.toByteArray(),Base64.NO_WRAP) } finally { bitmap.recycle() }
  }
}
