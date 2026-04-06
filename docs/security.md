# Security & Privacy

This document covers the threat model, implemented mitigations, and known gaps for the Gamma platform.

---

## Threat Model

| Threat | Attack vector | Impact |
|--------|--------------|--------|
| Input spoofing | Malicious client sends fabricated position or action messages | Unfair advantage, server crash |
| Room enumeration | Attacker scans all possible 4-char room codes | Joining rooms uninvited |
| DoS via room flooding | Client creates unlimited rooms or sends high-frequency messages | Server resource exhaustion |
| Sensitive data exposure | Player names or session IDs leaked in logs or to other clients | Privacy |
| Man-in-the-middle | WebSocket traffic intercepted | Token theft, input injection |
| Prototype pollution / injection | Malformed JSON message payloads | Server crash, RCE |

---

## Input Validation (Server-Authoritative Model)

All game state is **server-authoritative**. Clients never send positions — they send intent (`action: "move"`, `dx`, `dy`). The server:

1. Clamps the direction vector to a unit vector before applying movement.
2. Checks `isWalkable()` before updating the player's position.
3. Validates that `dx` and `dy` are finite numbers before any math.
4. Ignores input messages received outside the `in_round` phase.
5. Ignores input from eliminated or disconnected players.

This means even a client that sends fabricated position data cannot move through walls or teleport — the server computes every position from scratch on each tick.

### Recommended additions

- Add a maximum message rate per client (see rate limiting below) to prevent flooding the input queue.
- Schema-validate incoming JSON with a library like `zod` before casting to `InputMessage`.

---

## Rate Limiting

### Current state

No explicit rate limiting is implemented. Colyseus provides basic flood protection at the WebSocket level (connection rate), but per-message rate limiting is not yet in place.

### Recommended implementation

Add a per-session message counter in `GammaRoom.onMessage`:

```typescript
// In GammaRoom.ts — onMessage handler
private messageCounts = new Map<string, { count: number; windowStart: number }>();

private isRateLimited(sessionId: string): boolean {
  const now = Date.now();
  const entry = this.messageCounts.get(sessionId) ?? { count: 0, windowStart: now };
  if (now - entry.windowStart > 1000) {
    entry.count = 0;
    entry.windowStart = now;
  }
  entry.count++;
  this.messageCounts.set(sessionId, entry);
  return entry.count > 60; // max 60 messages/second per client
}
```

Drop messages that exceed the limit and optionally kick repeat offenders.

### Kubernetes-level rate limiting

In production, place an ingress controller (NGINX, Traefik) in front of the Colyseus WebSocket endpoint and configure connection-rate and request-rate limits at the L7 layer.

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
- [ ] `VITE_SERVER_URL` set to `wss://your-domain` at client build time.

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
| Bot/macro input | Not mitigated | A client can send input at machine speed; rate limiting (see above) would cap this |
| Session spoofing | Mitigated by Colyseus | Session IDs are server-generated UUIDs; clients cannot forge them |

---

## Known Gaps

1. No per-message rate limiting (tracked in backlog).
2. No input schema validation library; messages are cast directly to `InputMessage`.
3. Room codes have no secondary PIN protection.
4. Production TLS setup is not automated in the Helm chart (cert-manager integration is a future task).
5. No CSRF protection on the HTTP API (low risk — there are no mutating HTTP endpoints, only WebSocket).
