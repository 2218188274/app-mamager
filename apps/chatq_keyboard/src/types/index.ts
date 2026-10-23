// 对话消息类型
export interface ChatMessage {
  id: number;
  conversationId: number;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

// 对话类型
export interface Conversation {
  source?: 'app' | 'keyboard';
  kind?: 'reply' | 'topic' | 'polish';
  id: number;
  title: string;
  createdAt: number;
  updatedAt: number;
}

// 键盘状态
export interface KeyboardState {
  isVisible: boolean;
  clipboardContent: string;
  isGenerating: boolean;
  currentReply: string | null;
  /** 多候选回复（1–3 条） */
  currentCandidates: string[] | null;
}

// AI 生成请求（支持人设/场景/关系/多候选）
export interface GenerateRequest {
  content: string;
  sceneId?: string;
  relationId?: string;
  personaTagWeights?: Record<string, number>;
  candidateCount?: number;
}

// AI 生成响应
export interface GenerateResponse {
  reply: string;
  candidates?: string[];
}

// 应用状态
export interface AppState {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  messages: ChatMessage[];
  keyboard: KeyboardState;
  /** ChatQ 主数据（场景/关系/标签/人设包），由 configData 服务拉取并缓存 */
  configData: import('./configData').ConfigDataCache | null;
}

// Action 类型
export type AppAction =
  | { type: 'SET_CONVERSATIONS'; payload: Conversation[] }
  | { type: 'SET_CURRENT_CONVERSATION'; payload: Conversation | null }
  | { type: 'ADD_CONVERSATION'; payload: Conversation }
  | { type: 'SET_MESSAGES'; payload: ChatMessage[] }
  | { type: 'ADD_MESSAGE'; payload: ChatMessage }
  | { type: 'SET_KEYBOARD_VISIBLE'; payload: boolean }
  | { type: 'SET_CLIPBOARD_CONTENT'; payload: string }
  | { type: 'SET_GENERATING'; payload: boolean }
  | { type: 'SET_CURRENT_REPLY'; payload: string | null }
  | { type: 'SET_CURRENT_CANDIDATES'; payload: string[] | null }
  | { type: 'SET_CONFIG_DATA'; payload: import('./configData').ConfigDataCache | null };

// 通信相关类型
export * from './communication';
