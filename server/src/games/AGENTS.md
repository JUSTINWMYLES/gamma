# GAME PLUGIN SYSTEM

## OVERVIEW
Convention-based plugin system. `gameLoader.ts` auto-discovers any `registry-*/index.ts` — no central registration needed.

## HOW TO ADD A NEW GAME

### 1. Create server plugin
Directory: `server/src/games/registry-<NN>-<slug>/index.ts`

Export a default class extending `BaseGame`:
```typescript
import { BaseGame } from "../BaseGame";
import { Room } from "@colyseus/core";
import { RoomState } from "../../schema/RoomState";

export default class MyGame extends BaseGame {
  // Required static metadata (gameLoader validates these at load time)
  static requiresTV = false;
  static supportsBracket = false;
  static defaultRoundCount = 3;
  static minRounds = 1;
  static maxRounds = 5;
  static hasInstructionsPhase = false;
  static instructionsDelivery = "broadcast" as const;
  // Optional: static defaultTimeLimitSecs = 30;

  constructor(room: Room<RoomState>) { super(room); }

  protected async onLoad(): Promise<void> { /* init per-round state */ }
  protected async runRound(round: number): Promise<void> { /* game loop */ }
  protected scoreRound(round: number): void { /* update PlayerState scores */ }
  handleInput(client: Client, data: unknown): void { /* handle game_input */ }
  teardown(): void { /* clear timers, reset state */ }
  // Optional: onPlayerReconnected(oldId, newId, client) — migrate sessionId maps
}
```

### 2. Add client UI (phone + TV)
- Phone: `client/app/src/games/player/MyGame.svelte`
- TV: `client/app/src/games/viewer/MyGameTV.svelte`
- Register in `client/app/src/screens/player/GameScreen.svelte` and `screens/viewer/GameScreen.svelte`
- Add instruction JSON: `client/app/src/games/player/MyGame.instructions.json`

### 3. Test
```bash
make test-unit   # add server/tests/my-game.test.ts
make dev         # manual play-through
```

## BASEGAME UTILITIES
All available in game plugin via `this.*`:
| Method | Purpose |
|--------|---------|
| `broadcast(type, payload)` | Send to all clients |
| `send(sessionId, type, payload)` | Send to one client |
| `delay(ms)` | Awaitable timer (auto-cleared on teardown) |
| `waitForAllReady(timeoutMs)` | Wait for all active players ready |
| `isPlayerActive(sessionId)` | Check if player still connected |
| `setPhase(phase)` | Update `room.state.phase` |
| `this.room` | Full Colyseus Room access |
| `this.room.state` | Mutable RoomState (Schema — changes replicate) |

## REGISTERED GAMES
| Registry ID | Class | Notable |
|-------------|-------|---------|
| registry-03-tap-speed | TapSpeedGame | Bracket-driven match loop (745 lines) |
| registry-04-escape-maze | EscapeMazeGame | Maze gen, team-shake mode (1140 lines) |
| registry-06-sound-replication | SoundReplicationGame | Server-side audio analysis (914 lines) |
| registry-07-hot-potato | HotPotatoGame | Pass/vote timer flow (560 lines) |
| registry-10-grid-tap-colors | GridTapColorsGame | Speed-tap + memory modes; helper: `gridTapLogic.ts` |
| registry-11-tier-ranking | TierRankingGame | Helper: `tierRankingLogic.ts` |
| registry-14-dont-get-caught | DontGetCaughtGame | Guard AI + LOS + tilemap (1212 lines) |
| registry-17-fire-match-blow-shake | FireMatchBlowShakeGame | Staged mini-game + bracket (601 lines) |
| registry-19-shave-the-yak | ShaveYakGame | Per-player pixel mask; exports `YAK_W`, `YAK_H` |
| registry-20-odd-one-out | OddOneOutGame | |
| registry-25-lowball-marketplace | LowballMarketplaceGame | Large item catalogue (2488 lines) |
| registry-26-audio-overlay | AudioOverlayGame | Klipy GIF API; exports `GifEntry`, `GifCategory` (937 lines) |
| registry-27-word-build | WordBuildGame | Helper: `wordBuildLogic.ts` |
| registry-28-wanted-ad | WantedAdGame | Helper: `wantedAdLogic.ts` |
| registry-40-paint-match | PaintMatchGame | Color math; helper: `colorUtils.ts` |
| registry-43-medical-story | MedicalStoryGame | Role voting, multi-phase (712 lines); helper: `medicalStoryLogic.ts` |

## ANTI-PATTERNS
- Do not store raw WebSocket client objects across async awaits — use `sessionId` and `room.clients` lookup.
- Always clear timers in `teardown()` — use `this.delay()` / `this._timers` not raw `setTimeout`.
- Implement `onPlayerReconnected(oldId, newId, client)` if you keep any `Map<sessionId, ...>` state.
- Do not call `Math.random()` — use `server/src/utils/rng.ts` seeded RNG.

## REFERENCES
- `BaseGame.ts` — full lifecycle API
- `gameLoader.ts` — REQUIRED_STATIC_FIELDS and REQUIRED_METHODS (fail-fast validation)
- `docs/developers/contributing-games.md` — extended guide
- `docs/onboarding.md` — quickstart
