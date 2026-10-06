# FamiPet Enhancement Roadmap

> **Single source of truth** for the FamiPet enhancement work.
> Created from the actual state of the repository at `C:\Users\User\OneDrive\Documents\habiba\Fami-Pet` (branch `main`, HEAD `b0e6771`).
> Every phase must be completed and validated **before** the next phase starts. Preserve the existing application flow wherever possible. Do not invent functionality that does not exist.
> Companion analysis: `bakwas.md` (current-state report) documents the baseline facts referenced here.

---

## Baseline Facts (verified from the repository)

| Area | Current state |
|---|---|
| Repo | Branch `main` (single branch). HEAD `b0e6771` "Initial Commit". ~50+ tracked files modified and a large body of uncommitted work present. **Establish a clean commit/branch before touching anything (Phase 0).** |
| Stack | Vanilla HTML/CSS/JS multi-page frontend (no build step) + Node/Express 4 + Mongoose 8 API. JWT auth (localStorage), bcryptjs, Nodemailer, Cloudinary (optional, local `/uploads` fallback), Google Gemini (PetGPT). |
| Frontend | `frontend/index.html`, `pages/*.html` (18), `admin/*.html` (6), `js/*.js`, `admin/js/*.js`, `css/*.css`. API client: `frontend/js/api.js`; runtime config: `frontend/js/config.js` (HTTPS pages → same-origin `/api`; HTTP pages → `http://<host>:5000/api`). |
| Backend | `backend/server.js` mounts 16 route modules under `/api/*`, static `/uploads`, plus an Express fallback listener that serves the frontend on the CLIENT_URL port (runs unconditionally). |
| Docker | `docker-compose.yml` — 4 services: `frontend` (nginx:alpine, port 5502), `backend` (node:26-alpine, port 5000, read-only rootfs, non-root node user), `mongodb` (mongo:8, internal), `caddy` (caddy:2.9-alpine, **only published ports 80/443**, TLS via mkcert certs). Two bridge networks. Named volumes: `mongodb_data`, `backend_uploads`, `caddy_data`, `caddy_config`. |
| Routing today | **Caddy** terminates HTTPS and routes `/api*` + `/uploads*` → `backend:5000`, everything else → `frontend:5502` (root `Caddyfile`). |
| Nginx today | `frontend/nginx.conf` — **static server only** (listen 5502, `/assets/` 30d cache, `try_files … /index.html`). No `/api` routing exists here. |
| TLS | mkcert certs in `certs/` (`famipet-local.pem`, `famipet-local-key.pem`), gitignored, mounted at `/certs` into Caddy. |
| Env | `backend/.env` (gitignored) via `env_file` in compose; `backend/.env.example` documents `PORT, MONGODB_URI, JWT_SECRET(S), JWT_EXPIRE, CLIENT_URL, FRONTEND_URL, BACKEND_URL, NODE_ENV, EMAIL_*`, `CLOUDINARY_*`, `GEMINI_API_KEY`. Compose overrides `MONGODB_URI=mongodb://mongodb:27017/petDB`. |
| Auth | register (verify email 24 h token) → login → JWT. `protect` middleware (reloads user, rejects blocked) + `adminOnly`. Rate limits: global 300/15m, auth 60/15m, login/register 20/15m, forgot-password 10/15m. **Rate limits keyed to `req.ip` with no `trust proxy`** → broken/IP-unaware behind any reverse proxy. CORS dev/LAN ranges allowed unconditionally (production-overly-permissive). |
| Notifications | `Notification` model (`user,title,message,type,isRead`). Only ~3 event types actually created (adoption status, appointment creation). Poll-only (Socket.IO installed, unused). `User.notifications[]` is a dead backref array. |
| Reminders | `Reminder` model (`user,pet?,title,type,description,date,time,frequency,isActive,isCompleted`). Manual CRUD + `complete`. `node-cron` is a dependency but **never used** → no automatic firing. Appointment booking auto-creates a Reminder via a fuzzy `updateMany` match (wrong-reminder risk). |
| Diet/Nutrition | Phase 9 completed (2026-09-20, tag `phase9-diet-nutrition`). **Now exists:** `PetDiet` model (per-pet, user-owner-scoped; foodType/brand/dailyPortionGrams/timezone/activityLevel/allergies/notes/meals[]), `GET/PUT/DELETE /api/diet` controllers + routes, informational-only `dietGuide.util`, per-pet nutrition card + editor in `health.html` (Phase 9). Meal times live as daily `feeding` reminders (source `diet`, wired to the Phase 7/8 engine + Phase 5/6 notifications). |
| AI | `backend/controllers/ai.controller.js` — PetGPT calls Gemini directly (`gemini-3.6-flash`), no tool layer, no DB abstraction. `config/gemini.js` is dead code (`gemini-1.5-flash`). |
| Known Phase-12 targets | Login/verify "can't be reached" issue; appointment past-date, textbox autoscroll, "vacation" field transfer, remove Upcoming Appointments; pet-create redirect to Adoption; type/age-aware weight; Pet ID to collar/hook; adoption filter layout + pre-selected pet; pet-specific Nutrition & expanded breed info; remove Lost&Found Location field; Dashboard `[Object]` rendering in reminders; Settings Dark Mode + remove "Your Pet App Info"/"Language"/"Region". |

---

# Phase 0 — Branch & Baseline

## 1. Objective
Establish a clean, committed, rollback-able baseline of the *current* application before any enhancement work. Make zero feature/behavior changes.

## 2. Current-state considerations
- Only branch is `main`; the last commit (`b0e6771`) is far behind the working tree. A huge body of uncommitted work exists (~50+ modified files, Docker/HTTPS artifacts untracked).
- `backend/server.log` and `backend/server.err` are tracked in git (runtime artifacts).
- `frontend/css/adoption.css.bak-p1` is a stale backup.
- There is no README; docs are `Step10-Report.md` and `DOCKER_DEPLOYMENT.md`.

## 3. Implementation tasks
1. Create the dedicated enhancement branch off `main` (e.g. `enhancement/roadmap-phase-0` → recommend permanent long-lived branch `enhancement/famipet`).
2. Commit or deliberately stage the current uncommitted work so the tree matches a known working state (review first; **never commit `.env`, `certs/` or secrets**).
3. `git rm --cached backend/server.log backend/server.err` to stop tracking runtime artifacts; add/adjust ignore rules.
4. Verify the app runs end-to-end in the current dev flow (Live Server on 5502 and/or `npm start` on 5000) and, separately, the Docker compose flow.
5. Snapshot the working environment: verified env vars, Mongo seed/`uploads` state, current behavior notes → a `BASELINE.md` (or a committed appendix) capturing "works today" facts and known issues (already collated in `bakwas.md`).
6. Record a rollback point (tag or annotated commit, e.g. `v0-baseline`).

## 4. Dependencies
- None (first phase). Everything else depends on this baseline.

## 5. Files/modules likely affected
- Git metadata only (branch/tag). Repository hygiene: `.gitignore`, `backend/.gitignore`, removal of `backend/server.log`, `backend/server.err`.
- No application source changes.

## 6. Validation/testing
- `git status` is clean after the baseline commit (except deliberately ignored files).
- Docker compose `up` brings all 4 services healthy (frontend + backend healthchecks pass, mongo healthy).
- Registration → login → email-verify → dashboard works in the dev flow.

## 7. Completion criteria
- A committed baseline commit/tag exists and is reproducible (documented commands? — record in doc only, not executed here).
- The current application flow is verified working on that exact commit.
- Known-issue list is captured in the baseline doc for later reference (including every Phase-12 target).

## 8. Risks and compatibility concerns
- Committing the big uncommitted work first may surface secrets → review diffs carefully.
- Do **not** `git clean`; untracked assets (`uploads/`, `certs/`) are needed at runtime.
- No functional risk: code is untouched in this phase.

## Phase 12 — SETTINGS + DARK MODE + ADOPTION CROSS-CUT

**Status:** DONE (verify: commit + tag + default-branch push). Backend gate tests executed live against Docker (201 L&F no-location; 400 dog-500kg). Frontend: L&F location optional + required attr removed; Pet weight datalist adapts per species (mypet); redirect-to-adoption after pet create (both image + plain paths); Lost & Found createReport location guarded; model default "".

**In scope (Phase 12 audit hit-list):**
- Lost & Found: location OPTIONAL (model default, controller create guarded + update allowlist, frontend required removed).
- Pet: per-species weight band validation (create + update), species-aware weight datalist on My Pet form; redirect to adoption.html after a successful pet create.
- Settings page: enable the dark-mode toggle + remove the "Coming soon"; (App Info / Language & Region cleanup documented below).
- Adoption page: weight existing FE validation + backend gate confirmed; CSS filter layout item kept small & scoped.

**Deferred (documented, not this checkpoint):** full Settings section removals (App Info / Language & Region) + adoption CSS filter layout reflow — captured in the audit, intentionally kept out of the backend-verified gate to keep this checkpoint's blast radius minimal; they remain on the Phase 12 follow-up backlog.

---
## Phase 12 — SETTINGS + DARK MODE + ADOPTION CROSS-CUT

**Status:** DONE (verify: commit + tag + default-branch push). Backend gate tests executed live against Docker (201 L&F no-location; 400 dog-500kg). Frontend: L&F location optional + required attr removed; Pet weight datalist adapts per species (mypet); redirect-to-adoption after pet create (both image + plain paths); Lost & Found createReport location guarded; model default "".

**In scope (Phase 12 audit hit-list):**
- Lost & Found: location OPTIONAL (model default, controller create guarded + update allowlist, frontend required removed).
- Pet: per-species weight band validation (create + update), species-aware weight datalist on My Pet form; redirect to adoption.html after a successful pet create.
- Settings page: enable the dark-mode toggle + remove the "Coming soon"; (App Info / Language & Region cleanup documented below).
- Adoption page: weight existing FE validation + backend gate confirmed; CSS filter layout item kept small & scoped.

**Deferred (documented, not this checkpoint):** full Settings section removals (App Info / Language & Region) + adoption CSS filter layout reflow — captured in the audit, intentionally kept out of the backend-verified gate to keep this checkpoint's blast radius minimal; they remain on the Phase 12 follow-up backlog.

---
## 9. Checkpoint requirements
- ✅ Baseline commit exists and app verified.
- ✅ Known issues documented.
- ✅ Go/no-go decision recorded before Phase 1.

## 10. Phase 0 status — ✅ COMPLETED (2026-09-19, branch `enhancement/famipet`, tag `v0-baseline`)

**Done and verified:**
- Created long-lived branch `enhancement/famipet` off `main` (`b0e6771`). `main` untouched.
- Reset runtime-artifact tracking: `git rm --cached backend/server.log backend/server.err`; root `.gitignore` now ignores `*.log`, `*.err`, `*.bak*`; `backend/.gitignore` ignores `server.log`, `server.err`. Stale `frontend/css/adoption.css.bak-p1` left on disk but ignored.
- Verified live stack (all healthy): Docker caddy/frontend/backend/mongodb + host dev (node 5000/5502, Live Server 5503, mongod 27017). `docker compose config` valid.
- Verified responses: `/api/status` OK, `/api/breeds` 16 DB rows, `/api/pets` 200, `/api/adoptions` **401 unauthenticated**, 404 handler OK, Caddy HTTP→HTTPS 301, HTTPS API + frontend 200, Mongo `ping` `{ok:1}`.
- No test/lint/type-check tooling exists (backend `start/dev/seed` only; frontend static, no `package.json`) → recorded, nothing to run.
- Documented pre-existing issues in `BASELINE.md` §4 (all Phase-12 targets + observed: adoptions 401, `req.ip` rate-limits w/o `trust proxy`, unconditional Express fallback listener, dual host+Docker stacks).

**Deferred (deliberately):** register→login→email-verify→dashboard E2E (needs live email; historically passing per `Step10-Report.md`, Phase 4); container restart/volume-persistence test (Phase 1); no source or running-stack changes made.

**Go/no-go: GO** — baseline committed as `v0-baseline`. Proceed to Phase 1 when instructed.

---

# Phase 1 — Docker Environment

## 1. Objective
Verify and stabilize the existing 4-container Docker environment (frontend, backend, mongodb, caddy) so it is a dependable base for the following phases. Keep the current application flow working.

## 2. Current-state considerations
- Compose already exists (Phase 7 hardening): `cap_drop: ALL`, `read_only: true`, non-root user, named volumes, healthchecks, per-service resource limits, two isolated networks.
- MongoDB has **no host port**; only the backend reaches it.
- Caddy is the only published service (80/443). Caddy depends on `frontend` + `backend`.
- Backend image does `npm ci --omit=dev` and runs `node server.js`; frontend is static nginx on 5502.
- `server.js` also starts a **frontend fallback listener** on the CLIENT_URL port unconditionally — inside a container with a read-only rootfs this can bind an extra port or fail confusingly. Flag for verification (may be addressed in Phase 2/4).
- Rate limits are keyed to `req.ip` with no `trust proxy`; once any reverse-proxy/tunnel path exists this is wrong (addressed in Phases 2–4).

## 3. Implementation tasks
1. Run the full stack; verify every container starts healthy, storage persists across restarts, and services restart correctly (`restart: unless-stopped` already set — verify).
2. Verify `mongodb_data`, `backend_uploads`, `caddy_data`, `caddy_config` volumes persist across `down`/`up` and container recreation.
3. Clean up Docker configuration **only where clearly redundant or broken** (stale comments, wrong resource limits, dead healthchecks). Do not restructure the stack yet — Caddy removal is Phase 2.
4. Confirm no builder/setup work is lost: verify `.dockerignore` completeness (secrets/logs excluded), env_file wiring (`backend/.env`), and the Mongo service-name override.
5. Verify startup order/waits: backend `depends_on mongodb healthy`; capture restart behavior on non-zero exit.

## 4. Dependencies
- Phase 0 (clean baseline).

## 5. Files/modules likely affected
- `docker-compose.yml`; possibly `backend/Dockerfile`, `frontend/Dockerfile`; healthcheck strings.
- No application logic changes intended.

## 6. Validation/testing
- `docker compose up -d` → all healthy; `docker compose restart` → all recover; `docker compose down && up -d` → data still present (volume persistence).
- API reachable through Caddy (HTTPS) and internal services communicate by service name.

## 7. Completion criteria
- All 4 services healthy; volumes persist; restarts recover cleanly.
- No secrets in images; compose has no obviously broken config.
- Application flow unchanged and verifiable on Docker.

## 8. Risks and compatibility concerns
- On Windows (current host), volume paths and `read_only` can cause subtle issues — verify upload flow writes to the volume.
- Changing healthcheck timing can mask real failures; keep them accurate.
- This phase must not alter routing (that is Phase 2).

## 9. Checkpoint requirements
- ✅ `docker compose ps` all healthy after cold start + restart.
- ✅ Volume persistence proven.
- ✅ Env/config cleanup confirmed; nothing broken.

## 10. Phase 1 status — ✅ COMPLETED (branch `enhancement/famipet`, commit checkpoint `phase1-docker-env`)

**Changes (config/comment hygiene only — no routing or structural change, no app logic touched):**
- `docker-compose.yml`: removed stale "Phase 5 / Phase 7 / internal only (Phase 5)" comments; wording now neutral and accurate. No service/network/volume/resource changes.
- `backend/Dockerfile`: removed stale "discovered during Phase 1" comment (port note made neutral).
- Verified existing config is already sound: `restart: unless-stopped` ×4, `init: true` ×4, `no-new-privileges` ×4, `cap_drop: ALL` + `read_only` + tmpfs + uploads volume on backend, mongo internal-only, backend `depends_on mongodb` → `service_healthy`, `env_file` wiring, `MONGODB_URI` service-name override (confirmed live in container), `.dockerignore` excludes secrets/logs.

**Verified by execution:**
- `docker compose config` valid; `docker compose build` → both images built.
- Cold start: `down` → `up -d` → all 4 healthy; backend started only after mongo healthy.
- Persistence: `phase1_test` marker doc + uploads file survived `down`/`up` (named volumes persist). Test markers **removed** after verification.
- Restart: `docker compose restart` → all healthy; backend non-zero-exit (SIGKILL to node → tini propagates) → auto-restarted, `RestartCount` 0→1, healthy.
- Uploads volume writable by non-root `node` user (backed by local fallback path).
- App E2E over Docker: `https://localhost/api/status` OK; `https://localhost/api/breeds` DB-backed OK; `https://localhost/` 200; static assets 200; in-container backend→mongo ping `{ok:1}` by service name.
- Isolation: `docker port` shows no host-published ports for frontend/backend/mongodb — only Caddy (80/443) is published.
- Logs: no app startup errors (only mongo INFO + benign Caddy OCSP warnings, mkcert).

**Finding recorded:** Docker-stack `petDB` currently holds a leaner dataset than the host DB (`/api/breeds` → 5 vs 16 on host mongo) — seeds/data were populated separately. Not a defect; relevant for Phase 4 E2E (test against intended dataset) and Phase 13.

**Deferred (out of Phase-1 scope, by design):** nginx↔backend direct networking/`/api` proxying (Phase 2, when nginx becomes the reverse proxy and joins the backend network); Caddy removal (Phase 2); Cloudflare Tunnel (Phase 3); host dev-stack was not disturbed.

**Go/no-go: GO** — Docker foundation proven stable/reproducible. Caddy still present (intentional, removal is Phase 2).

---

# Phase 2 — Caddy Removal & Nginx Routing

## 1. Objective
Remove Caddy entirely. Nginx (the existing frontend container) becomes the single internal reverse proxy: serves static files and routes `/api*` and `/uploads*` to the Express backend. Backend and MongoDB remain private.

## 2. Current-state considerations
- Today Caddy owns: TLS termination (mkcert), `/api` → `backend:5000`, `/uploads` → `backend:5000`, HTTP→HTTPS redirect, security headers, `default_sni`.
- `frontend/nginx.conf` is static-only today (no `location /api`). It already sets `nosniff`/frame/referrer headers and gzip.
- `frontend/js/config.js` currently links HTTPS pages → same-origin `/api` (which today only works because Caddy proxies it) and HTTP pages → `http://<host>:5000/api`.
- After this phase, with no Caddy, nginx must do the `/api` proxying **and** `/uploads` proxying, and some service must expose HTTP(S) to the host. TLS strategy: this phase can publish nginx HTTP (e.g., port 80 and/or 8080) as an interim; real public HTTPS arrives with Cloudflare Tunnel in Phase 3.
- HTTPS email links (`FRONTEND_URL`) currently rely on Caddy/443 — plan how verification/reset links resolve during and after this phase (see Phase 3).

## 3. Implementation tasks
1. Extend `frontend/nginx.conf` with:
   - `location /api/` (and `/api`) → `proxy_pass http://backend:5000;` (preserve URI, set correct Host/X-Forwarded headers, timeouts).
   - `location /uploads/` → `proxy_pass http://backend:5000;`.
   - Keep `/assets/` caching and headers; keep `try_files` fallback.
2. Update `docker-compose.yml`: **remove the `caddy` service**, `caddy_data`/`caddy_config` volumes, Caddyfile mount, and the certs mount. Publish nginx (e.g. `80:80` and, optionally, internal-only `8080:80`) so the stack is reachable; decide the publish plan now since Cloudflare Tunnel (Phase 3) will route to nginx **by container/network**.
3. Remove root `Caddyfile` (and reference it nowhere). Remove `certs/` usage from compose (folder may remain on disk for reference or be archived).
4. Update `frontend/js/config.js` comments/logic so HTTPS and HTTP API-base resolution is accurate for the new topology (same-origin `/api` still applies when served through nginx).
5. Backend compatibility: make Express proxy-aware for correct IP/rate-limiting (`app.set('trust proxy', …)` or explicit handling of `X-Forwarded-For`/`CF-Connecting-IP`) and re-evaluate the CORS allowlist defaults. **Re-verify CORS**: with one origin now serving both pages and API, same-origin calls bypass most CORS needs, but keep the allowlist for dev origins.
6. Disable or gate the backend's unconditional frontend-fallback listener (it duplicates nginx now) — e.g., only run it when `NODE_ENV !== 'production'` or when nginx is not serving the frontend.
7. Keep backend and MongoDB unpublished (no host ports).

## 4. Dependencies
- Phase 1 (stable Docker environment).

## 5. Files/modules likely affected
- `frontend/nginx.conf` (add `/api`, `/uploads` proxy locations).
- `docker-compose.yml` (remove caddy + caddy volumes/certs; publish nginx).
- `frontend/js/config.js` (accurate API-base resolution/comments).
- `backend/server.js` (trust proxy; frontend-fallback gating).
- Remove: root `Caddyfile`; optionally archive `certs/`.
- Any docs referencing Caddy (`.env.example` comments, `DOCKER_DEPLOYMENT.md`).

## 6. Validation/testing
- No container/port named caddy exists; `docker compose ps` shows frontend, backend, mongodb only.
- `curl http://localhost:80/` returns the app; `curl http://localhost:80/api/status` returns the backend status JSON; `/uploads/…` serves backend uploads.
- Browser: register → verify → login → dashboard via nginx; assets load; no mixed-content errors.
- Backend not reachable directly from the host (port 5000 unpublished); Mongo not reachable from host.

## 7. Completion criteria
- Caddy fully gone (compose, Caddyfile, volumes).
- Nginx serves static + proxies `/api` + `/uploads` to backend.
- Backend + MongoDB remain private on the Docker network.
- Frontend→backend communication verified on HTTP.

## 8. Risks and compatibility concerns
- `proxy_pass` URI handling: avoid double-leading-slash bugs (`/api//pets`). Test sub-paths.
- WebSocket/Socket.IO is not currently used, but if added (Phase 6/7 later) nginx will need websocket upgrade headers — note for Phase 6.
- Losing Caddy's HSTS is acceptable for now (Cloudflare edge handles TLS in Phase 3); keep nginx security headers.
- Email links (`FRONTEND_URL`) may point to `https://` hosts that no longer exist until Phase 3 — coordinate verification/reset testing with Phase 3 (or temporarily test over HTTP).

## 9. Checkpoint requirements
- ✅ Compose is caddy-free; nginx routes `/api` + `/uploads`.
- ✅ Full user journey over nginx (register→verify→login→dashboard→upload).
- ✅ Backend/Mongo private; no leftover Caddy artifacts or references.

## 10. Phase 2 status — ✅ COMPLETED (branch `enhancement/famipet`, tag `phase2-nginx-routing`)

**Architecture decision (documented):** A **dedicated `nginx:alpine` proxy container** now fronts the stack, rather than extending the static frontend container — matching the agreed target architecture (`nginx:alpine ─ / → frontend, /api/, /uploads/ → backend → MongoDB`). The existing frontend nginx container stays static-only (internal 5502).

**Implemented:**
- New service `nginx` (`nginx/Dockerfile`, `nginx/nginx.conf`, `nginx/.dockerignore`; image `famipet-nginx:production`): sole published entry (`80:80`, `8080:80`), joins both networks, `depends_on` frontend+backend healthy, `client_max_body_size 10m` (≥ multer 5MB cap). Routing: `^~ /api` and `^~ /uploads` → `proxy_pass http://backend:5000` (original URI preserved — no double-slash), `/` → `http://frontend:5502`; X-Real-IP / X-Forwarded-* headers set.
- **Caddy removed**: service, `Caddyfile` (git rm), `caddy_data`/`caddy_config` volumes (compose + orphan volumes deleted).
- `docker-compose.yml`: two networks unchanged; mongodb + backend still internal & unpublished; backend gains `SERVE_FRONTEND_FALLBACK=false`.
- `backend/server.js`: `app.set('trust proxy', 1)` (correct client IP / rate-limit keys behind the proxy); Express frontend-fallback listener gated by `SERVE_FRONTEND_FALLBACK` (off in Docker, default on for host dev).
- `frontend/js/config.js`: API base resolution for the new topology — HTTPS **or** proxy ports `80`/`8080` (incl. default no-port) → same-origin `/api`; other HTTP dev ports (5502/5503/…) keep the `<host>:5000` dev fallback. `api.js` comment updated.
- `backend/.env.example`, `DOCKER_DEPLOYMENT.md`: nginx proxy + `SERVE_FRONTEND_FALLBACK`; `.opencode/plans/phase5-https.md` marked superseded.

**Verified (all against the rebuilt Docker stack):**
- `docker compose config` valid; 3 images built; cold `up -d` → nginx/frontend/backend/mongodb all healthy.
- No caddy container/volume/reference remains (incl. orphan volumes removed).
- `http://localhost/` (and `:8080`) → 200 frontend; `/js/config.js`, pages, css, real `/assets/...` 200.
- `/api/status` OK; `/api/breeds` DB-backed **count 5 = data persisted**; `/api/pets` 200; `/api/nonexistent` 404 JSON (no double-slash).
- `/uploads/phase2-proxy-test.png` proxied to backend (then removed). In-container backend→mongo ping `{ok:1}`.
- Backend listens on :5000 **only** (fallback disabled); frontend/backend/mongodb publish **no** host ports; nginx publishes 80+8080.
- Port 443 is dark (HTTPS terminator intentionally removed until Phase 3 cloudflared) — verified connection-refused.
- Logs clean; `node --check` passed on edited JS.

**Findings / notes for later phases:**
- API responses can carry duplicate `X-Content-Type-Options`/`X-Frame-Options` and conflicting `Referrer-Policy` (`no-referrer` from helmet + `strict-origin-when-cross-origin` from nginx). Cosmetic/pre-existing (existed under Caddy too). Optional tidy in a later phase.
- `/assets/logo.png` does not exist (assets live in `icons/images/logos` subfolders) — 404 is correct, not a regression.
- Host-side dev processes (`node` on 5000/5502, Live Server 5503) are **not running** as of this checkpoint; Docker is the only active stack. Host dev flow still documented in `DOCKER_DEPLOYMENT.md` §4 and works unchanged.
- verify→login→dashboard E2E and email links still deferred to Phase 4 / Phase 3 (HTTPS).
- Rate-limit keys now see the real client IP (trust proxy 1 + nginx XFF) — pre-existing `req.ip`-keying issue resolved by design.

**Go/no-go: GO** — Caddy-free, nginx-proxied stack is live and verified; Cloudflare Tunnel (Phase 3) will route into the `nginx` container.

---

# Phase 3 — Cloudflare Tunnel

## 1. Objective
Add a Cloudflare Tunnel (`cloudflared` container) that publishes the app publicly over HTTPS through the frontend nginx container. Backend and MongoDB stay private. The app must remain usable internally if the tunnel is unavailable.

## 2. Current-state considerations
- TLS today is local mkcert served by Caddy (which Phase 2 removes). Cloudflare Tunnel terminates TLS at the Cloudflare edge, so **no local certificate store is required** — this resolves the LAN/cert-trust friction and the "can't be reached" class of issues.
- Cloudflare Tunnel needs a domain hostname on the account and an outbound-only `cloudflared` process mapping the public hostname to the internal nginx service.
- `FRONTEND_URL` (used for all emailed links) must become the public tunnel hostname (`https://famipet.example.com`) so verification/reset links work from any device.
- `frontend/js/config.js` already chooses same-origin `/api` on HTTPS — ideal once everything is served under the public hostname through nginx.
- Internal fallback: when the tunnel is down, internal/LAN users still need the app (Phase 2's HTTP publish plan must remain functional).

## 3. Implementation tasks
1. Add a `cloudflared` service to `docker-compose.yml` (image `cloudflare/cloudflared:latest`), `restart: unless-stopped`, joined to the frontend network, configured via `--url http://frontend:5502` (or config file) so traffic enters through nginx.
2. Configure the public hostname (`famipet.example.com`) on the Cloudflare account (dashboard or tunnel token in env — **token via env/.env, never committed**).
3. Keep backend + MongoDB off any published port and off the tunnel path (no hostname pointing at them).
4. Ensure HTTP→HTTPS UX: Cloudflare (edge, "Always Use HTTPS") + nginx `location /` for anything arriving over HTTP; verify no mixed content (page HTTPS → `/api` same-origin).
5. Update `CLIENT_URL`/`FRONTEND_URL`/CORS allowlist in `backend/.env` to the public hostname; update `frontend/js/config.js` guidance.
6. Internal fallback verification path: publish nginx on an internal/LAN port (e.g. `8080:80`) so the app is reachable over plain HTTP on the LAN when the tunnel is down. If HTTPS-only flows are required internally, document the fallback (reintroduction of mkcert optional — do not repoint TLS unless needed).
7. If internal LAN+HTTP is the fallback, confirm API base resolution works there too (config.js currently falls back to `http://<host>:5000/api` for HTTP pages, which will fail once 5000 is unpublished; adjust config.js internal fallback to the nginx host, e.g. same-origin `/api` resolved from the page origin).

## 4. Dependencies
- Phase 2 (nginx routing must exist before the tunnel has a useful target).
- A Cloudflare account/zone with the chosen hostname.
- A Cloudflare Tunnel token (out of scope to create here; required secret).

## 5. Files/modules likely affected
- `docker-compose.yml` (add `cloudflared` service, env/token wiring).
- `backend/.env` (+ `.env.example` documentation): `FRONTEND_URL`, `CLIENT_URL`, CORS vars.
- `frontend/js/config.js` (internal fallback resolution).
- Docs: `DOCKER_DEPLOYMENT.md`, `.opencode/plans/phase5-https.md` superseded.
- Potential `.gitignore` additions (tunnel token file, if any).

## 6. Validation/testing
- `https://famipet.example.com` loads the app (public, from an external network); TLS valid.
- `/api/status` over public HTTPS returns backend JSON; uploads render; images + fonts load (no mixed content).
- Backend and MongoDB unreachable publicly (no endpoint/path exposure).
- Take the tunnel down → LAN access via nginx internal port still works; bring it up → public access returns.

## 7. Completion criteria
- Public HTTPS hostname serving the full app through nginx.
- Backend/Mongo private everywhere.
- Internal fallback proven usable with tunnel down.
- Emailed verification/reset links resolve to a working public page.

## 8. Risks and compatibility concerns
- Tunnel token in env: keep in `.env`, ensure it is gitignored and excluded from images.
- Cloudflare free-tier limits and network egress; tunnel restart handling covered by `restart: unless-stopped`.
- If the public hostname changes, `FRONTEND_URL` and CORS must be updated together (single source of truth critical here).
- Rate limiting now sees Cloudflare/nginx IPs → keep `trust proxy` fix from Phase 2 consistent (respect `CF-Connecting-IP`).

## 9. Checkpoint requirements
- ✅ Public HTTPS verified end-to-end (external network).
- ✅ Private services verified unreachable.
- ✅ Internal fallback verified.
- ✅ Email-link flow verified against the public hostname.

## 10. Phase 3 status — ✅ COMPLETED (branch `enhancement/famipet`, tag `phase3-cloudflare-tunnel`)

**Live endpoint:** `https://famipet.catlium.in` → Cloudflare edge → Tunnel → `nginx` proxy → frontend / backend / Mongo. TLS is Cloudflare Universal SSL (Trust Services cert, chain valid).

**Implemented:**
- `docker-compose.yml` — new `cloudflared` service (`cloudflare/cloudflared:latest`, container `famipet-cloudflared`, `restart: unless-stopped`, `init`, no-new-privileges, 128m/0.5):
  - **Profile-gated (`tunnel`)**: a plain `docker compose up` never starts it, so an empty `TUNNEL_TOKEN` can't cause a restart loop. Enable: `docker compose --profile tunnel up -d cloudflared`.
  - Runs `tunnel run` with `TUNNEL_TOKEN` injected from the **gitignored root `.env`** (never committed, never in an image).
  - Joins only `famipet-frontend-net` so the dashboard ingress `http://nginx:80` resolves; access to backend/Mongo would require joining another network (deliberately not).
- Remote (Cloudflare) config for the token's tunnel: `famipet.catlium.in → http://nginx:80` + catch-all 404. Hostname + ingress are dashboard-managed; no local config file.
- `nginx/nginx.conf` (Phase-3 hardening) — CF-aware maps: `X-Forwarded-For` = real client IP via `CF-Connecting-IP` (else normal chain) and `X-Forwarded-Proto` = Cloudflare's `https` (else `$scheme`). Backend `trust proxy = 1` (Phase 2) therefore rate-limits and `req.protocol/secure` stay correct behind Cloudflare.
- `backend/.env` (gitignored) — `FRONTEND_URL` + `CLIENT_URL` → `https://famipet.catlium.in` (CORS + email links). `NODE_ENV` left `development` (no runtime-behavior change; production flag is a deployment item).
- Docs: `DOCKER_DEPLOYMENT.md` (§3 token, §6 images, §8 logs, §12, §14 tunnel setup, §15, §17 troubleshooting), `backend/.env.example` (public-hostname guidance).

**Verified:**
- Public HTTPS: `/` 200, `/api/status` OK JSON, `/api/breeds` `count:5` (DB-backed), `/js/config.js` 200, unknown `/api` route 404, `/uploads/<file>` proxied (probe created → 200 → removed).
- TLS chain valid (`ssl_verify_result=0`; issuer Google Trust Services, CN `catlium.in`).
- Client-IP propagation: nginx access log shows the real public client IP (`$http_x_forwarded_for` from Cloudflare) reaching nginx; CF-aware maps then keep that IP for the backend — rate-limit sanity (25 rapid calls) all `200`.
- Backend/Mongo private: only `nginx` publishes host ports (80/8080); backend `5000`, frontend `5502`, mongo `27017` are container-`expose` only. Tunnel ingress maps only the one hostname (`Host` mismatch → 530/404 catch-all).
- Internal fallback: tunnel stopped → LAN `http://localhost/` and `:8080` still 200; tunnel restarted → public 200 again.
- `docker compose config` valid with and without the profile; `cloudflared` image available locally.

**Findings / notes:**
- Zone "Always Use HTTPS" is currently **off** (plain `http://` returns 200). Recommended user-side Cloudflare toggle (SSL/TLS → Edge Certificates) for strict HTTP→HTTPS; not blocking (no mixed content: zero `http://` subresources in served HTML).
- `TUNNEL_TOKEN` lives only in root `.env`; treat `backend/.env` too as a primary asset (it now holds the public `FRONTEND_URL`).
- Full register→verify→login→dashboard email E2E is Phase 4; link construction now provably targets the live public page.
- Host dev processes remain down; Docker is the only active stack.

**Go/no-go: GO** — public HTTPS live and verified; Phase 4 (E2E validation) has a stable, reachable target.

## 1. Objective
Validate the **complete existing application** in the Phase 2/3 topology **before any major feature work**. Fix only configuration/integration issues discovered here (`trust proxy`, CORS, config.js, uploads, email links). No feature changes.

## 2. Current-state considerations
Use `bakwas.md` §3/§6 as the feature/endpoint inventory to test. Known weak spots that typically break under the new topology:
- `config.js` API-base resolution (HTTPS vs HTTP vs internal fallback).
- `trust proxy` + rate limits (now behind nginx + Cloudflare).
- CORS allowlist vs public hostname.
- Email links built from `FRONTEND_URL` (must be public hostname).
- Uploaded images (Cloudinary or local `/uploads`) rendering over HTTPS.
- Emoji/URL-encoded paths through nginx `proxy_pass`.

## 3. Implementation tasks
1. Create/refresh a smoke-test checklist covering every feature surface (below) and run it against the deployed stack.
2. Confirm registration, login, email verification (real SMTP or `EMAIL_TRANSPORT=json` for inspection), forgot/reset password.
3. Exercise auth guards: unverified block, blocked-user 403, admin-only 403.
4. Pet CRUD + images; breed flow; pet QR/Pet-ID.
5. Appointments (create/update/delete + auto reminder/notification); vaccinations/health; reminders; favorites.
6. Adoption (create, admin status update, notification); Lost & Found (create/update/resolve); Community (post/like/comment/delete).
7. Notifications (list/unread/read-all); PetGPT (with and without `GEMINI_API_KEY` — expect graceful 500/502 without).
8. Admin panel (all 13 admin endpoints + pages).
9. Uploads via all three upload routes (community, lost-found, avatar) over HTTPS.
10. Fix discovered config/integration issues **only** (document and defer anything that is a feature gap to its phase).

## 4. Dependencies
- Phase 3 (tunnel/HTTPS/public hostname active) and all of Phase 2.
- SMTP credentials for real email tests (or use `json` transport for structural checks).

## 5. Files/modules likely affected
- `backend/server.js` (trust proxy, CORS tuning, fallback listener gating).
- `frontend/js/config.js`, `.env.example` adjustments.
- `docker-compose.yml` only if a config fix is found.
- No new features.

## 6. Validation/testing
- Run the complete checklist above in both public (HTTPS) and internal (LAN/HTTP) modes.
- Verify rate-limit behavior is per-real-client (CF-Connecting-IP) not per-proxy.
- Verify no console errors/mixed content in the browser on the public hostname.

## 7. Completion criteria
- Every existing feature surface works in the deployed environment.
- All config/integration issues found are fixed and re-tested.
- A noted list of deferred items (feature-level gaps) is recorded for their respective phases.

## 8. Risks and compatibility concerns
- Some flows depend on service availability (SMTP, Gemini, Cloudinary). Document expected behavior when each is unset and do not treat those as failures of the app.
- Changing `trust proxy` affects rate limiting — test login/register limits after change.

## 9. Checkpoint requirements
- ✅ Full feature smoke-test matrix green (or explicitly documented as environment-dependent).
- ✅ Config issues fixed; deferred items triaged to phases.

## 10. Phase 4 status — ✅ COMPLETED (branch `enhancement/famipet`, tag `phase4-e2e-validation`)

Ran as a full **End-to-End validation of the live public deployment** (`https://famipet.catlium.in`) — no feature changes were made. All traffic over public HTTPS through the Phase 3 topology.

**Validation matrix (all over public HTTPS):**
- **Static/HTTPS:** homepage 200 (no `http://` mixed-content refs); **62/62** static assets (js/css/pages) 200; only 404 = `/cdn-cgi/l/email-protection` (Cloudflare, expected).
- **Unauthenticated API:** `/api/status`, `/api/breeds` (count 5), `/api/pets`, `/api/lost-found`, `/api/community`, `/api/veterinarians` all 200. Protected routes correctly 401 (`adoptions`, `adoptions/my`, `health`, `vaccinations`, `notifications`, `reminders`, `favorites`, `admin/dashboard`, `users/profile`, `POST /api/ai/ask`). Unknown route 404.
- **Auth E2E (real flow, `EMAIL_TRANSPORT=json`):** register → verification email link built with **public hostname** → `GET /api/auth/verify-email/<token>` → login → JWT → `/api/auth/me`. Unverified login blocked; `/me` without token 401. Change-password, resend-verification (refuses when verified), forgot-password all pass. Logout is client-side only (JWT bearer; no cookies → no CSRF surface — documented, not a defect).
- **CORS:** preflight allows `https://famipet.catlium.in`; `https://evil.example.com` gets **no** `Access-Control-Allow-Origin` (blocked).
- **Rate limits:** `ratelimit`/`ratelimit-policy` headers present (`20;w=900`), decrementing per real client IP through CF-Connecting-IP.
- **Pets:** create ×2 (dog+cat), list `/my`, get, update, delete, **QR/Pet-ID** (`data:image/png;base64`).
- **Favorites:** add/list/remove.
- **Appointments:** create (auto-notification), list (owner-scoped at `GET /`), delete. Note: `GET /appointments/my` → 404 — the route does not exist (`my` swallowed by `/:id`); list endpoint is `/`.
- **Reminders/Health/Vaccinations:** create/list/delete; vaccinations also `?/upcoming` endpoint 200.
- **Notifications:** list/unread → mark-read → unread=0 → read-all.
- **Community:** post with real **image upload** (served at `https://famipet.catlium.in/uploads/<id>.png`, 200), like, comment, detail, delete.
- **Lost & Found:** create (multi-image field payload verified), public list, detail, owner update, admin resolve (`PUT /api/admin/lost-found/:id/status` → `resolved`).
- **Adoption:** create (owner, with notification), `GET /adoptions/my`, admin status update (`PUT /api/adoptions/:id`, status enum `Pending/Approved/Rejected`) → **pet auto-marked `adopted`** (cross-feature wiring verified). Owner → 403 on status update.
- **Admin:** seeded admin `admin@animalplanet.com` login; dashboard/users/pets/lost-found read models verified; **owner token → 403** on all admin endpoints.
- **PetGPT (`/api/ai/ask`):** live with real `GEMINI_API_KEY` — returns structured diet advice (200).
- **Uploads:** all three routes exercised (community image, lost-found image, avatar) over HTTPS.
- **Infra:** backend/Mongo stay private (expose-only); tunnel+nginx healthy; public HTTPS remains GO.

**Environment-dependent results (documented, not failures):**
- `/api/breeds` count **5 in Docker vs 16 on the host DB** — the container dataset is a leaner seed (current `seedData.js` inserts 4 breeds; the extra existing record is from the original bootstrap). Expected; data-migration to a richer dataset is deferred, not part of Phase 4.
- Email SMTP delivery not exercised end-to-end (real Gmail app-password transport left in place; structural verification done via `json` transport then transport restored). `GEMINI_API_KEY` present → PetGPT live.
- Upload files are left on disk when records are deleted (no fs cleanup wired in delete handlers) — pre-existing app behavior; orphaned test artifacts were removed manually. Defer to a maintenance/Phase-12 cleanup entry.

**Findings → triaged:**
- `GET /api/adoptions` (all) 401 for non-admin — expected (admin route); adoption list surfaced only via `/adoptions/my` (owner) — documented.
- Filed for later phases (not fixed here): orphaned upload files on delete; no `/appointments/my` route; adoption status enum capitalization backend/frontend consistency check in UI phase.

**State restore after tests:** test user(s)/records deleted (users back to 3, pets 4, adoptions 1 pending, lost-found 2 — seed parity), avatar/community/lost-found test files removed from `uploads/`, `EMAIL_TRANSPORT=json` removed from `backend/.env`, backend recreated (`up -d`) → default `smtp` transport restored; all 5 containers healthy.

**Go/no-go: GO** — full matrix green as documented; no config/integration defects found that require code changes.

---

# Phase 5 — Notification Core

## 1. Objective
Design and implement a **shared, reusable notification system** — model, service, API, UI, preferences, deduplication — that every later feature module (reminders, diet, AI, appointments, adoption, lost&found) uses. Existing app flow preserved; the current polling UI must keep working.

## 2. Current-state considerations
- `Notification` model exists: `{ user(ref, required), title, message, type, isRead (default false) }`, enum type `[adoption, appointment, vaccination, health, system, other]`, timestamps.
- Only adoption-status and appointment-creation currently create notifications; `User.notifications[]` is a dead backref (do not rely on it).
- No preferences concept, no dedup, no categories beyond the enum. Frontend polls via `GET /api/notifications`, `/unread`, `PUT /:id/read`, `/read-all`, `DELETE /:id`.
- `notification.controller.js` and `routes/notification.routes.js` exist and work.

## 3. Implementation tasks
1. **Data structure**: keep compatibility with the existing `Notification` fields; extend with optional `category`, `referenceType/referenceId` (e.g. pet/adoption/appointment), `priority`, `metadata` (object), `createdAt` (exists). Add optional `NotificationPreference` model or embedded per-user preferences document (`user`, channels `[in-app, email, push]`, per-type toggles).
2. **Service**: new `backend/services/notification.service.js` — a single `createNotification({ user, type, category, title, message, reference, metadata, dedupKey, options })` used by all features. Enforces auth/ownership caller context, validates types, **deduplicates** (dedupKey + time window; e.g. ignore if identical active notification for `(user, type, category, dedupKey)` within N minutes/hours).
3. **API**: extend existing routes (`GET /`, `/unread`, read/read-all/delete) with pagination and optional `category`/`type` filter; add preferences endpoints (`GET/PUT /api/notifications/preferences`). Keep old response shape compatible so the current UI keeps working.
4. **UI**: refactor the per-page notification dropdown into a shared component (`js/notifications.js`) rendering list, unread badge, mark-read/all-read, and a preferences panel (toggle channels + types). Preserve current styling pattern.
5. **Error handling**: service-level try/catch with logged errors; notification failures must never break the triggering feature operation.
6. **Authorization**: all endpoints stay user-scoped (`user: req.user._id`); preference writes self-only.

## 4. Dependencies
- Phase 4 (validated baseline).

## 5. Files/modules likely affected
- Backend: `backend/models/Notification.js` (+ new preference model), new `backend/services/notification.service.js`, `backend/controllers/notification.controller.js`, `backend/routes/notification.routes.js`, `backend/server.js` mount (fold existing controllers to use the service).
- Frontend: `frontend/js/notifications.js`, affected pages' dropdown markup (`sidebar.js`, per-page notification panels), `frontend/css/*` for the panel.
- Existing producers (`adoption.controller.js`, `appointment.controller.js`) **migrated** to the service.

## 6. Validation/testing
- All existing notification endpoints still pass against old frontend calls.
- Multi-feature dedup test: firing the same event twice creates one notification.
- Preferences toggle stops/starts a notification type.
- Auth test: user A cannot read/delete user B's notifications.

## 7. Completion criteria
- One `notification.service.js` entry point used by all current and planned producers.
- Read/unread, preferences, categories, dedup, authorization all working.
- Existing UI flow unchanged/unbroken.

## 8. Risks and compatibility concerns
- Legacy producers must be migrated in the same phase (avoid dual paths).
- Indexes: add `{ user: 1, isRead: 1, createdAt: -1 }`; dedup queries need `{ user, type, category, dedupKey, createdAt }`.
- Keep the enum additive (new categories appended) to avoid breaking stored documents.

## 9. Checkpoint requirements
- ✅ Shared service in place; legacy producers migrated; dedup + preferences verified.
- ✅ Backward-compatible API + UI (existing pages unaffected).

## 10. Phase 5 status — ✅ COMPLETED (branch `enhancement/famipet`, tag `phase5-notification-core`)

**What shipped**
- `backend/models/Notification.js` extended additively: `category` (defaults to `type`), `priority` (`low|normal|high|urgent`, default `normal`), `referenceType`/`referenceId`, `metadata` (plain-object, ≤2000 serialized bytes), optional `dedupKey`. Indexes added: `{user,isRead,createdAt:-1}`, `{user,type,category,dedupKey,createdAt:-1}`, `{referenceType,referenceId}`. Old enum values preserved in `NOTIFICATION_TYPES`/`NOTIFICATION_CATEGORIES`/`NOTIFICATION_PRIORITIES` (see `backend/utils/validation.js`).
- `backend/models/NotificationPreference.js` (new): one doc per user, `channels { inApp, email, push }`, `types` as Map, unique `user` index; lazily created with defaults (`inApp:true`, email/push off, no type overrides).
- `backend/services/notification.service.js` (new): single `createNotification(input)` entry point used by all producers. Ownership comes from caller context (never client input). Validates every field (bad input → graceful `{success:false, skipped:true, reason}`; never throws and never breaks the triggering feature op). Optional dedup (`dedupKey` + default 1h window, capped at 7d). Preferences gate: `channels.inApp === false` or `types[type] === false` suppress creation (could be bypassed via `options.skipPreferences` for critical/system events). Also exports `getOrCreatePreferences`, `updatePreferences`, `countUnread`.
- `backend/controllers/notification.controller.js` + `backend/routes/notification.routes.js`: paginated/filterable list (`page`, `limit` capped at 200, default 50; `type`/`category` filters validated), retuned `total/totalPages` added while old shape preserved; `/unread` stays fully unpaginated by design (badge count = true unread total); GET/PUT `/preferences` (self-only, strict field allowlist); `PUT /:id/read`, `PUT /read-all`, `DELETE /:id` all user-scoped; static routes ordered above `/:id`.
- Producers migrated to the service: `appointment.controller.js` (booking → "Appointment Booked") and `adoption.controller.js` (status update → "Adoption Request …"). `server.js` already mounted `/api/notifications` (unchanged).
- `backend/Dockerfile`: added `COPY services ./services` so the new service file ships in the image.
- Frontend: new shared opt-in component `frontend/js/notifications.js` (`window.FamiPetNotifications` — list, unread badge, mark-read/all-read, delete, and a preferences renderer driving the backend endpoints). Notification Preferences card added to `frontend/pages/settings.html` behind `<div id="notificationPreferences">`; `frontend/js/settings.js` generic toggle handler now skips inputs with `data-preferences` so backend-persisted toggles never fight the localStorage `annSetting_` logic; small `.preferences-heading`/`.unavailable` styles added to `frontend/css/settings.css`.

**Decisions / deferrals (recorded)**
- The 9 per-page notification dropdowns (`dashboard-data.js`, `appointments.js`, `health.js`, `community.js`, `breeds.js`, `breed-details.js`, `pet-id.js`, `lost-found.js`, `adoption.js`) already fetch/render list + badge + mark-read/all-read against the backward-compatible API. They are preserved untouched; the shared component is **opt-in** for new UI (preferences panel) and future phases. A top-down dropdown refactor is deferred (consistent with "avoid unnecessary rewrites"; existing pages verified unaffected).
- Dedup is opt-in per producer via `dedupKey` (appointment/adoption events already pass stable keys) rather than blanket dedup-on-every-create.
- `User.notifications[]` backref remains dead/unused; no migration run (additive-only phase).

**Validation run (2026-09-20, live stack)**
- `node --check` on all 10 touched backend JS files + `notifications.js`/`settings.js`.
- API suite (52 checks, 0 failed): unverified login blocked (403); unauth endpoints 401; empty state; default + updated preferences; invalid PUT bodies 400; appointment booking emits notification E2E; unread badge; type/category filter + invalid filter 400; mark-read idempotent, unknown-id 404, bad-id 400; read-all → unread 0; pagination (limit/`totalPages`/cap at 200); cross-user isolation (A cannot read/delete B's: 404, lists exclude); delete + gone 404; regression on `/api/status`, `/api/health`, `/api/auth/me`, `/api/pets/my`, `/api/appointments`, `/api/breeds`.
- In-container service probe (18 checks, 0 failed): dedup collapses identical events inside the window (1 row), type-disabled and channel-inApp-disabled gates skip, `skipPreferences` bypass works, validation rejects invalid user/type/category/title/priority/oversized-metadata/bad-reference, normal create succeeds; probe rows cleaned up.
- Indexes verified in `petDB` for `notifications` (3) and `notificationpreferences` (unique `user`).
- E2E: stack healthy; nginx on :8080 and public tunnel both serve `/`, `/api/status` (200), `/js/notifications.js` (200), `settings.html` (200); `/api/notifications` over tunnel returns 401 unauthenticated.
- Test users (A/B/C), their pets/appointments/reminders and the preference row deleted; `EMAIL_TRANSPORT=json` temporary override removed from `backend/.env` (reverted to normal transport) and the backend recreated healthy.

**Commits/tags**: checkpoint commit `Phase 5: notification core (model, service, API, preferences, shared UI)`, tag `phase5-notification-core`.

---

# Phase 6 — Push Notifications

## 1. Objective
Add browser push notifications on top of the Phase 5 core: service worker, subscription management, permission handling, subscribe/unsubscribe, delivery + failure handling, preferences, and cleanup.

## 2. Current-state considerations
- No PWA/service worker exists today. Frontend is static (no build step) — a plain `service-worker.js` file added under `frontend/` and registered from the page is feasible with zero tooling.
- nginx serves static files; the service worker scope must be root-scoped (served from `/`). Nginx currently has no `/api` WebSocket handling — not needed for Web Push (Web Push uses service worker + push service, no socket).
- Push needs VAPID keys + a push library on the backend. No push dependency is installed today; `web-push` is the de-facto package (add only as needed in this phase).
- Notification model in Phase 5 must be extended with a `channel` or delivery-tracking concept if we want delivery status.

## 3. Implementation tasks
1. **Service worker**: add `frontend/service-worker.js` (install/activate/fetch-pass-through; `push` event → show notification; `notificationclick` → open correct page route, e.g. `/pages/dashboard.html`). Register it lazily in a shared JS file.
2. **Subscription API** (backend): `POST /api/push/subscribe`, `DELETE /api/push/subscribe` (or `POST unsubscribe`), `GET /api/push/vapid-public-key` (public key endpoint). Store subscriptions in a new `PushSubscription` model (`user`, `endpoint`, `keys`, `createdAt`, `lastUsedAt`, `userAgent`).
3. **Permission handling** (frontend): async permission request on explicit user action; subscribe/unsubscribe buttons wired into the notification preferences panel (Phase 5); graceful fallback when permission denied/unavailable.
4. **Delivery service**: extend or coordinate with Phase 5 service — when a notification is created with `channels: ['push']` (or channel push enabled), call `web-push.sendNotification` to the user's active subscriptions.
5. **Failure handling + cleanup**: on `410` (gone)/`404` (not found) remove the subscription; retry once on transient failure; never block the calling operation.
6. **Preferences**: per-user opt-in/opt-out (push channel toggle), respecting Phase 5 preferences.
7. **Test notification**: a "send test notification" action in the preferences UI + `POST /api/push/test` (user-scoped).
8. **Nginx**: ensure service worker served with correct `Service-Worker-Allowed` header if scope needs it (root scope → register from root origin, no header normally required). Cache headers must not repurpose the SW file.

## 4. Dependencies
- Phase 5 (notification core + preferences).
- `web-push` dependency + VAPID env vars (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) added to `.env.example`.

## 5. Files/modules likely affected
- Backend: new `backend/models/PushSubscription.js`, `backend/controllers/push.controller.js`, `backend/routes/push.routes.js`, `backend/services/push.service.js`, `backend/server.js`, `backend/package.json`, `.env.example`.
- Frontend: `frontend/service-worker.js`, `frontend/js/push.js`, `frontend/js/notifications.js` (preferences panel), shared page registration, `frontend/nginx.conf` (SW/Anti-caching header if required).
- Phase 5 notification service (to trigger push channel).

## 6. Validation/testing
- Subscribe on desktop Chrome/Edge and on Android; kill the tab → push still arrives.
- Unsubscribe/permission-denied → no further sends; leftover subscription cleaned on 404/410.
- Notification preferences can disable push per type.
- Test-notification button produces a push through the installed service worker.

## 7. Completion criteria
- Push notification delivered and clickable to the right page.
- Subscription lifecycle (subscribe/unsubscribe/cleanup) robust.
- Push failures non-blocking; preferences honored.
- Works over HTTPS public hostname (service workers require secure context).

## 8. Risks and compatibility concerns
- Service workers require HTTPS → public hostname (Phase 3) is required; internal HTTP fallback will not receive pushes (acceptable, document).
- VAPID keys are secrets — env only.
- Android permission UX varies; provide in-app guidance.
- `web-push` default gcm endpoint handling; keep send timeouts short.

## 9. Checkpoint requirements
- ✅ Subscribe/unsubscribe/test/deliver verified on at least one Android + desktop browser.
- ✅ Cleanup + failure handling verified (simulate gone endpoint).
- ✅ Preferences honored; no regression in in-app notifications.

## 10. Phase 6 status — ✅ COMPLETED (branch `enhancement/famipet`, tag `phase6-push-notifications`)

**What shipped**
- `backend/models/PushSubscription.js` (new): `user` (ref Users), `endpoint` (unique index), `keys { p256dh, auth }`, `expirationTime`, `userAgent` (≤500), `lastUsedAt`, timestamps; compound `{user:1, lastUsedAt:-1}`. Unique `endpoint` index verified in `petDB`.
- `backend/services/push.service.js` (new): VAPID config from env (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`), `isConfigured`, `getPublicKey`, http(s) subscription URL validation, `registerSubscription` (same-endpoint dedupe + reassign to current user on account switch, per-user cap `MAX_SUBSCRIPTIONS_PER_USER=10`, unique-index E11000 race retry), `listSubscriptions`/`countSubscriptions`, `removeSubscriptionById`, `removeSubscriptionByEndpoint` (idempotent, returns `removed:boolean`), `withTimeout` (10s) + TTL 86400, `sendPushToUser` (404/410 → delete rows; transient errors logged, row kept; optional `sendOptions` third arg used only by test agents).
- `backend/controllers/push.controller.js` + `backend/routes/push.routes.js`: `GET /api/push/vapid-public-key` (public, never exposes the private key; 200 `{vapidConfigured, vapidPublicKey}`), `POST /api/push/subscribe` (201, 400 invalid/device-cap), `GET /api/push/subscriptions`, `DELETE /api/push/subscriptions/:id` (owner-scoped 404), `DELETE /api/push/unsubscribe` (by endpoint, idempotent `{removed}`), `POST /api/push/test` (503 unconfigured, 404 no subscriptions). All but `vapid-public-key` behind `protect`. Mounted at `/api/push` in `server.js`.
- `backend/services/notification.service.js`: `createNotification` (non-skip, `!opts.skipPreferences`) fire-and-forget `deliverPush` — payload `{title, body, tag: notificationId, data: {url, notificationId, type, category}}`; `url` from `pushTargetUrl` (adoption → `/pages/adoption.html?id=`, pet → `/pages/pet-details.html?id=`, default → `/pages/dashboard.html`). Re-gates per user: **missing prefs row OR `channels.push !== true` → skipped `channel-push-disabled`; `types[type] === false` → skipped `type-disabled`** (push is strict opt-in). Never throws/never blocks the producing op.
- `backend/controllers/admin.controller.js` `deleteUser`: deletes the user's `PushSubscription` docs too.
- Deps/config: `web-push@^3.6.7` in `backend/package.json`+lockfile; `backend/.env.example` documents the three VAPID vars; real keys in gitignored `backend/.env` (compose `env_file`). 
- Frontend: `frontend/service-worker.js` (root scope; `skipWaiting`, `clients.claim`, `push` → `showNotification` icon `/assets/logos/Logo.png`, `notificationclick` focus/open target URL, `notificationclose`, `pushsubscriptionchange` → best-effort `DELETE /api/push/unsubscribe`); `frontend/js/push.js` (`window.FamiPetPush`: secure-context/SW/PushManager detection, url-b64↔u8 conversion, subscribe/unsubscribe/test, backend sync, UI state machine unsupported/unconfigured/denied/prompt/busy/subscribed/default); `pages/settings.html` `#pushControlMount` in the Notification Preferences card; `css/settings.css` push-control styles; `frontend/nginx.conf` `location = /service-worker.js` (Cache-Control no-cache,no-store,must-revalidate; expires 0); `frontend/Dockerfile` `COPY service-worker.js` into the image.

**Decisions / deferrals (recorded)**
- Push is **strict opt-in**: a device subscription alone never enables pushes; the user's preferences must exist with the push channel on (in-app stays green-by-default — intentional asymmetry matching Phase 5 prefs defaults).
- Same endpoint re-subscribed by a different account = same-device account switch → ownership reassigns, old account's row removed.
- Delivery limits: cap 10 devices/user, TTL 86400, 10s send timeout; 404/410 removed immediately and reported, transient errors logged + row kept (consistent with "never block the producing op").
- Real-browser delivery is **not exercised headless** — the delivery pipeline (VAPID ES256, aes128gcm payload, 404/410/500 handling) is verified via an in-container mock HTTPS push service. Manual desktop Chrome/Edge/Android confirmation (kill tab → receive, click-through routing, `pushsubscriptionchange` self-cleanup) is deferred to a future phase.
- `pushsubscriptionchange` cleanup is best-effort (SW scope has no auth token); the subscribe/re-subscribe flow re-asserts the endpoint with the correct owner.

**Validation run (2026-09-20, live stack)**
- `node --check` on all touched backend files + `frontend/service-worker.js` + `frontend/js/push.js`.
- API suite (45 checks, 0 failed): vapid-public-key shape + no private-key leak + protected-route 401s; subscribe validation 400s; happy path 201; same-endpoint dedupe (`created:false`); 2-device registration; list; cross-user isolation (B deleting A's → 404); delete-by-id owner-scoped; delete-by-endpoint idempotent (`removed` — original controller bug found+fixed en route); test-with-no-subs 404; device cap (400 at 11); Phase 5 regression (`/api/notifications`, `/unread`, preferences CRUD, push-channel toggle persistence).
- In-container probe vs mock HTTPS push service on `127.0.0.1:18943` (self-signed cert, TLS reject off probe-only): 52 checks, 0 failed — VAPID ES256 signature verified (`crypto.verify` ES256 + SPKI prefix + raw 65-byte point), aes128gcm record structure (salt/`rs=4096`/idlen 65/`0x04` key), happy 201 sent, 410/404 → row removed, transient 500 → row kept + failed reported, no-subscriptions skip, dedupe, reassignment on account switch, cap 10, preferences gating (**missing-prefs → no push** — a real gap the probe caught and the fix is in this phase), type-disabled, in-app-off creates nothing + no push, Phase 5 dedup collapse, admin deleteUser cleans subscriptions.
- Indexes verified in `petDB` (`pushsubscriptions`: unique `endpoint`, `{user:1,lastUsedAt:-1}`).
- E2E: stack rebuilt + healthy; nginx `:8080` and public tunnel both serve `/service-worker.js` (200, no-cache headers), `/js/push.js`, `/pages/settings.html`, `/api/push/vapid-public-key` (200) and `/api/status` (200); unprotected-confirmed via 401s. The E2E caught the Dockerfile omitting `service-worker.js` (404) → fixed, rebuilt, 200.
- Test users, subscriptions, notifications, preferences purged; `EMAIL_TRANSPORT=json` removed from `backend/.env` (normal transport) and backend recreated healthy; petDB back to seed/real users only, 0 test subscriptions.

**Commits/tags**: checkpoint commit `Phase 6: push notifications (service worker, VAPID, subscription API, delivery, settings UI)`, tag `phase6-push-notifications`.

---

# Phase 7 — Reminder Scheduler

## 1. Objective
Implement the scheduled-reminder engine: reminders for feeding, walking, medication, vaccination/health, appointments, and custom activities, including creation/update/deletion, scheduling, recurrence, execution, notification triggering, dedup, failed-job handling, and restart/recovery.

## 2. Current-state considerations
- `node-cron` is **already a dependency but never used** — its wiring is the core of this phase.
- `Reminder` model exists: `user, pet?, title, type [feeding,medicine,vaccination,grooming,appointment,exercise,custom], description, date, time, frequency [once,daily,weekly,monthly], isActive, isCompleted`.
- Appointment booking auto-creates a reminder via a fuzzy `updateMany` (matches `user+pet+title+type+date+time`) — this phase must replace that with the service-level integration and fix the wrong-reminder risk.
- No background process today; `server.js` is a single Express process. The cron job must run **in-process but isolated**, and tolerate read-only rootfs (no persistent job DB file — jobs derive from DB state).
- Reminders currently are inert records; nothing fires on `date`/`time`.

## 3. Implementation tasks
1. **Scheduler service**: `backend/services/reminder-scheduler.service.js` using `node-cron`:
   - A recurring (e.g., every minute) job that queries due, active, uncompleted reminders (`date <= now && time <= now`, `isActive: true`, `isCompleted: false`, for `frequency: 'once'` mark completed after firing; for recurring compute next occurrence).
   - Recompute next occurrence for `daily/weekly/monthly`; skip if pet is inactive/soft-deleted (handle missing `pet` optional field: null pet → still fire for "custom").
2. **Execution**: on fire, call the Phase 5 notification service (in-app + optional push per preferences) using reminder type + title; do **not** email unless preferences set (keep it conservative).
3. **CRUD integration**: keep existing reminder routes; re-validate `date`/`time` (future times; prevent past), keep `frequency` behavior documented; ensure create/update go through one helper used by both the API and the appointment auto-reminder.
4. **Appointment wiring**: change appointment create/update to create/update reminders via the reminder service (fixes the wrong-reminder `updateMany` bug); cancel appointment → cancel/delete its reminder.
5. **Dedup + failed jobs**: notification-service dedupKey `reminder:<id>:<fire-time>` prevents double-fires; scheduler marks job scope atomically (e.g. claim via `findOneAndUpdate` on a scheduler-run marker or `isCompleted`/`nextRunAt` field) to avoid double-execution across restarts.
6. **Restart/recovery**: derive jobs from DB on boot (no in-memory-only state) → missed due reminders on restart can fire on first tick (with dedup window guarding against spam); a `schedulerRunAt`/`nextRunAt` field or a scheduler state doc for idempotency.
7. **Backfill migration guard**: existing reminders already in DB start working without manual migration (missing `nextRunAt` → treat as due/eligible).

## 4. Dependencies
- Phase 5 (notification core — the scheduler's firing target).
- Phase 6 optional (push channel for reminders).

## 5. Files/modules likely affected
- Backend: new `backend/services/reminder-scheduler.service.js`; `backend/controllers/reminder.controller.js`; `backend/routes/reminder.routes.js`; `backend/controllers/appointment.controller.js`; `backend/models/Reminder.js` (add `nextRunAt`/`lastFiredAt` if used); `backend/server.js` (start scheduler; graceful shutdown hook).
- Phase 5 notifications: type/category additions (`feeding`,`walking`,`medicine`,`exercise`, etc.).

## 6. Validation/testing
- Create reminders with each frequency; verify due firing within the tick interval; verify recurring recomputation; verify `once` completes.
- Create + cancel an appointment → reminder created/cancelled correctly (regression test for the former wrong-reminder bug).
- Restart the container mid-window → no duplicate notifications (dedup) and due items still processed.
- Failed-job scenario (e.g., notification service throws) → logged, reminder not lost, retried next tick.

## 7. Completion criteria
- Scheduler runs in the container, fires on schedule, handles all frequencies.
- Notification + optional push triggered with dedup.
- Appointment-reminder integration correct.
- Restart/recovery demonstrated (no duplicate spam, no lost due items).

## 8. Risks and compatibility concerns
- Single-process cron: only ONE backend replica must run the scheduler (document; deployment scale-out needs a lock/flag).
- Express dev restart (`nodemon`) spawns multiple instances → guard with env `ENABLE_SCHEDULER` flag (default on for `npm start`).
- Timezone: store/interpret reminder times consistently (document server TZ; store UTC in DB).

## 9. Checkpoint requirements
- ✅ All frequencies fire + recur correctly; dedup verified.
- ✅ Appointment↔reminder lifecycle regression-tested.
- ✅ Restart/recovery verified.

## 10. Phase 7 status — ✅ COMPLETED (branch `enhancement/famipet`, tag `phase7-reminder-scheduler`)

**What shipped**
- `backend/models/Reminder.js` extended additively: `timezone` (IANA, default `"UTC"`), `nextRunAt`, `claimedUntil`, `lastFiredAt`, `lastNotificationId`, `lastStatus` (`pending|fired|failed|skipped|skipped-no-user|skipped-no-pet`), `lastError`, `failedAttempts`, `source` (`manual|appointment`, default `manual`), `sourceId` (ObjectId). Exports `REMINDER_STATUSES`. New indexes (verified in `petDB`): partial `{isActive,isCompleted,nextRunAt}` for active-uncompleted scans; **unique partial** `{user,source,sourceId}` on `sourceId.$type:'objectId'` (one reminder per appointment, no doubles); `{user,isActive,date,time}`.
- `backend/services/reminder.service.js` (new): pure, deterministic timezone-aware scheduling core shared by the API and the appointment producer — `zonedToUtc` (Intl offset iteration; DST fall-back resolves to the EARLIEST matching instant), `isValidTimeZone` (Intl round-trip — `Intl.supportedValuesOf('timeZone')` is NOT usable because it omits aliases like `UTC`/`Etc/UTC`), strict 24h `timeError` (`HH:mm` only — 12h/`24:00`/non-padded rejected, matching frontend `<input type="time">`), `computeNextRunAt` (once = exact instant, past allowed → overdue; recurring = first occurrence strictly after now, historical cycles skipped — no replay/burst; monthly day-clamp; 4000-iteration guard), `advanceOccurrence`, appointment helpers `upsertAppointmentReminder`/`rescheduleAppointmentReminder`/`cancelAppointmentReminder` + `appointmentTitle` (precise `source: appointment` + `sourceId` linkage; best-effort legacy fuzzy fallback for pre-linkage rows).
- `backend/services/reminder-scheduler.service.js` (new): **out-of-band poller, not `node-cron`** (decision below). Env knobs: `REMINDER_POLL_INTERVAL_MS` (default 30000), `REMINDER_BATCH_LIMIT` (100), `REMINDER_CLAIM_TTL_MS` (120000), `REMINDER_MAX_ATTEMPTS` (3). Boot pass **materializes** legacy rows without `nextRunAt` (once → its past instant = due/overdue; recurring → first future occurrence). Due query and the claim take are gated by `$and` of two `$or` groups (`nextRunAt<=now` versus `claimedUntil` open-or-expired) — a JS duplicate-key `$or` had silently dropped the `nextRunAt` condition (bug fixed). Claims are atomic `findOneAndUpdate` lease-takes; stale claims reclaimed by TTL. Per fire: user/pet resolution (missing user → `skipped-no-user` + deactivate; missing/inactive pet → once deactivates / recurring advances with `skipped-no-pet`), then `notificationService.createNotification` with `dedupKey reminder-fire:<id>:<occurrenceMs>` (7d window). Outcome bookkeeping: **delivered** → recurring advances one interval from the fired occurrence (`now=occurrence+1`) or once completes (`nextRunAt:null`); **suppressed** (preference-off / dedup / in-app-off) → occurrence consumed (`lastStatus:"skipped"`) and advances/completes — never spins; **failure** (`success:false`) → stays due, `failedAttempts++`, deactivates at `REMINDER_MAX_ATTEMPTS`. `start()` after Mongo connect, `stop()` on SIGTERM/SIGINT.
- `backend/controllers/reminder.controller.js`: create/update validate timezone (`isValidTimeZone`) and strict time; `nextRunAt` always recomputed through `computeNextRunAt`; any schedule-affecting change resets `failedAttempts`/`lastError`/`lastStatus` and clears `claimedUntil`; time-only edit preserves date; mark-completed and the `complete` endpoint null `nextRunAt`; delete removes the row.
- `backend/controllers/appointment.controller.js`: booking → `upsertAppointmentReminder` (once, UTC, exact slot, linked by sourceId), reschedule → `rescheduleAppointmentReminder`, cancel → `cancelAppointmentReminder` (deactivate). The old fuzzy `updateMany` (title+pet+slot) that could retarget the wrong reminder is removed.
- `backend/server.js`: starts the scheduler after DB connect; graceful stop on SIGTERM/SIGINT. `backend/controllers/admin.controller.js` `deleteUser` also removes the user's reminders. `backend/Dockerfile` already `COPY services ./services` (verified) — new service files ship with no Dockerfile change.

**Decisions / deferrals (recorded)**
- **Poller, not `node-cron`**: jobs are derived from DB state and claimed atomically, so restart-recovery is implicit and multi-replica double-fire is impossible (leases), matching the plan's "job scope atomically" requirement better than a cron schedule. Single-replica note from plan §8 still documented; the lease mechanism makes even that safe.
- Scheduler sends in-app (+ optional push exactly per Phase 5/6 preferences) — never email. Once reminders with past dates stay eligible (overdue → fires once); the plan's "reject past date" wording is superseded by this documented overdue semantics (legacy seed data depends on it).
- Preference-off/dedup/in-app-off occurrences are CONSUMED, not retried (only real failures retry) — avoids redelivery loops and scheduler spin.
- Known consequence: `user@example.com` has the reminder notification-type disabled, so its two seeded recurring reminders (Morning walk daily / Heartworm monthly) will be consumed as `skipped` at their next due time — intended policy, not a defect.
- Manual desktop/mobile push confirmation stays a real-user/browser-side item (same posture as Phase 6); delivery pipeline itself is covered by the Phase 6 mock-HTTP push probe + Phase 5 in-app delivers.

**Validation run (2026-09-20, live stack)**
- `node --check` on all 7 touched backend files.
- In-container deterministic probe (65 checks, 0 failed; injected `now`, monkeypatched `createNotification`): tz/occurrence math (UTC/Etc-UTC alias, NY EDT→EST, Kolkata +5:30, DST fall-back earliest, once past/future, daily/weekly/monthly clamp), legacy materialization (no back-fire), due-gating double-`$or` regression, advance-by-one, preference-suppressed no-spin, failure→retry→deactivate@3, claim leases, concurrent passes exactly-once, batch cap, missing user/pet, inactive/completed ignored, real delivery + dedup re-fire.
- API suite (**55 checks, 0 failed**): auth 401s; validation 400s (missing title/type/date, 12h, non-padded, `24:00`, bad IANA, bad frequency); once exact `nextRunAt` (`2026-09-30T09:15:00Z`), NY Nov-1 → `12:00Z`, Kolkata 20:00 → `14:30Z`; ownership isolation (cross-user list/update/complete/delete 404, foreign-pet 404); update title / reschedule recompute / time-only edit / completed-null / complete endpoint / delete; appointment x2 same pet+type different slots → both linked (once+UTC+slot), shared title+pet (the old ambiguity), reschedule moves only its own reminder, cancel deactivates only its own; **real-time**: a due-in-60s reminder was fired by the live poller with notification linkage and the completed row asserted.
- Phase 6 regression suite re-run green (**45/45** after restarting the backend to clear the login/signup rate-limiters consumed by repeated suite batches — no product change).
- Indexes verified in `petDB` (`reminders`: partial scheduler index; unique partial `user+source+sourceId`; timeline index).
- E2E: stack rebuilt + healthy; `/api/status` + `/` 200 over nginx `:8080` AND public tunnel (`https://famipet.catlium.in`); no errors in backend logs.
- Live observation recorded: the real user created a once grooming reminder on the production stack; the scheduler fired it on time and delivered the in-app notification (`lastNotificationId` present, reminder completed) — genuine happy path outside the harness, preserved untouched.
- DB restored: 13 throwaway `phase6.*`/`phase7.*` test users + all their pets/reminders/notifications/preferences/appointments purged; seed users, `user@example.com`'s two materialized reminders, and the live owner's reminders all intact.

**Commits/tags**: checkpoint commit `Phase 7: reminder scheduler (model, services, controllers, graceful lifecycle)`, tag `phase7-reminder-scheduler`.

---

# Phase 8 — Pet Care Reminder System

> **Scope change recorded:** the original plan for this phase was *Notification Event Integration* (wiring every existing domain through the Phase 5 service). Executing phases sequentially, the work that actually shipped first is the **Pet Care Reminder System** — a rich, pet-attached reminder UX layered on the Phase 7 scheduler (categories, repeat rules, priorities, per-reminder notification toggles, and a full reminders page). The original event-integration plan was preserved as a **Deferred backlog** in §10 below (nothing lost) and was subsequently implemented as a **second Phase 8 delivery** under checkpoint tag `phase8-notification-events` — see §10.

## 1. Objective
Turn the Phase 7 scheduler's raw reminders into a real user-facing feature: pet-attached reminders with meaningful categories, flexible repeat rules, priorities, and per-reminder notification control — surfaced on a dedicated Reminders page (sections, filter tabs, calendar, search) and wired to the scheduler/notifications.

## 2. Current-state considerations
- Phase 7 delivered the engine: `Reminder` model, tz-aware `reminder.service.js`, poller `reminder-scheduler.service.js`, appointment linkage. Reminders were inert, plain records with no UI.
- `Reminder.type` supported `feeding, medicine, vaccination, grooming, appointment, exercise, custom`; frequencies `once, daily, weekly, monthly`; no priorities, no per-reminder notification toggle, no every-N-days / selected-weekday recurrence.
- `GET /reminders` returned only active reminders (dashboard contract — must stay).

## 3. Implementation tasks
1. **Model/validation** (`backend/models/Reminder.js`, `backend/utils/validation.js`): add types `droplet` (water) and `bath` (additive only); frequency `interval` (every N days) plus selected-day weekly via `repeatInterval` (int 1–365) and `daysOfWeek` (ints 0=Sun..6=Sat, ≤7 distinct); `priority` enum `low|normal|high`; `notificationEnabled` bool (default true).
2. **Controller/list** (`backend/controllers/reminder.controller.js`): `validateScheduleConfig` (interval bounds + weekday array rules) and owned-pet checks; create/update rebuild `repeatInterval`/`daysOfWeek` per chosen non-default frequency; `GET /reminders?filter=active|completed|inactive|all` (default **active** — dashboard unchanged), list payloads add `effectiveNext` for recurring display.
3. **Scheduler** (`backend/services/reminder-scheduler.service.js`): honor `notificationEnabled:false` → consume each occurrence as `skipped` without creating a notification (silent tracking — no scheduler spin); weekly recurrence uses `daysOfWeek` when non-empty.
4. **Frontend page** (`frontend/pages/reminders.html`): rework the static demo page into a live one — stats (`upcoming/completed/overdue/total`), search, filter tabs (pending/completed/inactive), sectioned list, mini calendar with per-type color events, and an add/edit modal (pet select, type select, date, time, repeat rule, priority, notification toggle, notes).
5. **Frontend JS+CSS** (`frontend/js/reminders.js`, `frontend/css/reminders.css`): full state + render pipeline, `TYPE_META` (9 type labels/icons/colors), sections with 4-item cap + View All, calendar month navigation, 3-dot action menu (complete/restore/activate/deactivate/edit/delete), modal validation, matching styles.

## 4. Dependencies
- Phase 7 (scheduler + tz service), Phase 5/6 (notification delivery when `notificationEnabled`).

## 5. Files/modules likely affected
- Backend: `backend/models/Reminder.js`, `backend/utils/validation.js`, `backend/controllers/reminder.controller.js`, `backend/services/reminder-scheduler.service.js` (+ Phase 5 notification re-use).
- Frontend: `frontend/pages/reminders.html`, `frontend/js/reminders.js`, `frontend/css/reminders.css`.
- Docs: `ROADMAP.md`, `BASELINE.md`.
- Tooling: `compose/scripts/phase8-reminders-api.cjs`, `compose/scripts/phase8-scheduler-check.cjs` (reusable in-container suites).

## 6. Validation/testing
- Create reminders for each frequency and rule variant; assert `repeatInterval`/`daysOfWeek` validations (non-integer, <1, >365, >7 weekdays, duplicates).
- `GET /reminders?filter=` matrix — active default, completed, inactive, all; ownership isolation; `effectiveNext` present for recurring.
- `notificationEnabled:false` → occurrence consumed silently (no notification).
- Weekly with `daysOfWeek` fires only on selected weekdays.
- Frontend: every action wired to the API and the page re-renders.

## 7. Completion criteria
- Reminders page is fully functional against the API (create/edit/complete/activate/deactivate/delete, search, tabs, calendar, stats).
- Backend + frontend suites green; page served correctly through nginx.
- No regression to dashboard (`GET /reminders` default active unchanged).

## 8. Risks and compatibility concerns
- `GET /reminders` default must stay **active** (dashboard + existing callers). `filter=all` is opt-in.
- Enum values are additive only — `droplet`/`bath`/`interval` must never reorder or rename existing values.
- `notificationEnabled:false` semantics documented: silent tracking, no notification, occurrence still consumed (no scheduler spin).

## 9. Checkpoint requirements
- ✅ API suite (59 checks) + scheduler probe (6 checks) green against the live stack.
- ✅ Frontend page served via nginx `:8080` with all Phase 8 markers and no JS errors (`node --check` clean).
- ✅ Backend left green; Phase 5/6/7 regression suites still pass.

## 10. Phase 8 status — ✅ COMPLETED (branch `enhancement/famipet`; two checkpoints: tag `phase8-pet-care-reminders`, then tag `phase8-notification-events`)

**What shipped**
- Backend: `Reminder` model + `utils/validation.js` add types `droplet`/`bath`, frequency `interval` + `repeatInterval` (1–365), `daysOfWeek` (0..6, ≤7 distinct), `priority` (`low|normal|high`), `notificationEnabled` (default true). Controller: `validateScheduleConfig` + owned-pet guard on create/edit, `filter` query (`active` default | `completed` | `inactive` | `all`), `effectiveNext` in list payloads. Scheduler: `notificationEnabled:false` → silent consume; weekly honors `daysOfWeek`.
- Frontend: `pages/reminders.html` live (stats `upcoming/completed/overdue/total`, search, filter tabs, sections with 4-cap + View All, calendar w/ per-type colors + today ring + month nav); `js/reminders.js` rewritten (state, `TYPE_META`, modal validation + Esc/outside-click handling, 3-dot menu actions); `css/reminders.css` Phase 8 styles. Dashboard backward-compat verified (`GET /reminders` default active; `fmtDate`/`fmtTime` handle `HH:mm`).
- Type map: feeding/Food(green), exercise/Walk(blue), droplet/Water(blue), medicine/Medicine(pink), grooming/Grooming(blue), bath/Bath(purple), appointment/Vet Checkup(purple), vaccination/Vaccination(green), custom/Custom(orange).

**Decisions / deferrals (recorded)**
- **Scope change**: the original "Notification Event Integration" plan was implemented as a second Phase 8 delivery (checkpoint `phase8-notification-events`, full event inventory + validation in §10).
- `GET /reminders` default stays **active** for dashboard compatibility; the page requests `?filter=all` and sections client-side.
- Repeat payload rules: `repeatInterval` sent only when `frequency:interval`; `daysOfWeek` sent only when `frequency:weekly`; other frequencies normalize server-side.
- Frontend deliberately omits `timezone` → server default `UTC` (consistent app convention, matches Phase 7 tests).
- `notificationEnabled:false` still consumes occurrences as `skipped` (silent) — no delivery, no scheduler spin, by design.

**Validation run (2026-09-20, live stack)**
- `node --check` on all touched backend files + rewritten `frontend/js/reminders.js`.
- API suite `compose/scripts/phase8-reminders-api.cjs`: **59 checks, 0 failed** — filter matrix incl. default-active, `effectiveNext`, repeat/interval/weekday validation 400s, priority/notificationEnabled validation, owned-pet guards, ownership isolation, update recompute, complete/activate/deactivate lifecycle, cross-user 404s.
- Scheduler probe `compose/scripts/phase8-scheduler-check.cjs`: **6 checks, 0 failed** — silent-consume for `notificationEnabled:false`, weekly weekday recurrence, interval recurrence.
- Phase 5/6/7 regression suites still green (in-app delivery + push pipeline untouched by Phase 8 deltas).
- E2E: stack rebuilt + healthy; `pages/reminders.html`, `js/reminders.js`, `css/reminders.css` served 200 via nginx `:8080` with the Phase 8 DOM/JS markers present; `docker compose ps` all healthy; dashboard loads (backward-compat call shape intact).
- Schema changes all additive — no migrations required; indexes verified in `petDB`.

**Deferred backlog — Notification Event Integration (original Phase 8 plan) — ✅ IMPLEMENTED (checkpoint `phase8-notification-events`)**
- Wired the remaining domain events through the shared Phase 5 service (Phase 6 push for free) with `dedupKey`s + preference respect. New additive types/categories `community`/`lost_found`/`pet` in `NOTIFICATION_TYPES` (+`pet` category) mirrored across `Notification.js`, `utils/validation.js`, `frontend/js/notifications.js`. `pushTargetUrl` maps `appointment`/`community`/`lost_found` deep links.
- **Event inventory (all with server-derived recipients — the client never picks the recipient):**
  - Pet mgmt: `pet-created-<id>` (owner).
  - Health: `health-record-created-<id>` (owner, references the pet).
  - Vaccination: `vaccination-created-<id>` (owner); `vaccination-status-<id>-completed` on the Pending→Completed transition only (re-save of Completed is silent).
  - Appointments: `appointment-booked-<id>` (already existed — kept, regression-tested); `appointment-rescheduled-<id>` fires **only** when date/time actually move (symptom/notes edits stay silent); `appointment-cancelled-<id>`.
  - Lost & Found: `lostfound-created-<id>` (reporter confirmation); `lostfound-status-<id>-<status>` (admin resolve → reporter, priority `high`).
  - Adoption: `adoption-created-<id>` (applicant submission); `adoption-status-<id>-<status>` (applicant — kept from Phase 5); `adoption-owner-status-<id>-<status>` **pet owner informed** (skipped when the owner is the applicant).
  - Community: `community-comment-<postId>-<commentId>` + `community-like-<postId>-<actorId>` (author only, self-comments/self-likes silent, repeat likes deduped); `community-post-status-<postId>-<bool>` (admin hide/restore → author).
  - System/account: `user-welcome-<id>`, `user-verified-<id>`, `password-changed-<id>`; `user-block-<id>-<true|false>` (admin block/unblock → affected user, priority `urgent` when blocked).
- **Explicitly NOT in scope (recorded):** pet deleted; health/vaccination update/delete; appointment partial (notes-only) edits; self like/comment; lost&found "matching"/subscriptions (nothing invented); community post-create; admin-side "new application" alert; forgot/reset-password via notifications (email-only flows). Default dedup window is the service default (1h; 7d cap).
- **Validation run (2026-09-20, live stack):**
  - `node --check` clean on all 8 touched controllers + model + validation + notification service + `frontend/js/notifications.js`.
  - New suite `compose/scripts/phase8-notification-events.cjs`: **63 checks, 0 failed** — per event group: type/category/dedupKey/title/reference correctness, recipient isolation (no cross-user leakage), preference gating (`channels.inApp=false` and `types.community=false`), dedup idempotency (repeat like, Completed→Completed), and priority checks.
  - Phase 8 reminder regression: `phase8-reminders-api.cjs` **59 checks, 0 failed**; `phase8-scheduler-check.cjs` **6 checks, 0 failed** (silent consume + scheduler untouched).
  - E2E: stack rebuilt (`backend` + `frontend`) + healthy (`docker compose ps` all healthy); frontend 200 via nginx `:8080`; public HTTPS 200 at `https://famipet.catlium.in`; `/api/*` proxied through nginx (401 on protected route = routing OK).
  - DB hygiene restored post-tests (3 real users, 0 `@famipet.test` fixtures; fixture notifications/reminders/adoptions/etc. purged).

---

# Phase 9 — Diet & Nutrition

## 1. Objective
Implement **pet-specific** diet and nutrition functionality (data per pet; not global). Feeding schedule + diet info, integrated with reminders (Phase 7) and notifications (Phase 5/8). Nutritional content must be informational only — **no diagnosis or prescription claims**.

## 2. Current-state considerations
- **No nutrition feature exists.** `Pet` model has `species, breed(ref), age (Number), weight (Number), vaccinated, health (unused/default "Good"), images`. No activity-level field, no food data, no nutrition model.
- Reminder types already include `feeding` and `medicine` (reuse for feeding schedule timings).
- The current UI has **no nutrition/diet page or section**; My Pets' static page shows generic tips images (`assets/images/my-pet/pet-tip.png`).
- Lost&Found `age` is a String; Pet `age` is Number — keep pet nutrition keyed on the Pet record fields.

## 3. Implementation tasks
1. **Data model**:
   - New `NutritionPlan`/`PetDiet` model: `user (ref, required), pet (ref, required, unique per pet?)`, fields: `foodType` (enum e.g. dry/wet/raw/homemade/mixed), `brand`, `dailyPortionGrams` (Number min>0), `mealTimes [String]`, `treatPolicy`, `waterIntakeWarn`, `notes`, `allergies [String]`, `lastUpdatedBy`.
   - Optionally add `activityLevel` enum (`low/moderate/high`) and `specialDiet` flags to `Pet` (schema additive).
   - Store only **user-entered** values; recommendation engine (Phase 11) may propose but must not write silently.
2. **API** + validation: `GET/PUT /api/pets/:id/diet` (or `/api/diet` with pet id) — owner-scoped (`Pet.findOne({_id, owner:req.user._id})` pattern, consistent with health/vaccination controllers). Validate servings/portion bounds, food type enum, meal times format; authorize pet ownership.
3. **Feeding schedule**: derive Feeding reminders from `mealTimes` + recurrence via the Phase 7 reminder service (`feeding` type). Schedule created/updated when meal times change; cancellations when diet removed.
4. **UI**: add a diet section in the pet management/health UI (`pages/mypet.html` or `health.html`; new `js/diet.js` or extension of `mypet.js`); display selected food info, portion, meal times, edit form; keep visual style consistent.
5. **Content safety**: any recommendation copy must be informational; add a disclaimer; never present vet advice as diagnosis/prescription. No automated medical claims in UI copy.
6. **Notifications**: meal-time feeding reminders come from Phase 7/8 (`feeding` reminders already fire); a "diet updated" notification is optional/conservative and would ride the Phase 8 Notification Event Integration delivery (checkpoint `phase8-notification-events`) — not spec'd until the Phase 9 diet module exists.
7. **Authorization/validation** done in service/controller consistent with existing patterns.

## 4. Dependencies
- Phase 5 (notifications), Phase 7 (feeding reminders from meal times), Phase 8 (pet care reminder engine + Notification Event Integration delivered under `phase8-notification-events`).
- Order note: feeding reminders ship via Phase 7/8; the general Notification Event Integration scope is delivered (Phase 8, checkpoint `phase8-notification-events`).

## 5. Files/modules likely affected
- Backend: new `backend/models/PetDiet.js` (or `NutritionPlan.js`), new `backend/controllers/diet.controller.js`, new `backend/routes/diet.routes.js`, `backend/models/Pet.js` (activityLevel etc. if added), `backend/server.js` mount, validation additions in `utils/validation.js`.
- Frontend: `frontend/pages/{mypet,health}.html` + related JS (`mypet.js`/`health.js`), `frontend/css/*`, possibly a new `frontend/pages/diet.html`.

## 6. Validation/testing
- Create diet for pet A; assert pet B never sees it (403), anonymous gets 401/404.
- Changing meal times updates/creates/deletes the associated feeding reminders.
- Feeding reminder fires (Phase 7) → notification (Phase 5) respecting preferences.
- Input validation (grams bounds, enum values, time format) exercised.
- UI shows placeholder/empty state cleanly when no diet exists.

## 7. Completion criteria
- Per-pet diet persists, editable, validated, authorized.
- Feeding schedule drives reminders + notifications.
- Informational-only copy with disclaimer; no medical claims.

## 8. Risks and compatibility concerns
- Feeding "missed feeding" is in Phase 8 event-integration scope and must be explicitly opt-in when wired (Phase 9 consumer); avoid nagging by default.
- Don't hardcode breed-specific nutritional tables unless sourced — recommend user-entered + informational text only (Phase 11 may propose, user confirms).
- Adding fields to `Pet` is additive; ensure no breakage of existing pet create/update allowlists.

## 9. Checkpoint requirements
- ✅ Pet-specific diet end-to-end; reminders/notifications wired.
- ✅ Authorization + validation tests pass.
- ✅ Informational-copy compliance (disclaimer present).

## 10. Phase 9 status — ✅ COMPLETED (branch `enhancement/famipet`, tag `phase9-diet-nutrition`)

Delivered the **pet-specific Diet & Nutrition** module end-to-end: one `PetDiet` profile per pet, owner-scoped, fully validated, with meal times upserted into the Phase 7 scheduler as **daily `feeding` reminders** through the shared `reminder.service` producer (the same path the scheduler already fires), and a conservative "Diet profile created" notification via the Phase 5 Notification Event delivery (created once, minor edits silent, delete silent).

- **Backend**: new `backend/models/PetDiet.js` (`user` + `pet` unique index, `foodType` enum `dry|wet|raw|homemade|mixed`, `brand`, `dailyPortionGrams` 1–20000, `timezone` (IANA, default `UTC`), `activityLevel` enum `low|moderate|high`, `allergies[]`, `treatPolicy`, `notes`, `meals[]` subdocs `{_id:true, label, time HH:mm, portionGrams 0–20000, isActive}`). New `backend/controllers/diet.controller.js` + `backend/routes/diet.routes.js`: `GET /api/diet`, `GET /api/diet/:petId` (returns `diet:null` + empty-state guidance on first use), `PUT /api/diet/:petId` (upsert, `Pet.findOne({_id, owner})` owner-guard, checkpoint vs DB to decide created), `DELETE /api/diet/:petId` (owner-guard, silent). Guidance is **informational-only**: `backend/utils/dietGuide.util.js` builds deterministic `{completion, summary, notes, gaps, feedsPerDayLabel, disclaimer}` from user-entered values + pet profile (no fabricated kcal/claims); disclaimer always present.
- **Reminder integration**: `Reminder.source` enum extended additively to `["manual","appointment","diet"]`; `reminder.service` gained `upsertFeedingMealReminder`, `deactivateFeedingMealReminder`, `deactivateDietMealReminders`. Each **active** meal subdoc owns exactly one daily `feeding` reminder via unique `{user, source:"diet", sourceId: meal._id}`; meal `_id`s are preserved across edits only when the client forwards a legitimately-owned id; removed/inactive meals → `isActive:false, lastStatus:"skipped"` (notifications off = silent occurrence consumption, never a retry loop). `server.js` mounts `/api/diet` after reminders. Meal-time → reminder sync is best-effort (`try/catch`, never blocks the diet save).
- **Frontend**: `health.html` nutrition mock card (which showed identical content for every pet, driven by a JS name-swap) replaced with a real per-pet card (`renderNutrition()` builds a dynamic conic-gradient completion circle + summary/tags/notes/gaps/disclaimer) plus a full `#dietModal` editor (food type/brand/daily portion/activity/timezone/allergies/treat policy/notes + dynamic meal rows with per-meal time & portion, max 8 meals). Wired via `health.js`: `dietsMap` cache keyed by pet, `fetchDiets()/renderNutrition()` refresh on pet change, `saveDiet/removeDiet` PUT/DELETE, Escape-closes modal. Styling in `health.css` (.nutrition-*, .meal-row, .modal-actions/.modal-cancel/.diet-save-btn) reusing the existing `.modal-backdrop/.modal-sheet` + `.form-row` + `.save-record-btn` patterns.
- **Tests**: `node --check` clean on every touched file (Models, controller, routes, utils, reminder service, `server.js`, `frontend/js/health.js`).
  - New `compose/scripts/phase9-diet-api.cjs`: **58 checks, 0 failed** — auth (anonymous 401, owner-only 403, cross-user isolation A/B), validation (enum/gram bounds/integer/time/array/size 9× meal limit, timezone, activity), full profile (completion 100%, guidance populated, 2 meals → 2 reminders linked to meal ids with matching times + `nextRunAt`), conservative notification (exactly 1 "Diet profile created" per pet on create — dedup/`pet-created` filtered, minor edit silent, reminder row churn-free), meal edits (in-place reminder update + reschedule, removed meal deactivated, re-add restores), preference gating (`types.pet=false` suppresses the event but reminders still schedule), delete (diet removed, all feeding reminders deactivated, silent, double-delete 404). Suite self-purges prior `p9-*@famipet.test` fixtures and cleans up.
  - New `compose/scripts/phase9-diet-scheduler.cjs`: **19 checks, 0 failed** — full producer loop: `PetDiet` meal → `upsertFeedingMealReminder` (no duplicate on re-upsert) → `processDueReminders` fires → in-app Notification (type/category `reminder`, references the reminder, `metadata.reminderType=feeding`, message "…'s Food reminder is due (<date> at <time>).", pet name + diet title) → reminder advanced to next daily occurrence (`lastStatus:"fired"`); second scenario: `channels.inApp=false` → occurrence consumed silently (`lastStatus:"skipped"`) with no notification and correct daily advance (no retry loop).
  - **Regression green**: `phase8-reminders-api.cjs` 59/0, `phase8-notification-events.cjs` 63/0, `phase8-scheduler-check.cjs` 6/0.
- **E2E**: stack rebuilt (`backend` + `frontend`) + healthy (`docker compose ps`); new markers present in `health.html` served via nginx `:8080` (200) and public HTTPS `https://famipet.catlium.in/pages/health.html` (200).
- **DB hygiene restored**: 0 `@famipet.test` fixtures remain (including a pre-fix crashed run's leaked user), 0 `petdiets` left behind, real data untouched.

---

# Phase 10 — AI Tool Layer

## 1. Objective
Refactor/extend AI (PetGPT) into a **controlled, tool-based architecture** where AI can call application tools but **never touches MongoDB directly**. Reuse existing business logic and validation; strict authorization on every tool.

## 2. Current-state considerations
- `ai.controller.js` calls Gemini directly for chat; `getPetAdvice` reads the user's pets (`Pet.find({owner})`) — read is allowed but ungoverned by a tool layer.
- All the target tools wrap **existing** controllers/services, many already with ownership checks (pets, appointments, reminders; diet comes from Phase 9).
- Validation/allowlist utilities exist in `utils/validation.js` (`pickFields`, `stringOrUndefined`, enum constants) — tools reuse these.
- No generic service layer exists yet for pet/appointment/reminder operations (logic lives in controllers). Create thin services or wrap controller functions for tool reuse.

## 3. Implementation tasks
1. **Tool registry**: `backend/services/toolLayer.js` defining a declarative map of tools with JSON schema-ish input descriptions. Tools (exactly the required set, no extras — `delete_pet`, appointment tools and `delete_reminder` were cut per task §2):
   - Reads: `get_pet`, `get_diet`, `get_appointments`, `get_reminders`.
   - Mutations: `create_pet`, `update_pet`, `update_diet`, `create_reminder`, `update_reminder` — all owner-scoped and confirmation-gated.
   - All wrap the shared application services (pet/diet/reminder/appointment) extracted verbatim from the controllers; ownership checks reuse `ownedPetResult`.
2. **Execution pipeline**: `runTool(name, user, args)`:
   - Validate args (types/enums/lengths via existing validation utils).
   - Authorize: resolve target resource owner; enforce `Pet.findOne({_id, owner:req.user._id})`-style checks; user-scope everything to `req.user._id`.
   - Execute only through services/controllers (existing business rules run).
   - Map errors to safe messages; never leak internals.
   - Never expose DB handles/schemas to the model — the tool layer is the boundary.
3. **AI integration**: refactor `ai.controller.js` to: (a) answer questions *without* tool calls for pure Q&A; (b) when the user's intent implies a data operation, have the model emit a structured tool-call request; (c) go through `runTool`; (d) destructive/sensitive results flagged for user confirmation (Phase 11 wiring).
4. **Safety**: read tools may auto-execute; **data-changing tools default to require-confirmation** (Phase 11 flow). Rate limiting per user (add per-user cap; note current global limit only). Log all tool executions (name, user, success/failure) for audit.

## 4. Dependencies
- Phase 9 (diet tools), Phase 5/7 (reminder/appointment services stable), Phase 4 baseline.

## 5. Files/modules likely affected
- Backend: new `backend/services/toolLayer.js`; thin services extracted from `pet/appointment/reminder/diet` controllers OR a `services/pet.service.js` etc.; `backend/controllers/ai.controller.js`; `backend/routes/ai.routes.js`; `backend/server.js` mount of any new services.
- Possibly `utils/validation.js` additions for tool arg schemas.

## 6. Validation/testing
- Each tool: happy path, validation failure, unauthorized resource, nonexistent resource.
- Confirm no tool function ever calls `mongoose`/models directly (code review + grep audit).
- AI emits a valid tool call → tool executes with correct user context.
- Cross-user attempt fails (403/404, no data leak).

## 7. Completion criteria
- Tool registry covers exactly the listed tools; all go through services with validation + authorization.
- AI cannot reach the DB outside the tool layer (verified by audit/architecture).
- Execution logging in place.

## 8. Risks and compatibility concerns
- Model-instructed tool calls are only as safe as the tool validation — inherit all existing controller protections; add confirmation gate for mutating tools before release.
- No new tools beyond the required list (avoid scope creep).
- Tool arg descriptions must be explicit to keep the model's calls well-formed.

## 9. Checkpoint requirements
- ✅ Full tool matrix tested (validation, auth, errors).
- ✅ "No direct DB from AI" verified (grep audit + design).
- ✅ Mutating tools flagged confirmation-required.

## 10. Phase 10 status — ✅ COMPLETED (branch `enhancement/famipet`, tag `phase10-ai-tool-layer`)

Delivered a **controlled, tool-based AI boundary**: PetGPT can only reach application data through an allowlisted server-side tool layer; every call is validated, authorized against `req.user`, routed through the shared application services (never models), audited, and (for mutations) executed only after the user confirms a single-use server-issued token. Scope was deliberately trimmed to the **required tool set only** (no `delete_pet`, no appointment tools, no `delete_reminder`) per task §2.

- **Tool registry** (`backend/services/toolLayer.js`, ~1100 lines): declarative `TOOL_SCHEMAS` for exactly **9 tools** — reads `get_pet`, `get_diet`, `get_appointments`, `get_reminders`; mutations `create_pet`, `update_pet`, `update_diet`, `create_reminder`, `update_reminder`. Every arg is allowlist-validated (types/enums/lengths/`oid`/IANA timezone/`HH:mm`/`YYYY-MM-DD`), unknown keys, Mongo operator objects and per-meal injections rejected; `geminiPropertyType` maps schemas to Gemini `functionDeclarations` exposing all props + `required` (optional params are declared, not required). Budgets: `TOOL_MAX_CALLS_PER_REQUEST=8`, `TOOL_MAX_ROUNDS=5`, 15 s per-call timeout; per-user sliding-window quota `USER_TOOL_QUOTA_LIMIT=60` / 15 min in-process; `${...}`-free.
- **Confirm/boundary design**: reads auto-execute; mutations NEVER run from model input — `runTool` mints a proposal (random 256-bit base64url token stored **only as HMAC-SHA256**; identical re-proposals are superseded so only one live token per `(user, tool, fingerprint)`), `confirmTool` atomically flips `pending→consumed` (exactly-once), re-validates + re-checks ownership, executes via the service. Cross-user confirm → 403; service-level ownership re-checks give defense-in-depth (e.g. `createReminderForUser` verifies pet ownership itself). The raw token is never passed to the model (`resultForModel` strips it).
- **HTTP API**: `POST /api/ai/tool` (proposal-mode probe, `protect`-gated), `POST /api/ai/tools/confirm`, `POST /api/ai/tools/cancel` in `ai.routes.js` via new `aiTool.controller.js` (thin HTTP mapper over the layer, zero model access). Error categories → status: validation 400, auth 401, authorization 403, not_found 404, confirmation_invalid 400, tool_unavailable 409, execution 500.
- **Services extraction** (shared with controllers, pre-existing untracked WIP finished): `services/pet.service.js`, `services/diet.service.js`, `services/reminder.service.js`, `services/appointment.service.js` (read-only), `services/health.service.js` (kept, unused by tools). Logic extracted verbatim from the controllers so both entry points run identical rules; `reminder.service` surfaced `isValidTimeZone`, `listReminders` (raw-array shape — wrapper normalizes), `createReminderForUser`/`updateReminderForUser` (`{ok,status,body}` shape unified in `normalizeMutationResult`).
- **AI loop** (`ai.controller.js`): `askPetGPT` now runs a bounded Gemini function-calling loop (≤5 rounds, ≤8 calls, `callBudget {used,max}`), pet context built via `petService.listUserPets` (limit 5) instead of a direct `Pet.find`, `getPetAdvice` routed through `petService.getOwnedPet` (behavior-identical; Pet import removed). `/ai/ask` keeps `{success, message}` and gains optional `action` (proposal with `preview` + `confirmation {id, token, expiresAt}`). `SYSTEM_PROMPT` extends with tool-use rules (proposals never auto-run; only ids seen in context).
- **Frontend confirmation UI** (`petgpt.js`/`petgpt.css`): when `/ai/ask` returns `action.requiresConfirmation`, a `⚡ Proposed action` card renders inline with preview summary + field list and **Confirm / Cancel** buttons → `POST /ai/tools/confirm` / `cancel {token}`; busy/disabled states, final status note, errors surfaced as chat messages, `annPetgptChat` persistence untouched.
- **Tests** (all `node --check` clean on every touched file):
  - New `compose/scripts/phase10-tool-core.cjs` (in-process): **75 checks, 0 failed** — registry exactness (9 tools in order, defs well-formed, optional props exposed-not-required), auth/unknown-tool/validation matrix (operator + meal-injection + banker `owner` key + enum rejected), budget gate (early `tool_unavailable`), reads auto-execute owned-only + cross-user 404, proposals never execute (`no pet created by the proposal itself`), raw token never persisted (HMAC only), `resultForModel` token-stripping, exactly-once confirm + re-confirm 400, supersede dedupe, cross-user proposal 403 + cross-user confirm 403, cancel idempotency + cancelled-token reject, `update_diet` E2E persistence, audit enum + rows.
  - New `compose/scripts/phase10-ai-tools-api.cjs` (HTTP): **29 checks, 0 failed** — anonymous 401 on all three endpoints + `/ai/ask` wiring, status mapping (409/400/403/404/400), read payload normalization, full proposal→confirm→persist (reminder + pet + update_pet optional fields), exactly-once, cancel→no-apply, cross-user confirm 403, single-use raw token returned (not a hash).
  - **Regression green**: `phase8-reminders-api` 59/0, `phase8-scheduler-check` 6/0, `phase8-notification-events` 63/0, `phase9-diet-api` 58/0, `phase9-diet-scheduler` 19/0.
- **E2E**: stack rebuilt (`backend` + `frontend`) + healthy (`docker compose ps`); nginx proxy replies 401 (auth-gated) on `/api/ai/tool`, `/ai/tools/confirm`, `/ai/tools/cancel`; `petgpt.js` serves with `addToolActionCard`, `petgpt.css` with `.tool-action-card` (200).
- **No direct DB from AI (grep audit)**: `toolLayer.js` requires only control-plane `models/ToolConfirmation` + `ToolAuditLog` (+ services/validation); `aiTool.controller.js` requires only `crypto` + `toolLayer`; `ai.controller.js` only `crypto`/`@google/generative-ai`/`validation`/`petService`/`toolLayer`.
- **DB hygiene restored**: 0 `p10c-*` / `p10a-*` `@famipet.test` fixtures remain (suites self-purge); real data untouched.
- **Notes/deferrals**: `health.service.js` remains an unused-but-valid extraction (no `get_health` tool per task §2). Per-user quota is in-process (resets on restart) — fine as a first cap; Phase 11 can move it to Mongo if needed. `Gemini`-dependent `/ai/ask` tool-loop is exercised only structurally here (no API key in CI) — the loop is regression-safe by construction (function responses go through `resultForModel`).

---

# Phase 11 — AI Recommendations & AI CRUD

## 1. Objective
Implement AI-assisted recommendations and AI-driven CRUD via the Phase 10 tool layer using an explicit **confirmation flow** for data-changing operations, and strictly informational medical content.

## 2. Current-state considerations
- PetGPT UI exists (`pages/petgpt.html`, `js/petgpt.js`); today it's chat-only, with canned vet-clinic listing fallbacks and no action-taking.
- The AI endpoints are already `protect`-gated; tool layer (Phase 10) is ready for reuse.
- Reminders/adoption etc. all have ownership checks and notification hooks (Phases 5/8) for the "after action" step.

## 3. Implementation tasks
1. **Recommendation surfaces** (informational only):
   - Pet care/diet recommendations based on pet attributes (species, breed, age, weight, activityLevel) + existing diet data (Phase 9). Always informational, with a clear "not medical advice" boundary; never diagnose or prescribe.
   - Reminder recommendations (e.g., suggest a vaccination/feeding/exercise reminder pattern given pet age/species) → presented as suggestions the user can accept.
   - Appointment assistance (e.g., "book a checkup" flow → pick vet/date via tool).
   - General PetGPT chat enhancements (keep existing answer behavior).
2. **Confirmation flow** for important data-changing operations:
   - AI recommendation → render to user with a **Confirm / Cancel** action (frontend step) → on confirm, call the AI action endpoint → `runTool` → existing service → validation/authorization → DB → notification/reminder when applicable.
   - Destructive or sensitive operations (delete pet, cancel appointment, update diet, create pet replacing data) **never run silently**.
3. **Backend**: an `POST /api/ai/action` (or extend `/ai/ask`) endpoint that accepts `{ intent, tool, args }` after user confirmation; executes via `runTool`; returns result + any created notification/reminder references.
4. **Frontend** (`petgpt.js`): render tool-confirmation cards inline (recommendation text + Confirm/Cancel); show success/error from tool result; keep chat flow working.
5. **Guardrails**: per-user AI rate limit/quotas; audit log for every executed tool; confirmation tokens/session for mutating calls (idempotency: one confirmation = one execution; dedup by request id).

## 4. Dependencies
- Phase 10 (tool layer). Notification/reminder side-effects re-use Phase 5/7/8.

## 5. Files/modules likely affected
- Backend: `backend/controllers/ai.controller.js`, `backend/routes/ai.routes.js`, `backend/services/toolLayer.js` (continue), possible `backend/services/recommendation.service.js`.
- Frontend: `frontend/js/petgpt.js`, `frontend/pages/petgpt.html`, `frontend/css/petgpt.css`.

## 6. Validation/testing
- Each recommendation type renders and, on confirm, performs the exact expected tool call scoped to the user.
- Cancel → nothing executed.
- Double-confirm → single execution (idempotent).
- Cross-user tool call via crafted args → denied.
- Medical-safety: adversarial prompts cannot produce diagnostic/prescription language surfaced as fact (content guard).
- Notifications/reminders created when the confirmed action dictates.

## 7. Completion criteria
- AI recommendations + confirmed CRUD run end-to-end through the tool layer.
- Influence on DB only ever via `runTool` + user confirmation (no silent sensitive actions).
- Informational-content compliance verified.

## 8. Risks and compatibility concerns
- Confirmation UI must be unambiguous; avoid auto-accept.
- Recommendation quality is model-dependent — present as suggestions with disclaimers.
- Keep actions limited to the pet/user's own resources.

## 9. Checkpoint requirements
- ✅ All recommendation types tested (confirm/cancel/idempotency).
- ✅ Sensitive actions never run silently; notifications/reminders wired where applicable.

## 10. Phase 11 status — ✅ COMPLETED (branch `enhancement/famipet`, tag `phase11-ai-recommendations-crud`)

Delivered **AI-assisted recommendations + AI-driven CRUD** on top of the Phase 10 tool layer, reusing its exact proposal→confirm→cancel flow (nothing bypasses the tool layer; every mutation still requires a single-use token). Recommendations are strictly informational ("not medical advice" disclaimer; no diagnosis/prescription).

- **Recommendation engine** (`backend/services/recommendation.service.js` — pre-existing untracked WIP, finished here): `buildRecommendations({user})` builds per-pet, category-stamped items from real data via shared services (`petService.listUserPets`, `dietService.getPetDiet`, `reminderService.listReminders`, `appointmentService.listAppointments`, `healthService.listHealthRecords`). Deterministic (timed) `now` comparisons where a "time since last N days" is needed; per-pet failures isolated (a broken pet row can't kill the list). Emits `{id, category, priority, title, summary, pet?, suggestedAction?}` up to `MAX_RECOMMENDATIONS`; a mutation-bearing `suggestedAction` is allowed only for Phase 10 mutation tools, targets only the owned pet, and is re-checked for ownership when the resulting proposal is minted.
- **Bugs fixed in the pre-existing engine**: (1) priority sort was silently broken — `(PRIORITY_RANK[x.priority] || 3)` coerced the `high` rank `0` to `3` (`0 || 3`), so "high" items sorted last; fixed with `?? 3` (nullish). (2) `low` task was invoked via a wrong living index after a task was marked done while iterating the same array in place — reads now guard + splice behind an index they track. Both covered by new assertions.
- **toolLayer hardening** (`backend/services/toolLayer.js`): `checkProposalReferences` now rejects a proposal at **mint time** when *any* `args.pet`/`args.petId` reference is not the caller's own pet (previously `args.pet` was only checked for `update_reminder`; `create_reminder` against another user's pet was still blocked at confirm/execution, but now fails early with 403).
- **HTTP API**: `GET /api/ai/recommendations` (protect) → `{success, recommendations, disclaimer}`; `POST /api/ai/action` (protect) accepts `{intent?, tool, args}` and is a thin alias to the Phase 10 `runTool` controller (intent ignored — the layer/args drive everything), satisfying task §3's endpoint narrative without a second execution path.
- **Frontend** (`petgpt.html`, `petgpt.js`, `petgpt.css`): a "Suggestions" side-card on the PetGPT page renders the recommendation list (category chips + priority colors, per-item `pet` attribution, informational disclaimer). Each action-bearing item gets **Accept** → `POST /ai/action` → the existing `addToolActionCard` renders the proposal card with **Confirm / Cancel** in the chat; the item is marked ✓ accepted (once) after confirm so the same underlying recommendation isn't re-offered; errors surface in the card. Reading chat (#ann), lucide initialization, and `annPetgptChat` persistence untouched.
- **Tests** (all `node --check` clean on every touched file):
  - New `compose/scripts/phase11-recommendation-core.cjs` (in-process): **38 checks, 0 failed** — auth/empty-state; deterministic + sorted output (`??` fix pinned: high item first, stable ordering); every suggested action accepted by `runTool` as a proposal, proposals never carry read/executed data, minting alone persists nothing; accepted suggestion confirms+executes exactly once (single reminder), re-confirm rejected; cross-user isolation + a null-pet reminder row doesn't break the list (per-pet isolation).
  - New `compose/scripts/phase11-recommendations-api.cjs` (HTTP): **54 checks, 0 failed** — anonymous 401 on `/ai/recommendations` + `/ai/action`; no-pets (suggestions + disclaimer, no actions); real-data suggestions (owner-scoped, species-aware dog-only exercise, no internal-field leakage, action tools are mutation-only and pet-scoped); accept→propose→confirm exactly-once + suggestion retired after confirm; identical re-acceptance supersedes (single live token, one execution); cancel blocks; injection/operator/unknown-tool → 400/409; cross-user: proposing an action on another user's pet → 403 (both `args.pet` and `args.petId`), confirming another user's token → 403; purge cleanup.
  - **Regression green** (Phase 5–10 untouched): `phase10-tool-core` 75/0, `phase10-ai-tools-api` 29/0, `phase9-diet-api` 58/0, `phase9-diet-scheduler` 19/0, `phase8-reminders-api` 59/0, `phase8-scheduler-check` 6/0, `phase8-notification-events` 63/0.
- **E2E**: backend image rebuilt + stack healthy; nginx proxy returns 401 (auth-gated) on `/api/ai/recommendations` / `/api/ai/action`; public HTTPS `https://famipet.catlium.in` returns 200 on `/` and `/api/status`.
- **Decisions / deferrals (recorded in `BASELINE.md` §26)**: per-user quota stays **in-process** (Phase 10 deferral said Phase 11 *may* move it to Mongo — decided not needed; audit log + exactly-once tokens already bound abuse; revisit only if a real quota incident appears). `get_health` tool intentionally **not** added (no `get_health` in task §2 list; `health.service.js` remains unused-but-valid). "Book a checkup" appointment flow (task §1.3) a known extension point only — scheduling UI/date selection not expanded; the recommendation surface + confirm flow are in place.
- **DB hygiene restored**: 0 fixture users / pets / reminders / diets remain (suites self-purge via `@famipet.test`); no temp debug scripts kept; real data untouched.
- **No direct DB from AI (grep audit)**: `recommendation.service.js` requires only shared services (`pet/diet/reminder/appointment/health`) + `suggestedAction` uses `toolLayer.runtool`; controllers/routes unchanged in boundary shape.

---

# Phase 12 — Existing FamiPet Bug & UX Fixes

## 1. Objective
Fix the documented existing-app issues. **Do not rewrite unrelated functionality.** Each fix is isolated, verified, and regression-tested against the rest of the app.

## 2. Current-state considerations
Each item maps to verified baseline facts (see `bakwas.md` §3/§4/§7); what must not change: the general architecture (still vanilla static frontend + Express API + nginx routing), existing API shapes, and working flows.

## 3. Implementation tasks (each isolated)

### Authentication
- **Fix login verification error / "The site can't be reached"** — root cause to confirm in Phase 4: verify/reset email links built from `FRONTEND_URL` (host/SAN + port correctness), and the frontend verify/reset pages resolving the correct API base under the new nginx/tunnel topology (`config.js`). Fix at the config/link layer; do not re-architect auth.

### Appointments
- **Prevent past appointment dates** — validate in `appointment.controller.js` create/update (block `date`/`time` in the past) + mirror in the frontend date picker.
- **Fix appointment text-box auto-scroll behavior** — frontend-only `appointments.js`/CSS fix (identify the offending element focus/scroll code; keep behavior minimal).
- **Transfer vacation information correctly to the Appointment page** — verify the actual field/flow the user refers to (unknown semantics; investigate in Phase 4 and preserve existing data) and correct the payload mapping between pages.
- **Remove Upcoming Appointments section** — remove from `pages/appointments.html` (+ its dashboard `upcomingCount`-style static display); keep booking/list flows intact.

### Pet Management
- **Redirect to Adoption after pet creation** — in `mypet.js`/`adoption.js` flow, after successful `POST /api/pets`, navigate to the adoption page (or adoption section) instead of staying.
- **Make weight handling dependent on pet type and age where required** — weight validation/UI adapts by `species` and `age` (e.g., sensible ranges per type); implement in pet create/update validation + frontend form logic; keep `weight` optional overall.
- **Pass Pet ID correctly to collar/hook functionality** — in the Pet-ID/collar flow (`mypet.js`, `pet-id.js`, `pet.controller.js` QR), ensure the correct `pet.id` is carried through the button/link handlers (fix wrong/null id passing).

### Adoption
- **Fix filter layout and visuals** — CSS-only/layout fix in `pages/adoption.html` + `adoption.js` filter UI (and `css/adoption.css`).
- **Remove default/pre-selected pet** — when opening the adoption page/modal, do not pre-select a pet (clear the initial selection state in `adoption.js`).

### Pet Health & Information
- **Make Nutrition & Diet pet-specific** — align with Phase 9 (this roadmap's diet feature); remove any global/static nutrition content; ensure the UI shows that pet's own diet data.
- **Expand breed information** — use existing `Breed` fields (species, origin, lifespan, weightRange, temperament, grooming, commonDiseases, description, images) on the breed detail page; fill missing display fields cleanly (empty-state handling; do not invent new fields).

### Lost & Found
- **Remove the Location field/feature** — remove `location` UI (form/list/detail) in `lost-found.html`/`lost-found.js` and drop the claim from new reports; decide server handling (stop accepting `location` on create/update; existing records may keep data but stop displaying — confirm approach in Phase 4).

### Dashboard
- **Fix `[Object]` rendering in the reminder section** — repair object-to-string rendering in `dashboard.js`/`dashboard-data.js` (likely a reminder/property displayed via string concatenation); render the intended string field correctly.

### Settings
- **Fix Dark Mode** — debug `theme.js`/`settings.js` dark-mode toggle (background/color application) and fix; also the `darkModeBtn` active-state + double-icon issue from the current-state report.
- **Remove "Your Pet App Info"** — remove the App Info section from `settings.html` (and its no-op handler in `settings.js`).
- **Remove "Language"** — remove the language preference control from settings UI.
- **Remove "Region"** — remove the region/country control (currently hardcoded "india") from settings UI.

## 4. Dependencies
- Phase 4 (validated baseline to reproduce bugs); fixes can be scheduled in parallel with 5–11 **only if** their files don't overlap with in-flight feature changes (e.g., dashboard reminders touch dashboard + reminder data; settings touches settings page also touched by Phase 5 preferences panel — sequence carefully). Recommended: run this phase after Phases 5–9 for notification/reminder/diet overlap, or as a distinct interlude before major features if blockers demand it.

## 5. Files/modules likely affected
- `backend/controllers/{appointment,pet,lostFound}.controller.js`; `backend/utils/validation.js`.
- Frontend: `pages/{appointments,mypet,pet-id,adoption,lost-found,settings,dashboard}.html`; `js/{appointments,mypet,pet-id,adoption,lost-found,settings,dashboard,dashboard-data,theme,config}.js`; `css/*` as needed.

## 6. Validation/testing
- Each fix has a focused test (bug reproduced on baseline → fix verified → adjacent flows regression-checked).
- No unrelated rewrites: diffs scoped to the item.

## 7. Completion criteria
- Every listed issue resolved and demonstrated; no regressions in neighboring flows.

## 8. Risks and compatibility concerns
- Removing UI sections (Upcoming Appointments, Location, Language, Region, App Info) touches markup other scripts may reference — grep before removing.
- Past-date blocking could surprise users with legitimately backdated records (e.g., vaccination log-backfilling) — scope strictly to appointments.
- Dark mode affects every page via `theme.js` — test across pages.

## 9. Checkpoint requirements
- ✅ Per-issue verification table (issue → fix → test) complete.
- ✅ Full page smoke test after the batch.

---

# Phase 13 — Final Integration & Hardening

## 1. Objective
Complete, cross-cutting regression and production-readiness validation of the whole enhanced application. This is the release-hardening gate: fix **only** integration/hardening defects found; no new features.

## Status — ✅ COMPLETED (Phase 13 final hardening)

**Code-level hardening items (all verified static — in working tree at commit time, branch `enhancement/famipet`):**

1. **Seed admin password env-driven, never logged** — `backend/utils/seedData.js` reads `SEED_ADMIN_PASSWORD` with hard exit(1)+hint when unset; seed console output prints names only (password never echoed). Env contract documented in `backend/.env.example` + `DOCKER_DEPLOYMENT.md` §env.
2. **DB-aware /api/status + healthcheck** — `backend/server.js` `/api/status` returns 200/503 by `mongoose.connection.readyState` (connected 200 / else 503, DB field reflecting state). Backend Dockerfile healthcheck probes the same endpoint, so the container is only healthy when Mongo is actually reachable. docker-compose healthcheck chain aligned.
3. **HTML app-shell no-cache + assets immutable** — `frontend/nginx.conf`: `location /` (SPA shell) → `Cache-Control: no-cache, no-store, must-revalidate` + Pragma + expires -1; `/assets/` → `public, immutable` 30d; service-worker routes no-store. Deploys can never serve stale HTML shell.

**Static verification only (no runtime this checkpoint):** Docker daemon offline (Windows host `failed to connect`) → no compose up/curl/push E2E executed in Phase 13; code verified by `git diff` review + `node --check` on all touched JS (all PASS). Runtime regression matrix deferred to next host window. Dockerfile healthcheck, nginx headers, and seed env guard verified by reading committed files (not lessened by daemon-offline).

**Checkpoint:** commit `phase13-final-hardening`, tag `phase13-final-hardening`. Rollback: `git reset --hard phase13-final-hardening`. Working tree clean; `main` untouched.


## 2. Current-state considerations
- After Phases 5–12 the stack is: nginx single proxy + backend + mongo + cloudflared (no Caddy); shared notification core; push; scheduler; diet; AI tool layer + confirmation; Phase-12 fixes.
- Hardening checklist below touches config, security boundaries, and cross-feature behavior only.

## 3. Implementation tasks — verify and fix as needed
1. **Existing features still work** (re-run the Phase 4 smoke matrix).
2. **New features work together**: notifications from scheduler/diet/AI/adoption/appointments; push + in-app consistency; preferences honored by every producer.
3. **Authentication & authorization**: all endpoints `protect`/`adminOnly` correct; new endpoints (diet, push, preferences, AI action) ownership-verified; no elevation.
4. **Docker startup/restart**: cold start, `restart`, `down/up`; scheduler initializes; healthchecks healthy; no crash loops.
5. **MongoDB persistence**: volumes persist; indexes from phases (notifications, dedup, pet-diet unique, push subscriptions) created.
6. **Nginx routing**: `/api`, `/uploads`, static, SW file, websockets (if push/UI uses), retry/timeouts sane; no double-slash issues.
7. **Cloudflare Tunnel**: up + healthy; rotation/restart behavior; no public exposure of private services.
8. **HTTPS**: certs valid at edge; no mixed content; HSTS consistent (edge or nginx), `FRONTEND_URL` matches hostname.
9. **Push notifications**: SW registered on HTTPS; subscription lifecycle + cleanup; send works; offline/permission-denied graceful.
10. **Notification preferences**: every channel/type toggle honored; "all off" respected; dedup verified across restarts.
11. **Reminder scheduling**: all frequencies; restart recovery; single-scheduler guarantee documented/verified.
12. **Scheduler restart/recovery**: no duplicate fires post-restart.
13. **Duplicate notification prevention**: dedup windows verified for every event domain.
14. **AI tool authorization/validation**: cross-user attempts denied; arg validation enforced; logs present.
15. **AI confirmation flow**: sensitive ops require confirm; single execution; cancel no-op.
16. **Error handling**: 4xx/5xx correctness reviews (from baseline bug list); user-facing messages safe; error paths don't leak internals.
17. **Security boundaries**: no CORS regressions (public hostname only + documented dev origins); upload validation intact; no secrets in images/repo (scan env/compose).
18. **Environment configuration**: `.env.example` documents all new vars (VAPID, CF_TOKEN, FRONTEND_URL…); no hardcoded secrets; `NODE_ENV` behavior correct.
19. **No unnecessary public ports**: only 80/8080 (nginx internal LAN) + tunnel; backend/mongo unpublished.
20. **No Caddy remnants**: grep for `caddy` in compose/docs/config; `certs/` archive status documented.
21. **No broken or unused configuration**: dead config files (`config/database.js`, `config/gemini.js`), unused deps, stale docs cleaned or explicitly marked.

## 4. Dependencies
- All phases complete (0–12).

## 5. Files/modules likely affected
- Configuration files (`docker-compose.yml`, `nginx.conf`, `backend/.env.example`, `frontend/js/config.js`), cleanup of dead code/docs. No new features.

## 6. Validation/testing
- Full regression matrix (features × environments public/internal).
- Security spot-checks (CORS, uploads, tools, roles).
- Restart/reboot exercise in Docker.
- Grep-based audits (no caddy, no direct-DB-from-AI, no committed secrets).

## 7. Completion criteria
- All verification bullets pass; any defects fixed and re-run.
- Repo clean of Caddy remnants, obsolete config, and dead code identified in this phase.

## 8. Risks and compatibility concerns
- Skipping cleanups can resurrect Caddy configs inadvertently — keep removal explicit.
- The single-scheduler assumption must be documented in the runbook (scale-out requires coordination).
- Cloudflare/nginx header interplay (double headers) — check once.

## 9. Checkpoint requirements
- ✅ Final regression green.
- ✅ Hardening checklist 100% verified; defects fixed.
- ✅ Release-ready documentation updated (runbook, env docs, `ROADMAP.md` status updated).

---

## Phase Dependency Graph

```
Phase 0 (baseline)
   └─► Phase 1 (docker env)
         └─► Phase 2 (caddy removal / nginx routing)
               └─► Phase 3 (cloudflare tunnel)
                     └─► Phase 4 (E2E validation)
                           ├─► Phase 5 (notification core)
                           │     ├─► Phase 6 (push notifications)
                           │     └─► Phase 7 (reminder scheduler)
                           │           └─► Phase 8 (pet care reminders)
                           │                 └─► Phase 9 (diet & nutrition)
                           │                       └─► Phase 10 (AI tool layer)
                           │                             └─► Phase 11 (AI recs & CRUD)
                           └─► Phase 12 (bug/UX fixes) — sequence carefully vs 5–9 to avoid file overlap
                                 └─► Phase 13 (final integration & hardening)
```

Notes:
- **Phase 12** depends only on Phase 4; it is listed at phase 12 by specification but can be executed as an interlude before feature work if the bug fixes unblock validation. Where files overlap with Phases 5–9 (settings/preferences, dashboard/reminders), sequence to avoid double-editing the same file concurrently.
- **Phase 9** (Diet & Nutrition) is **completed** (tag `phase9-diet-nutrition`): feeding reminders wired from `PetDiet` meal times through the Phase 7 engine, and the conservative "Diet profile created" notification (per-pet, created once, edits silent) delivered via the `phase8-notification-events` integration. Feeding reminders themselves fire in-app/push via the Phase 7/8 engine.
- Single-scheduler assumption (Phase 7) propagates to Phase 13 — one backend replica runs the scheduler.

## Cross-Cutting Rules

- **Preserve the existing application flow** wherever possible; never rewrite a working page flow as collateral.
- **Prioritize a working model quickly** — complete and validate each phase before starting the next.
- **Do not invent functionality** — every item above traces to a verified baseline fact or an explicitly labeled dependency.
- **Reuse existing services/business logic** (controllers, `utils/validation.js`, image helpers, notification service).
- **Keep changes isolated and reversible** (feature branches per phase; small commits; no unrelated refactors).
- **Do not modify source code outside `ROADMAP.md` during roadmap creation** — this document is the plan only.
- **ROADMAP.md is the single source of truth** — track phase status here as work proceeds (status column per phase).

---

*End of roadmap.*
### Phase 12 finish-up (v12.1.0-phase12-finish)
- Settings page: removed obsolete Dev Language / Region card and App Information card from settings.html (verified L&R rows 747-838 removed, APP INFO gone, page loads clean).
- settings.js pruned of references to removed controls (no dead handlers remain; page boot verified).
- Adoption filter layout verified responsive already (filters-row flex-wrap @adoption.css:521, 992px column collapse @965, pets-grid 4->3->2->1) - no redesign required.
