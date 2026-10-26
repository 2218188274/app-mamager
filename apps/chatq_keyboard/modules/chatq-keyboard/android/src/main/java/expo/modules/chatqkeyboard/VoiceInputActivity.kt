package expo.modules.chatqkeyboard

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.view.Gravity
import android.view.WindowManager
import android.widget.*
import org.json.JSONObject
import java.util.concurrent.Executors

class VoiceInputActivity : Activity() {
  private val main = Handler(Looper.getMainLooper())
  private val worker = Executors.newSingleThreadExecutor()
  private lateinit var token: String
  private lateinit var message: TextView
  private lateinit var action: Button
  private lateinit var language: Switch
  private var recorder: VoiceRecorder? = null
  private var recording = false
  private var working = false
  private var audio: ByteArray? = null
  private var transcript = ""
  private var returning = false
  private var started = 0L
  private var api: InputApi? = null
  private var expired = false
  private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
  private fun styledButton(label: String, primary: Boolean, click: () -> Unit) = Button(this).apply {
    text = label; textSize = 16f; isAllCaps = false; minHeight = dp(52); setPadding(dp(16), dp(10), dp(16), dp(10))
    setTextColor(if (primary) 0xffffffff.toInt() else 0xff6246be.toInt())
    backgroundTintList = ColorStateList.valueOf(if (primary) 0xff6246be.toInt() else 0xffefeafc.toInt())
    setOnClickListener { click() }
  }
  private val expiry = object : Runnable { override fun run() { if (!isFinishing) { if (!VoiceSession.valid(token)) expire() else main.postDelayed(this, 1000) } } }
  private val tick = object : Runnable { override fun run() { if (recording) { message.text = "正在录音 ${(android.os.SystemClock.elapsedRealtime() - started) / 1000} / 20 秒\n说完请点结束录音"; main.postDelayed(this, 500) } } }
  override fun onCreate(state: Bundle?) {
    super.onCreate(state)
    token = intent.getStringExtra("session") ?: ""
    if (state != null || !VoiceSession.valid(token)) { finish(); return }
    window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
    window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN)
    val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(24), dp(24), dp(24), dp(20)); setBackgroundColor(0xfff7f8fc.toInt()); gravity = Gravity.CENTER_VERTICAL }
    root.addView(TextView(this).apply { text = "语音输入"; textSize = 27f; typeface = Typeface.DEFAULT_BOLD; setTextColor(0xff20253d.toInt()) })
    root.addView(TextView(this).apply { text = "点击开始后才录音，最长 20 秒。识别后先预览，再由你填入聊天框。"; textSize = 14f; setTextColor(0xff58627a.toInt()); setPadding(0, dp(12), 0, dp(12)) })
    language = Switch(this).apply { text = "英文识别（关闭为中文）"; textSize = 14f; minHeight = dp(48); setTextColor(0xff20253d.toInt()); isChecked = intent.getBooleanExtra("english", false) }; root.addView(language)
    message = TextView(this).apply { text = "准备就绪"; textSize = 19f; setTextColor(0xff20253d.toInt()); setPadding(dp(16), dp(18), dp(16), dp(18)) }
    root.addView(ScrollView(this).apply { addView(message); background = GradientDrawable().apply { setColor(0xffffffff.toInt()); cornerRadius = dp(18).toFloat() } }, LinearLayout.LayoutParams(-1, 0, 1f).apply { topMargin = dp(12); bottomMargin = dp(16) })
    action = styledButton("开始录音", true) { when { transcript.isNotEmpty() -> returnResult(); recording -> stop(); audio != null -> recognize(); else -> begin() } }; root.addView(action, LinearLayout.LayoutParams(-1, -2))
    root.addView(styledButton("取消并返回", false) { VoiceSession.cancel(token); finish() }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8) })
    root.addView(TextView(this).apply { text = "仅在点击识别后，将本次录音发送至服务器。"; textSize = 12f; setTextColor(0xff646d83.toInt()); setPadding(0, dp(10), 0, 0) })
    setContentView(root)
    main.postDelayed(expiry, 1000)
  }
  private fun expire() {
    if (expired) return
    expired = true; recording = false; working = false; main.removeCallbacks(tick)
    recorder?.cancel(); recorder = null; api?.cancel(); audio = null; transcript = ""
    window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    message.text = "语音会话已超时，请返回键盘重新开始。"
    action.text = "返回键盘"; action.isEnabled = true; action.setOnClickListener { finish() }
    language.isEnabled = false
  }
  private fun begin() {
    if (!VoiceSession.valid(token)) { expire(); return }
    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) { requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 41); return }
    try {
      recorder = VoiceRecorder(this)
      recorder!!.start { if (recording) stop() }
      recording = true; started = android.os.SystemClock.elapsedRealtime(); language.isEnabled = false; action.text = "结束录音"; main.post(tick)
      window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    } catch (error: Exception) { recorder?.cancel(); recorder = null; message.text = error.message ?: "无法启动录音" }
  }
  private fun stop() {
    recording = false; main.removeCallbacks(tick); window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    try { audio = recorder?.stop(); message.text = "录音已结束。点击识别后发送至服务器。"; action.text = "识别录音" }
    catch (error: Exception) { audio = null; message.text = error.message; action.text = "重新录音"; language.isEnabled = true }
    finally { recorder = null }
  }
  private fun recognize() {
    val recordingBytes = audio ?: return
    if (!VoiceSession.valid(token)) { expire(); return }
    if (working) return
    working = true; action.isEnabled = false; message.text = "正在识别，请稍候…"
    val client = InputApi(getSharedPreferences("chatq_keyboard", Context.MODE_PRIVATE)) { AccountVault(this).authorization() }; api = client
    val selectedLanguage = if (language.isChecked) "en" else "zh"
    worker.execute {
      try {
        val text = client.post("transcribe", JSONObject().put("audio", Base64.encodeToString(recordingBytes, Base64.NO_WRAP)).put("language", selectedLanguage), 95000).getString("text").trim()
        check(text.isNotEmpty()) { "没有识别到语音，请重新录音" }
        main.post { if (!isFinishing && !expired) { if (!VoiceSession.valid(token)) expire() else { transcript = text; message.text = text; action.text = "返回键盘预览"; action.isEnabled = true; working = false; audio = null } } }
      } catch (error: Exception) { main.post { if (!isFinishing && !expired) { if (!VoiceSession.valid(token)) expire() else { message.text = if (error is IllegalStateException) error.message else "识别连接失败或超时，请手动重试"; action.text = "重试识别"; action.isEnabled = true; working = false } } } }
    }
  }
  private fun returnResult() { returning = VoiceSession.complete(token, transcript); if (returning) finish() else expire() }
  override fun onRequestPermissionsResult(code: Int, permissions: Array<out String>, results: IntArray) {
    super.onRequestPermissionsResult(code, permissions, results)
    if (code == 41) { if (results.firstOrNull() == PackageManager.PERMISSION_GRANTED) begin() else message.text = "麦克风权限未开启。请在系统应用权限中允许后再试。" }
  }
  override fun onPause() { if (recording) stop(); super.onPause() }
  override fun onStop() { super.onStop(); if (!returning) { VoiceSession.cancel(token); api?.cancel(); if (!isFinishing) finish() } }
  override fun onDestroy() { main.removeCallbacksAndMessages(null); recorder?.cancel(); api?.cancel(); worker.shutdownNow(); audio = null; if (!returning) VoiceSession.cancel(token); super.onDestroy() }
}
