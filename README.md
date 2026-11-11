# 聊商 ChatQ

Windows 桌面 AI 助手与原生 TSF 拼音输入法、Android 聊天键盘和 AI 对话应用，配套管理后台与服务端。基于 [app-mamager](https://github.com/ljx0517/app-mamager) 开发。免费、自备 API，正式收款关闭。iOS 工程仅保留归档。

## 下载与状态

- [Windows 0.8.1 预览版安装包](https://lt.youling.lol/downloads/ChatQ-Windows-0.8.1-x64-Setup.exe)
- [Windows 0.8.1 便携助手](https://lt.youling.lol/downloads/ChatQ-Windows-0.8.1-x64-Portable.zip)
- [Android 1.32.0 内测安装包](https://lt.youling.lol/downloads/ChatQ-1.32.0-layout-arm64.apk)

Windows 安装时选择“桌面助手和系统输入法”以安装拼音输入服务；便携包只提供助手。Windows 尚无正式代码签名，Android 使用内测签名。真实软件输入、外部连接、硬件与双设备迁移属于独立验收范围。

0.8.1 完善分段模式选择、偏好设置卡片与导航分组，突出回复复制，优化输入法辅助说明字号。参考 WPF UI 与 MaterialDesignInXAML 的组件布局，使用现有 WPF 实现。611项核心、564项不可见界面、双架构各648项注册TSF合成检查及0.8.0升级保留数据检查通过，下载和更新清单已校验。[交付审查](artifacts/ChatQ-Windows-0.8.1-audit.json) · [UI审核与署名](apps/chatq_windows/docs/UNSLOP-UI.md)

## Windows 使用

首次在“我的 API”保存自己的接口、密钥和模型。密钥只在本机配置，不写入公开文件或普通备份。供应商可能按自己的套餐收费。

切换到聊商输入法，在候选框点击“AI 回复”，或按 Ctrl+Shift+空格、右键中英状态打开面板。复制消息后点“粘贴生成”，选中自己的话可“选中润色”；逐条查看后复制或填入，Esc返回打字。快捷面板沿用保存的 API、人设和回复条数，无需打开主窗口生成。来源仅限主动粘贴或选择，不监听剪贴板、不自动读取聊天。

主应用提供多轮 AI 对话、人设、截图辅助、草稿、生成记录、收藏、资料分析、备份恢复和更新检查。聊天资料导入只处理主动选择的文件；数据库导出只接受已解密、关闭的独立副本，不获取密钥或读取实时数据库。分析前需要确认身份、范围和外发预览。

Windows / Android 使用手动加密资料互通，迁移人设文本、收藏句及 AI 对话主线；预览后合并，冲突保留本机。API、连接凭据和原始聊天资料不随此格式迁移。

## 开发与验证

Windows 原生拼音采用离线词典，包含全拼、常用简拼和分段选词。AI 操作使用个人供应商接口；消息适配器需要独立配置和平台验收，不能以合成测试声称无人值守可用。

Windows 核心和不可见 WPF 回归使用合成数据及本机模拟接口。注册 TSF、双架构和安装升级检查只在一次性 Windows 虚拟机运行。Android 使用类型检查、相关回归和模拟器交互检查。开发回归不调用收费模型，不操作真实聊天软件或注入物理输入。

当前优先完善 Windows 与 Android 的日常输入、配置、取消、保存、备份和布局。正式签名、完整读屏、真实平台及硬件兼容需要分别验收。具体模块说明见 [Windows 指南](apps/chatq_windows/README.md) 和 [Android 工程](apps/chatq_keyboard)。

Android 1.32.0 重排首页编辑区、回复偏好面板和键盘结果区域。216项应用回归及100%/200%字号下各112项模拟器检查通过。[UI审核与署名](apps/chatq_keyboard/DESIGN-1.32.0.md) · [交付检查](artifacts/ChatQ-1.32.0-layout-audit.json)
