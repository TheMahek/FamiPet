# FamiPet — Phase 0 Baseline & Project Status

> Single project-status document for the enhancement work (Phase 11 completed).
>
> Last update: Phase 11 AI Recommendations & AI CRUD completed (see §19).

---

## 1. Snapshot (verified from the repository and runtime)

| Item | Value |
|---|---|
| Git branch | `enhancement/famipet` (created in Phase 0 off `main`; original `main` HEAD `b0e6771` "Initial Commit") |
| Checkpoint tags | `v0-baseline` (Phase 0), `phase1-docker-env` (Phase 1), `phase2-nginx-routing` (Phase 2), `phase3-cloudflare-tunnel` (Phase 3), `phase4-e2e-validation` (Phase 4), `phase5-notification-core` (Phase 5), `phase6-push-notifications` (Phase 6), `phase7-reminder-scheduler` (Phase 7), `phase8-pet-care-reminders` (Phase 8 first), `phase8-notification-events` (Phase 8 second), `phase9-diet-nutrition` (Phase 9), `phase10-ai-tool-layer` (Phase 10), `phase11-ai-recommendations-crud` (Phase 11) |
| Public URL (live) | `https://famipet.catlium.in` (Cloudflare Tunnel → nginx proxy; TLS = Cloudflare Universal SSL) |
| Node (host) | v26.2.0 / npm 12.0.1 |
| MongoDB (host) | v8.3.2 via `mongod`; **listening on `127.0.0.1:27017`** — `db.runCommand({ping:1})` → `{ok:1}` |
| Docker | 29.8.0; compose stack **running and healthy** (see §3) |
| Backend env (`backend/.env`, gitignored) | `NODE_ENV=development`, `PORT=5000`, `MONGODB_URI=mongodb://localhost:27017/petDB` (compose overrides to `mongodb://mongodb:27017/petDB`; `SERVE_FRONTEND_FALLBACK=false`), `CLIENT_URL=https://famipet.catlium.in`, `FRONTEND_URL=https://famipet.catlium.in`, `BACKEND_URL=http://localhost:5000` |
| Backend npm scripts | `start` (node server.js), `dev` (nodemon), `seed` |

**No test, lint, or type-check scripts exist** for the backend. The frontend has **no `package.json`** (pure static HTML/CSS/JS, no build step) — there is nothing to build/lint/test in the frontend by tooling.

## 2. Branches

| Branch | Purpose |
|---|---|
| `main` | Divergence point (HEAD `b0e6771`). Left untouched. |
| `enhancement/famipet` | Long-lived enhancement branch (recommended by ROADMAP). All phases build here. |

## 3. Running services (verified live at the Phase 3 checkpoint, 2026-09-20)

The Docker stack is up and **healthy** with the Phase 2 topology **plus the live tunnel**. Host-side dev processes are **not running** — Docker is the only active stack.

| Service | Where | Port | Status |
|---|---|---|---|
| `famipet-cloudflared` | Docker (`cloudflare/cloudflared`, profile `tunnel`) | none published (outbound only) | up; 4 registered tunnel connections |
| `famipet-nginx` | Docker (`nginx:alpine`, proxy) | **host 80 + 8080 → container 80** (only published entry) | healthy; `/`→frontend, `/api*`, `/uploads*`→backend |
| `famipet-frontend` | Docker nginx | container 5502 (internal) | healthy (static only) |
| `famipet-backend` | Docker Node | container 5000 (internal) | healthy |
| `famipet-mongodb` | Docker (`mongo:8`) | container 27017 (internal) | healthy |
| host dev stack | — | — | **down** |

### Verified responses (Phase 3)
- **Public:** `https://famipet.catlium.in` `/` → 200; `/api/status` OK; `/api/breeds` `count:5`; `/js/config.js` → 200; unknown route → 404; `/uploads/<probe>` → 200 (removed). TLS chain valid.
- **Web funnel:** `http` plain → 200 (zone "Always Use HTTPS" off — recommended toggle, not blocking); no `http://` subresources on the HTTPS page (no mixed content).
- **Client IP:** nginx access log shows real public IP from Cloudflare XFF; CF-aware maps keep it for the backend (rate limits sane: 25/25 → 200).
- **Fallback:** tunnel stopped → LAN `:80`/`:8080` still 200; tunnel restarted → public 200 again.
- **Privacy:** only nginx publishes host ports (80/8080); backend 5000, frontend 5502, mongo 27017 are `expose`-only; tunnel maps a single hostname (catch-all 404/530).

## 4. Pre-existing issues recorded for later phases (no fixes performed in Phase 0)

### Phase-12 targets (from `bakwas.md` / `ROADMAP.md`, already collated)
1. Login/verify email flow reports "can't be reached".
2. Appointment: past date selectable, textbox autoscroll, "vacation" field not carried over, remove Upcoming section.
3. My Pet creation redirects to Adoption instead of the pet page.
4. Weight guidance not type/age-aware.
5. "Pet ID to collar" feature requested.
6. Adoption filter layout + pre-selected pet slot.
7. Pet-specific Nutrition section + expanded breed info.
8. Lost & Found "Location" field to be removed.
9. Dashboard renders `[Object]` in reminders.
10. Settings: Dark Mode; remove "Your Pet App Info" / "Language" / "Region" sections.

### Observed during Phase 0 (recorded, not fixed)
- `backend/server.log` and `backend/server.err` were tracked in git (runtime artifacts). **Fixed as Phase-0 hygiene**: removed from the index and ignored (root `.gitignore` now has `*.log`, `*.err`; `backend/.gitignore` has `server.log`, `server.err`).
- `frontend/css/adoption.css.bak-p1` is a stale backup. Now ignored (`*.bak*` in root `.gitignore`). File left on disk.
- `GET /api/adoptions` returns 401 when unauthenticated. Adoption is a public page in the UI — whether guests should be able to read the listing is a Phase-12 investigation item, not a Phase-0 fix.
- Rate limits are keyed to `req.ip` with **no `trust proxy`** (broken behind any reverse proxy/tunnel). **RESOLVED in Phase 2**: `app.set('trust proxy', 1)` + nginx sets `X-Forwarded-For` → rate-limit keys now see the real client IP (proxied deployments).
- Express frontend-fallback listener starts unconditionally in `server.js` (host 5502 today). **RESOLVED in Phase 2**: gated by `SERVE_FRONTEND_FALLBACK` (disabled in Docker via compose, default on for host dev).

## 5. What Phase 0 deliberately did NOT verify / deferrals (status)
- **Full register → login → email-verify → dashboard E2E** requires live email delivery + verification token; not automated. Historically reported passing in `Step10-Report.md`. Still deferred (Phase 4 E2E campaign) — the emailed-link target is now the live public page.
- **HTTPS (TLS)**: **DONE in Phase 3** — Cloudflare Tunnel serves `https://famipet.catlium.in` (Cloudflare Universal SSL; local metadata terminators removed in Phase 2).
- **Container restart / volume-persistence test** — DONE in Phase 1 (§9); data persistence re-confirmed in Phase 2 (count 5).
- Host-side dev processes are down at this checkpoint (Docker is the active stack).

## 6. Rollback point
- **Branch:** `enhancement/famipet`. Tags: `v0-baseline` (Phase 0), `phase1-docker-env`, `phase2-nginx-routing`, `phase3-cloudflare-tunnel`, `phase4-e2e-validation`, `phase5-notification-core`, `phase6-push-notifications`, `phase7-reminder-scheduler`, `phase8-pet-care-reminders`, `phase8-notification-events`, `phase9-diet-nutrition`.
- `git reset --hard phase2-nginx-routing` returns to the pre-tunnel stack; `phase1-docker-env` to the Caddy era; `v0-baseline` is the pre-Docker state. `.env` files (root + `backend/`), `certs/`, `uploads/` are local and preserved.

## 7. Bootstrap (for a fresh checkout / next developer)
1. `docker compose up -d --build` → **frontend + API at `http://localhost` (or `http://localhost:8080`)**; nginx proxy routes `/api*` + `/uploads*` to the backend.
2. Public HTTPS (Cloudflare Tunnel): `docker compose --profile tunnel up -d cloudflared` with `TUNNEL_TOKEN` set in the gitignored root `.env` → `https://famipet.catlium.in`.
3. Alternative dev flow (no Docker): start local `mongod`, `cd backend && npm ci && npm run seed && npm start` (serves API on 5000 + optional frontend fallback on 5502), serve `frontend/` with Live Server; `frontend/js/config.js` keeps the `<host>:5000` dev fallback for those ports.
4. Mongo: pulls from `petDB`; seed script `backend/utils/seedData.js` (`npm run seed`).
5. `FRONTEND_URL`/`CLIENT_URL` (backend/.env) = `https://famipet.catlium.in`.

## 8. Phase 0 completion status — ✅ COMPLETED
- ✅ Dedicated enhancement branch `enhancement/famipet` created.
- ✅ Runtime artifacts untracked + ignore rules updated (no feature/source changes).
- ✅ Current app verified working: backend API, DB-backed reads, frontend (host fallback, Live Server, Docker nginx), HTTPS via Caddy, Mongo ping.
- ✅ Pre-existing issues documented (§4).
- ✅ `BASELINE.md` written; `ROADMAP.md` Phase 0 marked complete.
- ✅ Baseline committed and tagged `v0-baseline`.
- ✅ No Phase 1 work started.
- ✅ Go/no-go: **GO** — proceed to Phase 1 when instructed.

### Files changed in Phase 0 (repo hygiene/docs only)
- `ROADMAP.md` (Phase 0 status added)
- `BASELINE.md` (new — this doc)
- `.gitignore`, `backend/.gitignore` (artifact ignore rules)
- Git index: `backend/server.log`, `backend/server.err` removed from tracking

## 9. Phase 1 status — ✅ COMPLETED (Docker environment stabilized & verified)

### Docker architecture decisions recorded
- **Kept as-is (verified correct, no change needed):** 4 services (frontend nginx:alpine, backend node:26-alpine, mongodb mongo:8, caddy:2.9-alpine); two isolated networks (`famipet-frontend-net`, `famipet-backend-net`); Caddy the only published service (80/443); Mongo internal-only; backend `read_only` rootfs + `cap_drop: ALL` + tmpfs + non-root `node` user; named volumes `mongodb_data`, `backend_uploads`, `caddy_data`, `caddy_config`; `restart: unless-stopped` ×4; `init: true` ×4; backend `depends_on mongodb: condition: service_healthy`.
- **Cleaned only stale comments** in `docker-compose.yml` ("Phase 5 / Phase 7" wording removed — no service/network/volume/resource change) and `backend/Dockerfile` (port note). No routing or structural change (Caddy removal is Phase 2).
- **For the target architecture (Cloudflare → Tunnel → nginx:alpine {frontend+backend} → MongoDB):** ready except that nginx does not yet join the backend network/proxy `/api` — that is Phase 2 by design. Mongo will remain internal.

### Tests performed (all passed)
| Test | Result |
|---|---|
| `docker compose config` | Valid |
| `docker compose build` | Both images built |
| Cold start `down` + `up -d` | All 4 healthy; backend waited on mongo healthy |
| Volume persistence across down/up | mongo marker doc + uploads file survived; markers then removed |
| `docker compose restart` | All 4 recovered healthy |
| Backend non-zero exit (SIGKILL node) | Auto-restarted (`RestartCount` 0→1), healthy |
| Uploads volume writable (non-root node) | OK |
| `https://localhost/api/status` | OK |
| `https://localhost/api/breeds` (DB-backed via Docker) | 200, data returned |
| `https://localhost/` + `/js/config.js` | 200 |
| In-container backend→mongo ping (service name) | `{ok:1}` |
| No host port published for frontend/backend/mongodb | Confirmed (only Caddy 80/443) |
| `docker compose logs` startup errors | None (mongo INFO + benign Caddy OCSP mkcert warnings only) |

### Findings / notes for later phases
- **Docker `petDB` dataset is leaner than the host DB**: `/api/breeds` returns **5** via Docker stack vs **16** on host mongo. Sources were populated separately; not a defect. Relevant for Phase 4 (E2E against the intended dataset) and Phase 13 (data migration/cleanup).
- `kill -9 1` (tini PID 1) does **not** exit the container; the correct crash test is killing the node process (tini propagates the child exit). Working restart behavior confirmed via the node kill.
- Caddy OCSP warnings on mkcert certs are cosmetic; Cloudflare edge TLS (Phase 3) removes this entirely.

### Files changed in Phase 1
- `docker-compose.yml` (comment cleanup only)
- `backend/Dockerfile` (comment cleanup only)
- `ROADMAP.md` (Phase 1 status)
- `BASELINE.md` (this update)

### Phase 1 checkpoint
- Commit `phase1-docker-env` (checkpoint tag). Rollback: `git reset --hard phase1-docker-env` (or `v0-baseline` for pre-Docker-verification state).

## 10. Phase 2 status — ✅ COMPLETED (Caddy removed; dedicated nginx reverse proxy)

### Architecture (current, replaces Caddy)
```
http://<host>:80 / :8080
        │  famipet-nginx  (nginx:alpine, ONLY published service)
        ├─ /        → frontend:5502  (static container, internal)
        ├─ /api*    → backend:5000   (Express, internal)
        └─ /uploads*→ backend:5000
                        └─ mongodb:27017 (internal, persistent)
```
- HTTPS edge intentionally absent until Cloudflare Tunnel (Phase 3). Caddy, `Caddyfile`, `caddy_data`/`caddy_config` volumes, and certs mount are **fully removed** (orphan volumes deleted).

### Config changes
- `docker-compose.yml`: `caddy` service + volumes removed; new `nginx` service (`nginx/Dockerfile`/`nginx.conf`/`.dockerignore`, image `famipet-nginx:production`), `ports 80:80 + 8080:80`, joins both networks, `depends_on frontend+backend service_healthy`, `client_max_body_size 10m` (multer cap is 5MB). Backend env adds `SERVE_FRONTEND_FALLBACK=false`.
- `backend/server.js`: `app.set('trust proxy', 1)`; frontend-fallback listener gated on `SERVE_FRONTEND_FALLBACK`.
- `frontend/js/config.js`: same-origin `/api` when served HTTPS **or** via proxy ports `80`/`8080` (incl. no-port); other HTTP dev ports keep `<host>:5000`. `api.js` comment updated.
- Docs: `backend/.env.example`, `DOCKER_DEPLOYMENT.md`, `.opencode/plans/phase5-https.md` (superseded note).

### Tests performed (all passed, against the freshly built stack)
| Test | Result |
|---|---|
| `docker compose config` valid; `docker compose build` (3 images) | OK |
| Cold `down` + `up -d`; caddy container/volumes removed manually | nginx/frontend/backend/mongodb **healthy**; no caddy anywhere |
| `http://localhost/` and `:8080` (frontend) | 200 |
| `/js/config.js`, pages, css, real `/assets/...` | 200 |
| `/api/status` via proxy | OK JSON |
| `/api/breeds` (DB-backed via proxy) | `count:5` — data persisted |
| `/api/pets`, `/api/nonexistent` | 200 / 404 JSON (URI preserved) |
| `/uploads/<file>` proxying (created + removed) | content served from backend volume |
| Backend→mongo ping in-container | `{ok:1}` |
| Host ports | only nginx (`80`,`8080`); backend/frontend/mongodb publish nothing |
| HTTPS on 443 | fails (000) as designed until Phase 3 |
| Backend listeners | :5000 only (fallback disabled) |
| `docker compose logs` | no app errors (mongo INFO only) |

### Findings / notes for later phases
- Duplicate `X-Content-Type-Options`/`X-Frame-Options` and conflicting `Referrer-Policy` (`helmet`+`nginx`) on API responses — cosmetic, pre-existing; optional tidy later.
- `/assets/logo.png` doesn't exist (assets in `icons/images/logos`) — 404 is correct.
- Host dev stack (node/Live Server) down at checkpoint; Docker is the active stack.
- verify→login→dashboard E2E + email links remain deferred (Phase 3 HTTPS, Phase 4 E2E).
- Rate-limit keying now uses the real client IP (`trust proxy`) — pre-existing issue resolved by design.

### Files changed in Phase 2
- New: `nginx/Dockerfile`, `nginx/nginx.conf`, `nginx/.dockerignore`
- `docker-compose.yml` (caddy→nginx proxy), `backend/server.js`, `frontend/js/config.js`, `frontend/js/api.js` (comment), `backend/.env.example`, `DOCKER_DEPLOYMENT.md`, `.opencode/plans/phase5-https.md`, `ROADMAP.md` (this phase), `BASELINE.md` (this update); **deleted: `Caddyfile`**

### Phase 2 checkpoint
- Commit → tag `phase2-nginx-routing`. Rollback: `git reset --hard phase2-nginx-routing` (previous stack at `phase1-docker-env`).

## 11. Phase 3 status — ✅ COMPLETED (Cloudflare Tunnel live: `https://famipet.catlium.in`)

### Architecture (current)
```
https://famipet.catlium.in  (Cloudflare edge, Universal SSL)
        ▼ outbound-in (cloudflared container, profile "tunnel")
famipet-nginx  (nginx:alpine proxy — the ONLY published host ports :80/:8080)
        ├─ /        → frontend:5502
        ├─ /api*    → backend:5000
        └─ /uploads*→ backend:5000
                        └─ mongodb:27017 (internal)
```
Dashboard-managed tunnel (`TUNNEL_TOKEN` in gitignored root `.env`); remote config: `famipet.catlium.in → http://nginx:80` + catch-all 404. `cloudflared` joins only the frontend network (no path to backend/Mongo).

### What changed
- `docker-compose.yml`: `cloudflared` service (profile `tunnel`; enabled via `docker compose --profile tunnel up -d cloudflared`).
- `nginx/nginx.conf`: CF-aware `map`s — `X-Forwarded-For` from `CF-Connecting-IP` (real client IP behind Cloudflare; normal chain for LAN), `X-Forwarded-Proto` preserves `https` from edge.
- `backend/.env` (gitignored): `FRONTEND_URL`/`CLIENT_URL` = `https://famipet.catlium.in` (CORS + emailed links).
- Docs: `DOCKER_DEPLOYMENT.md`, `backend/.env.example`, `ROADMAP.md` (this phase).

### Tests performed (all passed)
| Test | Result |
|---|---|
| Public HTTPS `/`, `/api/status`, `/api/breeds`, `/js/config.js` | all 200; breeds `count:5` |
| Unknown `/api` route via tunnel | 404 |
| TLS chain (`ssl_verify_result`) | 0 (valid Cloudflare Universal SSL) |
| `/uploads/<probe>` via tunnel | 200 (removed after) |
| Client-IP propagation (nginx log real public IP; 25 rapid calls) | no 429, all 200 |
| Backend/Mongo host ports | none (only nginx 80/8080) |
| Tunnel down → LAN `:80`/`:8080`; tunnel up → public | LAN 200 while down; public 200 when up |
| `docker compose config` (with/without profile) | valid |

### Findings / notes for later phases
- Zone **"Always Use HTTPS" is off** (plain `http://` returns 200). Recommended Cloudflare dashboard toggle; not blocking (no mixed content). Docs note added.
- `backend/.env` now holds the public `FRONTEND_URL` — treat it as a primary asset (already gitignored).
- Full register→verify→login→dashboard E2E (email delivery) remains Phase 4; link targets are now live/proven.
- Host dev stack remains down; Docker + tunnel are the only active services.
- Tunnel service is outbound-only: no host firewall ports needed.

### Files changed in Phase 3
- `docker-compose.yml` (cloudflared service + profile), `nginx/nginx.conf` (CF-aware headers), `backend/.env` (ignored; URLs), `backend/.env.example`, `DOCKER_DEPLOYMENT.md`, `ROADMAP.md` (this phase), `BASELINE.md` (this update); new gitignored root `.env` (`TUNNEL_TOKEN`).

### Phase 3 checkpoint
- Commit → tag `phase3-cloudflare-tunnel`. Rollback: `git reset --hard phase3-cloudflare-tunnel` (disable tunnel: `docker compose --profile tunnel stop cloudflared`).

## 12. Phase 4 status — ✅ COMPLETED (End-to-End validation of the live deployment)

Full feature smoke-test over **public HTTPS** (`https://famipet.catlium.in`). No code changes; only environment/config usage verified. See `ROADMAP.md` §10 (Phase 4 status) for the complete matrix.

### Verified live (all green)
- **Static:** homepage 200, no mixed content; 62/62 static assets 200.
- **Auth E2E:** register → verification-link (built with public hostname, `EMAIL_TRANSPORT=json` for inspection) → verify-email → login → JWT → `/api/auth/me`; unverified-login block; no-token 401; change-password; resend-verification gate; forgot-password.
- **CORS:** public origin allowed; evil origin blocked. **Rate limits:** per-real-client headers (`20;w=900`) through CF-Connecting-IP.
- **Features:** pets CRUD + QR/Pet-ID; favorites; appointments (auto-notification); reminders; health; vaccinations (`/upcoming`); notifications (read/unread/read-all); community post/like/comment/delete with real image upload served over `/uploads`; lost & found (create/list/detail/update/resolve); adoption (owner create, admin approve → pet auto-`adopted`, owner 403 on status); admin (dashboard/users/pets, owner 403); PetGPT (`/api/ai/ask`, live Gemini key).
- **Infra:** backend/Mongo private; all 5 containers healthy; public + LAN fallback OK.

### Documented (environment-dependent / deferred, not failures)
- Breeds **5 (Docker) vs 16 (host DB)** — leaner container seed; migration deferred (Phase 13).
- Email SMTP delivery itself not exercised (transport restored to `smtp` after tests; verification used `json`).
- Orphaned upload files remain on disk when records are deleted (no fs cleanup in delete handlers) — defer to maintenance/Phase-12 cleanup.
- `GET /appointments/my` route does not exist (list is `GET /appointments`) — documented.
- Logout is client-side (JWT bearer, no cookies, no CSRF module) — documented as the app's authentication model.

### State restored after tests
Test user `e2e.owner1@test.famipet.in` + all test records deleted (users 3, pets 4, adoptions 1, lost-found 2 — seed parity); `uploads/` emptied of test artifacts; `backend/.env` `EMAIL_TRANSPORT=json` removed (default `smtp` restored after backend recreation); seed users `admin@animalplanet.com` and `user@example.com` untouched; real user `siddiquiummehabiba41@gmail.com` untouched.

### Phase 4 checkpoint
- Commit → tag `phase4-e2e-validation`. Rollback: `git reset --hard phase4-e2e-validation`.

## 13. Phase 5 status — ✅ COMPLETED (Notification Core)

Shared notification foundation: extended model + preferences model, single service entry point, backward-compatible API with pagination/filters/preferences, shared opt-in frontend component, and a Notification Preferences panel on Settings. Full details in `ROADMAP.md` §10 (Phase 5 status).

### What changed
- **Backend** (uncommitted-at-start work finished, rebuilt into the image): `models/Notification.js` extended additively (`category`, `priority`, `referenceType`/`referenceId`, `metadata`, `dedupKey` + 3 indexes), new `models/NotificationPreference.js` (unique `user`, channels + per-type Map), new `services/notification.service.js` (`createNotification` with validation/dedup/preferences-gate — never throws, never breaks producers), `controllers/notification.controller.js` + `routes/notification.routes.js` (pagination `page`/`limit` capped at 200, `type`/`category` filters, `GET/PUT /preferences`, `PUT /read-all`; old shape preserved), producers migrated (`appointment.controller.js` booking, `adoption.controller.js` status), `Dockerfile` `COPY services ./services`, `utils/validation.js` enum helpers.
- **Frontend**: new shared opt-in `js/notifications.js` (`window.FamiPetNotifications`: list, badge, mark-read/all-read, delete, preferences renderer); Notification Preferences card on `pages/settings.html`; `js/settings.js` skips `[data-preferences]` toggles in the generic toggle handler; small styles in `css/settings.css`.

### Verified (see ROADMAP §10 for the full matrix)
- API suite: **52 checks, 0 failed** (auth 401/403, empty state, preferences, filter validation, pagination, mark-read idempotent, read-all, delete, cross-user isolation, producer E2E, regression endpoints).
- In-container service probe: **18 checks, 0 failed** (dedup collapses within window, type/channel gates, skipPreferences bypass, validation edge cases; rows cleaned).
- Indexes confirmed in `petDB`; stack healthy after `docker compose build backend` + recreate; nginx `:8080` and public tunnel both serve `/`, `/api/status`, `settings.html`, `/js/notifications.js` (200); `/api/notifications` over tunnel unauth → 401.

### Decisions / deferrals recorded
- The 9 per-page notification dropdowns are preserved (already backward-compatible with the API); shared component is opt-in — full dropdown refactor deferred (avoid unnecessary rewrites). Details in ROADMAP.
- Dedup is opt-in per producer via `dedupKey` (appointment/adoption already pass stable keys).
- `User.notifications[]` backref remains dead; additive-only phase, no migration run.

### State restored after tests
Test users `phase5.ownerA/B/C@test.famipet.in` deleted (3 users, 2 pets, 2 appointments, 2 reminders, 1 preference row, 0 notifications); `backend/.env` `EMAIL_TRANSPORT=json` removed (default transport restored) and backend recreated healthy; seed users and real user `siddiquiummehabiba41@gmail.com` untouched.

### Phase 5 checkpoint
- Commit → tag `phase5-notification-core`. Rollback: `git reset --hard phase5-notification-core`.

## 14. Phase 6 status — ✅ COMPLETED (Push Notifications)

Browser Web Push on top of the Phase 5 core: root-scoped service worker, subscription storage/CRUD, VAPID-encrypted delivery through the Notification Service (respecting preferences), a push settings panel on Settings, and SW hygiene in nginx. Full details in `ROADMAP.md` §10 (Phase 6 status).

### What changed
- **Backend**: new `models/PushSubscription.js` (unique `endpoint`, `user` ref, `keys {p256dh, auth}`, `userAgent`, `lastUsedAt`; unique endpoint index + `{user,lastUsedAt:-1}`), new `services/push.service.js` (VAPID config from env, subscription CRUD with per-user cap 10, dedupe/reassign-on-account-switch, 10s send timeout; 404/410 → row deleted, transient errors logged + row kept; never blocks callers), new `controllers/push.controller.js` + `routes/push.routes.js` (`GET /api/push/vapid-public-key` public; `POST /subscribe`, `GET /subscriptions`, `DELETE /subscriptions/:id`, `DELETE /unsubscribe`, `POST /test` authed), mounted in `server.js`. `services/notification.service.js` `createNotification` now fire-and-forget `deliverPush` (payload `{title, body, tag, data:{url, notificationId, type, category}}`; **push is strict opt-in** — no prefs row or `channels.push` unset → skipped, `types[type] === false` → skipped). `admin.controller.js` `deleteUser` also cleans that user's push subscriptions. Dep: `web-push@^3.6.7`; `backend/.env.example` documents VAPID vars.
- **Frontend**: new `service-worker.js` (install `skipWaiting`, `clients.claim`, `push` → `showNotification` with logo icon, `notificationclick` → focus/open target URL, `pushsubscriptionchange` → best-effort unsubscribe), new `js/push.js` (`window.FamiPetPush` — capability detection, subscribe/unsubscribe/test flows, state UI), `pages/settings.html` `#pushControlMount` in the Notification Preferences card, `css/settings.css` push-control styles, `frontend/nginx.conf` `location = /service-worker.js` (no-cache/no-store), `frontend/Dockerfile` `COPY service-worker.js`.
- **Env/config**: VAPID keys live only in gitignored `backend/.env` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`); compose `env_file` provides them to the backend container.

### Verified (see ROADMAP §10 for the full matrix)
- API suite: **45 checks, 0 failed** — including a controller bug found+fixed en route (the by-endpoint unsubscribe response omitted the `removed` flag).
- In-container delivery probe (mock HTTPS push service, self-signed): **52 checks, 0 failed** — VAPID ES256 signature verified, aes128gcm record structure validated, 201/404/410/500 handling, reassignment, cap 10, preferences gating incl. strict opt-in default, admin-delete cleanup.
- One real behavior gap caught by the probe: pre-opt-in users (no prefs row) were receiving pushes; `deliverPush` now treats missing prefs as push-off.
- Indexes confirmed in `petDB`; stack rebuilt + healthy; `/service-worker.js`, `/js/push.js`, `/pages/settings.html`, `/api/push/vapid-public-key` 200 over nginx `:8080` AND public tunnel (SW served with no-cache headers; Dockerfile omission of the SW file caught by this E2E and fixed).

### Decisions / deferrals recorded
- Push = opt-in per user (prefs row + `channels.push` on), unlike in-app (green by default); the device subscription alone doesn't enable pushes.
- Cross-account same-device re-subscribe reassigns ownership (intentional account-switch behavior).
- Real-browser delivery NOT exercised headless: pipeline verified via mock push service; a manual desktop Chrome/Edge/Android pass (subscribe → kill tab → receive, click-through routing, `pushsubscriptionchange`) is deferred to a future phase/E2E.
- `pushsubscriptionchange` self-cleanup is best-effort (no auth token in SW scope); the subscribe/re-subscribe path re-asserts ownership.

### State restored after tests
Test users `phase6.a/b@test.famipet.in` + all subscriptions/notifications/preferences purged; `backend/.env` `EMAIL_TRANSPORT=json` removed (normal transport restored) and backend recreated healthy; seed users (`admin@animalplanet.com`, `user@example.com`) and real user `siddiquiummehabiba41@gmail.com` untouched; push subscription count back to 0.

### Phase 6 checkpoint
- Commit → tag `phase6-push-notifications`. Rollback: `git reset --hard phase6-push-notifications`.

## 15. Phase 7 status — ✅ COMPLETED (Reminder Scheduler)

Persistent, restart-safe, MongoDB-backed reminder scheduler firing through the Phase 5/6 Notification Service, plus precise appointment↔reminder linkage (the old fuzzy `updateMany` that could retarget the wrong reminder is removed). Full details in `ROADMAP.md` §10 (Phase 7 status).

### What changed
- **Backend**: `models/Reminder.js` gains `timezone` (IANA, default UTC), `nextRunAt`, `claimedUntil`, `lastFiredAt`, `lastNotificationId`, `lastStatus` enum (`pending|fired|failed|skipped|skipped-no-user|skipped-no-pet`), `lastError`, `failedAttempts`, `source` (`manual|appointment`), `sourceId` (ObjectId); exports `REMINDER_STATUSES`. Indexes: partial `{isActive,isCompleted,nextRunAt}`, unique partial `{user,source,sourceId}` (sourceId objectId), `{user,isActive,date,time}`.
- New `services/reminder.service.js` (pure tz-aware scheduling core + appointment producer helpers — `upsert/reschedule/cancelAppointmentReminder`), new `services/reminder-scheduler.service.js` (out-of-band **poller**, not node-cron; env knobs `REMINDER_POLL_INTERVAL_MS`=30s, `REMINDER_BATCH_LIMIT`=100, `REMINDER_CLAIM_TTL_MS`=120s, `REMINDER_MAX_ATTEMPTS`=3; boot materializes legacy rows; atomic lease claims with TTL reclaim; `dedupKey reminder-fire:<id>:<occurrenceMs>` 7d; missing-user → `skipped-no-user` deactivate, missing/inactive pet → once deactivates / recurring advances; delivered → advance/complete, suppressed → consumed (advance, no spin), failure → retry then deactivate@3).
- `controllers/reminder.controller.js` timezone+strict-time validation with `nextRunAt` always recomputed and counters reset on schedule-affecting edits; `controllers/appointment.controller.js` booking/reschedule/cancel wired to the service (precise sourceId linkage); `server.js` starts/stops the scheduler around DB connect/graceful shutdown; `admin.controller.js` deleteUser also deletes the user's reminders. Dockerfile already ships `services/` (no change needed).

### Verified (see ROADMAP §10 for the full matrix)
- In-container deterministic probe (injected clock): **65 checks, 0 failed** — tz/DST math, legacy materialization (no back-fire), due-gating `$and` regression, advance-by-one-no-burst, suppressed no-spin, retry→deactivate@3, claim leases, concurrent exactly-once, batch cap, missing user/pet, inactive/completed ignored, real delivery + dedup re-fire.
- Host API suite: **55 checks, 0 failed** (CRUD validation incl. 12h/`24:00`/bad-tz 400s, exact once `nextRunAt`, NY EST/Kolkata mapping, cross-user isolation, appointment x2 linked + shared title+pet + reschedule/cancel move only their own reminder, live poller fired a due-in-60s reminder with notification linkage + completed).
- Phase 6 regression re-run **45/45** (backend restarted only to clear login/signup rate-limiters consumed by repeated suite batches).
- Indexes confirmed in `petDB`; stack rebuilt + healthy; `/api/status` + `/` 200 via nginx `:8080` and public tunnel; no backend log errors.
- Real happy path observed: the live owner's once grooming reminder fired on time and delivered the in-app notification (kept as-is).
- 13 throwaway test users + all their data purged; seed users and the owner's reminders untouched.

### Decisions / deferrals recorded
- Poller over node-cron: jobs derive from DB + atomic leases — restart-safe and multi-replica-safe; `node-cron` stays unused.
- Only in-app + (preference-gated) push; never email. Once reminders are overdue-eligible; recurring skips history (no burst/replay); suppressed occurrences are consumed, not retried.
- Consequence: `user@example.com` (reminder type disabled) → its two seeded reminders will be consumed as `skipped` at their next due time (intended).
- Manual desktop/mobile push click-through remains a real-user/browser item (Phase 6 posture).

### State restored after tests
Backend healthy; DB back to seed/real users only (`admin@animalplanet.com`, `user@example.com`, `siddiquiummehabiba41@gmail.com`); owner's reminders + notifications intact; 0 appointment-source reminders (legacy + test rows cleaned).

### Phase 7 checkpoint
- Commit → tag `phase7-reminder-scheduler`. Rollback: `git reset --hard phase7-reminder-scheduler`.

## 16. Phase 8 status — ✅ COMPLETED (two checkpoints: Pet Care Reminder System then Notification Event Integration)

### 16a. First checkpoint — `phase8-pet-care-reminders` (Pet Care Reminder System)

Pet-attached reminders with categories, repeat rules, priorities, and per-reminder notification toggles, surfaced on a remade Reminders page (sections, filter tabs, calendar, search) and wired to the Phase 7 scheduler + Phase 5/6 notifications. Full details in `ROADMAP.md` §10 (Phase 8 status).

### What changed
- **Backend**: `models/Reminder.js` + `utils/validation.js` add types `droplet` (water) and `bath`, frequency `interval` + `repeatInterval` (int 1–365), `daysOfWeek` (ints 0=Sun..6=Sat, ≤7 distinct), `priority` (`low|normal|high`), `notificationEnabled` (bool, default true). `controllers/reminder.controller.js` adds `validateScheduleConfig` + owned-pet guard, a `filter` query on `GET /reminders` (`active` default | `completed` | `inactive` | `all`) and `effectiveNext` in list payloads. `services/reminder-scheduler.service.js` consumes `notificationEnabled:false` occurrences silently (no notification) and honors `daysOfWeek` for weekly recurrence.
- **Frontend**: `pages/reminders.html` reworked into a live page (stats `upcoming/completed/overdue/total`, search, filter tabs `pending/completed/inactive`, sectioned list with 4-item cap + View All, calendar with per-type colors + today ring + month nav, add/edit modal with pet select/type/date/time/repeat/priority/notification toggle/notes). `js/reminders.js` fully rewritten (state + render pipeline, `TYPE_META` for 9 types, 3-dot menu actions, modal validation, Esc/outside-click handling). `css/reminders.css` gets the Phase 8 styles. Dashboard backward-compat verified (`GET /reminders` default active; `fmtDate`/`fmtTime` handle `HH:mm`).
- Type map: feeding/Food(green), exercise/Walk(blue), droplet/Water(blue), medicine/Medicine(pink), grooming/Grooming(blue), bath/Bath(purple), appointment/Vet Checkup(purple), vaccination/Vaccination(green), custom/Custom(orange).

### Verified (see ROADMAP §10 for the full matrix)
- API suite (`compose/scripts/phase8-reminders-api.cjs`): **59 checks, 0 failed** — filter matrix incl. default-active, `effectiveNext`, repeat/interval/weekday validation 400s, priority/notificationEnabled validation, owned-pet guards, ownership isolation, lifecycle (complete/activate/deactivate), cross-user 404s.
- Scheduler probe (`compose/scripts/phase8-scheduler-check.cjs`): **6 checks, 0 failed** — silent-consume, weekly weekday recurrence, interval recurrence.
- Phase 5/6/7 regression suites still green; `node --check` clean on all touched backend files + rewritten reminders.js.
- E2E: stack rebuilt + healthy; `pages/reminders.html`, `js/reminders.js`, `css/reminders.css` served 200 via nginx `:8080` with the Phase 8 DOM/JS markers; `docker compose ps` all healthy; dashboard loads.
- Schema changes all additive — no migrations; indexes verified in `petDB`.

### Decisions / deferrals recorded
- **Scope change**: the original Phase 8 plan (Notification Event Integration) shipped as a **second Phase 8 delivery** — checkpoint `phase8-notification-events`, §16b below (full event inventory + validation in `ROADMAP.md` §10).
- `GET /reminders` default stays **active** for dashboard compatibility; the page requests `?filter=all` and sections client-side.
- Repeat payload rules: `repeatInterval` sent only when `frequency:interval`; `daysOfWeek` sent only when `frequency:weekly`; other frequencies normalize server-side.
- Frontend omits `timezone` → server default `UTC` (consistent app convention).
- `notificationEnabled:false` consumes occurrences as `skipped` silently — no delivery, no scheduler spin, by design.

### State restored after tests
Backend healthy; DB back to seed/real users only; Phase 8 suites create + purge throwaway users/pets/reminders (see `compose/scripts/*.cjs` cleanup sections).

### Phase 8 checkpoint
- Commit → tag `phase8-pet-care-reminders`. Rollback: `git reset --hard phase8-pet-care-reminders`.

### 16b. Second checkpoint — `phase8-notification-events` (Notification Event Integration)

Every domain event now flows through the shared Phase 5 service (Phase 6 push for free) with `dedupKey`s and preference respect; recipients are always **derived server-side** from the resource (never client-supplied). New additive types/categories `community`/`lost_found`/`pet` mirrored across `backend/models/Notification.js`, `backend/utils/validation.js`, and `frontend/js/notifications.js`; `pushTargetUrl` deep links added for `appointment`/`community`/`lost_found`.

### What changed
- **Producers wired** (all fire-and-forget via `notificationService.createNotification`): `pet.controller.js` (pet created), `health.controller.js` (record created, references pet), `vaccination.controller.js` (added + Pending→Completed transition only), `appointment.controller.js` (rescheduled — only when date/time actually move; cancelled), `lostFound.controller.js` (report created → reporter), `adoption.controller.js` (application submitted; pet-owner status change when the owner isn't the applicant), `community.controller.js` (comment + new-like → author, self silent; admin hide/restore → author via `admin.controller.js`), `admin.controller.js` (lost-found resolve → reporter; user block/unblock → affected user, urgent when blocked), `auth.controller.js` (welcome, email verified, password changed).
- **Frontend**: `js/notifications.js` NOTIFICATION_TYPES + icon mapping extended for the 3 new types (settings prefs renderer shows the new toggles).
- **Suite**: new `compose/scripts/phase8-notification-events.cjs` (reusable in-container; purges its fixtures).

### Verified (2026-09-20, live stack — `ROADMAP.md` §10 for the full inventory)
- Event suite **63 checks, 0 failed** — per-group type/category/dedupKey/reference/priority correctness; recipient isolation (no cross-user leakage); preference gating (`channels.inApp=false` and `types.community=false` suppress in-app docs; re-enable restores); dedup idempotency (repeat like, Completed→Completed re-save); self-actions silent; `appointment-booked` regression intact.
- Phase 8 reminder regression re-run: API **59/59**, scheduler probe **6/6**; `node --check` clean on all touched files.
- E2E: `backend`+`frontend` containers rebuilt; `docker compose ps` all healthy; frontend 200 via nginx `:8080`; public HTTPS 200; `/api/*` proxied (401 on protected route).
- DB hygiene: 3 real users, 0 `@famipet.test` fixtures; test notifications/reminders/appointments/adoptions/lost-found/community/pets purged.

### Decisions / deferrals recorded
- Excluded by design (documented in `ROADMAP.md` §10): pet deleted; health/vaccination update/delete; appointment notes-only edits; self like/comment; lost&found "matching" (nothing invented); community post-create; admin-side "new application" alert; forgot/reset-password notifications.
- Default dedup window is the service default (1h; since retries share stable `dedupKey`s, re-submits collapse harmlessly).
- Email quota quirk noted for future suites: the container's provider hits its daily limit, so `register`'s quota path clears the verification token — tests inject a fresh single-use token when exercising verify-email.

### Phase 8 second checkpoint
- Commit → tag `phase8-notification-events`. Rollback: `git reset --hard phase8-notification-events`.

## 17. Phase 9 status — ✅ COMPLETED (Diet & Nutrition)

Pet-specific diet/nutrition profile system (one `PetDiet` per pet) replacing the frontend-only mock, wired into the Phase 7/8 reminder engine and Phase 5/6 notifications. Full details in `ROADMAP.md` §10 (Phase 9 status).

### What changed
- **Backend**: new `models/PetDiet.js` (`user` + `pet` unique index; `foodType` dry|wet|raw|homemade|mixed; `brand`; `dailyPortionGrams` 1–20000; `timezone` IANA default UTC; `activityLevel` low|moderate|high; `allergies[]`; `treatPolicy`; `notes`; `meals[]` `{_id:true, label, time HH:mm, portionGrams 0–20000, isActive}`). New `controllers/diet.controller.js` + `routes/diet.routes.js` (`GET /api/diet`, `GET/PUT/DELETE /api/diet/:petId`, owner-guarded via `Pet.findOne({_id, owner})`); `utils/dietGuide.util.js` informational-only guidance (`completion/summary/notes/gaps/feedsPerDayLabel/disclaimer`, no fabricated medical claims). `models/Reminder.js` source enum + `"diet"`; `services/reminder.service.js` gains `upsertFeedingMealReminder`/`deactivateFeedingMealReminder`/`deactivateDietMealReminders` (one daily `feeding` reminder per active meal, unique `{user, source:"diet", sourceId: meal._id}`). `server.js` mounts `/api/diet`. Conservative notification: "Diet profile created" once per pet on create only (edits/delete silent).
- **Frontend**: `pages/health.html` nutrition mock card replaced with per-pet card (dynamic completion circle, summary/tags/notes/gaps/disclaimer) + `#dietModal` editor (food type/brand/portion/activity/timezone/allergies/treat policy/notes + up to 8 dynamic meal rows). `js/health.js`: `dietsMap`, `fetchDiets()`, `renderNutrition()` (conic-gradient %), modal open/save/remove + wiring, re-render on pet change. `css/health.css`: `.nutrition-*`, `.meal-row`, `.modal-actions/.modal-cancel/.diet-save-btn` reusing the shared modal/form-row/`.save-record-btn` patterns.

### Verified (2026-09-20, live stack — `ROADMAP.md` §10 for the full matrix)
- API suite (`compose/scripts/phase9-diet-api.cjs`): **58 checks, 0 failed** — auth/ownership isolation, validation matrix, full-profile completion 100%, meal→reminder linkage + timing/reschedule/deactivate/restore, conservative notification + dedup, preference gate (`types.pet=false` suppresses event, reminders still schedule), delete (diet removed + reminders deactivated, silent), double-delete 404.
- Scheduler-integration suite (`compose/scripts/phase9-diet-scheduler.cjs`): **19 checks, 0 failed** — full producer loop meal → `upsertFeedingMealReminder` (idempotent) → `processDueReminders` fires → in-app notification (`metadata.reminderType=feeding`, "Food reminder is due", pet name, reminder reference) → daily advance (`fired`); `channels.inApp=false` consumes silently (`skipped`, advances, no notification, no retry loop).
- Regression green: `phase8-reminders-api.cjs` 59/0, `phase8-notification-events.cjs` 63/0, `phase8-scheduler-check.cjs` 6/0.
- `node --check` clean on all touched backend files + `frontend/js/health.js`.
- E2E: `backend` + `frontend` rebuilt + healthy; `pages/health.html` served 200 via nginx `:8080` with Phase 9 DOM markers AND public HTTPS `https://famipet.catlium.in/pages/health.html`.
- DB hygiene restored: 0 `@famipet.test` fixtures (a pre-fix crashed run's leaked user purged), 0 `petdiets`; real users/data untouched.

### Decisions / deferrals recorded
- Meals ≤ 8; times strictly `HH:mm`; `meal._id` preserved across edits only when legitimately owned (reminder identity stable through renames).
- Meal-time → reminder sync is best-effort (`try/catch`, never blocks the diet save); removed/inactive meals deactivate reminders (`lastStatus:"skipped"`); feeding reminders fire through the Phase 7 scheduler (no second scheduler).
- Notification is conservative and created-once (deferred: phase-11 recs and any "diet expired/missed feeding" nags remain opt-in per ROADMAP §8).

### Phase 9 checkpoint
- Commit → tag `phase9-diet-nutrition`. Rollback: `git reset --hard phase9-diet-nutrition`.

## 18. Phase 10 status — ✅ COMPLETED (AI Tool Layer)

Controlled, tool-based AI boundary: PetGPT reaches application data only through an allowlisted server-side tool layer — validated, owner-authorized, service-routed (never models directly), audited, and (for mutations) executed only after single-use token confirmation. Exactly the required 9 tools, no extras. Full details in `ROADMAP.md` §10 (Phase 10 status).

### What changed
- **Backend**: new `services/toolLayer.js` — `TOOL_SCHEMAS` registry (9 tools), allowlist arg validation (unknown keys / operators / meal injection rejected), ownership gate via `ownedPetResult`, reads auto-execute, mutations mint HMAC-hashed single-use confirmation tokens (`pending→consumed` exactly-once, supersede-dedupe, never passed to the model), per-request budget (8 calls / 5 rounds) + per-user 60/15-min quota, 15 s per-call timeout, `logAudit` → `models/ToolAuditLog` (TTL 30 d). New `models/ToolConfirmation.js` (`CONFIRM_TTL_MS` 10 min), `controllers/aiTool.controller.js`, 3 protected routes (`POST /api/ai/tool`, `/ai/tools/confirm`, `/ai/tools/cancel`). Shared services extracted verbatim from controllers: `services/pet.service.js` (list/create/update/get-owned), `services/reminder.service.js` (owner-scoped CRUD + `isValidTimeZone`), `services/diet.service.js`, `services/appointment.service.js` (read-only), `services/health.service.js` (kept, unused by tools). `ai.controller.js` rewritten: bounded Gemini function-calling loop, pet context via `petService.listUserPets`, `getPetAdvice` via `petService.getOwnedPet`, `/ai/ask` returns optional `action` proposal for the UI.
- **Frontend**: `js/petgpt.js` renders an inline `⚡ Proposed action` confirmation card (preview summary + fields, Confirm/Cancel → `/ai/tools/confirm`|`cancel`) with busy/final states; errors surfaced as chat messages; `annPetgptChat` persistence untouched. Styling in `css/petgpt.css` (`.tool-action-card`, `.tool-actions`, `.tool-action-btn`, `.tool-note`).

### Verified (2026-09-20, live stack — `ROADMAP.md` §10 for the full matrix)
- Core in-process suite (`compose/scripts/phase10-tool-core.cjs`): **75 checks, 0 failed** — registry exactness (9 tools, defs well-formed, optional props not required), validation matrix (operators/meal injection/`owner` key/enum), budget gate, reads owned-only + cross-user 404, proposals never execute, HMAC-only token storage, `resultForModel` token-stripping, exactly-once + re-confirm 400, supersede dedupe, cross-user proposal/confirm 403, cancel idempotent + cancelled-token reject, `update_diet` E2E, audit enum + rows.
- HTTP API suite (`compose/scripts/phase10-ai-tools-api.cjs`): **29 checks, 0 failed** — anonymous 401 on all 3 endpoints + `/ai/ask` wiring, status mapping (409/400/403/404/400), normalized read payloads, proposal→confirm→persist (reminder, pet, update_pet optional fields), exactly-once, cancel→no-apply, cross-user confirm 403, single-use raw token returned (not a hash).
- Regression green: `phase8-reminders-api` 59/0, `phase8-scheduler-check` 6/0, `phase8-notification-events` 63/0, `phase9-diet-api` 58/0, `phase9-diet-scheduler` 19/0.
- `node --check` clean on all touched backend + suite files.
- No direct DB from AI (grep audit): `toolLayer.js` requires only control-plane models + services; `aiTool.controller.js` only `crypto`+`toolLayer`; `ai.controller.js` only SDK/validation/services.
- E2E: `backend` + `frontend` rebuilt + healthy; nginx proxies `/api/ai/tool`, `/ai/tools/confirm`, `/ai/tools/cancel` (401 unauth); `petgpt.js` serves `addToolActionCard`, `petgpt.css` serves `.tool-action-card` (200).
- DB hygiene restored: 0 `p10c-*`/`p10a-*` `@famipet.test` fixtures; real data untouched.

### Decisions / deferrals recorded
- Tool set trimmed to the required 9 (no `delete_pet`, no appointment/`delete_reminder` tools) per task §2 + ROADMAP §8 "no scope creep".
- Per-user tool quota is in-process (resets on service restart) — sufficient first cap; Phase 11 evaluated a Mongo-backed quota and **decided against it** (see §19).
- Gemini-dependent `/ai/ask` tool-loop is structural-only here (no key in CI); function responses always go through token-stripping `resultForModel`, so the loop is safe by construction and verified via the HTTP suite's `/ai/tool` path.
- `health.service.js` stays as an unused-but-valid extraction. Confirmation frontend card is the Phase 11 `POST /api/ai/action` flow's natural UI surface.

### Phase 10 checkpoint
- Commit → tag `phase10-ai-tool-layer`. Rollback: `git reset --hard phase10-ai-tool-layer`.

## 19. Phase 11 status — ✅ COMPLETED (AI Recommendations & AI CRUD)

AI-assisted recommendations + AI-driven CRUD on top of the Phase 10 tool layer (no bypass — every mutation still uses the single-use-token proposal→confirm→cancel flow). Recommendations are strictly informational ("not medical advice" disclaimer; no diagnosis/prescription). Full details in `ROADMAP.md` §11 (Phase 11 status).

### What changed
- **Backend**: pre-existing untracked WIP finished — `services/recommendation.service.js` (`buildRecommendations({user})`) emits per-pet, priority-sorted, category-stamped suggestions from real data via the shared Phase 5–9 services, with per-pet failure isolation and an optional `suggestedAction` (Phase 10 mutation tool, owned-pet only). Two real bugs fixed in the pre-existing engine: the priority sort was silently broken (`0 || 3` coerced the `high` rank `0` → `3`, so high-priority items sorted last; now `?? 3`) and an in-place done-tracking bug in the `low` task reduced its output (now a proper living index + guarded splice). `services/toolLayer.js` hardened: `checkProposalReferences` now denies **any** cross-user pet reference (`args.pet` OR `args.petId`) at proposal-mint time with 403 (previously `args.pet` outside `update_reminder` was only caught at confirm/execution). New API: `GET /api/ai/recommendations` (protect) → `{success, recommendations, disclaimer}`; `POST /api/ai/action` (protect) accepts `{intent?, tool, args}` and is a thin alias to the Phase 10 `runTool` controller (intent ignored).
- **Frontend**: `pages/petgpt.html` gains a "Suggestions" side-card (list + informational disclaimer); `js/petgpt.js` renders category chips/priority colors with per-pet attribution, **Accept** → `POST /ai/action` → the existing `addToolActionCard` renders the proposal card inline with Confirm/Cancel; accepted items are marked ✓ so the same underlying recommendation isn't re-offered; errors surface in the card. `css/petgpt.css` adds `.suggestions-*` / `.suggestion-*` styles. Chat reading, lucide init, `annPetgptChat` persistence untouched.

### Verified (2026-09-21, live stack — `ROADMAP.md` §11 for the full matrix)
- Core in-process suite (`compose/scripts/phase11-recommendation-core.cjs`): **38 checks, 0 failed** — auth/empty-state; deterministic + priority-sorted output (high first — pins the `??` fix); every suggested action accepted by `runTool` as a proposal; proposals never carry read/executed data and minting alone persists nothing; accepted suggestion confirms+executes exactly once (single reminder), re-confirm rejected; cross-user isolation; a null-pet reminder row doesn't break the list.
- HTTP API suite (`compose/scripts/phase11-recommendations-api.cjs`): **54 checks, 0 failed** — anonymous 401 on both endpoints; no-pets state (suggestions + disclaimer, no actions); owner-scoped real-data suggestions (species-aware dog-only exercise, no internal-field leakage, action tools are mutation-only + pet-scoped); accept→propose→confirm exactly-once + suggestion retired after confirm; identical re-acceptance supersedes (single live token, one execution); cancel blocks; injection/operator/unknown-tool → 400/409; cross-user: proposing on another user's pet → 403 (both `args.pet` and `args.petId`), confirming another user's token → 403.
- Regression green (Phase 5–10 untouched): `phase10-tool-core` 75/0, `phase10-ai-tools-api` 29/0, `phase9-diet-api` 58/0, `phase9-diet-scheduler` 19/0, `phase8-reminders-api` 59/0, `phase8-scheduler-check` 6/0, `phase8-notification-events` 63/0.
- `node --check` clean on all touched backend/frontend + suite files.
- No direct DB from AI (grep audit): `recommendation.service.js` requires only shared services (+ `toolLayer.runtool` for suggested actions); controllers/routes unchanged in boundary shape.
- E2E: backend rebuilt + stack healthy; nginx proxies `/api/ai/recommendations` / `/api/ai/action` (401 unauth); public HTTPS `https://famipet.catlium.in` → 200 on `/` and `/api/status`.
- DB hygiene restored: 0 `p11c-*`/`p11a-*` `@famipet.test` fixtures remain (suites self-purge); real data untouched.

### Decisions / deferrals recorded
- Per-user tool quota **stays in-process** (resolves the §18 "Phase 11 may back it with Mongo" deferral — decided NOT needed: audit log + exactly-once tokens already bound abuse; revisit only if a real quota incident appears).
- `get_health` tool intentionally **not** added (not in Phase 10 task §2 list); `health.service.js` remains unused-but-valid.
- "Book a checkup" appointment flow (task §1.3) is a known extension point only — suggestion + confirm flow are in place; scheduling UI not expanded.

### Phase 11 checkpoint
- Commit → tag `phase11-ai-recommendations-crud`. Rollback: `git reset --hard phase11-ai-recommendations-crud`.

> Phase 12 finish (v12.1.0-phase12-finish): Settings page obsolete sections (Device Lang/Region, App Info) removed from HTML + JS; adoption filter CSS verified responsive (no change needed).
