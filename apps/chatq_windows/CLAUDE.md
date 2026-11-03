# ChatQ Windows

WPF/.NET10 desktop assistant and native C++ TSF Pinyin input method. Keep the current free personal-API mode and payments off. Native input opens the same assistant; do not describe it as inline AI candidates or mobile data synchronization.

Core owns validation, DPAPI CurrentUser storage, prompts and bounded provider requests. API keys must not appear in display strings, logs, platform requests or plaintext/portable backups. The local atomic rollback .bak remains DPAPI-encrypted under the same Windows account. Requests require explicit user action; use localhost fixtures for regression, never an automatic paid AI call. Preserve cancellation, configuration revision and old-result invalidation.

Native engine links the existing Apache-2.0 mobile Pinyin decoder with Windows-only portability headers. Do not edit mobile decoder source for a Windows-only fix. Input is composed through actual TSF edit sessions, not clipboard replacement or a global keyboard hook. Never read surrounding chat, poll the clipboard or send messages. Cancel stale edits across context/focus changes and leave password, URL, numeric, disabled and read-only contexts alone.

Run `python tests/run-fixture.py <dotnet-path>` for core and invisible in-process WPF control/layout tests. This opens no visible window and injects no input. Build native x64 and x86 with CMake/MSVC and run the offline decoder regressions. The registered TSF fixture and installer smoke script run ONLY in a disposable GitHub Windows VM; do not spoof GITHUB_ACTIONS to run them on a user's computer.

The user explicitly chose to defer local visible-window testing. Keep local interactive UI, actual keyboard selection, WeChat/QQ and other application acceptance separate from isolated test results. Do not launch or install the app on this computer until the user changes that choice. Do not use UI automation to bypass UAC, security settings or installation barriers.

Installer writes only ChatQ's own CLSID/profile/category and assistant-path keys. Preserve other input methods and LocalAppData/ChatQWindows during uninstall. Code signing and physical user-machine acceptance remain separate release gates. Tests and fixture executables must never be included in the shipped installer or portable assistant.

Brand.ico is a format conversion of the existing ChatQ icon with DIB frames; PNG-compressed ICO frames failed WPF decoding. Preserve the original branding. Inno translation, its source hash and license are vendored under installer; retain the notices. Runtime licenses are included in distribution packages.

State format2 adds bounded reply history and custom PNG stickers. Read format1 and retain a separate encrypted .v1 rollback on first write. Never silently truncate favorites or overwrite the pre-upgrade snapshot. Portable .cqb backups use an explicit credential-free DTO, PBKDF2-SHA256 and AES-GCM; restoring preserves local API profiles and requires preview/confirmation. Explicit unreadable-data recovery keeps the old bad file AND prior rollback.

Screenshots are explicitly selected/pasted, cropped and irreversibly masked before a vision request. Never capture other windows automatically. Every edit invalidates recognized text. MicrophoneCapture opens a device only after Start; recording is local and bounded120s, transcription requires a separate explicit click. Compile and synthetic WAV/vision tests do not validate microphones or paid providers. Stickers copy/export only, never send to apps. Update checks are manual, restricted to the own HTTPS feed, and never install automatically. Desktop/Design.cs and DESIGN.md own the layout conventions.
