# Onboarding Guide

This document walks a new developer through setting up the project locally, running tests, and adding a new game plugin.

---

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| Node.js | 20.x |
| npm | 9.x |
| Docker + Docker Compose | 24.x / 2.x |
| Git | any recent |

### Required secrets / API keys

| Secret | Used by | How to get |
|--------|---------|-----------|
| `KLIPY_API_KEY` | Audio Overlay game (GIF search) | https://klipy.com |

---

## First-time setup

```bash
# 1. Clone the repo
git clone <repo-url> gamma && cd gamma

# 2. Install all workspace dependencies in one shot
npm install

# 3. Copy environment template
cp .env.example .env
# Edit .env if you need non-default ports or keys
```

`.env.example` documents every variable. The only one you normally need to change for local development is `VITE_SERVER_URL`, which defaults to `ws://localhost:2567`.

---

## Running locally

### All services (recommended)

```bash
make dev
# or
npm run dev
```

This uses `concurrently` to start two processes in parallel:

| Process | Port | Description |
|---------|------|-------------|
| Server  | 2567 | Colyseus WebSocket + Express HTTP |
| Client  | 5173 | Unified Vite dev server (Svelte SPA) |

The unified client (`client/app/`) serves both the view-screen (TV/display) and phone-controller roles in a single SPA. Open `http://localhost:5173` on any device — the app adapts its UI based on the role selected at join time.

### Individual services

```bash
npm run dev:server
npm run dev:client
```

---

## Running tests

### Unit tests (Vitest)

```bash
make test-unit
# or
npm run test --workspace=server
```

Tests live in `server/tests/`. They cover:

- `los.test.ts` — DDA ray cast and cone FOV checks
- `tilemap.test.ts` — walkability, hiding spots, patrol integrity
- `rng-bracket.test.ts` — seeded RNG, Fisher-Yates shuffle, room code, bracket build/advance

To run in watch mode:

```bash
npm run test --workspace=server -- --watch
```

### Unit tests with coverage

```bash
npm run test:coverage --workspace=server
```

### End-to-end tests (Playwright)

```bash
make test-e2e
# or
npm run test:e2e
```

`e2e/globalSetup.ts` spawns the server and client before the suite runs. Both processes must be able to bind their ports (2567, 5173).

---

## Build for production

```bash
make build
# or
npm run build
```

Outputs:
- `server/dist/` — compiled TypeScript
- `client/app/dist/` — bundled unified client SPA

---

## Docker

```bash
# Build and start all containers
docker compose up --build

# Tear down
docker compose down
```

The compose file wires the server and client together and passes `VITE_SERVER_URL` at build time.

---

## Project structure quick-reference

```
gamma/
├── server/           Colyseus server + game plugins
│   ├── src/
│   │   ├── index.ts          Express + Colyseus bootstrap
│   │   ├── rooms/            GammaRoom (state machine, host logic)
│   │   ├── schema/           Colyseus Schema definitions
│   │   ├── games/            Plugin base class + game implementations
│   │   └── utils/            LOS, tilemap, RNG, bracket helpers
│   └── tests/        Vitest unit tests
├── client/
│   └── app/          Unified Svelte SPA (view screen + phone controller)
├── e2e/              Playwright end-to-end tests
├── k8s/              Kubernetes CRDs, RBAC, example manifests
├── helm/             Helm chart for the Gamma operator
├── design/           HTML prototypes and design assets
└── docs/             Design and onboarding documentation
```

---

## Adding a new game

Games are plugins dropped into `server/src/games/`. Follow these steps:

### 1. Create the plugin directory

```
server/src/games/<registry-id>-<slug>/
└── index.ts
```

The directory name must match the registry ID format: `registry-<number>-<kebab-slug>`.

### 2. Implement the plugin class

```typescript
// server/src/games/registry-99-example/index.ts
import { Client } from "@colyseus/core";
import { BaseGame } from "../BaseGame";

export default class ExampleGame extends BaseGame {
  // ── Static metadata (required) ──────────────────────────────
  static override requiresTV        = true;   // does the game need a view screen?
  static override supportsBracket   = false;  // use bracket/1v1 matchmaking?
  static override defaultRoundCount = 3;
  static override minRounds         = 1;
  static override maxRounds         = 5;
  static override hasInstructionsPhase   = true;
  static override instructionsDelivery   = "broadcast" as const;

  // ── Lifecycle hooks ──────────────────────────────────────────
  protected override async onLoad(): Promise<void> {
    // Called once before round 1. Set up initial state.
  }

  protected override async runRound(round: number): Promise<void> {
    // Implement one round. Return (or resolve) when the round is over.
    // Use this.room.state to read/write shared state.
  }

  protected override scoreRound(round: number): void {
    // Award points after each round.
  }

  // ── Input handling ───────────────────────────────────────────
  override handleInput(client: Client, data: unknown): void {
    // Handle messages sent from phone clients via room.send("input", data).
  }
}
```

`BaseGame` provides:

| Method | Description |
|--------|-------------|
| `onLoad()` | Called before round 1 |
| `runRound(n)` | Called for each round (1-indexed) |
| `scoreRound(n)` | Called after each round to update scores |
| `handleInput(client, data)` | Called for every `"input"` message from a client |
| `broadcast(type, payload)` | Send a message to all clients in the room |
| `teardown()` | Called when the room closes; clean up timers here |

### 3. Register the game

Add an entry to `docs/registry.md` (or the equivalent runtime registry if one exists) with the game's slug and display name.

### 4. Write tests

Add a `server/tests/<slug>.test.ts` covering any non-trivial utilities your game introduces (collision, scoring logic, etc.).

### 5. Verify

```bash
npm run dev          # check it loads without errors
npm run test         # run the unit suite
```

---

## Debugging tips

### Server logs
The server logs all Colyseus room lifecycle events. Set `DEBUG=colyseus:*` for verbose output:

```bash
DEBUG=colyseus:* npm run dev:server
```

### Schema inspection
Colyseus ships a monitor dashboard. After starting the server, visit:

```
http://localhost:2567/colyseus
```

You can inspect live rooms, connected clients, and the current state tree.

### Vite HMR
The client package supports Vite hot module replacement. Component edits in `client/app/src/` update in the browser without a full reload.

### Playwright headed mode
Run E2E tests with a visible browser for debugging:

```bash
npx playwright test --headed --debug
```

---

## Common issues

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `Cannot find module 'colyseus.js'` | Dependencies not installed | `npm install` |
| Tailwind classes not applied | PostCSS config missing | `client/app/` includes its own `postcss.config.cjs` and `tailwind.config.cjs` |
| `__SERVER_URL__ is not defined` | Vite `define` not injecting | Set `VITE_SERVER_URL` before running `vite build` |
| Room join fails with 404 | Server not running | Start the server first (`npm run dev:server`) |
| E2E tests time out | Ports already in use | Kill any existing dev servers before running Playwright |
