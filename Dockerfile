# syntax=docker/dockerfile:1
# EduPath: one container serving the API (/api) and the built web app on the same port.

# ---- 1. Install all dependencies and build the web app (dist/) ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Only Vite is needed here; skipping install scripts avoids compiling native dev-only packages (better-sqlite3).
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

# ---- 2. Runtime: production dependencies, backend source and the built app ----
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    API_PORT=3001
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY tsconfig.json ./
COPY shared ./shared
COPY backend ./backend
COPY --from=build /app/dist ./dist
# Run as the unprivileged "node" user that the official image provides.
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.API_PORT || 3001) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
# Database migrations run automatically on start-up.
CMD ["node_modules/.bin/tsx", "backend/main.ts"]
