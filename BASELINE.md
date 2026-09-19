# FamiPet — Phase 0 Baseline & Project Status

> Single project-status document for the enhancement work (Phase 1 checkpoint).
> Companion docs: `ROADMAP.md` (work plan — single source of truth), `bakwas.md` (current-state analysis), `Step10-Report.md` (historical QA report), `DOCKER_DEPLOYMENT.md` (deployment guide).
> Last update: Phase 1 completed (see §9).

---

## 1. Snapshot (verified from the repository and runtime)

| Item | Value |
|---|---|
| Git branch | `enhancement/famipet` (created in Phase 0 off `main`; original `main` HEAD `b0e6771` "Initial Commit") |
| Rollback point | Tag `v0-baseline` (see §6) |
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

## 3. Running services (verified live on 2026-09-19)

All four Docker containers are up and **healthy**, plus a parallel host-side dev stack is running:

| Service | Where | Port | Status |
|---|---|---|---|
| `famipet-caddy` | Docker (`caddy:2.9-alpine`) | host 80/443 (published) | healthy; HTTP→HTTPS 301; HTTPS serves API + frontend |
| `famipet-frontend` | Docker nginx | container 5502 | healthy |
| `famipet-backend` | Docker | container 5000 | healthy |
| `famipet-mongodb` | Docker (`mongo:8`) | container 27017 | healthy |
| host node backend | host process (PID 13824) | host 5000 + 5502 | serves `/api/*` and the Express frontend-fallback |
| Live Server | host process (PID 15852) | 5503 | serves `frontend/` |
| host mongod | host process | 127.0.0.1:27017 | reachable |

> **Environment note:** the Docker stack and a host-side dev stack (node + Live Server + mongod) run **simultaneously**. API and Mongo are reachable through both paths. Not a defect — just both working patterns in use.

> **Phase 1 note:** the Docker stack was fully re-created in Phase 1 (`down`/`up` cold start, `docker compose restart`, and a backend kill → auto-restart). All four containers came back **healthy**; named volumes persisted (mongo marker doc + uploads file both survived). See §9.

### Verified responses (this session)
- `GET http://localhost:5000/api/status` → `{"status":"OK","message":"FamiPet API is running!"}`
- `GET http://localhost:5000/api/breeds` → `{"success":true,"count":16,"breeds":[...]}` (DB-backed read OK)
- `GET http://localhost:5000/api/pets` → 200
- `GET http://localhost:5000/api/adoptions` → **401** (auth required — flag for later phases, see §4)
- `GET http://localhost:5000/api/nonexistent` → `{"success":false,"message":"Route not found"}` (404 handler OK)
- `GET http://localhost:5502/` (host Express fallback) → 200 text/html
- `GET http://localhost:5503/` (Live Server) → 200 text/html
- `GET http://localhost/` (Caddy) → 301 → `https://localhost/`
- `GET https://localhost/api/status` and `GET https://localhost/` (Caddy, mkcert) → API JSON / 200 frontend

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
- Rate limits are keyed to `req.ip` with **no `trust proxy`** (broken behind any reverse proxy/tunnel). Known roadmap item (addressed in Phases 2–4).
- Express frontend-fallback listener starts unconditionally in `server.js` (host 5502 today). Known roadmap flag.

## 5. What Phase 0 deliberately did NOT verify / deferrals
- **Full register → login → email-verify → dashboard E2E** requires live email delivery + verification token; not automated in this session. Historically reported passing in `Step10-Report.md`. Deferred to Phase 4 E2E campaign.
- **Container restart / volume-persistence test** (`down`/`up`, recreate) — **DONE in Phase 1** (see §9).
- No server restart or source changes were made; the running stack was not touched.

## 6. Rollback point
- **Branch:** `enhancement/famipet`
- **Tag:** `v0-baseline` — restore with `git reset --hard v0-baseline` (also `docker compose down` + `up` if needed; `.env`, `certs/`, `uploads/` are local and preserved).
- Baseline commit message: "Phase 0 — baseline checkpoint ..." (see `git log`).

## 7. Bootstrap (for a fresh checkout / next developer)
1. `docker compose up -d --build` (or dev flow: start local `mongod`, `cd backend && npm ci && npm run seed && npm start`, serve `frontend/` with Live Server).
2. Mongo: pulls from `petDB`; seed script `backend/utils/seedData.js` (`npm run seed`).
3. If Telegram persona unset: `.env` values already populated locally (gitignored).

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