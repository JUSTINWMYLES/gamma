# Player Reconnect and Drop Handling Design

## Document Status

- **Feature area:** player reconnect, disconnect cleanup, and join gating
- **Document purpose:** implementation design for dropped-player handling across server and client
- **Document location:** `docs/player-reconnect-and-drop-design.md`
- **Status:** proposed

## Summary

Gamma already has two partial reconnect mechanisms:

- Colyseus `allowReconnection()` for same-session reconnects
- name-based slot reclaim in `GammaRoom` for a new session joining with the same player name

What is missing is a single, explicit policy for how long a disconnected player is kept, when their slot is removed, how the client helps them rejoin, how fresh joins are handled once a game has started, and how per-round waits should react when somebody disappears.

This design keeps the current room-code + player-name model, sets the reconnect grace window to **30 seconds**, stores the player name locally so manual rejoin only needs a room code, removes expired disconnected players from the room list, blocks fresh mid-game joins, and separates **slot retention** from **wait blocking** so voting/countdowns/submission phases do not stall on disconnected players.

This is intentionally an in-memory design only. Gamma has no persistent database, so reconnect can only recover a player while the original room process is still alive.

## Goals

- Keep a disconnected player’s slot reclaimable for 30 seconds
- Let a returning player recover the same slot by entering only the room code, with their name pre-filled from local storage
- Remove expired disconnected players from `state.players` so the room list stays accurate
- Prevent countdowns, voting, and submission waits from hanging on dropped players
- Define a single policy for fresh joins after a game has started
- Preserve the current single-room, server-authoritative architecture

## Non-Goals

- Cross-room or cross-restart identity recovery
- Persistent accounts or database-backed player profiles
- Spectator mode for fresh player joins mid-game
- A full rewrite of every game’s round logic in one pass
- Replacing the room-code + name flow with account auth tokens

## Current Behavior Snapshot

### Server

- `server/src/rooms/GammaRoom.ts`
  - marks players disconnected in `onLeave`
  - calls `allowReconnection()` with a default grace of 60 seconds
  - supports name-based reclaim in `_onPlayerJoin`
  - does **not** remove the player from `state.players` when grace expires
  - does **not** block fresh player joins during `instructions`, `countdown`, `in_round`, `round_end`, or `scoreboard`

- `server/src/games/BaseGame.ts`
  - `isPlayerActive()` counts disconnected players as active while they are still inside the reconnect grace window
  - `waitForAllReady()` can therefore wait as long as the reconnect grace timeout

- several game plugins compute expected voters/submissions from a snapshot of active players, so a disconnected player can remain in the denominator until a phase timeout fires

### Client

- `client/app/src/App.svelte` stores `{ roomCode, name, role }` in `sessionStorage`
- page refresh can auto-attempt a rejoin using that saved session
- closing the tab loses the cached name because it is not stored in `localStorage`
- `JoinScreen.svelte` and `HostScreen.svelte` do not pre-fill the last used player name

## Design Decisions

### 1. Reconnect grace is 30 seconds

Use a shared server constant:

- `RECONNECT_GRACE_SECONDS = 30`

This is the maximum time a disconnected player slot remains reclaimable.

### 2. Waits use a shorter tolerance than slot retention

Use a second shared constant:

- `ACTIVE_WAIT_TOLERANCE_SECONDS = 15`

This means:

- a disconnected player can still reclaim their slot for 30 seconds
- but they only block readiness/voting/submission waits for 15 seconds

This split solves two different problems:

- **slot retention:** keep the player’s place in the room
- **phase progress:** do not freeze the rest of the room for the entire retention window

### 3. Manual rejoin remains room-code + name based

Do **not** introduce a new client reconnect-token flow as the primary UX.

Instead:

- keep the existing `joinRoom(roomCode, name)` API
- cache the last player name locally
- pre-fill the name on join/create screens
- allow room-code-only rejoin from the player’s perspective because the cached name is supplied automatically

This matches the current architecture and already works with Gamma’s existing name-based reclaim logic.

### 4. Fresh joins are blocked once the room leaves lobby

Policy:

- **Allowed:** fresh player joins while `state.phase === "lobby"`
- **Allowed:** reconnects that reclaim an existing disconnected slot within grace
- **Rejected:** brand-new player joins after the room leaves lobby
- **Always allowed:** viewer/display joins

Fresh mid-game joins are unsafe because many games initialize participant lists or assign hidden roles at round start.

### 5. Expired disconnected players are removed from room state

When the 30-second grace expires without a reclaim:

- delete that `PlayerState` from `state.players`
- remove any game-local session keyed data through a hook
- migrate host if the dropped player was host

This makes the room list truthful and prevents stale inactive players from accumulating.

## Proposed Player Lifecycle

### States

| State | Meaning |
|---|---|
| Connected | Player is present and can participate normally |
| Disconnected-Held | `isConnected = false`, `disconnectedAt > 0`, slot is reclaimable within 30s |
| Dropped | Grace expired; slot removed from `state.players` |
| Rejoined | Returning client reclaimed the prior slot |

### Timeline

1. Player disconnects.
2. Server marks `isConnected = false` and records `disconnectedAt`.
3. For the next 30 seconds:
   - same-session Colyseus reconnect is allowed
   - name-based reclaim from a new session is allowed
   - the player still appears in the room list with a disconnected state
4. After 15 seconds, they no longer block waits.
5. After 30 seconds, if unreclaimed:
   - the slot is deleted from `state.players`
   - game-local session maps are cleaned up
   - host migration runs if needed

## Client Experience

### Role before name

Gamma already asks the user to choose device role first (`player` vs `viewer`).

This design keeps that order:

1. choose phone role
2. choose host or join
3. enter room code if joining
4. confirm the pre-filled player name

No additional role-selection architecture is required for this feature.

### Local persistence

Split persistence by purpose:

- `localStorage["gamma-player-name"]` → last confirmed player name
- `sessionStorage["gamma-session"]` → active room session metadata such as room code and role

Why split them:

- `localStorage` survives tab close, so the user can reopen the app later and only type the room code
- `sessionStorage` remains appropriate for the current in-tab session and auto-reconnect hinting

### Join and host screens

- `JoinScreen.svelte` pre-fills the cached player name
- `HostScreen.svelte` pre-fills the cached player name
- saving a valid join/host action updates both the local name cache and the active session cache

### Rejoin affordances

Recommended UI behavior:

- if `sessionStorage` still has `{ roomCode, name, role: "player" }`, `App.svelte` may auto-attempt a reconnect on refresh
- if that fails, keep the cached name and return to join flow with the name already filled in
- if both a cached room code and cached name exist, `LandingScreen.svelte` can show a convenience CTA such as `Rejoin MONICA in ABCD`

## Server Architecture

### Shared config

Add a shared server config module, for example:

- `server/src/config.ts`

It should export:

- `RECONNECT_GRACE_SECONDS`
- `RECONNECT_GRACE_MS`
- `ACTIVE_WAIT_TOLERANCE_SECONDS`
- `ACTIVE_WAIT_TOLERANCE_MS`

This removes the current duplicated reconnect constant definitions in `GammaRoom.ts` and `BaseGame.ts`.

### `GammaRoom` responsibilities

#### Disconnect handling

`server/src/rooms/GammaRoom.ts`

On leave:

1. mark player disconnected
2. call `allowReconnection(client, 30)` for same-session reconnect support
3. keep the slot reclaimable for 30 seconds
4. if reconnect succeeds, restore `isConnected`
5. if reconnect fails and no name-based reclaim happened, remove the slot from `state.players`

#### Name-based reclaim

Keep the existing normalized-name reclaim behavior in `_onPlayerJoin`, but make it the explicit manual rejoin path.

Rules:

- match by sanitized/case-insensitive player name
- only reclaim a slot that is disconnected and still within grace
- migrate `hostSessionId` if the old slot was host
- call `game.onPlayerReconnected(oldId, newId, client)` so plugins can rewrite session-keyed maps

#### Prevent double-claim races

There is a race between:

- Colyseus same-session reconnect
- manual name-based reclaim from a new session

Implementation requirement:

- once one reclaim path wins, the other must no longer be allowed to reactivate a second live client for the same logical player slot

The simplest implementation is a room-local reconnect claim record keyed by old session id.

### Host migration

When an expired disconnected host is removed:

- assign host to the first connected non-eliminated player in room order
- if no connected players remain, leave `hostSessionId` empty

If the original host reclaims their slot **before** it expires, they remain host because they are recovering the same slot.

If the host is already dropped and migration has happened, the new host remains host for the rest of the current room session.

## Wait Semantics

### Problem

Today, `isPlayerActive()` is used for both:

- whether a player should still count as part of the round
- whether the rest of the room should keep waiting on them right now

Those are not the same thing.

### Proposal

Add distinct BaseGame helpers:

- `isPlayerReconnectEligible(player)`
  - connected, or disconnected within 30-second grace
- `isPlayerBlockingWait(player)`
  - connected, or disconnected for less than 15 seconds
- `getReconnectEligiblePlayers()`
- `getWaitBlockingPlayers()`

`waitForAllReady()` should use the **wait-blocking** set, not the full reconnect-eligible set.

### Dynamic denominators

Submission and voting loops should stop using fixed `expectedPlayerIds` snapshots where practical.

Instead, each poll should recalculate the current blocking participants. This lets the denominator shrink automatically when somebody disconnects for more than the wait tolerance.

### Game-specific implications

Representative updates:

| File | Wait logic to revisit |
|---|---|
| `server/src/games/registry-43-medical-story/index.ts` | `_waitForSubmissions`, `_waitForVotes`, `_waitForRoleVotes` |
| `server/src/games/registry-25-lowball-marketplace/index.ts` | `_waitForAllBidsOrTimeout` |
| `server/src/games/registry-20-odd-one-out/index.ts` | vote completion checks |
| `server/src/games/registry-07-hot-potato/index.ts` | vote denominator updates; keep holder-disconnect special case |

Hot Potato remains a deliberate exception: if the active holder disconnects, immediate game-specific resolution is still appropriate.

## Mid-Game Join Policy

### Accepted policy

Reject fresh player joins after lobby.

Server behavior in `onAuth` or early join validation:

- if `role === "view_screen"`, allow
- if `state.phase === "lobby"`, allow
- if a disconnected slot with equivalent name exists and is within grace, allow reclaim
- otherwise reject with a clear error such as:
  - `Game already in progress. Rejoin using your previous name or wait for the next lobby.`

### Why this policy

- avoids rebalancing games that already assigned roles or created brackets
- avoids hidden-information leaks
- avoids inconsistent scoreboards and participation counts
- fits current server architecture with minimal surface area

Queue-for-next-game could be added later, but it is intentionally out of scope for this document.

## Implementation Touchpoints

| File | Recommended change |
|---|---|
| `server/src/config.ts` | add shared reconnect and wait constants |
| `server/src/rooms/GammaRoom.ts` | use shared constants, remove expired slots, migrate host, block fresh mid-game joins, prevent double-claim races |
| `server/src/games/BaseGame.ts` | add wait-vs-reconnect helper split; add optional `onPlayerDropped(sessionId)` hook |
| `server/src/schema/PlayerState.ts` | no schema change required for core design; existing `isConnected` and `disconnectedAt` are sufficient |
| `server/src/rooms/playerNameUtils.ts` | keep as the canonical name normalization/equality layer |
| `client/app/src/App.svelte` | split local/session persistence, preserve cached name on reconnect failure, optionally show rejoin CTA |
| `client/app/src/screens/player/JoinScreen.svelte` | pre-fill cached name |
| `client/app/src/screens/player/HostScreen.svelte` | pre-fill cached name |
| `client/app/src/screens/player/LandingScreen.svelte` | optional rejoin banner/button when cached session exists |
| game plugins with session-keyed maps | implement `onPlayerDropped` cleanup and dynamic wait denominators |

## Recommended Server Hook Additions

### `BaseGame`

Add:

- `onPlayerReconnected(oldId, newId, client)` — already supported by some games
- `onPlayerDropped(sessionId)` — new optional cleanup hook

Use `onPlayerDropped` for per-game session keyed state such as:

- votes
- bids
- per-round submission maps
- target assignments
- bracket/session caches

## Edge Cases

### Host disconnects

- if they reconnect within 30 seconds, nothing changes
- if they expire, host migrates once and does not bounce back automatically later

### Same-name race

Two devices can try to claim the same disconnected slot. The room must permit exactly one winner.

### Rejoin after drop expiry

If the 30 seconds are over, the original slot is gone.

- in lobby: they can join as a new player again
- mid-game: they are rejected by the fresh-join policy

### Viewer joins

Viewers are not part of the reconnect/drop policy and should remain joinable at any time.

### Process death

If the server process or room dies, all in-memory state is gone. Reconnect is impossible in that case. This is expected within Gamma’s no-database architecture.

## Testing Plan

### Server tests

- grace timeout removes the player from `state.players`
- host migration runs when the dropped player was host
- name-based reclaim succeeds within 30 seconds and fails after 30 seconds
- fresh player join is rejected after lobby
- `waitForAllReady()` stops waiting after `ACTIVE_WAIT_TOLERANCE_SECONDS`
- representative game waits shrink denominators when a player stays disconnected past wait tolerance

### Client tests

- cached player name pre-fills host and join screens
- reconnect failure keeps cached name for manual retry
- refresh-time auto-rejoin still uses the active session cache

### Manual verification

- disconnect and reload within 30 seconds → same player slot is recovered
- close tab and reopen → only room code is needed because name is pre-filled
- disconnect longer than 30 seconds → player disappears from room list
- start a vote/submission phase, disconnect one player, confirm the phase continues without waiting the full reconnect grace window

## Rollout Strategy

1. Add shared constants and `GammaRoom` cleanup behavior.
2. Add client-side name caching and pre-fill UX.
3. Add BaseGame wait helper split.
4. Update the highest-risk games first (`medical-story`, `lowball-marketplace`, `odd-one-out`, `hot-potato`).
5. Run targeted regressions, then a wider multiplayer smoke test.

## Final Recommendation

Implement reconnect as a **30-second slot retention policy** with **15-second wait blocking**, keep the existing room-code + cached-name reclaim flow, reject fresh mid-game player joins, and explicitly remove expired disconnected players from room state.

This is the smallest design that satisfies the requested user experience without introducing accounts, persistence, or a second room model.
