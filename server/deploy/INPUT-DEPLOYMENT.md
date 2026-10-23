# Android 1.4 input services

Run from repository root on the existing server. The base compose file remains required: it owns the current database, secrets and API port. The input override selects the new API image and adds the private speech container. It does not expose the Whisper server publicly or change Caddy and YOULING-XT.

```sh
python3 server/deploy/download-speech-model.py
docker build -f server/deploy/Whisper.Dockerfile -t chatq-whisper:1.4.0 .
docker build --target runtime -t chatq-api:input-1.4.0 .
docker compose --env-file /opt/chatq/.env -f deploy/compose.yaml -f server/deploy/compose.input.yaml up -d --no-build whisper api
```

Whisper.cpp v1.9.5 source archive is pinned by SHA-256 in the Dockerfile. The multilingual base-q5_1 model is pinned by SHA-256 in the downloader (59,707,625 bytes). Original source: https://github.com/ggml-org/whisper.cpp ; model: https://huggingface.co/ggerganov/whisper.cpp . Whisper and its models are MIT licensed. The MIT source license is included inside the image. Small-q5_1 was evaluated and retained on this server as an optional quality alternative; base-q5_1 is the deployed default because it recognized the Chinese/English fixtures in about five seconds rather than 24 seconds.

`CHATQ_SPEECH_URL` is the internal inference endpoint, `CHATQ_SPEECH_MODEL` is its display identifier, and `CHATQ_LEXICON_FILE` points to the read-only dataset mount. Supplier AI reply credentials continue to use the existing administrator configuration. Speech requires no separate paid provider key. The mobile connection code is still an application credential and must not be confused with the supplier key.

Authenticated REST routes:

- `GET /api/aikeyboard/lexicon/version`: dataset version, entry count, speech capability and recording limit.
- `POST /api/aikeyboard/lexicon`: `{code, layout: "qwerty" | "nine"}`; maximum 12 exact whole-code matches, no input logging or database writes. Cloud candidates augment offline results. Dataset is under `server/data/input`, with source/license notices.
- `POST /api/aikeyboard/transcribe`: `{audio: base64CanonicalWav, language: "zh" | "en"}`; 16kHz mono PCM16 WAV only, 0.4–20 seconds, maximum 900KB request body. Silence and invalid headers are rejected before inference. Only one recognition runs at a time; additional callers get an actionable busy error. Audio and transcripts are not stored by the application. Whisper reads the WAV from memory, has logging disabled, runs as an unprivileged user with a read-only root and a small temporary memory filesystem.

All three routes require the existing registered device/user and app credential, a ChatQ app and an active user. Limits are isolated by app/user: cloud lookup 240/minute, recognition 6/minute and 120/day. These bounded in-memory protective counters reset on API restart and do not charge or replace AI reply quotas. Network failures are not automatically retried.

Use both compose files for future restarts/upgrades. To roll back the API, the previous `chatq-api:ai` image is retained; run the base compose file with `up -d --no-build api`. The pre-change source backup is `/opt/chatq/backups/input-before-1.4.0-20261021.tar.gz`. No schema migration was added.

The server's 4-core CPU is shared with existing apps. Voice recognition is serialized, limited to three CPU cores and 1.5GB memory. This is appropriate for the current small deployment; it is not a load-tested multi-user speech cluster.
