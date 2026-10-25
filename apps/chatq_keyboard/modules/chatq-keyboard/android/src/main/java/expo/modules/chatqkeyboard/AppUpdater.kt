package expo.modules.chatqkeyboard

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

internal class AppUpdater(private val context:Context) {
  @Volatile private var cancelled=false
  @Volatile private var connection:HttpURLConnection?=null
  @Volatile var progress=0
  private var verified:JSONObject?=null
  private val file=File(context.cacheDir,"chatq-update.apk")
  private fun url(value:String):URL {
    val url=URL(value); require(url.protocol=="https" || url.protocol=="http" && url.host in listOf("103.149.91.78","10.0.2.2","localhost"))
    require(url.userInfo==null && url.ref==null) { "更新地址格式不正确" }; return url
  }
  private fun connect(value:URL):HttpURLConnection = (value.openConnection() as HttpURLConnection).apply {
    instanceFollowRedirects=false; connectTimeout=20000; readTimeout=30000; setRequestProperty("Cache-Control","no-cache"); connection=this
  }
  fun check(base:String):String {
    val origin=url(base); val address=URL(origin,"/downloads/chatq-android-latest.json")
    val c=connect(address)
    try { require(c.responseCode==200) { "更新信息暂不可用" }; val bytes=c.inputStream.use { it.readNBytesCompat(65536) }; val data=JSONObject(bytes.toString(Charsets.UTF_8)); validate(data,origin); return data.toString() } finally { c.disconnect(); connection=null }
  }
  private fun validate(data:JSONObject,origin:URL) {
    require(data.getInt("schema")==1 && data.getInt("versionCode")>0 && data.getString("version").length in 1..40) { "更新信息格式不受支持" }
    require(data.getString("sha256").matches(Regex("[a-f0-9]{64}")))
    require(data.getLong("sizeBytes") in 1..100*1024*1024)
    val download=url(data.getString("url")); require(download.protocol==origin.protocol && download.host==origin.host && download.port==origin.port && download.path.startsWith("/downloads/") && download.path.endsWith(".apk") && download.query==null)
    val notes=data.getJSONArray("notes"); require(notes.length()<=30); for(i in 0 until notes.length()) require(notes.getString(i).length<=1000)
  }
  @Synchronized fun download(raw:String,base:String):String {
    val data=JSONObject(raw); validate(data,url(base)); require(data.getInt("versionCode")>installed().versionCode) { "当前版本已是最新" }
    cancelled=false; verified=null; progress=0; val c=connect(url(data.getString("url")))
    try {
      require(c.responseCode==200) { "下载服务暂不可用" }
      val expected=data.getLong("sizeBytes"); var total=0L; val hash=MessageDigest.getInstance("SHA-256")
      c.inputStream.use { input -> file.outputStream().use { out -> val buffer=ByteArray(65536); while(true) { check(!cancelled) { "已取消下载" }; val n=input.read(buffer); if(n<0)break; total+=n; require(total<=expected) { "下载大小与版本信息不一致" }; hash.update(buffer,0,n); out.write(buffer,0,n); progress=(total*100/expected).toInt() } } }
      require(total==expected) { "安装包大小不匹配" }; verifyFile(data); verified=data; return "verified"
    } catch(e:Exception) { file.delete(); if(cancelled) throw IllegalStateException("已取消下载") else throw e } finally { c.disconnect(); connection=null }
  }
  fun cancel() { cancelled=true; connection?.disconnect() }
  @Suppress("DEPRECATION") private fun installed()=context.packageManager.getPackageInfo(context.packageName,PackageManager.GET_SIGNATURES)
  fun installedVersion():Map<String,Any> {
    val info=installed()
    return mapOf("version" to (info.versionName ?: "未知"), "versionCode" to androidx.core.content.pm.PackageInfoCompat.getLongVersionCode(info))
  }
  @Suppress("DEPRECATION") private fun verifyPackage(data:JSONObject) {
    val archive=requireNotNull(context.packageManager.getPackageArchiveInfo(file.absolutePath,PackageManager.GET_SIGNATURES)) { "安装包无法读取，请重新下载" }
    require(archive.packageName==context.packageName && archive.versionCode==data.getInt("versionCode") && archive.versionName==data.getString("version")) { "安装包版本或包名不匹配" }
    val expected=installed().signatures?.map { hex(MessageDigest.getInstance("SHA-256").digest(it.toByteArray())) }?.toSet()
    val actual=archive.signatures?.map { hex(MessageDigest.getInstance("SHA-256").digest(it.toByteArray())) }?.toSet()
    require(!expected.isNullOrEmpty() && expected==actual) { "安装包签名不匹配" }
  }
  private fun verifyFile(data:JSONObject) {
    val hash=MessageDigest.getInstance("SHA-256"); file.inputStream().use { input -> val b=ByteArray(65536); while(true) { val n=input.read(b); if(n<0)break; hash.update(b,0,n) } }; require(hex(hash.digest())==data.getString("sha256")) { "安装包发生变化，请重新下载" }; verifyPackage(data)
  }
  fun install():String {
    val data=requireNotNull(verified) { "请先下载并校验安装包" }
    verifyFile(data)
    if(android.os.Build.VERSION.SDK_INT>=26 && !context.packageManager.canRequestPackageInstalls()) {
      context.startActivity(Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,android.net.Uri.parse("package:"+context.packageName)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return "permission"
    }
    val uri=FileProvider.getUriForFile(context,context.packageName+".chatq.updates",file)
    context.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri,"application/vnd.android.package-archive").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)); return "installer"
  }
  companion object {
    private fun hex(bytes:ByteArray)=bytes.joinToString("") { "%02x".format(it.toInt() and 255) }
    private fun java.io.InputStream.readNBytesCompat(max:Int):ByteArray { val out=java.io.ByteArrayOutputStream(); val b=ByteArray(4096); while(true) { val n=read(b); if(n<0)break; require(out.size()+n<=max); out.write(b,0,n) }; return out.toByteArray() }
  }
}
