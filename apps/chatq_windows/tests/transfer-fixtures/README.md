# Synthetic interoperability fixtures

Only invented test content is stored here. Password: `synthetic-迁移😀-password`.

`android.cqtransfer` was produced by the shipping Kotlin codec using Android JCA
on the ChatQPinyinQA emulator (API 35), then decrypted by the C# shipping codec.
SHA256: `188261a5f00f1ef075b59c9fae7c9d892913e5f1b774aec1c2cc1cef0ac7f53d`.

The reverse-direction C# fixture is
`apps/chatq_keyboard/tests/android-native/assets/windows.cqtransfer`.
SHA256: `7fc9bbcaa0f9518843b27f382d0afb92efb194c074e3d33102b3e7fc8141bb24`.
`TransferNativeChecks` decrypts it on Android. Both fixtures contain one invented
AI conversation and favorite, plus synthetic/default personas. Neither is a
user backup or contains credentials. They ship with test projects only.
