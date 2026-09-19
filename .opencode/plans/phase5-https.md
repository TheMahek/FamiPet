# Phase 5 — FamiPet HTTPS/SSL Security: Implementation Plan

Status: APPROVED by user (further questions answered: mkcert OK, only 80/443 exposed,
cert covers 172.30.240.1 + localhost). Session is awaiting exit from plan mode to execute.

## Context (from inspection — unchanged facts)

- Docker stack: `frontend` (nginx, :5502 public), `backend` (Node 26, :5000 public),
  `mongodb` (mongo:8, internal only). Two networks: `famipet-frontend-net`,
  `famipet-backend-net`. Volumes: `mongodb_data`, `backend_uploads`.
- Browser calls the backend directly at `http://<host>:5000/api` (api.js fallback;
  `frontend/js/config.js` API_BASE currently `""`).
- JWT stored in localStorage (no cookies). CORS is dynamic, no `origin:*`,
  already allows `172.30.x`, `192.168.x`, localhost, plus CLIENT_URL/FRONTEND_URL/BACKEND_URL.
- Verification/reset links built from `FRONTEND_URL` (auth.controller.js). In
  `NODE_ENV=production` private IPs are rejected — so production requires a real domain.
- Machine: `172.30.240.1` = WSL vEthernet; Wi-Fi LAN IP is `192.168.0.103` (not included).
- External resources all HTTPS: Google Fonts, Font Awesome (cdnjs), Lucide (unpkg),
  Cloudinary image URLs. `sidebar.css` has a Google Fonts `@import`.
- No CSP exists and none of the pages were built for one (inline styles/scripts + CDNs).

## Approved decisions

1. Local trusted TLS via mkcert (browser-trusted on this user account). Real public
   domain/Let's Encrypt deferred (no domain exists).
2. Caddy reverse proxy added; only host ports `80`/`443` exposed. Backend `5000` and
   frontend `5502` become internal (`expose` only).
3. Certs SAN: `172.30.240.1`, `localhost`, `127.0.0.1` (primary = 172.30.240.1).
4. Non-Docker dev workflow (Live Server 5503 + `npm start` 5000) must keep working.

## Work already performed (approved, done)

- Installed `mkcert` v1.4.4 via winget
  (`C:\Users\User\AppData\Local\Microsoft\WinGet\Packages\FiloSottile.mkcert_...\mkcert.exe`).
- Created local CA; imported `$LOCALAPPDATA\mkcert\rootCA.pem` into
  `Cert:\CurrentUser\Root` (thumbprint FCBD53157AC5DCAD50063E6FAC231D6667255240).
  (Elevated LocalMachine install via UAC did not complete; CurrentUser store is
  what Chrome/Edge use. Firefox may need `mkcert -install` elevated or OS-store enabled.)
- Generated `certs/famipet-local.pem` + `certs/famipet-local-key.pem`
  (valid until 18 Dec 2028) for `172.30.240.1 localhost 127.0.0.1`.
- `certs/` must be git-ignored (private key!). Root `.gitignore` creation is pending
  (blocked by plan mode).

## Files to create

### 1. `.gitignore` (repo root — new)

```
certs/                # mkcert private keys: never commit
.env
.env.*
!.env.example
node_modules/
*.log
npm-debug.log*
```

### 2. `Caddyfile` (repo root — new)

```
# FamiPet Phase 5 — local HTTPS reverse proxy (mkcert local CA).
# Host-facing: 80 (-> HTTPS redirect) and 443 (TLS). Internal:
#   /api/*     -> backend:5000
#   /uploads/* -> backend:5000   (avatar/pet images served by the API)
#   everything -> frontend:5502  (static site)
# Certs are mounted read-only at /certs (host ./certs).

{
    email hostmaster@localhost   # disables any ACME attempts; no domain used
}

http://172.30.240.1, http://localhost {
    redir https://{host}{uri} permanent
}

https://172.30.240.1, https://localhost {
    tls /certs/famipet-local.pem /certs/famipet-local-key.pem

    # Security headers
    header {
        Strict-Transport-Security "max-age=31536000"
        X-Content-Type-Options nosniff
        X-Frame-Options SAMEORIGIN
        Referrer-Policy strict-origin-when-cross-origin
        -Server
    }

    handle /api/* {
        reverse_proxy backend:5000
    }
    handle /uploads/* {
        reverse_proxy backend:5000
    }
    handle {
        reverse_proxy frontend:5502
    }
}
```

NOTE: no CSP added on purpose — the existing pages load Google Fonts,
cdnjs Font Awesome, unpkg Lucide and Cloudinary images plus inline style/script.
A strict CSP would break the shipped UI. Documented as a remaining item.

### 3. `docker-compose.yml` — modifications (add caddy, restrict ports)

- Keep backend/mongodb/frontend services and both networks/volumes as-is.
- Add service `caddy`:
  - image `caddy:2.9-alpine` (currently running mkcert certs; no build step)
  - container_name `famipet-caddy`, restart unless-stopped, `init: true`
  - ports `80:80`, `443:443`
  - volumes:
    - `./Caddyfile:/etc/caddy/Caddyfile:ro`
    - `./certs:/certs:ro`
    - `caddy_data:/data`
    - `caddy_config:/config`
  - networks:
    - `famipet-frontend-net` (to reach frontend:5502)
    - `famipet-backend-net` (to reach backend:5000)
  - healthcheck: `wget -q -O /dev/null http://127.0.0.1:2019/config/ || exit 1`
    (Caddy admin API, always on localhost:2019 in-container)
  - mem_limit `256m`, cpus `0.5`
  - depends_on frontend + backend (so reverse proxy appears healthy only after they start)
- Change frontend: `ports: ["5502:5502"]` -> `expose: ["5502"]`
- Change backend: `ports: ["5000:5000"]` -> `expose: ["5000"]`
- Add volumes `caddy_data:` and `caddy_config:` to the volumes section.
- Do NOT run `docker compose down -v` (preserve mongodb_data / backend_uploads).

TYPE of change to existing containers:
- `docker compose up -d --build` after the config change; frontend image rebuild only
  (config.js changed).

## Files to modify

### 4. `frontend/js/config.js` (minimal, HTTPS-only)

Change the default so that when served over HTTPS with no explicit API_BASE,
API calls go same-origin through Caddy (`/api`), keeping HTTP dev fallback intact:

```js
window.__FAMIPET_CONFIG__ = window.__FAMIPET_CONFIG__ || {};
if (!window.__FAMIPET_CONFIG__.API_BASE) {
  window.__FAMIPET_CONFIG__.API_BASE =
    window.location.protocol === "https:" ? "/api" : "";
}
```

This preserves: explicit production API_BASE if set; HTTP dev (Live Server) keeps the
`<host>:5000/api` fallback in api.js; HTTPS requests become relative `/api` — which
eliminates mixed content and CORS for the deployed site. `api.js` logic untouched.

### 5. `backend/.env` (NOT committed) — set only these two lines

- `CLIENT_URL=https://172.30.240.1`
- `FRONTEND_URL=https://172.30.240.1`

All other values (JWT_SECRET, Mongo, Cloudinary, SMTP, Gemini, NODE_ENV) left exactly
as they are. NODE_ENV stays development so private-IP emailed links work under the
local HTTPS origin. Update comments only, no other line changes.

### 6. `backend/.env.example` (committed, placeholders only)

Refresh the CORS/URL comment block to document that for LAN-HTTPS local testing the
URLs are `https://172.30.240.1` (or the machine's HTTPS origin), and production still
requires a real public HTTPS domain. No real values.

## What is intentionally NOT changing

- No frontend design/styling/layout/animation/pages/navigation changes.
- No API routes, models, middleware, auth/JWT/verification-system rewrite.
- No cookie changes (JWT is in localStorage, not cookies — documented remaining risk).
- CORS code unchanged (dynamic allowlist + dev ranges already cover 172.30.x; the
  same-origin `/api` calls bypass CORS entirely under HTTPS).
- MongoDB stays internal-only; backend not publicly exposed.
- No CSP (documented remaining risk), no `origin:*`.

## Execute & verify (after plan mode disabled)

1. `docker compose config` (validate) and `docker run --rm -v $PWD/Caddyfile:/etc/caddy/Caddyfile:ro caddy:2.9-alpine caddy validate --config /etc/caddy/Caddyfile` (or `caddy validate` inside the created container).
2. `docker compose up -d --build` (frontend rebuild only + new caddy).
3. `docker compose ps` — all 4 containers healthy.
4. HTTPS tests:
   - `curl -k https://172.30.240.1/` returns index.html (via proxy, TLS from mkcert CA).
   - `curl https://172.30.240.1/` (CA trusted) — no cert error.
   - `curl -I http://172.30.240.1/` -> 308/301 to https.
   - Security headers present (`curl -sI https://172.30.240.1/`).
   - `curl -k https://172.30.240.1/api/status` -> backend JSON via proxy.
   - `curl -k https://172.30.240.1/uploads/...` route works.
   - Check `docker compose port` / published ports: only 80,443.
   - Verify backend/mongo unreachable from host on 5000/27017 after recreation
     (ports removed). Note: existing listeners on 5502/5000 gone.
   - Browser checks (user-assisted): load https://172.30.240.1, no "Not secure",
     HTTP redirect, login/admin/PetGPT/QR, no mixed-content in console.
5. A phone on the same Wi-Fi would need both the mkcert CA on the phone AND must use
   the LAN IP `https://192.168.0.103` — NOT selected, so document as out of scope;
   the WSL IP 172.30.240.1 is not reachable from other devices.

## Final report contents (after execution)

Files created / modified, before vs after Docker architecture, HTTPS config, cert
method (mkcert local CA, CurrentUser trust store), public ports (80/443 only),
internal ports (frontend 5502, backend 5000, only on Docker networks; mongo 27017
internal), headers added, CORS note, cookie note (none), API URL change
(relative /api under HTTPS), email verification URL change (FRONTEND_URL -> https),
tests + results, remaining warnings (no CSP, localStorage JWT, Firefox trust store,
CA trust not pushed to other machines), start command (`docker compose up -d`),
open URL (https://172.30.240.1), dev + prod HTTPS instructions.