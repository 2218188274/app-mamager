# 聊商 ChatQ

Android 日常聊天键盘与独立 AI 对话应用，配套 React 管理后台和 Fastify 服务端。基于 [ljx0517/app-mamager](https://github.com/ljx0517/app-mamager) 持续开发。当前已发布安卓内测版 **1.26.0（versionCode 37）**。

## 当前功能

- 安卓离线拼音、九宫格、候选与联想、英文纠错、本机常用词、可选云词库和主动语音输入。
- AI 回复、话题库、人设与场景选择；主应用和键盘共享本机生成记录。
- 独立多轮 AI 对话：上下文、流式输出、停止、重新生成、会话搜索/改名、编辑问题保留分支、TXT/Markdown 导出、当前会话查找、高亮和手动失败重试。
- 免费自备 API：在主应用填写 HTTPS 地址、模型和密钥，主应用与安卓键盘共用本机加密配置，无需登录或购买会员。
- 人设卡片中心与 AI 生成人设、关系/目标选择、回复收藏、表情包、加密备份恢复、安卓更新中心。
- 开始使用与自检：配置状态、输入法选择、离线试打和安全反馈；回复支持书面改写、中英翻译、恢复上一版。

AI 只在用户主动操作时请求；不自动读取其他应用聊天、不轮询剪贴板、不自动点击发送。个人 API 密钥在安卓 Keystore + AES-GCM 本机存储，不进入平台、同步或备份。正式收款保持关闭，供应商可能按用量收费。当前交付范围和待验收项见 [1.26.0 交付审查](artifacts/ChatQ-1.26.0-delivery-audit.json)。

## 下载与验证

- [安卓 1.26.0 安装包](https://lt.youling.lol/downloads/ChatQ-1.26.0-delivery-arm64.apk)：Android 7.0+ / arm64，沿用内测签名以支持覆盖更新。
- [安装包校验](artifacts/ChatQ-1.26.0-delivery-arm64.json)、[交付审查](artifacts/ChatQ-1.26.0-delivery-audit.json)、[交付说明](README-DELIVERY.txt)。
- 151 项 JavaScript/工程回归、41 项原生 API 检查；320×640 模拟器普通字号和 200% 字号各 58 项界面检查。使用本地合成 API，未调用真实付费模型或发送聊天。
- 微信/QQ 真机验收由用户暂缓；当前仍为内测签名。iOS 仍缺少个人 API 原生接入，也未在 Xcode 构建或签名，不能视为已交付 iPhone 版本。
- 下一步优先完善进程退出后的回复草稿恢复、主动截图辅助回复和真机兼容；详见 [问题清单](artifacts/ChatQ-open-issues.json)。

## 项目结构

| 路径 | 内容 |
| --- | --- |
| `apps/chatq_keyboard/` | Expo / React Native 主应用、安卓和 iOS 键盘工程及测试 |
| `admin/` | React 管理后台，与已发布源码保持一致 |
| `server/` | Fastify / tRPC / PostgreSQL 服务、离线输入数据和语音部署文件 |
| `deploy/` | Docker Compose、Caddy 示例及部署验证脚本 |
| `artifacts/` | 发布说明、审核与验证元数据，不存放 APK、数据库或源码压缩包 |

## 本地开发

后台和服务端在根目录按 `package.json` 使用 pnpm 9+；环境变量从 `server/.env.example` 复制到本机私有配置。不要在未备份的现有生产数据库上直接运行建表或迁移命令。

手机端使用独立 npm 锁文件：

```sh
cd apps/chatq_keyboard
npm ci
# 将 .env.example 复制为 .env.local，填写自己的服务器地址和应用连接码
npm run check
npm test
npx expo prebuild --platform android --no-install
```

安卓构建需要 JDK 17、Android SDK / Build Tools 36、NDK 27.1.12297006、CMake 3.22.1。详细构建、键盘启用及 iOS 工程说明见 [MOBILE.md](apps/chatq_keyboard/MOBILE.md)。原生工程中的 debug.keystore 为公开的模板测试签名，不是生产签名；正式发布应使用自行保管的签名。

部署说明见 [deploy/README.md](deploy/README.md)。示例使用服务器 IP 和 HTTP 供当前内测，生产环境应配置自己的 HTTPS 域名和私有配置。真实 AI 测试可能产生供应商费用；普通回归默认使用本机合成数据。

## 源码与历史

本次同步以已发布的 1.13.1 完整源码为基准，保留上游 Git 历史。历史概念稿保存在 [docs/UPSTREAM-DESIGN.md](docs/UPSTREAM-DESIGN.md)，其中未实现的订阅与自动剪贴板设想不代表当前功能。第三方拼音引擎、词库和语音源码的许可证保留在各自目录。

生产环境变量、模型密钥、用户数据库、备份和构建产物不进入本次提交；上游曾跟踪的两个 memory.db 文件从当前分支移除，原有历史不改写。
