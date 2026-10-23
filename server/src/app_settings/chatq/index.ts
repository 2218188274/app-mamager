import { registerAppConfig } from '../registry.js';
import { customReplyRouter } from './routers/customReply.js';
import { keywordReplyRouter } from './routers/keywordReply.js';
import { configDataRouter } from './routers/configData.js';
import { conversationRouter } from './routers/conversation.js';
import { inputRouter } from './routers/input.js';
import { keywordMatcher } from './services/KeywordMatcher.js';
import { appConfig, configMeta } from './config.js';

/**
 * chatq 配置模块入口
 *
 * 此配置适用于 ChatQ Keyboard
 * 包含功能：
 * - 自定义风格回复
 * - 关键词自动回复
 * - 快捷短语管理
 */

// 注册配置
registerAppConfig({
  configName: configMeta.configName,
  description: configMeta.description,

  // 专属路由
  // 挂载后访问路径：
  // - /trpc/chatq.customReply.*
  // - /trpc/chatq.keywordReply.*
  // - /trpc/chatq.configData.*（场景/关系/标签/人设包主数据）
  routers: {
    customReply: customReplyRouter,
    keywordReply: keywordReplyRouter,
    configData: configDataRouter,
    input: inputRouter,
    conversation: conversationRouter,
  },

  // 专属服务
  services: [
    {
      name: 'keywordMatcher',
      instance: keywordMatcher,
    },
  ],

  // 配置
  config: appConfig,

  // REST 适配层路由（可选）
  // 挂载后访问路径：
  // - POST /api/aikeyboard/reply
  // - POST /api/aikeyboard/keyword/match
  restRoutes: [
    {
      method: 'POST',
      path: '/api/aikeyboard/reply',
      trpcPath: 'chatq.customReply.generate',
      description: '生成自定义回复',
    },
    {
      method: 'POST',
      path: '/api/aikeyboard/keyword/match',
      trpcPath: 'chatq.keywordReply.match',
      description: '关键词匹配',
    },
    {
      method: 'GET',
      path: '/api/aikeyboard/keyword/list',
      trpcPath: 'chatq.keywordReply.list',
      description: '获取关键词列表',
    },
    {
      method: 'POST',
      path: '/api/aikeyboard/keyword/add',
      trpcPath: 'chatq.keywordReply.add',
      description: '添加关键词',
    },
  ],
});
