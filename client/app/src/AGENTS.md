# CLIENT APP SRC

## OVERVIEW
Single Svelte SPA for both phone controller and TV display. Role + phase state in `App.svelte` drives all screen mounting — no external router.

## ROUTING PATTERN
`App.svelte` uses reactive `if/else` blocks on three variables:
- `role`: `"none"` | `"player"` | `"viewer"` — set from `RoleSelectScreen`
- `playerView`: `"landing"` | `"join"` | `"host"` | `"room"`
- `viewerView`: `"join_code"` | `"room"`
- Within `"room"`: `state.phase` selects which screen mounts (Lobby / Instructions / Countdown / Game / RoundEnd / Scoreboard / GameOver)

Session persistence: `App.svelte` saves/loads from `sessionStorage["gamma-session"]` for auto-reconnect.

## PLAYER vs VIEWER
| | Player (phone) | Viewer (TV/display) |
|---|---|---|
| Join via | `createRoom` / `joinRoom` | `joinAsViewer` |
| Role field | `"player"` | `"view_screen"` |
| Screens | `screens/player/` | `screens/viewer/` |
| Game UI | `games/player/*.svelte` — input widgets | `games/viewer/*TV.svelte` — big-screen visuals |
| Sends | `room.send("game_input", {...})` | read-only display |

## GAME SCREEN ROUTING
- `screens/player/GameScreen.svelte` — imports all `games/player/*.svelte`, mounts correct one based on `state.selectedGame`; also handles generic joystick/tilt input loop
- `screens/viewer/GameScreen.svelte` — imports all `games/viewer/*TV.svelte`; some games use canvas, others delegate to `*TV.svelte`

## SENDING MESSAGES (pattern)
```svelte
<script>
  export let room;   // Colyseus Room passed down from App.svelte
  function onTap() {
    room.send("game_input", { action: "my_action", value: 42 });
  }
</script>
```

## LIB UTILITIES
| File | Purpose |
|------|---------|
| `lib/permissions.ts` | Mic stream caching (`cacheMicStream`, `getCachedMicStream`, `releaseMicStream`) + iOS motion permission tracking |
| `lib/deviceLockdown.ts` | Installed at startup via `main.ts`; prevents pinch-zoom and shake-to-undo on mobile |
| `stores/theme.ts` | Svelte writable store for light/dark theme; persists to `localStorage` |

## STATE MANAGEMENT
- No Redux / Zustand.
- **Authoritative state**: Colyseus `room.state` (typed `RoomState`) — `App.svelte` wires `room.onStateChange` and passes `state` prop down to all screens.
- **Local UI state**: Svelte component `let` + `$:` reactivity.
- **Persistence**: `sessionStorage` (reconnect), `localStorage` (theme), in-component caching for permissions.

## ANTI-PATTERNS
- Never implement authoritative game logic in client components — send inputs and react to server state.
- Do not split player and viewer into separate Vite apps — they share the same build.
- Never call `room.send` from viewer components — viewer is display-only.
- `verbatimModuleSyntax` must NOT be set in tsconfig (see root AGENTS.md).
