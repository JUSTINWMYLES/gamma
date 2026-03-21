# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

ARG VITE_SERVER_URL=ws://localhost:2567

COPY package.json package-lock.json* ./
COPY client/phone/package.json ./client/phone/
COPY client/src/ ./client/src/
COPY client/shared/ ./client/shared/
COPY svelte.config.js tailwind.config.cjs postcss.config.cjs ./

RUN npm install --workspace=client/phone --ignore-scripts

COPY client/phone/ ./client/phone/

ENV VITE_SERVER_URL=$VITE_SERVER_URL

RUN npm run build --workspace=client/phone

# ── Nginx runtime ──────────────────────────────────────────────────────────────
FROM nginx:1.25-alpine AS runtime

COPY --from=builder /app/client/phone/dist /usr/share/nginx/html

RUN printf 'server {\n  listen 80;\n  root /usr/share/nginx/html;\n  location / { try_files $uri $uri/ /index.html; }\n}\n' \
    > /etc/nginx/conf.d/default.conf

EXPOSE 80
