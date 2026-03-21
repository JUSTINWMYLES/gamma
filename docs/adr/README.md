# ADR-001: Server-Authoritative Architecture

**Date:** 2025-01  
**Status:** Active

---

## Context

Gamma is a multiplayer party game platform where phones act as controllers and a TV displays the shared game state. The fundamental question is: where does game logic live?

Options considered:
1. **Client-authoritative** — each phone computes its own position/state and broadcasts it
2. **Server-authoritative** — the server owns all state; clients send intent only
3. **Hybrid** — clients predict locally, server reconciles

## Decision

All game logic executes on the server (Node.js + Colyseus). Clients send *intent* messages (e.g. `{ action: "move", dx: 0.7, dy: -0.3 }`) and receive state changes via the Colyseus Schema diff protocol. Clients never directly mutate game state.

## Rationale

- **Cheat prevention:** Clients cannot teleport, spoof scores, or alter guard state.
- **Consistency:** All players and the TV share a single ground-truth state with no divergence.
- **Reconnect safety:** A player who drops and reconnects immediately gets the current state without needing to replay a log.
- **Simplicity at the game-plugin level:** Game authors write synchronous server-side logic; they do not need to implement prediction or reconciliation.

## Consequences

- Latency on the phone controls (round-trip to server before position updates). Mitigated by running the server locally on LAN for in-room play.
- Network bandwidth for Schema diffs on every tick (50ms). Colyseus delta-encodes, so only changed fields travel over the wire.

---

# ADR-002: Colyseus + Svelte Tech Stack

**Date:** 2025-01  
**Status:** Active

---

## Context

Needed a real-time WebSocket framework that handles room management, Schema-based state sync, and reconnect logic without building it from scratch.

## Decision

- **Server:** Node.js + TypeScript + Colyseus 0.15
- **Clients:** Svelte 4 + Vite + Tailwind CSS
- **Build system:** npm workspaces monorepo

## Rationale

- Colyseus handles room lifecycle, matchmaking, Schema delta sync, and reconnect tokens out of the box.
- Svelte's reactive declarations (`$:`) map naturally onto the Colyseus live-state proxy — a state change on the server causes a re-render automatically.
- Tailwind keeps styling colocated and avoids a separate CSS build pipeline.
- npm workspaces allow `server`, `client/tv`, and `client/phone` to share types without a separate npm package.

## Consequences

- `verbatimModuleSyntax` must NOT be enabled in client tsconfigs (Svelte preprocessor incompatibility).
- TypeScript `as` casts cannot appear in Svelte template expressions — they must be hoisted into `<script>` blocks.
- Helm/Kubernetes YAML LSP errors in `helm/` are Go-template false positives — ignore them.

---

# ADR-003: Single Room Type (GammaRoom)

**Date:** 2025-01  
**Status:** Active

---

## Context

Should there be one room type per game, or a single generic room that loads game plugins?

## Decision

Single `GammaRoom` class. Games are plugins (classes extending `BaseGame`) loaded dynamically by registry ID at game-start time.

## Rationale

- A single room means players only ever join one room type. The 4-char room code is enough to distinguish rooms.
- Game plugins can be added, removed, or hotloaded without changing the room registration.
- The host can switch games in the lobby without players needing to leave and re-join.

## Consequences

- All game-specific Schema fields live on `RoomState` (annotated per-game). Games that are not running have their fields at default/empty values — these travel over the wire even when unused. Accepted trade-off given the small number of fields.
- The `gameLoader.ts` validates the plugin interface at load time, failing loudly if a plugin is missing required statics or methods.

---

# ADR-004: Phone-as-Controller + TV-as-Display Split

**Date:** 2025-01  
**Status:** Active

---

## Context

Two distinct client roles are needed: a shared TV display and individual phone controllers.

## Decision

Two separate Vite apps: `client/tv` (port 5173) and `client/phone` (port 5174). Both connect to the same `GammaRoom` with different `role` options (`"tv"` vs `"player"`).

## Rationale

- Completely separate builds mean each client ships only the code it needs.
- TV and phone can be deployed to different origins or served from different paths.
- The `role` field in `JoinOptions` lets `GammaRoom` differentiate join behaviour (TV sets `tvConnected`, players create `PlayerState` entries).

## Consequences

- Shared TypeScript types live in `client/shared/` and are referenced via relative imports (no npm package needed in dev).
- Server URL resolution must work across devices on the same LAN — solved in `colyseusClient.ts` by auto-deriving `ws://<page-hostname>:2567` from `window.location`.

---

# ADR-005: Procedural Map Generation for registry-14

**Date:** 2025-03 (overhaul)  
**Status:** Active  
**Supersedes:** Static hand-authored tilemap

---

## Context

The original registry-14 map was a hand-authored static array. This was predictable and players could memorise safe routes after a few rounds.

## Decision

Replace the static map with a procedural generator (`generateMap(seed)`). The seed comes from `Date.now()` so every game session gets a different map. The map is now regenerated each round so routes cannot be learned.

**Algorithm:**
1. Fill a 24×16 grid with walls
2. Carve a 4×3 grid of rooms (variable size, random margin)
3. Connect adjacent rooms with 2-tile-wide corridors
4. Enforce a 1-tile wall border
5. Derive spawn positions, patrol path, and guard start from room centres

## Rationale

- Replay value: no two games are identical.
- Fairness: generated fresh per round so prior knowledge doesn't accumulate.
- Testability: `generateMap(42)` is deterministic — unit tests can assert stable structure.

## Consequences

- Map tiles must be serialised (JSON string in `RoomState.mapTiles`) and broadcast to clients, since clients cannot regenerate the map without the seed.
- `MAP_WIDTH`/`MAP_HEIGHT` removed from shared client constants — clients read `state.mapWidth`/`state.mapHeight` dynamically.
- `GAME_MAP` is a lazy proxy reading `_currentMap` — avoids stale tile data if `resetMap()` is called after imports.

---

# ADR-006: No Hiding Mechanic (registry-14 overhaul)

**Date:** 2025-03  
**Status:** Active  
**Supersedes:** Bush/crate hiding mechanic

---

## Context

The original registry-14 design had hiding spots (bushes, crates) where players could crouch to evade guards. Playtesting showed this made the game passive — players would sit in a bush doing nothing for most of the round.

## Decision

Remove hiding spots entirely. The game is now pure evasion — move to avoid guard line-of-sight.

## Rationale

- More active and engaging: players must keep moving.
- Simpler rules: no hiding state to explain, fewer edge cases to handle.
- Detection meter fills when a guard has LOS; decreases when out of LOS. At 100 the player is caught and respawned.

## Consequences

- `isHidingSpot()` always returns `false`.
- `PlayerState.isHiding` field removed.
- `HIDE_TILE_IDS` is an empty set.

---

# ADR-007: Supernatural Guards (ignore walls for movement)

**Date:** 2025-03  
**Status:** Active

---

## Context

Should guards pathfind around walls, or have some other movement model?

## Decision

Guards are "supernatural" — they move through walls freely. Wall collision is only applied to players. However, guard **line-of-sight** (LOS) is still blocked by walls.

## Rationale

- Pathfinding (A*, navmesh) on a server tick at 20 Hz for multiple guards is non-trivial to implement and adds significant complexity.
- The "supernatural guard" design creates a distinct horror-game feel — they are unstoppable, only detectable line-of-sight matters.
- Keeping LOS wall-blocked preserves the meaningful player skill of ducking behind corners.

## Consequences

- Guard movement code uses `_moveTowardsIgnoreWalls()` — pure vector math, no tile checks.
- Unit tests confirm LOS is still correctly blocked by walls.

---

# ADR-008: Lobby Setup Flow (3-step wizard)

**Date:** 2025-03  
**Status:** Active

---

## Context

Different groups have different constraints: some are remote, some active, some don't have a TV. Without knowing this, the game picker has no way to surface relevant games.

## Decision

A 3-step setup wizard before the game picker (TV-driven, host only):
1. **Location** — same room vs remote (`locationMode`)
2. **Activity level** — none / some / full (`activityLevel`)
3. **Display** — secondary screen available (`hasSecondaryDisplay`)

Setup state lives in `RoomState` so phones can show progress. `setupStep` (0–4) drives both the TV wizard and the phone waiting UI.

The host sends `update_setup` messages; the server validates and stores the answers. The game picker then uses `getGameUnavailableReason()` to grey out incompatible games.

## Rationale

- Games can declare their requirements via static metadata on `BaseGame` (`activityLevel`, `requiresSameRoom`, `requiresSecondaryDisplay`) without any per-game registration code.
- The setup answers persist in room state so late-joining players see the current setup.

## Consequences

- `GammaRoom` handles `update_setup` messages (host-only).
- `GAME_REGISTRY` in `client/shared/types.ts` is the client-side mirror of game metadata — must be kept in sync with server plugin statics manually.

---

# ADR-009: LOS DDA Corner-Clipping Fix

**Date:** 2025-03  
**Status:** Active  
**Supersedes:** Over-sampled DDA (steps = ceil(max(|dx|,|dy|) * 2))

---

## Context

The original line-of-sight implementation used an over-sampled DDA that stepped at half-tile intervals. This caused corner-clipping: rays that grazed a tile corner were incorrectly blocked by the adjacent wall tile.

## Decision

Replace with a proper grid-crossing DDA that steps only at actual tile-boundary crossings. In the exact corner case (`tMaxX === tMaxY`), both axes advance simultaneously **without a wall check** — the ray grazes the corner and continues.

## Rationale

- The original code produced false negatives (guard cannot see player who is clearly visible around a corner).
- The grid-crossing DDA is the standard algorithm for this problem (referenced in Bresenham, Amanatides & Woo).
- The corner-grazing exception is physically correct: a ray touching a corner point does not enter either adjacent tile.

## Consequences

- 12 LOS unit tests covering wall blocking, corner grazing, and out-of-range detection — all passing.
- Guards now correctly see players who are just around a corner, making the game more tense.

---

# ADR-010: Control Mode — Joystick vs Tilt

**Date:** 2025-03  
**Status:** Active

---

## Context

Phone games can be controlled via a virtual joystick (thumb touch) or device tilt (DeviceOrientation API). Players have different preferences.

## Decision

Both modes are available. The player selects their preferred control mode from the lobby config before the game starts. The selection is stored per-player (client-side only — the server receives the same normalised `{ action: "move", dx, dy }` messages regardless of mode).

## Rationale

- Tilt control is more immersive but can be uncomfortable for long sessions or poor phone orientation.
- Joystick is reliable on all devices and works when the phone is flat on a table.
- Keeping the wire protocol identical means the server game plugin requires no changes per control mode.

## Consequences

- `GameConfig` does not include a control mode field — it is purely client-side.
- The phone `GameScreen.svelte` renders either a joystick or activates the `DeviceOrientationEvent` listener based on the player's local selection.
- iOS requires a user-gesture permission request for `DeviceOrientationEvent` (called on lobby "Ready" tap).
