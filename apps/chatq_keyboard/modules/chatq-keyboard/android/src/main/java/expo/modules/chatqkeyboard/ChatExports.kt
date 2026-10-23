package expo.modules.chatqkeyboard

import android.app.Activity
import android.content.Intent
import expo.modules.kotlin.Promise

/** Explicit SAF export. No external-storage permission, clipboard, credentials or persistent temp files. */
internal class ChatExports(private val activity: () -> Activity) {
  private class Job(val text:String,val format:String,val promise:Promise,val code:Int,val resolver:android.content.ContentResolver) { var writing=false }
  private val lock=Any()
  private var job:Job?=null
  private var destroyed=false
  private val worker=java.util.concurrent.Executors.newSingleThreadExecutor()
  fun start(text:String,format:String,promise:Promise) {
    require(format in listOf("txt","md")&&text.isNotBlank()&&text.length<=4000000) { "导出内容或格式异常" }
    val host=activity();val code=requestCodes.incrementAndGet();check(code<=65535) { "请重新打开应用后再导出" }
    val next=Job(text,format,promise,code,host.applicationContext.contentResolver)
    synchronized(lock) { check(!destroyed&&job==null) { "已有导出正在进行" };job=next }
    try {
      host.runOnUiThread { if(synchronized(lock){job===next}) try {
        val name="ChatQ-chat-"+java.text.SimpleDateFormat("yyyyMMdd-HHmmss",java.util.Locale.ROOT).format(java.util.Date())+"."+format
        host.startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(if(format=="md")"text/markdown" else "text/plain").putExtra(Intent.EXTRA_TITLE,name),next.code)
      }catch(_:Exception){finish(next,false,"无法打开保存位置")} }
    }catch(_:Exception){finish(next,false,"无法打开保存位置")}
  }
  fun result(code:Int,result:Int,data:Intent?) {
    // A delayed result from an older picker must never write a newer conversation to its URI.
    val current=synchronized(lock){job?.takeIf{it.code==code&&!it.writing}?.also{it.writing=true}}?:return
    val uri=data?.data
    if(result!=Activity.RESULT_OK||uri==null){finish(current,false);return}
    if(uri.scheme!="content"){finish(current,false,"保存位置无效，请重新选择");return}
    try { worker.execute {
      try {
        val bytes=current.text.toByteArray(Charsets.UTF_8);require(bytes.size<=16*1024*1024)
        if(!synchronized(lock){job===current})return@execute
        requireNotNull(current.resolver.openOutputStream(uri,"wt")).use { it.write(bytes);it.flush() }
        finish(current,true)
      }catch(_:Exception){finish(current,false,"文件保存失败，请重新选择位置")}
    } }catch(_:Exception){finish(current,false,"导出已结束，请重试")}
  }
  private fun finish(current:Job,saved:Boolean,error:String?=null) {
    val valid=synchronized(lock){if(job!==current)false else{job=null;true}}
    if(valid) { if(error==null)current.promise.resolve(if(saved)"saved" else "cancelled") else current.promise.reject("CHAT_EXPORT_FAILED",error,null) }
  }
  fun destroy() { val current=synchronized(lock){destroyed=true;job};if(current!=null)finish(current,false);worker.shutdown() }
  companion object { private val requestCodes=java.util.concurrent.atomic.AtomicInteger(21000) }
}
