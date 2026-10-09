# Graph Report - FamiPet  (2026-10-08)

## Corpus Check
- 300 files · ~2,972,705 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2593 nodes · 4944 edges · 143 communities (125 shown, 18 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 139 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0c3767eb`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- dependencies
- HealthPage.tsx
- communityBase.ts
- admin.controller.js
- devDependencies
- community.js
- lostFound.controller.js
- auth.controller.js
- 11. Phased Plan
- reminders.js
- FamiPet — Migration Plan: Vanilla → Vite + React + TypeScript + Tailwind
- adoption.js
- health.js
- mypet.js
- appointments.js
- compilerOptions
- FamiPet — Agent Instructions
- FamiPet — Frontend Design Reference (Vanilla HTML/CSS/JS)
- lost-found.js
- signup.js
- compilerOptions
- LostFoundPage.tsx
- seedData.js
- health.routes.js
- routeConfig.tsx
- client.ts
- veterinarian.controller.js
- appointment.controller.js
- dashboard-data.js
- server.js
- breed.controller.js
- AppointmentsPage.tsx
- notification.controller.js
- petgpt.js
- reset-password.js
- auth.js
- breed-details.js
- pets.ts
- pet-id.js
- login.js
- admin-lost-found.js
- breeds.js
- conversation.controller.js
- home.js
- admin-adoptions.js
- admin-community.js
- admin-pets.js
- forgot-password.js
- theme.js
- admin-dashboard.js
- admin-users.js
- settings.js
- sidebar.js
- React + TypeScript + Vite
- decode_image
- generation.worker.js
- favorite.controller.js
- DashboardPage.tsx
- adoption.controller.js
- tsconfig.json
- petgpt-jobs-tools.test.js
- admin.ts
- apiGet
- conversation-api.test.js
- Migration Execution Protocol
- Pet.js
- user.routes.js
- AdoptionPage.tsx
- plugins
- push-notifications.test.js
- Icon.tsx
- openai.js
- reminder.routes.js
- project-blackbook/SKILL.md
- registry.js
- PetGPTPage.tsx
- project-diagrams/SKILL.md
- BACKEND PHASE 3 — SECURITY, VULNERABILITY & SECURITY-HARDENING AUDIT
- Project Proposal Skill
- petgpt-quota-reliability.test.js
- petgpt-security.test.js
- BreedsPage.tsx
- community.controller.js
- PetGPT — Enhancement Working Reference
- petgpt-jobs.test.js
- petgpt-tools.test.js
- 3. FINDINGS
- 16. Phase 2 — Persistent Conversations + Messages + Chat Lifecycle
- 22. Frontend Integration Guide
- 19. Phase 5 — Pet-Aware Context + Backend Tool Calling
- 17. Phase 3 — Provider / API-Key / Model Configuration
- 20. Phase 6 — Mutation Tools, Per-User Limits & Reliability
- 18. Phase 4 — Durable AI Generation + Background Jobs
- 12. Architecture Roadmap (design intent)
- 21. Phase 7 — Production Readiness & Security Hardening
- vaccination.routes.js
- 15. Phase 0/1 Implementation Status & Verification
- 2. Complete Request/Response Flow
- SettingsPage.tsx
- pet.controller.js
- read-tools.js
- upload.js
- Backend Phase 2 — ESLint Cleanup Report
- mutation-tools.js
- petgpt-mutation-tools.test.js
- devDependencies
- ai-provider.test.js
- backend/package.json
- breed-ai.test.js
- App.tsx
- AdminTopbar.tsx
- logger.js
- db.js
- apiPost
- multer
- compression
- web-push
- appointment.service.js
- eslint.config.js
- mongoose
- breed/schema.js
- dotenv
- express
- service.js
- FamiPet
- helmet
- env-validator.test.js
- test_api.py
- zod
- env.js
- pet-qr-url.test.js
- CommunityPost.js
- LostFound.js
- Reminder.js
- Phase Status
- cors
- system_architecture.py

## God Nodes (most connected - your core abstractions)
1. `Icon()` - 69 edges
2. `react` - 65 edges
3. `apiGet()` - 47 edges
4. `apiPost()` - 35 edges
5. `11. Phased Plan` - 33 edges
6. `apiPut()` - 28 edges
7. `apiDelete()` - 27 edges
8. `PetGPT — Enhancement Working Reference` - 25 edges
9. `main()` - 23 edges
10. `SettingsPage()` - 23 edges

## Surprising Connections (you probably didn't know these)
- `FamiPetAPI` --indirect_call--> `apiUrl()`  [INFERRED]
  frontend/js/api.js → frontend-react/src/api/client.ts
- `FamiPetAPI` --indirect_call--> `getToken()`  [INFERRED]
  frontend/js/api.js → frontend-react/src/api/client.ts
- `FamiPetAPI` --indirect_call--> `setToken()`  [INFERRED]
  frontend/js/api.js → frontend-react/src/api/client.ts
- `FamiPetAPI` --indirect_call--> `getUser()`  [INFERRED]
  frontend/js/api.js → frontend-react/src/api/client.ts
- `FamiPetAPI` --indirect_call--> `setUser()`  [INFERRED]
  frontend/js/api.js → frontend-react/src/api/client.ts

## Import Cycles
- None detected.

## Communities (143 total, 18 thin omitted)

### Community 0 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, bcryptjs, cloudinary, jsonwebtoken, morgan, nodemailer, qrcode, winston (+7 more)

### Community 1 - "HealthPage.tsx"
Cohesion: 0.10
Nodes (40): apiDelete(), createHealthRecord(), deleteHealthRecord(), getHealthRecords(), HealthRecord, HealthRecordMutationResponse, HealthRecordPayload, HealthRecordsResponse (+32 more)

### Community 2 - "communityBase.ts"
Cohesion: 0.11
Nodes (38): addCommunityComment(), CommunityComment, CommunityPost, CommunityResponse, createCommunityPost(), deleteCommunityPost(), getCommunityPosts(), toggleCommunityLike() (+30 more)

### Community 3 - "admin.controller.js"
Cohesion: 0.12
Nodes (24): Adoption, CommunityPost, deleteCommunityPost(), deleteLostFoundReport(), deletePet(), deleteUser(), getAllCommunityPosts(), getAllLostFoundReports() (+16 more)

### Community 4 - "devDependencies"
Cohesion: 0.05
Nodes (37): dependencies, lucide-react, react, react-dom, react-router-dom, devDependencies, oxlint, tailwindcss (+29 more)

### Community 5 - "community.js"
Cohesion: 0.14
Nodes (31): addComment(), run(), applyFilters(), attachAllInteractions(), attachCommentButton(), attachLikeButton(), attachMoreButton(), attachShareButton() (+23 more)

### Community 6 - "lostFound.controller.js"
Cohesion: 0.16
Nodes (12): getAllBreeds(), getAllPosts(), getAllReports(), logger, LostFound, mongoose, { str, strLower, searchStr }, getAllPets() (+4 more)

### Community 7 - "auth.controller.js"
Cohesion: 0.15
Nodes (24): isEmailConfigured(), sendEmail(), changePassword(), crypto, forgotPassword(), generateToken(), getClientBase(), getMe() (+16 more)

### Community 8 - "11. Phased Plan"
Cohesion: 0.06
Nodes (33): 11. Phased Plan, Canonical production stack — root `docker-compose.yml` (integrated post-merge), Final Dockerization — production-ready frontend + backend (post Phase 28), Notifications (plan §15; delivered inside Phases 10–14), Phase 10 — Health, Phase 11 — Vaccinations, Phase 12 — Appointments, Phase 13 — Veterinarians (+25 more)

### Community 9 - "reminders.js"
Cohesion: 0.16
Nodes (26): bindMoreButtons(), closeReminderMenus(), completeReminder(), convertTimeToInput(), deleteReminder(), escapeHTML(), formatBackendTime(), formatDate() (+18 more)

### Community 10 - "FamiPet — Migration Plan: Vanilla → Vite + React + TypeScript + Tailwind"
Cohesion: 0.13
Nodes (14): 10. Authentication Strategy, 12. Dependency / sequencing notes, 13. Invariants during migration (do-not-break list), 1. Purpose & Principles, 2. Proposed React Project Structure, 3. Component Organization, 4. Page Organization, 5. API / Service Organization (+6 more)

### Community 11 - "adoption.js"
Cohesion: 0.13
Nodes (23): addPetBtn, adoptionType(), categoryCards, closeDetailModal(), createModal(), close(), defaultPetsData, detailModal (+15 more)

### Community 12 - "health.js"
Cohesion: 0.20
Nodes (25): addNotification(), closeModal(), escapeHtml(), fetchHealthRecords(), fetchNotifications(), fetchPets(), fetchVaccinations(), formatDate() (+17 more)

### Community 13 - "mypet.js"
Cohesion: 0.19
Nodes (24): addNewPet(), buildPetPayload(), capFirst(), createPetCard(), createPetOnBackend(), deletePet(), deletePetOnBackend(), editPet() (+16 more)

### Community 14 - "appointments.js"
Cohesion: 0.18
Nodes (21): addNotification(), closeBookingModal(), closeRescheduleModal(), formatBackendDate(), formatBackendTime(), formatDate(), loadAppointments(), mapStatusFromBackend() (+13 more)

### Community 15 - "compilerOptions"
Cohesion: 0.08
Nodes (23): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+15 more)

### Community 16 - "FamiPet — Agent Instructions"
Cohesion: 0.08
Nodes (23): 10. Digital Pet ID / QR, 11. Empty States, 12. Validation & Error Handling, 13. API Changes, 14. Security, 15. Existing Functionality Comes First, 16. Development Workflow, 17. Testing Rules (+15 more)

### Community 17 - "FamiPet — Frontend Design Reference (Vanilla HTML/CSS/JS)"
Cohesion: 0.10
Nodes (20): 1.1 Global tokens — `frontend/css/style.css` (`:root`), 1.2 Auth token set — `frontend/css/login.css` (own `:root`), 1.3 User-app token sets (each page CSS has its OWN `:root`; names collide, values differ), 1.4 Fonts (per page — inconsistent, documented as-is), 1.5 Admin tokens — `frontend/admin/css/admin.css`, 1. Design Tokens, 2.1 Shared / global components, 2.2 Auth components (login.css + signup.css) (+12 more)

### Community 18 - "lost-found.js"
Cohesion: 0.21
Nodes (20): clearFilters(), closeAllOverlays(), closeModal(), closeNotificationOutside(), createPetCard(), escapeHTML(), fileToDataURL(), formatDate() (+12 more)

### Community 19 - "signup.js"
Cohesion: 0.10
Nodes (20): confirmPassword, confirmPasswordError, email, emailError, fullName, nameError, password, passwordError (+12 more)

### Community 20 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+11 more)

### Community 21 - "LostFoundPage.tsx"
Cohesion: 0.14
Nodes (26): createReport(), deleteReport(), getReports(), LostFoundReport, LostFoundResponse, updateReport(), buildMailto(), DetailsModal() (+18 more)

### Community 22 - "seedData.js"
Cohesion: 0.09
Nodes (18): healthRecordSchema, mongoose, mongoose, vaccinationSchema, Adoption, Appointment, Breed, CommunityPost (+10 more)

### Community 23 - "health.routes.js"
Cohesion: 0.20
Nodes (12): createHealthRecord(), deleteHealthRecord(), getHealthRecordById(), getHealthRecords(), HealthRecord, mongoose, Pet, updateHealthRecord() (+4 more)

### Community 24 - "routeConfig.tsx"
Cohesion: 0.13
Nodes (18): resendVerification(), AuthSplash(), useAuth(), AdminLayout(), AdminSidebar(), NAV_ITEMS, AppLayout(), AuthLayout() (+10 more)

### Community 25 - "client.ts"
Cohesion: 0.21
Nodes (18): FamiPetAPI, API_BASE, apiPatch(), apiPostForm(), apiRequest(), apiUrl(), getToken(), getUser() (+10 more)

### Community 26 - "veterinarian.controller.js"
Cohesion: 0.18
Nodes (13): createVeterinarian(), deleteVeterinarian(), getAllVeterinarians(), getVeterinarianById(), logger, mongoose, { str, searchStr }, updateVeterinarian() (+5 more)

### Community 27 - "appointment.controller.js"
Cohesion: 0.13
Nodes (17): Appointment, createAppointment(), { createAppointmentForUser }, deleteAppointment(), getAppointments(), mongoose, Notification, Pet (+9 more)

### Community 28 - "dashboard-data.js"
Cohesion: 0.33
Nodes (14): ageText(), breedName(), esc(), fillGreeting(), fmtDate(), fmtTime(), init(), loadActivity() (+6 more)

### Community 29 - "server.js"
Cohesion: 0.11
Nodes (18): allowedOrigins, app, compression, cors, express, FRONTEND_DIR, fs, helmet (+10 more)

### Community 30 - "breed.controller.js"
Cohesion: 0.13
Nodes (18): breedAiStatus(), Breed, { breedAiStatus }, createBreed(), deleteBreed(), getBreedAiStatus(), getBreedById(), logger (+10 more)

### Community 31 - "AppointmentsPage.tsx"
Cohesion: 0.09
Nodes (40): AppointmentMutationResponse, AppointmentPayload, AppointmentsResponse, ApptPet, ApptVet, createAppointment(), deleteAppointment(), getAppointments() (+32 more)

### Community 32 - "notification.controller.js"
Cohesion: 0.06
Nodes (38): configured, encode(), logger, realTransport(), webpush, deleteNotification(), deletePushSubscription(), getNotifications() (+30 more)

### Community 33 - "petgpt.js"
Cohesion: 0.42
Nodes (10): addAIMessage(), addUserMessage(), escapeHTML(), getCurrentTime(), getResponse(), getUserAvatarSource(), removeTyping(), scrollToBottom() (+2 more)

### Community 34 - "reset-password.js"
Cohesion: 0.18
Nodes (10): confirmPassword, confirmPasswordError, params, password, passwordError, resetBtn, resetForm, toggleConfirmPassword (+2 more)

### Community 35 - "auth.js"
Cohesion: 0.13
Nodes (14): adminOnly(), jwt, logger, protect(), User, express, lostFoundController, { protect } (+6 more)

### Community 36 - "breed-details.js"
Cohesion: 0.47
Nodes (9): breedImage(), breedTag(), escapeHTML(), loadBreed(), render(), section(), showProblem(), speciesLabel() (+1 more)

### Community 37 - "pets.ts"
Cohesion: 0.12
Nodes (31): createPet(), deletePet(), getPetQr(), getPublicPetByUid(), PetMutationResponse, PetPayload, PetsResponse, PublicPet (+23 more)

### Community 38 - "pet-id.js"
Cohesion: 0.42
Nodes (7): capFirst(), escapeHTML(), generateQr(), loadPets(), petImage(), refreshPreview(), showIdCard()

### Community 39 - "login.js"
Cohesion: 0.25
Nodes (7): email, emailError, form, loginBtn, password, passwordError, toggle

### Community 40 - "admin-lost-found.js"
Cohesion: 0.52
Nodes (6): escapeHTML(), loadReports(), showToast(), speciesLabel(), statusPill(), typePill()

### Community 41 - "breeds.js"
Cohesion: 0.57
Nodes (6): breedImage(), breedTag(), escapeHTML(), loadBreeds(), renderBreeds(), speciesLabel()

### Community 42 - "conversation.controller.js"
Cohesion: 0.07
Nodes (39): publicMessage(), { AI_CONFIG }, enforceGenerationQuota(), GenerationJob, AI_CONFIG, addMessage(), { AI_CONFIG, outOfScopeResponse }, clearConversation() (+31 more)

### Community 43 - "home.js"
Cohesion: 0.33
Nodes (5): backToTop, services, servicesGrid, whyChoose, whyGrid

### Community 44 - "admin-adoptions.js"
Cohesion: 0.70
Nodes (4): escapeHTML(), loadAdoptions(), showToast(), statusPill()

### Community 45 - "admin-community.js"
Cohesion: 0.70
Nodes (4): escapeHTML(), loadPosts(), showToast(), statusPill()

### Community 46 - "admin-pets.js"
Cohesion: 0.80
Nodes (4): escapeHTML(), loadPets(), showToast(), statusPill()

### Community 47 - "forgot-password.js"
Cohesion: 0.40
Nodes (4): emailError, emailInput, forgotBtn, forgotForm

### Community 48 - "theme.js"
Cohesion: 0.80
Nodes (4): applyTheme(), getThemeButtons(), initTheme(), updateIcons()

### Community 49 - "admin-dashboard.js"
Cohesion: 0.83
Nodes (3): escapeHTML(), loadDashboard(), loadRecentUsers()

### Community 50 - "admin-users.js"
Cohesion: 0.83
Nodes (3): escapeHTML(), loadUsers(), showToast()

### Community 54 - "React + TypeScript + Vite"
Cohesion: 0.50
Nodes (3): Expanding the Oxlint configuration, React Compiler, React + TypeScript + Vite

### Community 55 - "decode_image"
Cohesion: 0.05
Nodes (57): decode_image(), InvalidImageError, The upload is not a usable raster image. The message is safe to return to the…, ImageNet class name -> stable lowercase slug., Validate `raw` bytes and return a fully-loaded PIL image. Two passes are…, slugify_label(), health(), predict() (+49 more)

### Community 56 - "generation.worker.js"
Cohesion: 0.08
Nodes (30): { AI_CONFIG }, buildConversationContext(), { currentUserTurnPrefix }, { loadPetContext }, Message, updateConversationMetadata(), loadPetContext(), { adapter } (+22 more)

### Community 57 - "favorite.controller.js"
Cohesion: 0.15
Nodes (13): addFavorite(), Favorite, getFavorites(), mongoose, Pet, removeFavorite(), User, favoriteSchema (+5 more)

### Community 58 - "DashboardPage.tsx"
Cohesion: 0.17
Nodes (20): Adoption, Appointment, Pet, Reminder, ageText(), breedName(), fmtDate(), fmtTime() (+12 more)

### Community 59 - "adoption.controller.js"
Cohesion: 0.13
Nodes (18): Adoption, createAdoption(), { createNotification }, deleteAdoption(), getAllAdoptions(), getMyAdoptions(), logger, mongoose (+10 more)

### Community 61 - "petgpt-jobs-tools.test.js"
Cohesion: 0.07
Nodes (27): stopWorker(), conversationSchema, mongoose, api(), assert, awaitJobTerminal(), jwt, mongoose (+19 more)

### Community 62 - "admin.ts"
Cohesion: 0.12
Nodes (26): AdminCommunityPost, AdminDashboardResponse, AdminDashboardStats, AdminPet, AdminPetsResponse, AdminPostsResponse, AdminReportsResponse, AdminUser (+18 more)

### Community 67 - "apiGet"
Cohesion: 0.12
Nodes (33): apiGet(), getMyPets(), completeReminder(), createReminder(), deleteReminder(), getReminders(), ReminderMutationResponse, ReminderPayload (+25 more)

### Community 68 - "conversation-api.test.js"
Cohesion: 0.06
Nodes (32): generatePetGPTResponse(), outOfScopeResponse(), { AI_CONFIG, outOfScopeResponse }, askPetGPT(), fallbackAnswer(), { generatePetGPTResponse }, getPetAdvice(), { loadPetContext } (+24 more)

### Community 69 - "Migration Execution Protocol"
Cohesion: 0.17
Nodes (12): 10. Rollback safety, 1. One phase at a time, 2. Read before implementing, 3. Preserve the existing application, 4. Implement, 5. Verify, 6. Checkpoint report, 7. Commit (+4 more)

### Community 70 - "Pet.js"
Cohesion: 0.05
Nodes (31): breedSchema, mongoose, mongoose, petSchema, bcrypt, mongoose, userSchema, assert (+23 more)

### Community 71 - "user.routes.js"
Cohesion: 0.16
Nodes (13): cloudinary, getAllUsers(), getUserById(), mongoose, Pet, toggleFavorite(), uploadAvatar(), User (+5 more)

### Community 72 - "AdoptionPage.tsx"
Cohesion: 0.10
Nodes (29): AdoptionPayload, AdoptionsResponse, AdoptionStatus, createAdoption(), getMyAdoptions(), withdrawAdoption(), getAvailablePets(), FavoriteButton() (+21 more)

### Community 73 - "plugins"
Cohesion: 0.22
Nodes (8): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema, oxc, typescript, warn

### Community 74 - "push-notifications.test.js"
Cohesion: 0.11
Nodes (12): mongoose, notificationSchema, logger, Notification, pushService, assert, KEYS, mongoose (+4 more)

### Community 75 - "Icon.tsx"
Cohesion: 0.08
Nodes (38): forgotPassword(), resetPassword(), verifyEmail(), AuthLeftPanel(), AuthLeftPanelProps, Divider(), InputBox(), InputBoxProps (+30 more)

### Community 76 - "openai.js"
Cohesion: 0.17
Nodes (17): adapter, { AI_ERROR_CODES }, { buildSystemPrompt }, { AI_CONFIG }, {
  AI_ERROR_CODES,
  AiProviderError,
  fetchWithTimeout,
  parseJson,
  userPetsText,
}, capabilities, complete(), generate() (+9 more)

### Community 77 - "reminder.routes.js"
Cohesion: 0.20
Nodes (12): completeReminder(), createReminder(), deleteReminder(), getReminders(), mongoose, Pet, Reminder, updateReminder() (+4 more)

### Community 78 - "project-blackbook/SKILL.md"
Cohesion: 0.04
Nodes (44): 10. DIAGRAM SELECTION, 11. DIAGRAM INTEGRATION, 12. TABLES, 13. SCREENSHOTS, 14. FEATURE EXPLANATION, 15. ARCHITECTURE, 16. DATABASE AND DATA, 17. WORKFLOWS AND SEQUENCES (+36 more)

### Community 79 - "registry.js"
Cohesion: 0.12
Nodes (24): logEvent(), { AI_CONFIG }, {
  listToolDeclarations,
  executeTool,
}, { logEvent }, MAX_ITERATIONS(), runToolCallingLoop(), toolLogEntry(), confirmationRequired() (+16 more)

### Community 80 - "PetGPTPage.tsx"
Cohesion: 0.08
Nodes (36): AcceptedMessageResult, addMessage(), AddMessageResult, createConversation(), CreateConversationResult, deleteConversation(), getConversation(), GetConversationResult (+28 more)

### Community 81 - "project-diagrams/SKILL.md"
Cohesion: 0.07
Nodes (28): 10. Architecture Accuracy, 11. Existing Diagrams, 12. Diagram Style, 13. Black-and-White Compatibility, 14. Diagram Source, 15. Mermaid, 16. Rendering, 17. Validation (+20 more)

### Community 82 - "BACKEND PHASE 3 — SECURITY, VULNERABILITY & SECURITY-HARDENING AUDIT"
Cohesion: 0.08
Nodes (24): 10. RATE LIMITING AUDIT, 11. ERROR HANDLING AUDIT, 12. LOGGER SECURITY AUDIT, 13. SECRETS AUDIT, 14. BUSINESS LOGIC AUDIT, 15. VULNERABILITIES FOUND, 16. VULNERABILITIES FIXED, 17. VULNERABILITIES REMAINING (not fixed — prioritized) (+16 more)

### Community 83 - "Project Proposal Skill"
Cohesion: 0.08
Nodes (24): 1. Understand the Project, 2. Understand Academic Requirements, 3. Use Existing Proposal, 4. Academic Information, Academic, Core Principle, Document Format, Expected Outcomes (+16 more)

### Community 84 - "petgpt-quota-reliability.test.js"
Cohesion: 0.10
Nodes (19): assert, Breed, Conversation, GenerationJob, http, initAppRouter(), jwt, logs (+11 more)

### Community 85 - "petgpt-security.test.js"
Cohesion: 0.09
Nodes (23): assert, Breed, buildAppRouter(), Conversation, { executeTool, listToolNames }, GenerationJob, http, { isExplicitConfirmation } (+15 more)

### Community 86 - "BreedsPage.tsx"
Cohesion: 0.14
Nodes (29): analyzeBreedImage(), Breed, BreedAiStatus, BreedAnalyzeResponse, BreedPrediction, BreedsResponse, getBreed(), getBreedAiStatus() (+21 more)

### Community 87 - "community.controller.js"
Cohesion: 0.16
Nodes (16): addComment(), CommunityPost, createPost(), deleteComment(), deletePost(), getPostById(), logger, mongoose (+8 more)

### Community 88 - "PetGPT — Enhancement Working Reference"
Cohesion: 0.12
Nodes (15): 0. FINAL ARCHITECTURE (current — supersedes the phase history below), 10. Current Limitations, 11. Bugs/Issues Status, 13. Important Architectural Constraints, 14. Phased Roadmap, 1. Current Architecture, 3. Relevant Files and Modules, 4. Current Capabilities (+7 more)

### Community 89 - "petgpt-jobs.test.js"
Cohesion: 0.14
Nodes (13): { AI_CONFIG }, assert, Breed, Conversation, GenerationJob, http, jwt, logs (+5 more)

### Community 90 - "petgpt-tools.test.js"
Cohesion: 0.13
Nodes (19): buildProviderMessages(), buildSystemPrompt(), OFF_TOPIC_KEYWORDS, PET_CARE_KEYWORDS, generateJobAnswer(), assert, Breed, { buildProviderMessages } (+11 more)

### Community 91 - "3. FINDINGS"
Cohesion: 0.13
Nodes (14): 1. EXECUTIVE SUMMARY, 2. STATUS BY FEATURE AREA, 3. FINDINGS, 4. REGRESSION / VERIFICATION RECORD, 5. RECOMMENDED NEXT STEP (not performed — audit is read-only), F-01 — Editing a pet always returns HTTP 500 (core workflow broken) — [!] HIGH, F-02 — Signup and forgot-password return HTTP 500 (no SMTP) — [!] HIGH, F-03 — Emailed verification/reset links land on the React 404 — [!] HIGH (+6 more)

### Community 92 - "16. Phase 2 — Persistent Conversations + Messages + Chat Lifecycle"
Cohesion: 0.15
Nodes (13): 16. Phase 2 — Persistent Conversations + Messages + Chat Lifecycle, API contracts (all behind `protect`; mounted `/api/ai/conversations`), Clear-chat behavior, Context/history handling, Conversation/Messages architecture, Database schema decisions (`backend/models/`), Error handling covered, External provider setup/verification (+5 more)

### Community 93 - "22. Frontend Integration Guide"
Cohesion: 0.15
Nodes (13): 22.10 Security rules, 22.11 Current limitations, 22.12 Frontend implementation checklist, 22.1 Authentication, 22.2 Conversation lifecycle, 22.3 Durable generation flow (202 + job polling), 22.4 Job states, 22.5 Tool-call behavior (+5 more)

### Community 94 - "19. Phase 5 — Pet-Aware Context + Backend Tool Calling"
Cohesion: 0.18
Nodes (11): 19. Phase 5 — Pet-Aware Context + Backend Tool Calling, Bounded calling loop (`backend/ai/tool-calling.js`), Capability gating (`backend/ai/openai.js` + `gemini.js`), Config (`backend/config/ai.js` — set env before require), Goal, Persisted metadata, Pet-aware context (`backend/ai/pet-context.js`), Phase 5 merges the original roadmap's Phase 5 ("Rich pet context") and Phase 6 ("Tool/function calling") (+3 more)

### Community 95 - "17. Phase 3 — Provider / API-Key / Model Configuration"
Cohesion: 0.20
Nodes (10): 17. Phase 3 — Provider / API-Key / Model Configuration, Active-provider resolution / precedence, API contracts (all behind `protect`; mounted `/api/ai/providers`), Encryption strategy, External provider testing setup, Goal, Ownership / scope rules, PetGPT integration (+2 more)

### Community 96 - "20. Phase 6 — Mutation Tools, Per-User Limits & Reliability"
Cohesion: 0.20
Nodes (10): 20. Phase 6 — Mutation Tools, Per-User Limits & Reliability, Config & env (`backend/config/ai.js`, `backend/.env.example`), Design rules (from the Phase 5 notes), Mutation idempotency ledger (`backend/models/MutationEffect.js`), Mutation tools (`backend/ai/tools/mutation-tools.js`), Per-user generation quota (`backend/ai/quota.js` + controller), Registry idempotency (`backend/ai/tools/registry.js`), Structured observability (`backend/ai/logging.js`) (+2 more)

### Community 97 - "18. Phase 4 — Durable AI Generation + Background Jobs"
Cohesion: 0.22
Nodes (9): 18. Phase 4 — Durable AI Generation + Background Jobs, API changes, Durability & recovery, Goal, Idempotency, Job lifecycle / state machine, Job model (`backend/models/GenerationJob.js`), Verification (2026-09-22) (+1 more)

### Community 98 - "12. Architecture Roadmap (design intent)"
Cohesion: 0.29
Nodes (7): 12. Architecture Roadmap (design intent), A. AI abstraction — one generic OpenAI-compatible adapter ✅, B. Conversation architecture ✅ implemented (Phase 2), C. Durable generation architecture (design → implement as Phase 4) ✅ implemented (see §18), D. Tool architecture ✅ implemented (Phase 5, see §19), E. Model capabilities — removed, F. Observability and limits

### Community 99 - "21. Phase 7 — Production Readiness & Security Hardening"
Cohesion: 0.33
Nodes (6): 21. Phase 7 — Production Readiness & Security Hardening, Audit — gaps found and fixed, Audit — sound by design (unchanged), Config & env, Remaining limitations (documented, not fixed this phase), Verification (2026-09-22)

### Community 100 - "vaccination.routes.js"
Cohesion: 0.20
Nodes (12): createVaccination(), deleteVaccination(), getUpcomingVaccinations(), getVaccinations(), mongoose, Pet, updateVaccination(), Vaccination (+4 more)

### Community 101 - "15. Phase 0/1 Implementation Status & Verification"
Cohesion: 0.50
Nodes (4): 15. Phase 0/1 Implementation Status & Verification, Audit verification log (2026-09-22, pre-Phase-0 baseline), Phase 0, Phase 1 — Provider abstraction + OpenAI-compatible provider

### Community 102 - "2. Complete Request/Response Flow"
Cohesion: 0.50
Nodes (4): 2. Complete Request/Response Flow, Persistent conversations (Phase 2) — `/api/ai/conversations` (auth required), `POST /api/ai/advice` (auth required) — `getPetAdvice`, `POST /api/ai/ask` (auth required) — `askPetGPT`

### Community 103 - "SettingsPage.tsx"
Cohesion: 0.12
Nodes (35): apiPut(), AppNotification, deletePushSubscription(), getNotifications(), getVapidPublicKey(), markAllNotificationsRead(), markNotificationRead(), NotificationsResponse (+27 more)

### Community 104 - "pet.controller.js"
Cohesion: 0.13
Nodes (7): Breed, logger, mongoose, Pet, { petQrPayloadUrl }, QRCode, { str, strLower, searchStr }

### Community 105 - "read-tools.js"
Cohesion: 0.11
Nodes (28): { AI_CONFIG }, Appointment, buildPetContext(), HealthRecord, loadPetRecords(), MAX(), mongoose, normalizeAppointment() (+20 more)

### Community 106 - "upload.js"
Cohesion: 0.17
Nodes (9): BREED_AI_CONFIG, BREED_AI_URL, normalizeServiceUrl(), { BREED_AI_CONFIG }, multer, path, storage, upload (+1 more)

### Community 107 - "Backend Phase 2 — ESLint Cleanup Report"
Cohesion: 0.13
Nodes (14): Backend Phase 2 — ESLint Cleanup Report, ESLint Config, ESLint Setup, Files Changed (Phase 2), Final Status, Goal, Initial vs Final Lint State, Logger Implementation (+6 more)

### Community 108 - "mutation-tools.js"
Cohesion: 0.17
Nodes (16): isValidObjectId(), requireOwnedPet(), { registerMutationTools }, { registerReadTools }, authorizeOwnedReminder(), authorizePetMutation(), {
  createAppointmentForUser,
  AppointmentError,
  APPOINTMENT_TYPES,
}, isValidCalendarDate() (+8 more)

### Community 109 - "petgpt-mutation-tools.test.js"
Cohesion: 0.05
Nodes (41): AFFIRMATIVES, isExplicitConfirmation(), REMINDER_FREQUENCIES, REMINDER_TYPES, mongoose, mutationEffectSchema, mongoose, mutationRequestSchema (+33 more)

### Community 110 - "devDependencies"
Cohesion: 0.22
Nodes (9): devDependencies, eslint, @eslint/js, globals, nodemon, eslint, @eslint/js, globals (+1 more)

### Community 112 - "backend/package.json"
Cohesion: 0.17
Nodes (11): description, main, name, scripts, dev, lint, lint:fix, seed (+3 more)

### Community 113 - "breed-ai.test.js"
Cohesion: 0.12
Nodes (24): mapImageNetLabel(), mappingSize(), slugify(), SPECIES, TABLE, buildCandidates(), assert, Breed (+16 more)

### Community 114 - "App.tsx"
Cohesion: 0.14
Nodes (13): App(), Theme, ThemeContext, ThemeContextValue, ThemeProvider(), FAMIPET_PROFILE_KEY, FAMIPET_THEME_KEY, FAMIPET_TOKEN_KEY (+5 more)

### Community 115 - "AdminTopbar.tsx"
Cohesion: 0.19
Nodes (15): AdminLostFoundReport, deleteLostFoundReport(), getAllLostFoundReports(), updateLostFoundStatus(), getAllAdoptions(), updateAdoptionStatus(), apiOrigin(), assetUrl() (+7 more)

### Community 116 - "logger.js"
Cohesion: 0.16
Nodes (10): logger, nodemailer, transporter, logger, { transporter }, fs, logDir, logger (+2 more)

### Community 117 - "db.js"
Cohesion: 0.08
Nodes (19): assert, email, mongoose, sentMail, { testDbUri }, URI, LIVE_PROVIDER_KEYS, scrubLiveProviderKeys() (+11 more)

### Community 118 - "apiPost"
Cohesion: 0.17
Nodes (16): AuthUser, getMe(), login(), LoginResponse, MessageResponse, register(), apiPost(), StoredUser (+8 more)

### Community 122 - "appointment.service.js"
Cohesion: 0.12
Nodes (12): appointmentSchema, mongoose, mongoose, veterinarianSchema, Appointment, APPOINTMENT_TYPES, AppointmentError, { createNotification } (+4 more)

### Community 125 - "breed/schema.js"
Cohesion: 0.21
Nodes (16): Breed, cleanLifespan(), cleanList(), cleanRange(), cleanShortString(), cleanString(), extractJsonObject(), LIST_FIELDS (+8 more)

### Community 128 - "service.js"
Cohesion: 0.16
Nodes (16): adapter, { AI_ERROR_CODES, fetchWithTimeout }, analyzeBreedImage(), Breed, { BREED_AI_CONFIG }, createBreed(), ENRICH_SYSTEM_PROMPT, { extractJsonObject, normalizeBreedDraft } (+8 more)

### Community 129 - "FamiPet"
Cohesion: 0.13
Nodes (14): Architecture, Current Features, Development, Docker Deployment, Environment Configuration, FamiPet, Git Workflow, Notifications (+6 more)

### Community 131 - "env-validator.test.js"
Cohesion: 0.15
Nodes (11): { analyzeEnv }, assert, badClient, badPort, good, halfAI, halfEmail, halfPush (+3 more)

### Community 134 - "env.js"
Cohesion: 0.24
Nodes (9): allOrNothing(), analyzeEnv(), FEATURE_GROUPS, isSet(), logger, REQUIRED, schema, validateEnvAndExit() (+1 more)

### Community 135 - "pet-qr-url.test.js"
Cohesion: 0.27
Nodes (6): createPet(), generateQRCode(), assert, { petQrBaseUrl, petQrPayloadUrl }, petQrBaseUrl(), petQrPayloadUrl()

### Community 140 - "Phase Status"
Cohesion: 0.67
Nodes (3): Phase 30 — Push notifications (Web Push), Phase Status, Stabilization note (2026-09-22, migrated pages only)

### Community 145 - "system_architecture.py"
Cohesion: 0.33
Nodes (4): card(), _icon_path(), White card with provider icon, title and sub-title, coloured border., Absolute path of a diagrams provider icon (no node instance needed).

## Knowledge Gaps
- **1110 isolated node(s):** `SPECIES`, `TABLE`, `Breed`, `STRING_FIELDS`, `SHORT_STRING_FIELDS` (+1105 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `Icon.tsx` to `HealthPage.tsx`, `communityBase.ts`, `apiGet`, `pets.ts`, `SettingsPage.tsx`, `AdoptionPage.tsx`, `plugins`, `PetGPTPage.tsx`, `App.tsx`, `AdminTopbar.tsx`, `LostFoundPage.tsx`, `apiPost`, `BreedsPage.tsx`, `routeConfig.tsx`, `client.ts`, `DashboardPage.tsx`, `admin.ts`, `AppointmentsPage.tsx`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `testDbUri()` connect `db.js` to `conversation-api.test.js`, `Pet.js`, `push-notifications.test.js`, `petgpt-mutation-tools.test.js`, `breed-ai.test.js`, `petgpt-quota-reliability.test.js`, `petgpt-security.test.js`, `petgpt-jobs.test.js`, `petgpt-tools.test.js`, `petgpt-jobs-tools.test.js`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `protect()` connect `auth.js` to `notification.controller.js`, `admin.controller.js`, `conversation-api.test.js`, `vaccination.routes.js`, `auth.controller.js`, `user.routes.js`, `adoption.controller.js`, `conversation.controller.js`, `reminder.routes.js`, `health.routes.js`, `community.controller.js`, `favorite.controller.js`, `veterinarian.controller.js`, `appointment.controller.js`, `breed.controller.js`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **What connects `SPECIES`, `TABLE`, `Breed` to the rest of the system?**
  _1110 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._
- **Should `HealthPage.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.09948979591836735 - nodes in this community are weakly interconnected._
- **Should `communityBase.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10741971207087486 - nodes in this community are weakly interconnected._