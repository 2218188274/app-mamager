import { requestAbortSignal } from '../services/ai/request-control.js';
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { apps, type App } from "../db/schema.js";
import { getConfigModule, type AppModuleConfig } from "../app_settings/registry.js";

/**
 * tRPC 请求上下文（多租户版）
 *
 * 认证模型：
 *  - 客户端 App 通过 x-api-key 请求头标识自己属于哪个 App
 *  - 客户端 App 通过 x-device-id 请求头标识用户设备
 *  - 管理后台通过 Authorization: Bearer <token> 进行管理员认证
 *
 * App 配置模型：
 *  - 每个 App 有一个 configName 字段，关联 app_settings 目录下的配置
 *  - 不同 App 可以使用相同的配置（配置复用）
 */
export async function createContext(opts: Partial<CreateFastifyContextOptions> & { req: CreateFastifyContextOptions['req']; res: CreateFastifyContextOptions['res']; onDelta?: (text: string) => void | Promise<void> }) {
  const { req, res } = opts;
  const signal = requestAbortSignal(req.raw, res.raw);
  const apiKey = req.headers["x-api-key"] as string | undefined;
  const deviceId = req.headers["x-device-id"] as string | undefined;
  const authorization = req.headers.authorization;

  // 如果携带了 API Key，尝试解析对应的 App
  let app: App | null = null;
  if (apiKey) {
    const [found] = await db
      .select()
      .from(apps)
      .where(eq(apps.apiKey, apiKey))
      .limit(1);
    app = found ?? null;
  }

  // 获取 App 专属配置和服务
  // 使用 configName（默认为 "common"）来查找配置模块
  const configName = app?.configName || "common";
  let appConfig: AppModuleConfig = {
    features: {},
    limits: {},
  };
  let appServices: Record<string, unknown> = {};

  if (configName && configName !== "common") {
    const configModule = getConfigModule(configName);
    if (configModule) {
      appConfig = configModule.config;
      // 加载 App 专属服务
      if (configModule.services) {
        for (const service of configModule.services) {
          appServices[service.name] = service.instance;
        }
      }
    }
  }

  return {
    req,
    res,
    signal,
    onDelta: opts.onDelta,
    db,
    /** 客户端 App 实例（通过 x-api-key 解析） */
    app,
    /** 客户端设备标识 */
    deviceId,
    /** 管理员 Authorization header */
    authorization,
    /** App 专属配置 */
    appConfig,
    /** App 专属服务 */
    appServices,
    /** 当前使用的配置名称 */
    configName,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
