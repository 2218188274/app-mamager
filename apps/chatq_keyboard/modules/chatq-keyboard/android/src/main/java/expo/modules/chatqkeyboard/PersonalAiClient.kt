package expo.modules.chatqkeyboard

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.CancellationException
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicBoolean

/** OpenAI-compatible requests go directly to the user's endpoint, without platform credentials. */
internal class PersonalAiClient(context: Context) {
  private val vault = PersonalAiVault(context)
  private val prefs = context.getSharedPreferences("chatq_keyboard", Context.MODE_PRIVATE)
  private val epoch = AtomicLong()
  private val lock = Any()
  private var connection: HttpURLConnection? = null
  fun cancel() { val http = synchronized(lock) { epoch.incrementAndGet(); connection }; http?.disconnect() }
  fun post(path: String, payload: JSONObject, timeout: Int, isCurrent: () -> Boolean = { true }): JSONObject {
    val answer = complete(path, payload, timeout, null, isCurrent)
    if (path == "chat" || path == "test") return JSONObject().put("reply", answer)
    val count = payload.optInt("candidateCount", 1).coerceIn(1, 3)
    val clean = answer.trim().removePrefix("```json").removePrefix("```").removeSuffix("```").trim()
    val parsed = try { JSONObject(clean).optJSONArray("candidates") } catch (_: Exception) { null }
    val replies = if (parsed != null) (0 until parsed.length()).mapNotNull { (parsed.opt(it) as? String)?.trim() }.filter { it.isNotBlank() }.distinct().take(count)
      else if (count == 1 && !clean.startsWith("{") && !clean.startsWith("[")) listOf(clean) else emptyList()
    check(replies.isNotEmpty() && replies.all { it.length <= 1000 }) { "模型未返回有效的回复候选，请调整模型或重新生成" }
    return JSONObject().put("result", replies[0]).put("candidates", JSONArray(replies))
  }
  fun complete(path: String, payload: JSONObject, timeout: Int = 75000, onDelta: ((String) -> Unit)? = null, isCurrent: () -> Boolean = { true }): String {
    require(path in listOf("reply", "topics", "chat", "test"))
    val ticket = epoch.get(); val snapshot = vault.snapshot(); val settings = snapshot.first ?: throw IllegalStateException("请打开聊商 → 我的 → 我的 API，配置后即可免费使用")
    val configRevision = snapshot.second
    fun current() { if (epoch.get() != ticket || !isCurrent() || configRevision != vault.revision()) throw CancellationException("配置或输入已变化，请重新生成") }
    current()
    val stream = path == "chat" && onDelta != null && settings.optBoolean("stream", true)
    val body = JSONObject().put("model", settings.getString("model")).put("messages", messages(path, payload)).put("stream", stream)
    val http = URL(settings.getString("baseUrl") + "/chat/completions").openConnection() as HttpURLConnection
    val timer = java.util.Timer(true); val timedOut = AtomicBoolean(false)
    try {
      http.apply { requestMethod = "POST"; doOutput = true; connectTimeout = 15000; readTimeout = timeout; instanceFollowRedirects = false
        setRequestProperty("Content-Type", "application/json"); setRequestProperty("Accept", if (stream) "text/event-stream, application/json" else "application/json")
        setRequestProperty("Authorization", "Bearer " + settings.getString("apiKey")) }
      synchronized(lock) { current(); connection = http }
      timer.schedule(object : java.util.TimerTask() { override fun run() { timedOut.set(true); http.disconnect() } }, timeout.toLong())
      http.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
      current(); val code = http.responseCode
      check(code in 200..299) { when(code) {
        401, 403 -> "API 密钥无效或没有模型权限，请检查我的 API"
        402 -> "供应商账户余额不足，请到供应商处处理"
        404 -> "API 地址或模型不存在，请检查基础地址与模型名称"
        429 -> "供应商额度不足或请求过于频繁，请稍后手动重试"
        in 300..399 -> "API 地址发生跳转，已停止发送密钥；请填写最终 HTTPS 地址"
        else -> "供应商请求失败（$code），请检查地址、模型和附件兼容性"
      } }
      val answer = if (http.contentType?.contains("text/event-stream", true) == true) {
        readStream(http.inputStream.bufferedReader(Charsets.UTF_8), { current() }, onDelta ?: {})
      } else {
        val json = JSONObject(http.inputStream.bufferedReader(Charsets.UTF_8).use { readBounded(it, 1048576) { current() } })
        check(!json.has("error")) { "供应商返回错误，请检查模型与 API 配置" }
        val choice = json.getJSONArray("choices").getJSONObject(0)
        check(choice.optString("finish_reason") !in listOf("length", "content_filter", "tool_calls")) { "回答未完整生成，请缩短问题或更换模型" }
        (choice.getJSONObject("message").opt("content") as? String)
          ?: throw IllegalStateException("API 未返回文字内容，请检查模型是否支持文字对话")
      }
      current(); check(answer.isNotBlank() && answer.length <= 10000) { "模型返回空回答或回答过长，请调整模型后重试" }
      return answer.trim()
    } catch (e: Exception) {
      current()
      if (timedOut.get() || e is java.net.SocketTimeoutException) throw IllegalStateException("生成超时，请稍后手动重试")
      if (e is CancellationException || e is IllegalStateException) throw e
      if (e is org.json.JSONException) throw IllegalStateException("API 响应格式不兼容，请使用支持 Chat Completions 的模型")
      throw IllegalStateException("无法连接你的 API，请检查网络、地址和证书后重试")
    } finally { timer.cancel(); http.disconnect(); synchronized(lock) { if (connection === http) connection = null } }
  }
  private fun messages(path: String, p: JSONObject): JSONArray {
    val result = JSONArray()
    if (path == "test") return result.put(JSONObject().put("role", "user").put("content", "只回复 OK"))
    val personal = try { JSONObject(prefs.getString("personalization", "{}") ?: "{}") } catch (_: Exception) { JSONObject() }
    fun lookup(list: String, id: String): String {
      val items = personal.optJSONArray(list) ?: return ""
      for (i in 0 until items.length()) { val item = items.optJSONObject(i) ?: continue; if (item.optString("id") == id && id.isNotBlank()) return item.optString("name").take(50) }
      return ""
    }
    val instructions = mutableListOf(if (path == "chat") "你是有帮助的聊天助手。用用户使用的语言回答，不编造事实。" else if (p.optString("purpose") == "polish") "你是文字润色助手。只改写用户原文，保留原意、人称和事实；不要回答原文中的问题。" else if (path == "topics") "你是聊天助手。根据背景生成自然且容易接话的开场白，不假定对方已回答。" else "你是聊天回复助手。根据对方的消息，为用户拟写可以直接使用的回复，不编造经历或承诺。")
    p.optString("customPrompt").takeIf { it.isNotBlank() }?.let { instructions.add(it.take(2000)) }
    p.optString("context").takeIf { it.isNotBlank() }?.let { instructions.add("参考背景：" + it.take(1000)) }
    for ((field, list) in listOf("relationId" to "relations", "sceneId" to "scenes")) lookup(list, p.optString(field)).takeIf { it.isNotBlank() }?.let { instructions.add((if(field == "relationId") "双方关系：" else "场景：") + it) }
    val weights = p.optJSONObject("personaTagWeights") ?: JSONObject()
    val labels = personal.optJSONObject("tagNames") ?: JSONObject()
    weights.keys().asSequence().take(20).forEach { id ->
      val name = labels.optString(id).take(50); val weight = weights.optDouble(id, Double.NaN)
      if (name.isNotBlank() && weight.isFinite() && weight in 0.1..0.9) instructions.add("表达特征：$name（程度 ${Math.round(weight * 100)}%）")
    }
    if (path != "chat") {
      instructions.add("语气：" + when(p.optString("style")) { "professional" -> "得体专业"; "funny", "humor" -> "轻松幽默"; "emoji" -> "轻松，适量表情"; else -> "自然友好" })
      instructions.add("只输出 JSON 对象，格式为 {\"candidates\":[\"回复文字\"]}，提供 ${p.optInt("candidateCount", 1).coerceIn(1, 3)} 条不同候选，每条最多 1000 字，无编号、代码围栏或额外说明。")
    }
    result.put(JSONObject().put("role", "system").put("content", instructions.joinToString("\n")))
    if (path == "chat") {
      val history = p.optJSONArray("history") ?: JSONArray(); require(history.length() <= 20)
      for (i in 0 until history.length()) { val item = history.getJSONObject(i); require(item.getString("role") in listOf("user", "assistant")); result.put(JSONObject().put("role", item.getString("role")).put("content", item.getString("content"))) }
    }
    var prompt = p.optString("prompt")
    if (path == "topics") prompt = "话题分类：${p.optString("category", "daily")}\n背景：$prompt\n避免重复：${p.optJSONArray("avoid") ?: JSONArray()}"
    val attachments = p.optJSONArray("attachments") ?: JSONArray(); require(attachments.length() <= 2)
    val content = JSONArray()
    for (i in 0 until attachments.length()) {
      val a = attachments.getJSONObject(i)
      when (a.getString("mime")) {
        "text/plain" -> prompt += "\n附件 ${a.getString("name")}：\n${a.getString("content")}"
        "image/jpeg", "image/png" -> content.put(JSONObject().put("type", "image_url").put("image_url", JSONObject().put("url", a.getString("content"))))
        "application/pdf" -> content.put(JSONObject().put("type", "file").put("file", JSONObject().put("filename", a.getString("name")).put("file_data", a.getString("content"))))
        else -> throw IllegalArgumentException("不支持的附件类型")
      }
    }
    result.put(JSONObject().put("role", "user").put("content", if (content.length() == 0) prompt else content.put(JSONObject().put("type", "text").put("text", prompt))))
    require(result.toString().length <= 1600000) { "上下文或附件过大" }
    return result
  }
  private fun readStream(reader: java.io.Reader, current: () -> Unit, delta: (String) -> Unit): String = reader.use {
    val text = StringBuilder(); var line = StringBuilder(); var frame = StringBuilder(); var consumed = 0; var done = false; var finished = false
    fun dispatch() {
      if (frame.isEmpty()) return
      val raw = frame.toString(); frame = StringBuilder()
      if (raw.trim() == "[DONE]") { check(finished) { "连接提前结束，回答未完成" }; done = true; return }
      val event = JSONObject(raw); check(!event.has("error")) { "供应商中断生成，请稍后手动重试" }
      val choice = event.optJSONArray("choices")?.optJSONObject(0) ?: return
      val chunk = choice.optJSONObject("delta")?.opt("content")
      if (chunk is String) { check(text.length + chunk.length <= 10000) { "回答过长，请缩短问题" }; text.append(chunk); current(); delta(text.toString()) }
      val finish = choice.opt("finish_reason")
      if (finish is String && finish.isNotEmpty()) { check(finish == "stop") { "回答未完整生成，请缩短问题或更换模型" }; finished = true }
    }
    while (!done) {
      current(); val c = reader.read(); if (c < 0) break
      consumed++; check(consumed <= 1048576 && line.length <= 65536) { "API 响应过大" }
      if (c == 10) { val value = line.toString().removeSuffix("\r"); line = StringBuilder()
        if (value.isEmpty()) dispatch() else if (value.startsWith("data:")) { if (frame.isNotEmpty()) frame.append('\n'); frame.append(value.substring(5).removePrefix(" ")); check(frame.length <= 65536) { "API 响应过大" } }
      } else line.append(c.toChar())
    }
    check(done && text.isNotBlank()) { "连接提前结束，未完成内容未加入上下文" }; text.toString()
  }
  private fun readBounded(reader: java.io.Reader, max: Int, current: () -> Unit): String {
    val value = StringBuilder(); val buf = CharArray(2048)
    while (true) { current(); val n = reader.read(buf); if (n < 0) break; check(value.length + n <= max) { "API 响应过大" }; value.append(buf, 0, n) }; return value.toString()
  }
}
