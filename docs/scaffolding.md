# Gamma — Project Scaffolding

---

## Directory Structure

```
gamma/
├── package.json                     # Root workspace config
├── tsconfig.json
├── svelte.config.js
├── tailwind.config.cjs
├── postcss.config.cjs
│
├── server/                          # Colyseus game server (Node.js)
│   ├── src/
│   │   ├── index.ts                 # Server entry point — HTTP + WebSocket setup
│   │   ├── telemetry.ts             # OpenTelemetry tracer + meter setup
│   │   ├── rooms/
│   │   │   └── GammaRoom.ts         # Main Colyseus room — handles all games
│   │   ├── schema/
│   │   │   ├── RoomState.ts         # Root Schema: phase, players, gameConfig, setup criteria
│   │   │   ├── PlayerState.ts       # Per-player Schema: name, score, ready, bracket, position
│   │   │   ├── GameConfig.ts        # Host-configurable options Schema
│   │   │   ├── BracketState.ts      # 1v1 bracket rounds and matches
│   │   │   └── GuardState.ts        # Guard state for Don't Get Caught game
│   │   ├── games/
│   │   │   ├── BaseGame.ts          # Abstract base class all games extend
│   │   │   ├── gameLoader.ts        # Dynamic plugin importer + validator
│   │   │   ├── registry-03-tap-speed/
│   │   │   ├── registry-04-escape-maze/
│   │   │   ├── registry-06-sound-replication/
│   │   │   ├── registry-07-hot-potato/
│   │   │   ├── registry-10-grid-tap-colors/
│   │   │   ├── registry-11-tier-ranking/
│   │   │   ├── registry-14-dont-get-caught/
│   │   │   ├── registry-17-fire-match/
│   │   │   ├── registry-19-shave-the-yak/
│   │   │   ├── registry-20-odd-one-out/
│   │   │   ├── registry-25-lowball-marketplace/
│   │   │   ├── registry-26-audio-overlay/
│   │   │   ├── registry-27-word-build/
│   │   │   ├── registry-40-paint-match/
│   │   │   └── registry-43-medical-story/
│   │   └── utils/
│   │       ├── los.ts               # Line-of-sight (DDA ray cast)
│   │       ├── tilemap.ts           # Map data, patrol path, spawn positions
│   │       ├── rng.ts               # Seeded RNG + room code generator
│   │       └── bracket.ts           # Single-elimination bracket builder
│   ├── tests/                       # Vitest unit tests
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
│
├── client/
│   └── app/                         # Unified Svelte SPA (view screen + phone controller)
│       ├── src/                     # Svelte components, screens, shared logic
│       ├── index.html
│       ├── vite.config.ts
│       ├── package.json
│       ├── tailwind.config.cjs
│       ├── postcss.config.cjs
│       ├── tsconfig.json
│       └── Dockerfile
│
├── e2e/                             # Playwright end-to-end tests
│   ├── game-flow.spec.ts
│   ├── globalSetup.ts
│   └── globalTeardown.ts
│
├── operator/                        # Kubernetes operator (Go, controller-runtime)
│
├── k8s/                             # Kubernetes manifests
│   ├── crds/                        # CRD definitions
│   ├── examples/                    # Example CRs
│   └── rbac.yaml
│
├── helm/
│   └── gamma-operator/              # Helm chart for the operator
│
├── design/                          # HTML prototypes and design assets
│   └── prototypes/
│
├── docs/                            # Project docs and game registry
│   ├── architecture.md
│   ├── scaffolding.md               # This file
│   ├── onboarding.md
│   ├── security.md
│   ├── deployment-architecture.md
│   ├── registry.md
│   ├── adr/                         # Architecture decision records
│   └── registry/                    # Per-game design documents
│
├── docker-compose.yml
├── playwright.config.ts
├── Makefile
└── .env.example
```

---

## Key Source Files

### `server/src/schema/RoomState.ts`

The root Colyseus Schema replicated to all connected clients:

```ts
export class RoomState extends Schema {
  @type("string") phase: Phase = "lobby";
  @type("string") roomCode: string = "";
  @type("string") hostSessionId: string = "";
  @type("boolean") viewScreenConnected: boolean = false;
  @type("string") selectedGame: string = "";
  @type("number") currentRound: number = 0;
  @type("number") phaseStartedAt: number = 0;
  @type("number") roundDurationSecs: number = 60;

  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type(GameConfig) gameConfig = new GameConfig();
  @type(BracketState) bracket = new BracketState();
  @type({ map: GuardState }) guards = new MapSchema<GuardState>();

  @type("string") mapTiles: string = "";
  @type("number") mapWidth: number = 0;
  @type("number") mapHeight: number = 0;

  @type(["string"]) gameQueue = new ArraySchema<string>();
  @type("number") queueIndex: number = 0;

  // Lobby setup criteria
  @type("string") locationMode: "same" | "remote" | "" = "";
  @type("string") activityLevel: "none" | "some" | "full" | "" = "";
  @type("boolean") hasSecondaryDisplay: boolean = false;
  @type("number") setupStep: number = 0;
}
```

---

### `server/src/rooms/GammaRoom.ts`

The single Colyseus room type. Key behaviours:

- Assigns `role: "view_screen"` or `role: "player"` at join time
- Tracks `viewScreenConnected` (not `tvConnected`)
- Supports name-based reconnection when players refresh and get a new sessionId
- Enforces all non-host players must be ready before starting
- Dynamically loads game plugins via `gameLoader.ts`
- Emits OpenTelemetry metrics and traces
- Supports game queues/playlists with `set_queue` / `clear_queue` messages

---

### `server/src/games/BaseGame.ts`

Abstract base class all game plugins extend:

```ts
export abstract class BaseGame {
  static requiresTV: boolean = false;
  static supportsBracket: boolean = false;
  static defaultRoundCount: number = 1;
  static minRounds: number = 1;
  static maxRounds: number = 10;
  static hasInstructionsPhase: boolean = true;
  static instructionsDelivery: "broadcast" | "staggered" | "private" = "broadcast";
  static activityLevel: "none" | "some" | "full" = "none";
  static requiresSameRoom: boolean = false;
  static requiresSecondaryDisplay: boolean = false;

  protected abstract runRound(round: number): Promise<void>;
  protected abstract scoreRound(round: number): void;
  abstract handleInput(client: Client, data: any): void;
}
```

---

## Game Registry Spec Fields

All registry entries must include the following fields. These are consumed by `GammaRoom` at game-load time to validate and configure the session.

```ts
requiresTV: boolean          // true = game cannot start without a view screen connected
supportsBracket: boolean     // true = game supports 1v1 bracket mode
defaultRoundCount: number    // default rounds when host doesn't override
minRounds: number
maxRounds: number
hasInstructionsPhase: boolean // true = server transitions through "instructions" before countdown
instructionsDelivery: "broadcast" | "staggered" | "private"
activityLevel: "none" | "some" | "full"
requiresSameRoom: boolean
requiresSecondaryDisplay: boolean
```

---

## Environment Variables

```
# server
PORT=2567
LOG_LEVEL=info
RECONNECT_GRACE_SECONDS=30
KLIPY_API_KEY=              # required for Audio Overlay GIF search

# client
VITE_SERVER_URL=ws://localhost:2567
CLIENT_PORT=5173
```

---

## Workspaces (`package.json`)

```json
{
  "workspaces": ["server", "client/app"],
  "scripts": {
    "install:all": "npm install && npm install --workspace=server && npm install --workspace=client/app",
    "dev": "concurrently -k -n server,client -c cyan,green \"npm run dev --workspace=server\" \"npm run dev --workspace=client/app\"",
    "dev:server": "npm run dev --workspace=server",
    "dev:client": "npm run dev --workspace=client/app",
    "build": "npm run build --workspace=server && npm run build --workspace=client/app",
    "test": "npm run test --workspace=server",
    "test:e2e": "npx playwright test"
  }
}
```
