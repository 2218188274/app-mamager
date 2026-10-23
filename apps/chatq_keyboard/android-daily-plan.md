# Android daily keyboard — 1.3.0

1. Replace the equal-width prototype layout with staggered QWERTY, a wide spacebar, shift/caps lock, repeat deletion, proper editor actions and remembered language.
2. Add expanded candidates, number/symbol pages, emoji and an explicit editing/clipboard panel. Keep AI opt-in and fit its panel in the normal keyboard area.
3. Add local word ranking and custom word shortcuts, respecting password/no-personalized-learning fields. Expose word management and typing preferences in the host app and quick preferences in the keyboard.
4. Validate real InputConnection behavior in a separate fixture app: Chinese composition, candidate selection, symbols/numbers, emoji deletion, shift, cursor/selection, clipboard, enter actions, secure fields, persistence and landscape. Keep the current API/persona tests passing.
5. Build and verify the arm64 release, preserve the previous APK, sync server sources and publish the new download. Physical phone validation is pending reconnection.
