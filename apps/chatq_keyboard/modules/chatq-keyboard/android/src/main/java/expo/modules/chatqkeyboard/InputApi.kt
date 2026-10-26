package expo.modules.chatqkeyboard

import android.content.SharedPreferences
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.CancellationException
import java.util.concurrent.atomic.AtomicLong

internal class InputApi @JvmOverloads constructor(private val prefs: SharedPreferences, private val authorization: () -> String? = { null }) {
  @Volatile private var connection: HttpURLConnection? = null
  private val generation = AtomicLong()
  private val lock = Any()
  fun cancel() {
    val http = synchronized(lock) { generation.incrementAndGet(); connection.also { connection = null } }
    http?.disconnect()
  }
  fun post(path: String, payload: JSONObject, timeout: Int, isCurrent: () -> Boolean = { true }): JSONObject {
    val epoch = generation.get()
    fun requireCurrent() { if (epoch != generation.get() || !isCurrent()) throw CancellationException() }
    requireCurrent()
    val base = prefs.getString("baseUrl", "")!!.trimEnd('/')
    val key = prefs.getString("apiKey", "")!!; val device = prefs.getString("deviceId", "")!!
    check(base.isNotBlank() && key.isNotBlank() && device.isNotBlank()) { "请先打开聊商 App，完成服务器连接" }
    if (path in listOf("reply", "topics") && !payload.has("requestId")) payload.put("requestId", java.util.UUID.randomUUID().toString())
    val http = URL("$base/api/aikeyboard/$path").openConnection() as HttpURLConnection
    val token = authorization()
    if (token != null) { check(base.startsWith("https://") || URL(base).host in listOf("127.0.0.1", "localhost")) { "账号需要 HTTPS 安全连接，请回到应用更新连接" }; http.setRequestProperty("Authorization", token) }
    try {
      http.apply { requestMethod = "POST"; doOutput = true; connectTimeout = if (path == "reply") 15000 else 4000; readTimeout = timeout; instanceFollowRedirects = false; setRequestProperty("Content-Type", "application/json"); setRequestProperty("x-api-key", key); setRequestProperty("x-device-id", device) }
      synchronized(lock) { requireCurrent(); connection = http }
      requireCurrent()
      http.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
      val code = http.responseCode
      val body = (if (code in 200..299) http.inputStream else http.errorStream)?.bufferedReader()?.use { reader ->
        val result = StringBuilder(); val buffer = CharArray(2048)
        while (true) { requireCurrent(); val size = reader.read(buffer); if (size < 0) break; check(result.length + size <= 32768) { "服务器响应过大，请检查连接配置" }; result.append(buffer, 0, size) }
        result.toString()
      } ?: "{}"
      requireCurrent()
      val json = JSONObject(body)
      if (code !in 200..299 || !json.optBoolean("success")) {
        val error = json.opt("error")
        throw IllegalStateException(if (error is JSONObject) error.optString("message", "请求失败 ($code)") else error as? String ?: "请求失败 ($code)")
      }
      return json.getJSONObject("data")
    } finally { http.disconnect(); synchronized(lock) { if (connection === http) connection = null } }
  }
}
