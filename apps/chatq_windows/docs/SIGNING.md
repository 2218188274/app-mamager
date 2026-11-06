# 发布签名与恢复

Windows 当前交付仍为未签名预览版。用户尚无代码签名证书，不能把自签名证书或编译成功称为正式签名。

`scripts/sign-release.ps1 -Mode check` 只检查明确指定的当前用户证书。
正式打包需提供对应私钥、代码签名用途、有效期、可信证书链，以及精确发布者和指纹。
打包脚本验证 Microsoft SignTool、Inno Setup，签名桌面程序、两种架构输入法、安装与卸载程序并要求时间戳。
已有安装包不覆盖；当前无正式证书，实际签名路径尚待验收。
`tests/signing-checks.ps1` 使用内存中的合成证书验证拒绝条件，不安装证书或改变信任。

安卓使用独立发布密钥和包名 `com.jaxon.app.chatq.release`，与旧内测版并存。
旧内测签名不能直接升级为新签名；切换前先在旧版导出完整备份，再在新版预览恢复。
Windows/安卓之间使用 `.cqtransfer`，安卓两种版本之间可使用完整加密备份。
正式版和内测版更新地址隔离，并在安装前核对包名和证书。

开发机发布密钥放在当前 Windows 用户的 `LocalAppData/ChatQSigning/android-production`，
密码用 DPAPI 加密，目录仅该用户与 SYSTEM 可访问，不进入 Git 或服务器。
构建时使用安卓工程的 `scripts/with-android-signing.ps1` 临时提供环境变量，关闭 Gradle 配置缓存。
正式构建缺少字段、使用模板密钥、指纹不符时必须失败。

**独立恢复备份尚需所有者操作。** 在 PowerShell 7 运行安卓工程的
`scripts/android-signing-backup.ps1 -Mode Export -File <源码目录以外的绝对路径.cqsigning>`，
本人输入并确认 12–128 字符口令，不要把口令发到聊天里。工具加密并读回校验；
把文件复制到独立介质并保管口令。尚未完成独立备份前不切换公开正式版更新地址。
恢复只能在空的签名目录进行，拒绝替换已有密钥；会核对证书指纹并重新使用目标用户的 DPAPI。
目前备份加密、错误口令和篡改检查通过，跨 Windows 用户的实际恢复演练仍待完成。
