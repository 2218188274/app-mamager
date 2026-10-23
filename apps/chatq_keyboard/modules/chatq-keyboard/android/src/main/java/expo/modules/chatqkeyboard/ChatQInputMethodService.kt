package expo.modules.chatqkeyboard

import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.icu.text.BreakIterator
import android.inputmethodservice.InputMethodService
import android.media.AudioManager
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.text.InputType
import android.view.*
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.*
import org.json.JSONObject
import org.json.JSONArray
import java.util.concurrent.Executors
import kotlin.math.abs

class ChatQInputMethodService : InputMethodService() {
  private val worker = Executors.newSingleThreadExecutor()
  private val main = Handler(Looper.getMainLooper())
  private val prefs get() = getSharedPreferences("chatq_keyboard", Context.MODE_PRIVATE)
  private val typing by lazy { TypingPreferences(prefs) }
  private val lexicon by lazy { UserLexicon(prefs) }
  private val nine by lazy { NineKeyEngine(this) }
  private val dictionary by lazy { ChineseDictionary.get(this) }
  private val english by lazy { EnglishEngine(this, prefs) }
  private val cloudWorker = Executors.newSingleThreadExecutor()
  private val cloudApi by lazy { InputApi(prefs) }
  private val replyApi by lazy { InputApi(prefs) }
  @Volatile private var cloudRevision = 0
  private var cloudTask: Runnable? = null
  private val cloudCache = object : LinkedHashMap<String, List<PinyinEngine.Candidate>>(100, 0.75f, true) {
    override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, List<PinyinEngine.Candidate>>?) = size > 100
  }
  private var cloudWords = emptyList<PinyinEngine.Candidate>()
  private var cloudCode = ""
  private var cloudConfiguration: List<String?>? = null
  private var pronunciation = ""
  private var voiceText = ""
  private data class Correction(val original: String, val replacement: String)
  private var correction: Correction? = null
  private var correctionEnd = -1
  private var options = JSONObject()
  @Volatile private var revision = 0
  private var busy = false
  private var sensitive = false
  private var directOnly = false
  private var numericField = false
  private var noLearning = false
  private var prompt = ""
  private data class PolishTarget(val text: String, val selectionStart: Int, val selectionEnd: Int, val start: Int, val end: Int)
  private data class AIDraft(val prompt: String, val target: PolishTarget?)
  private val aiDrafts = mutableMapOf<String, AIDraft>()
  private var polishTarget: PolishTarget? = null
  private var aiReplies = emptyList<String>()
  private lateinit var polishModeButton: Button
  private lateinit var pasteButton: Button
  private var tone = "friendly"
  private var count = 1
  private val topicLibrary by lazy { TopicLibrary(this) }
  private var aiMode = "reply"
  private val generations by lazy { GenerationStore(this) }
  private var topicCategory = "daily"
  private var topicPage = 0
  private var topicAI = emptyList<String>()
  private lateinit var replyControls: LinearLayout
  private lateinit var topicControls: LinearLayout
  private lateinit var replyModeButton: Button
  private lateinit var topicModeButton: Button
  private lateinit var topicGenerate: Button
  private lateinit var resultScroll: ScrollView
  private var chinese = true
  private var shift = 0 // 0 lower case, 1 next letter, 2 caps lock
  private var lastShift = 0L
  private var page = "letters"
  private var symbolPage = 0
  private var emojiPage = 0
  private var selecting = false
  private var expanded = false
  private var spelling = ""
  private var words = emptyList<PinyinEngine.Candidate>()
  private var predictions = emptyList<String>()
  private var selectionContext = ""
  private var predictionEnd = -1
  private var stripCode: String? = null
  private val nativeCache = object : LinkedHashMap<String, List<PinyinEngine.Candidate>>(96, .75f, true) {
    override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, List<PinyinEngine.Candidate>>?) = size > 96
  }
  private var engine: PinyinEngine? = null
  private var deleteRepeat: Runnable? = null
  private lateinit var spellingView: TextView
  private lateinit var wordBar: LinearLayout
  private lateinit var wordScroll: HorizontalScrollView
  private lateinit var expandButton: Button
  private lateinit var writing: LinearLayout
  private lateinit var aiPanel: LinearLayout
  private lateinit var keyboardRoot: LinearLayout
  private lateinit var aiToggle: Button
  private lateinit var settingsToggle: Button
  private lateinit var personaRow: LinearLayout
  private lateinit var status: TextView
  private lateinit var source: TextView
  private lateinit var results: LinearLayout
  private lateinit var generate: Button
  private lateinit var pad: LinearLayout
  private val landscape get() = resources.configuration.orientation == Configuration.ORIENTATION_LANDSCAPE
  private val dark get() = options.optString("theme") == "dark" || (options.optString("theme", "system") == "system" && resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES)
  private val purple get() = Color.rgb(98, 70, 190)
  private val accent get() = if (dark) Color.rgb(193, 176, 255) else purple
  private val ink get() = if (dark) Color.rgb(237, 239, 247) else Color.rgb(42, 48, 68)
  private val muted get() = if (dark) Color.rgb(180, 186, 205) else Color.rgb(90, 100, 122)
  private val keyHeight get() = if (landscape) 32 else when (options.optString("height")) { "compact" -> 42; "large" -> 54; else -> 48 }
  private fun dp(n: Int) = (n * resources.displayMetrics.density).toInt()
  private fun row() = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
  private fun column() = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
  private fun label(text: String) = TextView(this).apply { this.text = text; setTextColor(ink); textSize = 13f; setPadding(dp(7), dp(2), dp(7), dp(2)) }
  private fun background(active: Boolean = false): StateListDrawable {
    fun shape(color: Int) = GradientDrawable().apply { setColor(color); cornerRadius = dp(8).toFloat(); if (!active) setStroke(dp(1), if (dark) Color.rgb(68, 73, 92) else Color.rgb(228, 230, 239)) }
    return StateListDrawable().apply {
      addState(intArrayOf(-android.R.attr.state_enabled), shape(if (dark) Color.rgb(49, 52, 65) else Color.rgb(223, 224, 234)))
      addState(intArrayOf(android.R.attr.state_pressed), shape(if (dark) Color.rgb(87, 78, 137) else Color.rgb(216, 208, 252)))
      addState(intArrayOf(), shape(if (active) purple else if (dark) Color.rgb(53, 58, 74) else Color.WHITE))
    }
  }
  private fun feedback(view: View) {
    if (options.optBoolean("haptic", true)) view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
    if (options.optBoolean("sound") && Settings.System.getInt(contentResolver, Settings.System.SOUND_EFFECTS_ENABLED, 0) == 1) (getSystemService(Context.AUDIO_SERVICE) as AudioManager).playSoundEffect(AudioManager.FX_KEY_CLICK)
  }
  private fun button(text: String, font: Float = if (text.length == 1) 20f else 12f, action: () -> Unit): KeyboardKey = KeyboardKey(this).apply {
    this.text = text; textSize = font; isAllCaps = false; minWidth = 0; minimumWidth = 0; minHeight = dp(if (landscape) 32 else 48); minimumHeight = minHeight
    gravity = Gravity.CENTER; background = background(); setTextColor(ink); setPadding(dp(2), 0, dp(2), 0)
    isSoundEffectsEnabled = false
    setOnClickListener { feedback(this); action() }
    if (text == "⌫") {
      contentDescription = "删除"
      setOnLongClickListener {
        stopDeleteRepeat(); feedback(this)
        deleteRepeat = object : Runnable { override fun run() { if (isPressed && isShown) { action(); main.postDelayed(this, 55) } } }
        deleteRepeat?.run(); true
      }
      setOnTouchListener { _, event -> if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_CANCEL) stopDeleteRepeat(); false }
    }
  }
  private fun LinearLayout.addKey(text: String, weight: Float = 1f, height: Int = keyHeight, active: Boolean = false, action: () -> Unit): KeyboardKey {
    val view = button(text, action = action)
    if (active) { view.background = background(true); view.setTextColor(Color.WHITE) }
    addView(view, LinearLayout.LayoutParams(0, dp(height), weight).apply { setMargins(dp(1), dp(2), dp(1), dp(2)) }); return view
  }
  override fun onCreate() {
    super.onCreate()
    worker.execute { try { ChineseDictionary.get(applicationContext) } catch (_: Exception) { /* Native Pinyin remains available. */ } }
  }
  override fun onCreateInputView(): View {
    stopDeleteRepeat(); options = typing.snapshot()
    if (engine == null) engine = try { PinyinEngine(this) } catch (_: Exception) { null }
    val root = column().apply { setPadding(dp(5), dp(4), dp(5), dp(bottomSpace())); setBackgroundColor(if (dark) Color.rgb(29, 33, 45) else Color.rgb(239, 240, 247)) }
    keyboardRoot = root
    root.setOnApplyWindowInsetsListener { view, insets ->
      // IME windows may already sit above navigation. Only add the actual overlap.
      view.post { if (keyboardRoot === view) applyBottomInset() }
      insets
    }
    root.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> applyBottomInset() }
    val tools = row()
    aiToggle = tools.addKey("AI 助手", height = if (landscape) 32 else 48) { if (aiPanel.visibility == View.VISIBLE || !isTypingPage() || expanded) returnToTyping() else showAI(true) }.apply { contentDescription = "AI 回复与话题库"; setTextColor(accent); typeface = Typeface.DEFAULT_BOLD }
    tools.addKey("表情", height = if (landscape) 32 else 48) { switchPage("emoji") }
    tools.addKey("语音", height = if (landscape) 32 else 48) { launchVoice() }
    settingsToggle = tools.addKey("更多", height = if (landscape) 32 else 48) { if (aiPanel.visibility == View.VISIBLE) showAIMenu(settingsToggle) else switchPage(if (page == "settings") "letters" else "settings") }
    root.addView(tools)
    aiPanel = column().apply { visibility = View.GONE }
    root.addView(aiPanel, LinearLayout.LayoutParams(-1, dp(if (landscape) 176 else (resources.configuration.screenHeightDp * .50f).toInt().coerceIn(280, 360))))
    createAI()
    writing = column(); root.addView(writing)
    spellingView = label("").apply { maxLines = 1; setTextColor(muted); textSize = 12f }
    writing.addView(spellingView, LinearLayout.LayoutParams(-1, dp(if (landscape) 20 else 24)))
    stripCode = null; wordBar = row().apply { contentDescription = "候选词栏" }; wordScroll = HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; addView(wordBar) }
    val candidateRow = row(); candidateRow.addView(wordScroll, LinearLayout.LayoutParams(0, dp(if (landscape) 32 else 48), 1f))
    expandButton = button("▾") { if (words.isNotEmpty() || predictions.isNotEmpty()) { expanded = !expanded; drawPad(); renderSpelling() } }.apply { contentDescription = "展开候选词" }
    candidateRow.addView(expandButton, LinearLayout.LayoutParams(dp(48), -1)); writing.addView(candidateRow)
    pad = column(); writing.addView(pad); drawPad(); renderSpelling(); renderPrompt()
    return root
  }
  private fun showAI(show: Boolean) {
    if (!::writing.isInitialized) return
    if (show) { commitPending(); clearPredictions(); renderSpelling() }
    if (!show && aiPanel.visibility == View.VISIBLE) { val wasBusy = busy; invalidateRequest(); if (wasBusy) status.text = "已停止，原文保留，可重新生成" }
    aiPanel.visibility = if (show) View.VISIBLE else View.GONE; writing.visibility = if (show) View.GONE else View.VISIBLE
    renderToolbar()
    if (show) { if (aiMode == "topic") renderTopics() else renderReplies() }
    renderPrompt()
  }
  private fun renderToolbar() {
    val ai = ::aiPanel.isInitialized && aiPanel.visibility == View.VISIBLE
    val back = ai || !isTypingPage() || expanded
    aiToggle.text = if (back) "返回打字" else "AI 助手"
    aiToggle.contentDescription = if (back) "返回打字" else "AI 回复与话题库"
    settingsToggle.text = if (ai) "偏好" else if (page == "settings") "返回打字" else "更多"
    settingsToggle.contentDescription = if (ai) "偏好与记录" else settingsToggle.text
  }
  private fun isTypingPage() = page == "letters" || numericField && page == "numbers"
  private fun returnToTyping() {
    if (expanded && aiPanel.visibility != View.VISIBLE) { expanded = false; drawPad(); renderSpelling() }
    else switchPage("letters")
  }
  private fun canReturnToTyping() = isInputViewShown && (::aiPanel.isInitialized && aiPanel.visibility == View.VISIBLE || !isTypingPage() || expanded)
  override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
    if (keyCode == KeyEvent.KEYCODE_BACK && canReturnToTyping()) { event.startTracking(); return true }
    return super.onKeyDown(keyCode, event)
  }
  override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean {
    if (keyCode == KeyEvent.KEYCODE_BACK && canReturnToTyping() && !event.isCanceled) { returnToTyping(); return true }
    return super.onKeyUp(keyCode, event)
  }
  private fun switchPage(next: String) { commitPending(); clearPredictions(); expanded = false; selecting = false; page = if (next == "letters" && numericField) "numbers" else next; showAI(false); drawPad(); renderSpelling() }
  private fun rebuild() { invalidateRequest(); setInputView(onCreateInputView()) }
  private fun drawPad() {
    if (!::pad.isInitialized) return
    renderToolbar()
    stopDeleteRepeat(); pad.removeAllViews()
    if (expanded && (words.isNotEmpty() || predictions.isNotEmpty())) { drawCandidates(); return }
    when (page) { "numbers" -> drawNumbers(); "symbols" -> drawSymbols(); "emoji" -> drawEmoji(); "edit" -> drawEditor(); "settings" -> drawSettings(); "voice" -> drawVoice(); else -> if (useNine()) drawNine() else drawLetters() }
  }
  private fun useNine() = chinese && !directOnly && options.optString("layout") == "nine"
  private fun drawNine() {
    val lines = listOf(listOf("1 标点", "2 ABC", "3 DEF", "⌫"), listOf("4 GHI", "5 JKL", "6 MNO", "选音"), listOf("7 PQRS", "8 TUV", "9 WXYZ", "123"))
    lines.forEach { line -> pad.addView(row().apply { line.forEach { item -> addKey(item) {
      when (item) { "⌫" -> backspace(); "选音" -> selectPronunciation(); "123" -> switchPage("numbers"); "1 标点" -> switchPage("symbols"); else -> type(item.take(1)) }
    }.apply { if (item.first() in '2'..'9') { textSize = 17f; maxLines = 1; text = android.text.SpannableString(item).apply { setSpan(android.text.style.RelativeSizeSpan(.65f), 2, length, 0) }; contentDescription = "九宫格 $item" } } } }) }
    pad.addView(row().apply {
      addKey("中/英", 1.1f) { toggleLanguage() }; addKey("，", 0.9f) { type("，") }
      val spaceKey = addKey("空格", 3f) { space() }; spaceGesture(spaceKey)
      addKey("。", 0.9f) { type("。") }; addKey(enterLabel(), 1.5f, active = true) { enter() }
    })
  }
  private fun selectPronunciation() {
    if (spelling.isEmpty()) { toast("先输入九宫格拼音，再筛选读音"); return }
    val choices = nine.decode(spelling).distinctBy { it.pinyin }.take(40)
    val popup = PopupMenu(this, spellingView)
    popup.menu.add("全部读音").setOnMenuItemClickListener { pronunciation = ""; words = decode(spelling); renderSpelling(); true }
    choices.forEach { item -> popup.menu.add(item.reading.ifEmpty { item.pinyin }).setOnMenuItemClickListener { pronunciation = item.pinyin; words = decode(spelling); renderSpelling(); true } }
    popup.show()
  }
  private fun launchVoice() {
    if (sensitive || noLearning || directOnly) { toast("此输入框不启用语音输入"); return }
    val info = currentInputEditorInfo ?: return
    commitPending(); clearPredictions(); correction = null; voiceText = ""
    val token = VoiceSession.begin(info)
    try { startActivity(Intent(this, VoiceInputActivity::class.java).putExtra("session", token).putExtra("english", !chinese).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
    catch (_: Exception) { VoiceSession.cancel(token); toast("无法打开录音，请从聊商 App 检查权限") }
  }
  private fun drawVoice() {
    pad.addView(ScrollView(this).apply { addView(label(voiceText).apply { textSize = 19f; setPadding(dp(10), dp(10), dp(10), dp(10)) }) }, LinearLayout.LayoutParams(-1, dp((keyHeight + 4) * 3)))
    pad.addView(row().apply {
      addKey("取消") { voiceText = ""; switchPage("letters") }
      addKey("填入文字", active = true) { if (!sensitive && !noLearning && voiceText.isNotEmpty()) { currentInputConnection?.commitText(voiceText, 1); voiceText = "" }; switchPage("letters") }
    })
  }
  private fun drawLetters() {
    if (options.optBoolean("numberRow") && !landscape) pad.addView(row().apply { "1234567890".forEach { char -> addKey(char.toString(), height = 34) { type(char.toString()) } } })
    val first = row()
    "qwertyuiop".forEachIndexed { i, char ->
      first.addKey(if (shift > 0 && !chinese) char.uppercase() else char.toString()) { typeLetter(char) }.apply {
        hintText = "1234567890"[i].toString(); hintColor = muted
        setOnLongClickListener { feedback(this); type("1234567890"[i].toString()); true }
      }
    }; pad.addView(first)
    pad.addView(row().apply {
      addView(View(this@ChatQInputMethodService), LinearLayout.LayoutParams(0, 1, 0.5f))
      "asdfghjkl".forEach { char -> addKey(if (shift > 0 && !chinese) char.uppercase() else char.toString()) { typeLetter(char) } }
      addView(View(this@ChatQInputMethodService), LinearLayout.LayoutParams(0, 1, 0.5f))
    })
    pad.addView(row().apply {
      addKey(if (chinese) "分词" else if (shift == 2) "⇧锁定" else "⇧", 1.35f, active = !chinese && shift > 0) {
        if (chinese) type("'") else {
          val now = SystemClock.uptimeMillis(); shift = if (shift == 2) 0 else if (shift == 1 && now - lastShift < 400) 2 else if (shift == 1) 0 else 1
          lastShift = now; drawPad()
        }
      }.contentDescription = if (chinese) "拼音分词" else "英文大写切换"
      "zxcvbnm".forEach { char -> addKey(if (shift > 0 && !chinese) char.uppercase() else char.toString()) { typeLetter(char) } }
      addKey("⌫", 1.35f) { backspace() }
    })
    pad.addView(row().apply {
      addKey("123", 1.2f) { switchPage("numbers") }
      addKey(if (chinese) "中/英" else "英/中", 1.3f) { toggleLanguage() }
      addKey(if (chinese) "，" else ",", 0.85f) { type(if (chinese) "，" else ",") }.setOnLongClickListener { switchPage("symbols"); true }
      val space = addKey("空格", 3.3f) { space() }; space.contentDescription = "空格，左右滑动移动光标"; spaceGesture(space)
      addKey(if (chinese) "。" else ".", 0.85f) { type(if (chinese) "。" else ".") }.setOnLongClickListener { switchPage("symbols"); true }
      addKey(enterLabel(), 1.5f, active = true) { enter() }
    })
  }
  private fun typeLetter(char: Char) {
    val value = if (!chinese && shift > 0) char.uppercase() else char.toString(); type(value)
    if (!chinese && shift == 1) { shift = 0; drawPad() }
  }
  private fun toggleLanguage() {
    commitPending(); clearPredictions()
    if (!directOnly) { chinese = !chinese; typing.update(JSONObject().put("chinese", chinese)); options = typing.snapshot() }
    shift = 0; drawPad(); renderSpelling()
  }
  private fun drawNumbers() {
    for (line in listOf(listOf("1", "2", "3", "+", "⌫"), listOf("4", "5", "6", "-", "符号"), listOf("7", "8", "9", ".", if (numericField) "隐藏" else "ABC"))) {
      pad.addView(row().apply { line.forEach { item -> addKey(item) { when (item) { "⌫" -> backspace(); "符号" -> switchPage("symbols"); "ABC" -> switchPage("letters"); "隐藏" -> requestHideSelf(0); else -> type(item) } } } })
    }
    pad.addView(row().apply {
      addKey(if (numericField) "*" else if (chinese) "中/英" else "英/中") { if (numericField) type("*") else toggleLanguage() }
      addKey(if (numericField && currentInputEditorInfo?.inputType?.and(InputType.TYPE_MASK_CLASS) == InputType.TYPE_CLASS_PHONE) "#" else ",") { type(if (numericField && currentInputEditorInfo?.inputType?.and(InputType.TYPE_MASK_CLASS) == InputType.TYPE_CLASS_PHONE) "#" else ",") }
      addKey("0") { type("0") }; addKey("空格") { space() }; addKey(enterLabel(), active = true) { enter() }
    })
  }
  private fun drawSymbols() {
    val lists = if (symbolPage == 0 && chinese) listOf(listOf("！", "？", "、", "：", "；", "…", "～", "·", "《", "》"), listOf("（", "）", "【", "】", "「", "」", "“", "”", "‘", "’"), listOf("@", "#", "¥", "%", "&", "*", "+", "-", "/", "="))
      else if (symbolPage == 0) listOf(listOf("!", "?", ",", ":", ";", "'", "\"", "~", "_", "`"), listOf("(", ")", "[", "]", "{", "}", "<", ">", "@", "#"), listOf("$", "%", "&", "*", "+", "-", "/", "=", "\\", "|"))
      else listOf(listOf("[", "]", "{", "}", "<", ">", "_", "\\", "|", "^"), listOf("$", "€", "£", "¥", "℃", "°", "±", "×", "÷", "≠"), listOf("→", "←", "↑", "↓", "✓", "★", "©", "®", "•", "—"))
    lists.forEach { line -> pad.addView(row().apply { line.forEach { item -> addKey(item) { type(item) } } }) }
    pad.addView(row().apply {
      addKey(if (numericField) "123" else "ABC", 1.25f) { switchPage(if (numericField) "numbers" else "letters") }
      addKey(if (symbolPage == 0) "更多" else "常用", 1.25f) { symbolPage = 1 - symbolPage; drawPad() }
      addKey("123", 1f) { switchPage("numbers") }; addKey("空格", 2.4f) { space() }
      addKey("⌫", 1.1f) { backspace() }; addKey(enterLabel(), 1.4f, active = true) { enter() }
    })
  }
  private val emojis = listOf(
    listOf("😀", "😄", "😁", "😂", "🤣", "😊", "🥰", "😍", "😘", "😎", "🤔", "🙃", "🙂", "😅", "😭", "🥺", "😔", "😴", "😤", "😡", "🤗", "🤭", "🤫", "😇"),
    listOf("👍", "👎", "👌", "✌️", "🙏", "👏", "💪", "🤝", "❤️", "💕", "💖", "💔", "🔥", "✨", "🎉", "💯", "🌹", "🎁", "🎂", "☕", "🍻", "✅", "👨‍👩‍👧‍👦", "👍🏽")
  )
  private fun drawEmoji() {
    emojis[emojiPage].chunked(8).forEach { line -> pad.addView(row().apply { line.forEach { item -> addKey(item) { type(item) }.textSize = if (landscape) 20f else 24f } }) }
    pad.addView(row().apply {
      addKey("ABC", 1.2f) { switchPage("letters") }; addKey(if (emojiPage == 0) "手势/心情" else "表情", 1.8f) { emojiPage = 1 - emojiPage; drawPad() }
      addKey("空格", 2.5f) { space() }; addKey("⌫", 1.1f) { backspace() }; addKey(enterLabel(), 1.4f, active = true) { enter() }
    })
  }
  private fun drawEditor() {
    pad.addView(row().apply { addKey("行首") { moveCursor(KeyEvent.KEYCODE_MOVE_HOME) }; addKey("↑") { moveCursor(KeyEvent.KEYCODE_DPAD_UP) }; addKey("行尾") { moveCursor(KeyEvent.KEYCODE_MOVE_END) } })
    pad.addView(row().apply { addKey("←") { moveCursor(KeyEvent.KEYCODE_DPAD_LEFT) }; addKey(if (selecting) "选择：开" else "选择：关", active = selecting) { selecting = !selecting; drawPad() }; addKey("→") { moveCursor(KeyEvent.KEYCODE_DPAD_RIGHT) } })
    pad.addView(row().apply { addKey("全选") { contextAction(android.R.id.selectAll) }; addKey("↓") { moveCursor(KeyEvent.KEYCODE_DPAD_DOWN) }; addKey("⌫") { backspace() } })
    pad.addView(row().apply {
      addKey("ABC") { switchPage("letters") }; addKey("复制") { if (!sensitive) contextAction(android.R.id.copy) else toast("密码框不支持复制") }
      addKey("剪切") { if (!sensitive) contextAction(android.R.id.cut) else toast("密码框不支持剪切") }; addKey("粘贴") { contextAction(android.R.id.paste) }; addKey(enterLabel(), active = true) { enter() }
    })
  }
  private fun contextAction(id: Int) { commitPending(); clearPredictions(); renderSpelling(); if (currentInputConnection?.performContextMenuAction(id) != true) toast("此输入框不支持该操作"); if (id != android.R.id.selectAll) { selecting = false; drawPad() } }
  private fun moveCursor(code: Int) {
    commitPending(); clearPredictions(); renderSpelling(); val now = SystemClock.uptimeMillis(); val meta = if (selecting) KeyEvent.META_SHIFT_ON else 0
    currentInputConnection?.sendKeyEvent(KeyEvent(now, now, KeyEvent.ACTION_DOWN, code, 0, meta))
    currentInputConnection?.sendKeyEvent(KeyEvent(now, now, KeyEvent.ACTION_UP, code, 0, meta))
  }
  private fun spaceGesture(view: View) {
    var start = 0f; var dragging = false
    view.setOnTouchListener { _, event ->
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> { start = event.x; dragging = false; false }
        MotionEvent.ACTION_MOVE -> {
          val delta = event.x - start; val step = dp(16).coerceAtLeast(1)
          if (abs(delta) >= step) { selecting = false; repeat((abs(delta) / step).toInt().coerceAtMost(12)) { moveCursor(if (delta < 0) KeyEvent.KEYCODE_DPAD_LEFT else KeyEvent.KEYCODE_DPAD_RIGHT) }; start = event.x; dragging = true }
          dragging
        }
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> { val consumed = dragging; dragging = false; if (consumed) view.isPressed = false; consumed }
        else -> false
      }
    }
  }
  private fun bottomSpace() = if (landscape) 8 else when (options.optString("bottomSpace", "normal")) { "low" -> 12; "high" -> 40; else -> 24 }
  private fun applyBottomInset() {
    if (!::keyboardRoot.isInitialized || !keyboardRoot.isAttachedToWindow) return
    val root = keyboardRoot
    val insets = root.rootWindowInsets ?: return
    val nav = if (android.os.Build.VERSION.SDK_INT >= 30) insets.getInsets(WindowInsets.Type.navigationBars()).bottom else @Suppress("DEPRECATION") insets.systemWindowInsetBottom
    val decor = window?.window?.decorView ?: return
    val a = IntArray(2); val b = IntArray(2); root.getLocationOnScreen(a); decor.getLocationOnScreen(b)
    val alreadyBelow = (b[1] + decor.height - a[1] - root.height).coerceAtLeast(0)
    val desired = dp(bottomSpace()) + (nav - alreadyBelow).coerceAtLeast(0)
    if (root.paddingBottom != desired) root.setPadding(root.paddingLeft, root.paddingTop, root.paddingRight, desired)
  }
  private fun drawSettings() {
    pad.addView(row().apply {
      addKey(if (options.optString("layout") == "nine") "切换全键盘" else "切换九宫格") { options = typing.update(JSONObject().put("layout", if (options.optString("layout") == "nine") "qwerty" else "nine")); switchPage("letters") }
      addKey("编辑文字") { switchPage("edit") }
    })
    pad.addView(row().apply {
      addKey("底部留白：${when (options.optString("bottomSpace", "normal")) { "low" -> "较低"; "high" -> "较高"; else -> "舒适" }}") { val values = listOf("low", "normal", "high"); typing.update(JSONObject().put("bottomSpace", values[(values.indexOf(options.optString("bottomSpace", "normal")) + 1) % 3])); rebuild() }
      addKey("按键：${when (options.optString("height")) { "compact" -> "紧凑"; "large" -> "大键"; else -> "标准" }}") { val values = listOf("compact", "normal", "large"); typing.update(JSONObject().put("height", values[(values.indexOf(options.optString("height")) + 1) % 3])); rebuild() }
    })
    pad.addView(row().apply {
      addKey("切换输入法") { (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).showInputMethodPicker() }
      addKey("收起键盘") { requestHideSelf(0) }
    })
    pad.addView(row().apply {
      addKey("全部键盘设置") { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("chatq://typing")).setPackage(packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); requestHideSelf(0) }
      addKey("返回打字", active = true) { switchPage("letters") }
    })
  }
  private fun toast(text: String) { Toast.makeText(this, text, Toast.LENGTH_SHORT).show() }
  private fun drawCandidates() {
    val grid = column()
    val code = spelling
    if (code.isEmpty()) predictions.chunked(3).forEach { line -> grid.addView(row().apply { line.forEach { text -> addKey(text) { choosePrediction(text) }.apply { textSize = 18f; maxLines = 2 } }; repeat(3 - line.size) { addView(View(this@ChatQInputMethodService), LinearLayout.LayoutParams(0, 1, 1f)) } }) }
    else words.chunked(3).forEach { line -> grid.addView(row().apply { line.forEach { item -> addKey(item.text) { chooseBound(item, code) }.apply {
      textSize = 18f; maxLines = 2
      if (useNine() && item.reading.isNotEmpty()) { val value = android.text.SpannableString(item.text + "\n" + item.reading); value.setSpan(android.text.style.RelativeSizeSpan(.6f), item.text.length + 1, value.length, 0); text = value }
    } }; repeat(3 - line.size) { addView(View(this@ChatQInputMethodService), LinearLayout.LayoutParams(0, 1, 1f)) } }) }
    pad.addView(ScrollView(this).apply { addView(grid) }, LinearLayout.LayoutParams(-1, dp((keyHeight + 4) * 4)))
  }
  private fun decode(value: String, readingFilter: Boolean = true): List<PinyinEngine.Candidate> {
    if (value.isEmpty()) return emptyList()
    if (!chinese) return english.suggest(value)
    val learning = options.optBoolean("learning", true) && !noLearning && !sensitive
    val base = if (useNine()) nine.decode(value) else nativeCache[value] ?: dictionary.fullPinyin(value, engine?.decode(value) ?: emptyList()).also { nativeCache[value] = it }
    val local = if (useNine()) lexicon.rankNine(value, base, learning) else lexicon.rank(value, base, learning)
    val remote = if (value == cloudCode) cloudWords else emptyList()
    val merged = (local.filter { it.consumed == value.length } + remote + local.filter { it.consumed != value.length }).distinctBy { it.text to it.consumed }
    return merged.filter { it.consumed in 1..value.length && (!readingFilter || pronunciation.isEmpty() || it.pinyin == pronunciation) }.take(128)
  }
  private fun cancelCloud() { cloudRevision++; cloudTask?.let { main.removeCallbacks(it) }; cloudTask = null; cloudApi.cancel(); cloudWords = emptyList(); cloudCode = "" }
  private fun requestCloud() {
    cancelCloud()
    val configuration = listOf(prefs.getString("baseUrl", ""), prefs.getString("apiKey", ""), prefs.getString("deviceId", ""))
    if (configuration != cloudConfiguration) { cloudCache.clear(); cloudConfiguration = configuration }
    if (!chinese || directOnly || noLearning || sensitive || !options.optBoolean("cloudWords") || spelling.length < 2) return
    val code = spelling; val layout = if (useNine()) "nine" else "qwerty"; val cacheKey = "$layout:$code"; val version = cloudRevision
    fun show(items: List<PinyinEngine.Candidate>) { if (version == cloudRevision && spelling == code) { cloudCode = code; cloudWords = items; words = decode(code); renderSpelling(true); if (expanded) drawPad() } }
    cloudCache[cacheKey]?.let { show(it); return }
    cloudTask = Runnable {
      cloudWorker.execute {
        if (version != cloudRevision) return@execute
        try {
          val items = cloudApi.post("lexicon", JSONObject().put("code", code).put("layout", layout), 3000) { version == cloudRevision }.getJSONArray("candidates")
          val found = (0 until minOf(items.length(), 12)).mapNotNull { index -> val item = items.getJSONObject(index); val text = item.optString("text"); val pinyin = item.optString("pinyin"); val matches = if (layout == "nine") NineKeyEngine.digits(pinyin) == code else pinyin == code.replace("'", ""); if (text.length in 1..12 && text.none { it.isISOControl() } && pinyin.matches(Regex("[a-z]{1,39}")) && matches) PinyinEngine.Candidate(text, code.length, pinyin, true) else null }
          main.post { if (version == cloudRevision) { cloudCache[cacheKey] = found; show(found) } }
        } catch (_: Exception) { /* Optional cloud lookup must never interrupt local typing. */ }
      }
    }.also { main.postDelayed(it, 350) }
  }
  private fun type(value: String) {
    correction = null
    if (!chinese && !directOnly && page == "letters" && (value.first().isLetter() || value == "'" && spelling.isNotEmpty())) {
      if (spelling.length >= 39) commitPending(false)
      spelling += value; updateSpelling()
    } else if (chinese && page == "letters" && !directOnly && (if (useNine()) value.length == 1 && value[0] in '2'..'9' else value[0] in 'a'..'z' || value == "'")) {
      if (value == "'" && (spelling.isEmpty() || spelling.endsWith("'"))) return
      if (spelling.length >= 39) commitPending()
      pronunciation = ""; spelling += value; updateSpelling()
    } else if (!chinese && spelling.isNotEmpty()) englishBoundary(value)
    else { commitPending(); clearPredictions(); currentInputConnection?.commitText(value, 1); renderSpelling() }
  }
  private fun updateSpelling() {
    predictions = emptyList()
    cloudWords = emptyList()
    words = decode(spelling)
    if (spelling.isEmpty()) { currentInputConnection?.commitText("", 1); currentInputConnection?.finishComposingText() }
    else currentInputConnection?.setComposingText(spelling, 1)
    renderSpelling(); if (expanded) drawPad(); requestCloud()
  }
  private fun renderSpelling(preservePressed: Boolean = false) {
    if (!::wordBar.isInitialized) return
    spellingView.text = spelling.ifEmpty { when { sensitive -> "密码输入 · AI 与记词已停用"; page == "voice" -> "语音结果预览 · 点击填入后自行发送"; page == "edit" -> "手动选择、复制、粘贴 · 不保存剪贴板"; page == "settings" -> "键盘偏好 · 本地保存"; predictions.isNotEmpty() -> "本地联想 · 点击才填入，空格仍输入空格"; useNine() -> "九宫格拼音 · 输入后可点选音筛选"; chinese && !directOnly -> "聊商拼音 · 长按字母输入数字 · 滑动空格移光标"; else -> "英文 / 直接输入 · 双击 ⇧ 锁定大写" } } + if (pronunciation.isNotEmpty()) " · $pronunciation" else if (useNine() && spelling.isNotEmpty()) words.firstOrNull()?.reading?.let { " · $it" }.orEmpty() else ""
    data class Item(val title: String, val font: Float = 20f, val description: String = title, val action: (() -> Unit)? = null, val longPress: (() -> Unit)? = null)
    val visible = ArrayList<Item>(); val code = spelling
    words.take(12).forEach { item -> visible.add(Item(item.text + if (item.cloud) "☁" else "", action = { chooseBound(item, code) })) }
    if (code.isNotEmpty()) {
      if (words.size > 12) visible.add(Item("更多候选", 12f, action = { expanded = true; drawPad(); renderSpelling() }))
      visible.add(Item("原文 $code", 12f, action = { if (spelling == code) commitPending(false) }, longPress = if (!chinese && !noLearning) ({ if (spelling == code) { english.remember(code); toast("已记住此英文词"); commitPending(false) } }) else null))
    } else predictions.forEach { text -> visible.add(Item(text, description = "联想词 $text", action = { choosePrediction(text) })) }
    if (visible.isEmpty()) visible.add(Item(if (page in listOf("numbers", "symbols")) "${if (chinese) "中文" else "英文"}数字与符号" else if (page == "emoji") "点击表情填入，退格整组删除" else if (page == "letters" && chinese && engine?.ready != true) "词库未就绪，可先用英文或自定义词" else "离线输入，不消耗 AI 额度", 12f))
    // Reuse at most fourteen views during typing; the full list is available on explicit expand.
    while (wordBar.childCount > visible.size) wordBar.removeViewAt(wordBar.childCount - 1)
    visible.forEachIndexed { index, item ->
      val view = if (index < wordBar.childCount) wordBar.getChildAt(index) as KeyboardKey else button("") {}.also { wordBar.addView(it, LinearLayout.LayoutParams(-2, -1)) }
      if (preservePressed && view.isPressed) {
        main.postDelayed({ if (spelling == code) renderSpelling(true) }, 100)
        return@forEachIndexed // Keep the original tap target while cloud candidates arrive.
      }
      view.text = item.title; view.textSize = item.font; view.contentDescription = item.description; view.setPadding(dp(12), 0, dp(12), 0); view.maxLines = 1
      view.isEnabled = item.action != null; view.setTextColor(if (item.action != null) ink else muted)
      view.setOnClickListener { item.action?.let { action -> feedback(view); action() } }
      view.setOnLongClickListener(if (item.longPress == null) null else View.OnLongClickListener { feedback(view); item.longPress.invoke(); true }); view.isLongClickable = item.longPress != null
    }
    if (stripCode != code) { wordScroll.scrollTo(0, 0); stripCode = code }
    val hasCandidates = words.isNotEmpty() || predictions.isNotEmpty()
    expandButton.isEnabled = hasCandidates; expandButton.text = if (expanded) "▴" else "▾"; expandButton.contentDescription = if (expanded) "收起候选词" else "展开候选词"
    if (!hasCandidates && expanded) { expanded = false; drawPad() }
  }
  private fun clearPredictions() { selectionContext = ""; predictions = emptyList(); predictionEnd = -1 }
  private fun rememberCommitted(text: String) {
    if (!chinese || sensitive || noLearning || directOnly || !options.optBoolean("predictions", true) || text.any { it !in '\u3400'..'\u9fff' }) { clearPredictions(); return }
    selectionContext = (selectionContext + text).takeLast(12); predictionEnd = -1
    predictions = if (spelling.isEmpty() && page == "letters") (lexicon.complete(selectionContext, options.optBoolean("learning", true)) + dictionary.predict(selectionContext)).distinct().take(12) else emptyList()
  }
  private fun choosePrediction(text: String) {
    if (spelling.isNotEmpty() || text !in predictions || sensitive || noLearning || directOnly || !options.optBoolean("predictions", true)) return
    val input = currentInputConnection ?: return; val context = selectionContext
    // Only this explicit suggestion tap reads a bounded suffix to verify that the cursor still follows our own selected text.
    if (context.isEmpty() || !input.getSelectedText(0).isNullOrEmpty() || input.getTextBeforeCursor(context.length, 0)?.toString() != context) { clearPredictions(); expanded = false; drawPad(); renderSpelling(); return }
    input.commitText(text, 1); rememberCommitted(text); expanded = false; drawPad(); renderSpelling()
  }
  private fun chooseBound(item: PinyinEngine.Candidate, code: String) { if (spelling == code) { val index = words.indexOf(item); if (index >= 0) choose(index) } }
  private fun learn(code: String, text: String) {
    if (noLearning || sensitive || !options.optBoolean("learning", true) || text.length > 12) return
    try { lexicon.add(code, text, false) } catch (_: Exception) { /* Input remains usable if local storage is full. */ }
  }
  private fun choose(index: Int) {
    val item = words.getOrNull(index) ?: run { commitPending(false); return }; val input = currentInputConnection ?: return
    cancelCloud(); correction = null
    if (chinese) learn(item.pinyin.ifEmpty { spelling.take(item.consumed) }, item.text)
    input.beginBatchEdit(); input.commitText(item.text, 1)
    spelling = spelling.drop(item.consumed); pronunciation = ""; words = decode(spelling)
    if (spelling.isNotEmpty()) input.setComposingText(spelling, 1) else input.finishComposingText()
    rememberCommitted(item.text)
    input.endBatchEdit(); val wasExpanded = expanded; expanded = false; renderSpelling(); if (wasExpanded) drawPad(); requestCloud()
  }
  private fun commitPending(convert: Boolean = true) {
    if (spelling.isEmpty()) return
    if (!chinese) { val text = spelling; spelling = ""; words = emptyList(); currentInputConnection?.commitText(text, 1); currentInputConnection?.finishComposingText(); val wasExpanded = expanded; expanded = false; renderSpelling(); if (wasExpanded) drawPad(); return }
    var rest = spelling; val text = StringBuilder()
    while (rest.isNotEmpty()) { val first = if (convert) decode(rest, rest == spelling).firstOrNull() else null; if (first == null) { text.append(rest); break }; text.append(first.text); rest = rest.drop(first.consumed) }
    cancelCloud(); pronunciation = ""; spelling = ""; words = emptyList(); currentInputConnection?.commitText(text, 1); currentInputConnection?.finishComposingText(); if (convert) rememberCommitted(text.toString()) else clearPredictions(); val wasExpanded = expanded; expanded = false; renderSpelling(); if (wasExpanded) drawPad()
  }
  private fun englishBoundary(delimiter: String) {
    val proseBoundary = delimiter.isEmpty() || delimiter.all { it.isWhitespace() || it in ".,!?;:，。！？；：" }
    val original = spelling; val fixed = if (proseBoundary && options.optBoolean("englishCorrection", true) && !directOnly && !noLearning) english.correction(original) else null
    val wasExpanded = expanded; spelling = ""; words = emptyList(); expanded = false
    currentInputConnection?.commitText((fixed ?: original) + delimiter, 1); currentInputConnection?.finishComposingText()
    correction = if (fixed != null && delimiter == " ") Correction(original, fixed + delimiter) else null; correctionEnd = -1
    renderSpelling(); if (wasExpanded) drawPad()
  }
  private fun space() { if (!chinese && spelling.isNotEmpty()) englishBoundary(" ") else if (spelling.isNotEmpty()) choose(0) else { clearPredictions(); correction = null; currentInputConnection?.commitText(" ", 1); renderSpelling() } }
  private fun backspace() {
    clearPredictions(); renderSpelling()
    val undo = correction; correction = null
    if (undo != null && spelling.isEmpty()) {
      val input = currentInputConnection
      if (input?.getSelectedText(0).isNullOrEmpty() && input?.getTextBeforeCursor(undo.replacement.length, 0)?.toString() == undo.replacement) {
        input?.beginBatchEdit(); input?.deleteSurroundingText(undo.replacement.length, 0); spelling = undo.original; updateSpelling(); input?.endBatchEdit(); return
      }
    }
    if (spelling.isNotEmpty()) { spelling = spelling.dropLast(1); updateSpelling(); return }
    val input = currentInputConnection ?: return
    if (!input.getSelectedText(0).isNullOrEmpty()) { input.commitText("", 1); return }
    // Read a bounded suffix only for this explicit delete action; never send or persist it.
    val before = if (!sensitive) input.getTextBeforeCursor(128, 0)?.toString() else null
    if (!before.isNullOrEmpty()) {
      val iterator = BreakIterator.getCharacterInstance(); iterator.setText(before); val boundary = iterator.preceding(before.length)
      if (boundary >= 0) { input.deleteSurroundingText(before.length - boundary, 0); return }
    }
    input.deleteSurroundingTextInCodePoints(1, 0)
  }
  private fun editorAction(): Int {
    val info = currentInputEditorInfo ?: return EditorInfo.IME_ACTION_NONE
    if (info.imeOptions and EditorInfo.IME_FLAG_NO_ENTER_ACTION != 0) return EditorInfo.IME_ACTION_NONE
    return if (info.actionLabel != null && info.actionId != 0) info.actionId else info.imeOptions and EditorInfo.IME_MASK_ACTION
  }
  private fun enterLabel() = when (editorAction()) { EditorInfo.IME_ACTION_SEARCH -> "搜索"; EditorInfo.IME_ACTION_SEND -> "发送"; EditorInfo.IME_ACTION_GO -> "前往"; EditorInfo.IME_ACTION_NEXT -> "下一项"; EditorInfo.IME_ACTION_PREVIOUS -> "上一项"; EditorInfo.IME_ACTION_DONE -> "完成"; else -> currentInputEditorInfo?.actionLabel?.toString()?.take(6) ?: "换行" }
  private fun enter() {
    correction = null
    if (spelling.isNotEmpty()) { if (chinese) { commitPending(); return } else englishBoundary("") }
    clearPredictions(); renderSpelling(); val action = editorAction(); val input = currentInputConnection ?: return
    if (action == EditorInfo.IME_ACTION_NONE || action == EditorInfo.IME_ACTION_UNSPECIFIED) input.commitText("\n", 1)
    else { if (!input.performEditorAction(action)) sendDownUpKeyEvents(KeyEvent.KEYCODE_ENTER); if (action == EditorInfo.IME_ACTION_DONE) requestHideSelf(0) }
  }
  override fun onUpdateSelection(oldSelStart: Int, oldSelEnd: Int, newSelStart: Int, newSelEnd: Int, candidatesStart: Int, candidatesEnd: Int) {
    super.onUpdateSelection(oldSelStart, oldSelEnd, newSelStart, newSelEnd, candidatesStart, candidatesEnd)
    if (correction != null) { if (correctionEnd < 0) correctionEnd = newSelEnd else if (newSelStart != newSelEnd || newSelEnd != correctionEnd) correction = null }
    if (spelling.isNotEmpty() && (newSelStart != candidatesEnd || newSelEnd != candidatesEnd)) { cancelCloud(); clearPredictions(); pronunciation = ""; spelling = ""; words = emptyList(); currentInputConnection?.finishComposingText(); expanded = false; renderSpelling(); drawPad() }
    // The editor may deliver the previous composing-range callback after our selection.
    // Only anchor predictions once finishComposingText has reached the editor.
    if (spelling.isEmpty() && selectionContext.isNotEmpty() && candidatesEnd < 0) {
      if (newSelStart != newSelEnd || (predictionEnd >= 0 && newSelEnd != predictionEnd)) { clearPredictions(); expanded = false; renderSpelling(); drawPad() } else predictionEnd = newSelEnd
    }
  }
  override fun onStartInput(attribute: EditorInfo?, restarting: Boolean) {
    super.onStartInput(attribute, restarting); stopDeleteRepeat(); invalidateRequest(); cancelCloud(); clearPredictions(); correction = null; pronunciation = ""; voiceText = ""; options = typing.snapshot()
    // restartInput can keep the editor's composing span while resetting our local state.
    // Remove that span without replacing text the application may have just changed.
    if (restarting) currentInputConnection?.finishComposingText()
    val type = attribute?.inputType ?: 0; val inputClass = type and InputType.TYPE_MASK_CLASS; val variation = type and InputType.TYPE_MASK_VARIATION
    sensitive = (inputClass == InputType.TYPE_CLASS_TEXT && variation in listOf(InputType.TYPE_TEXT_VARIATION_PASSWORD, InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD, InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD)) || (inputClass == InputType.TYPE_CLASS_NUMBER && variation == InputType.TYPE_NUMBER_VARIATION_PASSWORD)
    numericField = inputClass in listOf(InputType.TYPE_CLASS_NUMBER, InputType.TYPE_CLASS_PHONE, InputType.TYPE_CLASS_DATETIME)
    noLearning = sensitive || (attribute?.imeOptions ?: 0) and EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING != 0
    directOnly = sensitive || numericField || type == InputType.TYPE_NULL || (attribute?.imeOptions ?: 0) and EditorInfo.IME_FLAG_FORCE_ASCII != 0 || (inputClass == InputType.TYPE_CLASS_TEXT && (variation in listOf(InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS, InputType.TYPE_TEXT_VARIATION_WEB_EMAIL_ADDRESS, InputType.TYPE_TEXT_VARIATION_URI) || type and InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS != 0))
    chinese = !directOnly && options.optBoolean("chinese", true); shift = if (!chinese && !sensitive && type and InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS != 0) 2 else if (!chinese && !sensitive && type and (InputType.TYPE_TEXT_FLAG_CAP_SENTENCES or InputType.TYPE_TEXT_FLAG_CAP_WORDS) != 0) 1 else 0
    spelling = ""; words = emptyList(); selecting = false; expanded = false; page = if (numericField) "numbers" else "letters"
    prompt = ""; aiDrafts.clear(); polishTarget = null; aiReplies = emptyList(); topicAI = emptyList(); if (::results.isInitialized) results.removeAllViews(); if (::writing.isInitialized) showAI(false); drawPad(); renderSpelling(); renderPrompt()
    if (::status.isInitialized) status.text = "点击生成才发送消息，点击候选才填入"
  }
  override fun onStartInputView(info: EditorInfo?, restarting: Boolean) {
    super.onStartInputView(info, restarting)
    val refreshed = typing.snapshot()
    if (options.toString() != refreshed.toString()) {
      commitPending(); clearPredictions()
      if (options.optBoolean("chinese", true) != refreshed.optBoolean("chinese", true)) { chinese = !directOnly && refreshed.optBoolean("chinese", true); shift = 0 }
      rebuild()
    }
    reloadPersona()
    renderSpelling()
    val recognized = VoiceSession.take(info)
    if (!recognized.isNullOrEmpty() && !sensitive && !noLearning && !directOnly) { voiceText = recognized; page = "voice"; showAI(false); drawPad(); renderSpelling() }
  }
  private fun stopDeleteRepeat() { deleteRepeat?.let { main.removeCallbacks(it) }; deleteRepeat = null }
  private fun invalidateRequest() { revision++; replyApi.cancel(); busy = false }
  private fun settingsChanged() { invalidateRequest(); aiReplies = emptyList(); topicAI = emptyList(); if (::results.isInitialized) results.removeAllViews(); renderPrompt(); if (aiMode == "topic") renderTopics() else if (::status.isInitialized) status.text = "设置已更新，请重新生成" }
  override fun onFinishInputView(finishingInput: Boolean) { stopDeleteRepeat(); commitPending(); cancelCloud(); clearPredictions(); correction = null; val wasBusy = busy; invalidateRequest(); if (wasBusy && ::status.isInitialized) status.text = "已取消生成，可手动重试"; if (::results.isInitialized) results.removeAllViews(); renderPrompt(); super.onFinishInputView(finishingInput) }
  override fun onFinishInput() { stopDeleteRepeat(); commitPending(); cancelCloud(); clearPredictions(); spelling = ""; words = emptyList(); currentInputConnection?.finishComposingText(); renderSpelling(); invalidateRequest(); prompt = ""; if (::results.isInitialized) results.removeAllViews(); renderPrompt(); super.onFinishInput() }
  override fun onDestroy() { invalidateRequest(); cancelCloud(); cloudWorker.shutdownNow(); worker.shutdownNow(); engine?.close(); super.onDestroy() }
  override fun onEvaluateFullscreenMode() = false

  private fun createAI() {
    tone = prefs.getString("replyTone", "friendly")?.takeIf { it in listOf("friendly", "professional", "funny", "emoji") } ?: "friendly"; count = prefs.getInt("replyCount", 1).coerceIn(1, 3)
    aiPanel.addView(row().apply {
      replyModeButton = addKey("帮我回复", height = if (landscape) 32 else 48) { setAIMode("reply") }
      polishModeButton = addKey("润色我的话", height = if (landscape) 32 else 48) { setAIMode("polish") }
      topicModeButton = addKey("找话题", height = if (landscape) 32 else 48) { setAIMode("topic") }
    })
    personaRow = row(); reloadPersona()
    source = label("").apply { maxLines = 1; gravity = Gravity.CENTER_VERTICAL; ellipsize = android.text.TextUtils.TruncateAt.END }
    aiPanel.addView(row().apply {
      addView(source, LinearLayout.LayoutParams(0, dp(if (landscape) 32 else 48), 1f))
      pasteButton = button("换消息") { pasteAndGenerate() }
      addView(pasteButton, LinearLayout.LayoutParams(dp(96), dp(if (landscape) 32 else 48)))
    })
    topicControls = row().apply {
      val categories = topicLibrary.categories + TopicLibrary.Category("saved", "我的收藏", emptyList())
      addView(spinner(categories.map { it.name }, categories.indexOfFirst { it.id == topicCategory }) { index ->
        val next = categories.getOrNull(index)?.id ?: return@spinner
        if (next != topicCategory) { topicCategory = next; topicPage = 0; settingsChanged() }
      }, LinearLayout.LayoutParams(0, dp(if (landscape) 30 else 48), 1.5f))
      addKey("换一批", 1f, if (landscape) 28 else 48) { if (!busy) { topicAI = emptyList(); topicPage++; renderTopics() } }
      topicGenerate = addKey("AI 找话题", 1.4f, if (landscape) 28 else 48, active = true) { if (busy) cancelReply() else requestReply() }
    }; aiPanel.addView(topicControls)
    replyControls = row().apply {
      generate = addKey("粘贴并生成", 1f, if (landscape) 32 else 48, active = true) {
        if (busy) cancelReply() else if (prompt.isNotBlank()) requestReply() else if (aiMode == "polish") polishEditor() else pasteAndGenerate()
      }
    }; aiPanel.addView(replyControls)
    status = label("点粘贴并生成才上传 · 结果点选填入").apply { textSize = 12f; maxLines = 2; minHeight = dp(30); setTextColor(muted) }; aiPanel.addView(status, LinearLayout.LayoutParams(-1, -2))
    results = column(); resultScroll = ScrollView(this).apply { addView(results) }; aiPanel.addView(resultScroll, LinearLayout.LayoutParams(-1, 0, 1f))
    renderPrompt()
  }
  private fun showAIMenu(anchor: View) {
    val popup = PopupMenu(this, anchor)
    popup.menu.add("生成记录").setOnMenuItemClickListener { showHistory(); true }
    popup.menu.add(if (aiMode == "polish") "重新读取并润色" else "读取选中文字").setOnMenuItemClickListener {
      if (aiMode == "polish") polishEditor() else if (aiAllowed()) {
        val value = currentInputConnection?.getSelectedText(0)?.toString().orEmpty()
        if (validSource(value)) setPrompt(value)
      }; true
    }
    popup.menu.add("清空消息").setOnMenuItemClickListener { setPrompt(""); true }
    val personal = PersonaPreferences(prefs)
    for ((key, listKey, label) in listOf(Triple("cardId", "cards", "人设"), Triple("relationId", "relations", "关系"), Triple("sceneId", "scenes", "场景"))) {
      val available = personal.choices(listKey)
      val choices = if (key == "cardId" && available.isNotEmpty()) available else listOf("" to "不限") + available
      val menu = popup.menu.addSubMenu(label)
      choices.forEach { (id, name) -> menu.add(name).apply { isCheckable = true; isChecked = personal.selected(key, available) == id; setOnMenuItemClickListener { if (personal.select(key, id)) settingsChanged() else toast("保存失败，请重试"); true } } }
    }
    val tones = popup.menu.addSubMenu("回复语气")
    listOf("friendly" to "自然", "professional" to "得体", "funny" to "幽默", "emoji" to "轻松").forEach { (id, name) -> tones.add(name).apply { isCheckable = true; isChecked = tone == id; setOnMenuItemClickListener { tone = id; prefs.edit().putString("replyTone", id).apply(); settingsChanged(); true } } }
    val quantity = popup.menu.addSubMenu("回复数量")
    (1..3).forEach { n -> quantity.add("$n 条").apply { isCheckable = true; isChecked = count == n; setOnMenuItemClickListener { count = n; prefs.edit().putInt("replyCount", n).apply(); settingsChanged(); true } } }
    popup.show()
  }
  private fun spinner(labels: List<String>, selected: Int, change: (Int) -> Unit) = Spinner(this).apply {
    backgroundTintList = ColorStateList.valueOf(muted)
    adapter = object : ArrayAdapter<String>(this@ChatQInputMethodService, android.R.layout.simple_spinner_item, labels) {
      override fun getView(position: Int, convertView: View?, parent: ViewGroup): View = super.getView(position, convertView, parent).apply { (this as? TextView)?.apply { textSize = 12f; setTextColor(ink); setPadding(dp(3), 0, 0, 0) } }
    }.apply { setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item) }
    setSelection(selected.coerceAtLeast(0), false)
    onItemSelectedListener = object : AdapterView.OnItemSelectedListener { override fun onNothingSelected(parent: AdapterView<*>?) {}; override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) { change(position) } }
  }
  private fun reloadPersona() {
    if (!::personaRow.isInitialized) return
    personaRow.removeAllViews(); val personal = PersonaPreferences(prefs)
    for ((key, listKey, label) in listOf(Triple("cardId", "cards", "人设"), Triple("relationId", "relations", "关系"), Triple("sceneId", "scenes", "场景"))) {
      val available = personal.choices(listKey); val values = if (key == "cardId" && available.isNotEmpty()) available else listOf("" to "${label}不限") + available
      val control = spinner(values.map { it.second }, values.indexOfFirst { it.first == personal.selected(key, available) }) { position ->
        val next = values[position].first
        if (personal.selected(key, available) != next) { if (personal.select(key, next)) { settingsChanged(); status.text = "已切换$label：${values[position].second}" } else if (::status.isInitialized) status.text = "保存失败，请重新选择" }
      }; control.contentDescription = "选择$label"; personaRow.addView(control, LinearLayout.LayoutParams(0, dp(if (landscape) 30 else 48), 1f))
    }
  }
  private fun aiAllowed() = !sensitive && !noLearning && !directOnly
  private fun cancelReply() { invalidateRequest(); renderPrompt(); if (aiMode == "topic") renderTopics(); status.text = "已停止，原文保留，可重新生成" }
  private fun setPrompt(value: String, target: PolishTarget? = null) {
    invalidateRequest(); prompt = value; polishTarget = target; aiReplies = emptyList(); topicAI = emptyList(); results.removeAllViews(); renderPrompt()
    if (aiMode == "topic") renderTopics() else status.text = "原文已就绪，点生成才上传"
  }
  private fun validSource(value: String): Boolean {
    if (!aiAllowed()) return false
    val limit = if (aiMode == "topic") 200 else 1000
    if (value.isBlank()) { status.text = "没有可用文字，请先复制文字或在输入框打字"; return false }
    if (value.length > limit) { status.text = "文字超过 $limit 字，请选取较短内容；原文未改动"; return false }
    return true
  }
  private fun pasteAndGenerate() {
    if (!aiAllowed() || busy) return
    try {
      // Read text only on this explicit action. Never poll or resolve clipboard URIs.
      val clip = (getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).primaryClip
      val value = clip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.text?.toString().orEmpty()
      if (validSource(value)) { setPrompt(value); if (aiMode == "topic") status.text = "背景已更新，点 AI 找话题才上传" else requestReply() }
    } catch (_: Exception) { status.text = "无法读取剪贴板，请重新复制文字后再试" }
  }
  private fun editorSnapshot(): android.view.inputmethod.ExtractedText? = try {
    currentInputConnection?.getExtractedText(android.view.inputmethod.ExtractedTextRequest().apply { hintMaxChars = 10001; hintMaxLines = 1000 }, 0)
      ?.takeIf { it.startOffset == 0 && it.partialStartOffset < 0 && it.text != null && it.text.length <= 10000 && it.selectionStart in 0..it.text.length && it.selectionEnd in 0..it.text.length }
  } catch (_: Exception) { null }
  private fun polishEditor() {
    if (!aiAllowed() || busy) return
    commitPending()
    val snapshot = editorSnapshot()
    if (snapshot == null) { status.text = "此输入框不支持读取，请复制原文后点粘贴润色"; return }
    val original = snapshot.text.toString()
    val start = if (snapshot.selectionStart == snapshot.selectionEnd) 0 else minOf(snapshot.selectionStart, snapshot.selectionEnd)
    val end = if (snapshot.selectionStart == snapshot.selectionEnd) original.length else maxOf(snapshot.selectionStart, snapshot.selectionEnd)
    val value = original.substring(start, end)
    if (!validSource(value)) return
    setPrompt(value, PolishTarget(original, snapshot.selectionStart, snapshot.selectionEnd, start, end)); requestReply()
  }
  private fun setAIMode(mode: String) {
    if (aiMode == mode) return
    aiDrafts[aiMode] = AIDraft(prompt, polishTarget)
    invalidateRequest(); aiMode = mode
    val draft = aiDrafts[mode]; prompt = draft?.prompt.orEmpty(); polishTarget = draft?.target
    aiReplies = emptyList(); topicAI = emptyList(); results.removeAllViews(); renderPrompt()
    if (mode == "topic") renderTopics() else status.text = if (mode == "polish") "保留你的意思 · 点选结果才替换原文" else "点粘贴并生成才上传 · 结果点选填入"
  }
  private fun insertResult(text: String, target: PolishTarget? = null) {
    if (!aiAllowed()) return
    val connection = currentInputConnection ?: return
    if (target != null) {
      val current = editorSnapshot()
      if (current == null || current.text.toString() != target.text || current.selectionStart != target.selectionStart || current.selectionEnd != target.selectionEnd) {
        status.text = "输入内容或光标已改变，未替换；请重新读取输入框"; return
      }
      connection.beginBatchEdit()
      try {
        if (!connection.setSelection(target.start, target.end)) { status.text = "此输入框不支持替换，原文保留"; return }
        if (!connection.commitText(text, 1)) { connection.setSelection(target.selectionStart, target.selectionEnd); status.text = "未能填入，原文保留，请重试"; return }
      } finally { connection.endBatchEdit() }
      // A consumed replacement must not be reapplied to an already changed editor.
      polishTarget = null; aiReplies = emptyList(); prompt = ""; aiDrafts.remove("polish")
    } else {
      commitPending()
      if (!connection.commitText(text, 1)) { status.text = "未能填入，请重试"; return }
    }
    returnToTyping(); toast("已填入，请确认后发送")
  }
  private fun renderReplies() {
    if (!::results.isInitialized || aiMode == "topic") return
    results.removeAllViews()
    val requestRevision = revision; val target = if (aiMode == "polish") polishTarget else null
    aiReplies.forEach { reply -> results.addView(button(reply, 14f) {
      if (requestRevision == revision) insertResult(reply, target)
    }.apply {
      contentDescription = "${if (target != null) "替换原文" else "填入"}：$reply"
      gravity = Gravity.START or Gravity.CENTER_VERTICAL; setPadding(dp(8), dp(6), dp(8), dp(6))
    }, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(4) }) }
  }
  private fun renderTopics() {
    if (!::results.isInitialized || aiMode != "topic") return
    results.removeAllViews()
    if (sensitive || noLearning || directOnly) { status.text = "此输入框不启用话题库与 AI"; return }
    if (topicAI.isNotEmpty()) {
      topicAI.forEach { addTopicText(it, "AI 话题") }
      return
    }
    val favorites = TopicFavorites(prefs, topicLibrary.categories.flatMap { it.topics }.map { it.id }.toSet())
    val saved = try { val data = JSONArray(favorites.read() ?: "[]"); (0 until data.length()).map { data.getString(it) }.toSet() } catch (_: Exception) { emptySet<String>() }
    val items = if (topicCategory == "saved") {
      val all = topicLibrary.categories.flatMap { it.topics }.filter { it.id in saved }
      if (all.isEmpty()) emptyList() else (0 until minOf(3, all.size)).map { all[((topicPage.toLong().coerceAtLeast(0) * 3 + it) % all.size).toInt()] }
    } else topicLibrary.batch(topicCategory, topicPage)
    status.text = if (topicCategory == "saved") "本机收藏 · 点击填入，不会自动发送" else "离线话题 · 点击填入，不会自动发送"
    if (topicCategory == "saved" && items.isEmpty()) results.addView(label("还没有收藏。在话题标题旁点 ☆ 收藏，或在主应用的话题库里收藏。"))
    for (item in items) {
      val header = row()
      header.addView(label(item.title).apply { setTextColor(muted); textSize = 11f; maxLines = 2 }, LinearLayout.LayoutParams(0, -2, 1f))
      header.addKey(if (item.id in saved) "★" else "☆", 0.55f, if (landscape) 28 else 48) {
        try { favorites.set(item.id, item.id !in saved); renderTopics() }
        catch (_: Exception) { status.text = "收藏保存失败，请稍后重试" }
      }.apply { contentDescription = "${if (item.id in saved) "取消收藏" else "收藏"}：${item.title}"; isSelected = item.id in saved }
      header.addKey("怎么接着聊", 1f, if (landscape) 28 else 48) {
        status.text = "等对方回答后，按实际情况选用接话提示"
        results.removeAllViews(); results.addView(label("接话提示 · ${item.title}")); addTopicText(item.followUp, "接话提示")
        results.addView(button("返回话题库", 12f) { renderTopics() }, LinearLayout.LayoutParams(-1, dp(if (landscape) 32 else 48)))
      }
      results.addView(header)
      addTopicText(item.opener, "话题开场白")
    }
    if (topicLibrary.categories.isEmpty()) status.text = "离线话题暂不可用，可尝试 AI 找话题"
  }
  private fun addTopicText(text: String, description: String) {
    val requestRevision = revision
    results.addView(button(text, 14f) {
      if (requestRevision == revision && !sensitive && !noLearning && !directOnly) {
        insertResult(text)
      }
    }.apply { contentDescription = "$description：$text"; gravity = Gravity.START or Gravity.CENTER_VERTICAL; setPadding(dp(8), dp(6), dp(8), dp(6)) }, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(4) })
  }
  private fun renderPrompt() {
    if (!::source.isInitialized) return
    val topics = aiMode == "topic"
    source.text = if (sensitive || noLearning || directOnly) "此输入框已停用 AI" else prompt.ifEmpty { if (topics) "选个话题，轻松开聊" else if (aiMode == "polish") "润色已写的话，保留原意" else "先复制对方的消息" }
    if (!::generate.isInitialized) return
    generate.isEnabled = aiAllowed()
    pasteButton.isEnabled = aiAllowed() && !busy
    pasteButton.visibility = if (aiMode == "reply" && prompt.isBlank()) View.GONE else View.VISIBLE
    pasteButton.text = if (aiMode == "polish") "粘贴润色" else if (topics) "粘贴背景" else "粘贴生成"
    pasteButton.contentDescription = if (aiMode == "polish") "粘贴并润色" else if (topics) "粘贴背景" else "粘贴新消息并生成"
    topicGenerate.isEnabled = !sensitive && !noLearning && !directOnly && (busy || topicCategory != "saved")
    generate.text = when { busy -> "停止生成"; aiMode == "polish" -> if (prompt.isBlank()) "润色输入框" else "重新润色"; prompt.isBlank() -> "粘贴并生成"; else -> "重新生成" }; topicGenerate.text = if (busy) "取消生成" else if (topicCategory == "saved") "离线收藏" else "AI 找话题"
    replyControls.visibility = if (topics) View.GONE else View.VISIBLE; topicControls.visibility = if (topics) View.VISIBLE else View.GONE
    // The result list uses remaining panel space; actions stay reachable while results scroll.
    replyModeButton.setTextColor(if (aiMode == "reply") accent else ink); topicModeButton.setTextColor(if (topics) accent else ink); polishModeButton.setTextColor(if (aiMode == "polish") accent else ink)
    replyModeButton.isSelected = aiMode == "reply"; polishModeButton.isSelected = aiMode == "polish"; topicModeButton.isSelected = topics
  }
  private fun showHistory() {
    if(sensitive || noLearning || directOnly) { status.text="此输入框已停用历史记录"; return }
    invalidateRequest(); renderPrompt(); val selectedRevision=revision
    results.removeAllViews(); status.text="本机记录 · 点候选填入，不会自动发送"
    worker.execute { try {
      val rows=generations.list()
      main.post { if(selectedRevision==revision) {
        if(rows.length()==0) results.addView(label("还没有生成记录，可在主应用管理保存开关"))
        for(i in 0 until minOf(rows.length(),10)) {
          val item=rows.getJSONObject(i); val replies=item.getJSONArray("replies")
          results.addView(label((if(item.getString("source")=="app") "主应用" else "键盘")+" · "+(when(item.getString("kind")) { "topic" -> "话题"; "polish" -> "润色"; else -> "回复" })+" · "+item.getString("prompt").take(20)).apply { textSize=11f })
          for(j in 0 until replies.length()) { val text=replies.getString(j); results.addView(button(text,14f) { if(selectedRevision==revision && !sensitive && !noLearning && !directOnly) { insertResult(text) } }.apply { gravity=Gravity.START or Gravity.CENTER_VERTICAL },LinearLayout.LayoutParams(-1,-2)) }
        }
      } }
    } catch(_:Exception) { main.post { if(selectedRevision==revision) status.text="记录读取失败，请稍后重试" } } }
  }
  private fun requestReply() {
    val topics = aiMode == "topic"
    if (busy || sensitive || noLearning || directOnly || (topics && topicCategory == "saved") || (!topics && prompt.isBlank())) return
    val base = prefs.getString("baseUrl", "")!!.trimEnd('/'); val key = prefs.getString("apiKey", "")!!; val device = prefs.getString("deviceId", "")!!
    if (base.isBlank() || key.isBlank() || device.isBlank()) { status.text = "请先打开聊商 App，完成服务器连接"; return }
    val requestedPrompt = prompt
    val requestedMode = aiMode
    commitPending(); val requestRevision = ++revision
    val payload = PersonaPreferences(prefs).appendTo(JSONObject().put("prompt", prompt).put("style", if (topics) "friendly" else tone).put("candidateCount", if (topics) 3 else count)).apply {
      put("purpose", aiMode)
      if (topics) { put("category", topicCategory); put("avoid", JSONArray(topicAI.take(6).map { it.take(300) })) }
    }.toString()
    busy = true; aiReplies = emptyList(); renderPrompt(); results.removeAllViews(); status.text = "AI 正在思考…"
    worker.execute {
      if (requestRevision != revision) return@execute
      try {
        val data = replyApi.post(if (topics) "topics" else "reply", JSONObject(payload), 75000) { requestRevision == revision }; val items = data.optJSONArray("candidates")
        val replies = (if (items != null && items.length() > 0) (0 until items.length()).map { items.getString(it) } else listOf(data.optString("result"))).filter { it.isNotBlank() }.distinct().take(3)
        if (replies.isEmpty()) throw IllegalStateException("服务器没有返回回复内容")
        var historyFailed=false
        if(requestRevision==revision) try { generations.save(requestedPrompt,replies.take(3),"keyboard",requestedMode) } catch(_:Exception) { historyFailed=true }
        main.post { if (requestRevision == revision) {
          if (topics) { topicAI = replies; renderTopics() } else { aiReplies = replies; renderReplies() }
          status.text = (if (requestedMode == "polish" && polishTarget != null) "点选替换原文" else "点选填入") + "并返回打字 · 不会自动发送" + if(historyFailed) " · 记录未保存" else ""
        } }
      } catch (error: Exception) { main.post { if (requestRevision == revision) status.text = if (error is IllegalStateException) error.message else "连接失败或超时，请检查网络后手动重试" } }
      finally { main.post { if (requestRevision == revision) { busy = false; renderPrompt() } } }
    }
  }
}
