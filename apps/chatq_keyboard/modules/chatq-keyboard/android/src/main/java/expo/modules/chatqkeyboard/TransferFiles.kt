package expo.modules.chatqkeyboard

import android.app.Activity
import android.content.Intent
import expo.modules.kotlin.Promise
import org.json.JSONObject

internal class TransferFiles(private val activity:()->Activity,private val store:()->GenerationStore) {
  private val worker=java.util.concurrent.Executors.newSingleThreadExecutor()
  @Volatile private var ticket=0
  @Volatile private var pending:Promise?=null
  @Volatile private var content:ByteArray?=null
  @Volatile private var password:String?=null
  @Volatile private var decoded:JSONObject?=null
  @Volatile private var expected:String?=null
  @Synchronized private fun begin(p:Promise):Int {check(pending==null){"已有迁移操作正在进行"};check(BackupFileLease.acquire(this)){"另一个备份或迁移操作正在进行"};decoded=null;expected=null;pending=p;return ++ticket}
  fun export(p:String,promise:Promise){val current=begin(promise);worker.execute{try{val bytes=SharedTransfer.encrypt(SharedTransfer.export(store().export()),p);if(current!=ticket)return@execute;content=bytes;activity().runOnUiThread{if(current==ticket)try{activity().startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/octet-stream").putExtra(Intent.EXTRA_TITLE,"ChatQ-"+System.currentTimeMillis()+".cqtransfer"),EXPORT)}catch(_:Exception){fail(current,"无法打开保存位置")}}}catch(e:Exception){fail(current,e.message?:"跨端导出失败，原数据未修改")}}}
  fun inspect(p:String,promise:Promise){val current=begin(promise);password=p;try{activity().runOnUiThread{if(current==ticket)try{activity().startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*"),IMPORT)}catch(_:Exception){fail(current,"无法打开文件选择器")}}}catch(_:Exception){fail(current,"无法打开文件选择器")}}
  fun result(code:Int,result:Int,intent:Intent?){if(code !in listOf(EXPORT,IMPORT)||pending==null)return;val current=ticket;val uri=intent?.data;if(result!=Activity.RESULT_OK||uri==null){finish(current,null);return};worker.execute{try{if(current!=ticket)return@execute;if(code==EXPORT){val bytes=requireNotNull(content);requireNotNull(activity().contentResolver.openOutputStream(uri,"wt")).use{if(current!=ticket)return@execute;it.write(bytes);it.flush()};finish(current,"saved")}else{val bytes=requireNotNull(activity().contentResolver.openInputStream(uri)).use{input->val out=java.io.ByteArrayOutputStream();val block=ByteArray(8192);while(true){if(current!=ticket)return@execute;val n=input.read(block);if(n<0)break;require(out.size()+n<=SharedTransfer.MAX);out.write(block,0,n)};out.toByteArray()};val data=SharedTransfer.decrypt(bytes,requireNotNull(password));val preview=store().transferPreview(data);completePreview(current,data,preview)}}catch(_:Exception){fail(current,if(code==IMPORT)"无法读取跨端文件：密码错误、文件损坏、版本或合并容量不支持。现有数据未修改。" else "保存失败，请重新选择位置")}}}
  fun apply():Int {check(pending==null);val data=requireNotNull(decoded){"请先选择文件并预览"};val hash=requireNotNull(expected);check(BackupFileLease.acquire(this)){"另一个备份或迁移操作正在进行"};return try{store().applyTransfer(data,hash)}finally{decoded=null;expected=null;BackupFileLease.release(this)}}
  fun undo(){check(BackupFileLease.acquire(this)){"另一个备份或迁移操作正在进行"};try{store().undoTransfer()}finally{BackupFileLease.release(this)}}
  @Synchronized fun discard(){ticket++;decoded=null;expected=null;content=null;password=null;val p=pending;pending=null;BackupFileLease.release(this);p?.resolve(null)}
  @Synchronized private fun completePreview(current:Int,data:JSONObject,preview:JSONObject){if(current!=ticket)return;decoded=data;expected=preview.getString("fingerprint");finish(current,preview.toString())}
  @Synchronized private fun finish(current:Int,value:Any?){if(current!=ticket)return;val p=pending;pending=null;content=null;password=null;BackupFileLease.release(this);p?.resolve(value)}
  @Synchronized private fun fail(current:Int,message:String){if(current!=ticket)return;val p=pending;pending=null;content=null;password=null;decoded=null;expected=null;BackupFileLease.release(this);p?.reject("TRANSFER_FAILED",message,null)}
  fun destroy(){discard();worker.shutdownNow()}
  companion object{private const val EXPORT=19031;private const val IMPORT=19032}
}
