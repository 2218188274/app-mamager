# 聊商 1.21.2 全模块复核

日期：2026-10-26（Asia/Shanghai）。构建 32，内部测试签名，支持覆盖安装。

- 主应用与服务端类型检查通过，客户端 119 项、服务端 52 项回归通过。服务端业务代码与运行镜像未改动。
- 新增 3 组受控异步测试，分别覆盖迁移/收藏读取两个延迟阶段中的导出与预览、离开页面的旧恢复确认、更新中心版本/连接两个延迟阶段；修复前均可复现失败，修复后通过。
- 200% 字号、320dp 模拟器复现语气按钮中文字竖排；两列响应布局修复后逐个检查按钮高度、主操作与导航遮挡。正常字号保留四列。
- Android 11 隔离模拟器复核：加密备份/恢复/迁移、会话合并、附件文件与图像校验、原生导出生命周期、更新包校验、HTTP 取消、SSE、共享收藏、同步加密、字面量搜索；UI 覆盖人设生成和共享、连续聊天搜索/复制/重试、表情与图片插入、粘贴润色、键盘隐藏重开、拼音与九宫格及输入法切换。
- 备份 UI 使用真实 Android 文件选择器验证取消可重试、导出完成清除密码、导入预览与取消恢复。只用模拟器合成数据，不写真实用户存储。
- 旧聊天脚本的“对话”名称和首页脚本的输入法前置状态过期，已按当前 AI 对话标签与独立输入法前置条件修正，未将脚本误报登记为产品缺陷。新版备份脚本使用当前“备份与恢复”入口。
- arm64 与受测 x86_64 的 DEX、Hermes bundle、表情目录和 PNG 共 7 文件逐字节一致。签名与此前版本相同，16KB 对齐、包名/版本/架构检查通过。
- 不调用收费模型；所有生成、HTTP 与同步测试使用本机回环响应。不发送聊天，不读取真实聊天记录，不轮询剪贴板。不进行实体手机录音、付款或微信/QQ 操作。微信/QQ 真机、Android 16、TalkBack、iOS、实际支付与真实模型输出质量仍需另行验收。

原生回归计数（每个模式只计最终通过结果）：

- native-dataChecks: 35
- native-conversationChecks: 30
- native-personaChecks: 15
- native-stickerChecks: 24
- native-exportChecks: 32
- native-transportChecks: 9
- native-streamChecks: 12
- native-attachmentChecks: 48
- native-featureChecks: 21
- native-historySearchChecks: 17
- layoutUi-2.0: 34
- layoutUi-1.0: 34
- backupPanelUi-1.0: 19
- referenceUi-2.0: 30
- referenceUi-1.0: 33
- lifecycleUi-2.0: 26
- flowUi-1.0: 70
- imeExpressionsUi-1.0: 64
- maintenanceUi-1.0: 8
- personaHostUi-1.0: 19
- chatDailyUi-1.0: 68
- expressionsUi-1.0: 30
- personaLayoutUi-2.0: 41

合计 719 项。截图见 ui-1.21.2。
