# ChatQ Android 1.5.0 validation

Date: 2026-10-21. Package com.jaxon.app.chatq, versionCode 7, arm64-v8a, min SDK 24 / target SDK 36.

## Changes

- Full Pinyin and nine-key share the immutable 65,124-entry source dictionary plus 109 authored chat phrases. Chat phrases support syllable initials such as wzdl / 我知道了 and mwt / 没问题. Preserve original frequencies when a phrase already exists in the dictionary.
- Nine-key adds bounded multiword sentence candidates, frequency-ranked prefix completions and readable syllable labels. Partial word selection retains the remaining digits. Personal words also match prefixes of longer compositions; learned ranking retains existing syllable labels.
- After an explicit Chinese selection, show offline next-word/phrase-suffix choices. Only a tap inserts the suffix; space stays literal. Cursor changes, punctuation, editor switches, AI panels and input teardown clear transient context. Private/password editors disable predictions. The host preference can disable predictions. No clipboard polling, automatic surrounding-chat collection or extra network requests were added. On an explicit prediction tap, a bounded suffix read verifies the cursor still follows the text selected in this session.
- Generate sorted indexes at build time, share loaded data, cache at most 96 base Pinyin/nine-key results, and apply current personal ranking on every query. Reuse at most 14 candidate-strip views while retaining the full expanded list. Cloud refreshes retain scroll and a pressed candidate's identity; composition-bound actions reject obsolete items. Automatic learning updates memory immediately and writes to disk asynchronously; manual edits still confirm durable saving.

## Verified

- 224 shipping Kotlin/native checks on Android: 64 behavior/settings/dictionary/network checks and 160 seeded random nine-key compositions with bounds, duplicate and consumption invariants. Includes all authored phrase initials, apostrophes, nine-key sentence/partial consumption, LRU bounds, associations, learning/privacy switches, learned reading preservation, manual prefix ranking, immediate cross-store learned-word visibility and native decoder merge. Loopback networking uses test credentials only.
- 27 actual-editor candidate checks: full Pinyin, initials, explicit selection, no auto-insertion/sending, local association taps, literal space, cursor movement, AI panel return, editor switches, secure/private editors, preference disabling, nine-key associations and composed sentence, partial selection with remaining digits, expanded readings, bounded strip and rapid Chinese letters.
- 20 existing actual-editor stability checks: restarts, external replacement, English raw confirmation, correction/undo, cursor/editor switching, rapid input, repeat deletion/release, settings return and voice-session expiry.
- 32 existing daily editor checks: Pinyin, partial editing, hide/commit, shift/caps, cursor gestures, clipboard, numbers/URI/email/password fields, full Unicode emoji deletion and editor actions.
- 14 nine-key/English checks with emulator Wi-Fi and mobile data disabled, restored afterward.
- Real authenticated cloud candidate lookup and explicit insertion passed, including private-editor cloud/voice restrictions. The fixture now launches the host and waits for the IME before typing; an initial run had not reached the Chinese keyboard-ready state.
- A real AI request passed candidate preview, explicit insertion and no automatic send. Voice-session transcript preview/manual insertion into the original field also passed; this is not a new microphone/ASR test.
- Actual AOSP decoder C++ fixture compiled with the Android NDK and executed on the emulator against the shipped dictionary: common words/sentences/initials/v/apostrophe/partial consumption, invalid input and 1,000 seeded random compositions; passed (103 ms random loop). Core code and dictionary unchanged.
- TypeScript check, 12 mobile API/persona/cache tests and the generated iOS project structure/version check passed. The iOS check does not compile an IPA.
- Release arm64 and x86_64 builds passed. Android release lint: zero errors, 29 existing/generated warnings. APK signature verified and 16 KB zip alignment checked; certificate matches earlier internal previews.

## Performance sample

Android 11/API 30 x86_64 emulator, 320x640 mdpi. Final process: shared dictionary load 197.84 ms; repeated lookup median 0.000605 ms, p95 0.0018 ms; 100 distinct seeded 18-digit lookups p95 0.855 ms, max 2.111 ms. Earlier cold runs ranged roughly 247–293 ms. Baseline 1.4.1: load 285 ms, repeated p95 0.118 ms, uncached-random p95 0.158 ms. New sentence generation does more work on uncached input; timings are lookup measurements, not end-to-end key-to-display latency or a phone performance guarantee. A first implementation taking about 1 second to load was replaced by pre-generated binary indexes.

The candidate UI fixture caught and fixed a pressed reused button retaining its old label after selection, and learned-word ranking losing original syllable spacing. It also verifies explicit manual insertion rather than assuming visible candidates were committed.

## Delivery and limits

APK: ChatQ-1.5.0-candidates-arm64.apk, 26,227,618 bytes.
SHA-256: bbbd0c0813bfdc4c7284550d408d5c6073c4688cb9b1dd4611bec1e31b383f3a.
Certificate SHA-256: fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c.
Source archive preserves the prior complete backend/admin source and replaces the mobile source; dependencies, caches, build outputs, local.properties and local environment files are excluded. Dataset licenses and generators are included.

Android features were exercised in an emulator. This run does not certify physical-phone microphone behavior or WeChat/QQ-specific editor behavior. iPhone retains the existing project with 1.5.0/7 metadata; this Android-only change was not compiled with Xcode, signed or tested on an iPhone. Existing IP/HTTP and internal preview signing remain in place. Backend, AI model configuration and speech service are unchanged; no new supplier API settings are required.

## Publication verification

Published to http://103.149.91.78/downloads/ on 2026-10-21. An external full 26,227,618-byte APK download (all HTTP ranges reassembled) matched SHA-256 bbbd0c0813bfdc4c7284550d408d5c6073c4688cb9b1dd4611bec1e31b383f3a. Server APK/source hashes matched local metadata before publication. The 247-file mobile source sync preserved the existing .env.local byte-for-byte; a protected mobile backup was made before sync. API and speech health checks passed after publication.
