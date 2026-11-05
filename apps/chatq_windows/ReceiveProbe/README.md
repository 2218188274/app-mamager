# 微信本机 OCR 接收诊断

这是单独的只读诊断工程，未接入消息助手、没有发送功能，也不包含在现有安装包或便携包中。目的是在标准可访问性控件不可用时，验证本机是否能识别指定独立测试窗口中新出现的约定文字。它不代表微信连接器或持续自动回复已经完成。

## 已有隔离验证

- `--check` 只查询系统窗口捕获支持与中文 OCR 引擎是否存在，不枚举微信窗口或截图。
- `--self-test` 只在内存渲染合成文字并调用 Windows 离线 OCR，不打开可见窗口、不截图、不联网。
- Core 的合成像素回归覆盖旧内容基线、稳定帧、新内容裁剪、滚动/旧行变化、尺寸变化、黑屏、空间不足和释放后停机。

```powershell
dotnet build ReceiveProbe/ChatQ.ReceiveProbe.csproj -c Release
dotnet run --project ReceiveProbe/ChatQ.ReceiveProbe.csproj -c Release -- --check
dotnet run --project ReceiveProbe/ChatQ.ReceiveProbe.csproj -c Release -- --self-test
```

## 单次真实接收测试的边界

先由本人同意这一次窗口截图读取并准备单独的私聊测试窗口，可见区域仅有允许的测试内容。实际测试与常规编译/隔离回归分开，不能由巡检自动启动；之前的无截图控件复核并不等于本次截图授权。不要自动修改模板中的确认项。

在本机私有目录复制配置模板，填入准确独立窗口名。归一化裁剪范围必须根据本人允许的测试窗口校准，只覆盖左侧新消息区域，排除标题、输入区及其他会话。模板坐标只是格式示例，不能当作已经校准。账号和好友的微信号不写入此模板，不加入仓库。两个确认项仅在本人确认窗口范围后才能设为 `true`。

可先打开本机框选界面。它只对唯一指定的可见窗口捕获一张内存图片，显示为本机预览；不监听、不识别聊天文字。由本人框选、勾选范围确认并点击保存后，才写入本机私有校准文件。关闭预览不启动监听。窗口可以在后台，但不能最小化；没有桌面截图回退。

```powershell
dotnet run --project ReceiveProbe/ChatQ.ReceiveProbe.csproj -c Release -- --calibrate C:\PRIVATE\calibration.json --accept-test-window-capture
```

```powershell
dotnet run --project ReceiveProbe/ChatQ.ReceiveProbe.csproj -c Release -- --listen C:\PRIVATE\calibration.json --accept-test-window-capture
```

监听程序只匹配所选可执行文件中准确同名的唯一可见窗口，不激活、搜索、点击、打字、粘贴或发送。仅使用 Windows.Graphics.Capture 的单窗口捕获，没有桌面截图回退。开始时先等本人将指定窗口置于前台，此时尚不截图；首帧基线建立后才让测试好友发约定文字。捕获开始后窗口失去前台、最小化、改名、进程/DPI或尺寸变化、桌面不可用均停止。关闭或超时也停止，包括等待前台在内最长90秒，不重连。

首帧只建立像素基线，不进行 OCR。只有基线旧内容保持不变、下方追加区域连续两帧稳定时，才对新增区域做离线识别。滚动或旧行变化立即停止；当前只验证浅色、未滚动、有追加空间的单个测试消息，不承诺深色主题、长消息、滚屏、多窗口、多账号、媒体或日常自动回复兼容。识别只核对约定文字，输出匹配与否及固定状态码，不输出聊天原文或私有标识；图片不写磁盘。诊断不调用API、读取聊天数据库或进程内存，也不轮询剪贴板。

即使识别成功，也只说明该校准区域出现了新的约定文字。账号和私聊身份仍由本人准备，程序没有证明真实微信号、好友身份、草稿保护、主应用消息流或发送能力；结果明确标记 `accountIdentityVerified=false`、`realMessageHubConnected=false`。这些验收门槛完成前不得启用AI自动发送。

方案参考公开的本机 OCR 路线，没有复制或运行其自动回复闭环：

- [wechat-ollama-auto-reply](https://github.com/Jeas-Code/wechat-ollama-auto-reply)
- [Windows 单窗口捕获文档](https://learn.microsoft.com/windows/win32/api/windows.graphics.capture.interop/nf-windows-graphics-capture-interop-igraphicscaptureiteminterop-createforwindow)

当前代码为聊商独立实现；系统 OCR 不需要用户AI密钥或云端视觉服务。
