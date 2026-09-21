# FamiPet — Docker Deployment Guide

How to run, harden, and eventually deploy the Dockerized FamiPet application.

> STATUS: **deployment PREPARATION only**. Nothing in this document has been pushed to a
> registry, cloud, or server. Every `docker build` / `docker compose up` step here runs
> **locally** until production infrastructure exists.

---

## 1. Requirements

- **Windows 10/11 with WSL2 installed** and a Linux distro configured (this is currently the
  missing requirement — see Troubleshooting).
- **Docker Desktop** (uses the WSL2 backend) or a Linux Docker engine + Compose plugin.
- **Node.js 26** on the host only for local (non-Docker) development.
- **Backend `.env`** file present at `backend/.env` (never committed).
- Internet access so the backend can reach **Cloudinary**, **SMTP (Gmail)**, and **Gemini**.

## 2. Docker Installation

1. Install WSL2 (Administrator PowerShell):
   ```
   wsl --install
   ```
2. Reboot if prompted, finish the Linux user setup, then install/launch Docker Desktop.
3. Verify the engine is running:
   ```
   docker info --format '{{.ServerVersion}}'
   ```
   This must print a version (e.g. `29.8.0`). If it returns a `500` error mentioning
   `dockerDesktopLinuxEngine`, WSL2 is not installed or not enabled.

## 3. Environment Variables

All runtime variables are supplied from `backend/.env` (same names the application uses).
Names only — values are never stored in Dockerfiles, images, or Compose:

`PORT`, `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRE`, `CLIENT_URL`, `FRONTEND_URL`,
`BACKEND_URL`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`,
`EMAIL_SERVICE`, `EMAIL_USER`, `EMAIL_PASS`, `GEMINI_API_KEY`, `NODE_ENV`,
`SERVE_FRONTEND_FALLBACK` (set `false` by Compose — see §13).

Plus one **root-level** (not backend) value for the tunnel daemon:
`TUNNEL_TOKEN` — read from a gitignored root `.env` by Compose and injected into the
`cloudflared` container (`TUNNEL_TOKEN` env). Leave it empty/absent to keep the tunnel
disabled (the rest of the stack keeps working internally over HTTP).

Copy the template and fill real (never-committed) values:

```
copy backend\.env.example backend\.env      (Windows)
```

Compose passes `backend/.env` to the backend container and overrides only the host part of
`MONGODB_URI` so the DB resolves via the Compose service name `mongodb`.

## 4. Development Startup

The normal local workflow does **not** use Docker:

- Frontend: VS Code **Live Server** on port 5503.
- Backend: `npm start` (or `npm run dev` with nodemon) on port 5000, connecting to a local
  MongoDB on `mongodb://localhost:27017/petDB`.

Optional: the same `docker-compose.yml` also runs the whole stack locally (the Compose file is
production-shaped but works fine on a dev machine with local `.env` values).

## 5. Production Startup

> There is one Compose file (`docker-compose.yml`) that serves both local and production
> builds — the plan is to introduce a separate `docker-compose.prod.yml` (Atlas MongoDB,
> production domain/HTTPS) only during actual deployment.

Start the stack:

```
docker compose up -d
docker compose ps
```

First-time image build (before the above works):

```
docker compose build
docker compose build --no-cache    # only if stale layers are suspected
```

## 6. Building Images

Images (built locally; never pushed):

- `famipet-nginx:production` — dedicated nginx reverse proxy on port 80 (the ONLY published service)
- `famipet-frontend:production` — nginx static site on port 5502 (internal)
- `famipet-backend:production` — Node 26 alpine API on port 5000 (internal)
- `mongo:8` — official database image (internal)
- `cloudflare/cloudflared:latest` — outbound-only Cloudflare Tunnel daemon (no published port)

## 7. Stopping Containers

```
docker compose stop       # pause without removing
docker compose start      # resume
docker compose restart    # restart containers in place
docker compose down       # stop AND remove containers/networks
```

## 8. Viewing Logs

```
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f nginx
docker compose logs -f cloudflared
docker compose logs -f mongodb
```

Logs do **not** print environment variables or secrets.

## 9. Health Checks

| Service  | Endpoint                                      | Notes                  |
|----------|-----------------------------------------------|------------------------|
| nginx    | `http://127.0.0.1/` (wget, via proxy → frontend) | proxy entry, Phase 2  |
| frontend | `http://127.0.0.1:5502/` (wget)               | internal static server |
| backend  | `http://127.0.0.1:5000/api/status` (wget)     | existing endpoint      |
| mongodb  | `mongosh --eval "db.runCommand({ping:1}).ok"` | built-in ping          |

```
docker compose ps
# STATUS column shows (healthy) only when all checks pass.
```

## 10. Database Requirements

- Current local setup: **MongoDB container** (`mongo:8`) with a named volume
  `mongodb_data`; database `petDB`, reachable **only inside** the Compose backend network
  (`mongodb://mongodb:27017/petDB`), never exposed to the host.
- For production use either **managed MongoDB (Atlas)** or your own **hardened MongoDB
  instance** — never a publicly exposed database. Atlas requires no container: point
  `MONGODB_URI` at the Atlas connection string and drop the `mongodb` service from the
  production Compose file.

## 11. External Services

All stay **outbound-only** and are configured purely via environment variables:

| Service    | Used by                                   | Verified by                      |
|------------|-------------------------------------------|----------------------------------|
| Cloudinary | image upload storage                      | upload flow (needs credentials)  |
| SMTP/Gmail | email verification + password reset       | email flow (needs credentials)   |
| Gemini     | PetGPT chat                               | PetGPT chat (needs API key)      |

## 12. Required Production Configuration

Before any real deployment the following must exist **as environment values** (placeholders,
never hardcoded):

- `CLIENT_URL=https://<production-domain>`
- `FRONTEND_URL=https://<production-domain>`
- `BACKEND_URL=https://api.<production-domain>`
- Public access: Cloudflare Tunnel with `TUNNEL_TOKEN` (root `.env`, gitignored)
  and a public hostname → `http://nginx:80` (see §14)
- Frontend `frontend/js/config.js`: `API_BASE` resolves same-origin `/api` on HTTPS automatically
- `MONGODB_URI` → managed/hardened MongoDB (Atlas recommended)
- `NODE_ENV=production`
- Strong random `JWT_SECRET` (proper secret management, e.g. a secrets manager)
- CORS allowlist updated to the real production origin

## 13. Security Considerations

- nginx hides its version and sends `nosniff`/`X-Frame-Options`/`Referrer-Policy` headers.
- MongoDB is internal-only; no host port.
- `.env` is excluded from images and Git.
- Firewall: only the nginx proxy ports `80` and `8080` are published. Frontend
  (5502), backend API (5000) and MongoDB (27017) stay on the internal Docker
  networks and are **never** published. The backend additionally runs with its
  built-in frontend-fallback listener disabled (`SERVE_FRONTEND_FALLBACK=false`).
  `cloudflared` publishes **no** host port — it makes outbound TLS connections
  only (nothing inbound to the host needs to be opened).

## 14. HTTPS Requirement (Cloudflare Tunnel — Phase 3)

Production **must** use HTTPS (TLS). The `nginx` proxy terminates no TLS itself;
public HTTPS arrives through the **Cloudflare edge → Cloudflare Tunnel**, which
routes into the nginx proxy container (internal ingress `http://nginx:80`).

> STATUS: **live as of Phase 3** — `https://famipet.catlium.in` → `http://nginx:80`
> (dashboard-managed tunnel, token in gitignored root `.env`). Steps below still
> apply for a fresh environment/zone.

### Cloudflare Tunnel setup (one-time, on your Cloudflare account)
1. Create a **named tunnel** in Cloudflare Zero Trust (Networks → Tunnels).
2. Add a **public hostname** (e.g. `famipet.example.com`) with service type
   **HTTP** and URL **`http://nginx:80`**. Because the `cloudflared` container
   joins the Compose frontend network, `nginx` resolves to the proxy container.
   (Do **not** point the hostname at `frontend:5502` or `backend:5000` — traffic
   must enter through the proxy so `/api` + `/uploads` route correctly.)
3. Put the tunnel's **token** in the gitignored root `.env`:
   `TUNNEL_TOKEN=eyJhI...`
4. The tunnel is behind Compose profile **`tunnel`** so the default stack stays
   clean (and an empty token can't cause a restart loop). Enable it with:
   ```
   docker compose --profile tunnel up -d cloudflared
   ```
5. To disable again: `docker compose --profile tunnel down` (or stop the container).

### HTTPS behavior without the tunnel token
Until `TUNNEL_TOKEN` is set (or the `tunnel` profile is started) the stack is
**HTTP-only** on `:80`/`:8080` (localhost/LAN). Public HTTPS + emailed
`FRONTEND_URL` links only work once the tunnel is live.

### Port 80 with a domain
If the tunnel hostname serves via Cloudflare Proxy (orange cloud), traffic reaches
the tunnel on Cloudflare's edge — no `CNAME`/`A` record to this host is needed at
all. If you later connect a domain directly (grey cloud / origin serving), only
`8080` is currently published as an alternative; add a `80`-published host port
then if required.

## 15. Domain Configuration

The deployment domain must be decided and a CNAME/A record pointed at the hosting.

Configuration values that will eventually need the production domain (not yet set):

- `CLIENT_URL` / `FRONTEND_URL` / `BACKEND_URL`
- Cloudflare Tunnel token + public hostname (see §14)
- Frontend `API_BASE` (in `frontend/js/config.js`)
- Email verification + password reset links (built from `CLIENT_URL`)
- Pet ID QR links (point at the frontend domain pages)
- Backend CORS allowed-origin list

## 16. Backup Considerations

**Do NOT run `docker compose down -v` unless you intentionally want to destroy the volumes.**

- Database data lives in `mongodb_data`, uploads in `backend_uploads`.
- Backup the database with `mongodump` (run inside the running container):
  ```
  docker compose exec mongodb mongodump --uri="mongodb://127.0.0.1:27017/petDB" --archive=/backup/petDB-<date>.archive
  docker compose cp mongodb:/backup/petDB-<date>.archive ./petDB-<date>.archive
  ```
- Store backups off-machine (cloud storage/S3) — not just on the same VM.
- Treat `backend/.env` as a primary asset: keep a secure encrypted copy.
- If Atlas is used in production, configure Atlas **scheduled backups** and periodic
  `mongodump` snapshots.
- Restore practice: `mongorestore --archive=... ` into a scratch environment **before**
  trusting any restore procedure.

## 17. Troubleshooting

- **Engine 500 on `dockerDesktopLinuxEngine`** → WSL2 is not installed.
  ```
  wsl -l -v    # shows error "Windows Subsystem for Linux is not installed"
  ```
  Fix: `wsl --install` in an **Administrator** PowerShell, reboot, finish setup,
  restart Docker Desktop, re-run `docker info`.
- **Backend container unhealthy** → MySQL/Mongo not ready or `.env` incomplete:
  check `docker compose logs backend` and confirm `MONGODB_URI` host value.
- **Frontend can't reach API** → the browser hits the same-origin `/api` path,
  which the nginx proxy forwards to the private backend. If it fails, check
  `docker compose logs nginx` (proxy/upstream errors) and `docker compose logs
  backend`. Long-term: keep both behind the nginx proxy and the public domain
  (Cloudflare Tunnel in a later phase).
- **Uploads fail** → Cloudinary credentials missing/invalid; fallback writes to the
  `backend_uploads` volume.
- **Email verification links broken** → `CLIENT_URL` mismatch between backend config and
  the public frontend URL.
- **Tunnel not running** → `docker compose logs cloudflared`: "no tunnel token provided"
  means `TUNNEL_TOKEN` is empty in the gitignored root `.env`, or the profile wasn't
  used (`docker compose --profile tunnel up -d cloudflared`). Connection errors mean
  the token is stale or the host can't reach Cloudflare's edge outbound (check firewall).
- **Public HTTPS loads but `/api` 404s** → the tunnel hostname was pointed at
  `frontend:5502` instead of the proxy; set the public-hostname service URL to
  `http://nginx:80` in the Cloudflare dashboard (see §14).

---

## Disaster Recovery & Rollback

- **Database**: restore the latest `mongodump` archive (see Backups). Never restore over a
  "same-named" production volume without a full backup of the current state first.
- **Environment variables**: keep versioned, encrypted, shared copies of `backend/.env`.
- **Image versioning**: tag builds as `famipet-backend:1.0.0` / `famipet-frontend:1.0.0`
  (and keep `:production` as the current known-good).
- **Rollback**:
  1. Keep the previous known-good image tag.
  2. `docker compose up -d --no-deps famipet-backend` (or frontend) against the old tag.
  3. Verify healthchecks + database compatibility.
  4. Restore service if compatible; otherwise restore from backup and retry with a fix.

## Production Checklist

- [ ] Production environment variables configured
- [ ] Strong JWT secret configured
- [ ] MongoDB production database configured
- [ ] MongoDB backups configured
- [ ] Cloudinary configured
- [ ] SMTP configured
- [ ] Gemini configured
- [ ] Production CLIENT_URL configured
- [ ] Production frontend URL configured
- [ ] CORS configured
- [ ] HTTPS configured
- [ ] Domain configured
- [ ] Firewall configured
- [ ] Docker images scanned
- [ ] Non-root containers verified
- [ ] Secrets excluded
- [ ] Logs reviewed
- [ ] Healthchecks verified
- [ ] Monitoring configured
- [ ] Backup tested
- [ ] Rollback tested