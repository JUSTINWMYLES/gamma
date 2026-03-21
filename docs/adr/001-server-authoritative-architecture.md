# ADR-001: Server-Authoritative Architecture

**Date:** 2025-01
**Status:** Active

## Context

Gamma is a multiplayer party game platform where devices act as controllers and a shared display shows the game state. The fundamental question is: where does game logic live?

Options considered:
1. **Client-authoritative** — each device computes its own state and broadcasts it
2. **Server-authoritative** — the server owns all state; clients send intent only
3. **Hybrid** — clients predict locally, server reconciles

## Decision

All game logic executes on the server (Node.js + Colyseus). Clients send *intent* messages (e.g. `{ action: "move", dx: 0.7, dy: -0.3 }`) and receive state changes via the Colyseus Schema diff protocol. Clients never directly mutate game state.

## Rationale

- **Cheat prevention:** Clients cannot teleport, spoof scores, or alter guard state.
- **Consistency:** All players and the view screen share a single ground-truth state with no divergence.
- **Reconnect safety:** A player who drops and reconnects immediately gets the current state without needing to replay a log.
- **Simplicity at the game-plugin level:** Game authors write synchronous server-side logic; they do not need to implement prediction or reconciliation.

## Consequences

- Latency on device controls (round-trip to server before position updates). Mitigated by running the server locally on LAN for in-room play.
- Network bandwidth for Schema diffs on every tick (50ms). Colyseus delta-encodes, so only changed fields travel over the wire.
