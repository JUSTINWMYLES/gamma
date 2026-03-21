# ADR-003: Single Room Type (GammaRoom)

**Date:** 2025-01
**Status:** Active

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
