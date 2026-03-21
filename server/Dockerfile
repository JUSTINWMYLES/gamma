# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace manifests
COPY package.json package-lock.json* ./
COPY server/package.json ./server/

# Install all server dependencies
RUN npm install --workspace=server --ignore-scripts

# Copy server source
COPY server/ ./server/
COPY tsconfig.json ./

# Compile TypeScript
RUN npm run build --workspace=server

# ── Runtime stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Only production dependencies
COPY package.json package-lock.json* ./
COPY server/package.json ./server/
RUN npm install --workspace=server --omit=dev --ignore-scripts

# Copy compiled output
COPY --from=builder /app/server/dist ./server/dist

EXPOSE 2567

ENV PORT=2567 \
    LOG_LEVEL=info \
    RECONNECT_GRACE_SECONDS=30 \
    NODE_ENV=production

CMD ["node", "server/dist/index.js"]
