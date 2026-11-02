# 聊商 Windows 0.1.0

Windows 10/11 x64 的桌面 AI 助手与原生 TSF 拼音输入法首版。当前免费、自备 API；不启用会员购买和正式收款。API 生成直连用户供应商。

## 使用

运行完整版 Setup，按需选择桌面助手和输入法；系统输入法注册需要管理员确认。安装后打开聊商 → 我的 API → 保存供应商基础地址、密钥和模型。生成、测试连接和获取模型列表都由用户主动触发。

- 帮回复 / 润色 / 找话题、人设 / 关系 / 目标、1–10条回复；生成后主动复制再粘贴。
- AI 对话：本机多轮会话、流式回复、停止、重新生成、搜索、改名、删除和文本导出。
- 人设中心：内置人设、自定义编辑、AI 生成草稿后确认保存。
- Ctrl+Alt+Q 唤出助手（只在应用运行期间注册，冲突时提示）；不自动读取或轮询剪贴板，不自动发送消息。
- Win+空格选择“聊商拼音”；字母输入拼音，空格或1–5选词，Page Up/Down翻页，左右键切换候选；Esc取消、退格编辑、Enter确认原文，Ctrl+空格切换中英。候选栏 AI 按钮打开同一个桌面助手，API、人设与会话共用本机配置。
- API 密钥及本机会话/草稿使用 Windows DPAPI CurrentUser 加密；损坏时停止覆盖，保留加密备份。数据位于当前账号 LocalAppData/ChatQWindows，不因卸载自动删除。

便携版只运行桌面助手，不会自动注册系统输入法。卸载完整版仅移除本项目的 COM/TSF 注册，不改变其他输入法或删除本机用户数据。

## 构建与验证

要求 .NET10 SDK、Visual Studio2022 C++工具和Windows SDK、CMake、Python3、Inno Setup6。

```powershell
dotnet build Desktop/ChatQ.Desktop.csproj -c Release
python tests/run-fixture.py
cmake -S native -B out/native-x64 -A x64
cmake --build out/native-x64 --config Release
ctest --test-dir out/native-x64 -C Release --output-on-failure
```

GitHub Actions `ChatQ Windows build` 为手动构建，生成 x64/x86 输入法、包含运行时的 x64 助手和 Setup。测试使用实际 Windows DPAPI、本地合成 HTTP 模型、离线词典和实际 TSF 管理器/合成内存文档，不读取用户聊天，不进行付费 AI 调用，不注册全局默认输入法。

当前是未完成正式代码签名的预览版本。构建成功与合成 TSF 回归不能等同于完成安装、微信/QQ、浏览器、Office、UWP、管理员窗口或长期输入体验验收。候选屏幕阅读器集成、完整移动端数据互通、截图/表情/语音、单手/九宫格等不属于本首版已验收范围；验收状态以交付报告为准。
