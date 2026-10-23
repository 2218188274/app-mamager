import { FastifyInstance, FastifyRequest } from "fastify";
import { TRPCError, callTRPCProcedure } from "@trpc/server";
import { appRouter } from "../trpc/router.js";
import { createContext } from "../trpc/context.js";
import { and,eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { chatqPaymentOrders } from '../db/schema.js';
import { loadPaymentConfig,verifyPaymentSignature,verifyPaymentOrder } from '../services/payments/jeepay.js';
import { reconcilePayment,paymentView } from '../services/payments/orders.js';

/**
 * REST 到 tRPC 适配层
 *
 * 移动端使用 REST API 路径（/api/*），但服务端使用 tRPC 路径（/trpc/*）。
 * 此适配层将 REST 请求转换为 tRPC 调用，保持移动端接口不变。
 *
 * 路由映射：
 * - POST /api/subscription/verify → subscription.verify (protected)
 * - GET  /api/subscription/status → subscription.status (protected)
 * - POST /api/subscription/restore → subscription.restore (protected)
 * - POST /api/ai/generate → ai.generate (protected)
 * - GET  /api/ai/models → ai.models (protected)
 * - POST /api/user/register → user.register (app)
 * - POST /api/user/refresh → user.refresh (protected)
 */

/**
 * 错误映射：将 tRPC 错误转换为 HTTP 状态码
 */
function mapTRPCErrorToHTTP(error: TRPCError): { statusCode: number; message: string } {
  switch (error.code) {
    case "UNAUTHORIZED":
      return { statusCode: 401, message: error.message };
    case "FORBIDDEN":
      return { statusCode: 403, message: error.message };
    case "NOT_FOUND":
      return { statusCode: 404, message: error.message };
    case "BAD_REQUEST":
      return { statusCode: 400, message: error.message };
    case "TOO_MANY_REQUESTS":
      return { statusCode: 429, message: error.message };
    case "CONFLICT":
      return { statusCode: 409, message: error.message };
    case "CLIENT_CLOSED_REQUEST":
      return { statusCode: 499, message: error.message };
    case "BAD_GATEWAY":
      return { statusCode: 502, message: error.message };
    case "PRECONDITION_FAILED":
      return { statusCode: 412, message: error.message };
    case "INTERNAL_SERVER_ERROR":
      return { statusCode: 500, message: error.message };
    default:
      return { statusCode: 500, message: "Internal server error" };
  }
}

/**
 * 创建 tRPC 调用器
 * 使用 callTRPCProcedure 直接调用过程，避免 createCallerFactory
 */
async function createTRPCCaller(req: FastifyRequest, res: any, onDelta?: (text: string) => void | Promise<void>) {
  const context = await createContext({ req, res, onDelta });


  // 返回一个代理对象，将 query/mutation 调用转发给 callTRPCProcedure
  return {
    query: async (path: string) => {
      return await callTRPCProcedure({
        ctx: context,
        path,
        input: undefined,
        type: 'query',
        router: appRouter,
        getRawInput: async () => undefined,
        signal: context.signal,
      });
    },
    mutation: async (path: string, input: unknown) => {
      return await callTRPCProcedure({
        ctx: context,
        path,
        input,
        type: 'mutation',
        router: appRouter,
        getRawInput: async () => input,
        signal: context.signal,
      });
    },
  };
}

/**
 * 注册 REST 适配层路由
 */
export async function registerRestAdapter(server: FastifyInstance, callerFactory = createTRPCCaller) {
  for (const [path, procedure, method] of [
    ['/api/aikeyboard/lexicon/version','chatq.input.version','GET'],
    ['/api/aikeyboard/lexicon','chatq.input.lookup','POST'],
    ['/api/aikeyboard/transcribe','chatq.input.transcribe','POST'],
  ] as const) {
    server.route({method,url:path,bodyLimit:900000,handler:async(request,reply)=>{
      reply.header('Cache-Control','no-store');
      try {const caller=await callerFactory(request,reply);const data=method==='GET'?await caller.query(procedure):await caller.mutation(procedure,request.body);return reply.send({success:true,data});}
      catch(error) {const mapped=error instanceof TRPCError?mapTRPCErrorToHTTP(error):{statusCode:500,message:'输入服务暂不可用'};return reply.status(mapped.statusCode).send({success:false,error:{message:mapped.message}});}
    }});
  }
  // ==================== 订阅相关路由 ====================

  /**
   * POST /api/subscription/verify
   * 验证 App Store / Google Play 收据
   */
  server.post("/api/subscription/verify", async (request, reply) => {
    try {
      const caller = await callerFactory(request, reply);
      const result = await caller.mutation("subscription.verify", request.body);

      return reply.status(200).send({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error instanceof TRPCError) {
        const { statusCode, message } = mapTRPCErrorToHTTP(error);
        return reply.status(statusCode).send({
          success: false,
          error: {
            code: error.code,
            message,
          },
        });
      }

      console.error("Subscription verify error:", error);
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error",
        },
      });
    }
  });

  /**
   * GET /api/subscription/status
   * 查询当前用户订阅状态
   */
  server.get("/api/subscription/status", async (request, reply) => {
    try {
      const caller = await callerFactory(request, reply);
      const result = await caller.query("subscription.status");

      return reply.status(200).send({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error instanceof TRPCError) {
        const { statusCode, message } = mapTRPCErrorToHTTP(error);
        return reply.status(statusCode).send({
          success: false,
          error: {
            code: error.code,
            message,
          },
        });
      }

      console.error("Subscription status error:", error);
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error",
        },
      });
    }
  });

  /**
   * POST /api/subscription/restore
   * 恢复购买
   */
  server.post("/api/subscription/restore", async (request, reply) => {
    try {
      const caller = await callerFactory(request, reply);
      const result = await caller.mutation("subscription.restore", request.body);

      return reply.status(200).send({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error instanceof TRPCError) {
        const { statusCode, message } = mapTRPCErrorToHTTP(error);
        return reply.status(statusCode).send({
          success: false,
          error: {
            code: error.code,
            message,
          },
        });
      }

      console.error("Subscription restore error:", error);
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error",
        },
      });
    }
  });

  // ==================== AI 相关路由 ====================

  /**
   * POST /api/ai/generate
   * 生成 AI 回复
   */
  server.post("/api/ai/generate", async (request, reply) => {
    try {
      const caller = await callerFactory(request, reply);
      const result = await caller.mutation("ai.generate", request.body);

      return reply.status(200).send({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error instanceof TRPCError) {
        const { statusCode, message } = mapTRPCErrorToHTTP(error);
        return reply.status(statusCode).send({
          success: false,
          error: {
            code: error.code,
            message,
          },
        });
      }

      console.error("AI generate error:", error);
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error",
        },
      });
    }
  });

  /**
   * GET /api/ai/models
   * 获取可用的 AI 模型列表
   */
  server.get("/api/ai/models", async (request, reply) => {
    try {
      const caller = await callerFactory(request, reply);
      const result = await caller.query("ai.models");

      return reply.status(200).send({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error instanceof TRPCError) {
        const { statusCode, message } = mapTRPCErrorToHTTP(error);
        return reply.status(statusCode).send({
          success: false,
          error: {
            code: error.code,
            message,
          },
        });
      }

      console.error("AI models error:", error);
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error",
        },
      });
    }
  });

  // ==================== 用户相关路由 ====================

  /**
   * POST /api/user/register
   * 设备注册
   */
  server.post("/api/user/register", async (request, reply) => {
    try {
      const caller = await callerFactory(request, reply);
      const result = await caller.mutation("user.register", request.body);

      return reply.status(200).send({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error instanceof TRPCError) {
        const { statusCode, message } = mapTRPCErrorToHTTP(error);
        return reply.status(statusCode).send({
          success: false,
          error: {
            code: error.code,
            message,
          },
        });
      }

      console.error("User register error:", error);
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error",
        },
      });
    }
  });

  /**
   * POST /api/user/refresh
   * 刷新 Token
   */
  server.post("/api/user/refresh", async (request, reply) => {
    try {
      const caller = await callerFactory(request, reply);
      const result = await caller.mutation("user.refresh", {});

      return reply.status(200).send({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error instanceof TRPCError) {
        const { statusCode, message } = mapTRPCErrorToHTTP(error);
        return reply.status(statusCode).send({
          success: false,
          error: {
            code: error.code,
            message,
          },
        });
      }

      console.error("User refresh error:", error);
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error",
        },
      });
    }
  });

  // ==================== ChatQ 键盘 ====================
  server.get('/api/aikeyboard/account', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    try { const caller = await callerFactory(request, reply); return reply.send({ success: true, data: await caller.query('chatq.customReply.account') }); }
    catch(error) { const mapped = error instanceof TRPCError ? mapTRPCErrorToHTTP(error) : { statusCode: 500, message: '额度暂时无法读取' }; return reply.status(mapped.statusCode).send({ success: false, error: { message: mapped.message } }); }
  });


  server.get('/api/aikeyboard/payments',async(request,reply)=>{
    try{const caller=await callerFactory(request,reply);return reply.send({success:true,data:await caller.query('chatq.payments.list')});}catch(error){if(error instanceof TRPCError){const m=mapTRPCErrorToHTTP(error);return reply.status(m.statusCode).send({success:false,error:{message:m.message}});}return reply.status(500).send({success:false,error:{message:'订单读取失败'}});}
  });
  for(const action of ['create','check'] as const)server.post('/api/aikeyboard/payments/'+action,{bodyLimit:2048},async(request,reply)=>{
    try{const caller=await callerFactory(request,reply);return reply.send({success:true,data:await caller.mutation('chatq.payments.'+action,request.body)});}catch(error){if(error instanceof TRPCError){const m=mapTRPCErrorToHTTP(error);return reply.status(m.statusCode).send({success:false,error:{message:m.message}});}return reply.status(500).send({success:false,error:{message:'支付操作失败，请查询原订单'}});}
  });
  if(!server.hasContentTypeParser('application/x-www-form-urlencoded'))server.addContentTypeParser('application/x-www-form-urlencoded',{parseAs:'string',bodyLimit:32768},(_request,body,done)=>{
    try{const values:Record<string,string>={};for(const [key,value]of new URLSearchParams(body as string)){if(Object.hasOwn(values,key))throw new Error();Object.defineProperty(values,key,{value,enumerable:true});}done(null,values);}catch{done(new Error('回调格式无效'));}
  });
  server.post('/api/aikeyboard/payments/notify',{bodyLimit:32768},async(request,reply)=>{
    try{
      const config=loadPaymentConfig();if(!config)throw new Error();const data=request.body as Record<string,unknown>;if(!data||typeof data!=='object'||Array.isArray(data))throw new Error();verifyPaymentSignature(data,config.secret);
      if(typeof data.mchOrderNo!=='string'||!/^CQ[a-f0-9]{28}$/.test(data.mchOrderNo))throw new Error();
      const [order]=await db.select().from(chatqPaymentOrders).where(and(eq(chatqPaymentOrders.orderNo,data.mchOrderNo),eq(chatqPaymentOrders.appId,config.appId))).limit(1);if(!order)throw new Error();
      const receipt=verifyPaymentOrder(data,order,config);const checked=await reconcilePayment(config,order.id,db,receipt.transactionId);
      if(receipt.state===2&&(checked.status!=='paid'||checked.transactionId!==receipt.transactionId))throw new Error();
      return reply.type('text/plain').send('SUCCESS');
    }catch{return reply.status(400).type('text/plain').send('FAIL');}
  });
  for (const action of ['create','read','write'] as const) server.post('/api/aikeyboard/sync/'+action, {bodyLimit:13*1024*1024}, async(request,reply)=>{
    try {const caller=await callerFactory(request,reply);return reply.send({success:true,data:await caller.mutation('chatq.sync.'+action,request.body)});}
    catch(error){if(error instanceof TRPCError){const mapped=mapTRPCErrorToHTTP(error);return reply.status(mapped.statusCode).send({success:false,error:{message:mapped.message}});}return reply.status(500).send({success:false,error:{message:'同步服务暂不可用，请稍后重试'}});}
  });
  server.post('/api/aikeyboard/chat/stream', { bodyLimit: 2000000 }, async (request, reply) => {
    let started = false;
    const write = async (event: object) => {
      if (reply.raw.destroyed) throw new Error('连接已关闭');
      if (!started) {
        started = true; reply.hijack();
        reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' });
        reply.raw.flushHeaders();
      }
      if (!reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)) await new Promise<void>((resolve, reject) => {
        const cleanup = () => { reply.raw.off('drain', drained); reply.raw.off('close', closed); reply.raw.off('error', closed); };
        const drained = () => { cleanup(); resolve(); }, closed = () => { cleanup(); reject(new Error('连接已关闭')); };
        reply.raw.once('drain', drained); reply.raw.once('close', closed); reply.raw.once('error', closed);
        if (reply.raw.destroyed) closed();
      });
    };
    try {
      const caller = await callerFactory(request, reply, text => write({ type: 'delta', text }));
      const data = await caller.mutation('chatq.conversation.send', request.body);
      // The user transaction has committed before the terminal event.
      await write({ type: 'done', ...data as object }); reply.raw.end();
    } catch (error) {
      const mapped = error instanceof TRPCError ? mapTRPCErrorToHTTP(error) : { statusCode: 502, message: 'AI 对话连接中断，请手动重试' };
      if (!started) return reply.header('Cache-Control', 'no-store').status(mapped.statusCode).send({ success: false, error: { message: mapped.message } });
      if (!reply.raw.destroyed) { try { await write({ type: 'error', message: mapped.message }); } finally { reply.raw.end(); } }
    }
  });

  server.post('/api/aikeyboard/chat', { bodyLimit: 2000000 }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    try { const caller = await callerFactory(request, reply); return reply.send({ success: true, data: await caller.mutation('chatq.conversation.send', request.body) }); }
    catch(error) { const mapped = error instanceof TRPCError ? mapTRPCErrorToHTTP(error) : { statusCode: 500, message: 'AI 对话暂不可用，请稍后手动重试' }; return reply.status(mapped.statusCode).send({ success: false, error: { message: mapped.message } }); }
  });

  server.post('/api/aikeyboard/topics', { bodyLimit: 16384 }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    try {
      const caller = await callerFactory(request, reply);
      if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) {
        return reply.status(400).send({ success: false, error: { message: '请求内容必须是 JSON 对象' } });
      }
      const body = request.body;
      const data = await caller.mutation('chatq.customReply.generate', { ...body, purpose: 'topic' });
      return reply.send({ success: true, data });
    } catch (error) {
      const mapped = error instanceof TRPCError ? mapTRPCErrorToHTTP(error) : { statusCode: 500, message: '话题生成失败，请稍后重试' };
      return reply.status(mapped.statusCode).send({ success: false, error: { message: mapped.message } });
    }
  });

  /**
   * POST /api/aikeyboard/reply
   * 生成回复（支持人设/场景/关系/多候选）
   */
  server.post("/api/aikeyboard/reply", async (request, reply) => {
    try {
      const caller = await callerFactory(request, reply);
      const result = await caller.mutation("chatq.customReply.generate", request.body);

      return reply.status(200).send({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error instanceof TRPCError) {
        const { statusCode, message } = mapTRPCErrorToHTTP(error);
        return reply.status(statusCode).send({
          success: false,
          error: { code: error.code, message },
        });
      }
      console.error("ChatQ generate error:", error);
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error",
        },
      });
    }
  });

  // ==================== 健康检查 ====================

  /**
   * GET /api/health
   * REST 适配层健康检查
   */
  server.get("/api/health", async (request, reply) => {
    return reply.status(200).send({
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "REST Adapter Layer",
      version: "1.0.0",
    });
  });

  console.log("REST 适配层路由注册完成");
}
