# =========================================================
# FAMIPET - BACKEND DOCKERFILE
# Node.js + Express + MongoDB (mongoose) API backend.
#
# The local development machine runs Node v26 and the project
# has no explicit "engines" field, so the image uses the same
# Node 26 major version (alpine, minimal musl base image).
# Dependencies are installed reproducibly from package-lock.json.
# =========================================================

FROM node:26-alpine

# Application working directory
WORKDIR /app

# 1) Copy dependency manifests FIRST and install from the lockfile.
#    This keeps the npm install layer cached unless the manifests change.
COPY package.json package-lock.json ./

# Install ONLY production dependencies (devDependencies such as nodemon
# are not needed at runtime). Nothing from the host node_modules is copied.
# --no-audit/--no-fund keep the image build free of extra network calls.
RUN npm ci --omit=dev --no-audit --no-fund

# 2) Copy the backend source (no .env, no secrets — see backend/.dockerignore).
COPY config ./config
COPY controllers ./controllers
COPY middleware ./middleware
COPY models ./models
COPY routes ./routes
COPY services ./services
COPY utils ./utils
COPY server.js ./

# 3) Runtime data directory for the local-storage image fallback.
#    Uploads normally go to Cloudinary when credentials are present;
#    the local fallback writes here and auto-creates it, but we create
#    it now so it exists and is owned by the non-root user.
RUN mkdir -p /app/uploads && chown -R node:node /app

# 4) Run as the non-root "node" user (present in official Node images).
USER node

# Backend API port (PORT env / default 5000).
# NOTE: EXPOSE does not publish the port to Windows by itself — the
# host mapping is done later at `docker run` / Docker Compose time.
EXPOSE 5000

# Health check against the existing /api/status endpoint.
# BusyBox wget ships with the alpine image (no extra install needed).
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:5000/api/status || exit 1

# 5) Start with the existing production/start command.
CMD ["node", "server.js"]