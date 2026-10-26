package expo.modules.chatqkeyboard

import android.content.SharedPreferences
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.CancellationException

/** One explicitly started request, bounded in memory; never stores incomplete answers. */
internal class ChatStream @JvmOverloads constructor(private val prefs: SharedPreferences, private val authorization: () -> String? = { null }) {
  private class Job(val id:String) { var http:HttpURLConnection?=null;var text="";var status="running";var error="";var cancelled=false }
  private val lock=Any()
  private var job:Job?=null
  private val cancelled=linkedSetOf<String>()
  fun start(id:String,payload:String) {
    require(id.matches(Regex("[a-zA-Z0-9_-]{16,80}")) && payload.length<=1600000)
    val body=JSONObject(payload);require(body.getString("requestId")==id)
    val next=Job(id)
    synchronized(lock) {
      check(job?.status!="running") { "已有对话正在生成" }
      if(cancelled.remove(id))throw CancellationException()
      job=next
    }
    Thread({ run(next,body) },"chatq-chat-stream").start()
  }
  fun snapshot(id:String):String=synchronized(lock) {
    val current=job;check(current!=null&&current.id==id) { "本次流请求已结束" }
    JSONObject().put("text",current.text).put("status",current.status).put("error",current.error).toString()
  }
  fun cancel(id:String) {
    val http=synchronized(lock) {
      cancelled.add(id);while(cancelled.size>32)cancelled.remove(cancelled.first())
      job?.takeIf { it.id==id }?.let { it.cancelled=true;it.status="cancelled";it.http }
    }
    http?.disconnect()
  }
  fun release(id:String) { cancel(id);synchronized(lock) { if(job?.id==id)job=null } }
  fun destroy() { synchronized(lock){job?.id}?.let { release(it) } }
  private fun run(current:Job,payload:JSONObject) {
    var http:HttpURLConnection?=null
    val deadline=java.util.Timer(true)
    fun valid()=synchronized(lock) { job===current&&!current.cancelled }
    try {
      val base=URL(prefs.getString("baseUrl","")!!.trimEnd('/'))
      require(base.protocol in listOf("http","https")&&base.userInfo==null&&base.query==null&&base.ref==null&&(base.path.isEmpty()||base.path=="/")) { "服务器地址格式异常" }
      val key=prefs.getString("apiKey","")!!;val device=prefs.getString("deviceId","")!!;check(key.isNotBlank()&&device.isNotBlank()) { "请先连接服务器" }
      val connection=URL(base,"/api/aikeyboard/chat/stream").openConnection() as HttpURLConnection;http=connection
      connection.apply { requestMethod="POST";doOutput=true;connectTimeout=15000;readTimeout=75000;instanceFollowRedirects=false;setRequestProperty("Content-Type","application/json");setRequestProperty("Accept","text/event-stream");setRequestProperty("x-api-key",key);setRequestProperty("x-device-id",device) }
      authorization()?.let { token -> check(base.protocol == "https" || base.host in listOf("127.0.0.1", "localhost")) { "账号需要 HTTPS 安全连接，请回到应用更新连接" }; connection.setRequestProperty("Authorization", token) }
      synchronized(lock) { if(!valid())throw CancellationException();current.http=connection }
      deadline.schedule(object:java.util.TimerTask(){override fun run(){if(valid()){synchronized(lock){current.error="生成超时，请手动重试"};connection.disconnect()}}},75000)
      connection.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
      val code=connection.responseCode
      if(code !in 200..299) {
        val error=connection.errorStream?.bufferedReader(Charsets.UTF_8)?.use { it.readBounded(65536) }
        val message=try { JSONObject(error?:"{}").optJSONObject("error")?.optString("message") }catch(_:Exception){null}
        throw IllegalStateException(message?.take(500)?.takeIf { it.isNotBlank() }?:"服务器请求失败（$code）")
      }
      check(connection.contentType?.contains("text/event-stream")==true) { "服务器未返回流式回答，请检查更新是否完成" }
      var consumed=0;var frame=StringBuilder();var complete=false
      connection.inputStream.bufferedReader(Charsets.UTF_8).use { reader ->
        val line=StringBuilder()
        fun dispatch() {
          if(frame.isEmpty())return
          val event=JSONObject(frame.toString());frame=StringBuilder()
          synchronized(lock) {
            if(!valid())throw CancellationException()
            when(event.getString("type")) {
              "delta" -> { val delta=event.get("text");require(delta is String&&current.text.length+delta.length<=10000);current.text+=delta }
              "done" -> { val answer=event.get("reply");require(answer is String&&answer.isNotBlank()&&answer.length<=10000&&answer==current.text.trim());current.text=answer;current.status="done";complete=true }
              "error" -> throw IllegalStateException(event.optString("message","流式生成失败").take(500))
              else -> throw IllegalStateException("流式回答格式异常")
            }
          }
        }
        while(!complete) {
          if(!valid())throw CancellationException()
          val c=reader.read();if(c<0)break
          consumed++;check(consumed<=1048576&&line.length<=65536) { "流响应超过大小限制" }
          if(c==10) {
            val value=line.toString().removeSuffix("\r");line.setLength(0)
            if(value.isEmpty())dispatch() else if(value.startsWith("data:")) { if(frame.isNotEmpty())frame.append('\n');frame.append(value.substring(5).removePrefix(" "));check(frame.length<=65536) }
          } else line.append(c.toChar())
        }
      }
      check(complete) { "连接提前结束，未完成内容未加入上下文" }
    } catch(e:Exception) {
      synchronized(lock) { if(job===current&&!current.cancelled&&current.status!="done") { current.status="error";if(current.error.isBlank())current.error=when(e){is java.net.SocketTimeoutException->"生成超时，请手动重试";is IllegalStateException->e.message?:"流式回答异常";else->"连接中断，请检查网络后手动重试"} } }
    } finally { deadline.cancel();http?.disconnect();synchronized(lock){current.http=null} }
  }
  private fun java.io.Reader.readBounded(max:Int):String { val out=StringBuilder();val buf=CharArray(2048);while(true){val n=read(buf);if(n<0)break;check(out.length+n<=max);out.append(buf,0,n)};return out.toString() }
}
