# Self-hosted (plain Node) deploy for Hostinger - NOT the Cloudflare
# Workers target `vinext deploy` builds for. This app doesn't use any
# Workers-only feature (see build/sites-vite-plugin.ts's comment - the BFF
# proxy routes just read `process.env` directly, identically under plain
# Node), and `next.config.ts` sets `output: "standalone"` specifically so
# `vinext build` emits a self-contained server at dist/standalone/ instead
# of a Workers bundle - confirmed by running it directly with plain `node`.
#
# Deliberately NOT using `npm run build` (`scripts/build-verified.sh`) -
# that wraps `vinext build` for this repo's original "OpenAI Sites" hosting
# platform and packages a *different*, Workers-shaped artifact
# (dist/server/index.js + dist/.openai/hosting.json, checked by
# scripts/validate-artifact.sh). We want vinext's own standalone output, so
# this Dockerfile calls `vinext build` directly.
#
# No build arguments: the image holds no environment-specific value. The backend URL and the cookie prefix
# (API_BASE_URL, AUTH_COOKIE_PREFIX) are runtime variables read from .env - see docker-compose.yml and .env.example.
# Avatar Practice needs no frontend setting: the SpatialReal App ID / Avatar ID / session token come from the backend.

FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
# --legacy-peer-deps: same flag used to install locally (see .npmrc and
# package-lock.json), just not something `npm ci` remembers on its own from
# the lockfile - it keeps npm from pulling in optional peers (webpack etc.)
# that a vinext/vite app never uses.
RUN npm ci --legacy-peer-deps

COPY . .

RUN npx vinext build

# ---- production stage --------------------------------------------------
# `dist/standalone/` is fully self-contained (its own pruned node_modules,
# public/, and client assets - confirmed live) - no separate `npm install`
# needed in this stage at all.
FROM node:22-slim

# The official node image already ships a UID 1000 `node` user/group -
# reuse it rather than creating another (a second UID-1000 user errors out).
WORKDIR /app
COPY --from=build --chown=node:node /app/dist/standalone ./
USER node

ENV HOST=0.0.0.0 \
    PORT=6356
EXPOSE 6356

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://localhost:6356/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" || exit 1

CMD ["node", "server.js"]
