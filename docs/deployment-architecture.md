# Gamma — Deployment Architecture

This document covers how Gamma is deployed on Kubernetes, how traffic is routed,
and how the server and client containers relate to each other.

---

## Container Images

| Image | Source | Purpose |
|---|---|---|
| `ghcr.io/<owner>/gamma-server` | `server/Dockerfile` | Colyseus game server (WebSocket + HTTP API) |
| `ghcr.io/<owner>/gamma-client` | `client/app/Dockerfile` | Unified SPA served by nginx (handles both TV/viewer and phone/player roles) |
| `ghcr.io/<owner>/gamma-operator` | `operator/Dockerfile` | Kubernetes operator (controller-manager) |

### Why a single client image?

`client/app` is the unified SPA for both client types:
- **TV / Viewer** — when opened on a browser/TV and "Display" is selected, the app
  connects to the Colyseus server as `role: "view_screen"` and renders shared game
  state on the big screen.
- **Phone / Player** — when opened on a mobile browser and "Player" is selected,
  the app connects as `role: "player"` and shows the phone input UI.

There is no need to run separate containers for the TV and phone interfaces.
`client/phone` and `client/tv` in the repository are legacy packages that are not
built or deployed; all production traffic goes through `client/app`.

### Runtime server URL injection

The client image is a static SPA and must not have a deployment-specific server URL baked into the image.

At deployment time, the public Colyseus URL is provided via runtime config:
- the client container renders `/config.js` from `GAMMA_SERVER_URL`
- the SPA reads `window.__GAMMA_CONFIG__.serverUrl` at runtime
- when no explicit URL is injected, the SPA derives the server URL from `window.location`

---

## Kubernetes Deployment (Operator-Managed)

The Gamma Kubernetes operator watches `GammaInstance` custom resources and manages
all game infrastructure. Applying a single CR deploys the full application stack.

### Separate Pods — Server and Client are NOT Sidecars

Server and Client run as **separate Kubernetes Deployments** (not as sidecars in
the same Pod). This separation is intentional:

- **Independent scaling** — the server handles stateful WebSocket rooms; the client
  is a stateless static file server. They have different scaling characteristics.
- **Independent rollouts** — client-only UI changes can be rolled out without
  touching the server, and vice versa.
- **Failure isolation** — a crash in the client nginx process does not affect
  active game sessions on the server.

```
Namespace: <gammainstance-name>
│
├── Deployment: <name>-server    (Colyseus, 1+ replicas)
│   └── Pod: gamma-server
│       └── Container: server   (node server/dist/index.js, port 2567)
│
├── Deployment: <name>-client    (nginx SPA, 1+ replicas)
│   └── Pod: gamma-client
│       └── Container: client   (nginx, port 80)
│
├── StatefulSet: <name>-redis    (if redis backend is enabled)
│   └── Pod: gamma-redis
│       └── Container: redis    (port 6379)
│
├── Service: <name>-server       (ClusterIP, port 2567, sticky sessions)
├── Service: <name>-client       (ClusterIP, port 80)
├── Service: <name>-redis        (ClusterIP + headless, port 6379)
│
└── Ingress: <name>              (optional, nginx ingress controller)
```

---

## Traffic Ingress

### Overview

```
Internet
    │
    ▼
┌──────────────────────────────────────────────────────┐
│  Kubernetes Ingress  (nginx ingress controller)      │
│                                                      │
│  Host: gamma.example.com                             │
│                                                      │
│   /ws/*  ──────────────────────► <name>-server:2567  │  WebSocket
│   /*      ─────────────────────► <name>-client:80    │  HTTP (SPA)
└──────────────────────────────────────────────────────┘
```

### Path routing

| Path | Upstream Service | Port | Protocol |
|---|---|---|---|
| `/ws` (prefix) | `<name>-server` | 2567 | WebSocket |
| `/` (prefix, catch-all) | `<name>-client` | 80 | HTTP |

### nginx — two distinct roles

1. **nginx inside the `gamma-client` container** — serves the compiled SPA static
   files. On any path that doesn't match a static asset it returns `index.html` so
   client-side routing works correctly (SPA fallback).

2. **nginx Ingress Controller** (cluster-level) — the Kubernetes Ingress resource
   is annotated for the nginx ingress controller. It handles:
   - WebSocket upgrade (`proxy-read-timeout`, `proxy-send-timeout` set to 3600 s).
   - Sticky sessions for the game server via cookie affinity (`gamma-sticky`
     cookie, 1-hour max-age) so active WebSocket connections are not moved between
     server replicas mid-game.
   - IP-hash upstream selection (`upstream-hash-by: $remote_addr`) as a secondary
     stickiness mechanism.

Relevant ingress annotations set by the operator:

```yaml
nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
nginx.ingress.kubernetes.io/upstream-hash-by: "$remote_addr"
nginx.ingress.kubernetes.io/affinity: "cookie"
nginx.ingress.kubernetes.io/affinity-mode: "persistent"
nginx.ingress.kubernetes.io/session-cookie-name: "gamma-sticky"
nginx.ingress.kubernetes.io/session-cookie-max-age: "3600"
nginx.ingress.kubernetes.io/proxy-http-version: "1.1"
nginx.ingress.kubernetes.io/connection-proxy-header: "keep-alive"
```

User-supplied annotations in the `GammaInstance` spec override these defaults.

### Ingress is optional

If `spec.networking.ingress.enabled` is `false` (the default for local/dev
installs) no Ingress is created. You can reach the services directly via
`kubectl port-forward` or by configuring your own ingress separately.

---

## Release Artifacts

Each Git tag (`v*.*.*`) triggers the release workflow which produces:

| Artifact | Format | Contents |
|---|---|---|
| `gamma-server-<version>.tgz` | npm tarball (`npm pack`) | Compiled server JS + `package.json` |
| `gamma-client-<version>.tar.gz` | gzip tarball | Compiled SPA static files (`client/app/dist/`) |
| `gamma-operator-<version>.tgz` | Helm OCI tarball | Helm chart pushed to `oci://ghcr.io/<owner>/helm-charts` |

Tarballs are used instead of zip files because the target environment is Linux and
`tar`/`gzip` are universally available without additional tooling.

The server tarball follows the [npm pack](https://docs.npmjs.com/cli/v10/commands/npm-pack)
convention, so it stays as `.tgz` rather than a generic `.tar.gz`: it can be installed
directly with `npm install gamma-server-<version>.tgz` or published to any npm-compatible
registry with `npm publish gamma-server-<version>.tgz`.
The package is marked `"private": true` so it will not be accidentally published to
the public npm registry.

---

## Local Development

For local development (`make dev`) neither Kubernetes nor Docker is required:

```
npm run dev          # starts Colyseus server + client/app Vite dev server concurrently
```

The server uses an in-memory state backend (`STATE_BACKEND=memory`). Redis is only
used in Kubernetes deployments where the operator sets `STATE_BACKEND=redis` and
`REDIS_URL` automatically.

See [k8s-operator-design.md](./k8s-operator-design.md) for full operator design
details and [architecture.md](./architecture.md) for the application architecture.
