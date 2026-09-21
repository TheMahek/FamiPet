/* =========================================================
   FAMIPET - DEPLOY-TIME API CONFIGURATION
   =========================================================
   This file lets the frontend talk to the PRODUCTION backend.

   HOW IT WORKS
   ------------
   api.js loads this file automatically (when present) and reads
   window.__FAMIPET_CONFIG__.API_BASE. If it is set, EVERY API call
   in the app (login, verify email, dashboard, etc.) goes to that
   public URL. If it is empty/unset, the app falls back to the
   local development URL (<current-host>:5000/api) — that fallback
   is intended ONLY for running on your own machine.

   PRODUCTION SETUP
   ----------------
   Set API_BASE to the deployed *backend* API root, WITHOUT a
   trailing slash. Never use localhost, 127.0.0.1 or 192.168.x.x
   here. Example (replace with your real deployed domain):

       window.__FAMIPET_CONFIG__ = {
           API_BASE: "https://famipet-backend.example.com/api"
       };

   DEVELOPMENT
   -----------
   Leave API_BASE as "" and the app uses the dev fallback.
   ========================================================= */

window.__FAMIPET_CONFIG__ = window.__FAMIPET_CONFIG__ || {};

// API base resolution:
//   - HTTPS pages: talk to the API on the SAME origin via "/api" (avoids
//     mixed content; delivered by the Cloudflare edge in production).
//   - HTTP pages served through the dedicated nginx reverse proxy (the Docker
//     entry point on the default port 80 or the published alternative 8080):
//     same-origin "/api" again — nginx proxies /api* to the private backend.
//   - Any other HTTP page (Live Server 5502/5503 or the Express dev fallback):
//     leave API_BASE empty so api.js falls back to the local backend on the
//     same host, port 5000 ("http://<host>:5000/api").
if (!window.__FAMIPET_CONFIG__.API_BASE) {
    const proxyPorts = ["", "80", "8080"]; // empty = default port 80
    window.__FAMIPET_CONFIG__.API_BASE =
        window.location.protocol === "https:" || proxyPorts.includes(window.location.port)
            ? "/api"
            : "";
}