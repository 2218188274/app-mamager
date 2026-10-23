import {z} from 'zod';
import {TRPCError} from '@trpc/server';
import {protectedProcedure,router} from '../../../trpc/index.js';
import {getCloudLexicon} from '../../../services/input/lexicon.js';
import {transcribeWav} from '../../../services/input/speech.js';
import {inputLimits} from '../../../services/input/limits.js';

const inputProcedure=protectedProcedure.use(async({ctx,next})=>{
  if(ctx.configName!=='chatq' || ctx.user?.status!=='active') throw new TRPCError({code:'FORBIDDEN',message:'当前应用或用户不可使用输入服务'});
  return next({ctx});
});
export const inputRouter=router({
  version:inputProcedure.query(()=>{const dictionary=getCloudLexicon();return {version:dictionary.version,entries:dictionary.entries,speechEnabled:Boolean(process.env.CHATQ_SPEECH_URL),maxRecordingSeconds:20};}),
  lookup:inputProcedure.input(z.object({code:z.string().min(2).max(39),layout:z.enum(['qwerty','nine'])}).refine(value=>value.layout==='nine'?/^[2-9]+$/.test(value.code):/^[a-z]+(?:'[a-z]+)*$/.test(value.code),'无效拼音码')).mutation(({ctx,input})=>{
    inputLimits.check(ctx.app.id,ctx.userId,'lookup');const dictionary=getCloudLexicon();return {version:dictionary.version,candidates:dictionary.lookup(input.code,input.layout)};
  }),
  transcribe:inputProcedure.input(z.object({audio:z.string().min(60).max(854000),language:z.enum(['zh','en'])})).mutation(async({ctx,input})=>{
    inputLimits.check(ctx.app.id,ctx.userId,'speech');return transcribeWav(input.audio,input.language);
  }),
});
