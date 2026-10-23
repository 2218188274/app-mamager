# Android 1.4.1 stability and daily input

1. Preserve editor contents when applications restart input; discard stale composition/correction/cloud state on external cursor changes and input teardown.
2. Restore the letter layout after English composition confirmation/correction from expanded candidates. Keep identifiers raw and make keyboard settings return explicit.
3. Make cloud cancellation cover connection setup races and scope cached candidates to connection configuration. Keep local input usable offline.
4. Give expired voice sessions a usable terminal state instead of leaving a disabled recognition button. Keep original-editor and explicit-insertion checks.
5. Add actual-editor regression coverage for restart, external edits, rapid typing, expanded candidates, identifiers, repeat deletion and secure editor transitions. Run native/mobile and existing daily suites, build/sign/version/publish the update and verify the download.

Completed 2026-10-21. The 1.4.1/code 6 arm64 APK has been published and its full public download matches the local hash. The patched service passes 20 editor stability checks, 40 native/network checks, 32 daily input cases and 14 offline nine-key/English cases, plus real AI/cloud and manual voice-handoff verification. Release lint, signature and 16 KB alignment pass. The deterministic 1.4.0 baseline failure is expanded English raw confirmation; an initial apparent restart loss was a fixture startup race and is documented as such. Device microphone and long-running OEM/chat-app validation remain unverified. See artifacts/ChatQ-1.4.1-validation.md.
