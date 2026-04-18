# Wanted Ad

---

## Title

Wanted Ad

## ID

`registry-28-wanted-ad`

## One-line Summary

Players fill in a western-style wanted poster for another player's icon, then everyone votes for the poster they liked most.

## Long Description

At the start of each round, the lobby is shuffled and each active player is secretly assigned another player as their outlaw target. Every phone receives an old-west wanted poster template with the target player's icon already placed where the portrait goes. The poster intentionally has missing fields so the author can decide how to complete it.

Players may fill in three optional sections: the wanted condition, the bounty price, and the reason the outlaw is wanted. They can complete all three, leave some blank, or use funny custom wording for the condition line. Once the timer expires, the completed posters are pinned to a shared wanted wall and revealed one at a time for 10 seconds each.

After the reveal, all players vote for the poster they liked most. Authors cannot vote for their own poster. Posters earn participation points, extra points per vote received, and a winner bonus for the top-voted poster. The result screen shows the final wanted wall, vote totals, and updated scores.

## Target Platforms

- Primary: mobile (iOS / Android)
- Secondary: web

## Core Mechanics

- Secret round assignment from each player to another player in the lobby
- Poster authoring with optional condition, bounty, and reason fields
- Automatic use of the assigned target player's icon as the poster portrait
- Sequential poster reveal with a fixed 10-second display per poster
- Group vote for favourite poster with self-voting disabled
- Vote-based scoring plus winner bonus

## Player Interactions

- Controls: touch only — type text, tap suggestion chips, submit poster, tap a poster to vote
- Feedback: live poster preview, submission progress count, reveal countdown, voting progress, winner/result highlights

## Required Inputs / Sensors

- `touch`

## Outputs / Network

- Local display: private poster editor, live wanted poster preview, reveal view, voting grid, round results
- Shared display: western wanted wall, submission progress, sequential poster showcase, voting gallery, scoreboard
- Network messages:
  - `wa_submission_start` — opens the authoring phase for all clients: `{totalPlayers, durationMs, serverTimestamp, conditionSuggestions}`
  - `wa_assignment` — privately assigns a target player: `{targetPlayerId, targetPlayerName, durationMs, serverTimestamp, conditionSuggestions}`
  - `wa_submit_ack` — acknowledges a poster submission: `{accepted, poster?, reason?}`
  - `wa_submission_progress` — updates the submission count: `{submittedCount, totalPlayers}`
  - `wa_reveal_start` — announces the reveal sequence: `{totalPosters, displayMs}`
  - `wa_reveal_poster` — shows one poster for the current 10-second reveal window: `{poster, index, totalPosters, displayMs, serverTimestamp}`
  - `wa_voting_start` — opens the voting phase: `{posters, durationMs, serverTimestamp, totalVoters}`
  - `wa_vote_ack` — acknowledges a vote: `{accepted, targetAuthorId?, reason?}`
  - `wa_vote_update` — updates the vote count: `{votesIn, totalVoters}`
  - `wa_round_result` — broadcasts vote totals and round scores: `{posters, winnerAuthorIds, scores, totalVotes}`
  - `round_skipped` — round skipped due to low participation or no posters: `{reason}`

## TV Requirement

- `requiresTV`: false
- A TV or shared display is optional but highly recommended because it turns the reveal sequence into a communal show-and-vote moment. The game remains playable on phones if no display is connected.

## Round Configuration

- `defaultRoundCount`: 3
- `minRounds`: 1
- `maxRounds`: 6
- `supportsBracket`: false

## Instructions Phase

- `hasInstructionsPhase`: true
- `instructionsDelivery`: `broadcast`
- Instructions explain that each player gets another player as their target, fills in the poster however they like, watches the finished posters reveal, and votes for their favourite.

## UI Flow

1. **Lobby / Join** — Players join and customize their icons.
2. **Instructions** — Everyone learns how wanted poster authoring and voting works.
3. **Countdown (3-2-1)** — Round begins.
4. **Assignment / Poster Authoring** — Each player privately receives another player's icon/name and fills in the optional poster fields.
5. **Reveal Wall** — Completed posters are shown one by one for 10 seconds each.
6. **Voting** — Players vote for the poster they liked most.
7. **Round Results** — Vote totals, winning poster, and score gains are displayed.
8. **Scoreboard / Final Results** — Cumulative scores appear between rounds and at game end.

## State Machine

- **States:** `idle`, `lobby`, `instructions`, `countdown`, `in_round` (sub-phases: `authoring` → `reveal` → `voting` → `results`), `round_end`, `scoreboard`, `game_over`
- **Transitions:**
  - `idle` → `lobby` — room created
  - `lobby` → `instructions` — host starts the game
  - `instructions` → `countdown` — all players ready
  - `countdown` → `in_round/authoring` — countdown finishes
  - `in_round/authoring` → `in_round/reveal` — all players submit or authoring timer expires
  - `in_round/reveal` → `in_round/voting` — every poster has completed its 10-second reveal
  - `in_round/voting` → `in_round/results` — all eligible voters vote or timer expires
  - `in_round/results` → `round_end` — results display completes
  - `round_end` → `countdown` — next round begins
  - `round_end` → `scoreboard` — final round complete
  - `scoreboard` → `game_over` — scoreboard timer finishes

## Data Structures

```json
{
  "Player": { "id": "string", "name": "string", "deviceId": "string", "score": "number", "state": "string" },
  "RoundAssignment": { "authorId": "string", "targetPlayerId": "string" },
  "Poster": {
    "authorId": "string",
    "targetPlayerId": "string",
    "condition": "string",
    "bounty": "number|null",
    "reason": "string",
    "submittedAt": "number"
  },
  "PosterResult": {
    "authorId": "string",
    "targetPlayerId": "string",
    "condition": "string",
    "bounty": "number|null",
    "reason": "string",
    "voteCount": "number",
    "isWinner": "boolean"
  }
}
```

## Assets

- Old western paper poster frame and typography treatment
- Dynamic HTML wanted poster card component
- Player icon portrait slot embedded in the poster
- Wanted wall / sheriff office background for the shared display
- Audio placeholder badge/slot reserved on the card for future game sound cues

## Performance & Constraints

- Poster card must stay legible on small phones and large TVs
- Shared display should smoothly cycle each poster on a fixed 10-second timer
- Voting view should comfortably handle up to 12 posters without layout breakage
- Message payloads remain small because poster data is lightweight text plus existing player icon state

## Failure Modes & Recovery

- **Not enough active players** — round is skipped with a clear reason
- **No posters submitted** — round is skipped instead of entering reveal/vote phases
- **Only one poster submitted** — reveal still happens and the sole author is treated as the automatic winner
- **Player disconnect during authoring** — their poster is simply absent if not submitted in time
- **Player disconnect during voting** — voting can still finish when the timer expires; existing votes remain valid
- **Reconnect during the round** — assignment, poster ownership, and any stored votes move to the reconnecting player's new session ID

## AI Integration Guide

- **Purpose:** Generate themed condition suggestions, backup outlaw reasons, or future flavour text packs for different western moods.
- **Input to model:**
```json
{
  "id": "registry-28-wanted-ad",
  "tone": "goofy western",
  "playerCount": 6,
  "targetName": "Dusty Sam",
  "existingReasons": ["stole every pie in town"]
}
```
- **Expected model output:**
```json
{
  "conditionSuggestions": [
    "Dead or Alive",
    "Bring In Gently",
    "Horse Optional"
  ],
  "reasonSuggestions": [
    "Keeps teaching the coyotes card tricks",
    "Held up the saloon with a rubber chicken"
  ]
}
```

### Example prompt skeleton
```
Generate fun western wanted-poster writing prompts: {"id":"registry-28-wanted-ad","tone":"goofy western","playerCount":6}
Return: {"conditionSuggestions":["..."],"reasonSuggestions":["...","..."]}
```

## Test Cases / Acceptance Criteria

- Every active player is assigned exactly one different target player each round.
- Poster submissions normalize condition, bounty, and reason input safely.
- Reveal phase shows each submitted poster for exactly 10 seconds.
- Target player's icon is used as the portrait in both player and shared-display poster views.
- Players cannot vote for their own poster.
- Vote tally handles ties and awards winner bonuses correctly.
- Round skips cleanly if fewer than 2 players are active.
- Round skips cleanly if no posters are submitted.
- Results screen shows vote counts and score gains for the round.

## Implementation Tasks

1. Build assignment logic that produces a no-self target for every active player.
2. Create the dynamic HTML wanted poster card used on phone and TV screens.
3. Implement authoring, reveal, voting, and results message flow on the server.
4. Build player and viewer screens for poster authoring, showcase, and voting.
5. Add scoreboard scoring based on participation, votes received, and winner bonus.
6. Add tests for assignment, normalization, vote tallying, and scoring.
