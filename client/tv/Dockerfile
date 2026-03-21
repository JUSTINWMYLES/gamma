# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

ARG VITE_SERVER_URL=ws://localhost:2567

COPY package.json package-lock.json* ./
COPY client/tv/package.json ./client/tv/
COPY client/src/ ./client/src/
COPY client/shared/ ./client/shared/
COPY svelte.config.js tailwind.config.cjs postcss.config.cjs ./

RUN npm install --workspace=client/tv --ignore-scripts

COPY client/tv/ ./client/tv/

ENV VITE_SERVER_URL=$VITE_SERVER_URL

RUN npm run build --workspace=client/tv

# ── Nginx runtime ──────────────────────────────────────────────────────────────
FROM nginx:1.25-alpine AS runtime

COPY --from=builder /app/client/tv/dist /usr/share/nginx/html

# SPA fallback: any 404 → index.html
RUN printf 'server {\n  listen 80;\n  root /usr/share/nginx/html;\n  location / { try_files $uri $uri/ /index.html; }\n}\n' \
    > /etc/nginx/conf.d/default.conf

EXPOSE 80
