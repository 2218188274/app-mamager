import { createHash } from "node:crypto";
import type { AppSettings, AIProviderConfig, AIProviderType } from "../../db/schema.js";
import type { AIProvider, AIGenerateRequest, AIGenerateResponse, AIServiceOptions } from "./types.js";
import { AIServiceError, InvalidConfigError } from "./types.js";

/**
 * AI 服务管理器
 * 管理多个 AI 提供商，支持故障转移、负载均衡、缓存等
 */
export class AIService {
  /** 已注册的提供商工厂函数 */
  private providerFactories = new Map<AIProviderType, (config: AIProviderConfig) => AIProvider>();

  /** 当前 App 的 AI 提供商实例缓存 */
  private providerInstances = new Map<string, Map<AIProviderType, AIProvider>>();

  private configVersions = new Map<string, string>();

  /** 服务选项 */
  private options: AIServiceOptions;

  /** 内存缓存（简单的实现，生产环境建议使用 Redis） */
  private cache = new Map<string, { response: AIGenerateResponse; timestamp: number }>();

  constructor(options: AIServiceOptions = {}) {
    this.options = {
      enableCache: false,
      cacheTTL: 5 * 60 * 1000, // 5分钟
      maxRetries: 2,
      timeout: 30000, // 30秒
      verbose: process.env.NODE_ENV === "development",
      ...options,
    };
  }

  /**
   * 注册提供商工厂
   */
  registerProvider(type: AIProviderType, factory: (config: AIProviderConfig) => AIProvider): void {
    this.providerFactories.set(type, factory);
    if (this.options.verbose) {
      console.log(`[AIService] 注册提供商: ${type}`);
    }
  }

  /**
   * 初始化 App 的 AI 提供商
   */
  initializeApp(appId: string, appSettings: AppSettings): void {
    const version = createHash("sha256").update(JSON.stringify(appSettings)).digest("hex");
    if (this.configVersions.get(appId) === version) return;
    this.configVersions.set(appId, version);
    this.providerInstances.delete(appId);
    this.clearCache();
    if (!appSettings.enableAI) {
      if (this.options.verbose) {
        console.log(`[AIService] App ${appId} 未启用 AI 功能`);
      }
      return;
    }

    const configured = appSettings.aiProviders || [];
    // A real provider failure must never turn into a simulated success.
    const hasRealProvider = configured.some(p => p.enabled && p.type !== "mock");
    const providers = configured.filter(p => !hasRealProvider || p.type !== "mock");
    const appProviders = new Map<AIProviderType, AIProvider>();

    for (const config of providers) {
      if (!config.enabled) {
        continue;
      }

      try {
        const provider = this.createProvider(config);
        if (provider && provider.isAvailable()) {
          appProviders.set(config.type, provider);
          if (this.options.verbose) {
            console.log(`[AIService] App ${appId} 初始化提供商: ${config.type}`);
          }
        }
      } catch (error) {
        console.error(`[AIService] App ${appId} 初始化提供商 ${config.type} 失败:`, error);
      }
    }

    this.providerInstances.set(appId, appProviders);

    if (this.options.verbose) {
      console.log(`[AIService] App ${appId} 初始化完成，可用提供商: ${Array.from(appProviders.keys()).join(", ")}`);
    }
  }

  /**
   * 生成 AI 回复
   */
  async generate(request: AIGenerateRequest): Promise<AIGenerateResponse> {
    request.signal?.throwIfAborted();
    const { appId, text } = request;

    // 检查缓存
    const cacheKey = this.getCacheKey(request);
    if (this.options.enableCache && request.intent !== 'chat') {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.options.cacheTTL!) {
        if (this.options.verbose) {
          console.log(`[AIService] 使用缓存回复: ${cacheKey}`);
        }
        return cached.response;
      }
    }

    // 获取 App 的提供商
    const appProviders = this.providerInstances.get(appId);
    if (!appProviders || appProviders.size === 0) {
      throw new AIServiceError(`App ${appId} 未配置可用的 AI 提供商`, "unknown");
    }

    // 按优先级排序提供商
    const providers = Array.from(appProviders.entries())
      .map(([type, provider]) => ({ type, provider, priority: this.getProviderPriority(type, appId) }))
      .sort((a, b) => a.priority - b.priority);

    let lastError: Error | null = null;

    // 尝试每个提供商（故障转移）
    for (const { type, provider } of providers) {
      if (!provider.isAvailable()) {
        if (this.options.verbose) {
          console.log(`[AIService] 提供商 ${type} 不可用，跳过`);
        }
        continue;
      }

      try {
        if (this.options.verbose) {
          console.log(`[AIService] 使用提供商 ${type} 生成${request.intent === "chat" ? "对话" : "回复"}`);
        }

        const response = await this.executeWithTimeout(
          signal => provider.generate({ ...request, signal }),
          ((provider as any).config?.timeout ?? (type === "openai" ? 60000 : this.options.timeout!)) + 1000,
          type, request.signal
        );
        request.signal?.throwIfAborted();

        // 缓存响应
        if (this.options.enableCache && request.intent !== 'chat') {
          this.cache.set(cacheKey, {
            response,
            timestamp: Date.now(),
          });
        }

        return response;
      } catch (error) {
        request.signal?.throwIfAborted();
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`[AIService] 提供商 ${type} 生成失败:`, lastError.message);

        if (request.onDelta) throw lastError; // Never mix streams or silently start another paid request.

        // 如果是超时错误，继续尝试下一个提供商
        if (error instanceof Error && error.message.includes("timeout")) {
          continue;
        }
      }
    }

    // 所有提供商都失败
    throw lastError || new AIServiceError("所有 AI 提供商均失败", "unknown");
  }

  /**
   * 获取 App 的健康状态
   */
  getAppHealth(appId: string): Array<{
    type: AIProviderType;
    available: boolean;
    priority: number;
    lastError?: string;
    latency?: number;
  }> {
    const appProviders = this.providerInstances.get(appId);
    if (!appProviders) {
      return [];
    }

    return Array.from(appProviders.entries()).map(([type, provider]) => ({
      type,
      available: provider.isAvailable(),
      priority: this.getProviderPriority(type, appId),
    }));
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
    if (this.options.verbose) {
      console.log(`[AIService] 缓存已清除`);
    }
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): {
    size: number;
    hitRate: number;
    ttl: number;
  } {
    // 简化实现
    return {
      size: this.cache.size,
      hitRate: 0, // 实际实现需要跟踪命中率
      ttl: this.options.cacheTTL!,
    };
  }

  /**
   * 创建提供商实例
   */
  private createProvider(config: AIProviderConfig): AIProvider {
    const factory = this.providerFactories.get(config.type);
    if (!factory) {
      throw new InvalidConfigError(config.type, `未注册的提供商类型: ${config.type}`);
    }

    const provider = factory(config);
    if (!provider.validateConfig(config)) {
      throw new InvalidConfigError(config.type, "提供商配置无效");
    }

    return provider;
  }

  /**
   * 获取提供商优先级
   */
  private getProviderPriority(type: AIProviderType, appId: string): number {
    const appProviders = this.providerInstances.get(appId);
    if (!appProviders) {
      return 100;
    }

    const provider = appProviders.get(type);
    if (!provider || !provider.isAvailable()) {
      return 1000; // 不可用的提供商优先级最低
    }

    // 从配置中获取优先级，默认为 100
    return (provider as any).config?.priority ?? 100;
  }

  /**
   * 生成缓存键
   */
  private getCacheKey(request: AIGenerateRequest): string {
    // 基于请求参数生成缓存键
    const { appId, text, stylePrompt, temperature, maxTokens, candidateCount } = request;
    return createHash("sha256").update(JSON.stringify([this.configVersions.get(appId), appId, request.userId, request.intent, request.history, text, stylePrompt, temperature, maxTokens, candidateCount])).digest("hex");
  }

  /**
   * 带超时的执行
   */
  private async executeWithTimeout<T>(
    fn: (signal: AbortSignal) => Promise<T>, timeout: number,
    providerType: AIProviderType, parent?: AbortSignal,
  ): Promise<T> {
    parent?.throwIfAborted();
    const controller = new AbortController();
    const relay = () => controller.abort(parent?.reason);
    parent?.addEventListener('abort', relay, { once: true });
    const timer = setTimeout(() => controller.abort(new Error(`提供商 ${providerType} 响应超时 (${timeout}ms)`)), timeout);
    let rejectAbort: () => void = () => {};
    try {
      const aborted = new Promise<never>((_, reject) => {
        rejectAbort = () => reject(controller.signal.reason);
        controller.signal.addEventListener('abort', rejectAbort, { once: true });
      });
      return await Promise.race([fn(controller.signal), aborted]);
    } finally {
      clearTimeout(timer); parent?.removeEventListener('abort', relay);
      controller.signal.removeEventListener('abort', rejectAbort);
    }
  }
}
