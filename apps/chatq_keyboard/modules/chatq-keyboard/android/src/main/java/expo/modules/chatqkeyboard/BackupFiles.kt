package expo.modules.chatqkeyboard

import android.app.Activity
import android.content.Intent
import expo.modules.kotlin.Promise
import org.json.JSONObject

/** SAF handles destinations; plaintext only lives in memory. */
internal class BackupFiles(private val activity: () -> Activity, private val store: () -> GenerationStore) {
  @Volatile private var operation=0
  @Volatile private var pending: Promise? = null
  @Volatile private var content: ByteArray? = null
  @Volatile private var password: String? = null
  @Volatile private var preview: JSONObject? = null
  private val worker=java.util.concurrent.Executors.newSingleThreadExecutor()
  fun export(password: String, promise: Promise) {
    if(pending != null) { promise.reject("BUSY","已有文件操作正在进行",null); return }
    require(password.length in 8..128) { "备份密码需要 8–128 个字符" }
    if(!BackupFileLease.acquire(this)){promise.reject("BUSY","另一个备份或迁移操作正在进行",null);return}
    preview=null;pending=promise; val ticket=++operation
    worker.execute { try {
      val bytes=store().export().toString().toByteArray(Charsets.UTF_8); require(bytes.size <= MAX) { "备份内容超过 16MB，请先整理记录" }
      val encrypted=BackupCrypto.encrypt(bytes,password)
      if(ticket!=operation)return@execute
      content=encrypted
      activity().runOnUiThread { if(ticket==operation) try { activity().startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/octet-stream").putExtra(Intent.EXTRA_TITLE,"ChatQ-"+java.text.SimpleDateFormat("yyyyMMdd-HHmmss",java.util.Locale.ROOT).format(java.util.Date())+".chatqbackup"),EXPORT) } catch(e:Exception) { fail("无法打开保存位置",ticket) } }
    } catch(e:Exception) { fail(e.message ?: "备份失败",ticket) } }
  }
  fun inspect(password: String, promise: Promise) {
    if(pending != null) { promise.reject("BUSY","已有文件操作正在进行",null); return }
    require(password.length in 8..128);if(!BackupFileLease.acquire(this)){promise.reject("BUSY","另一个备份或迁移操作正在进行",null);return};operation++;pending=promise; this.password=password; preview=null
    val ticket=operation;try { activity().runOnUiThread{if(ticket==operation)try{activity().startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*"),IMPORT)}catch(_:Exception){fail("无法打开文件选择器",ticket)}} } catch(e:Exception) { fail("无法打开文件选择器",ticket) }
  }
  fun result(code:Int, result:Int, data:Intent?) {
    if(code !in listOf(EXPORT,IMPORT) || pending == null) return
    if(result != Activity.RESULT_OK || data?.data == null) { finish(null); return }
    val uri=data.data!!;val ticket=operation
    worker.execute { try {
      if(ticket!=operation)return@execute
      if(code == EXPORT) {
        val bytes=requireNotNull(content)
        requireNotNull(activity().contentResolver.openOutputStream(uri,"wt")).use { it.write(bytes); it.flush() }
        finish("saved",ticket)
      } else {
        val raw=requireNotNull(activity().contentResolver.openInputStream(uri)).use { it.readBytesLimited(MAX*2) }
        val plain=BackupCrypto.decrypt(raw,requireNotNull(password))
        val value=try{store().validateBackup(JSONObject(plain.toString(Charsets.UTF_8)))}finally{plain.fill(0)}
        val settings=value.getJSONObject("settings")
        completePreview(value,JSONObject().put("createdAt",value.getLong("createdAt")).put("records",value.getJSONArray("records").length()).put("chats",value.optJSONArray("chats")?.length() ?: 0).put("settings",settings.length()).toString(),ticket)
      }
    } catch(e:Exception) { fail(if(code==IMPORT) "无法读取备份：密码错误、文件损坏或格式不受支持。现有数据未修改。" else "文件保存失败，请重新选择位置",ticket) } }
  }
  fun apply(): Int { val value=requireNotNull(preview) { "请重新选择备份并预览" };check(BackupFileLease.acquire(this)){"另一个备份或迁移操作正在进行"};return try{store().restore(value)}finally{preview=null;BackupFileLease.release(this)} }
  @Synchronized fun discard() { preview=null }
  @Synchronized private fun completePreview(value:JSONObject,summary:String,ticket:Int){if(ticket!=operation)return;preview=value;finish(summary,ticket)}
  @Synchronized private fun finish(value:Any?,ticket:Int=operation) {if(ticket!=operation)return;val p=pending; pending=null; content=null; password=null;BackupFileLease.release(this);p?.resolve(value) }
  @Synchronized private fun fail(message:String,ticket:Int=operation) {if(ticket!=operation)return;val p=pending; pending=null; content=null; password=null;preview=null;BackupFileLease.release(this);p?.reject("BACKUP_FAILED",message,null) }
  @Synchronized fun cancel() { operation++; preview=null; finish(null) }
  fun destroy() { cancel(); worker.shutdownNow() }
  companion object {
    private const val EXPORT=19011; private const val IMPORT=19012; private const val MAX=16*1024*1024
    private fun java.io.InputStream.readBytesLimited(max:Int):ByteArray { val output=java.io.ByteArrayOutputStream(); val buffer=ByteArray(8192); var count=0; while(true) { val n=read(buffer); if(n<0)break; count+=n; require(count <= max); output.write(buffer,0,n) }; return output.toByteArray() }
  }
}
