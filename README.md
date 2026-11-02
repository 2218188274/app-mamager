# 聊商 ChatQ

Android 日常聊天键盘与独立 AI 对话应用，配套 React 管理后台和 Fastify 服务端。基于 [ljx0517/app-mamager](https://github.com/ljx0517/app-mamager) 持续开发。当前已发布安卓内测版 **1.29.1（versionCode 44）**；保持免费自备 API、正式收款关闭。iPhone 源码版本1.29.1/build32 已通过原生编译、模拟器启动及手机 Release 归档，尚无签名 IPA。

本轮修复首字输入时键盘高度变化导致的快速连打误触，以及收起键盘后外部人设、目标、语气、条数或API变化仍可点选旧结果的问题。原文保留，重新生成由用户触发；原配置未变则保留已完成结果。

## 当前功能

- 新增：30个手动聊天对象档案、20张自定义图片表情；对象切换、改名、收藏、最近使用和加密备份。
- 新增：长截图最多8段，本机保留局部清晰度；每段需主动识别、核对说话者和文字，重叠区域需手动去重。
- 新增：当前密码确认注销；云端空间容量/版本查看与同步码授权删除，本机记录保留。

- 安卓离线拼音、九宫格、候选与联想、英文纠错、本机常用词、可选云词库和主动语音输入。
- AI 回复、话题库、人设与场景选择；主应用和键盘共享本机生成记录。
- 独立多轮 AI 对话：上下文、流式输出、停止、重新生成、会话搜索/改名、编辑问题保留分支、TXT/Markdown 导出、当前会话查找、高亮和手动失败重试。
- 免费自备 API：最多8套本机加密配置、模型列表搜索、独立文本/图片测试；主应用和安卓键盘共用当前配置，无需登录或购买会员。
- 人设卡片中心与 AI 生成人设、关系/目标选择、回复收藏、表情包、加密备份恢复、安卓更新中心。
- 回复与润色草稿分别加密保存在本机，进程退出后恢复、7天过期、可关闭或清空；截图不保存。
- 截图本机裁剪和隐私遮挡、可编辑识别文字确认、选择对方左右侧（需视觉模型）；回复条数1–10，主应用与键盘共用。
- 两个常用工具入口可配置，最近工具仅存入口ID；左右单手布局、窄屏/横屏自动全宽，保留正在输入的拼音。
- 开始使用与自检：配置状态、输入法选择、离线试打和安全反馈；回复支持书面改写、中英翻译、恢复上一版。

AI 只在用户主动操作时请求；不自动读取其他应用聊天、不轮询剪贴板、不自动点击发送。个人 API 密钥在安卓 Keystore + AES-GCM 本机存储，不进入平台、同步或备份。正式收款保持关闭，供应商可能按用量收费。当前交付范围和待验收项见 [1.29.1 稳定性与交付审查](artifacts/ChatQ-1.29.1-stability-audit.json)。

## 下载与验证

- [安卓 1.29.1 安装包](https://lt.youling.lol/downloads/ChatQ-1.29.1-stability-arm64.apk)：Android 7.0+ / arm64，沿用内测签名以支持覆盖更新。
- [安装包校验](artifacts/ChatQ-1.29.1-stability-arm64.json)、[交付审查](artifacts/ChatQ-1.29.1-stability-audit.json)、[交付说明](README-DELIVERY.txt)。
- 本轮设置切换64项、编辑器30项、候选/联想39项、按键位置4项、表情64项及200%字号16项通过。应用201项和后端70项沿用1.29.0证据，相关业务未变。仅用合成编辑器/本地接口；无真实付费AI或聊天发送。
- 微信/QQ 真机验收由用户暂缓；当前仍为内测签名。iOS 已接入原生个人 API 并通过云端 Xcode 编译、模拟器启动及手机归档；未有开发者签名、共享 Keychain 和真机键盘验收，不能视为已交付可安装 iPhone 版本。
- 待验收：微信/QQ真机、真实视觉模型与长截图质量、正式签名；系统盘余量继续监控。这些本轮已补齐，后续仍有离线/连续听写、手写和双拼，以及iOS同等能力；详见 [功能缺口清单](artifacts/ChatQ-1.29.1-stability-features.json)及 [问题清单](artifacts/ChatQ-open-issues.json)。

## iPhone 工程与打包

主应用与键盘已接入最多8套 Keychain API 配置、模型列表、回复/润色/话题、多轮流式对话、取消及旧配置保护；基础人设/关系/场景与1–10条回复已接入。安卓的九宫格/词库增强、图片表情、长截图、完整原生数据桥接和语音尚未全部适配到 iOS。

本轮 iPhoneOS18.5/arm64 Release 归档成功，包含主应用、键盘、JS及离线拼音词典。云端203项应用测试和6项打包检查通过。[构建记录](https://github.com/2218188274/app-mamager/actions/runs/41399908974)与[交付报告](artifacts/ChatQ-ios-device32-20261102-delivery.json)保留测试范围。

没有 Mac 时可手动运行 Actions 的 `ChatQ iPhone device archive` 准备手机归档。**未签名归档和模拟器 ZIP 都不能安装在 iPhone 上。** 用户确认尚未开通开发者账号；签名与 Ad Hoc IPA 导出脚本已准备，但签名分支未执行。账号可用后须配置两个显式 App ID、共享权限和测试设备，再导出并验收。完整步骤见 [苹果打包说明](apps/chatq_keyboard/IOS-RELEASE.md)。

## Windows 桌面助手与系统输入法

[Windows0.1.1完整安装包](https://lt.youling.lol/downloads/ChatQ-Windows-0.1.1-x64-Setup.exe)含桌面助手与x64/x86原生TSF拼音；[便携版](https://lt.youling.lol/downloads/ChatQ-Windows-0.1.1-x64-Portable.zip)仅含助手。新增“中/英”状态和点击切换，修复输入法AI唤出后停在旧页面的问题；进入帮回复并保留草稿。打开“我的API”配置自备地址、密钥、模型后，主动生成回复/润色/话题或多轮对话。

60项核心、89项隐藏WPF检查、双架构离线拼音和实际TSF合成输入（150/150项）通过；隔离VM中0.1.0→0.1.1覆盖升级、双架构组件替换与卸载保留数据/其他输入法通过。升级前正常退出旧版。用户暂缓本机交互与微信/QQ/Office/UWP验收；未正式签名，实际系统状态栏显示仍待验证。截图、表情、语音、移动端同步和候选无障碍仍缺。见[使用说明](apps/chatq_windows/README.md)、[审查与待办](artifacts/ChatQ-Windows-0.1.1-audit.json)、[包校验](artifacts/ChatQ-Windows-0.1.1-build.json)。旧版包保持不变。

## 项目结构

| 路径 | 内容 |
| --- | --- |
| `apps/chatq_windows/` | WPF桌面助手、C++原生TSF拼音输入法、安装器与隔离回归 |
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

部署说明见 [deploy/README.md](deploy/README.md)。默认服务已使用 HTTPS；部署示例应替换为自己的 HTTPS 域名和私有配置。真实 AI 测试可能产生供应商费用；普通回归默认使用本机合成数据。

## 源码与历史

本次同步以已发布的 1.13.1 完整源码为基准，保留上游 Git 历史。历史概念稿保存在 [docs/UPSTREAM-DESIGN.md](docs/UPSTREAM-DESIGN.md)，其中未实现的订阅与自动剪贴板设想不代表当前功能。第三方拼音引擎、词库和语音源码的许可证保留在各自目录。

生产环境变量、模型密钥、用户数据库、备份和构建产物不进入本次提交；上游曾跟踪的两个 memory.db 文件从当前分支移除，原有历史不改写。
