package expo.modules.chatqkeyboard

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder

internal class VoiceRecorder(private val context: Context) {
  @Volatile private var running = false
  private var recorder: AudioRecord? = null
  private var thread: Thread? = null
  private val bytes = ByteArrayOutputStream()
  @Volatile private var failure: String? = null
  fun start(onLimit: () -> Unit) {
    check(context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) { "请允许麦克风权限" }
    bytes.reset(); failure = null
    val size = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT).coerceAtLeast(4096)
    val audio = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, 16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, size)
    if (audio.state != AudioRecord.STATE_INITIALIZED) { audio.release(); error("麦克风无法启动，请关闭其他录音应用后重试") }
    recorder = audio; audio.startRecording()
    check(audio.recordingState == AudioRecord.RECORDSTATE_RECORDING) { "麦克风被占用" }
    running = true
    thread = Thread({
      val buffer = ByteArray(2048)
      try {
        while (running && bytes.size() < 640000) {
          val count = audio.read(buffer, 0, minOf(buffer.size, 640000 - bytes.size()))
          if (count > 0) bytes.write(buffer, 0, count) else if (running) { failure = "录音中断，请重试"; break }
        }
      } catch (_: Exception) { if (running) failure = "录音中断，请重试" }
      finally { if (running) { running = false; Handler(Looper.getMainLooper()).post(onLimit) } }
    }, "chatq-voice-record").also { it.start() }
  }
  fun stop(): ByteArray {
    running = false
    try { recorder?.stop() } catch (_: Exception) { }
    thread?.join(1200); recorder?.release(); recorder = null; thread = null
    failure?.let { error(it) }
    val pcm = bytes.toByteArray(); bytes.reset()
    check(pcm.size >= 12800) { "录音太短，请至少说半秒钟" }
    return wav(pcm)
  }
  fun cancel() { try { stop() } catch (_: Exception) { }; bytes.reset() }
  companion object {
    fun wav(pcm: ByteArray): ByteArray = ByteBuffer.allocate(44 + pcm.size).order(ByteOrder.LITTLE_ENDIAN).apply {
      put("RIFF".toByteArray()); putInt(36 + pcm.size); put("WAVEfmt ".toByteArray()); putInt(16); putShort(1); putShort(1); putInt(16000); putInt(32000); putShort(2); putShort(16); put("data".toByteArray()); putInt(pcm.size); put(pcm)
    }.array()
  }
}
