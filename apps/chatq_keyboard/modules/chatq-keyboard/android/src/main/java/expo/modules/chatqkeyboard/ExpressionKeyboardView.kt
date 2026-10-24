package expo.modules.chatqkeyboard

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.*
import org.json.JSONArray
import java.util.concurrent.ExecutorService
import java.util.concurrent.ConcurrentHashMap

/** Local-only expression browser. The service owns editor identity and all insertion. */
class ExpressionKeyboardView(
  context: Context, private val dark: Boolean, private val tab: String,
  private val allowed: Boolean, private val richInput: Boolean,
  private val executor: ExecutorService, private val feedback: (View) -> Unit, private val insert: (String) -> Unit,
  private val delete: () -> Unit, private val useSticker: (String, Boolean, Int) -> Unit
) : LinearLayout(context) {
  private val scale get() = resources.configuration.fontScale
  private val landscape get() = resources.configuration.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE
  private val ink = Color.parseColor(if (dark) "#EDEBF5" else "#28243D")
  private val muted = Color.parseColor(if (dark) "#BDB6CD" else "#625D74")
  private val accent = Color.parseColor(if (dark) "#C9B8FF" else "#7054C8")
  private val paper = Color.parseColor(if (dark) "#303044" else "#FFFFFF")
  private val soft = Color.parseColor(if (dark) "#353049" else "#EFEAFC")
  private var generation = 0
  private var disposed = false
  private var working = false
  private var selectedGroup = "all"
  private lateinit var message: TextView
  private lateinit var primary: Button
  private lateinit var share: Button
  private var previewId: String? = null
  private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
  private fun column() = LinearLayout(context).apply { orientation = VERTICAL }
  private fun row() = LinearLayout(context).apply { orientation = HORIZONTAL; isBaselineAligned = false }
  private fun shape(color: Int, radius: Int = 12) = GradientDrawable().apply { setColor(color); cornerRadius = dp(radius).toFloat() }
  private fun backgroundFor(color: Int) = StateListDrawable().apply {
    addState(intArrayOf(-android.R.attr.state_enabled), shape(soft))
    addState(intArrayOf(android.R.attr.state_pressed), shape(if (dark) 0xFF55466F.toInt() else 0xFFDED4F7.toInt()))
    addState(intArrayOf(), shape(color))
  }
  private fun text(value: String, size: Float, color: Int = ink) = TextView(context).apply {
    text = value; textSize = size; setTextColor(color); setPadding(dp(4), dp(4), dp(4), dp(4))
  }
  private fun control(value: String, active: Boolean = false, action: () -> Unit) = Button(context).apply {
    text = value; textSize = 14f; isAllCaps = false; minWidth = 0; minimumWidth = 0
    minHeight = dp(48); minimumHeight = dp(48); gravity = Gravity.CENTER
    setTextColor(android.content.res.ColorStateList(arrayOf(intArrayOf(-android.R.attr.state_enabled), intArrayOf()), intArrayOf(muted, if (active) Color.WHITE else ink)))
    background = backgroundFor(if (active) 0xFF7054C8.toInt() else paper)
    setPadding(dp(8), dp(6), dp(8), dp(6)); stateListAnimator = null; elevation = 0f
    isSoundEffectsEnabled = false
    setOnClickListener { feedback(this); action() }
  }
  private fun scroll(content: View) = ScrollView(context).apply {
    isFillViewport = false; isVerticalScrollBarEnabled = true; addView(content)
    clipToPadding = false; setPadding(0, dp(4), 0, dp(4))
  }
  private fun reset() { generation++; working = false; previewId = null; removeAllViews() }
  fun dispose() { disposed = true; generation++ }
  fun active(ticket: Int) = !disposed && generation == ticket && working
  fun failure(ticket: Int, reason: String) {
    if (!active(ticket)) return
    working = false; message.text = reason; message.setTextColor(if (dark) 0xFFFFB5BF.toInt() else 0xFFB33449.toInt())
    primary.isEnabled = true; primary.text = if (richInput) "重试使用" else "分享表情"
    share.visibility = if (richInput) VISIBLE else GONE; share.isEnabled = true
    message.announceForAccessibility(reason)
  }
  init { orientation = VERTICAL; setPadding(dp(2), dp(6), dp(2), dp(2)); if (tab == "stickers") library() else textLibrary() }

  private data class Expression(val value: String, val label: String, val group: String)
  private fun catalog(): List<Expression> {
    val items = JSONArray(context.assets.open("expressions.json").bufferedReader().use { it.readText() })
    val shared = (0 until items.length()).map { val x = items.getJSONObject(it); Expression(x.getString("text"), x.getString("label"), x.getString("group")) }
    // Preserve the previous keyboard's extra glyphs, including complete grapheme clusters.
    val extra = listOf("😁" to "笑容", "🙂" to "微笑", "😔" to "低落", "😡" to "生气", "🤫" to "嘘", "😇" to "天使", "👎" to "不赞同", "✌️" to "胜利", "🤝" to "握手", "💖" to "闪亮爱心", "💔" to "心碎", "🔥" to "火热", "✨" to "闪耀", "💯" to "满分", "🎁" to "礼物", "🎂" to "生日", "🍻" to "干杯", "👨‍👩‍👧‍👦" to "一家人", "👍🏽" to "点赞中等肤色")
    return shared + extra.map { Expression(it.first, it.second, "hello") }
  }
  private fun textLibrary() {
    reset()
    val kaomoji = tab == "kaomoji"
    val layout = if (landscape) row().also { addView(it, LayoutParams(-1, -1)) } else this
    if (!kaomoji) {
      val groups = if (landscape) column() else row()
      listOf("all" to "全部", "happy" to "开心", "love" to "关心", "mood" to "心情", "hello" to "日常").forEach { (id, name) ->
        groups.addView(control(name) { selectedGroup = id; textLibrary() }.apply {
          isSelected = id == selectedGroup; setTextColor(if (isSelected) accent else muted)
          background = backgroundFor(if (isSelected) soft else Color.TRANSPARENT)
          contentDescription = "$name 表情分类"; typeface = if (isSelected) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
        }, LayoutParams(dp(if (scale >= 1.6f) 76 else 60), -2))
      }
      if (landscape) layout.addView(scroll(groups).apply {
        contentDescription = "表情分类栏"
        post { val selected = (0 until groups.childCount).map { groups.getChildAt(it) }.firstOrNull { it.isSelected }; if (selected != null && selected.bottom > height) scrollTo(0, selected.bottom - height) }
      }, LayoutParams(dp(if (scale >= 1.6f) 84 else 68), -1))
      else addView(HorizontalScrollView(context).apply {
        contentDescription = "表情分类栏"; isHorizontalScrollBarEnabled = false; addView(groups)
        post {
          val selected = (0 until groups.childCount).map { groups.getChildAt(it) }.firstOrNull { it.isSelected }
          if (selected != null && selected.right > width) scrollTo(selected.right - width, 0)
        }
      }, LayoutParams(-1, -2))
    }
    val grid = column()
    val columns = if (kaomoji) if (scale >= 1.3f) 1 else 2 else if (scale >= 1.6f) 4 else 5
    val entries = catalog().filter { if (kaomoji) it.group == "kaomoji" else it.group != "kaomoji" && (selectedGroup == "all" || it.group == selectedGroup) }
    entries.chunked(columns).forEach { line ->
      val cells = row()
      repeat(columns) { index ->
        val item = line.getOrNull(index)
        val cell = if (item == null) View(context) else control(if (kaomoji) item.value + "\n" + item.label else item.value) { insert(item.value) }.apply {
          if (!kaomoji) setTextSize(TypedValue.COMPLEX_UNIT_DIP, 28f) else textSize = 14f
          contentDescription = "${item.label} ${item.value}"; background = backgroundFor(paper)
        }
        cells.addView(cell, LayoutParams(0, if (kaomoji) -2 else dp(52), 1f).apply { setMargins(dp(2), dp(2), dp(2), dp(2)) })
      }
      grid.addView(cells)
    }
    layout.addView(scroll(grid), if (landscape) LayoutParams(0, -1, 1f) else LayoutParams(-1, 0, 1f))
    val tools = if (landscape) column() else row()
    tools.addView(control("空格") { insert(" ") }, (if (landscape) LayoutParams(-1, -2) else LayoutParams(0, -2, 3f)).apply { setMargins(dp(2), if (landscape) 0 else dp(4), dp(4), 0) })
    tools.addView(control("删除") { delete() }, (if (landscape) LayoutParams(-1, -2) else LayoutParams(0, -2, 2f)).apply { setMargins(dp(4), if (landscape) 0 else dp(4), dp(2), 0) })
    layout.addView(tools, if (landscape) LayoutParams(dp(80), -1) else LayoutParams(-1, -2))
  }
  private fun loadImage(view: ImageView, id: String) {
    thumbnails[id]?.let { view.setImageBitmap(it); return }
    executor.execute {
      val bitmap = try { thumbnails[id] ?: context.assets.open("stickers/$id.png").use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = 4 }) }?.also { thumbnails[id] = it } } catch (_: Exception) { null }
      view.post { if (!disposed) { if (bitmap != null) view.setImageBitmap(bitmap) else view.contentDescription = "图片预览暂不可用" } }
    }
  }
  private fun library() {
    reset()
    val content = column()
    if (!landscape) {
      content.addView(text("云朵心情", 16f).apply { typeface = Typeface.DEFAULT_BOLD })
      content.addView(text("原创表情 · 点按预览", 12f, muted))
    }
    val columns = if (scale >= 1.6f) 2 else 3
    stickers.chunked(columns).forEach { line ->
      val tiles = row()
      repeat(columns) { index ->
        val sticker = line.getOrNull(index)
        val tile = if (sticker == null) View(context) else column().apply {
          background = backgroundFor(paper); setPadding(dp(4), dp(6), dp(4), dp(4))
          isClickable = true; isFocusable = true; contentDescription = "预览${sticker.second}图片表情"
          accessibilityDelegate = object : View.AccessibilityDelegate() {
            override fun onInitializeAccessibilityNodeInfo(host: View, info: android.view.accessibility.AccessibilityNodeInfo) { super.onInitializeAccessibilityNodeInfo(host, info); info.className = Button::class.java.name }
          }
          val picture = ImageView(context).apply { scaleType = ImageView.ScaleType.FIT_CENTER; importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO }
          addView(picture, LayoutParams(-1, dp(if (landscape) 48 else 76))); loadImage(picture, sticker.first)
          addView(text(sticker.second, 14f).apply { gravity = Gravity.CENTER; importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO })
          isSoundEffectsEnabled = false
          setOnClickListener { feedback(this); preview(sticker.first, sticker.second) }
        }
        tiles.addView(tile, LayoutParams(0, -2, 1f).apply { setMargins(dp(3), dp(8), dp(3), dp(4)) })
      }
      content.addView(tiles)
    }
    if (!allowed) content.addView(text("此输入框暂不使用图片表情。", 12f, muted))
    else if (!richInput) content.addView(text("此输入环境不接收图片，可通过系统分享。", 12f, muted))
    addView(scroll(content), LayoutParams(-1, -1))
  }
  private fun preview(id: String, name: String) {
    reset(); previewId = id
    val layout = if (landscape) row().also { addView(it, LayoutParams(-1, -1)) } else this
    if (!landscape) addView(control("‹ 返回表情包") { library() }.apply { gravity = Gravity.START or Gravity.CENTER_VERTICAL; background = backgroundFor(Color.TRANSPARENT); contentDescription = "返回表情包" }, LayoutParams(-1, -2))
    val content = if (landscape) row() else column()
    val picture = ImageView(context).apply { scaleType = ImageView.ScaleType.FIT_CENTER; contentDescription = "$name 图片预览"; background = shape(paper) }
    content.addView(picture, if (landscape) LayoutParams(dp(80), dp(64)) else LayoutParams(-1, dp(if (scale >= 1.6f) 72 else 104))); loadImage(picture, id)
    message = text(if (!allowed) "密码、私密或专用输入框不使用图片表情。" else if (richInput) "交给当前应用后，可能直接发送。" else "通过系统分享，自行选择应用和联系人。", 12f, muted).apply { accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE }
    content.addView(message, if (landscape) LayoutParams(0, -2, 1f) else LayoutParams(-1, -2))
    layout.addView(scroll(content), if (landscape) LayoutParams(0, -1, 1f) else LayoutParams(-1, 0, 1f))
    val actions = if (landscape) column().apply { gravity = Gravity.CENTER_VERTICAL }.also { layout.addView(it, LayoutParams(dp(164), -1)) } else this
    share = control(if (landscape) "系统分享" else "改用系统分享") { begin(id, true) }.apply { visibility = GONE; contentDescription = "改用系统分享" }
    actions.addView(share, LayoutParams(-1, -2).apply { if (!landscape) topMargin = dp(4) })
    primary = control(if (!allowed) "此处暂不可用" else if (richInput) "使用表情" else "分享表情", true) { begin(id, !richInput) }.apply { isEnabled = allowed }
    actions.addView(primary, LayoutParams(-1, -2).apply { if (!landscape) topMargin = dp(4) })
  }
  private fun begin(id: String, shareOnly: Boolean) {
    if (working || !allowed || previewId != id) return
    working = true; primary.isEnabled = false; share.isEnabled = false; primary.text = "准备中…"
    useSticker(id, shareOnly, generation)
  }
  companion object {
    private val thumbnails = ConcurrentHashMap<String, Bitmap>()
    private val stickers = listOf("hello" to "打招呼", "hug" to "抱抱", "thanks" to "谢谢")
  }
}
