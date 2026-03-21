# Gamma — Networked Multiplayer Party Game Framework

A Jackbox-style multiplayer framework where phones are controllers and a TV or laptop is the shared display. Built with Colyseus (server), Svelte + Tailwind (clients), and TypeScript throughout.

---

## Quickstart: Run Locally

```bash
# 1. Install all dependencies (server + both clients)
make install

# 2. Copy environment file
cp .env.example .env

# 3. Start everything (server + TV + phone clients in parallel)
make dev
```

Open in your browser:
- **TV display**: http://localhost:5173
- **Phone controller**: http://localhost:5174
- **Server health**: http://localhost:2567/health

---

## Quickstart: Docker Compose

```bash
docker compose up --build
```

- TV: http://localhost:5173
- Phone: http://localhost:5174
- Server: ws://localhost:2567

---

## Project Structure

```
gamma/
├── server/                        # Colyseus game server (Node.js + TypeScript)
│   ├── src/
│   │   ├── index.ts               # HTTP + WebSocket server entry point
│   │   ├── rooms/
│   │   │   └── GammaRoom.ts       # Main Colyseus room — all sessions
│   │   ├── schema/                # Colyseus Schema (replicated state)
│   │   │   ├── RoomState.ts
│   │   │   ├── PlayerState.ts
│   │   │   ├── GameConfig.ts
│   │   │   ├── BracketState.ts
│   │   │   └── GuardState.ts
│   │   ├── games/
│   │   │   ├── BaseGame.ts        # Abstract plugin base class
│   │   │   ├── gameLoader.ts      # Dynamic plugin importer + validator
│   │   │   └── registry-14-dont-get-caught/
│   │   │       └── index.ts       # "Don't Get Caught" game plugin
│   │   └── utils/
│   │       ├── los.ts             # Line-of-sight (DDA ray cast)
│   │       ├── tilemap.ts         # Map data, patrol path, spawn positions
│   │       ├── rng.ts             # Seeded RNG + room code generator
│   │       └── bracket.ts        # Single-elimination bracket builder
│   ├── tests/                     # Vitest unit tests
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
│
├── client/
│   ├── shared/                    # Shared types and Colyseus connection helpers
│   │   ├── colyseusClient.ts
│   │   └── types.ts
│   ├── src/
│   │   └── global.css             # Tailwind imports
│   ├── tv/                        # TV display Svelte app
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── App.svelte
│   │   │   └── screens/           # LobbyScreen, GameScreen, Scoreboard, etc.
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── package.json
│   │   └── Dockerfile
│   └── phone/                     # Phone controller Svelte app
│       ├── src/
│       │   ├── main.ts
│       │   ├── App.svelte
│       │   └── screens/           # JoinScreen, GameScreen (joystick), etc.
│       ├── index.html
│       ├── vite.config.ts
│       ├── package.json
│       └── Dockerfile
│
├── e2e/                           # Playwright end-to-end tests
│   ├── game-flow.spec.ts
│   ├── globalSetup.ts
│   └── globalTeardown.ts
│
├── k8s/                           # Kubernetes manifests
│   ├── crds/                      # CRD definitions
│   ├── examples/                  # Example CRs
│   └── rbac.yaml
│
├── helm/
│   └── gamma-operator/            # Helm chart for the operator hub
│
├── docs/                          # Project docs and game registry
│   ├── architecture.md
│   ├── scaffolding.md
│   ├── onboarding.md
│   ├── registry-14-design.md
│   └── registry/
│
├── docker-compose.yml
├── playwright.config.ts
├── Makefile
├── package.json                   # Root workspace
├── tsconfig.json
└── .env.example
```

---

## Available Make Commands

| Command | Description |
|---|---|
| `make install` | Install all dependencies + Playwright browsers |
| `make dev` | Start server + TV + phone in watch mode |
| `make dev-server` | Server only |
| `make compose-up` | Docker Compose (server + TV + phone) |
| `make compose-down` | Stop Docker Compose |
| `make build` | Build TypeScript + Svelte bundles |
| `make test` | Unit tests + E2E tests |
| `make test-unit` | Server Vitest tests only |
| `make test-e2e` | Playwright E2E tests |
| `make docker-build` | Build all Docker images |
| `make helm-install-operator` | Deploy operator Helm chart |
| `make clean` | Remove all build artifacts |

---

## Environment Variables

See `.env.example` for full documentation.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `2567` | Colyseus server port |
| `LOG_LEVEL` | `info` | Server log verbosity |
| `VITE_SERVER_URL` | `ws://localhost:2567` | WebSocket URL for browser clients |
| `RECONNECT_GRACE_SECONDS` | `30` | How long to hold disconnected player slots |

---

## Running Tests

```bash
# Unit tests only (fast, no server needed)
make test-unit

# E2E tests (starts server + clients automatically)
make test-e2e

# All tests
make test
```

Expected output for unit tests:
```
 ✓ tests/los.test.ts (8 tests)
 ✓ tests/tilemap.test.ts (7 tests)
 ✓ tests/rng-bracket.test.ts (14 tests)
 Test Files  3 passed (3)
```

---

## Adding a New Game

See `docs/onboarding.md` for the full guide.

Quick summary:
1. Create `server/src/games/<registry-id>/index.ts`
2. Export a `default class` that extends `BaseGame`
3. Set static metadata fields (`requiresTV`, `defaultRoundCount`, etc.)
4. Implement `runRound()`, `scoreRound()`, `handleInput()`
5. Add a button entry in `client/tv/src/screens/LobbyScreen.svelte`

No registration step — the loader finds games automatically by directory name.

---

## Security Notes

- All authoritative game logic runs on the server; clients cannot modify state
- Rate limiting: max 30 room creates/minute (configurable via GammaOperatorPolicy)
- Anti-cheat: player positions validated server-side on every move input
- Seeded RNG for all random game outcomes (bracket draws, patrol generation)
- Reconnect tokens prevent session hijacking

---

## License

See LICENSE.
