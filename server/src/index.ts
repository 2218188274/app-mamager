import "dotenv/config";
import fastify from "fastify";
import {
  fastifyTRPCPlugin,
  FastifyTRPCPluginOptions,
} from "@trpc/server/adapters/fastify";
import { createContext } from "./trpc/context.js";

import { checkEmailConfig } from "./utils/email.js";


// 导入并注册 App 配置模块
import "./app_settings/common/index.js";
import "./app_settings/chatq/index.js";
import { getRegisteredConfigNames } from "./app_settings/registry.js";
import { appRouter, type AppRouter } from "./trpc/router.js";
import { registerRestAdapter } from "./routers/rest-adapter.js";

/**
 * 多 App 管理后台服务
 * 基于 Fastify + tRPC + Drizzle ORM + PostgreSQL
 */
async function main() {
  // 检查邮件服务配置
  checkEmailConfig();

  const server = fastify({
    maxParamLength: 5000,
    logger: {
      level: "info",
      transport: {
        target: "pino-pretty",
        options: { colorize: true },
      },
    },
  });

  // CORS：建议生产环境设置 CORS_ORIGIN 或 ADMIN_ORIGIN 为管理后台地址，未设置时允许任意（*）
  const corsOrigin = process.env.CORS_ORIGIN ?? process.env.ADMIN_ORIGIN ?? "*";
  const corsOrigins = corsOrigin.split(',').map(value => value.trim());

  server.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    reply.header('Vary', 'Origin');
    if (corsOrigins.includes('*')) reply.header('Access-Control-Allow-Origin', '*');
    else if (origin && corsOrigins.includes(origin)) reply.header('Access-Control-Allow-Origin', origin);
    reply.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS"
    );
    reply.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, x-api-key, x-device-id, x-app-id"
    );

    if (request.method === "OPTIONS") {
      reply.status(204).send();
    }
  });

  // 注册 tRPC 插件
  server.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext,
      onError({ path, error }) {
        console.error(`tRPC Error [${path}]:`, error.message);
      },
    } satisfies FastifyTRPCPluginOptions<AppRouter>["trpcOptions"],
  });

  // 注册 REST 适配层路由
  await registerRestAdapter(server);

  // 健康检查端点
  server.get("/health", async () => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "Multi-App Management Server",
      version: "0.6.0",
    };
  });

  // 注册 Webhook 路由
  server.register(async (fastify) => {
    // Apple Store Server Notifications V2 Webhook
    const appleWebhook = await import("./routers/webhook.js");
    fastify.register(appleWebhook.default, { prefix: "/webhook" });
  });

  // 启动服务
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || "0.0.0.0";

  try {
    await server.listen({ port, host });

    // 获取已注册的配置列表
    const registeredConfigs = getRegisteredConfigNames();
    const configListStr = registeredConfigs.length > 0
      ? `\n║  App配置:  ${registeredConfigs.join(", ")}`
      : "";

    console.log(`
╔═══════════════════════════════════════════════════╗
║        Multi-App Management Server                ║
╠═══════════════════════════════════════════════════╣
║  地址:   http://${host}:${port}                     ║
║  tRPC:   http://${host}:${port}/trpc                ║
║  REST:   http://${host}:${port}/api/*               ║
║  健康:   http://${host}:${port}/health              ║
╠═══════════════════════════════════════════════════╣
║  管理后台:  admin.* / app.*                        ║
║  客户端:    user.* / ai.* / style.* / subscription.*║
║  REST适配: /api/user/* /api/ai/* /api/subscription/*${configListStr}
╚═══════════════════════════════════════════════════╝
    `);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

main();
