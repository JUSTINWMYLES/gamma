# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

ARG VITE_SERVER_URL=ws://localhost:2567

# Copy root workspace manifests
COPY package.json package-lock.json* ./
COPY client/app/package.json ./client/app/

# Shared types and Colyseus client used by the app
COPY client/shared/ ./client/shared/

# Root-level Svelte/Tailwind/PostCSS configs
COPY svelte.config.js tailwind.config.cjs postcss.config.cjs ./

# Audio assets bundled into the build via the extraStaticDir Vite plugin
COPY audio/ ./audio/

# Install app dependencies via workspace
RUN npm install --workspace=client/app --ignore-scripts

# Copy the rest of the app source
COPY client/app/ ./client/app/

ENV VITE_SERVER_URL=$VITE_SERVER_URL

RUN npm run build --workspace=client/app

# ── Nginx runtime ──────────────────────────────────────────────────────────────
FROM nginx:1.25-alpine AS runtime

COPY --from=builder /app/client/app/dist /usr/share/nginx/html

RUN printf 'server {\n  listen 80;\n  root /usr/share/nginx/html;\n  location / { try_files $uri $uri/ /index.html; }\n}\n' \
    > /etc/nginx/conf.d/default.conf

EXPOSE 80
