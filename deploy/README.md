# Server deployment

Source: `/opt/chatq/source`, branch `codex/server-deployment`.
Upstream: https://github.com/ljx0517/app-mamager.git

The web admin and backend run on this server. Mobile applications must be built and installed separately. OpenAI-compatible AI replies now make real HTTP requests. Apple purchase verification remains a simulation and is not enabled for this app.

## Runtime

- Public development URL: `http://103.149.91.78`
- Caddy static files: `/opt/chatq/web`
- API: localhost port 13000; PostgreSQL is only reachable within the Compose network.
- Secrets: `/opt/chatq/.env`, owner-only permissions, outside Git.
- Admin credentials: `/opt/chatq/admin-credentials.json`, owner-only permissions, outside Git.
- Persistent database volume: `chatq_postgres-data`.

Use a domain with HTTPS before using this development deployment for sensitive production data.

## Commands

Run from `/opt/chatq/source`.

```sh
docker build --target build -t chatq-build:ai .
docker build --target runtime -t chatq-api:ai .
docker build --target web --output type=local,dest=/opt/chatq/web-next .
docker compose --env-file /opt/chatq/.env -f deploy/compose.yaml run -T --rm tools pnpm db:migrate
docker compose --env-file /opt/chatq/.env -f deploy/compose.yaml up -d api
python3 deploy/smoke-test.py
```

Before applying new migrations to an existing database, create a backup:

```sh
mkdir -p /opt/chatq/backups
docker compose --env-file /opt/chatq/.env -f deploy/compose.yaml exec --interactive=false db pg_dump -U chatq chatq | gzip > /opt/chatq/backups/chatq.sql.gz
```

Static export directories must be readable by Caddy (directories 755, files 644).

After verifying a build, replace `/opt/chatq/web` with the built static files while retaining the previous release for rollback. Caddy configuration is kept separately in `deploy/Caddyfile`; validate the complete host configuration before reloading it. Do not overwrite unrelated site configuration.

## Validation completed on 2026-10-20

Production builds passed. Health, administrator login, signed/unsigned/tampered JWT handling, initialization lock, master-data queries, ChatQ dynamic routes, and frontend batch-login proxy passed. Database/API restart preserved the administrator and data. The existing website health endpoint remained successful. Browser automation was unavailable (in-app browser timeout and Chrome client blocking), so visual interaction was not confirmed.


## Real AI configuration and testing

Open `http://103.149.91.78/settings/system`, choose the app, fill API base URL (or full `/chat/completions` endpoint), key and model, enable AI, and save. The connection button tests the draft with a real completion; the reply panel uses saved configuration. Both may incur the configured vendor's normal API costs. On 2026-10-21 the user configured MiniMax-M3.1-Flash at the official China endpoint. Live vendor verification passed through the public admin API after updating the length parameter to max_completion_tokens, omitting temperature, and restarting the isolated API service. Single reply: 4.9 s; three candidates: 6.9 s; connection test: 1.9 s. The initial long-running process returned transport errors while a fresh process succeeded; the precise cause was not captured, so no permanent transport fix is claimed.

Keys are stored in the private application's PostgreSQL settings and omitted from admin configuration/application responses. A blank key preserves the saved value; changing the API address requires re-entering the corresponding key. The current IP-only HTTP deployment has no transport encryption. Use HTTPS for production credentials and user traffic.

Only the OpenAI-compatible Chat Completions protocol is implemented. Native Anthropic, Gemini and Azure API formats are not implemented. Model IDs are vendor-defined. Advanced options support `max_tokens` / `max_completion_tokens`, optional temperature and a 5–120 second timeout. Candidate replies use one completion with a validated JSON array to support vendors without `n`. Unsupported responses and upstream errors fail explicitly without a mock fallback. No automatic paid retries are performed.

Public reply routes `/api/aikeyboard/reply` and `/api/ai/generate` share registered-device authentication and UTC daily quotas. Successful requests count once; failed upstream calls do not count. Per-user database locking prevents simultaneous requests bypassing the quota. Candidate count is bounded by the configured free/Pro setting. Admin trial requests do not consume a user's quota.

Verification: server/admin builds passed; `server/tests/ai-provider.test.mjs` passed all 10 tests using a loopback HTTP fixture. `deploy/test-ai-api.py` passed against both the candidate API and public reverse proxy using disposable apps: auth, draft vs saved configuration, key redaction/preservation, config refresh, mobile replies, multiple candidates, upstream failures, quota concurrency and disabling AI. Test apps/users were deleted after verification. These are protocol integration checks, not a live vendor response. Browser automation timed out, so visual acceptance remains outstanding.

Current static release: `/opt/chatq/releases/ai-20261020/web`, linked at `/opt/chatq/web`. Previous static release: `/opt/chatq/releases/web-before-ai-20261020`. Previous backend image `chatq-api:initial` is retained. Pre-change source/database backups: `/opt/chatq/backups/*before-ai-20261020*`. No database schema migration was needed.

Provider tests (no external API key or external network needed):

```sh
docker run --rm --network none -v /opt/chatq/source/server/tests:/workspace/server/tests:ro -w /workspace/server chatq-build:ai node --test tests/ai-provider.test.mjs
```

The API test script requires `deploy/ai-fixture.mjs` running in a temporary container named `chatq-ai-fixture` on `chatq_default` (no published port). It creates and removes only its own app; do not configure the actual app with the fixture. Test output is stored outside Git at `/opt/chatq/test-ai-*.log`.
