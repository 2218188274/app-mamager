import { TRPCError } from '@trpc/server';
const windows = new Map<string,{at:number;used:number}>();
export function interactionLimit(key:string,limit=20,period=60000) {
  const now=Date.now();if(windows.size>=5000)for(const [id,row] of windows)if(now-row.at>period)windows.delete(id);
  const old=windows.get(key),row=old&&now-old.at<period?old:{at:now,used:0};
  if(row.used>=limit||!old&&windows.size>=5000)throw new TRPCError({code:'TOO_MANY_REQUESTS',message:'操作过于频繁，请稍后重试'});
  row.used++;windows.set(key,row);
}
