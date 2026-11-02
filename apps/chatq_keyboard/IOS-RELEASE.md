# 苹果手机打包与交付

当前为免费、自备 API 模式。苹果主应用和键盘共用本机 Keychain 配置；不恢复收费或会员门槛。

## 当前能够交付的内容

- Xcode 工程、主应用与键盘扩展源码。
- 已验证的 Release 模拟器构建及启动结果。
- 独立的 iPhone arm64 Release 归档工作流；实际结果以构建报告为准。
- 账号开通后的签名、Ad Hoc IPA 导出和包检查脚本。签名分支尚无实际证书验证。

**未签名归档和模拟器 ZIP 都不能安装在 iPhone 上。** 把文件改名为 IPA、放到服务器或扫描下载二维码，不能替代 Apple 签名。没有开发者签名时不发布虚假的“苹果下载安装”入口。

## 没有 Mac 时先构建手机归档

打开仓库的 Actions → `ChatQ iPhone device archive` → Run workflow。该任务只在人工启动时运行，不调用 AI，不上传 App Store，也不改变安卓下载指针。生成的 `ChatQ-iPhone-device-UNSIGNED-NOT-INSTALLABLE` 包含：

- `ChatQ-ios-device-unsigned.zip`：真正针对 iPhoneOS/arm64 的 `.xcarchive`，不是模拟器。
- `device-build.json`：主应用/扩展版本、平台、JS 和拼音词典检查，明确 `deviceInstallable: false`。

归档中的 `main.jsbundle` 已随 Release 构建打入，安装后的应用无需电脑运行开发服务器。

## 开发者账号准备

Apple Developer Program 可按个人身份申请；不需要为此先开通商户。当前用户尚未开通，不能代为完成身份验证、订阅或创建签名身份。个人账号相关要求以 [Apple 官方说明](https://developer.apple.com/help/account/membership/program-enrollment)为准。

账号可用后，需要为同一 Team 配置两个显式 App ID：

| 用途 | 标识 |
| --- | --- |
| 主应用 | `com.jaxon.app.chatq` |
| 键盘扩展 | `com.jaxon.app.chatq.keyboard` |
| 共同 App Group | `group.com.jaxon.app.chatq` |
| 共同 Keychain Group | `$(AppIdentifierPrefix)com.jaxon.app.chatq.shared` |

两个 App ID 都应启用并关联上述 App Group。`AppIdentifierPrefix` 由 Apple 签名配置解析；不能在源码里填写或提交证书私钥。若标识已被其他 Team 占用，应统一调整主应用、扩展、App Group 和 Keychain 配置并重新验收，不能只改某一个 Bundle ID。

第一次手机内测推荐 Ad Hoc。先将测试 iPhone 注册到开发者账号；主应用和键盘的分发描述文件必须包含相同的测试设备。参见 [Apple 注册设备分发说明](https://developer.apple.com/documentation/xcode/distributing-your-app-to-registered-devices)和[描述文件要求](https://developer.apple.com/help/account/provisioning-profiles/create-an-ad-hoc-provisioning-profile)。

## 已授权的 Mac 上签名和导出 IPA

要求 Xcode 16.4 或可构建当前 Expo/RN 工程的更新版本、Node 22、CocoaPods，以及本人已在 Xcode → Settings → Accounts 登录的开发者账号。现有无签名 GitHub runner 没有该账号，不能直接执行签名分支。

```bash
cd apps/chatq_keyboard
npm ci
export CHATQ_IOS_TEAM_ID=你的10位TeamID
# 选一个新目录；脚本拒绝覆盖已有归档和导出。
export CHATQ_IOS_DEVICE_BUILD_DIR="$HOME/ChatQRelease/build32"
bash scripts/archive-ios.sh signed
```

脚本执行类型检查、应用回归和打包检查回归，重建 iOS 工程与 Pods，然后请求 Xcode 为两个目标自动签名。首次可能需要在 Xcode 中确认账号、证书、App Group 权限和测试设备。Team ID、描述文件和证书不匹配时应修正配置，不应删掉 Keychain/App Group 能力凑出安装包。

导出位置为 `export/*.ipa`。脚本对实际导出的 IPA 再核验：iPhoneOS/arm64、主应用及扩展版本、内置 JS/词典、Apple 分发签名、描述文件有效期和设备覆盖、App Group 与共享 Keychain 的实际签名权限。仅检查成功后生成 `signed-export.json` 和 IPA SHA-256。该报告证明包检查通过，不代表真机功能已验收。

这个流程不自动上传 TestFlight、不公开发布 IPA。后续公开测试需另外完成 App Store Connect 应用配置、上传和 TestFlight 审核；不能将 Ad Hoc 包当作所有人都能安装的版本。

## 手机安装后的验收

1. 在注册的 iPhone 安装 IPA 并打开聊商，确认免费、自备 API 页面和实际版本。
2. 系统设置 → 通用 → 键盘 → 键盘 → 添加新键盘 → 聊商；使用联网 AI 时由本人决定开启“允许完全访问”。
3. 主应用主动配置测试 API；先验证 App 与键盘能共享配置。未允许完全访问时应保留基础打字并提示。
4. 在不展示私人聊天的测试输入框中检查拼音、粘贴生成、润色、1–10 条、人设切换、停止生成和返回打字。只填入文字，不自动发送。
5. 分别检查小屏、大字号、切换输入框/输入法、断网和重开键盘；最后再按用户安排进行微信/QQ 真机测试。

在有签名及真机结果以前，不把编译成功称为“苹果版已可日常使用”。
