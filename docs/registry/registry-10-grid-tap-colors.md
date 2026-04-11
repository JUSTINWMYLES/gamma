## Title

Grid Tap Colors

## ID

registry-10-grid-tap-colors

## One-line Summary

Phones laid on the ground form a grid; players take turns racing through a full lit-phone sequence.

## Long Description

Arrange phones face-up in a grid formation. The TV shows the required layout pattern.
Each player is announced by name, gets 10 seconds to get in position, then one phone at a time
lights up with a full-screen color. Tap that phone and the next phone lights up immediately.
Every player completes the full random sequence across the entire grid. Rounds are capped at 20 seconds.

## Target Platforms

- Primary: mobile, local network discovery

## Core Mechanics

- Grid phone layout with server-computed optimal patterns for 2–32 players
- Sequential speed taps: phone lights up → tap → next phone → repeat (20s cap per player)
- Player announcement with 10-second get-in-position countdown before each turn
- Round metrics: overall completion time, average press time, fastest press time
- Host confirms grid placement before game starts

## Player Interactions

- Controls: tap the currently lit phone as fast as possible
- Host: confirms phones are placed via "Phones Are Ready" button
- Feedback: full-screen color flash, tap confirmation, progress bar

## Required Inputs / Sensors

- `touch`, `network` for coordination

## Outputs / Network

- Messages: grid_setup, grid_phone_assignment, grid_round_start, grid_player_announce,
  grid_group_start, grid_phone_light, grid_tap_confirmed, grid_tap_progress,
  grid_player_complete, grid_group_results, grid_round_scores, grid_waiting_for_admin

## UI Flow

1. Instructions (5 slides explaining the game)
2. Grid setup → TV shows layout, phones show numbers
3. Host confirms phones placed → game_input: admin_grid_ready
4. Round start → all phones go white
5. Player announced (10s countdown) → turn starts
6. One phone lights at a time until the full sequence is completed or time expires
7. Turn results shown → next player → round scores

## State Machine

- `game_loading` → `instructions` → `countdown` → `in_round` → `round_end` → `scoreboard`
- Sub-phases: setup → waiting_admin → white_ready → player_announce → countdown → speed_tap → group_results → round_scores

## Data Structures

- PhoneAssignment: { phoneId, displayNumber, color, groupIndex }
- GridLayout: { cols, rows }
- SpeedTapPlayerResult: { playerId, completionTimeMs, tapTimesMs[], completed }
- Display metrics: overall completion, average press time, fastest press time

## Grid Layout Patterns

| Players | Grid | Layout |
|---------|------|--------|
| 2 | 2×1 | ▪▪ |
| 3 | 3×1 | ▪▪▪ |
| 4 | 2×2 | ▪▪ / ▪▪ |
| 5–6 | 3×2 | ▪▪▪ / ▪▪▪ |
| 7–8 | 4×2 | ▪▪▪▪ / ▪▪▪▪ |
| 9 | 3×3 | ▪▪▪ / ▪▪▪ / ▪▪▪ |
| 10–12 | 4×3 | ▪▪▪▪ / ▪▪▪▪ / ▪▪▪▪ |
| 13–16 | 4×4 | 4 rows of 4 |
| 17–20 | 5×4 | 4 rows of 5 |
| 21–25 | 5×5 | 5 rows of 5 |
| 26–30 | 6×5 | 5 rows of 6 |
| 31–32 | 8×4 | 4 rows of 8 |

## Assets

- Color palettes (8 colors), flash FX, countdown timer

## Performance & Constraints

- Low-latency sync to ensure phone lights align across devices
- 20-second cap per speed tap round prevents indefinite waiting
- 120-second timeout for grid setup confirmation

## Failure Modes & Recovery

- Admin doesn't confirm: 120s timeout auto-proceeds
- Player doesn't tap: 20s round cap resolves automatically
- Disconnected player: skipped in group rotation

## Test Cases / Acceptance Criteria

- Grid layout has enough cells for all player counts (2–32)
- Speed tap scoring awards the three timing categories correctly
- Instruction slides are defined (5 slides)
- Admin grid ready message proceeds past setup phase

## Implementation Tasks

1. ✅ Server game logic with grid layout computation
2. ✅ Player component with setup, admin ready, tap phases
3. ✅ TV component with grid visualization and player announcements
4. ✅ Instruction slides (5 themed slides)
5. ✅ Unit tests for grid layout and timing-category scoring
