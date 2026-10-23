# ChatQ 1.2.0 verification — 2026-10-21

- Android versionName 1.2.0, versionCode 3; arm64-v8a release, 23,481,226 bytes.
- APK SHA-256: `6addcc32e12e67a634ea90f893f6c7a29010ed0a425c22073f7d75f97f1320e1`.
- Release signature verified, same internal preview certificate as 1.1.0; 16K zip alignment passed.
- TypeScript check, 12 mobile API/persona/cache tests, 10 existing AI provider tests, generated iOS project test passed.
- Android 11 x86_64 emulator: template card created and saved through the host UI; retained across restart; native keyboard selection reflected in the host.
- Two keyboard requests forwarded to the real deployed API through a temporary local QA proxy. Headers were not logged; no model key entered the client. Both responses returned HTTP 200; one candidate was explicitly inserted through InputConnection.

| Message | Persona / relationship / scene / tone | Actual model response |
| --- | --- | --- |
| 今天有点累 | 甜妹 / 恋人 / 恋爱亲密 / 自然 | 那就靠着我歇一会儿呀，今天的累都先放下，你只管乖乖休息。 |
| 今天有点累 | 自然真诚 / 同事 / 职场沟通 / 得体 | 辛苦了，今天先适当休息一下，调整好状态后再继续工作。有什么需要我协助的，随时告诉我。 |

- Final emulator build passed offline keyboard touch tests: 你好，中国。; deleting and revising composition to 你好; switching to English to produce 你好hello. No AndroidRuntime fatal errors recorded.
- Published APK returned HTTP 200 with matching byte length; server file hash matched the local release metadata.
- API and PostgreSQL remained healthy; unrelated YOULING-XT site health remained available.
- iOS template and generated project include persona menus and shared App Group storage. Xcode compilation/signing and iPhone testing remain pending. User's physical Android phone was disconnected and was not tested in this release.
