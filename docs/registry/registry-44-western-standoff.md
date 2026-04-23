## Title

Western Standoff

## ID

registry-44-western-standoff

## One-line Summary

Two players stand back-to-back, turn on the draw, and race to land the first valid quick-draw shot in a single-elimination western bracket.

## Long Description

Western Standoff is a same-room reaction duel built around phone orientation. The tournament runs as a 1v1 single-elimination bracket shown on the TV. Each duel begins with a 10-second “you’re up next” preview so the selected players can step into position. They stand back-to-back, calibrate their phones while facing away, take three paces apart, then wait for the draw signal. Once the TV calls the draw and plays the whip-crack sound, players must turn around, raise the phone sideways into a landscape aiming pose, and tap to fire. The server only accepts shots after the draw and only when the device orientation proves the player is both turned around and aiming correctly. First valid shot wins the duel and advances.

## Target Platforms

- Primary: mobile iOS/Android
- Secondary: web viewer / TV display

## Core Mechanics

- 1v1 single-elimination bracket tournament
- 10-second duel preview before each matchup
- Per-player orientation calibration while standing back-to-back
- Shared three-pace countdown followed by a synchronized draw signal
- Server-authoritative shot validation using phone orientation at tap time
- First valid shot after the draw wins the duel

## Player Interactions

- Controls: touch to calibrate and fire; device orientation / gyroscope for pose validation
- Feedback: TV duel callout, draw sound, 3D revolver render on phone, pose-ready indicator, shot rejection feedback, winner reveal

## Required Inputs / Sensors

- `touch`
- `gyroscope`
- `deviceorientation`

## Outputs / Network

- Phone output: preview, calibration prompt, 3D revolver, pose readiness, fire button, result state
- TV output: duel announcement, calibration status, countdown, draw timer, result, champion screen
- Key server messages:
  - `standoff_bracket_init`
  - `standoff_match_preview`
  - `standoff_calibrate_start`
  - `standoff_ready`
  - `standoff_calibration_saved`
  - `standoff_paces_countdown`
  - `standoff_draw`
  - `standoff_invalid_shot`
  - `standoff_match_result`
  - `standoff_bracket_round_advance`
  - `standoff_tournament_complete`
- Client input payloads:
  - `{ action: "standoff_calibrate_done", alpha, beta, gamma }`
  - `{ action: "standoff_shoot", alpha, beta, gamma }`

## TV Requirement

- `requiresTV`: true
- The TV is required because it provides the shared bracket, duel callout, countdown, and draw signal that all duelists must react to together.

## Round Configuration

- `defaultRoundCount`: 1
- `minRounds`: 1
- `maxRounds`: 1
- `supportsBracket`: true

## Instructions Phase

- `hasInstructionsPhase`: true
- `instructionsDelivery`: `broadcast`

## UI Flow

1. Lobby / Join
2. Game loading — motion permission must already be enabled in the lobby
3. Instructions — all players see the western duel rules and confirm readiness
4. Bracket intro on TV
5. Duel preview — selected players are announced for 10 seconds
6. Calibration — both duelists lock their “facing away” orientation
7. Pace countdown — TV counts three paces
8. Draw phase — TV plays the draw cue and players fire when ready
9. Match result — winner advances, loser is eliminated
10. Next duel or bracket champion reveal
11. Scoreboard

## State Machine

- Room-level states: `lobby` -> `game_loading` -> `instructions` -> `in_round` -> `scoreboard` -> `game_over`
- In-round duel substates:
  - `bracket_init`
  - `match_preview`
  - `calibrating`
  - `countdown`
  - `draw_live`
  - `match_result`
  - `tournament_complete`
- Transitions:
  - `start_game` -> instructions / bracket intro
  - preview timer complete -> calibration
  - both players calibrated or calibration timeout -> pace countdown
  - countdown complete -> draw live
  - first valid shot / disconnect / duel timeout -> result
  - all heats complete in round -> next bracket round or champion

## Data Structures

- Player: `{ id, name, score, isEliminated, currentMatchOpponentId, motionPermission }`
- Orientation snapshot: `{ alpha, beta, gamma }`
- Match state:
  - `{ matchId, player1Id, player2Id, bracketRound, stage, calibrations, readyPlayerIds, drawAt, winnerId, loserId, shooterId, reactionMs, resolutionReason }`
- Bracket heat: `{ id, playerIds, advancingIds, status }`

## Assets

- `models/revolver.glb` — rendered on player phones
- `audio/whip_crack.wav` — draw signal sound
- Placeholder fallback icon if the revolver model fails to load
- Western UI palette / bracket display art

## Performance & Constraints

- Phone orientation checks run on the client for readiness feedback but final validation happens on the server
- Server uses only small orientation payloads; bandwidth is minimal
- Duel timeout is 12 seconds after the draw so a match cannot stall indefinitely
- Calibration timeout is 20 seconds so one missing player cannot hold the bracket forever
- Preview duration is fixed at 10 seconds for physical setup consistency

## Failure Modes & Recovery

- Missing motion permission: player can still see UI but cannot reliably calibrate or fire; lobby should be used to re-enable permission
- Invalid orientation payload: shot/calibration request is rejected and the phone shows feedback
- Early shot before draw: rejected with `standoff_invalid_shot` / `too_early`
- Player disconnect during duel: connected opponent wins by disconnect resolution once reconnect grace is exceeded
- Calibration timeout with only one calibrated player: calibrated player advances
- Calibration timeout with zero calibrated players or duel timeout after draw: winner is chosen deterministically from a seeded tiebreak helper so the bracket always progresses
- Player reconnect with new session ID: server migrates calibration, pending score, and bracket references via `onPlayerReconnected`

## AI Integration Guide

- Purpose: optional future use for generating western announcer lines, duel intro text, or sound-selection recommendations
- Input to model:
```json
{
  "id": "registry-44-western-standoff",
  "phase": "match_preview",
  "player1": "Alex",
  "player2": "Blair",
  "style": "dramatic-western"
}
```
- Expected model output:
```json
{
  "announcerLine": "Alex and Blair step into the dust for a high-noon showdown."
}
```

### Example prompt skeleton
```
Generate western duel announcer copy for: {"id":"registry-44-western-standoff","phase":"match_preview","players":2}
Return: {"announcerLine":"..."}
```

## Test Cases / Acceptance Criteria

- Orientation normalization handles wraparound and rejects invalid payloads
- A shot before the draw is rejected with `too_early`
- A shot after draw but without enough turn delta is rejected
- A shot after draw in a valid landscape aim pose resolves the duel immediately
- Session ID reconnect migrates current match calibration state and pending scores
- Duel flow broadcasts preview, calibration, countdown, draw, and result messages in sequence
- Stale timeouts from a previous duel cannot resolve a later duel
- Full server unit suite passes with western standoff tests included

## Implementation Tasks

1. Add server game plugin and pure orientation helper logic
2. Build bracket-driven duel lifecycle with preview, calibration, countdown, and draw phases
3. Add player phone UI with motion input, local pose feedback, and revolver model render
4. Add TV duel presentation and champion screen
5. Add instruction slides and game registry metadata
6. Add automated server tests for logic, duel flow, reconnect handling, and timeout safety
