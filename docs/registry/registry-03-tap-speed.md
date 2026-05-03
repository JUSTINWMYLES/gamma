## Title

Tap Speed Count

## ID

registry-03-tap-speed

## One-line Summary

Players tap the screen as fast as possible during a short window; counts determine scores.

## Long Description

Each round gives players a fixed time window to tap the screen. The app counts taps, debounces accidental multi-touch if needed, and reports counts. Variants include per-finger counts or alternating taps. If there are enough players, make a bracket for 1v1 competitions

## Target Platforms

- Primary: mobile (touch)

## Core Mechanics

- Tap detection and counting
- Time-limited rounds
- Anti-cheat debouncing and multi-touch handling

## Player Interactions

- Controls: rapid touch input
- Feedback: per-tap sound, combo visual, final count animation

## Required Inputs / Sensors

- `touch`

## Outputs / Network

- Send {playerId, taps, duration} to scoreboard aggregator when round ends

## UI Flow

1. Ready screen -> countdown -> tapping window -> results

## State Machine

- `idle`->`countdown`->`active`->`reporting`

## Data Structures

- Player: {id, name, tapCount}
- Round: {id, timeLimit, startTime}

## Assets

- Tap sound, progress bar, animated counter

## Performance & Constraints

- Must reliably count high-frequency taps (200+ taps/min) without missing events

## Failure Modes & Recovery

- Touch event flood -> throttle with high-resolution timestamp checks

## AI Integration Guide

- Purpose: analyze tap patterns, suggest fairness thresholds, or generate variations

## Test Cases / Acceptance Criteria

- Accurate counting across iOS/Android devices for 30s window

## Implementation Tasks

1. ~~Implement touch listener and debouncing~~ ✅
2. ~~Add visual/audio feedback~~ ✅
3. ~~Integrate scoreboard~~ ✅

## Implementation Notes (backfilled)

### Architecture

- **Server**: `server/src/games/registry-03-tap-speed/index.ts` — `TapSpeedGame extends BaseGame`
- **Client player**: `client/app/src/games/player/TapSpeed.svelte`
- **Client TV**: `client/app/src/games/viewer/TapSpeedTV.svelte`

### Bracket System

This is the first game to use the bracket system (`server/src/utils/bracket.ts`).

- Players are seeded into a single-elimination bracket via `buildBracket(playerIds, seed)`.
- `advanceBracket(state, seed)` collects winners and builds the next round.
- The game overrides `runRounds()` entirely — it drives a bracket loop instead of the default N-round loop.
- Each bracket match is run sequentially with countdown → tapping → result phases.

### Match Flow

1. Match announced (`tap_match_start` message)
2. 3-second countdown phase
3. Tapping window: random duration 5–20 seconds per match
4. Both players tap as fast as possible
5. Player with more taps wins and advances
6. Loser is eliminated (`isEliminated = true`)
7. 4-second result display, then next match

### Anti-Cheat

- 50ms minimum between accepted taps (debounce) — ~20 taps/sec max
- Disconnected player auto-loses (opponent gets auto-win)

### Scoring

| Event | Points |
|-------|--------|
| Match win | +100 |
| Per tap (both players) | +1 |
| Champion bonus | +500 |
| Runner-up bonus | +200 |

### Messages

| Message | Direction | Payload |
|---------|-----------|---------|
| `tap_bracket_init` | Server → All | `{ totalPlayers, totalRounds }` |
| `tap_match_start` | Server → All | `{ matchId, player1Id, player1Name, player2Id, player2Name, bracketRound }` |
| `tap_go` | Server → Match players | `{ durationMs, endsAt }` |
| `tap_confirmed` | Server → Tapper | `{ tapCount }` |
| `tap_counts` | Server → All | `{ matchId, player1Id, player1Taps, player2Id, player2Taps }` |
| `tap_match_timer_start` | Server → All | `{ matchId, durationMs, endsAt }` |
| `tap_match_end` | Server → All | `{ matchId, player1Id, player1Taps, player2Id, player2Taps }` |
| `tap_match_result` | Server → All | `{ matchId, winnerId, winnerName, loserId, loserName, winnerTaps, loserTaps, durationMs }` |
| `tap_bracket_round_advance` | Server → All | `{ newRound }` |
| `tap_tournament_complete` | Server → All | `{ championId, championName, runnerUpId, runnerUpName }` |
| `game_input` | Player → Server | `{ action: "tap" }` |

### Player Metadata

- **Min players**: 2
- **Max players**: 16
- **Activity level**: none (seated, phone-only)
- **Bracket**: yes (first game to use it)
