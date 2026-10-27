package expo.modules.chatqkeyboard

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.provider.OpenableColumns
import android.util.Base64
import expo.modules.kotlin.Promise
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.util.UUID

/** Explicit one-document picker; no storage permission, persistent URI grant or background reads. */
internal class ChatAttachments(private val activity:()->Activity) {
  private class Job(val code:Int,val promise:Promise,val resolver:android.content.ContentResolver,val kind:String) { var reading=false }
  private var job:Job?=null;private val lock=Any();private var destroyed=false
  private val worker=java.util.concurrent.Executors.newSingleThreadExecutor()
  fun pick(kind:String,promise:Promise) {
    require(kind in setOf("image","file","screenshot"));val host=activity();val next=Job(codes.incrementAndGet(),promise,host.contentResolver,kind);require(next.code<=65535)
    synchronized(lock){check(!destroyed&&job==null){"已有附件选择正在进行"};job=next}
    host.runOnUiThread { if(synchronized(lock){job===next}) try {
      val intent=Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(if(kind!="file")"image/*" else "*/*")
      intent.putExtra(Intent.EXTRA_MIME_TYPES,if(kind!="file")arrayOf("image/jpeg","image/png","image/webp")else arrayOf("text/plain","text/markdown","text/csv","application/pdf","application/octet-stream"))
      host.startActivityForResult(intent,next.code)
    }catch(_:Exception){finish(next,null,"无法打开附件选择器")} }
  }
  fun result(code:Int,result:Int,data:Intent?) {
    val current=synchronized(lock){job?.takeIf{it.code==code&&!it.reading}?.also{it.reading=true}}?:return
    val uri=data?.data;if(result!=Activity.RESULT_OK||uri==null){finish(current,null);return}
    if(uri.scheme!="content"){finish(current,null,"请选择系统文件提供器中的附件");return}
    worker.execute { try {
      var name="附件";var declaredSize=-1L
      current.resolver.query(uri,arrayOf(OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE),null,null,null)?.use { if(it.moveToFirst()){ name=it.getString(0)?:name;if(!it.isNull(1))declaredSize=it.getLong(1) } }
      val inputLimit = if(current.kind=="screenshot") 8*1024*1024 else 4*1024*1024
      require(declaredSize<=inputLimit){"附件原文件最多 ${inputLimit/1024/1024}MB"}
      val bytes=requireNotNull(current.resolver.openInputStream(uri)).use { input -> val output=ByteArrayOutputStream();val buf=ByteArray(8192);while(true){val n=input.read(buf);if(n<0)break;require(output.size()+n<=inputLimit){"附件原文件最多 ${inputLimit/1024/1024}MB"};output.write(buf,0,n)};output.toByteArray() }
      val mime=current.resolver.getType(uri)?:""
      name=name.filterNot{it.isISOControl()}.take(100).ifBlank{"附件"}
      val image=BitmapFactory.Options().also{it.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(bytes,0,bytes.size,it)}
      require(current.kind=="file" || (image.outWidth>0 && image.outHeight>0)) { "请选择有效的图片" }
      val maxSide = if(current.kind=="screenshot") 2048f else 1280f
      val content:String;val outputMime:String
      if(image.outWidth>0&&image.outHeight>0) {
        require(image.outWidth<=30000&&image.outHeight<=30000){"图片尺寸过大"};var sample=1;while(maxOf(image.outWidth,image.outHeight)/sample>maxSide*1.25f)sample*=2
        val decoded=requireNotNull(BitmapFactory.decodeByteArray(bytes,0,bytes.size,BitmapFactory.Options().also{it.inSampleSize=sample}))
        val orientation=try{android.media.ExifInterface(ByteArrayInputStream(bytes)).getAttributeInt(android.media.ExifInterface.TAG_ORIENTATION,1)}catch(_:Exception){1}
        val matrix=Matrix();when(orientation){2->matrix.setScale(-1f,1f);3->matrix.setRotate(180f);4->{matrix.setRotate(180f);matrix.postScale(-1f,1f)};5->{matrix.setRotate(90f);matrix.postScale(-1f,1f)};6->matrix.setRotate(90f);7->{matrix.setRotate(270f);matrix.postScale(-1f,1f)};8->matrix.setRotate(270f)}
        val rotated=Bitmap.createBitmap(decoded,0,0,decoded.width,decoded.height,matrix,true);if(rotated!==decoded)decoded.recycle()
        val scale=minOf(1f,maxSide/maxOf(rotated.width,rotated.height));val bitmap=Bitmap.createScaledBitmap(rotated,maxOf(1,(rotated.width*scale).toInt()),maxOf(1,(rotated.height*scale).toInt()),true);if(bitmap!==rotated)rotated.recycle()
        val output=ByteArrayOutputStream();try{bitmap.compress(Bitmap.CompressFormat.JPEG,75,output)}finally{bitmap.recycle()}
        require(output.size()<=512000){"图片压缩后仍过大，请裁剪后重选"};outputMime="image/jpeg";content="data:image/jpeg;base64,"+Base64.encodeToString(output.toByteArray(),Base64.NO_WRAP)
      } else if(bytes.take(5).toByteArray().toString(Charsets.US_ASCII)=="%PDF-") {
        require(bytes.size<=512000){"PDF 最多 500KB，请拆分文档"};outputMime="application/pdf";content="data:application/pdf;base64,"+Base64.encodeToString(bytes,Base64.NO_WRAP)
      } else {
        require(mime.startsWith("text/")||name.substringAfterLast('.').lowercase() in setOf("txt","md","csv","json","log")){"支持图片、PDF 和 UTF-8 文本（TXT/MD/CSV/JSON），暂不支持 Word/Excel"}
        require(bytes.size<=48000){"文本附件最多 12000 字"}
        content=Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString().removePrefix("\uFEFF")
        require(content.isNotBlank()&&content.length<=12000&&content.none{it.isISOControl()&&it !in "\n\r\t"}){"请选择 12000 字以内的 UTF-8 文本"};outputMime="text/plain"
      }
      finish(current,JSONObject().put("id",UUID.randomUUID().toString()).put("name",name).put("mime",outputMime).put("content",content).toString())
    }catch(e:Exception){finish(current,null,if(e is IllegalArgumentException)e.message?:"附件格式不支持" else "附件读取失败，请重选 UTF-8 文本或有效图片/PDF")} }
  }
  private fun finish(current:Job,value:String?,error:String?=null){val valid=synchronized(lock){if(job!==current)false else{job=null;true}};if(valid){if(error==null)current.promise.resolve(value) else current.promise.reject("ATTACHMENT_FAILED",error,null)}}
  fun destroy(){val current=synchronized(lock){destroyed=true;job};if(current!=null)finish(current,null);worker.shutdown()}
  companion object { private val codes=java.util.concurrent.atomic.AtomicInteger(31000) }
}
