# FamiPet — Current-State Analysis Report

*Read-only analysis of the working tree. Evidence references absolute paths under `C:\Users\User\OneDrive\Documents\habiba\Fami-Pet`. Uncertain items are explicitly marked **[uncertain]**.*

---

## 1. Project Overview

### What the application currently does
FamiPet is a full-stack pet-care web app: a multi-page static frontend consuming a REST API that manages users, pets, adoption, lost & found, health/vaccination records, vet appointments, reminders, community posts, notifications, an AI pet assistant (PetGPT), and QR-based digital pet IDs. It has a separate admin surface for moderation and management.

### Main user types
- **`user`** (default role) — registered owner/shelter accounts; can register, log in, manage pets, adopt, post, query AI. (Roles `owner` and `shelter` exist in the enum and can be chosen at registration, but grant no distinct permissions today.)
- **`admin`** — `role: "admin"`; full moderation and management via adminOnly-guarded routes + admin frontend pages.
- **Anonymous visitors** — can read public pet listings, breeds, lost & found reports, community posts, and veterinarians without login (all public GET routes).

*Role semantics `owner`/`shelter` are selectable but functionally identical to `user` — **[uncertain]** whether role-based separation was intended but never implemented.*

### Main functional areas
Auth & account → Pets & breeding → Adoption → Lost & Found → Health/Vaccination → Appointments → Reminders → Favorites → Community → Notifications → PetGPT (AI) → Pet-ID (QR) → Admin panel → Email verification/password reset.

### Current technology stack
- **Frontend:** Vanilla HTML/CSS/JS (no framework, no build step), served by nginx (`frontend/nginx.conf`, port 5502) or Live Server in dev (ports 5502/5503 per `.vscode`).
- **Backend:** Node.js + Express 4 (CommonJS), Mongoose 8 (MongoDB).
- **Auth:** JSON Web Tokens (Bearer), bcryptjs password hashing, email-verification and password-reset tokens (SHA-256 hashed at rest).
- **Files:** Multer (memory storage), Cloudinary optional with local `/uploads` fallback; magic-byte image validation.
- **External services:** Google Gemini API (PetGPT), Nodemailer (SMTP/Gmail).
- **Infra:** Docker Compose — 4 services (frontend, backend, mongodb, caddy), 2 isolated bridge networks, mkcert local HTTPS via Caddy.

---

## 2. Current Architecture

### Frontend architecture
- Static multi-page app: `frontend/index.html` + 18 pages in `frontend/pages/`, 6 admin pages in `frontend/admin/`, shared JS in `frontend/js/` (api client, sidebar, theme, config, plus per-page modules) and `frontend/admin/js/`.
- No modularity tooling; scripts are top-level globals / `DOMContentLoaded` handlers. `api.js` injects `config.js` synchronously via `document.write` if missing (`frontend/js/api.js:23`) — **[uncertain]** resilient but fragile pattern.
- `api.js` resolves API base lazily (`window.__FAMIPET_CONFIG__.API_BASE` → other globals → `hostname:5000/api` dev fallback) and stores token/user in `localStorage` (`"famipetToken"`, `"famipetUser"`).
- `nginx.conf` sends `/assets/` with 30-day caching and falls back everything else to `/index.html` (SPA-style fallback used for a multi-page app; typo'd pages silently render home, never 404).

### Backend architecture
- A single Express app (`backend/server.js`) mounting 16 route modules under `/api/*`, plus a static `/uploads` mount and a **second** Express listener that serves the frontend as a fallback on the CLIENT_URL port when not already in use (`server.js:196-228`).
- Layered middleware: helmet, compression, CORS (dynamic allowlist), morgan, JSON body limit 1 MB, three tiers of rate limiting (global 300/15min, auth 60/15min, strict login/register 20/forgot 10), centralized error handler (`middleware/errorHandler.js`).
- Controllers hand-roll validation via `utils/validation.js` allowlists (`pickFields`, `stringOrUndefined`, `escapeRegExp`, enum constants). `express-validator` is installed but unused.

### Database architecture
- Single MongoDB database (from `MONGODB_URI`), 13 Mongoose models. Most relationships are `ObjectId` references stored inline (ref pattern); no dedicated join architecture (frontend relies on `.populate`). Only one custom index exists (`Favorite {user,pet}` unique).

### API structure
- REST-style, JSON envelope `{ success, data…, message }` on most endpoints. Public read endpoints exist for pets, breeds, lost & found, community, veterinarians; everything mutating requires `protect`; moderation requires `protect` + `adminOnly`.

### Authentication flow
1. `POST /api/auth/register` (public, strict rate limit 20/15min) → creates unverified user + 24 h verification token (SHA-256 at rest) → email with link to `frontend/pages/verify-email.html?token=…` built from `FRONTEND_URL`.
2. `GET /api/auth/verify-email/:token` → verifies.
3. `POST /api/auth/login` (strict 20/15min) → `{ token, user }`; blocked users get 403, unverified users get 403 with `isVerified:false`.
4. Every protected request: `protect` middleare verifies JWT (`{id}`), reloads user from DB, rejects blocked accounts (403), then optionally `adminOnly` for role check.
5. Password reset: `forgot-password` (hash the token, 30 min expiry, generic 200 on unknown email) → `reset-password/:token` (also returns a fresh JWT — auto-login).

### File/image handling
- Uploads: multer memory storage, MIME + extension allowlist (jpg/png/webp), 5 MB cap, 1 file, `uploadLimiter` 20/15min (`middleware/upload.js`). `utils/imageUpload.js` verifies magic bytes, then stores to Cloudinary if configured (3 env vars set and not placeholder) or to local `backend/uploads/`; base64/URL image strings validated by allowlist (`isSafeImageValue`), 1 MB string cap.
- Local uploads served publicly at `/uploads/*` (unauthenticated; needed for `<img>`).
- Referenced images are not deleted when pets/posts/records are deleted (cleanup exists only in avatar/update paths).

### External services
- **Gemini** — `backend/controllers/ai.controller.js` uses hard-coded model `"gemini-3.6-flash"`; no key → PetGPT returns 500/502. A separate `config/gemini.js` (`gemini-1.5-flash`) is dead/unused.
- **Nodemailer** — `config/email.js`; modes `smtp` (default), `json` (no delivery), `quota-sim` (always throws). Supports only `service`+auth (Gmail assumed); no HOST/PORT/tls options.
- **Cloudinary** — `config/cloudinary.js` + gating in `imageUpload.js`; disabled by default via `.env.example` placeholders.

### Docker / deployment architecture (Phase 7)
- `docker-compose.yml`: Caddy is the ONLY publicly published container (80/443). Frontend (nginx:alpine, 5502) and backend (node:alpine, 5000) are internal-only; MongoDB internal-only, healthchecked; named volumes for mongo data, uploads, caddy data/config.
- Backend hardened: `cap_drop: ALL`, `read_only: true`, tmpfs `/tmp`, non-root `node` user, `depends_on mongodb healthy`.
- Two bridge networks (`famipet-frontend-net`, `famipet-backend-net`); Caddy joins both. Caddy routes `/api*` and `/uploads*` → backend:5000, everything else → frontend:5502, with security headers and HTTP→HTTPS redirect. mkcert certs mounted read-only from `certs/`.
- Per `DOCKER_DEPLOYMENT.md` and git state this is **local deployment preparation only**; nothing has been pushed/registered.

### How components communicate
Browser → HTTPS → Caddy → (path routing) → nginx frontend (static assets) **or** Express backend (`/api`, `/uploads`). Backend → MongoDB (over backend network, service name `mongodb`), Cloudinary/SMTP/Gemini (outbound). No direct frontend↔backend container sharing; no Socket.IO (installed, unused) — notifications are HTTP-polled.

---

## 3. Existing Features

For each: status = **Working** / **Partial** / **Broken** / **Stub**.

| Feature | What it does | User workflow | Frontend | API endpoints | Models | Status |
|---|---|---|---|---|---|---|
| **Registration** | Creates account, sends 24 h email-verification link, role limited to owner/shelter | Signup form → verify email → login | `pages/signup.html` | `POST /api/auth/register` | User | **Working** (see §7 list of issues: whitespace name, resend enumeration) |
| **Email verification** | Verifies 24 h SHA-256 token | Click link → verified | `pages/verify-email.html` | `GET /auth/verify-email/:token`, `POST /auth/resend-verification` | User | **Partial** — repeated-click idempotency claim broken (token cleared), resend 404s unknown emails (enumeration), no resend rate limit on the endpoint itself |
| **Login** | JWT issue, block/unverified gate | Login → dashboard | `pages/login.html` | `POST /api/auth/login` | User | **Working** |
| **Forgot/reset password** | 30 min hashed reset token via email | Request link → set new password → auto-login | `pages/forgot-password.html`, `pages/reset-password.html` | `POST /auth/forgot-password`, `POST /auth/reset-password/:token` | User | **Partial** — prod config-throw bug after token save; doesn't invalidate old JWTs / doesn't require verified account; distinct 500 on a real email's send failure reveals existence |
| **Profile / settings** | Read/update name, phone, address, city, avatar; change password | Settings page | `pages/settings.html` + `js/settings.js` | `GET /auth/me`, `PUT /auth/profile`, `PUT /auth/change-password`, `POST /users/avatar` | User | **Partial** — delete-account button is a **fake** (local logout only, no backend call); settings profile payload forces `address:""`; language/country disabled |
| **Avatar upload** | Multi-file image upload w/ magic-byte validation → Cloudinary or `/uploads` | Settings → choose image | `settings.js` | `POST /api/users/avatar` | User | **Working** |
| **Pet management** | CRUD pets (species, breed auto-create, images, QR), view counter | Dashboard/My Pets | `pages/mypet.html`, `pages/dashboard.html` | `GET/POST/PUT/DELETE /api/pets*`, `GET /api/pets/my`, `GET /api/pets/:id/qr` | Pet, Breed | **Partial** — `adopted` client-settable at create; boolean coercion; breed auto-create privilege; `petUid` not unique; no cascade on delete; images not removed |
| **Breed catalog** | Browse breeds w/ detail; admin CRUD (soft-delete) | Breeds page | `pages/breeds.html`, `pages/breed-details.html` | `GET /api/breeds*` (public), admin POST/PUT/DELETE | Breed | **Partial** — `getBreedById` ignores `isActive`; junk/test breeds referenced by pets can't be safely deleted justifying soft-delete |
| **Adoption** | Submit adoption application; admin approves/rejects; auto pet status/adopted flip + notification | Browse pets → Apply → Admin approves | `pages/adoption.html`, `pages/dashboard.html`, admin `admin-pets`/`admin-adoptions` | `POST /api/adoptions`, `GET /api/adoptions/my`, admin `GET/PUT/DELETE /api/adoptions/:id` | Adoption, Pet, Notification | **Partial** — double-approval race; no pet-owner notification; deleting approved adoption orphans pet; no self-adoption guard; no unique (pet,user); pending apps left dangling |
| **Lost & Found** | Public reports list + user CRUD; admin resolves/deletes | Report a pet → browse/solve | `pages/lost-found.html`, admin `admin-lost-found` | `GET /api/lost-found*` (public), `POST/PUT/DELETE`, admin `PUT /:id/status`, `DELETE` | LostFound, User | **Working** (soft-ish moderation); report images list not length-capped on create; free-text breed blocks linking to Breed |
| **Health records** | Per-pet diagnosis/treatment/hospital visits | My Pet → add record | `pages/health.html` | `GET/POST/PUT/DELETE /api/health*` | HealthRecord, Pet | **Working**; `doctor`/`hospital` free-text (no Vet link); `Pet.health` field exists but is never written by a controller **[uncertain] — Phase-3 doc says added for health page** |
| **Vaccinations** | Per-pet vaccine log with `nextDueDate`, upcoming filter | Health page tab | `pages/health.html` | `GET/POST/PUT/DELETE /api/vaccinations`, `GET /upcoming` | Vaccination, Pet | **Working** (CRUD-level); no notifications/due-date job; status is PascalCase vs lowercase elsewhere |
| **Appointments** | Book/reschedule/cancel vet slots; auto-creates Reminder + Notification | Book a vet → manage | `pages/appointments.html`, `js/appointments.js`, admin none | `GET/POST/PUT/DELETE /api/appointments` | Appointment, Reminder, Notification, Veterinarian | **Partial** — TOCTOU double-booking; reschedule skips conflict check; wrong-reminder sync on duplicate same-type appointments; `prescription/diagnosis/fee/isPaid` have no write path; no vet/admin workflow |
| **Reminders** | User CRUD reminders (feeding/medicine/vax/grooming…) with completion toggles | Reminders page | `pages/reminders.html` | `GET/POST/PUT/DELETE /api/reminders`, `PUT /:id/complete` | Reminder, Pet (optional) | **Partial** — `node-cron` installed but **never wired**; no background firing → reminders are just stored records |
| **Favorites** | Toggle + list favorite pets | Heart icon on pets | `pages/adoption.html`, `dashboard.js` | `POST /api/users/favorites/:petId`, `GET/POST/DELETE /api/favorites` | Favorite, User | **Partial** — two divergent subsystems (User.favorites vs Favorite collection) can desync |
| **Community** | Posts (image, category), likes, comments; admin mod (soft delete) | Community page | `pages/community.html`, admin `admin-community` | `GET` (public), `POST/PUT/DELETE /api/community*`, `POST /:id/like`, `POST/DELETE /:id/comments*`, admin `PUT /:id/status` | CommunityPost, User | **Working**; unawaited `comment.deleteOne()`; owner-or-admin delete checks OK |
| **Notifications** | Poll-based list/unread/read-all/delete | Bell icon across pages | `js/sidebar.js`, per-page notification panels | `GET /api/notifications`, `/unread`, `PUT /:id/read`, `/read-all`, `DELETE /:id` | Notification | **Partial** — only adoption + appointment create them; no real-time (Socket.IO unused); no pagination; `User.notifications[]` dead |
| **PetGPT (AI)** | Ask Gemini about pet care + pet-specific advice | Chat panel | `pages/petgpt.html`, `js/petgpt.js` | `POST /api/ai/ask`, `POST /api/ai/advice` | Pet (read for advice) | **Partial** — unconfigured key → 500/502; multiple-second latency & 503s observed in logs; no per-user quota; model string in a dead config file contradicts active controller |
| **Pet-ID / QR** | Per-pet QR code (data URL) + owner-gated download | My Pet → view QR | `pages/mypet.html`, `pages/pet-id.html` | `GET /api/pets/:id/qr` | Pet | **Working**; [uncertain — cross-origin `foreignObject`/image tainting is noted in Step10 as affecting PNG export, with a print fallback] |
| **Admin panel** | Dashboard stats, user block/delete, pets delete, lost-found/community mod | Admin pages (admin-only guard) | `admin/*.html` + `admin/js/*` | All 13 `/api/admin/*` routes (protect+adminOnly) | User, Pet, Adoption, LostFound, CommunityPost | **Working**; no pagination on any admin list; user/pet delete is non-cascading; dashboard stats are static by design (per Step10) |

---

## 4. User Workflows

- **Registration/login:** Signup (role picker is cosmetic **[uncertain]**) → verify email via 24 h link → login → JWT in localStorage → sidebar/profile render. Failure zones: unverified login gate, resend 404 enumeration, verify-token path tokens in URL/logs.
- **Profile management:** Settings edits name/phone/address/city/avatar; change-password requires current password; **delete-account appears in UI but only logs out locally** (no server call exists). Profile save wipes `address` (frontend hardcodes `""`).
- **Pet management:** My Pets page lists owner pets; add/edit/delete with images + breed selection/auto-create; delete is owner-only (403 otherwise) but leaves adoptions/favorites/records/reminders/notifications orphaned.
- **Adoption:** Owner/admin posts adoptable pets → applicant submits `fullName/phone/address/occupation/reason` → admin flips status → pet becomes `adopted:true`/`status:"adopted"`; applicant notified. Gaps: no pet-owner notification, competing apps left pending, self-adoption allowed.
- **Lost & found:** Report (type/breed/age/location/contact/images) → public list with filters → reporter or admin resolves; admin can soft-resolve hard-delete.
- **Health/vaccination:** Add visit (diagnosis required) or vaccine (nextDueDate required); "upcoming" vaccinations list; records scoped to own user + own pet. No push to reminders/notifications when a due date nears.
- **Appointments:** Choose vet/date/time/type → creates appointment + auto Reminder + Notification; reschedule/cancel. Conflict-check is non-atomic; no admin/vet confirmation flow.
- **Reminders:** Manual CRUD + mark-complete; **never fired automatically** (no scheduler).
- **Community:** Any logged-in user posts (image optional), likes, comments; own-or-admin can delete; admin soft-toggles `isActive`.
- **Notifications:** Polled per page load / interval; mark-read, mark-all-read, delete; three types currently produced (adoption, appointment, system).
- **PetGPT:** Chat messages → `POST /ai/ask`; shows canned/manual answers when vets not found or key unset.
- **Pet-ID/QR:** Generate/dowload QR per pet (owner-gated backend check `pet.controller.js:557`); `pet-id.html` scans/displays and can share pet info.
- **Admin:** Dashboard (stats), Users (list/block/delete), Pets (delete), Adoptions (status/delete), Lost-found (status/delete), Community (status/delete). Guard: `admin/js/admin.js` redirects non-admins to dashboard, non-logged-in to login.

---

## 5. Data Model

13 models in `backend/models/`: Adoption, Appointment, Breed, CommunityPost, Favorite, HealthRecord, LostFound, Notification, Pet, Reminder, User, Vaccination, Veterinarian. All `timestamps: true`. Key facts:

### Ownership relationships
- `Pet.owner` → User (the **only** model that calls the user `owner`; every other linker uses `user`). `Pet.breed` → Breed (required).
- `Adoption {pet,user}`, `Appointment {user,pet,veterinarian}`, `CommunityPost {user}`, `Favorite {user,pet}`, `HealthRecord {user,pet}`, `LostFound {user}`, `Notification {user}`, `Reminder {user, pet?}`, `Vaccination {user,pet}`.
- `User` backrefs: `pets[]`, `favorites[]`, `adoptionRequests[]`, `notifications[]` — all refs to other models creating dormant cycles (`User↔Pet`, `User↔Adoption`, `User↔Notification`).

### Duplicated / inconsistent data
- **Favorites duplicated twice:** `Favorite` collection **and** `User.favorites[]` (both maintained by different controllers, `favorite.controller.js` `$addToSet/$pull` vs `user.controller.js` splice) → drift risk.
- **Adoption-approved-as-adopted in three places:** `Adoption.status="Approved"` ↔ `Pet.adopted=true` ↔ `Pet.status="adopted"` — same fact, three locations.
- **`veterinarian` represented 3 ways:** ObjId ref (Appointment), free-text string (Vaccination), free-text `doctor` (HealthRecord).
- **`breed` type mismatch:** Pet.breed = ObjectId ref; LostFound.breed = free-text String.
- **`age`:** Pet.age Number vs LostFound.age String. **`species` enum** verbatim in Breed/Pet/LostFound. **gender** `[male,female]` (Pet) vs `[male,female,unknown]` (LostFound).
- Contact snapshot duplication: Adoption (fullName/phone/address) and LostFound (contactName/contactPhone) copy User profile data with no sync.
- **`petName`** (LostFound) vs **`name`** (Pet); **`type`** overloaded 4 meanings (Appointment/Reminder/LostFound/Notification).
- **`User.role` = `owner` (role)** vs **`Pet.owner` (relationship)** — same word, different concepts.

### Status fields (exact casing — a known trap)
| Model | Field | Values | Default |
|---|---|---|---|
| Adoption | `status` | `Pending/Approved/Rejected` (Pascal) | `Pending` |
| Vaccination | `status` | `Pending/Completed` (Pascal) | `Pending` |
| Appointment | `status` | `pending/confirmed/completed/cancelled/no-show` (lower) | `pending` |
| LostFound | `status` | `active/resolved` (lower) | `active` |
| Pet | `status` | `available/adopted/lost/inactive` (lower) | `available` |
| Reminder | `isActive`/`isCompleted` booleans | — | — |

### Missing constraints
- `Pet.petUid` explicitly `unique: false` despite "unique digital pet ID" comment.
- `Adoption {pet,user}` no unique index; `Veterinarian.email` not unique; `User.email` unique; `Favorite {user,pet}` unique (only custom index).
- **No indexes** on hot queries: `Notification {user,isRead}`, `Vaccination {pet,nextDueDate}`, `Appointment {user,status}`, `LostFound {status}`, `CommunityPost {category}`, `Pet {owner,status}`, `Reminder {user,isActive}`.
- `Reminder.pet` optional but references Pet; `Pet.owner`/`Pet.breed` required with no delete guards → orphans on parent delete.
- `Veterinarian.reviews` refs `"Review"` — **no Review model exists** (dangling).
- `Appointment.prescription/diagnosis/fee/isPaid` and `Vaccination.veterinarian`/`HealthRecord.doctor` unvalidated/unwired.
- `User.pets[]`, `User.adoptionRequests[]`, `User.notifications[]` — **dead arrays**, never maintained.
- `Pet.health` — no controller reads or writes it.

### Data-model risk for future features
The one collection-per-record + manual cascade and manual status-sync pattern (pet adoption, appointment reminders, favorites duplication) is the biggest future barrier: any feature that adds cross-record effects must hand-sync several places. Free-text `veterinarian`/`hospital`/`doctor` blocks reporting/joins. Mixed status casing requires per-endpoint handling. Missing indexes will bite as data grows.

---

## 6. API Inventory

All routes mount under `/api`. Auth tiers: **Public** (no token), **User** (protect only), **Admin** (protect + adminOnly).

| Area (prefix) | Auth | Operations | Frontend consumers | Notes / limitations |
|---|---|---|---|---|
| `/api/auth` | Public: register/login/verify-email/resend/forgot/reset · User: me/profile/change-password | 9 ops | signup/login/verify/forgot/reset/settings/pet-id/community/dashboard-data/petgpt | Login/register/forgot strictly rate-limited (20/20/10 per 15 min); reset/verify/resend only under the generic limiter; verify resend returns 404 (enumeration); forgot-password send-failure 500 reveals registered emails; reset auto-issues JWT; no JWT invalidation on password change |
| `/api/users` | User: `:id` self-or-admin, `POST /favorites/:petId`, avatar · Admin: `GET /` | 4 ops | settings (avatar), adoption/dashboard (favorite) | `toggleFavorite` maintains only `User.favorites[]` (diverges from `/api/favorites`); avatar upload guarded (uploadLimiter + upload.single('avatar')) |
| `/api/pets` | Public: list/featured/detail · User: create/update/delete/my/qr | 7 ops | mypet, adoption, health, pet-id, reminders, appointments, dashboard-data, petgpt | Public list + detail `.populate("owner","name email phone")` → **PII to anonymous callers**; no default status filter; `GET /:id` increments views non-atomically; breed auto-create for any user; `adopted` set on create |
| `/api/breeds` | Public reads · Admin writes | 4 ops | breeds, breed-details, mypet | `getBreedById` ignores `isActive` |
| `/api/adoptions` | User: create/my · Admin: list/update/delete | 4 ops | adoption, dashboard-data, admin-adoptions | Double-approval race; no pet-owner notification; delete orphans pet |
| `/api/lost-found` | Public reads · User create/update/delete | 5 ops | lost-found, admin-lost-found | DELETE user-scoped; image array create not length-capped |
| `/api/health` | User (own) | 5 ops | health, dashboard-data | Pet ownership verified before create/update |
| `/api/vaccinations` | User (own) | 5 ops | health | Upcoming queries `nextDueDate`; no notification trigger |
| `/api/favorites` | User | 3 ops | (sparingly) | Parallel to `/users/favorites` |
| `/api/veterinarians` | Public reads · Admin writes | 4 ops | appointments, petgpt | `reviews` dangling ref never populated |
| `/api/appointments` | User (own) | 4 ops | appointments, health | Non-atomic slot check; reminder sync by fuzzy match (wrong-reminder risk); reschedule no conflict check |
| `/api/community` | Public reads · User mutate | 7 ops | community, admin-community | DELETE own-or-admin in controller; image field guarded by `image !== ""` (can't clear image) |
| `/api/ai` | User | 2 ops | petgpt | No per-user quota; external 503/latency propagation; unconfigured → 500/502 |
| `/api/notifications` | User (own) | 5 ops | sidebar + all pages | No pagination; only 3 event types exist |
| `/api/reminders` | User (own) | 5 ops | reminders, appointments | Scheduler never runs |
| `/api/admin` | Admin (all 13) | 13 ops | admin/* pages | No pagination; block/delete non-cascading |

Notable protection observations:
- Every mutating endpoint has at least `protect`; all 13 admin routes pair `protect`+`adminOnly`. User-scoped resources are consistently filtered by `user: req.user._id` and pet records verified via `Pet.findOne({_id, owner:req.user._id})` (verified in health/vaccination/reminder/appointment). Ownership checks verified in pet update/delete/QR, community delete/comment-delete, lost-found delete.
- Open items: `GET /api/pets/:id` is public with owner PII; `GET /api/users/:id` self-or-admin (OK); `protect` collapses all downstream errors into generic 401; rate limits not proxy-aware.

---

## 7. Current Problems

### Correctness bugs
- **Systemic wrong status codes:** ~20 catch blocks answer server errors with HTTP 400 ("Internal Server Error") instead of 500 (adoption/breed/appointment/favorite/reminder/health/vaccination controllers) — clients misclassify outages as bad requests.
- **Adoption double-approval:** two approvals can adopt the same pet; competing requests never rejection-cascaded.
- **Appointment booking race (TOCTOU):** check-then-insert not atomic; reschedule skips conflict check entirely.
- **Wrong reminder sync:** appointment reminder `updateMany` matches `{user,pet,title,type,date,time}` — duplicates collide.
- **Boolean coercion:** `Boolean("false") === true` for `vaccinated`/`adopted` on pet create/update.
- **Non-atomic view counter** (`pet.views += 1; save()`) loses increments.
- **`adopted` client-settable at create** while `status` stays `"available"` → inconsistent records.
- **Verify-email idempotency claimed but broken** (token cleared on first success; repeated click → 400).
- **Unawaited `comment.deleteOne()`** in community.
- **Delete of approved adoption/user/pet orphans dependents** (adoptions, favorites, records, reminders, notifications, stored images).
- **Cross-species breed mismatch** (breed matched by name only).

### Security issues
- **CORS permissive in production:** dev/LAN ranges + no-Origin allowed unconditionally regardless of `NODE_ENV` (`server.js:53-68`).
- **Rate limits keyed to proxy IP:** no `trust proxy` → behind Caddy all clients share one bucket (global lockouts or infinite bypass for a real IP).
- **Stored XSS risk (frontend):** avatar/name interpolated unescaped into `innerHTML` in `js/sidebar.js:443-458` and `js/petgpt.js:340` (attribute breakout possible; contrast with community.js's `escapeAttr`).
- **Breed auto-create privilege:** any authenticated user can create breeds by submitting a novel name, bypassing admin-only writes; duplicate-key race → 500.
- **Account enumeration:** resend-verification 404s unknown emails; forgot-password 500 on failed send for existing accounts.
- **JWT in localStorage** (XSS-stealable); old JWTs not invalidated on password change/reset; tokens travel in URL paths/query for verify/reset (logged by morgan, visible in history/Referer).
- **PII exposure:** public pet list/detail populate owner `email`/`phone`; public lost-found reports expose reporter contact.
- **No per-user quota on AI** (billable token abuse); uploads buffered in RAM (memory pressure at limit).
- **Hardcoded seed credentials** (`admin@animalplanet.com/admin123`, `user@example.com/user123`) in any seeded DB.

### Data consistency issues
- Dual favorite subsystems can desync.
- Adoption approval facts stored in 3 places.
- Mixed status casing (Pascal vs lower) across models.
- Dead backrefs (`User.pets/adoptionRequests/notifications`) vs live refs; dangling `Veterinarian.reviews → Review` (no model).
- Free-text vet/doctor/hospital blocks join/reporting.
- Duplicated contact snapshots (Adoption, LostFound) with no sync.

### UX / frontend issues
- **"Delete account" does nothing server-side** (settings.js) — account persists.
- **401 redirect** `window.location.href = "login.html"` is path-relative and 404s from `admin/` and root.
- Dashboard sidebar race (dashboard.js runs before sidebar injection → dead `#annSidebar`/`.nav-item`/`#profileBtn` behavior).
- Dead newsletter form; duplicate backToTop handlers; dashboard theme double-icons / unhighlit dark mode; dead placeholder markup on adoption.html and mypet.html; settings Terms/Privacy/Help are no-ops; `annProfile.*` caches survive logout; `isLoggedIn()` trusts any token → 401 loops.
- `alert()` popups used in petgpt/pet-id despite stated no-alert policy; static placeholder values persist in HTML ("2", "11", "28 kg", sample clinic).

### Backend issues
- Mongoose connect failure doesn't stop the app (server logs but serves 500s).
- `getClientBase()` lacks fail-fast in `forgotPassword` → prod misconfig throws after token persisted.
- Frontend fallback listener (second HTTP server) runs unconditionally, even in Docker/production.
- Two Gemini model strings / dead `config/gemini.js`; node-cron/Socket.IO/express-validator installed but unused.
- `test-email.js`: false-positive in `json` mode, TypeError in `quota-sim` mode, CWD-dependent dotenv.
- Whitespace-only `name` accepted; min-length checked before type checks (fragile).

### Performance / scalability issues
- **No indexes** on hot queries (list in §5).
- No pagination on admin/user pet lists, notifications, favorites; public pet list unbounded by default.
- Non-atomic view counter; no `$inc`-style writes.
- Per-request user reload in `protect` (every request = 1 DB read); acceptable at small scale, will cost later.
- Gemini latency 7.5–12.3 s observed (logs); bad AI requests degrade, no timeout tuning evidenced.

### Deployment / configuration issues
- `backend/server.log` and `server.err` **tracked in git**.
- ~75 modified + ~15 untracked files uncommitted (all Docker/HTTPS/campaign work not in history).
- **URL/SAN drift:** `.env.example` CLIENT_URL `172.30.240.1` vs FRONTEND_URL `192.168.0.103` vs Caddyfile `default_sni 192.168.0.103` vs Phase-5 plan SANs (`172.30.240.1 localhost 127.0.0.1`) — HTTPS email links can mismatch cert.
- Docker healthcheck hits `/api/status`; frontend fallback listener could interfere in containers.
- Live-server ports differ (root 5503 vs frontend 5502); `DOCKER_DEPLOYMENT.md` §13 outdated (ports 5502/5000 vs 80/443).
- `README` absent; project docs are `Step10-Report.md` + `DOCKER_DEPLOYMENT.md`.

### Technical debt
- Dead modules: `config/database.js` (obsolete Mongoose options), `config/gemini.js`; dead fields: `User.pets/adoptionRequests/notifications`, `Appointment.prescription/diagnosis/fee/isPaid`, `Veterinarian.reviews`, `Pet.health` (unused), `auth.controller.js:1305 clientUrl`.
- `pickFields`/validation hand-rolled everywhere instead of express-validator.
- Package name still `"animal-planet-backend"`; frontend still contains `ann*` prefixed local-storage keys and dead placeholder markup.
- Stale `frontend/css/adoption.css.bak-p1` backup.

### Dead / unused functionality
Listed in §8.

---

## 8. Incomplete / Partially Implemented Features

- **Account deletion (frontend only).** Settings shows a delete-account flow; no backend endpoint exists; final handler only logs out. (Highest-impact incomplete feature.)
- **Reminder scheduler.** `node-cron` installed; no code uses it; reminders are inert records.
- **Real-time notifications.** `socket.io` installed; notifications are poll-only.
- **AI-config drift.** Active Gemini model `gemini-3.6-flash` in `ai.controller.js` vs dead `config/gemini.js` `gemini-1.5-flash`.
- **Booking-conflict enforcement.** Slot conflict check exists but is non-atomic; reschedule bypasses it; vet is referenced but never linked to a real availability table/booking.
- **Appointment clinical fields** (`prescription`, `diagnosis`, `fee`, `isPaid`) exist in schema but have **no write path** (only seed data sets `fee`).
- **`Pet.health` field** added (Phase 3) but never written by any controller **[uncertain — intended for health summary, unused]**.
- **`User` backref arrays** (`pets`, `adoptionRequests`, `notifications`) defined, never maintained.
- **Pet owner notification on adoption** — missing entirely.
- **Newsletter form** on `index.html` — no JS handler.
- **Settings preferences** — language/country populated but disabled; Terms/Privacy/Help links are no-ops.
- **Seed script's `user` role** — seeds demo user with `role:"user"` while registration allows `owner`/`shelter`; role feature has no behavior attached.
- **`test-email.js`** — broken in two of three transport modes, CWD-dependent dotenv.
- **`express-validator`** — declared, unused.

---

## 9. Product Gaps

*Distinguishing three levels:*

**Technically missing functionality**
- Any real account-deletion API.
- Background reminder/vaccination due-date firing (notifications or emails).
- Notifications for lost-found resolution, vaccination due dates, reminder due dates, community activity, and adoption events to the pet owner.
- Pagination on notification/favorite/admin lists; indexes on hot fields.
- Any vet-side workflow (confirm/complete appointments) despite `status` enum supporting it.
- Review/rating write-endpoints (model fields exist, no controllers).

**Partially implemented functionality**
- Adoption lifecycle (approval doesn't cancel competitors, no owner notification, allows self-adoption, approved pet stays orphaned on delete).
- Email verification UX (repeat-click idempotency; no resend on the reset/verify side; no expiry surfaced in UI).
- PetGPT (no quota, no error fallback UX, no model config).
- Favorites (two divergent routes).
- Pet-ID/QR (works, but export taint workaround per Step10; `petUid` not unique).
- Settings (delete account, language/country, placeholders).
- Admin (static stats, no pagination).
- Profile data consistency (address overwritten by frontend).

**Functionality that exists but could be expanded**
- Community → reactions/pinning/rich text; health → charts/summaries; appointment → recurring bookings; reminders → snooze/frequency UI; notifications → in-app + email + push; breeds → richer catalog; adoptions → shelter/owner-to-owner messaging.

---

## 10. Enhancement Opportunities

*Based strictly on existing modules; feasibility notes.*

1. **Real account lifecycle**: account deletion + GDPR-style data purge. Affects: auth routes/users, pet/health/vaccination/appointment/reminder/notification/adoption/favorite/lost-found/community **cascades** (needs a new deletion utility), frontend settings. Dependency: cross-model cleaning. Architecture: supported today (all records keyed by `user`), but requires removing the dual-favorite + backref dead arrays first.
2. **Reminder & vaccination due engine**: cron (dep already present) emitting Notifications + emails on `Reminder.date/time` and `Vaccination.nextDueDate`. Affects: server.js, reminder/vaccination controllers, config/email. Supported; low risk; biggest bang for least change.
3. **Real-time notifications via Socket.IO** (dep present) as an add-on to polling. Supported; needs auth-over-socket + namespace design; poll fallback remains.
4. **Adoption workflow hardening + shelter flow**: proper pet-role workflow, competitor rejection, owner notification, adoption history. Affects: adoption controller, admin, pet list. Supported (needs atomic updates + a pet-status state machine).
5. **Vet enablement**: vet profiles with availability, clinic/practice account linking (role `vet`? currently absent **[uncertain]**), appointment confirmation flow, in-app prescribing/vitals (fields exist). Affects: Veterinarian model (availability exists already), Appointment, admin. Requires schema work (free-text vet references → ObjectId), new role, and index on `{veterinarian,date,time}`.
6. **PII-safe pet profile**: keep public pet cards but stop exposing owner email/phone (add contact-channel abstraction, e.g., "contact shelter via platform"). Affects: pet.controller populate, adoption/lost-found controllers, frontend forms. Low risk; improves compliance.
7. **Content moderation & reporting**: report endpoints on community/lost-found/ads, plus admin queue. Supported (admin/mod structure exists; needs a new `Report` model or flags).
8. **Analytics/insights on health**: derive summaries/reminders from HealthRecord/Vaccination/Reminder; visualizations. Affects: dashboard + health. Schema is sufficient today.
9. **Pet-ID public share page**: a public (or token-gated) pet profile page rendering from `petUid` — requires fix of the uniqueness gap first.
10. **Ratings/reviews**: Veterinarian `reviews` currently dangles — build the review sub-model or rehost as subdocs; add write endpoints + index. Directly repairs the dead schema field.

---

## 11. Architecture Readiness

### What should remain unchanged
- The security-hardened Docker compose (networks, read-only rootfs, non-root, Caddy-only public exposure) — solid baseline.
- The `protect`/`adminOnly` layering and per-user scoping pattern.
- The image handling pipe (magic bytes, allowlist, Cloudinary/local fallback) and `imageUpload.js` safety helpers.
- Envelope `{success,...}` API shape and allowlist validation style.

### What should be refactored before major features
- **Dual favorite subsystems** → pick one source of truth (or denormalize deliberately).
- **Manual cross-record sync** (adoption → pet, appointment → reminder) → explicit state-machine or find-replace helpers.
- **Error handling** (400/500 hygiene, `protect` collapsing errors, no `trust proxy`) before anything that relies on status codes or IPs.
- **publicUser vs getMe duality** (id/_id) and `frontend` id expectations.
- **Dead backrefs / dangling refs** removal or rewiring (`User.pets/adoptionRequests/notifications`, `Veterinarian.reviews`).
- **CORS** tightening by `NODE_ENV`.

### What can safely be extended now
- New read-heavy endpoints (community categories, health summaries, breed pop) — schema fine.
- Notification event sources (just create Notification docs — pattern already there).
- Admin pages (add reports queue, pagination endpoints).
- Frontend static pages (low risk; global-script pattern OK at this size).

### Architectural bottlenecks
- **Single Express process** doing API + frontend fallback + (future) cron → keep jobs out of the request process or isolate a worker.
- **Poll-based notifications** (no real-time) limits engagement features.
- **No indexes / pagination** will cap growth.
- **Free-text medical/vet entities** block joins (HealthRecord/Vaccination vets, LostFound breed).
- **Status-casing inconsistency** couples controllers to model internals.
- **`protect` DB reload per request** and non-atomic counters.

### Where future features could create debt
Any feature that again straddles the two favorites systems, adds a 4th location for "pet is adopted", or introduces new free-text entity references will compound existing divergence. New push channels without a notification-type registry (currently `type` enum) will grow ad-hoc strings.

---

## 12. Prioritized Baseline

*Factual grouping; nothing to be implemented now.*

**Blockers before major feature work**
1. Wrong 400-for-500 statuses (diagnostics/UX everywhere).
2. CORS production bypass + missing `trust proxy` (rate-limit integrity & security).
3. Adoption double-approval / orphaned pets & users on delete / no cascades.
4. Stored-XSS escaping in sidebar.js/petgpt.js; fake account deletion; broken 401 redirect path.
5. Non-atomic appointment conflict check + wrong-reminder sync.

**Important improvements**
- One favorites source of truth.
- Indexes + pagination on hot collection/list endpoints.
- Wire reminder/vaccination due engine (dep present).
- PetOwner-adoption notification + competitor rejection.
- Enforce `Pet.petUid` uniqueness (fix generator), sensible default filter on public pet list.
- Tighten account-enumeration signals; token hygiene (HttpOnly/rotation) — requires frontend auth rethink.
- PII reduction on public pet/lost-found reads.

**Technical debt that can wait**
- Dead config/ and deps cleanup (`database.js`, `gemini.js`, unused deps) — low risk, no behavior change.
- Status-casing unification across models (requires coordinated test pass; medium effort).
- `test-email.js` repair and dotenv standardization.
- Migrate `User` backref cleaning / `Veterinarian.reviews` resolution.

**Optional cleanup**
- `git rm --cached server.log/server.err`; delete `adoption.css.bak-p1`; `git rm`/ignore runtime logs.
- Commit the long-uncommitted body of work (with `.env` never included).
- Update `DOCKER_DEPLOYMENT.md` + `.env.example` URL/SAN drift; rename package to `famipet-backend`.
- Remove dead placeholder UI (adoption placeholder, mypet static cards) and duplicate handlers.

---

## 13. Baseline for Future Enhancement Planning

**What FamiPet currently is:** a broadly featured, hand-rolled, no-framework full-stack pet-care platform — Express/Mongoose API, vanilla JS multi-page frontend, admin panel, and a Phase-7 security-hardened local Docker stack (Caddy-only exposure) that has never been deployed externally.

**What already exists (functionally real):** complete auth (register/verify/login/reset), profile + avatar, pet CRUD with images/QR, adoption applications, lost & found, health records, vaccinations, appointments (with auto reminders/notifications), manual reminders, favorites, community (posts/likes/comments), polling notifications, PetGPT, and a full admin moderation surface. All mutating routes are protected; user-scoped resources are consistently ownership-filtered; image validation is layered and defense-in-depth-conscious.

**What is incomplete:** account deletion (UI only), reminder scheduler, real-time push, AI config consistency, appointment conflict enforcement, vet-side clinical workflow, adoption lifecycle edges (double-approval, competitor hang, no owner notification), notification-event coverage, email-verify idempotency, pagination/indexes, PII-safe public reads.

**What needs stabilization:** error-status hygiene, CORS/proxy-aware rate limiting, atomicity of cross-record writes, escaping of user content in the sidebar/PetGPT render path, dual-favorites convergence, and the adoption/pet status state machine.

**What is structurally ready for expansion:** new read endpoints, notification sources, admin workflows, static-content features, and any feature satisfiable with the existing per-user-scoped record pattern. The Docker/networking topology is ready for scale-out if backend jobs are split out.

**What to consider when designing new features:**
- Every user-scoped resource is keyed by `user` (except Pet, keyed `owner`) — new features should reuse this pattern and avoid creating new backref arrays on User.
- `adopted/status` and appointment-reminder sync are hand-maintained — new state transitions should be centralized, not copied.
- Status enums have mixed casing; new status fields should be lowercase and consistent.
- Long-lived engineering decisions (PII in public reads, localStorage JWTs, poll-only notifications, single Express process) are deliberate simplifications to re-visit before scale or compliance requirements land.
- Several "dependencies are already installed but never configured" signals suggest the codebase was built to be feature-ready but has deferred wiring — a natural source of cheap, high-value enhancement candidates (cron, socket.io, express-validator, Veterinarian.reviews).

---

*Report end.*