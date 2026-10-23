# 聊商 ChatQ

Android 日常聊天键盘与独立 AI 对话应用，配套 React 管理后台和 Fastify 服务端。基于 [ljx0517/app-mamager](https://github.com/ljx0517/app-mamager) 持续开发。当前已发布安卓内测版 **1.13.1（versionCode 17）**。

## 当前功能

- 安卓离线拼音、九宫格、候选与联想、英文纠错、本机常用词、可选云词库和主动语音输入。
- AI 回复、话题库、人设与场景选择；主应用和键盘共享本机生成记录。
- 独立多轮 AI 对话：上下文、流式输出、停止、重新生成、会话搜索/改名、编辑问题保留分支、TXT/Markdown 导出、当前会话查找、高亮和手动失败重试。
- 额度套餐展示、加密备份恢复、安卓更新中心；后台配置真实 OpenAI 兼容服务的地址、模型和密钥。

AI 只在用户主动操作时请求；不自动读取其他应用聊天、不轮询剪贴板、不自动点击发送。AI 密钥由服务端保存。具体能力、边界和数据兼容说明见 [交付记录](CHATQ-DELIVERY.md)。

## 下载与验证

- [安卓 1.13.1 安装包](http://103.149.91.78/downloads/ChatQ-1.13.1-daily-arm64.apk)：Android 7.0+ / arm64，覆盖安装保留原数据。
- [本版验证记录](artifacts/ChatQ-1.13.1-daily-validation.md)、[审核说明](artifacts/ChatQ-1.13.1-daily-audit.md)、[发布后核验](artifacts/ChatQ-1.13.1-daily-post-release.json)。
- 当前为内测调试签名。iPhone 仅有源工程，未进行 Xcode 编译和真机验证；微信/QQ 物理手机验证仍受系统安装授权限制。
- 后续缺少安全富文本/代码块展示、跨设备会话同步、图片附件；完整清单见 [已记录问题](artifacts/ChatQ-open-issues.json)。

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
