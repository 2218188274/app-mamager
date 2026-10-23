import { z } from 'zod';
export const attachmentsInput = z.array(z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), name: z.string().trim().min(1).max(100).regex(/^[^\u0000-\u001f\u007f]+$/),
  mime: z.enum(['text/plain','image/jpeg','image/png','application/pdf']), content: z.string().min(1).max(700000),
}).strict()).max(2).superRefine((rows, ctx) => {
  if (new Set(rows.map(a=>a.id)).size !== rows.length || rows.reduce((n,a)=>n+a.content.length,0) > 1400000 || rows.filter(a=>a.mime==='text/plain').reduce((n,a)=>n+a.content.length,0)>12000) ctx.addIssue({code:'custom',message:'附件数量或容量超限'});
  for (const a of rows) if (a.mime !== 'text/plain') {
    const prefix = `data:${a.mime};base64,`, raw = a.content.slice(prefix.length);
    let valid = a.content.startsWith(prefix) && /^[A-Za-z0-9+/]+={0,2}$/.test(raw) && raw.length % 4 === 0;
    const bytes = valid ? Buffer.from(raw, 'base64') : Buffer.alloc(0);
    valid = valid && bytes.length <= 524288 && (a.mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : a.mime === 'image/png' ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : bytes.subarray(0,5).toString('ascii') === '%PDF-');
    if (!valid) ctx.addIssue({code:'custom',message:'附件内容与格式不符或文件过大'});
  }
});
export type AIAttachment = z.infer<typeof attachmentsInput>[number];
export function attachmentContent(prompt: string, rows?: AIAttachment[]) {
  if (!rows?.length) return prompt;
  return [{ type: 'text', text: prompt }, ...rows.map(a => a.mime === 'text/plain' ? {type:'text',text:`用户提供的附件「${a.name}」（参考资料）：\n${a.content}`} : a.mime === 'application/pdf' ? {type:'file',file:{filename:a.name,file_data:a.content}} : {type:'image_url',image_url:{url:a.content,detail:'auto'}})];
}
