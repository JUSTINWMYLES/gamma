# Word Build

---

## Title

Word Build

## ID

`registry-27-word-build`

## One-line Summary

Teams race to physically arrange their phones — each showing letter fragments — into the correct order to spell a hidden word.

## Long Description

Word Build is a same-room team game for 6 or more players split into 2 teams. At the start of each round the system selects a target word (5–10 letters) and divides its consecutive letters across each team's phones so that every device displays 1 or 2 letter fragments. When the countdown begins, players must physically move and arrange their phones in the correct order to reconstruct the word. Each player may only move their own device.

One randomly chosen phone per team is given a "Done" button. When that player presses it, the team's completion time is locked in and the opposing team receives the remaining time to finish. Once both teams have submitted (or time expires), the correct word is revealed along with any other valid words that could be formed from the same letter fragments (up to 3 possible arrangements). The player whose phone had the "Done" button then confirms whether their team's arrangement matches one of the valid words. The team that finishes first with a correct arrangement wins the round.

## Target Platforms

- Primary: mobile (iOS / Android)
- Secondary: web

## Core Mechanics

- Word selection from a curated dictionary (5–10 letters, at most 3 valid anagram arrangements)
- Letter-fragment distribution across team devices (1 or 2 consecutive letters per phone, adjusted for team size)
- Physical phone arrangement in the real world
- Timed competition between two teams (60-second rounds)
- "Done" button on one randomly selected phone per team to lock in completion time
- Post-round word reveal and self-reported correctness

## Player Interactions

- Controls: touch only (tap "Done" button, tap correct/incorrect confirmation)
- Physical: players physically reposition their own phones to form the word
- Feedback: visual countdown timer, visual letter display, haptic buzz on "Done" press, victory/defeat animation

## Required Inputs / Sensors

- `touch`

## Outputs / Network

- Local display: letter fragments, countdown timer, "Done" button, result confirmation
- Network messages:
  - `word_assigned` — server distributes letter fragments to each device: `{teamId, deviceId, fragment, fragmentIndex}`
  - `round_start` — broadcast countdown start: `{roundId, startTime, durationSec}`
  - `team_done` — device reports team completion: `{teamId, deviceId, timestamp}`
  - `round_result` — server broadcasts correct word and valid arrangements: `{correctWord, validWords[], teamResults[]}`

## TV Requirement

- `requiresTV`: false
- A TV/secondary display is optional. When connected, the TV can show the countdown timer during play and the word reveal and valid arrangements after the round ends. The game is fully playable on phones alone.

## Round Configuration

- `defaultRoundCount`: 3
- `minRounds`: 1
- `maxRounds`: 10
- `supportsBracket`: false

## Instructions Phase

- `hasInstructionsPhase`: true
- `instructionsDelivery`: `broadcast`
- Instructions explain that each phone will show part of a word, players must arrange phones in order, only touch your own phone, and one phone per team will have the "Done" button.

## UI Flow

1. **Lobby / Join** — Players join and are assigned to one of 2 teams (minimum 6 players total).
2. **Instructions** — Broadcast rules to all players; each taps "Got it".
3. **Countdown (3-2-1)** — Phones display the countdown simultaneously.
4. **In-play** — Each phone shows its letter fragment(s). Players physically arrange phones. The designated "Done" phone shows a prominent button.
5. **Team lock-in** — "Done" is pressed; completion time recorded. Opposing team keeps playing until they also press "Done" or time expires.
6. **Word reveal** — All phones (and TV if connected) display the correct word and any alternative valid arrangements.
7. **Self-report** — The "Done" phone on each team shows "Correct" / "Incorrect" buttons; the player confirms their team's result.
8. **Scoreboard** — Round winner announced; cumulative scores displayed.

## State Machine

- **States:** `idle`, `lobby`, `instructions`, `countdown`, `in_round`, `team_locked`, `round_end`, `scoreboard`, `game_over`
- **Transitions:**
  - `idle` → `lobby` — host creates game
  - `lobby` → `instructions` — host starts game (≥ 6 players, 2 teams formed)
  - `instructions` → `countdown` — all players tap "Got it"
  - `countdown` → `in_round` — countdown reaches 0
  - `in_round` → `team_locked` — one team presses "Done"
  - `team_locked` → `round_end` — second team presses "Done" or timer expires
  - `round_end` → `scoreboard` — self-report submitted by both teams
  - `scoreboard` → `countdown` — next round begins
  - `scoreboard` → `game_over` — final round complete

## Data Structures

```json
{
  "Player": { "id": "string", "name": "string", "deviceId": "string", "teamId": "string", "fragment": "string", "fragmentIndex": "number", "hasDoneButton": "boolean" },
  "Team": { "id": "string", "playerIds": ["string"], "completionTime": "number | null", "selfReportCorrect": "boolean | null" },
  "Round": { "id": "string", "targetWord": "string", "validWords": ["string"], "durationSec": 60, "startTime": "number", "teams": ["Team"] },
  "WordEntry": { "word": "string", "length": "number", "validArrangements": ["string"], "maxArrangements": 3 }
}
```

## Assets

- Large, high-contrast letter fragment display (readable when phones are placed side by side)
- Countdown timer graphic
- "Done" button UI element (prominent, team-colored)
- Correct/Incorrect confirmation buttons
- Word reveal animation
- Victory and defeat animations and sound effects
- Placeholder team-color backgrounds

## Performance & Constraints

- Letter fragments must render at a large font size so they are legible when phones are placed on a table
- Network latency for "Done" events should be < 500 ms to ensure fair timing
- Word dictionary should be pre-loaded on the server; word selection must complete in < 100 ms
- Battery impact is minimal (static display with infrequent network messages)
- Target 60 fps for countdown and reveal animations

## Failure Modes & Recovery

- **Player disconnect during round** — redistribute that player's letter fragment across remaining teammates' phones; notify team
- **"Done" button holder disconnects** — reassign "Done" button to another random device on the same team
- **Network lag on "Done" press** — use client-side timestamp; server reconciles using round start time
- **No valid word found for team size** — server retries word selection up to 3 times, then falls back to a guaranteed word from a safe list
- **Both teams fail to complete** — round is a draw; no points awarded

## AI Integration Guide

- **Purpose:** Generate or curate word lists filtered by letter count and maximum anagram count; dynamically adjust difficulty across rounds.
- **Input to model:**
```json
{
  "id": "registry-27-word-build",
  "teamSize": 4,
  "difficulty": "medium",
  "letterRange": [5, 10],
  "maxArrangements": 3
}
```
- **Expected model output:**
```json
{
  "word": "CHANGE",
  "length": 6,
  "fragments": ["CH", "AN", "GE"],
  "validArrangements": ["CHANGE"],
  "difficulty": "medium"
}
```

### Example prompt skeleton
```
Generate a word for Word Build: {"teamSize":4,"difficulty":"medium","letterRange":[5,10],"maxArrangements":3}
Return: {"word":"...","fragments":[...],"validArrangements":[...]}
```

## Test Cases / Acceptance Criteria

- Word selected has between 5 and 10 letters inclusive.
- Letter fragments distributed across devices are consecutive and reconstruct the full word when placed in order.
- Fragment count equals the number of players on a team; each fragment is 1 or 2 letters.
- At most 3 valid word arrangements exist for the chosen fragments.
- "Done" button appears on exactly one device per team and is randomly assigned each round.
- Pressing "Done" locks the team's completion time and cannot be undone.
- Opposing team continues playing after the first team locks in.
- Round ends when both teams lock in or the 60-second timer expires.
- Correct word and all valid arrangements are displayed at round end.
- A player may only interact with their own phone (enforced by game rules, not code).
- If both teams arrange the word correctly, the faster team wins the round.

## Implementation Tasks

1. Build curated word dictionary (5–10 letters, ≤ 3 anagram arrangements per entry)
2. Implement word selection and fragment distribution logic (adjust fragment size for team size)
3. Create letter-fragment display UI (large, high-contrast, team-colored)
4. Implement "Done" button assignment and lock-in flow
5. Add countdown timer with sync across devices
6. Build word reveal and valid-arrangement display screen
7. Implement self-report (correct/incorrect) flow and scoring
8. Add network sync for `word_assigned`, `round_start`, `team_done`, `round_result` messages
9. Optional: TV display integration for countdown and word reveal
10. Add tests for word selection constraints, fragment distribution, and timing logic