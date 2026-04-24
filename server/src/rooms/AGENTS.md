# SERVER ROOMS

## OVERVIEW
Single Colyseus room type `"gamma_room"` implemented in `GammaRoom.ts` (763 lines). All lobby logic, game lifecycle, reconnect, and OTEL telemetry live here.

## KEY FILES
- `GammaRoom.ts` — the room
- `playerNameUtils.ts` — name sanitization + comparison helpers

## GAMMAROOM INTERNALS

### Lifecycle
```
onCreate → _registerMessages → (clients join) → host selects game →
"start_game" → _startGame() → new GameClass(this) → game.start() →
(rounds run in BaseGame) → game.teardown() → back to lobby
```

### Important message handlers (this.onMessage)
| Message | Handler | Notes |
|---------|---------|-------|
| `player_ready` | sets PlayerState.isReady | |
| `select_game` | sets state.selectedGame; calls loadGame() for defaults | |
| `update_config` | updates state.gameConfig fields | host only |
| `start_game` | calls `_startGame()` | host only |
| `game_input` | forwarded to `this.game.handleInput(client, data)` | active game only |
| `kick_player` | removes player from room | host only |
| `update_permissions` | updates PlayerState mic/motion flags | |

### Join roles
- `role: "player"` → added to `state.players`, first player becomes host
- `role: "view_screen"` → viewer/TV client, sets `state.viewScreenSessionId`

### Reconnect flow
1. Colyseus `allowReconnection` (short grace window)
2. Name-based reconnect: if new join has same name as a recently disconnected slot (within `RECONNECT_GRACE_SECONDS` env), the slot is reclaimed and `game.onPlayerReconnected?.(oldId, newId, client)` is called

### Host selection
- First player to join becomes host (`hostSessionId`)
- If host leaves, host migrates to another active player

### Telemetry
GammaRoom uses exported `meter`/`tracer` from `../telemetry.ts` — OTEL counters and spans are active on join, start, and game lifecycle events.

## ANTI-PATTERNS
- Do not add game-specific logic to GammaRoom — put it in the game plugin (`BaseGame` subclass).
- Always guard host-only messages with `_isHost(client)`.
- Do not block the Colyseus event loop with synchronous heavy work — game lifecycle is async via `BaseGame.start()`.
