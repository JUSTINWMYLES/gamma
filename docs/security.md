# Security & Privacy

This document covers the threat model, implemented mitigations, and known gaps for the Gamma platform.

---

## Threat Model

| Threat | Attack vector | Impact | Status |
|--------|--------------|--------|--------|
| Input spoofing | Malicious client sends fabricated position or action messages | Unfair advantage, server crash | Mitigated |
| Room enumeration | Attacker scans all possible 4-char room codes | Joining rooms uninvited | Mitigated |
| DoS via room flooding | Client creates unlimited rooms or sends high-frequency messages | Server resource exhaustion | Mitigated |
| Sensitive data exposure | Player names or session IDs leaked in logs or to other clients | Privacy | Mitigated |
| Man-in-the-middle | WebSocket traffic intercepted | Token theft, input injection | Production-only |
| Prototype pollution / injection | Malformed JSON message payloads | Server crash, RCE | Mitigated |
| Path traversal | Malicious `gameId` sent to `loadGame()` | Arbitrary file read | Mitigated |
| Memory exhaustion | Oversized `audioBase64` payloads | Server OOM | Mitigated |

---

## Implemented Mitigations

### Input Validation (Server-Authoritative Model)

All game state is **server-authoritative**. Clients never send positions — they send intent (`action: "move"`, `dx`, `dy`). The server:

1. Clamps the direction vector to a unit vector before applying movement.
2. Checks `isWalkable()` before updating the player's position.
3. Validates that `dx` and `dy` are finite numbers before any math.
4. Ignores input messages received outside the `in_round` phase.
5. Ignores input from eliminated or disconnected players.

This means even a client that sends fabricated position data cannot move through walls or teleport — the server computes every position from scratch on each tick.

### Game ID Validation (Path Traversal Prevention)

`loadGame()` in `server/src/games/gameLoader.ts` validates `gameId` against the regex `/^registry-\d{2}-[a-z0-9-]+$/` before resolving any file path. Invalid formats are rejected immediately, preventing directory traversal attempts.

### Audio Payload Size Validation

Sound Replication game (`server/src/games/registry-06-sound-replication/index.ts`) caps `audioBase64` at 500,000 characters (~375KB decoded). Oversized submissions are rejected with `sound_submit_rejected`.

### Selected Game Validation

`select_game` handler in `server/src/rooms/GammaRoom.ts` validates the requested `gameId` against `getAvailableGames()` before setting `state.selectedGame`. Invalid games are rejected with an error message to the client.

### Queue Item Validation

`set_queue` handler in `server/src/rooms/GammaRoom.ts` filters queue items against `getAvailableGames()`, discarding any invalid entries with a warning log.

### Numeric Input Validation

Game plugins validate numeric inputs with `typeof x === 'number' && Number.isFinite(x)` guards:
- **Don't Get Caught** (`registry-14-dont-get-caught`): validates `dx`/`dy` before movement
- **Shave the Yak** (`registry-19-shave-the-yak`): validates `x1`/`y1`/`x2`/`y2` before swipe processing
- **Western Standoff** (`registry-44-western-standoff`): validates orientation via `normalizeOrientation()`
- **Fire Match Blow Shake** (`registry-17-fire-match-blow-shake`): validates `amplitude`/`magnitude`

### Rate Limiting

`GammaRoom` enforces per-client message rate limiting at 60 messages/second for `game_input` messages. The rate tracker uses a sliding 1-second window. Rate-limited messages are silently dropped. State is cleaned up on player disconnect.

### CORS Configuration

HTTP CORS is configurable via the `ALLOWED_ORIGINS` environment variable (comma-separated). If unset, defaults to allow-all for development convenience.

### WebSocket Origin Validation

`onAuth()` in `GammaRoom` validates the WebSocket `Origin` header against `ALLOWED_ORIGINS` when configured. Connections from disallowed origins are rejected with ServerError 4001.

---

## Room Code Enumeration

Room codes are 4 uppercase alphanumeric characters (`[A-Z0-9]`), giving a space of 36⁴ = 1,679,616 possible codes. With a default session of ~30 minutes and a small deployment, the probability of guessing an active code by random scanning is low but not negligible.

### Mitigations in place

- Room codes are generated with a seeded LCG RNG (`server/src/utils/rng.ts`). The seed is `Date.now()` at room creation, making the code unpredictable from the outside.
- Players can only join a room that is in the `lobby` phase (joining is rejected once the game starts).

### Recommended additions

- Add an optional host-set room PIN (4-digit numeric) that must accompany the room code on join.
- Implement per-IP rate limiting on the `/join` HTTP endpoint and the `joinRoom` Colyseus match endpoint.
- Expire rooms that have been in `lobby` for more than N minutes without a game starting.

---

## Transport Security

### Current state

Development runs over plain `ws://`. In production you **must** terminate TLS at the ingress or load balancer and use `wss://`.

### Checklist for production

- [ ] TLS certificate on the WebSocket endpoint (Let's Encrypt via cert-manager or cloud provider).
- [ ] HTTP → HTTPS redirect on all ingress routes.
- [ ] HSTS header on HTTP responses.
- [ ] `GAMMA_SERVER_URL` injected as the public `wss://your-domain/ws` runtime value for the client container, or equivalent origin-based routing in place.

---

## Privacy

### Data collected

Gamma collects only what is needed to run a session:

| Data | Stored? | Retention |
|------|---------|-----------|
| Player display name | In-memory room state only | Discarded when room closes |
| Session ID (UUID) | In-memory | Discarded when room closes |
| Player position (x, y) | In-memory, broadcast to room | Discarded when room closes |
| IP address | Colyseus access log | Depends on web server log rotation policy |

No personally identifiable information is persisted to disk or a database by the application itself.

### Recommendations

- Set a short log rotation policy (e.g. 7 days) on web server access logs.
- Avoid logging player names at the server layer — log session IDs only.
- Add a privacy notice to the join screen informing players that their display name is visible to all other players in the room.

---

## Dependency Security

Run `npm audit` regularly to check for known vulnerabilities in dependencies:

```bash
npm audit
npm audit --workspace=server
npm audit --workspace=client/app
```

Pin dependency versions in production builds. Consider integrating `npm audit` into CI.

---

## Anti-Cheat

Because the server is fully authoritative, most common cheats (speed hacks, wall hacks, position teleport) are automatically prevented. Remaining vectors:

| Cheat | Status | Notes |
|-------|--------|-------|
| Speed hack | Mitigated | Server applies fixed `PLAYER_SPEED` per input event regardless of frequency |
| Wall hack | Mitigated | Server checks `isWalkable()` before moving |
| Hiding exploit | Partially mitigated | Server validates that the player's current tile is a valid hiding spot before setting `isHiding` |
| Bot/macro input | Mitigated | Rate limiting caps at 60 messages/second per client |
| Session spoofing | Mitigated by Colyseus | Session IDs are server-generated UUIDs; clients cannot forge them |

---

## Known Gaps

1. No input schema validation library (e.g., `zod`); messages are cast directly to their expected types.
2. Room codes have no secondary PIN protection.
3. Production TLS setup is not automated in the Helm chart (cert-manager integration is a future task).
4. No CSRF protection on the HTTP API (low risk — there are no mutating HTTP endpoints, only WebSocket).
5. Redis deployed without authentication in operator (S1 — requires `requirepass` configuration).
6. TTS API has no authentication on endpoints (S2 — requires auth middleware).
7. Object store credentials have hardcoded defaults; should require `secretRef` (S3).
8. Containers run as root; no Kubernetes security contexts defined (S9, S10).
9. Dockerfile base images not pinned to SHA256 digest (S16).
10. No NetworkPolicy resources defined for pod-to-pod traffic isolation (S21).
