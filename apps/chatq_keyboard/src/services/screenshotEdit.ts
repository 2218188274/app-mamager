import { keyboardBridge } from '../../modules/chatq-keyboard';
import type { Attachment } from './chat';
import { validateScreenshot } from './screenshotReply';
export type ImageRect = { x: number; y: number; width: number; height: number };
export type ScreenshotEdit = { crop: ImageRect; masks: ImageRect[] };
export const fullImage: ImageRect = { x:0, y:0, width:1, height:1 };
export function draggedRect(start: {x:number;y:number}, end: {x:number;y:number}): ImageRect {
  const clamp=(n:number)=>Number.isFinite(n)?Math.min(1,Math.max(0,n)):0;
  const x=Math.min(clamp(start.x),clamp(end.x)),y=Math.min(clamp(start.y),clamp(end.y));
  return {x,y,width:Math.max(clamp(start.x),clamp(end.x))-x,height:Math.max(clamp(start.y),clamp(end.y))-y};
}
export async function editScreenshot(image: Attachment, spec: ScreenshotEdit): Promise<Attachment> {
  validateScreenshot(image);
  const valid=(r:ImageRect)=>r && [r.x,r.y,r.width,r.height].every(Number.isFinite) && r.x>=0 && r.y>=0 && r.width>0 && r.height>0 && r.x+r.width<=1.000001 && r.y+r.height<=1.000001;
  if (!valid(spec.crop)||spec.masks.length>20||!spec.masks.every(valid)) throw new Error('编辑范围无效，请重新框选');
  if (!keyboardBridge?.editReplyScreenshot) throw new Error('请安装新版安卓应用以编辑截图');
  const result:unknown=JSON.parse(await keyboardBridge.editReplyScreenshot(JSON.stringify(image),JSON.stringify(spec)));validateScreenshot(result);return result;
}
