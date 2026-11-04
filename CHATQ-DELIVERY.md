# 最新交付状态 · 2026-11-04

Windows0.4.1连接准备预览已发布：[完整包](https://lt.youling.lol/downloads/ChatQ-Windows-0.4.1-x64-Setup.exe)、[便携版](https://lt.youling.lol/downloads/ChatQ-Windows-0.4.1-x64-Portable.zip)。当前只推进Windows/安卓，先Windows；苹果历史代码和归档保留。新增三步清单、无聊天访问的组件准备检查，修复旧令牌回写及连接输入校验。159项核心、231项不可见WPF、14项适配器合成、双架构TSF与0.4.0覆盖升级/卸载保留消息文件、完整下载和更新清单通过。外部组件、真实微信/QQ兼容和正式签名仍待处理；免费自备API、默认暂停。详见artifacts/ChatQ-Windows-0.4.1-audit.json。

以下为既有手机端交付状态；本轮 Windows 优化未重新构建或验收手机端。

Android 1.29.1/code44 内测安装包已发布，此前核验 HTTPS 下载与完整 SHA-256 通过，保持免费自备 API、正式收款关闭。未重复打包安卓或重新部署无变化的后端。

iPhone 源码版本1.29.1/build32 此前已通过模拟器编译/启动及 iPhoneOS18.5/arm64 Release 归档，当时云端203项应用回归、6项打包回归与包内容检查通过。归档位于 artifacts/ChatQ-ios-device32-UNSIGNED-NOT-INSTALLABLE.zip，包含主应用、键盘扩展、JS及离线拼音词典；**尚未签名，不能安装在 iPhone 上，没有交付 IPA/TestFlight**。用户此前确认尚未开通 Apple 开发者账号，先完成工程及打包流程。

签名/Ad Hoc 导出脚本与配置检查已准备，实际签名分支未执行；开通账号后还需要两个描述文件/共享权限、真实 iPhone 安装与键盘验收。操作说明见 apps/chatq_keyboard/IOS-RELEASE.md，记录见 artifacts/ChatQ-ios-device32-20261102-delivery.json。构建记录：https://github.com/2218188274/app-mamager/actions/runs/41399908974。

以下为各轮历史交付记录，旧条目中的缺口应以本节和最新报告为准。

# 2026-10-26 · 聊商 1.24.0

修复账号操作竞态、损坏凭据和恢复码保存失败，新增恢复码重置；统一账号/会员布局及失效、离线、同步提示。完善 Jeepay 已到账退款核对和只读候选预检，正式收款关闭。验证及限制见 artifacts/ChatQ-1.24.0-account-validation.md；发布以同前缀 deployment.json 为准。

发布后运维：聊商回滚备份迁至已授权的数据盘，1,618 个条目内容、属主和权限核对一致，原 /opt/chatq/backups 路径保留为符号链接，服务和更新指针未改变。系统盘回升至约 410 MB，容量仍需后续处理；未启动旧 Jeepay，收款保持关闭。记录见 artifacts/ChatQ-storage-20261026.json。

# 2026-10-26 · 后端 1.23.1 / 安卓 1.23.0

用户确认尚未开通正式支付商户。本次补充私有配置的占位值、文件、权限、JSON 和应用绑定检查，统一购买准备状态及实际下单套餐校验；服务器提供不访问网关的只读检查命令。保持正式收款关闭，不新增套餐，不更新安卓安装包或下载指针。验证见 artifacts/ChatQ-1.23.1-config-validation.md，部署记录以同前缀 deployment.json 为准。

# 2026-10-26 · 聊商 1.23.0

完善账号绑定会员购买、支付返回查单、签名回调与续费；保护长期会员、退款和权益冲突，统一订单页大字号布局。正式收款仍待商户通道、配置及套餐价格，不作实付成功声明。验证与限制见 artifacts/ChatQ-1.23.0-payment-validation.md 和 audit.md。

# 2026-10-26 · 聊商 1.22.0

新增账号注册/登录/改密/恢复码、会员跨设备身份、主应用与键盘共用加密凭据；HTTPS 升级，封闭旧鉴权和模拟收据问题。详见 artifacts/ChatQ-1.22.0-account-validation.md。真实支付待商户配置和验收，实体手机测试仍需用户完成安装。

# 2026-10-26 · 聊商 1.21.2

修复备份与更新页迟到操作、大字号语气竖排；复核键盘、聊天、人设、表情与数据流程。详见 artifacts/ChatQ-1.21.2-audit-validation.md 与 audit.md。

# 2026-10-26 · 聊商 1.21.1

修复菜单误提交拼音、人设需求返回丢失，简化生成预览与大字号排版。详见 artifacts/ChatQ-1.21.1-review-validation.md 与 audit.md。

# 2026-10-26 · 聊商 1.21.0

品牌图标、AI 生成人设、参考键盘布局与底部输入法切换。详见 artifacts/ChatQ-1.21.0-reference-validation.md 与 audit.md。

# 2026-10-26 · 聊商 1.20.4

主应用与键盘连续使用回归；修复重开键盘回复空白、常用句刷新竞态与重复移除。微信/QQ 真机按用户安排后续进行。详见 artifacts/ChatQ-1.20.4-lifecycle-validation.md 与 audit.md。

# 2026-10-25 · 聊商 1.20.3

表情、人设与回复易用性优化；修复重复分享、收藏竞态和长人设裁切。详见 artifacts/ChatQ-1.20.3-comfort-validation.md 与 audit.md。

# 当前交付：1.20.2（versionCode27）

修复更新误报、记录开关异常状态、键盘偏好异步回退。完整模块复核及剩余事项见 artifacts/ChatQ-1.20.2-maintenance-audit.md。下载与验证见同前缀 readme.txt、validation.md、deployment.json。

# 当前交付：1.20.1（versionCode26）

包含键盘图片表情与排版优化，补充修复AI页200%字号按钮裁切。入口：键盘→表情→图片。下载、验证和发布记录见artifacts/ChatQ-1.20.1-keyboard-stickers-readme.txt、validation.md、deployment.json。

# 当前交付：1.20.0（versionCode25）

安卓键盘图片表情接入、Emoji/颜文字分区、四大设计原则与大字号/横屏适配。说明和验证见artifacts/ChatQ-1.20.0-keyboard-stickers-readme.txt、validation.md；发布以deployment.json为准。内测签名、原数据和现有服务保留。

# 当前交付：1.19.0（versionCode24）

主应用布局统一、回复/润色双模式、表情中心、原创图片分享、回复加表情和粘贴保护。说明与验证见artifacts/ChatQ-1.19.0-expressions-readme.txt、validation.md；发布以deployment.json为准。保持内测签名，后端与数据库不变。

# 当前交付：1.18.0（versionCode23）

键盘整体重排、人设卡片、关系目标、回复收藏和单条改写。说明和验证见 artifacts/ChatQ-1.18.0-persona-readme.txt 与 validation.md；发布结果见deployment.json。保留内测签名，后端与数据库不变。

# 当前交付：1.17.0（versionCode22）

键盘与主应用视觉整理、人设/关系/场景入口优化。说明与验证见 artifacts/ChatQ-1.17.0-layout-readme.txt 和 validation.md；服务器发布结果见 deployment.json。保留内测签名，后端与数据库不变。

# 当前交付：1.16.1（versionCode21）

键盘重新润色、候选恢复与大小屏布局复审。使用说明与验证记录见 artifacts/ChatQ-1.16.1-flow-readme.txt 和 validation.md；服务器发布状态见 deployment.json。沿用内测签名，数据库与后端运行代码不变。

# 存储更新：2026-10-24

经授权，60 GB 数据盘已接入聊商安装包存储。下载目录现位于 `/mnt/chatq-data/chatq/downloads`，原链接保持有效；135 个文件完整校验通过，系统盘原文件保留为回退副本。后续发布先运行 `/opt/chatq/bin/prepare-mobile-release`，使用返回的数据盘路径，避免继续占用系统盘。详见 `artifacts/ChatQ-storage-20261024-readme.txt` 与 `artifacts/ChatQ-storage-20261024.json`。本次未更新 APK 版本、未重启现有服务。

# 当前交付：1.16.0（versionCode20）

安卓粘贴生成、润色、一键返回与保护原文。说明见 artifacts/ChatQ-1.16.0-flow-readme.txt。后端已部署，安装包及源码同步服务器下载与 GitHub 源码仓库；更新指针在文件验证后切换至1.16。

# 当前交付：1.15.0（versionCode19）

布局与输入体验升级，说明见 artifacts/ChatQ-1.15.0-ux-readme.txt；商用验收边界见 apps/chatq_keyboard/DESIGN-1.15.md。

# 聊商 ChatQ 交付

当前安卓内测版：1.14.0，versionCode 18（2026-10-23）。

- [安卓安装包](http://103.149.91.78/downloads/ChatQ-1.14.0-features-arm64.apk)
- [完整源码](http://103.149.91.78/downloads/ChatQ-1.14.0-features-source.zip)
- [使用说明](http://103.149.91.78/downloads/ChatQ-1.14.0-features-readme.txt)
- [验证记录](http://103.149.91.78/downloads/ChatQ-1.14.0-features-validation.md)
- [后台](http://103.149.91.78/apps)
- [GitHub](https://github.com/2218188274/app-mamager)

新增安全 Markdown/代码块复制、最近4个回答版本切换、编辑分支列表、主动图片/PDF/UTF-8文本附件，以及同步码加密会话同步。已有多轮、人设、流式、取消、搜索、改名、编辑问题和导出继续保留。详情、操作入口与限制见使用说明。

同步默认关闭、每次主动发起；支持同一服务器下不同设备，不传同步解密秘密，冲突保留副本，不传播删除。包含已保存问答、草稿、背景、附件和版本；人设卡配置另用加密备份迁移，不迁移套餐额度。最多50个会话、每个100轮；单会话容量4M字符，同步加密前8MB。模型上下文最近10个完整轮次加当前消息/文本附件共16000字。

Jeepay适配、订单入口和回调/查单/幂等事务已完成隔离回归；商户网关和正式配置未完善，真实收款保持关闭。需商户通道、私有密钥、域名HTTPS、沙箱/小额验收与退款对账规则后再开放。见 server/deploy/PAYMENTS.md。iOS已补齐相关桥接源码，没有Mac/Xcode编译和IPA。

直接覆盖安装保留数据，勿先卸载；arm64-v8a、Android7.0+，沿用内测签名。模拟器为320×640 Android11，普通/130%字号；未称作微信/QQ真机或Android16验收，未调用收费模型或真实扣款。不读取其他应用聊天、不监听剪贴板、不自动发送消息。

服务端运行 chatq-api:features-1.14.0-r2，新增同步空间和支付订单表。迁移前数据库/源码/运行文件已备份，保持其他项目、私有配置、旧下载与备份。空间不足时同步写入会安全失败，不覆盖本机或云端。回滚运行版本时保留新增表/数据。

本次只清理 /opt/chatq/source/apps/chatq_keyboard/node_modules 可重新安装的构建依赖，释放约383MB，线上服务不依赖该目录；package-lock和私有配置保持原样。保留全部旧安装包、源码包和回滚备份。
