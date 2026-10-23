# ChatQ Android 1.4.1 validation

Date: 2026-10-21. Android versionCode 6, package com.jaxon.app.chatq, arm64-v8a, min SDK 24 / target SDK 36.

## Changes

- Confirming raw English from expanded candidates restores the letter keys. The 1.4.0 service deterministically failed this real-editor regression; the patched service passes.
- End stale composition/cloud state on editor restarts, external selection changes and input teardown. Restart handling finishes the composing span without rewriting text supplied by the application.
- Do not autocorrect an English word when a digit or identifier separator follows it. Keep ordinary prose correction and immediate backspace undo.
- Scope cloud candidates to their exact composing code and connection configuration; validate returned codes and consume lengths. AI/cloud HTTP requests reject obsolete work, support cancellation during connection setup, and bound response text to 32,768 characters. Hiding the keyboard cancels AI work and clears its candidates.
- Give invalid/expired voice sessions a return action, clear transient audio, and prevent late callbacks from re-enabling stale controls. The settings toolbar explicitly offers return to typing.

## Verified

- 20 actual editor stability assertions: restart and external replacement, expanded English raw confirmation, identifier suffixes, correction/undo, cursor moves, editor switching, rapid 28-letter burst, repeat deletion/release and field isolation, settings return, voice expiry UI.
- 40 native checks: preferences, bounded local vocabulary, nine-key/English data, WAV/session checks, plus loopback HTTP cancellation, timeout, response size and successful reuse after cancellation. These HTTP checks use test credentials only.
- 32 existing daily input assertions: Pinyin, partial editing, hide/commit, shift/caps, cursor gestures, clipboard actions, numeric/URI/password fields, whole emoji deletion, search/send and multiline actions.
- 14 nine-key/English assertions with external connectivity disabled.
- Authenticated real cloud candidate lookup and explicit insertion, private-editor cloud/voice restrictions.
- A real AI request through the shipping native HTTP client: candidate preview, explicit insertion, no automatic send.
- Voice result handoff to the original fixture field: no automatic insertion, manual fill. This injects a known transcript into the in-memory session and is not an ASR accuracy or microphone test.
- Mobile strict TypeScript and 12 tests; generated iOS source-structure test (metadata bumped only).
- Android release builds for x86_64 QA and arm64 delivery; release lint: 0 errors, 29 existing/generated warnings.
- APK v2 signature matches the previous internal preview certificate; 16 KB zip alignment passes. Test applications remain outside the shipping application.

The initial restart test ran before the keyboard was ready and produced an apparent lost-word result. Added preconditions ruled out that startup artifact. Restart handling is defensive; the confirmed baseline defect is the expanded English panel. Fixture launch/readiness was also hardened for the voice and AI tests.

## Artifact

- APK: ChatQ-1.4.1-stable-arm64.apk
- Bytes: 24,382,797
- SHA-256: 19380649ea005ad8be1234e2d38d3ec597e7021c2dd8fcae5933e310005d1a30
- Signing certificate SHA-256: fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c
- URL: http://103.149.91.78/downloads/ChatQ-1.4.1-stable-arm64.apk

Full public HTTP download verified byte-for-byte against this SHA-256.

## Limits

Editor UI tests run on Android 11/API 30 x86_64 at 320x640 mdpi. Physical handset microphone, prolonged WeChat/QQ sessions, OEM battery management and other Android versions still require device testing. The existing server ASR and lexicon were health-checked; no backend behavior or supplier configuration changed in this release. The earlier real Chinese/English ASR fixture results are documented in the 1.4.0 report. No Mac/Xcode build or IPA is claimed. Existing IP/HTTP access and internal preview signing remain in use.
