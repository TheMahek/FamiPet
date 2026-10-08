# PHASE 5 — PRODUCT & READINESS AUDIT REPORT

**Project:** FamiPet (Pet Care & Adoption Platform)
**Branch:** `main` (working tree untouched — only pre-existing dirty `graphify-out/*` and untracked `docs/diagrams/`)
**Date:** 2026-10-07/08
**Mode:** Read-only audit. No source changes, no commits, no pushes. Test data created during QA was removed; deployment DB restored to seed state.

## 1. EXECUTIVE SUMMARY

A read-only product/readiness audit was performed against the running Compose stack
(`nginx → frontend + backend → mongodb`, Cloudflare tunnel, OmniRoute on the host). The product is broadly
**functional and secure-by-design**: all 14 app pages, both admin shells, auth, ownership checks, CORS,
pet lifecycle (list/create/delete), health, vaccinations, appointments+reminders, notifications, adoption
apply/admin-review, lost & found, community, breed identifier (AI), PetGPT (AI), digital Pet ID/QR, settings,
profile save, and mobile layout were exercised end-to-end. Backend regression suite passes (16 suites / 160 ok);
frontend lint + build pass.

**Three broken areas block production-readiness:**
1. **Pet editing returns HTTP 500** for every edit (breed is a stored ObjectId; the controller's
   string-conversion is dead code) — a core owner workflow.
2. **No email delivery configured** in this deployment (no `EMAIL_*` in root `.env`) → signup and
   forgot-password both return HTTP 500 and cannot complete.
3. **Emailed verification/reset links are dead** even if email worked: the backend emits legacy
   `/pages/verify-email.html` paths that land on the React **404 / NotFound** page.

Medium/low findings: public `GET /api/pets` leaks full owner PII to anonymous callers (broader than the
documented public adoption catalogue); adoption applicants cannot withdraw their own request; notification
items can only be bulk-marked read; the backend ships a dead legacy-frontend fallback listener.

---

## 2. STATUS BY FEATURE AREA

Legend: `[x] Complete` · `[~] Partial` · `[!] Broken` · `[-] Intentionally absent` · `[?] Unable to verify`

| Area | Status | Notes |
|---|---|---|
| Login / logout / session | `[x]` | valid creds OK, bad creds show "Invalid email or password.", logout clears, guards redirect correctly |
| Route guards (auth + admin) | `[x]` | protected routes 401 API; UI `RequireAuth`/`RequireAdmin`/`RedirectIfAuthed` verified; admin API 403 for non-admin (curl) |
| Register / verify email | `[!]` | HTTP 500 "Unable to send verification email"; user rolled back — see F-02 |
| Forgot / reset password | `[!]` | HTTP 500 "Unable to send reset email" — see F-02 |
| Emailed deep links (`/pages/*`) | `[!]` | render React NotFound (404) — see F-03 |
| Pets list / create / delete / detail | `[x]` | real DB data; delete verified; DB restored |
| **Pets edit** | `[!]` | every edit → 500 mongoose CastError — see F-01 |
| Pet details modal + QR | `[x]` | per-pet record + ID ("Not available yet" for never-generated) |
| Digital Pet ID / QR | `[x]` | owner/admin-only generation (403 otherwise); QR encodes id+name+species+breed+owner name/phone — documented design (README), intent = lost-pet contact |
| Public pet lookup page | `[-]` | no public web page / public endpoint exists; QR carries a JSON payload only |
| Health (records/visits) | `[x]` | real records, empty states, correct pet scoping |
| Vaccinations | `[x]` | tracker + pending/completed, empty states |
| Appointments | `[x]` | book (no double-book), status lifecycle, cancels |
| Reminders | `[x]` | auto-created on booking; create/edit/complete/delete |
| Notifications | `[x]` | per-user, persisted, unread/read survives refresh, "Mark all read" verified; no per-item read — F-06 |
| Browser push | `[?]` | VAPID pair configured, `sw.js` + subscription endpoints present; not end-to-end pushed in this audit |
| Adoption (browse/apply/admin) | `[x]` | real records, admin approve/reject, DB-backed; apply → Pending verified |
| Adoption (applicant withdraw) | `[~]` | no user DELETE (admin-only) and no "My Applications" view — F-05 |
| Lost & found | `[x]` | both report types, detail modal, contact actions |
| Community | `[x]` | real posts; like/unlike persists (POST + reload verified); post publish unpublished (admin) |
| Breeds catalogue + search | `[x]` | species tabs, detail pages, filters |
| Breed Identifier (AI) | `[x]` | photo upload → analyze → "Golden Retriever, match 75%" with origin/lifespan; real API call |
| PetGPT | `[x]` | conversation streamed via OmniRoute, answer grounded in pet's actual next vaccination (Rabies booster Nov 21 2026), tool chip, persisted conversation, disclaimer |
| Settings (profile save) | `[x]` | name/phone/location("city")/avatar persist to DB and survive reload; empty-state placeholders not persisted |
| Admin dashboard + 5 admin sections | `[x]` | real totals (7 users / 8 pets / 2 pending), user/pet/adoption/lost-found/community management; route + API guarded |
| Public catalogues (pets/featured/vets/breeds/community/lost-found) | `[x]` | 200 anonymous |
| **Public PII scope** | `[~]` | `GET /api/pets` returns ALL pets + owner email/phone anonymously — F-04 |
| CORS | `[x]` | cross-origin **writes** rejected 403 ("Origin not allowed by CORS"); reads allowed |
| Ownership / IDOR | `[x]` | cross-user pet read, QR gen, adoption list, notifications share verified 401/403 |
| Error handling | `[x]` | API validation, 400/401/403/404; UI renders friendly messages (except F-01 raw error; F-02/F-03 configured-missing) |
| Backend regression tests | `[x]` | `MONGODB_URI`+`JWT_SECRET` run: 16 suites / 160 ok (see `/tmp/opencode/backend-tests.log`) |
| Frontend lint / build | `[x]` | lint passes (2 known set-state-in-effect warnings); build passes (chunk-size warning only) |
| isCompose config | `[x]` | `docker compose config -q` OK |
| Responsive / mobile | `[x]` | 390×844: no horizontal overflow, mobile nav toggle, stat grid intact |
| Legacy frontend serving | `[~]` | legacy `frontend/` no longer served by nginx; backend ships a dead fallback listener — F-07 |

---

## 3. FINDINGS

### F-01 — Editing a pet always returns HTTP 500 (core workflow broken) — [!] HIGH
- **Area:** Pets (owner edit)
- **Behavior:** `PUT /api/pets/:id` with a breed **name** → `500 Pet validation failed: breed: Cast to ObjectId failed for value "Labrador Retriever"...` as a raw mongoose error shown inline in the UI. The React form always sends the breed name, so **every** pet edit fails. `PUT` that omits `breed` returns 200.
- **Root cause:** `pet.breed` is an `ObjectId` path. The update handler checks `typeof pet.breed === "string"` before converting — but the mongoose getter returns the stored `ObjectId`, so the guard never fires and the name is assigned straight onto the ObjectId path; `save()` throws `ValidationError`.
- **Evidence:** repro run inside `famipet-backend-1` (`pet.breed = "Labrador Retriever"` → getter still returns ObjectId → `save()` throws); curl `PUT /api/pets/<own pet>` 500; UI edit attempt shows the cast error in `.pet-form-error`.
- **Files:** `backend/controllers/pet.controller.js:275-340` (dead conversion), `frontend-react/src/pages/app/mypet/petBase.ts` (+ `PetFormModal.tsx`, payload always has `breed`).
- **Impact:** owners cannot update name/breed/etc. for any existing pet; health/other sub-features unaffected because they live on separate records.
- **Action:** in `updatePet`, resolve a breed *name* to an `ObjectId` (lookup) before assigning (or drop `breed` from the direct-assignment set and update it explicitly); convert `ValidationError` → `400` with a friendly message so UI never shows a raw Mongo error.

### F-02 — Signup and forgot-password return HTTP 500 (no SMTP) — [!] HIGH
- **Area:** Auth (email-verification / password-reset enablement)
- **Behavior:** `POST /api/auth/register` → 500 "Unable to send verification email. Please try again." and the new user is deleted (rolled back). `POST /api/auth/forgot-password` → 500 "Unable to send reset email. Please check email configuration." Root `.env` contains **no `EMAIL_*` variables** (verified 0 matches); `backend/config/email.js` returns `false` when unset.
- **Evidence:** curl + browser both 500; UI shows the friendly message; DB confirms no `auditsignup@famipet.in` user created. Signup email-error field and forgot-password error are displayed correctly by the React UI.
- **Files:** `.env` (absent `EMAIL_*`), `backend/config/email.js`, `backend/controllers/auth.controller.js` (≈:298 register email-fail branch, ≈:508 reset).
- **Impact:** new users cannot create accounts; existing users cannot reset passwords — in this deployment the whole email-verification feature set is non-functional.
- **Action:** supply SMTP credentials (`EMAIL_HOST/PORT/USER/PASS/FROM`) in the deployment env; **or** if the email feature is intentionally deferred for launch, explicitly gate/disable these routes with a clear pre-form notice (not a 500). Product decision required.

### F-03 — Emailed verification/reset links land on the React 404 — [!] HIGH
- **Area:** Auth deep links (works even after F-02 is fixed)
- **Behavior:** the backend builds links to legacy paths `/pages/verify-email.html?token=…` and `/pages/reset-password.html?token=…`. The legacy frontend is no longer hosted; nginx sends everything to the React SPA, which has no such route (React uses `/verify-email/:token`, `/reset-password/:token`) → **NotFound "404 Page not found"**.
- **Evidence:** browser + curl on `/pages/verify-email.html?token=fake` → React 404; React route table has no `/pages/*` and no legacy redirects. `/verify-email/fake-token` correctly renders the friendly "Verification Failed / invalid or has expired" state.
- **Files:** `backend/controllers/auth.controller.js:179,:508` (link construction), `frontend-react/src/routes/routeConfig.tsx` (no legacy routes), `backend/server.js:196-228` (fallback listener can't compensate — see F-07), `frontend-react/nginx.conf`.
- **Impact:** even with SMTP configured (F-02), emailed links never complete verification or reset.
- **Action:** emit the React paths (`/verify-email/:token`, `/reset-password/:token`) from the backend; optionally add a `/pages/*` → SPA redirect in the frontend nginx for legacy robustness.

### F-04 — Unauthenticated `GET /api/pets` exposes full owner PII — [~] MEDIUM
- **Area:** Public API / privacy boundary
- **Behavior:** `GET /api/pets` (anonymous) returns **all** pets regardless of adoption status, each with a populated owner containing `name`, `email`, `phone`. README documents only the adoption catalogue endpoints (`/api/pets`, `/api/pets/featured`) as intentionally public — the contact fields exceed that intent and cover non-adoptable pets.
- **Evidence:** curl (no auth) → 8 pets each with `owner: {name, email, phone}`; no status filter in the controller query.
- **Files:** `backend/controllers/pet.controller.js` (list handler, populated owner projection).
- **Impact:** anonymous enumeration of all users' emails/phones; spam/scraping surface.
- **Action:** filter the public list to adoptable/available pets only, and/or restrict the public projection to name-only (drop email/phone) unless a feature genuinely requires it.

### F-05 — Adoption applicants cannot withdraw their own request — [~] LOW/MEDIUM
- **Area:** Adoption
- **Behavior:** the only `DELETE /api/adoptions/:id` route is `adminOnly`; there is no user-owned cancellation and no persistent "My Applications" screen (dashboard only shows a count via `getMyAdoptions`).
- **Evidence:** `backend/routes/adoption.routes.js` (DELETE admin-only); AdoptionPage offers browse+apply only.
- **Impact:** an accidental or changed-mind application must wait for an admin to act.
- **Action (optional):** add an ownership-checked DELETE for the applicant, mirroring the notifications pattern.

### F-06 — Notifications have no per-item mark-as-read — [-] LOW
- **Area:** Notifications UX
- **Behavior:** the bell panel offers only "Mark all read" (bulk). The backend already has `PUT /api/notifications/:id/read`, unused by the UI.
- **Evidence:** `frontend-react/src/components/shared/NotificationBell.tsx` (bulk only); `backend/routes/notification.routes.js:38`.
- **Impact:** minor UX gap; unread/read state itself persists and reloads correctly.
- **Action (optional):** wire item click → `PUT /:id/read`.

### F-07 — Dead legacy-frontend fallback listener ships in the backend image — [~] LOW
- **Area:** Architecture / deployment hygiene
- **Behavior:** `server.js` starts a second Express static server for `../frontend` (legacy) on the `CLIENT_URL` port *inside the backend container*. The production image does not contain the legacy `frontend/` directory and that listener's port is neither published nor proxied — in the container it is inert; in Dev (standalone) it legitimately serves the legacy UI for emailed links.
- **Evidence:** `backend/server.js:196-228`; backend Dockerfile COPY list (no `frontend`); nginx owns `5502`.
- **Impact:** dead weight + confusion in prod; reinforces F-03 when someone "fixes" links by enabling the listener.
- **Action:** gate the listener on non-production (`NODE_ENV !== "production"`), keep it for local dev.

### Non-findings (checked, fine)
- QR-code content (owner name + phone) is **documented intent** (README §Digital Pet ID) — a pet-ID tag's purpose is lost-pet contact; keep phone, ensure no other fields get added to the QR.
- Public `/api/notifications` is 401-verified; notification/reminder/adoption/`qr`/direct-pet reads are ownership-checked (403 cross-user, verified).
- Breed Identifier mismatch acceptance: AI confidence surfaced honestly (no overclaiming).
- "I am a… role cards" on signup are UI-only (no role sent; backend derives role) — documented in-code, informational.

---

## 4. REGRESSION / VERIFICATION RECORD

- Backend: `npm test` (MONGODB_URI + JWT_SECRET) → **16 suites, 160 ok** (`/tmp/opencode/backend-tests.log`).
- Frontend: `npm run lint` passes (2 known set-state-in-effect warnings: `VerifyEmailPage.tsx:24`, `AuthContext.tsx:32`); `npm run build` passes (chunk >500 kB warning only).
- `docker compose config -q` → OK; all services healthy (incl. `catlium-omniroute` host gateway).
- Manual QA: 14 user routes + 6 admin routes + 7 auth/public flows; adoption apply end-to-end; community like round-trip; breed AI; PetGPT; QR; profile save; 390px responsive.
- Environment hygiene: test adoption, test appointment (+ its reminder + notification), and the test PetGPT conversation were deleted after QA; the throwaway `famipet-audit-mongo` container was removed; DB matches seed (8 pets, 7 users, 6 appointments, seed reminders/notifications/adoption intact).

## 5. RECOMMENDED NEXT STEP (not performed — audit is read-only)

Fix, in order, **F-01 → F-02 (env) → F-03 → F-04**, then re-run `npm test` + the manual pet-edit and signup/password-reset flows. F-05/F-06/F-07 are optional polish/hygiene.