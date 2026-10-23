# 聊商安卓键盘 1.4.0

Android versionCode 5, Android 7.0+, arm64-v8a. Install over the existing preview build to retain server configuration, personas and user words. Enable 聊商 in system keyboard settings and select it as the current input method. Open the host app once to finish registering the device and sharing its connection settings with the native keyboard.

- **九宫格**：键盘设置中点击“布局：全键盘”切换，或在 App → 启用键盘 → 键盘偏好中选择布局。输入 2–9 拼音码、选择候选；“选音”可筛选读音。数字、符号使用 123 / 标点页。九宫格和全键盘共用自定义常用词，并保留未消费的拼音码。
- **英文纠错**：切到英文，输入空格时自动纠正常见拼写错误，例如 `teh → the`、`helo → hello`、`wrold → world`。紧接着退格可撤销纠错。候选也可手动选择，点击“原文”保留原词，长按“原文”可记住专有词。App 键盘偏好可以关闭自动纠错。邮箱、网址、密码、禁止个性化和禁止建议的字段不自动纠错。
- **云词库**：在 App 键盘偏好中开启，默认关闭。仅上传当前正在输入的拼音码/九宫格数字，候选带云朵标记；选择时只填入文字。断网、超时或服务繁忙时继续使用本机词库。密码和禁止个性化字段不发送查询。
- **语音输入**：键盘顶部“语音”→ 开始录音 → 允许麦克风 → 结束录音 → 识别录音 → 返回键盘预览 → 填入文字。最长 20 秒，支持中文/英文；到时只停止录音，仍需主动点击识别。后台切换或取消会停止录音并丢弃会话。识别结果绑定原输入框，切换输入框后不转移；不会自动发送聊天。需要联网访问自己的语音服务，暂不支持离线语音和方言专用模型。

保留 1.3 的拼音、选词记忆、编辑/剪贴板工具、表情、大小写、手势光标、外观/高度设置、真实 AI 回复及人设功能。AI 地址、密钥和模型继续在管理后台配置。语音和云词库不使用手机内置 Google 语音服务，不需要单独配置收费语音 API。

## Development

`app.config.js` is canonical. Run `npm run check`, `npm test`, `node scripts/build-typing-data.cjs`, and `npx expo prebuild --platform android --no-install`. Use an ASCII-path build copy if the Android NDK cannot handle the source directory's Chinese characters. Use the existing signing certificate for upgrades; this remains an internal preview build.

`tests/build-android-fixtures.ps1` builds separate test APKs. `KeyboardInstrumentation` exercises actual Kotlin engines and settings using isolated preferences; `voiceUi` and `cloudUi` modes additionally use controlled fixture editors. `android-daily-ui.ps1` covers the original 32 real-editor cases; `android-advanced-ui.ps1` covers nine-key and English correction/undo. Test APKs are not part of the delivered app.

Data sources, licenses and modifications are recorded in `modules/chatq-keyboard/vendor/typing`, generated `src/main/assets/typing-NOTICE.txt`, and `server/data/input/NOTICE.txt`. Rime/AOSP: Apache 2.0; FrequencyWords and CC-CEDICT data: CC BY-SA 4.0. Application source licensing is separate. The derived datasets and their reproducible generator are included with the source package.

The new four input features are Android-only. iOS retains its prior keyboard implementation and source project; no IPA or Xcode verification is claimed. A physical Android microphone and the user's particular chat apps still need a hands-on check; emulator recording lifecycle, real server transcription and explicit result insertion are covered separately.
