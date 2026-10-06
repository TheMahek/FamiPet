# =========================================================
# FAMIPET - FRONTEND DOCKERFILE
# The FamiPet frontend is a plain static HTML/CSS/JS site
# (no package.json, no build tool — served today by Live
# Server / a static fallback). It is therefore served by
# the official lightweight nginx image with no build step.
# All existing files are preserved exactly as-is.
# =========================================================

FROM nginx:alpine

# 1) Frontend nginx configuration (listens on port 5502).
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 2) Copy every folder of the existing FamiPet frontend,
#    keeping the exact same relative structure so all page
#    links, CSS, JS and asset paths continue to work.
COPY index.html        /usr/share/nginx/html/index.html
COPY service-worker.js /usr/share/nginx/html/service-worker.js
COPY admin             /usr/share/nginx/html/admin
COPY assets            /usr/share/nginx/html/assets
COPY css               /usr/share/nginx/html/css
COPY js                /usr/share/nginx/html/js
COPY pages             /usr/share/nginx/html/pages

# 3) Frontend container port (matches the FamiPet CLIENT_URL
#    default of 5502). Publishing to the host happens at
#    `docker run` / Docker Compose time, not here.
EXPOSE 5502

# Health check against the static server (BusyBox wget ships with
# nginx:alpine; no extra install needed).
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:5502/ || exit 1

# nginx:alpine runs its master process as root and then drops
# worker permissions internally; no extra configuration needed.
# CMD is inherited from the nginx base image.