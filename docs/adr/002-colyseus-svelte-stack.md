# ADR-002: Colyseus + Svelte Tech Stack

**Date:** 2025-01
**Status:** Active

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
