# FamiPet — AGENTS.md

FamiPet is a static HTML/CSS/JS frontend (`frontend/`, no package.json, no build) + Express/Mongoose backend (`backend/`, Node 26), MongoDB, run as a Docker Compose stack with a dedicated nginx reverse proxy and a Cloudflare Tunnel for public HTTPS. All enhancement work lives on branch `enhancement/famipet` (leave `main` untouched).

## Source-of-truth docs (read before planning)
- `ROADMAP.md` — the work plan / single source of truth: 13 phases, executed **sequentially one at a time**, each ending in a docs update + checkpoint commit + tag. Records decisions/findings in its "Phase N status" section.
- `BASELINE.md` — project status, current architecture, last-verified state. Update alongside ROADMAP at each checkpoint.
- `DOCKER_DEPLOYMENT.md` — ops guide (ports, tunnel setup, troubleshooting, rollback).
- `bakwas.md` (historical analysis) and `Step10-Report.md` (historical QA) are reference only; don't edit.

## Commands
- No test, lint, or typecheck scripts exist anywhere (confirmed — don't hunt for them). Verification = `node --check <js-file>` for syntax + runtime checks via curl against the running stack.
- Backend package.json name is the legacy `animal-planet-backend`; scripts: `start`, `dev` (nodemon), `seed`.
- Stack: `docker compose up -d --build` / `docker compose ps` / `docker compose logs -f <svc>`.
- Validate config before/after compose edits: `docker compose config --quiet`. After editing `nginx/nginx.conf`, rebuild (`docker compose build nginx`) then `up -d` and healthcheck/curl.
- `docker compose --profile tunnel up -d cloudflared` — tunnel is profile-gated (never started by plain `up`).
- **Never run `docker compose down -v`** — destroys `mongodb_data` + `backend_uploads` volumes.

## Architecture (current topology)
- 5 services: `frontend`, `backend`, `mongodb`, `nginx` (reverse proxy), `cloudflared` (profile `tunnel`). Docker is the **only** active stack (host dev processes are down).
- `nginx` is the **only** service publishing host ports (`80`, `8080`). Backend `5000`, frontend `5502`, mongo `27017` are container-`expose` only — never reachable via localhost.
- nginx routes `^~ /api` and `^~ /uploads` → `backend:5000` (original URI preserved — don't add a trailing path), `/` → `frontend:5502`. It joins both networks; cloudflared joins only the frontend network.
- Public HTTPS: `https://famipet.catlium.in` → Cloudflare edge → tunnel → `http://nginx:80`. Ingress is dashboard-managed (remote config for the token's tunnel); `TUNNEL_TOKEN` lives in gitignored root `.env`.
- `backend/.env` (gitignored, loaded via compose `env_file`) is overridden in compose only for `MONGODB_URI=mongodb://mongodb:27017/petDB` and `SERVE_FRONTEND_FALLBACK=false`. `FRONTEND_URL`/`CLIENT_URL` = `https://famipet.catlium.in` (CORS + all emailed links).

## App-wiring facts (not obvious from filenames)
- `frontend/js/config.js` resolves the API base: same-origin `/api` when served over HTTPS or on proxy ports (`""`/`80`/`8080`); other HTTP dev ports (5502/5503) fall back to `http://<host>:5000/api`. `api.js` just consumes the resolved base.
- `backend/server.js`: `app.set('trust proxy', 1)`; the Express static frontend-fallback listener is gated by `SERVE_FRONTEND_FALLBACK` (off in Docker, on by default for host dev). nginx sets CF-aware `X-Forwarded-For`/`X-Forwarded-Proto` maps.
- Host-dev alternative (DOCKER_DEPLOYMENT §4): local `mongod` + `cd backend && npm ci && npm run seed && npm start` + Live Server for `frontend/`.

## Secrets (must never be committed)
- `.env` (root: `TUNNEL_TOKEN`) and `backend/.env` are gitignored — keep them that way; verify with `git check-ignore`. Never bake either into an image or past loader/`.env.example` is fine to commit. Treat both as primary assets.

## Known quirks / gotchas
- Docker `petDB` dataset is leaner than the host DB (`/api/breeds` count 5 vs 16) — expected, not a defect.
- `/assets/logo.png` does not exist (real assets are in subfolders like `assets/images/...`) — 404 is correct.
- API responses carry duplicate `X-Content-Type-Options`/`X-Frame-Options` and conflicting `Referrer-Policy` (helmet + nginx headers) — cosmetic, pre-existing.
- Cloudflare zone "Always Use HTTPS" is documented as off (plain HTTP returns 200) — user-side dashboard toggle, not blocked.
- OneDrive quirk: files can vanish from the working tree as placeholders (e.g. `Step10-Report.md`). If a tracked file is missing with no git change, restore via `git restore --source=HEAD -- <file>` — don't treat it as an edit.
- Windows host: benign `LF will be replaced by CRLF` warnings on `git add` are expected.