import { inArray } from 'drizzle-orm';
import { router, protectedProcedure } from '../../../trpc/index.js';
import { chatqPersonaTags } from '../../../db/schema.js';
import { conversationInput, conversationStyle } from '../../../services/ai/conversation.js';
import { generateUserReply } from '../../../services/ai/user-reply.js';

export const conversationRouter = router({
  send: protectedProcedure.input(conversationInput).mutation(async ({ ctx, input }) => {
    ctx.signal?.throwIfAborted();
    const weights = input.personaTagWeights ?? {}, ids = Object.keys(weights);
    const rows = ids.length ? await ctx.db.select({ tagId: chatqPersonaTags.tagId, name: chatqPersonaTags.name }).from(chatqPersonaTags).where(inArray(chatqPersonaTags.tagId, ids)) : [];
    const tags = rows.map(tag => `${tag.name}(${weights[tag.tagId]})`);
    const response = await generateUserReply(ctx, { requestId: input.requestId, intent: 'chat', text: input.prompt, onDelta: ctx.onDelta,
      history: input.history, stylePrompt: conversationStyle(input, tags), maxTokens: 1000, candidateCount: 1 });
    return { reply: response.replies[0].content, usage: response.usage };
  }),
});
