# FamiPet — Phase 0 Baseline & Project Status

> Single project-status document for the enhancement work (Phase 2 checkpoint).
> Companion docs: `ROADMAP.md` (work plan — single source of truth), `bakwas.md` (current-state analysis), `Step10-Report.md` (historical QA report), `DOCKER_DEPLOYMENT.md` (deployment guide).
> Last update: Phase 2 completed (see §10).

---

## 1. Snapshot (verified from the repository and runtime)

| Item | Value |
|---|---|
| Git branch | `enhancement/famipet` (created in Phase 0 off `main`; original `main` HEAD `b0e6771` "Initial Commit") |
| Checkpoint tags | `v0-baseline` (Phase 0), `phase1-docker-env` (Phase 1), `phase2-nginx-routing` (Phase 2) |
| Node (host) | v26.2.0 / npm 12.0.1 |
| MongoDB (host) | v8.3.2 via `mongod`; **listening on `127.0.0.1:27017`** — `db.runCommand({ping:1})` → `{ok:1}` |
| Docker | 29.8.0; compose stack **running and healthy** (see §3) |
| Backend env (`backend/.env`, gitignored) | `NODE_ENV=development`, `PORT=5000`, `MONGODB_URI=mongodb://localhost:27017/petDB`, `CLIENT_URL=https://172.30.240.1`, `FRONTEND_URL=https://192.168.0.103`, `BACKEND_URL=http://localhost:5000` |
| Backend npm scripts | `start` (node server.js), `dev` (nodemon), `seed` |

**No test, lint, or type-check scripts exist** for the backend. The frontend has **no `package.json`** (pure static HTML/CSS/JS, no build step) — there is nothing to build/lint/test in the frontend by tooling.

## 2. Branches

| Branch | Purpose |
|---|---|
| `main` | Divergence point (HEAD `b0e6771`). Left untouched. |
| `enhancement/famipet` | Long-lived enhancement branch (recommended by ROADMAP). All phases build here. |

## 3. Running services (verified live at the Phase 2 checkpoint, 2026-09-20)

The Docker stack is up and **healthy** with the Phase 2 topology. **Caddy is gone.** Host-side dev processes (`node`/Live Server) are **not running** at this checkpoint — Docker is the only active stack.

| Service | Where | Port | Status |
|---|---|---|---|
| `famipet-nginx` | Docker (`nginx:alpine`, proxy) | **host 80 + 8080 → container 80** (only published entry) | healthy; `/`→frontend, `/api*`, `/uploads*`→backend |
| `famipet-frontend` | Docker nginx | container 5502 (internal) | healthy (static only) |
| `famipet-backend` | Docker Node | container 5000 (internal) | healthy |
| `famipet-mongodb` | Docker (`mongo:8`) | container 27017 (internal) | healthy |
| host dev stack | — | — | **down** at this checkpoint |

### Verified responses (Phase 2, through the nginx proxy)
- `GET http://localhost/` and `http://localhost:8080/` → 200 frontend; `/js/config.js`, `/pages/...`, `/css/...`, real `/assets/...` → 200
- `GET http://localhost/api/status` → `{"status":"OK","message":"FamiPet API is running!"}` (proxied)
- `GET http://localhost/api/breeds` → `{"success":true,"count":5,...}` (DB-backed via proxy; data persisted from earlier stack)
- `GET http://localhost/api/pets` → 200; `GET http://localhost/api/nonexistent` → 404 JSON (URI preserved, no double-slash)
- `GET http://localhost/uploads/<file>` → served from backend volume (verified, then removed)
- `GET https://localhost/` → **fails (000)**: no TLS terminator in Phase 2 — public HTTPS arrives with Cloudflare Tunnel in Phase 3
- In-container backend→mongo ping by service name → `{ok:1}`

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
- **Full register → login → email-verify → dashboard E2E** requires live email delivery + verification token; not automated. Historically reported passing in `Step10-Report.md`. Still deferred (Phase 4 E2E campaign).
- **HTTPS (TLS)**: Caddy's mkcert HTTPS was removed in Phase 2; the stack is intentionally **HTTP-only** until Cloudflare Tunnel (Phase 3) provides the public HTTPS edge.
- **Container restart / volume-persistence test** — DONE in Phase 1 (§9); data persistence re-confirmed in Phase 2 (count 5).
- Host-side dev processes are down at the Phase 2 checkpoint (Docker is the active stack).

## 6. Rollback point
- **Branch:** `enhancement/famipet`. Tags: `v0-baseline` (Phase 0), `phase1-docker-env`, `phase2-nginx-routing`.
- `git reset --hard phase1-docker-env` returns to the Caddy-era stack; `v0-baseline` is the pre-Docker state. `.env`, `certs/`, `uploads/` are local and preserved.

## 7. Bootstrap (for a fresh checkout / next developer)
1. `docker compose up -d --build` → **frontend + API at `http://localhost` (or `http://localhost:8080`)**; nginx proxy routes `/api*` + `/uploads*` to the backend.
2. Alternative dev flow (no Docker): start local `mongod`, `cd backend && npm ci && npm run seed && npm start` (serves API on 5000 + optional frontend fallback on 5502), serve `frontend/` with Live Server; `frontend/js/config.js` keeps the `<host>:5000` dev fallback for those ports.
3. Mongo: pulls from `petDB`; seed script `backend/utils/seedData.js` (`npm run seed`).
4. HTTPS/email links: need Cloudflare Tunnel (Phase 3) for public HTTPS; until then use plain HTTP.

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