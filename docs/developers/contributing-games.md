# Contributing a New Game

This guide walks through adding a new game to Gamma end-to-end — server plugin, client registry entry, and tests.

---

## Overview

Every game is a self-contained **plugin** dropped into `server/src/games/`. No registration step is needed: the loader (`gameLoader.ts`) discovers plugins by directory name at runtime.

The directory name is also the **registry ID** used everywhere (URL slugs, state fields, `GAME_REGISTRY` entries). Keep it stable once shipped.

```
server/src/games/registry-<number>-<kebab-slug>/
└── index.ts
```

---

## Step 1 — Create the server plugin

### 1a. Directory and skeleton

```
server/src/games/registry-99-my-game/
└── index.ts
```

### 1b. Implement the class

```typescript
// server/src/games/registry-99-my-game/index.ts
import { Client } from "@colyseus/core";
import { BaseGame } from "../BaseGame";

export default class MyGame extends BaseGame {
  // ── Required static metadata ─────────────────────────────────────────────

  static override requiresTV = false;        // block start if no TV is connected?
  static override supportsBracket = false;   // enable 1v1 bracket match mode?
  static override defaultRoundCount = 3;
  static override minRounds = 1;
  static override maxRounds = 5;
  static override hasInstructionsPhase = true;
  static override instructionsDelivery = "broadcast" as const;
  // "broadcast"  — all players get instructions simultaneously
  // "staggered"  — random delay per player
  // "private"    — each player gets a different message

  // ── Setup criteria metadata ───────────────────────────────────────────────
  // Used by the lobby game-picker to filter/grey-out games that do not match
  // the host's setup answers (location, activity level, display availability).

  /** "none" = seated phone-only; "some" = light movement; "full" = active. */
  static override activityLevel: "none" | "some" | "full" = "none";

  /** Set true if meaningful play requires players to be in the same room. */
  static override requiresSameRoom = false;

  /** Set true if a TV/secondary display is needed for core gameplay. */
  static override requiresSecondaryDisplay = false;

  // ── Lifecycle hooks ───────────────────────────────────────────────────────

  protected override async onLoad(): Promise<void> {
    // Called once before round 1.
    // Seed initial state: spawn positions, reset scores, set up Schema fields.
    // this.room.state is the live RoomState — writes here are replicated immediately.
  }

  protected override async runRound(round: number): Promise<void> {
    // Called for each round (1-indexed). Must resolve/return when the round ends.
    //
    // Typical pattern:
    //   1. Reset per-round state.
    //   2. Start a server tick loop (setInterval).
    //   3. Return a Promise that resolves when time runs out or a win condition fires.
    //
    // Use this.delay(ms) for cancellable timers that are cleaned up in teardown().
    await this.delay(this.room.state.gameConfig.timeLimitSecs * 1000);
  }

  protected override scoreRound(round: number): void {
    // Called immediately after runRound() resolves.
    // Award points to this.room.state.players entries.
    for (const p of this.room.state.players.values()) {
      if (!p.isEliminated) p.score += 100;
    }
  }

  // ── Input handling ────────────────────────────────────────────────────────

  override handleInput(client: Client, data: unknown): void {
    // Called for every "game_input" message from a phone client.
    // The server is authoritative: validate data, update state, never trust raw values.
    if (this.room.state.phase !== "in_round") return;
    const player = this.room.state.players.get(client.sessionId);
    if (!player || player.isEliminated) return;

    // Cast and act on data.
    // const input = data as { action: string; value: number };
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  override teardown(): void {
    super.teardown(); // cancels all this.delay() timers — always call this
    // Clear any setInterval handles you created manually.
  }
}
```

### Inherited helpers (from `BaseGame`)

| Helper | Description |
|--------|-------------|
| `this.delay(ms)` | Awaitable timer registered for automatic cleanup |
| `this.broadcast(type, payload)` | Send a message to every connected client |
| `this.send(sessionId, type, payload)` | Send a private message to one client |
| `this.waitForAllReady(timeoutMs?)` | Resolve when all active players set `isReady = true` |
| `this.room.state` | Live `RoomState` — writes replicate to clients immediately |
| `this.room.clients` | Iterable of connected `Client` objects |
| `super.teardown()` | Cancels all `this.delay()` timers — **always call in teardown** |

---

## Step 2 — Add game-specific Schema fields (if needed)

If your game needs state beyond what `RoomState` already provides, add fields there:

```typescript
// server/src/schema/RoomState.ts
@type("number") myGameSpecificField: number = 0;
```

And mirror them in the shared client type:

```typescript
// client/shared/types.ts
export interface RoomState {
  // ...existing fields...
  myGameSpecificField: number;
}
```

Keep game-specific fields clearly commented so they can be identified and removed later if the game is retired.

---

## Step 3 — Register the game in the client

The TV lobby uses `GAME_REGISTRY` in `client/shared/types.ts` to list, describe, and filter games. Add an entry:

```typescript
// client/shared/types.ts
export const GAME_REGISTRY: GameMeta[] = [
  // ...existing entries...
  {
    id: "registry-99-my-game",        // must match the directory name exactly
    label: "My Game",                 // short display name shown in picker
    description: "One sentence that explains the goal to new players.",
    activityLevel: "none",            // must match static activityLevel on your class
    requiresSameRoom: false,          // must match static requiresSameRoom
    requiresSecondaryDisplay: false,  // must match static requiresSecondaryDisplay
  },
];
```

The `getGameUnavailableReason()` helper in the same file automatically greys out your game in the picker when the host's setup answers are incompatible. No extra code needed — just keep the three filter fields consistent between server and client.

---

## Step 4 — Phone client screen

For the phone controller, update (or conditionally extend) `client/phone/src/screens/GameScreen.svelte` to handle your game's input. The standard pattern is:

```svelte
<!-- Only show controls when in a round -->
{#if state.phase === "in_round"}
  <!-- your game-specific controls -->
  <button on:pointerdown={() => room.send("game_input", { action: "tap" })}>
    Tap
  </button>
{/if}
```

Rules:
- **Never trust client-side data as authoritative.** Send intent (e.g. `{ action: "move", dx: 0.5 }`) and let the server compute the result.
- TypeScript `as` casts cannot appear inside Svelte template expressions — declare casted variables in the `<script>` block instead.

---

## Step 5 — TV client screen

Update `client/tv/src/screens/GameScreen.svelte` to render your game. The TV screen receives the full live `RoomState` and renders it.

For canvas-based games, use `onMount` / `onDestroy` to set up and tear down a `requestAnimationFrame` loop.

---

## Step 6 — Write unit tests

Add `server/tests/registry-99-my-game.test.ts` covering any non-trivial logic your game introduces. See the existing test files for patterns:

- `los.test.ts` — pure utility function tests
- `tilemap.test.ts` — stateful module with setup/teardown between tests
- `rng-bracket.test.ts` — deterministic seeded behaviour

Run after editing:

```bash
npm run test
```

All 46 existing tests must continue to pass.

---

## Step 7 — Add a registry design doc

Create `docs/registry/registry-99-my-game.md` from the template at `docs/registry/template.md`. Fill in:
- High-level pitch
- Win condition
- Round structure
- Input/output description
- Sensor requirements (if any)

---

## Step 8 — Verify end-to-end

```bash
# 1. Full build — must be clean (only harmless "unused export property" warnings are OK)
npm run build

# 2. Unit tests
npm run test

# 3. Manual smoke test
npm run dev
# Open TV at http://localhost:5173, phone at http://localhost:5174
# Walk through the 3-step setup flow, select your game, and play a round.
```

---

## Checklist

- [ ] `server/src/games/registry-<n>-<slug>/index.ts` — plugin class with all required statics
- [ ] `activityLevel`, `requiresSameRoom`, `requiresSecondaryDisplay` set on the class
- [ ] Any new Schema fields added to `RoomState.ts` and mirrored in `client/shared/types.ts`
- [ ] Entry added to `GAME_REGISTRY` in `client/shared/types.ts` (fields consistent with server statics)
- [ ] Phone `GameScreen.svelte` updated with game controls
- [ ] TV `GameScreen.svelte` updated with game rendering
- [ ] Unit tests in `server/tests/` covering non-trivial logic
- [ ] `docs/registry/registry-<n>-<slug>.md` design doc created
- [ ] `npm run build` clean, `npm run test` all passing
