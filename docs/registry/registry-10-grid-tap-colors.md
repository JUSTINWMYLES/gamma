## Title

Grid Tap Colors

## ID

registry-10-grid-tap-colors

## One-line Summary

Phones laid on the ground form a grid; players race to tap phones that light up with colors.

## Long Description

Arrange phones face-up in a grid formation. The TV shows the required layout pattern.
In Speed Tap mode, one phone at a time lights up with a full-screen color — race to
tap it! Each player gets announced by name with 10 seconds to get in position before
their turn. Rounds are capped at 20 seconds. With fewer than 8 players, one player
goes at a time. With 8–15, two compete head-to-head. With 16+, four at once.

In Color Sequence mode, watch the TV display a color order, memorize it, then tap the
correct phones in sequence.

## Target Platforms

- Primary: mobile, local network discovery

## Core Mechanics

- Grid phone layout with server-computed optimal patterns for 2–32 players
- Speed Tap: phone lights up → tap → next phone → repeat (20s cap per player)
- Color Sequence: watch sequence → memorize → replicate by tapping phones
- Player announcement with 10-second get-in-position countdown
- Host confirms grid placement before game starts

## Player Interactions

- Controls: tap phone when lit (Speed Tap) or in sequence order (Color Sequence)
- Host: confirms phones are placed via "Phones Are Ready" button
- Feedback: full-screen color flash, tap confirmation, progress bar

## Required Inputs / Sensors

- `touch`, `network` for coordination

## Outputs / Network

- Messages: grid_setup, grid_phone_assignment, grid_round_start, grid_player_announce,
  grid_group_start, grid_phone_light, grid_tap_confirmed, grid_player_complete,
  grid_group_results, grid_round_scores, grid_waiting_for_admin

## UI Flow

1. Instructions (5 slides explaining the game)
2. Grid setup → TV shows layout, phones show numbers
3. Host confirms phones placed → game_input: admin_grid_ready
4. Round start → all phones go white
5. Player announced (10s countdown) → group starts
6. Speed Tap: phones light up one at a time, 20s cap
7. Results shown → next player → round scores

## State Machine

- `game_loading` → `instructions` → `countdown` → `in_round` → `round_end` → `scoreboard`
- Sub-phases: setup → waiting_admin → white_ready → player_announce → countdown → speed_tap/color_input → group_results → round_scores

## Data Structures

- PhoneAssignment: { phoneId, displayNumber, color, groupIndex }
- GridLayout: { cols, rows }
- SpeedTapPlayerResult: { playerId, completionTimeMs, tapTimesMs[], completed }

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
- Speed tap scoring awards completion bonuses correctly
- Color sequence errors counted accurately
- Instruction slides are defined (5 slides)
- Admin grid ready message proceeds past setup phase

## Implementation Tasks

1. ✅ Server game logic with grid layout computation
2. ✅ Player component with setup, admin ready, tap phases
3. ✅ TV component with grid visualization and player announcements
4. ✅ Instruction slides (5 themed slides)
5. ✅ Unit tests for grid layout and scoring
