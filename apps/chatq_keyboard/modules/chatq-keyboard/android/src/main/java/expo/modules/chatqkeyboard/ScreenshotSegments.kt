package expo.modules.chatqkeyboard
import android.graphics.*
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.UUID
/** Decode bounded regions before downscaling, preserving text in normal phone screenshots. */
internal object ScreenshotSegments {
 fun split(bytes:ByteArray,name:String):String {
  require(bytes.size<=20*1024*1024){"长截图最多20MB"}
  val decoder=requireNotNull(BitmapRegionDecoder.newInstance(bytes,0,bytes.size,false)){"请选择PNG或JPEG长截图"}
  try {
   require(decoder.width in 64..4096&&decoder.height in 64..24000){"长截图尺寸需在4096×24000以内"}
   val orientation=try{android.media.ExifInterface(ByteArrayInputStream(bytes)).getAttributeInt(android.media.ExifInterface.TAG_ORIENTATION,1)}catch(_:Exception){1};require(orientation in 0..1){"请先把长截图旋转为正向后重选"}
   val count=if(decoder.height<=1800)1 else 1+kotlin.math.ceil((decoder.height-1800)/1680.0).toInt();require(count<=8){"长截图超过8段，请先裁短后分次选择"}
   val result=JSONArray();var top=0
   for(i in 0 until count){val bottom=minOf(decoder.height,top+1800);val region=requireNotNull(decoder.decodeRegion(Rect(0,top,decoder.width,bottom),BitmapFactory.Options()))
    val factor=minOf(1f,2048f/maxOf(region.width,region.height));val bitmap=Bitmap.createScaledBitmap(region,maxOf(1,(region.width*factor).toInt()),maxOf(1,(region.height*factor).toInt()),true)
    val out=ByteArrayOutputStream();try{for(q in listOf(90,75,60)){out.reset();bitmap.compress(Bitmap.CompressFormat.JPEG,q,out);if(out.size()<=512000)break};require(out.size()<=512000){"某一段图片仍过大，请裁窄后重选"};result.put(JSONObject().put("id",UUID.randomUUID().toString()).put("name",name.take(70)+" · 第${i+1}段").put("mime","image/jpeg").put("content","data:image/jpeg;base64,"+Base64.encodeToString(out.toByteArray(),Base64.NO_WRAP)))}finally{if(bitmap!==region)bitmap.recycle();region.recycle()};top=bottom-120
   }
   return result.toString()
  }finally{decoder.recycle()}
 }
}
