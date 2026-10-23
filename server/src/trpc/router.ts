import { router } from "./index.js";
import { adminRouter } from "../routers/admin.js";
import { appRouter as appManageRouter } from "../routers/app.js";
import { subscriptionManageRouter } from "../routers/subscription-manage.js";
import { userManageRouter } from "../routers/user-manage.js";
import { analyticsRouter } from "../routers/analytics.js";
import { settingsRouter } from "../routers/settings.js";
import { templateRouter } from "../routers/template.js";
import { userRouter } from "../routers/user.js";
import { aiAdminRouter } from "../routers/ai-admin.js";
import { aiRouter } from "../routers/ai.js";
import { styleRouter } from "../routers/style.js";
import { subscriptionRouter } from "../routers/subscription.js";
import { chatqManageRouter } from "../routers/chatq-manage.js";

// 导入 App 配置模块（动态注册）
import { getAllConfigModules } from "../app_settings/registry.js";

/**
 * 构建 App 配置路由对象
 * 将所有已注册的 App 配置路由挂载到对应配置名下
 */
function buildAppRouters() {
  const configModules = getAllConfigModules();
  const appRouters: Record<string, any> = {};

  for (const configModule of configModules) {
    const configName = configModule.configName;

    // 将每个配置的路由挂载到其配置名下
    for (const [routeName, routeDef] of Object.entries(configModule.routers)) {
      // 例如：chatq.customReply
      const fullPath = `${configName}.${routeName}`;
      appRouters[fullPath] = routeDef;
    }
  }

  return appRouters;
}

/**
 * 根路由 - 多 App 管理后台
 *
 * 路由结构：
 *  ┌─ 管理后台（需要 Admin 认证）──────────┐
 *  │ admin.*              管理员认证与管理   │
 *  │ app.*                应用 CRUD 管理     │
 *  │ template.*           配置模板管理       │
 *  │ subscriptionManage.* 订阅计划与用户订阅管理 │
 *  └──────────────────────────────────────┘
 *  ┌─ 客户端 API（需要 x-api-key）────────┐
 *  │ user.*               用户注册与认证    │
 *  │ ai.*                 AI 回复生成       │
 *  │ style.*              说话风格管理      │
 *  │ subscription.*       订阅查询与验证     │
 *  └──────────────────────────────────────┘
 *  ┌─ App 配置路由（按 configName 隔离）───┐
 *  │ chatq.*             ChatQ Keyboard    │
 *  │ ai-keyboard-lite.*  AI Keyboard Lite  │
 *  └──────────────────────────────────────┘
 */
export const appRouter = router({
  // 管理后台
  admin: adminRouter,
  app: appManageRouter,
  subscriptionManage: subscriptionManageRouter,
  userManage: userManageRouter,
  analytics: analyticsRouter,
  settings: settingsRouter,
  aiAdmin: aiAdminRouter,
  template: templateRouter,
  chatqManage: chatqManageRouter,

  // 客户端 API（App 隔离）
  user: userRouter,
  ai: aiRouter,
  style: styleRouter,
  subscription: subscriptionRouter,

  // App 配置路由（动态挂载）
  ...buildAppRouters(),
});

/** 导出路由类型供客户端使用 */
export type AppRouter = typeof appRouter;
