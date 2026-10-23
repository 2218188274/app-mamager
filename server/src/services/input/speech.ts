import { TRPCError } from '@trpc/server';

/** Accept exactly the PCM WAV produced by the app, not arbitrary containers or URLs. */
export function validateWav(audio: string): { buffer: Buffer; durationMs: number } {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(audio) || audio.length > 854000) throw new TRPCError({code:'BAD_REQUEST',message:'录音格式不正确或超过 20 秒'});
  const buffer = Buffer.from(audio, 'base64');
  if (buffer.length < 12844 || buffer.length > 640044 || buffer.toString('ascii',0,4) !== 'RIFF' || buffer.readUInt32LE(4) !== buffer.length - 8 || buffer.toString('ascii',8,16) !== 'WAVEfmt ' || buffer.readUInt32LE(16) !== 16 || buffer.readUInt16LE(20) !== 1 || buffer.readUInt16LE(22) !== 1 || buffer.readUInt32LE(24) !== 16000 || buffer.readUInt32LE(28) !== 32000 || buffer.readUInt16LE(32) !== 2 || buffer.readUInt16LE(34) !== 16 || buffer.toString('ascii',36,40) !== 'data' || buffer.readUInt32LE(40) !== buffer.length - 44 || (buffer.length - 44) % 2 !== 0) throw new TRPCError({code:'BAD_REQUEST',message:'需要 16kHz 单声道 PCM 录音（0.4–20 秒）'});
  let energy = 0;
  for (let i=44;i<buffer.length;i+=2) { const value=buffer.readInt16LE(i); energy += value*value; }
  if (Math.sqrt(energy / ((buffer.length - 44) / 2)) < 100) throw new TRPCError({code:'BAD_REQUEST',message:'没有听清声音，请靠近麦克风后重录'});
  return {buffer,durationMs:Math.round((buffer.length - 44) / 32)};
}
let active = 0;
export async function transcribeWav(audio: string, language: 'zh' | 'en', endpoint = process.env.CHATQ_SPEECH_URL) {
  const {buffer,durationMs} = validateWav(audio);
  if (!endpoint) throw new TRPCError({code:'PRECONDITION_FAILED',message:'服务器尚未启用语音识别'});
  if (active >= 1) throw new TRPCError({code:'TOO_MANY_REQUESTS',message:'语音服务正忙，请稍后手动重试'});
  active++;
  try {
    const form = new FormData(); form.append('file',new Blob([new Uint8Array(buffer)],{type:'audio/wav'}),'speech.wav');
    form.append('language',language); form.append('response_format','json'); form.append('temperature','0.0'); form.append('temperature_inc','0.0');
    if (language === 'zh') form.append('prompt','以下是简体中文普通话转写。常见词：聊商、键盘、语音输入、云词库。');
    const response = await fetch(endpoint,{method:'POST',body:form,signal:AbortSignal.timeout(90000),redirect:'error'});
    if (!response.ok) throw new Error('upstream');
    const data = await response.json() as {text?:unknown};
    const text = typeof data.text === 'string' ? data.text.trim().replace(/\[[^\]]{0,80}\]/g,'').trim().slice(0,1000) : '';
    if (!text) throw new TRPCError({code:'BAD_REQUEST',message:'没有识别到清晰语音，请重录'});
    return {text,language,durationMs,engine:process.env.CHATQ_SPEECH_MODEL || 'whisper-base'};
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({code:'BAD_GATEWAY',message:'语音识别暂不可用或超时，请稍后手动重试'});
  } finally { active--; }
}
