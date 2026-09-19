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
| Diet/Nutrition | **Does not exist.** Pet model has `species, breed(ref), age, weight, vaccinated, health(unused), status, images`. No nutrition model, no per-pet diet data, no feeding UI/endpoint. |
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

---

# Phase 4 — Environment & End-to-End Validation

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

---

# Phase 8 — Notification Event Integration

## 1. Objective
Connect the Phase 5 notification system to existing and new feature events across the whole app. Notifications must be meaningful, deduped, and preference-driven — no notification spam.

## 2. Current-state considerations
- Today only adoption-status and appointment-creation notify. This phase routes all listed domains through the shared service with `dedupKey`s.
- Events below are triggered inside existing controllers (appointments, lost&found, adoption, pets). Diet/Walking/Health events come from Phase 7 reminders and Phase 9 feeding schedules.

## 3. Implementation tasks (per domain)

**Appointments** (`backend/controllers/appointment.controller.js`)
- Created → notify user; upcoming appointment (schedule N hours/days before via reminder integration) → notify; changed → notify; cancelled → notify; relevant reminders continue via Phase 7.
- Dedup: `appointment:<id>:created|cancelled|changed`; upcoming: `appointment:<id>:upcoming:<window>`.

**Diet & Feeding** (Phase 9 data + Phase 7 reminders)
- Feeding reminders (phase 7) → notify at feeding time; diet updates (phase 9) → notify "diet updated"; missed feeding where supported (flag-based, only if explicitly configured).

**Walking** (Phase 7 `exercise` reminders)
- Scheduled walking reminder → notify at scheduled time; no invented extras.

**Health** (`health.controller.js`, `vaccination.controller.js`, phase 7)
- Veterinarian checkup reminders → notify; vaccination reminders (`Vaccination.nextDueDate` + reminders) → notify before due; medication reminders → notify.

**Lost & Found** (`lostFound.controller.js`)
- Matching new listing: on new report, notify users who favourited/subscribed to similar pets? — **not implemented in the app today; do NOT invent a subscription mechanism.** Instead notify the **reporter** on status changes (`active→resolved`) and, where a report references a user's pet (matches via species/breed?) **only if cheap and explicit** — otherwise mark as out-of-scope. Conservative default: reporter status-change notifications only.
- Status changes (`updateLostFoundStatus`) → notify reporter.

**Adoption** (`adoption.controller.js`)
- Application/status updates: applicant notified on `Pending→Approved/Rejected` (exists) — route through service; **add** pet-owner notification on status change (documented gap; owner = `Adoption.pet.owner`).

**Pet Management** (`pet.controller.js`)
- Important pet/profile events: only meaningful ones — pet created/deleted (notify owner), adoption status flip (already adoption flow). Avoid noise on simple edits; a `pet:<id>:created|deleted` with dedup.

**Other** (community/system)
- Community: only on direct user impact (comment on your post/pet? — not modeled explicitly today; keep to **admin moderation results**: your post soft-deleted/reactivated → notify). System notifications where appropriate (e.g., account blocked/unblocked).

**Cross-cutting**: register every new type/category in the Phase 5 enum (additive), wire all into preferences (each type toggleable), allow "all off".

## 4. Dependencies
- Phase 5 (core service + preferences + dedup), Phase 7 (reminder-driven events), Phase 9 (feeding/diet events — order Phase 9 before or together for feeding; otherwise feeding event wiring lands here and Phase 9 data-dependent wiring is finalized in Phase 9).

## 5. Files/modules likely affected
- `backend/controllers/{appointment,lostFound,adoption,pet,community,notification}.controller.js`, `backend/controllers/health.controller.js`, `vaccination.controller.js`.
- Phase 5 service + enum; preferences defaults.

## 6. Validation/testing
- Trigger each event and assert exactly one notification (dedup), correct recipient, correct type/category, respected by preferences, in-app + optional push.
- Test "all notifications off" state.
- Regression: existing UI still renders new types.

## 7. Completion criteria
- All listed events notify through the shared service with dedup and preferences.
- No unnecessary notifications (conservative defaults; lost&found matching explicitly not invented).
- Recipients correct (applicant, pet owner, reporter, user).

## 8. Risks and compatibility concerns
- Recipient resolution for pet-owner adoption notification requires populating `Adoption.pet.owner` — verify guard for missing owner.
- Notification volume: dedup windows and preferences must prevent spam; if a feature (e.g., lost&found matching) would require new stored state, defer (don't invent).

## 9. Checkpoint requirements
- ✅ Each domain verified end-to-end (one event → one correct notification, preference-aware).
- ✅ No spam/invented notifications.

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
6. **Notifications**: wire diet updates → Phase 8 feeding/diet events (meal-time reminders already; "diet updated" event optional and conservative).
7. **Authorization/validation** done in service/controller consistent with existing patterns.

## 4. Dependencies
- Phase 5 (notifications), Phase 7 (reminders for feeding schedule), Phase 8 (feeding events).
- Order note: Phase 8 lists feeding events — finalize meal-time wiring here; Phase 8 covers the general event plumbing.

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
- Feeding "missed feeding" (Phase 8) must be explicitly opt-in; avoid nagging by default.
- Don't hardcode breed-specific nutritional tables unless sourced — recommend user-entered + informational text only (Phase 11 may propose, user confirms).
- Adding fields to `Pet` is additive; ensure no breakage of existing pet create/update allowlists.

## 9. Checkpoint requirements
- ✅ Pet-specific diet end-to-end; reminders/notifications wired.
- ✅ Authorization + validation tests pass.
- ✅ Informational-copy compliance (disclaimer present).

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
1. **Tool registry**: `backend/services/toolLayer.js` defining a declarative map of tools with JSON schema-ish input descriptions. Tools (only those required):
   - `get_pet`, `create_pet`, `update_pet`, `delete_pet` — wrap pet controller/service logic (ownership check for update/delete; create uses existing validation).
   - `get_diet`, `update_diet` — wrap Phase 9 diet service (pet ownership).
   - `get_appointments`, `create_appointment`, `cancel_appointment` — wrap appointment logic (dates/conflicts via existing checks; cancel = existing soft-cancel/delete).
   - `get_reminders`, `create_reminder`, `update_reminder`, `delete_reminder` — wrap reminder logic.
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
                           │           └─► Phase 8 (event integration)
                           │                 └─► Phase 9 (diet & nutrition)
                           │                       └─► Phase 10 (AI tool layer)
                           │                             └─► Phase 11 (AI recs & CRUD)
                           └─► Phase 12 (bug/UX fixes) — sequence carefully vs 5–9 to avoid file overlap
                                 └─► Phase 13 (final integration & hardening)
```

Notes:
- **Phase 12** depends only on Phase 4; it is listed at phase 12 by specification but can be executed as an interlude before feature work if the bug fixes unblock validation. Where files overlap with Phases 5–9 (settings/preferences, dashboard/reminders), sequence to avoid double-editing the same file concurrently.
- **Phase 9** finalizes the feeding/meal-time wiring listed under Phase 8 (Event Integration); treat Phase 8 as the general plumbing and Phase 9 as the diet-specific consumers.
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