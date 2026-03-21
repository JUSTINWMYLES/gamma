# ADR-005: Lobby Setup Flow (3-step wizard)

**Date:** 2025-03
**Status:** Active

## Context

Different groups have different constraints: some are remote, some active, some don't have a shared display. Without knowing this, the game picker has no way to surface relevant games.

## Decision

A 3-step setup wizard before the game picker:
1. **Location** — same room vs remote (`locationMode`)
2. **Activity level** — none / some / full (`activityLevel`)
3. **Display** — secondary screen available (`hasSecondaryDisplay`)

Setup state lives in `RoomState` so all devices can show progress. `setupStep` (0–4) drives both the host wizard UI and the waiting UI on other devices.

The host (whoever holds `hostSessionId`) sends `update_setup` messages; the server validates and stores the answers. The game picker then uses `getGameUnavailableReason()` to grey out incompatible games.

The setup wizard runs on whichever client is the host — a view screen if present, otherwise the player who created the room.

## Rationale

- Games can declare their requirements via static metadata on `BaseGame` (`activityLevel`, `requiresSameRoom`, `requiresSecondaryDisplay`) without any per-game registration code.
- The setup answers persist in room state so late-joining devices see the current setup.

## Consequences

- `GammaRoom` handles `update_setup` messages (host-only).
- `GAME_REGISTRY` in `client/shared/types.ts` is the client-side mirror of game metadata — must be kept in sync with server plugin statics manually.
- When the admin is a player (no view screen), the phone `LobbyScreen` shows the setup wizard instead of the waiting screen.
