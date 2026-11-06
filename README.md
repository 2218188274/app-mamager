# 聊商 ChatQ

Windows 桌面 AI 助手与原生拼音输入法、Android 日常聊天键盘与独立 AI 对话应用，配套 React 管理后台和 Fastify 服务端。基于 [ljx0517/app-mamager](https://github.com/ljx0517/app-mamager) 持续开发。当前优先推进 Windows **0.6.1 预览版**；安卓内测版 **1.30.1（versionCode 47）**。免费自备 API、正式收款关闭；iPhone 历史工程与归档保留，停止主动开发和构建。

新增 Windows / 安卓手动加密资料互通，迁移人设文本、收藏句及AI对话主线；先预览后合并，冲突保留本机并可撤销。沿用1.29.2中文输入和切换修复。最新下载、范围与未完成项见下方。

## 最新中英文切换修复 · Windows 0.6.1 / 安卓 1.30.1

[Windows安装包](https://lt.youling.lol/downloads/ChatQ-Windows-0.6.1-x64-Setup.exe) · [便携助手](https://lt.youling.lol/downloads/ChatQ-Windows-0.6.1-x64-Portable.zip) · [安卓安装包](https://lt.youling.lol/downloads/ChatQ-1.30.1-language-arm64.apk)

Windows：单按Shift后松开，或Ctrl+空格后松开空格切换中英。组合键不切换，长按不反复切换；Shift+A不遗留旧拼音，Caps Lock显示A并提示关闭大写锁定。受限输入框和失焦时保持保护，不改变普通中文偏好。

安卓：数字页和符号页的中英按钮一键切换并返回字母页，语言按钮固定至少48dp宽。外接键盘使用Shift+空格，中英文拼音/直输、九宫格与物理字母混用、选词、标点和首次Enter确认经过回归；切换其他输入法继续用底部“输入法”，Ctrl+空格保留系统行为。

Windows双架构各239项真实注册TSF合成回归、隔离升级/卸载保留数据通过。安卓214项应用、类型检查、普通/200%字号各125项语言输入、39项候选及30项稳定性通过，模拟器崩溃缓冲为空；已核对大字号画面。只用合成输入，无付费AI或聊天发送，不代表微信/QQ真机、真实蓝牙键盘或本机可见Windows程序验收。两端仍使用既有预览/内测发布方式，签名准备状态不变。

审查：[Windows](artifacts/ChatQ-Windows-0.6.1-audit.json)、[安卓](artifacts/ChatQ-1.30.1-language-audit.json)。后台和数据库未改，旧包和回滚保留。

## 历史交付 · 2026-11-06 · Windows 0.6.0 / 安卓 1.30.0

[Windows安装包](https://lt.youling.lol/downloads/ChatQ-Windows-0.6.0-x64-Setup.exe) · [便携助手](https://lt.youling.lol/downloads/ChatQ-Windows-0.6.0-x64-Portable.zip) · [安卓安装包](https://lt.youling.lol/downloads/ChatQ-1.30.0-transfer-arm64.apk)

新增手动加密资料互通：Windows“数据与更新 → Windows / 安卓资料互通”，安卓“我的 → 备份与恢复 → 展开跨端迁移”。导出.cqtransfer，在另一端输入密码并预览，确认后合并。只迁移人设文本、收藏句和AI对话主线，API、自动回复账号、聊天资料库、附件和分支不迁移。相同内容去重，冲突保留本机；可撤销上次新增，资料变化时先停止并提示。保留原设备，不代替完整备份。

修复普通备份与跨端文件选择重叠、取消后的过期回调，增加撤销的事务保护；改进小屏及200%字号的分组、滚动、确认和错误状态。Windows519项核心、505项不可见WPF、29项合成适配和6项签名拒绝检查通过；安卓类型检查、214项应用检查、28项实际Android迁移、35项备份回归及两种字号各15项UI检查通过。双向合成加密文件持续回归；Windows云端升级/卸载保留原数据，双架构TSF通过。实际手机与微信/QQ输入验收仍未完成。

本轮QQ获得5分钟/最多3次调用与回复的限定授权，登录和账号核对通过，但未有消息通过接收范围，0模型调用、0发送；窗口已结束，桥接已停止。不能称连续AI回复通过。已补私有且不含原文的诊断计数，下一轮需区分上报、协议和过滤环节。见[实际测试记录](artifacts/ChatQ-Windows-QQ-continuous-20261106.json)。微信当前仍未真实接通。

当前Windows仍无可信代码签名证书。安卓专用新证书的arm64包已编译和验证，新包名可与内测版并存，所有者完成独立密钥备份前不公开切换正式更新地址；此次安卓安装包沿用内测签名支持覆盖升级。见[签名和恢复](apps/chatq_windows/docs/SIGNING.md)。免费、自备API，正式收款保持关闭；服务器服务未重启、数据库未修改、旧包与回滚信息保留。

## 当前安卓功能

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

安卓 AI 只在用户主动操作时请求；不自动读取其他应用聊天、不轮询剪贴板、不自动点击发送。个人 API 密钥在安卓 Keystore + AES-GCM 本机存储，不进入平台、同步或备份。正式收款保持关闭，供应商可能按用量收费。安卓交付范围和待验收项见 [1.29.2 中文输入与切换审查](artifacts/ChatQ-1.29.2-input-audit.json)；Windows 消息助手在用户主动连接后按指定好友规则处理新消息，范围见下方说明。

## 下载与验证

- [安卓 1.30.1 安装包](https://lt.youling.lol/downloads/ChatQ-1.30.1-language-arm64.apk)：Android 7.0+ / arm64，沿用内测签名以支持覆盖更新。
- [安装包校验](artifacts/ChatQ-1.30.1-language-arm64.json)、[交付审查](artifacts/ChatQ-1.30.1-language-audit.json)、[交付说明](README-DELIVERY.txt)。
- 本次214项应用、类型检查、28项安卓迁移、35项普通备份回归及两种字号各15项UI检查通过。迁移回归仅用合成资料和本地接口，没有付费AI或聊天发送；后端没有改动。1.29.2语言修复的历史验收另见[中文输入审查](artifacts/ChatQ-1.29.2-input-audit.json)。
- 微信/QQ真机验收仍由用户暂缓；当前下载包仍为内测签名。独立正式签名包已编译验证，等待所有者备份发布密钥；不能直接替换不同签名的旧包。iOS历史工程及归档保留，不再主动开发或构建。
- 待验收：微信/QQ真机、实际双设备迁移、真实视觉模型和麦克风、发布密钥恢复及Windows正式证书。离线/连续听写、手写和双拼仍为功能缺口，详见[当前问题清单](artifacts/ChatQ-open-issues.json)。

## iPhone 历史工程与归档（停止主动推进）

以下保留既有工程和构建说明，不属于本次或后续 Windows/安卓开发范围。

主应用与键盘已接入最多8套 Keychain API 配置、模型列表、回复/润色/话题、多轮流式对话、取消及旧配置保护；基础人设/关系/场景与1–10条回复已接入。安卓的九宫格/词库增强、图片表情、长截图、完整原生数据桥接和语音尚未全部适配到 iOS。

本轮 iPhoneOS18.5/arm64 Release 归档成功，包含主应用、键盘、JS及离线拼音词典。云端203项应用测试和6项打包检查通过。[构建记录](https://github.com/2218188274/app-mamager/actions/runs/41399908974)与[交付报告](artifacts/ChatQ-ios-device32-20261102-delivery.json)保留测试范围。

没有 Mac 时可手动运行 Actions 的 `ChatQ iPhone device archive` 准备手机归档。**未签名归档和模拟器 ZIP 都不能安装在 iPhone 上。** 用户确认尚未开通开发者账号；签名与 Ad Hoc IPA 导出脚本已准备，但签名分支未执行。账号可用后须配置两个显式 App ID、共享权限和测试设备，再导出并验收。完整步骤见 [苹果打包说明](apps/chatq_keyboard/IOS-RELEASE.md)。

## Windows 桌面助手与系统输入法

Windows **0.5.11预览版**已发布：[完整安装包](https://lt.youling.lol/downloads/ChatQ-Windows-0.5.11-x64-Setup.exe)、[便携助手](https://lt.youling.lol/downloads/ChatQ-Windows-0.5.11-x64-Portable.zip)。

MiniMax接入：我的API → MiniMax快速配置 → 填入MiniMax → 输入自己的Key → 保存并启用。官方OpenAI基础地址为`https://api.minimax.cn/v1`，模型为`MiniMax-M3.1-Flash`。预设创建待保存的新配置，不携带密钥、不覆盖旧配置、不自动联网。M Plan订阅Key与按量Key的额度和模型权限由供应商决定。

针对官方MiniMax地址上的确切Flash模型，启用思考与回答分离、低思考深度和16384 tokens输出上限；不关闭强制思考，不使用优先计费。其他供应商和相似主机/模型不套用参数。聊天和截图共用兼容请求。改进HTTP200错误体和流错误提示，分别说明套餐限额、模型权限、参数、密钥和限流，不显示服务商可能回显的密钥，不自动重试。

498项核心、477项不可见WPF、29项适配器合成检查通过，隔离VM从0.5.10升级/卸载保留普通数据、消息库及聊天资料库。双架构TSF、包内运行、完整HTTPS下载及更新清单验证通过。经用户单独授权的一次固定连接测试返回200/stop/连接成功，共220 tokens，未读取聊天或回复好友；不是QQ连续AI验收。本轮其余回归未调用真实模型、打开本机可见程序或操作真实微信/QQ。

此前的.cqlb资料库密码备份、合并预览和已存分析仍可使用，普通.cqb仍不含资料库。跨端迁移代码仍在工作区单独验证，不包含在本次兼容修正版中。微信真实接通、QQ连续AI、Windows正式签名与安卓正式密钥迁移尚未完成；安卓仍为1.29.2、免费自备API，正式收款关闭。见[审查](artifacts/ChatQ-Windows-0.5.11-audit.json)、[使用说明](apps/chatq_windows/README.md)、[构建记录](https://github.com/2218188274/app-mamager/actions/runs/42171804521)。

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
