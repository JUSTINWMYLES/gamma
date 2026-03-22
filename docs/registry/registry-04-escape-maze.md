## Title

Escape A Maze

## ID

registry-04-escape-maze

## One-line Summary

Players navigate a maze to escape; multiplayer variants can hide player identity or share partial maps.

## Long Description

The maze is shown on the main tv display, and the phones are used to handle player navigation.

Two game modes:

1. Single or multiplayer maze navigation where players must find exits within a time limit. Variants include shared maze where each phone shows a different section, cooperative map stitching, or a competitive race.
2. When there are 4, 8, 12, 16, or 20 players, teams of 4 are randomly created and each player is given a specific role, either forward, left, right, back. User navigation of the maze is driven by shaking the phones. So if the forward user shakes their phone, the player in the maze will move forward


## Target Platforms

- Primary: mobile, web

## Core Mechanics

- Player movement (swipe or tilt)
- Collision with walls
- Map reveal mechanics

## Player Interactions

- Controls: swipe-to-move or on-screen joystick; optional tilt
- Feedback: footsteps, collision sounds, minimap reveals

## Required Inputs / Sensors

- `touch`, optional `accelerometer`

## Outputs / Network

- Sync player positions in multiplayer (messages: {playerId, position, timestamp})

## UI Flow

1. Lobby -> choose maze/difficulty -> start -> in_play -> exit/timeout

## State Machine

- `lobby`->`in_round`->`escaped`/`failed`

## Data Structures

- Maze: {cells, start, exit, seed}
- Player: {id, pos, moves}

## Assets

- Tile set, player avatar, minimap overlay

## Performance & Constraints

- Procedural maze generation must be deterministic from seed for synced multiplayer

## Failure Modes & Recovery

- Out-of-sync positions -> authoritative reconciliation from host

## AI Integration Guide

- Purpose: generate mazes, adapt difficulty, create hints

## Test Cases / Acceptance Criteria

- Deterministic maze generation from seed

## Implementation Tasks

1. ~~Maze generator and renderer~~ ✅
2. ~~Movement and collision~~ ✅
3. ~~Multiplayer sync (optional)~~ ✅

## Implementation Notes (backfilled)

### Architecture

- **Server**: `server/src/games/registry-04-escape-maze/index.ts` — `EscapeMazeGame extends BaseGame`
- **Client player**: `client/app/src/games/player/EscapeMaze.svelte`
- **Client TV**: `client/app/src/games/viewer/EscapeMazeTV.svelte`

### Game Modes

**Mode 1 — Individual Navigation** (default)
- Each player controls their own avatar on a shared maze via D-pad buttons.
- Players race to reach the exit within 60 seconds.
- Scoring based on finish order + time remaining.

**Mode 2 — Team Shake** (when player count divisible by 4)
- Teams of 4 share a single maze avatar.
- Each member is assigned a direction: UP, DOWN, LEFT, RIGHT.
- Shaking the phone (or tapping the shake button) sends a movement impulse in the assigned direction.
- Requires DeviceMotion API permission on iOS.
- Teams race to get their shared avatar to the exit.
- Falls back to individual mode if player count isn't divisible by 4.

### Maze Generation

- Recursive backtracker (DFS) algorithm, seeded for determinism.
- Maze grid: 12×8 cells → tile map of 25×17 tiles.
- Tile types: WALL (0), PATH (1), EXIT (2), START (3).
- Serialized to `RoomState.mapTiles` as JSON string, using `mapWidth`/`mapHeight` fields.
- Start: top-left cell center (1,1). Exit: bottom-right cell center.
- New maze generated per round from `mazeSeed + round * 7919`.

### Movement & Collision

- Server-authoritative: all movement validated against tile map.
- 100ms debounce between moves (individual).
- 300ms debounce per player shake (team mode), plus 100ms team move debounce.
- Wall collisions trigger `maze_wall_bump` feedback to player.

### Scoring

| Event | Points |
|-------|--------|
| 1st escape | 1000 |
| 2nd escape | 700 |
| 3rd escape | 500 |
| 4th escape | 350 |
| 5th–16th | 250 → 10 (decreasing) |
| Time bonus | +5 per second remaining |
| Participation | +25 (didn't escape) |

In team mode, all team members receive the same points.

### Messages

| Message | Direction | Payload |
|---------|-----------|---------|
| `maze_mode` | Server → All | `{ mode, playerCount }` |
| `maze_role` | Server → Player | `{ mode, controlType }` (individual) or `{ mode, teamId, direction, teamMembers[] }` (team) |
| `maze_generated` | Server → All | `{ width, height, startX, startY, exitX, exitY }` |
| `maze_teams` | Server → All | `{ teams: [{ teamId, members: [{ id, name, direction }] }] }` |
| `maze_positions` | Server → All | `{ positions: [{ id, name, x, y, escaped }] }` (individual, every 200ms) |
| `maze_team_positions` | Server → All | `{ teams: [{ teamId, x, y, escaped }] }` (team, every 200ms) |
| `maze_move_ok` | Server → Player | `{ x, y }` |
| `maze_wall_bump` | Server → Player | `{ direction }` |
| `maze_team_moved` | Server → Team | `{ teamId, x, y, movedBy, direction }` |
| `maze_player_escaped` | Server → All | `{ playerId, playerName, order, timeMs }` |
| `maze_team_escaped` | Server → All | `{ teamId, memberNames, order, timeMs }` |
| `maze_you_escaped` | Server → Player | `{ order, timeMs }` |
| `maze_timer` | Server → All | `{ timeRemaining, finishCount }` |
| `game_input` | Player → Server | `{ action: "move", direction }` (individual) or `{ action: "shake" }` (team) |

### Player Metadata

- **Min players**: 1
- **Max players**: 16
- **Activity level**: some (shaking phones in team mode)
- **Default rounds**: 2
- **Round duration**: 60 seconds
