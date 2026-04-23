# GAMMA — ROOT

## PROJECT OVERVIEW
Party game platform: Colyseus WebSocket server (TypeScript) + Svelte SPA client (phone + TV in one app) + Go Kubernetes operator.

## TECH STACK
| Layer | Technology |
|-------|-----------|
| Game server | Colyseus 0.15 + Express, TypeScript, Node 20 |
| Client | Svelte 4 + Vite, TypeScript (unified phone + TV SPA) |
| State sync | Colyseus Schema (in-memory only — no persistent DB) |
| Infra | Docker Compose (dev), Kubernetes via Go operator (prod) |
| Observability | OpenTelemetry (server) |
| Tests | Vitest (server unit), Playwright (e2e) |

## REPO STRUCTURE
```
gamma/
├── server/src/
│   ├── rooms/          GammaRoom.ts — single Colyseus room type
│   ├── games/          BaseGame + registry-NN-slug plugin dirs
│   ├── schema/         Colyseus Schema definitions (RoomState, PlayerState, …)
│   ├── utils/          rng.ts, helpers
│   └── telemetry.ts    OTEL meter/tracer exports
├── client/
│   ├── app/src/        Svelte SPA — screens/, games/, lib/, stores/
│   └── shared/         colyseusClient.ts, types.ts, playerIconDesign.ts
├── operator/           Go k8s operator — GammaInstance CRD
├── k8s/                Raw manifests + Helm chart
├── docs/               ADRs, developer guides
└── Makefile            make dev / make test-unit / make e2e / make generate
```

## CRITICAL CONVENTIONS

### Server
- One room type: `"gamma_room"` (GammaRoom.ts). Never add a second Colyseus room type.
- Game plugins live in `server/src/games/registry-NN-slug/index.ts` and are **auto-discovered** — no central registration required.
- Always use `server/src/utils/rng.ts` seeded RNG — never `Math.random()`.
- Do not store raw WebSocket client objects across async awaits — use `sessionId` and `room.clients` lookup.

### Client
- Single Vite build for phone AND TV — do not split into two apps.
- `verbatimModuleSyntax` MUST NOT be set in `client/app/tsconfig.json` (Svelte Vite plugin incompatibility).
- Viewer (TV) components are display-only — never call `room.send()` from viewer code.
- Runtime server URL is injected via `window.__GAMMA_CONFIG__.serverUrl` from `/config.js` in container deployments.

### General
- No persistent database — all game state is in-memory Colyseus Schema.
- Feature branches: `feature/<slug>`, fixes: `fix/<slug>`.

## MAKE COMMANDS
```bash
make dev          # start server + client in watch mode
make test-unit    # vitest server unit tests
make e2e          # Playwright end-to-end
make generate     # regenerate Go deepcopy + CRD manifests (operator)
make build        # production Docker images
```

## KEY DOCS
- `docs/onboarding.md` — quickstart for new devs
- `docs/developers/contributing-games.md` — full game plugin guide
- `docs/adr/` — architecture decision records

## SUBDIRECTORY AGENTS.MD
| Path | Covers |
|------|--------|
| `server/src/games/AGENTS.md` | Game plugin system, BaseGame API, all registered games |
| `server/src/rooms/AGENTS.md` | GammaRoom internals, message handlers, reconnect flow |
| `client/app/src/AGENTS.md` | SPA routing, player vs viewer split, state management |
| `client/shared/AGENTS.md` | Connection layer, shared types, icon design |
| `operator/AGENTS.md` | Go operator, GammaInstance CRD, reconcile order |
