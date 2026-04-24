# CLIENT SHARED

## OVERVIEW
Shared code used by `client/app` but living outside the Vite build root. Three files — all critical.

## FILES

### `colyseusClient.ts` — connection layer
Server URL resolution (in priority order):
1. `window.__GAMMA_CONFIG__?.serverUrl` — runtime injection via `/config.js` (container deployments)
2. Build-time `__SERVER_URL__` define (set when `VITE_SERVER_URL` env present at Vite build)
3. `import.meta.env.VITE_SERVER_URL`
4. Auto-derive from page origin: dev ports (5173/5174) → `ws://hostname:2567`; otherwise → `wss://hostname/ws`
5. Fallback: `ws://localhost:2567`

**Key exports:**
```typescript
getClient(): Colyseus.Client         // lazy singleton
createRoom(name): Promise<Room>      // host creates room (role: "player")
joinRoom(code, name): Promise<Room>  // join by 4-char room code (role: "player")
joinAsViewer(code): Promise<Room>    // join as display (role: "view_screen")
```
All join/create calls are wrapped in `withConnectionTimeout` — throws `"Timed out connecting to the room"` if server unreachable.

### `types.ts` — shared TypeScript types
`RoomState`, `PlayerState`, `Phase`, and other types shared between client and server. **Edit here first** when adding new state fields; ensure server Schema stays in sync.

### `playerIconDesign.ts` — player icon serialization
Parsing, sanitization, and serialization of player icon designs. Used by `components/PlayerIcon.svelte` and `components/IconDesignEditor.svelte`.

## NOTES
- `client/app/tsconfig.json` includes `../shared/**/*` so these files compile as part of the client build.
- Do not add Svelte components here — shared/ is TypeScript only.
