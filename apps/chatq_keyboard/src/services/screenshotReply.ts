import type { Attachment } from './chat';
export type ScreenshotSide = 'left' | 'right';
export function validateScreenshot(value: unknown): asserts value is Attachment {
  const v = value as Attachment;
  if (!v || typeof v !== 'object' || Object.keys(v).sort().join(',') !== 'content,id,mime,name' || typeof v.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(v.id) || typeof v.name !== 'string' || !v.name.length || v.name.length > 100 || /[\u0000-\u001f\u007f]/.test(v.name) || !['image/jpeg','image/png'].includes(v.mime) || typeof v.content !== 'string' || v.content.length > 700000 || !new RegExp('^data:' + v.mime + ';base64,[A-Za-z0-9+/]+={0,2}$').test(v.content)) throw new Error('截图格式无效，请重新选择清晰图片');
}
