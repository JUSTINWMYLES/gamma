# registry-14 "Don't Get Caught" — Design Document

## Overview

"Don't Get Caught" is a stealth game where 2–8 players move around a tile map while a patrolling guard tries to spot them. This document covers the algorithms and data structures used on the server.

Source files:

- `server/src/games/registry-14-dont-get-caught/index.ts` — game logic
- `server/src/utils/los.ts` — line-of-sight math
- `server/src/utils/tilemap.ts` — map definition and helpers

---

## Tile Map

The map is **16 × 10 tiles**, stored as a flat row-major array.

```
Tile legend
  0  floor  — walkable, no cover
  1  wall   — blocks movement and LOS
  2  bush   — walkable, provides hiding cover
  3  crate  — walkable, provides hiding cover
```

Coordinate system: origin `(0, 0)` is the top-left tile. `x` increases right, `y` increases down. All positions used at runtime are **float tile units** (not pixels). The renderer scales by `TILE_SIZE` (32 px by default) before drawing.

### Map layout

```
Row 0:  1  1  1  1  1  1  1  1  1  1  1  1  1  1  1  1   (outer wall)
Row 1:  1  .  .  .  .  B  .  .  .  .  B  .  .  .  .  1   (B = bush)
Row 2:  1  .  W  W  .  .  .  W  W  .  .  .  W  W  .  1
Row 3:  1  .  W  .  .  .  .  .  .  .  .  .  .  W  .  1
Row 4:  1  .  .  .  C  .  .  .  .  .  .  C  .  .  .  1   (C = crate)
Row 5:  1  .  .  .  C  .  .  .  .  .  .  C  .  .  .  1
Row 6:  1  .  W  .  .  .  .  .  .  .  .  .  .  W  .  1
Row 7:  1  .  W  W  .  .  .  W  W  .  .  .  W  W  .  1
Row 8:  1  .  .  .  .  B  .  .  .  .  B  .  .  .  .  1
Row 9:  1  1  1  1  1  1  1  1  1  1  1  1  1  1  1  1
```

The layout is intentionally symmetric so players on either side of the map have equivalent access to hiding spots.

---

## Line-of-Sight (LOS) Algorithm

Source: `server/src/utils/los.ts`

### 1. Distance check

```
dist = sqrt((tx - gx)² + (ty - gy)²)
if dist > GUARD_RANGE → not visible
```

Default `GUARD_RANGE` = 6 tiles.

### 2. Cone angle check

The guard has a `facingAngle` in radians (0 = right, π/2 = down, following the screen coordinate convention).

```
angleToTarget = atan2(ty - gy, tx - gx)
angleDiff     = normalise(angleToTarget - facingAngle) to [-π, π]
if |angleDiff| > FOV_HALF_ANGLE → not visible
```

Default `FOV_HALF_ANGLE` = π/3 (60°), giving a **120° total cone**.

### 3. DDA ray cast

A Digital Differential Analyser (DDA) walks the grid along the line from guard to target. This is the standard grid ray-marching technique:

```
steps = ceil(max(|dx|, |dy|)) × 2   // 2 sub-steps per tile for accuracy
stepX = dx / steps
stepY = dy / steps

for i in 1..steps:
  col = floor(from.x + stepX × i)
  row = floor(from.y + stepY × i)
  if tile(col, row) is a wall → blocked
```

Multiplying `steps` by 2 ensures we sample each tile at least twice, avoiding the "corner clipping" artifact where a ray grazes the corner of a wall tile without being flagged as blocked.

Out-of-bounds tiles are treated as walls.

### Combined check

`canGuardSeeTarget` runs the three checks in order. Each check short-circuits the rest, so the more expensive DDA is only reached when distance and angle already pass.

---

## Guard AI

The guard is a single server-side entity with two modes: **patrol** and **chase**.

### Patrol mode

The guard follows a fixed list of six waypoints:

```
(1,1) → (7,1) → (14,1) → (14,8) → (7,8) → (1,8) → (repeat)
```

Each tick the guard moves straight towards the current waypoint at `guardSpeed` tiles/second. On arrival (within 0.05 tiles), the index advances to the next waypoint modulo the path length.

The guard's `facingAngle` is updated to `atan2(dy, dx)` on every movement step, so the vision cone always points in the direction of travel.

### Alert and chase transitions

| State | Trigger | Guard behaviour |
|-------|---------|----------------|
| `patrol` | Default | Follow waypoints |
| `alert` | Player detection meter ≥ 30 | Still patrolling, but the TV renders an exclamation mark |
| `chase` | Player detection meter = 100 | Move at `guardSpeed × 1.6` directly towards target player |

When the target player's detection meter drops to 0 (they hid successfully), the guard returns to `patrol`.

When a catch occurs, the guard resets to `patrol` and the caught player respawns.

### Adaptive difficulty

After each round, `scoreRound` examines how many players were caught:

- If **fewer than half** of players were caught → guard speed scales up by 1.2× (capped at 2× base).
- If **half or more** were caught → guard speed eases back by 5% (floored at base speed).

This keeps the game balanced across different player skill levels without manual tuning.

---

## Detection Meter

Each player has a `detectionMeter` value in [0, 100].

| Condition | Meter change per tick (50 ms) |
|-----------|-------------------------------|
| Guard has LOS, player not hiding | +4 |
| Guard has LOS, player hiding on invalid tile | +4 |
| Guard has LOS, player hiding on valid bush/crate | −2 (hiding overrides LOS) |
| Guard does not have LOS | −2 |

At meter = 100 the player is **caught**: `timesCaught` increments, the player respawns, and the meter resets to 0. After `CATCH_LIMIT` (3) catches the player is eliminated for the rest of the round.

---

## Hiding

A player is effectively hidden when **both** of these are true:
1. `player.isHiding === true` (player pressed the Hide button).
2. The player's current tile is a hiding spot (`tileId ∈ {2, 3}`).

Moving automatically clears `isHiding`. The Hide button on the phone is only effective when standing on a bush or crate tile. If the player tries to hide on a floor tile, the server silently ignores the request.

---

## State Reconciliation

Colyseus handles state sync automatically via its Schema delta-encoding. The server never broadcasts raw game state explicitly; instead it mutates the Schema objects and Colyseus patches the connected clients at the end of each broadcast cycle.

Key Schema fields involved in the game loop:

| Field | Type | Owner | Description |
|-------|------|-------|-------------|
| `player.x`, `player.y` | `float32` | Server-authoritative | Player position in tile units |
| `player.isHiding` | `boolean` | Server-authoritative | Effective hiding state |
| `player.isDetected` | `boolean` | Server | Guard currently has LOS |
| `player.detectionMeter` | `float32` | Server | Detection fill [0, 100] |
| `player.timesCaught` | `int16` | Server | Catches this round |
| `player.isEliminated` | `boolean` | Server | Eliminated for this round |
| `guard.x`, `guard.y` | `float32` | Server | Guard position |
| `guard.facingAngle` | `float32` | Server | Guard facing (radians) |
| `guard.guardMode` | `string` | Server | `"patrol"` \| `"alert"` \| `"chase"` |
| `guard.targetPlayerId` | `string` | Server | Session ID of chased player |

The client (TV canvas) reads these values on every Colyseus state patch and redraws the frame. No client-side prediction is used — the server is fully authoritative for all positions.

---

## Input Messages

Phone clients send `room.send("input", data)` to the server. The `InputMessage` shape:

```typescript
interface InputMessage {
  action: "move" | "hide";
  dx?:    number;   // move: normalised X component [-1, 1]
  dy?:    number;   // move: normalised Y component [-1, 1]
  hiding?: boolean; // hide: desired state
}
```

On receipt, the server clamps `(dx, dy)` to a unit vector and applies `PLAYER_SPEED` (0.15 tiles/event) with a server-side walkability check. Client-provided coordinates are never trusted.

---

## Broadcast Events

In addition to Schema patches, the server emits named events for instant UI feedback:

| Event | Payload | When |
|-------|---------|------|
| `player_caught` | `{ playerId, name, timesCaught, catchesRemaining }` | Player caught, not yet eliminated |
| `player_eliminated` | `{ playerId, name }` | Player reaches catch limit |

---

## Round Lifecycle

```
onLoad()          — reset all positions and detection state
  ↓
runRound(n)
  ├── reset per-round state (detectionMeter, isHiding, timesCaught)
  ├── reset guard to GUARD_START
  ├── start 20 Hz setInterval tick loop
  ├── set a setTimeout for round time limit (gameConfig.timeLimitSecs)
  └── await Promise that resolves on _endRound()
        ↓ (either all players eliminated, or time limit fires)
scoreRound(n)     — add survival points, deduct catch penalties, adjust speed
```

---

## Performance Notes

- The tick loop runs at 20 Hz (50 ms). Each tick iterates over at most 8 players plus one guard — O(n) with small constant.
- DDA ray cast: O(max(|dx|, |dy|) × 2) steps per player per tick. With a range of 6 tiles this is at most ~24 iterations.
- Colyseus Schema mutations are batched and sent as binary deltas at the end of each broadcast cycle, not on every mutation.
