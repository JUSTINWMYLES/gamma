## Title

Paint Match

## ID

`registry-40-paint-match`

## One-line Summary

Mix primary colors, white, and black on your phone to match a mystery color displayed on the TV as closely as possible.

## Long Description

The server generates a random target color and displays it prominently on the TV screen. Each player's phone shows a color-mixing canvas with five virtual paint buckets: red, yellow, blue, white, and black. Players tap and drag to pour amounts from each bucket, blending a custom color in real time on their screen. When a player is satisfied they submit their mix. Once all players have submitted (or the timer expires), the server computes the perceptual color distance between each player's mix and the target color and ranks players from closest to farthest. The game follows the system-wide bracketing mechanism, so standings feed directly into the bracket progression.

## Target Platforms

- Primary: mobile iOS/Android
- Secondary: web

## Core Mechanics

- Server-generated random target color displayed on TV
- Per-player additive color mixing using five paint buckets (red, yellow, blue, white, black)
- Real-time live preview of blended color on the player's phone
- Submission gate — player locks in their mix when ready or when the round timer expires
- Perceptual color-distance scoring (e.g., CIE ΔE or Euclidean distance in RGB/HSL space)
- Players ranked by closeness to target; supports bracket matchmaking

## Player Interactions

- Controls: tap bucket to select, drag/slider to control pour amount, tap "Submit" to lock in mix
- Feedback: live color preview updates as amounts change; haptic pulse on submission; audio "splat" on pour; celebratory sound for closest match

## Required Inputs / Sensors

- `touch`
- `network`

## Outputs / Network

- TV: displays target color, countdown timer, and post-round ranking reveal animation
- Phone: live color preview, bucket amounts, submit button, post-round placement
- Message types:
  - `color_target` — server → all: `{ roundId, targetRGB: [r,g,b] }`
  - `mix_update` — phone → server (throttled ~10 Hz): `{ playerId, mix: { red, yellow, blue, white, black } }`
  - `mix_submit` — phone → server: `{ playerId, finalMix: { red, yellow, blue, white, black } }`
  - `round_results` — server → all: `{ rankings: [{ playerId, mixRGB, distance, rank }] }`
- Latency needs: mix preview is local; submit latency < 500 ms acceptable

## TV Requirement

- `requiresTV`: true
- The TV shows the shared secret target color that all players must match. Without it, players would have to share the target on their own phones, removing the shared reference point that makes the game fair and social.

## Round Configuration

- `defaultRoundCount`: 5
- `minRounds`: 1
- `maxRounds`: 10
- `supportsBracket`: true

## Instructions Phase

- `hasInstructionsPhase`: true
- `instructionsDelivery`: `broadcast`
- Instructions tell all players that the target color is shown on the TV, explain the five paint buckets available, and describe how scoring works (closest mix wins).

## UI Flow

1. Lobby / Join
2. Game loading (no special sensor permissions required)
3. Instructions — TV and phones show instructions; players tap "Got it"
4. Countdown (3-2-1)
5. In-play UI — TV shows target color + timer; phone shows mixing canvas with five buckets and live preview
6. Round end recap — TV animates ranking reveal; phones show player's distance score and rank
7. Scoreboard / final results (bracket advancement if applicable)

## State Machine

- States: `idle`, `lobby`, `game_loading`, `instructions`, `countdown`, `in_round`, `round_end`, `scoreboard`, `game_over`
- Transitions:
  - `idle` → `lobby`: host creates room
  - `lobby` → `game_loading`: host starts game
  - `game_loading` → `instructions`: assets ready
  - `instructions` → `countdown`: all players confirmed "Got it"
  - `countdown` → `in_round`: countdown reaches 0
  - `in_round` → `round_end`: all players submitted OR timer expires
  - `round_end` → `countdown`: more rounds remain
  - `round_end` → `scoreboard`: final round complete
  - `scoreboard` → `game_over`: host dismisses or bracket advances

## Data Structures

- Player object: `{ id, name, deviceId, score, rank, currentMix: { red, yellow, blue, white, black }, submittedMix, colorDistance }`
- Round object: `{ id, targetRGB: [r,g,b], startTime, endTime, submissions: [{ playerId, mixRGB, distance, rank }] }`
- Game config: `{ roundCount, timeLimitSeconds, scoringMethod: "deltaE" | "euclideanRGB" }`

## Assets

- Five paint bucket illustrations (red, yellow, blue, white, black) with pour animation
- Mixing canvas / paint palette UI component
- Target color display panel (TV full-bleed background or large swatch)
- Splat/pour sound effects
- Rank reveal fanfare audio
- Round results overlay with color swatches and distance indicator

## Performance & Constraints

- Target 60 fps on phone mixing canvas
- `mix_update` messages throttled to ~10 Hz to avoid flooding server
- Color-distance computation is O(n) in number of players — negligible
- No camera or mic required; battery impact is low

## Failure Modes & Recovery

- **Player disconnects mid-round**: server uses last known mix at time of disconnect; player is ranked on that mix
- **No submission before timer**: server auto-submits whatever mix the player had at timer expiry
- **TV disconnects**: round continues; TV reconnects and re-fetches current state on join
- **Color generation collision** (two rounds with visually identical targets): server enforces minimum perceptual distance between consecutive targets

## AI Integration Guide

- Purpose: Generate target colors with tunable difficulty (easy = common recognizable colors; hard = subtle mid-tone variations), and generate hint copy for the instructions screen.
- Input to model:
```json
{
  "id": "registry-40-paint-match",
  "difficulty": "medium",
  "previousTargets": [[255, 87, 51], [34, 139, 34]],
  "players": 4
}
```
- Expected model output:
```json
{
  "targetRGB": [189, 113, 47],
  "hint": "A warm earthy tone — think terracotta.",
  "difficulty": "medium"
}
```

### Example prompt skeleton
```
Generate a target color for: {"id":"registry-40-paint-match","difficulty":"hard","players":6}
Return: {"targetRGB":[r,g,b],"hint":"...","difficulty":"..."}
```

## Test Cases / Acceptance Criteria

- Target color displayed on TV matches the server-generated `targetRGB` exactly
- Live color preview on phone updates within one frame of bucket slider change
- Submitting locks the mix; further slider changes have no effect on stored submission
- Round ends immediately when the last player submits (does not wait for timer)
- Round ends at timer expiry even if not all players have submitted
- Rankings are sorted correctly from smallest to largest color distance
- Bracket advancement triggers after final round scoreboard
- Player disconnect mid-round does not crash the round; the player receives a rank based on last known mix

## Implementation Tasks

1. Implement server-side random color generation with difficulty-based constraints
2. Build phone mixing canvas: five bucket sliders, additive blend preview, submit button
3. Implement `mix_update` throttling and `mix_submit` message handling on server
4. Implement perceptual color-distance scoring and ranking logic
5. Build TV target color display and round results reveal animation
6. Wire bracket advancement to final round scoreboard
7. Add assets: bucket illustrations, pour sounds, rank reveal fanfare
8. Write automated tests for scoring, timer expiry auto-submit, and disconnect recovery