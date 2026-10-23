import type { AIProviderType, AIProviderConfig } from "../../db/schema.js";

/**
 * AI 生成请求参数
 */
export interface AIGenerateRequest {
  attachments?: import('./attachments.js').AIAttachment[];
  intent?: 'reply' | 'topic' | 'polish' | 'chat';
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  signal?: AbortSignal;
  onDelta?: (text: string) => void | Promise<void>;
  requestId?: string;
  /** 输入文本 */
  text: string;
  /** 风格提示词 */
  stylePrompt?: string;
  /** 温度（0-2） */
  temperature?: number;
  /** 最大令牌数 */
  maxTokens?: number;
  /** 候选回复数量 */
  candidateCount?: number;
  /** 应用ID（用于日志和配额） */
  appId: string;
  /** 用户ID（用于日志和配额） */
  userId?: string;
}

/**
 * AI 生成响应
 */
export interface AIGenerateResponse {
  /** 生成的回复列表 */
  replies: AIReply[];
  /** 提供商信息 */
  provider: {
    /** 提供商类型 */
    type: AIProviderType;
    /** 使用的模型 */
    model: string;
    /** 处理时间（毫秒） */
    processingTime: number;
    /** 使用的令牌数 */
    tokensUsed?: number;
  };
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * AI 回复
 */
export interface AIReply {
  /** 回复ID */
  id: string;
  /** 回复内容 */
  content: string;
  /** 风格 */
  style?: string;
  /** 模型 */
  model?: string;
}

/**
 * AI 提供商接口
 */
export interface AIProvider {
  /** 提供商类型 */
  readonly type: AIProviderType;
  /** 提供商名称 */
  readonly name: string;
  /** 是否可用 */
  isAvailable(): boolean;
  /** 生成回复 */
  generate(request: AIGenerateRequest): Promise<AIGenerateResponse>;
  /** 验证配置 */
  validateConfig(config: AIProviderConfig): boolean;
}

/**
 * AI 提供商工厂函数
 */
export type AIProviderFactory = (config: AIProviderConfig) => AIProvider;

/**
 * AI 服务选项
 */
export interface AIServiceOptions {
  /** 是否启用缓存 */
  enableCache?: boolean;
  /** 缓存过期时间（毫秒） */
  cacheTTL?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 是否记录详细日志 */
  verbose?: boolean;
}

/**
 * AI 服务错误
 */
export class AIServiceError extends Error {
  public readonly providerType: AIProviderType;
  public readonly code: string;
  constructor(
    message: string,
    providerType: AIProviderType,
    code: string = "AI_SERVICE_ERROR"
  ) {
    super(`[${providerType}] ${message}`);
    this.name = "AIServiceError";
    this.providerType = providerType;
    this.code = code;
  }
}

/**
 * 提供商不可用错误
 */
export class ProviderUnavailableError extends AIServiceError {
  constructor(providerType: AIProviderType) {
    super(`提供商 ${providerType} 不可用`, providerType, "PROVIDER_UNAVAILABLE");
    this.name = "ProviderUnavailableError";
  }
}

/**
 * 配置无效错误
 */
export class InvalidConfigError extends AIServiceError {
  constructor(providerType: AIProviderType, message: string) {
    super(`配置无效: ${message}`, providerType, "INVALID_CONFIG");
    this.name = "InvalidConfigError";
  }
}

/**
 * 配额超出错误
 */
export class QuotaExceededError extends AIServiceError {
  constructor(providerType: AIProviderType) {
    super(`配额超出`, providerType, "QUOTA_EXCEEDED");
    this.name = "QuotaExceededError";
  }
}
