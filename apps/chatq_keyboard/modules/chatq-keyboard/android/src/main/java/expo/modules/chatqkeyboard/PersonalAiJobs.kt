package expo.modules.chatqkeyboard

import android.content.Context
import org.json.JSONObject
import java.util.concurrent.CancellationException

internal class PersonalAiJobs(private val context: Context) {
  private class Job(val id: String, val client: PersonalAiClient) { var text = ""; var result = ""; var status = "running"; var error = "" }
  private val lock = Any()
  private var job: Job? = null
  private val cancelled = linkedSetOf<String>()
  fun start(id: String, path: String, payload: String) {
    require(id.matches(Regex("[a-zA-Z0-9_-]{16,80}")) && payload.length <= 1600000)
    val body = JSONObject(payload); val next = Job(id, PersonalAiClient(context))
    synchronized(lock) { check(job?.status != "running") { "已有 AI 请求正在生成" }; if (cancelled.remove(id)) throw CancellationException(); job = next }
    Thread({
      fun current() = synchronized(lock) { job === next && next.status == "running" }
      try {
        val result = if (path == "chat") JSONObject().put("reply", next.client.complete(path, body, 75000, { text -> synchronized(lock) { if (current()) next.text = text } }, { current() })) else next.client.post(path, body, if (path == "test") 20000 else 75000) { current() }
        synchronized(lock) { if (current()) { next.result = result.toString(); next.status = "done" } }
      } catch (e: Exception) { synchronized(lock) { if (current()) { next.status = if (e is CancellationException) "cancelled" else "error"; next.error = if (e is IllegalStateException || e is IllegalArgumentException) e.message ?: "AI 请求失败" else "AI 请求失败，请检查配置后重试" } } }
    }, "chatq-personal-ai").start()
  }
  fun read(id: String): String = synchronized(lock) {
    val current = job; check(current?.id == id) { "本次 AI 请求已结束" }
    JSONObject().put("status", current!!.status).put("text", current.text).put("result", current.result).put("error", current.error).toString()
  }
  fun cancel(id: String) {
    val client = synchronized(lock) { cancelled.add(id); while (cancelled.size > 32) cancelled.remove(cancelled.first()); job?.takeIf { it.id == id }?.let { it.status = "cancelled"; it.client } }
    client?.cancel()
  }
  fun release(id: String) { cancel(id); synchronized(lock) { if (job?.id == id) job = null } }
  fun destroy() { synchronized(lock) { job?.id }?.let { release(it) } }
}
