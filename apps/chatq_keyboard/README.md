# 聊商键盘（当前 Android 1.29.1 / iOS 源码构建32）

Android versionCode 44, Android 7.0+, arm64-v8a. 免费、自备 API；最新功能及使用说明见 [MOBILE.md](MOBILE.md)。覆盖安装现有内测版以保留本机数据。iOS 已完成自备 API 核心开发和模拟器编译、启动验证，手机打包与签名步骤见 [IOS-RELEASE.md](IOS-RELEASE.md)；目前没有可安装的签名 IPA。

- **九宫格**：键盘设置中点击“布局：全键盘”切换，或在 App → 启用键盘 → 键盘偏好中选择布局。输入 2–9 拼音码、选择候选；“选音”可筛选读音。数字、符号使用 123 / 标点页。九宫格和全键盘共用自定义常用词，并保留未消费的拼音码。
- **英文纠错**：切到英文，输入空格时自动纠正常见拼写错误，例如 `teh → the`、`helo → hello`、`wrold → world`。紧接着退格可撤销纠错。候选也可手动选择，点击“原文”保留原词，长按“原文”可记住专有词。App 键盘偏好可以关闭自动纠错。邮箱、网址、密码、禁止个性化和禁止建议的字段不自动纠错。
- **云词库**：在 App 键盘偏好中开启，默认关闭。仅上传当前正在输入的拼音码/九宫格数字，候选带云朵标记；选择时只填入文字。断网、超时或服务繁忙时继续使用本机词库。密码和禁止个性化字段不发送查询。
- **语音输入**：键盘顶部“语音”→ 开始录音 → 允许麦克风 → 结束录音 → 识别录音 → 返回键盘预览 → 填入文字。最长 20 秒，支持中文/英文；到时只停止录音，仍需主动点击识别。后台切换或取消会停止录音并丢弃会话。识别结果绑定原输入框，切换输入框后不转移；不会自动发送聊天。需要联网访问自己的语音服务，暂不支持离线语音和方言专用模型。

保留拼音、选词记忆、编辑/剪贴板工具、表情、大小写、手势光标、外观/高度设置、AI 回复及人设功能。用户在主应用“我的 API”配置供应商地址、密钥和模型，生成直连自己的供应商；不要求购买会员。语音和云词库使用独立的平台配置。

## Development

`app.config.js` is canonical. Run `npm run check`, `npm test`, `node scripts/build-typing-data.cjs`, and `npx expo prebuild --platform android --no-install`. Use an ASCII-path build copy if the Android NDK cannot handle the source directory's Chinese characters. Use the existing signing certificate for upgrades; this remains an internal preview build.

`tests/build-android-fixtures.ps1` builds separate test APKs. `KeyboardInstrumentation` exercises actual Kotlin engines and settings using isolated preferences; `voiceUi` and `cloudUi` modes additionally use controlled fixture editors. `android-daily-ui.ps1` covers the original 32 real-editor cases; `android-advanced-ui.ps1` covers nine-key and English correction/undo. Test APKs are not part of the delivered app.

Data sources, licenses and modifications are recorded in `modules/chatq-keyboard/vendor/typing`, generated `src/main/assets/typing-NOTICE.txt`, and `server/data/input/NOTICE.txt`. Rime/AOSP: Apache 2.0; FrequencyWords and CC-CEDICT data: CC BY-SA 4.0. Application source licensing is separate. The derived datasets and their reproducible generator are included with the source package.

Nine-key, enhanced dictionaries and the speech workflow described above are Android-only. iOS has shared native BYOK, streaming, cancellation and keyboard reply/polish/persona workflows; signed Keychain access and physical-device acceptance are pending. Android WeChat/QQ physical-device acceptance is also pending; synthetic fixtures and simulator checks are recorded separately.
