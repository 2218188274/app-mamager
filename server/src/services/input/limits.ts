import { TRPCError } from '@trpc/server';
/** Bounded in-memory counters contain opaque app/user IDs, no input or audio. */
export class InputLimits {
  private buckets = new Map<string,{minute:number;minuteCount:number;day:number;dayCount:number}>();
  check(appId:string,userId:string,kind:'lookup'|'speech',now=Date.now()) {
    const minute=Math.floor(now/60000), day=Math.floor(now/86400000), key=`${appId}:${userId}:${kind}`;
    if(this.buckets.size>10000) for(const [id,bucket] of this.buckets) if(bucket.day<day) this.buckets.delete(id);
    if(this.buckets.size>20000 && !this.buckets.has(key)) throw new TRPCError({code:'TOO_MANY_REQUESTS',message:'输入服务繁忙，请稍后重试'});
    const bucket=this.buckets.get(key) || {minute,minuteCount:0,day,dayCount:0};
    if(bucket.minute!==minute) {bucket.minute=minute;bucket.minuteCount=0;}
    if(bucket.day!==day) {bucket.day=day;bucket.dayCount=0;}
    if(bucket.minuteCount >= (kind==='lookup'?240:6) || (kind==='speech' && bucket.dayCount>=120)) throw new TRPCError({code:'TOO_MANY_REQUESTS',message:kind==='speech'?'语音使用次数较多，请稍后再试':'云词库请求较快，请稍后再试'});
    bucket.minuteCount++;bucket.dayCount++;this.buckets.set(key,bucket);
  }
}
export const inputLimits = new InputLimits();
