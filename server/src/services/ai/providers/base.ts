import type { AIProviderConfig, AIProviderType } from "../../../db/schema.js";
import type { AIProvider, AIGenerateRequest, AIGenerateResponse } from "../types.js";

/**
 * 基础 AI 提供商抽象类
 * 提供通用功能实现，具体提供商需要实现抽象方法
 */
export abstract class BaseAIProvider implements AIProvider {
  /** 提供商配置 */
  protected config: AIProviderConfig;

  /** 提供商类型 */
  abstract readonly type: AIProviderType;

  /** 提供商名称 */
  abstract readonly name: string;

  /** 默认模型 */
  protected defaultModel: string = "default";

  /** 默认温度 */
  protected defaultTemperature: number = 0.7;

  /** 默认最大令牌数 */
  protected defaultMaxTokens: number = 500;

  constructor(config: AIProviderConfig) {
    this.config = config;
  }

  /**
   * 是否可用
   * 默认检查配置是否有效且启用
   */
  isAvailable(): boolean {
    return this.config.enabled && this.validateConfig(this.config);
  }

  /**
   * 验证配置
   * 子类应重写此方法以进行具体验证
   */
  validateConfig(config: AIProviderConfig): boolean {
    if (!config.enabled) {
      return false;
    }

    // 基础验证：检查必填字段
    if (config.type !== this.type) {
      return false;
    }

    return true;
  }

  /**
   * 生成回复（主方法）
   */
  async generate(request: AIGenerateRequest): Promise<AIGenerateResponse> {
    request.signal?.throwIfAborted();
    const startTime = Date.now();

    try {
      // 验证提供商可用性
      if (!this.isAvailable()) {
        throw new Error(`提供商 ${this.type} 当前不可用`);
      }

      // 准备请求参数
      const params = this.prepareRequestParams(request);

      // 调用具体实现
      const result = await this._generate(params);
      request.signal?.throwIfAborted();

      // 构建响应
      return {
        replies: result.replies,
        provider: {
          type: this.type as any,
          model: this.config.model || this.defaultModel,
          processingTime: Date.now() - startTime,
          tokensUsed: result.tokensUsed,
        },
        metadata: {
          appId: request.appId,
          userId: request.userId,
          ...result.metadata,
        },
      };
    } catch (error) {
      // 处理错误，记录日志
      console.error(`[AI Provider ${this.type}] 生成失败:`, error);

      // 重新抛出标准化错误
      throw error instanceof Error ? error : new Error(`AI 生成失败: ${error}`);
    }
  }

  /**
   * 准备请求参数（模板方法）
   */
  protected prepareRequestParams(request: AIGenerateRequest): any {
    return {
      signal: request.signal,
      onDelta: request.onDelta,
      text: request.text,
      intent: request.intent,
      history: request.history,
      attachments: request.attachments,
      stylePrompt: request.stylePrompt,
      temperature: request.temperature ?? this.defaultTemperature,
      maxTokens: request.maxTokens ?? this.defaultMaxTokens,
      candidateCount: request.candidateCount ?? 1,
      model: this.config.model || this.defaultModel,
    };
  }

  /**
   * 实际生成回复（抽象方法，子类必须实现）
   */
  protected abstract _generate(params: any): Promise<{
    replies: Array<{ id: string; content: string; style?: string }>;
    tokensUsed?: number;
    metadata?: Record<string, unknown>;
  }>;

  /**
   * 生成回复ID
   */
  protected generateReplyId(): string {
    return `reply_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 获取配置值
   */
  protected getConfig<T>(key: string, defaultValue: T): T {
    return (this.config as any)[key] ?? defaultValue;
  }

  /**
   * 检查API密钥
   */
  protected hasApiKey(): boolean {
    return !!this.config.apiKey && this.config.apiKey.length > 0;
  }

  /**
   * 获取超时时间
   */
  protected getTimeout(): number {
    return this.config.timeout || 30000; // 默认30秒
  }
}
