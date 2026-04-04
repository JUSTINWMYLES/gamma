# S-Tier Ranking

---

## Title

S-Tier Ranking

## ID

`registry-11-tier-ranking`

## One-line Summary

One player picks a category, everyone submits an entry, then all players tier-rank every entry — points go to whoever predicted the group's consensus.

## Long Description

At the start of each round, one random player is selected as the Category Chooser. They are presented with a list of suggested categories but may also type in their own. All other players wait while the chooser decides. If the chooser does not submit a category within 30 seconds, the server automatically selects one of the suggestions at random.

Once a category is announced, every player — including the chooser — has 30 seconds to submit one unique entry that fits the category. The server rejects duplicate entries and prompts the submitting player to try again. If a player does not submit in time, they are skipped for that round.

After all entries have been collected, the full list is revealed to every player. Each player then has 90 seconds to place every entry into one of five tiers: S, A, B, C, or D. Players may submit their rankings at any time before the timer expires; once everyone has submitted, the ranking phase ends early.

When the ranking phase ends, the server tallies the votes for each entry. For each entry, the tier that received the most votes becomes its consensus tier (ties broken in favour of the higher tier). The results are revealed on the main display, showing each entry's final tier placement and the vote distribution. Players who predicted an entry's consensus tier earn points — the higher the consensus tier, the more points are awarded (S = 5 pts, A = 4 pts, B = 3 pts, C = 2 pts, D = 1 pt).

**Example — category: Best Cereal**

- Each player submits one cereal brand; duplicates are blocked.
- All submitted cereals are shown and each player tier-ranks every one.
- If 5 of 6 players place Frosted Flakes in B tier, its consensus is B tier.
- If votes are split (e.g., 2 B, 2 A, 1 S, 1 C), B tier still wins because it has the most votes.
- Players who voted B for Frosted Flakes earn 3 points; players who voted differently earn 0 for that entry.

## Target Platforms

- Primary: mobile (iOS / Android)
- Secondary: web

## Core Mechanics

- Random category chooser selection per round
- Player-driven category selection with curated suggestions and free-text input
- Unique entry submission with duplicate detection
- Per-player tier assignment for all entries (S / A / B / C / D) within a 90-second window
- Majority-vote consensus aggregation per entry
- Tier-weighted scoring (higher consensus tier = more points for correct voters)

## Player Interactions

- Controls: touch only — tap/select a category, type an entry, tap tier buttons to place each entry
- Feedback: entry accepted / duplicate rejected notification, live submission count during entry phase, early-end indicator when all players have ranked, animated tier reveal on TV

## Required Inputs / Sensors

- `touch`

## Outputs / Network

- Local display: category prompt, entry submission field, tier-assignment grid, per-entry results
- Network messages:
  - `tr_category_phase` — server notifies all players that category selection has begun: `{chooserId, chooserName, suggestions, durationMs}`
  - `tr_category_chosen` — server broadcasts the chosen category: `{category}`
  - `tr_entry_phase` — server opens entry submission: `{category, durationMs}`
  - `tr_entry_ack` — server acknowledges a submitted entry: `{accepted, reason?, currentEntryCount}`
  - `tr_ranking_phase` — server distributes the full item list for ranking: `{items, category, durationMs}`
  - `tr_rankings_ack` — server acknowledges submitted rankings: `{}`
  - `tr_round_result` — server broadcasts consensus tiers and scores: `{finalTiers: [{item, tier, voteCounts}], scores: {playerId: points}, category}`
  - `round_skipped` — round skipped due to insufficient players: `{reason}`

## TV Requirement

- `requiresTV`: false
- A TV/secondary display is optional. When connected, the TV shows the category prompt, a live entry count during submission, the tier-ranking countdown, and the animated results reveal. The game is fully playable on phones alone.

## Round Configuration

- `defaultRoundCount`: 3
- `minRounds`: 1
- `maxRounds`: 10
- `supportsBracket`: false

## Instructions Phase

- `hasInstructionsPhase`: true
- `instructionsDelivery`: `broadcast`
- Instructions explain that one player picks a category, everyone submits one entry, then all players tier-rank every entry, and points go to players whose tier prediction matches the group consensus.

## UI Flow

1. **Lobby / Join** — Players join; host starts the game.
2. **Instructions** — Broadcast rules to all players; each taps "Got it".
3. **Countdown (3-2-1)** — Phones show the countdown simultaneously.
4. **Category Pick** — One randomly chosen player sees a category selector (suggestions + free text). Others see a waiting screen naming the chooser. Auto-picks after 30 seconds.
5. **Entry Submission** — All players see the chosen category and submit one entry (30 seconds). Duplicate entries are rejected in real time.
6. **Tier Ranking** — All collected entries are shown. Each player assigns every entry to a tier (S / A / B / C / D) within 90 seconds. Players can submit early; round ends when all have submitted.
7. **Results Reveal** — TV and phones display each entry's consensus tier and vote breakdown. Players see their personal score for the round.
8. **Round End / Scoreboard** — Cumulative scores are displayed before the next round begins.

## State Machine

- **States:** `idle`, `lobby`, `instructions`, `countdown`, `in_round` (sub-phases: `category_pick` → `entry_submit` → `tier_rank` → `results`), `round_end`, `scoreboard`, `game_over`
- **Transitions:**
  - `idle` → `lobby` — host creates game
  - `lobby` → `instructions` — host starts game (≥ 2 players)
  - `instructions` → `countdown` — all players tap "Got it"
  - `countdown` → `in_round` — countdown reaches 0
  - `in_round/category_pick` → `in_round/entry_submit` — chooser submits category or 30 s timeout
  - `in_round/entry_submit` → `in_round/tier_rank` — all players submit entries or 30 s timeout
  - `in_round/tier_rank` → `in_round/results` — all players submit rankings or 90 s timeout
  - `in_round/results` → `round_end` — results displayed for 10 s
  - `round_end` → `countdown` — next round begins
  - `round_end` → `scoreboard` — final round complete
  - `scoreboard` → `game_over` — scoreboard displayed for 6 s

## Data Structures

```json
{
  "Player": { "id": "string", "name": "string", "deviceId": "string", "score": "number", "state": "string" },
  "Round": {
    "id": "number",
    "category": "string",
    "chooserId": "string",
    "entries": ["string"],
    "playerVotes": { "playerId": { "item": "tier" } },
    "finalTiers": { "item": "tier" },
    "scores": { "playerId": "number" }
  },
  "TierVote": { "playerId": "string", "item": "string", "tier": "S|A|B|C|D" }
}
```

## Assets

- Tier panel labels (S / A / B / C / D) with distinct colour coding
- Entry submission text field
- Category suggestion list UI
- Vote-count bar chart for results reveal
- Animated entry placement on the tier list
- Round score summary card

## Performance & Constraints

- Entry list should render without performance degradation for up to 16 entries (one per player)
- Tier assignment UI must be usable on small phone screens with tap targets ≥ 44 px
- Network latency for ranking submissions should be < 500 ms to ensure fair timing
- Category suggestion list is pre-loaded on the server
- Target 60 fps for results reveal animation

## Failure Modes & Recovery

- **Category chooser disconnects** — server auto-selects a random suggestion and advances to entry submission
- **Player disconnects during entry phase** — they are skipped; their slot is left empty
- **Player disconnects during ranking phase** — their partial or absent rankings are excluded from the vote tally; the phase ends early if all remaining players have submitted
- **All players submit duplicate entries** — server accepts the first submission per unique value and rejects subsequent identical entries; if fewer than 2 unique entries are collected, the round is skipped
- **No votes cast for an item** — consensus defaults to C tier

## AI Integration Guide

- **Purpose:** Generate contextually appropriate category suggestions; optionally generate seed entries for demonstration or single-player mode.
- **Input to model:**
```json
{
  "id": "registry-11-tier-ranking",
  "playerCount": 6,
  "difficulty": "easy",
  "previousCategories": ["Best Cereal", "Superhero Movies"]
}
```
- **Expected model output:**
```json
{
  "suggestions": [
    "90s Cartoons",
    "Pizza Toppings",
    "Fast Food Chains",
    "Board Games",
    "Ice Cream Flavors"
  ]
}
```

### Example prompt skeleton
```
Generate category suggestions for S-Tier Ranking: {"playerCount":6,"difficulty":"easy","previousCategories":["Best Cereal"]}
Return: {"suggestions":["...","...","...","...","..."]}
```

## Test Cases / Acceptance Criteria

- Exactly one player per round is selected as the category chooser.
- Chooser can submit a free-text category or select from suggestions within 30 seconds.
- If the chooser does not submit in time, the server auto-selects a suggestion.
- Duplicate entry submissions are rejected; player is prompted to resubmit.
- Ranking phase distributes the full and deduplicated entry list to all players.
- Ranking phase ends immediately if all players submit before the 90-second timer expires.
- For each entry, the consensus tier is the tier with the most votes; ties favour the higher tier (S > A > B > C > D).
- Players earn `TIER_POINTS[consensusTier]` points for each entry they placed in the consensus tier.
- Players earn 0 points for entries they placed in a non-consensus tier.
- Score totals are correct for a known set of votes.
- Round is skipped with a message if fewer than 2 players are connected.

## Implementation Tasks

1. Build category chooser selection and suggestion list logic
2. Implement entry submission with duplicate detection and timeout fallback
3. Implement tier assignment UI (S / A / B / C / D buttons per entry)
4. Implement majority-vote aggregation with tie-breaking
5. Implement tier-weighted scoring
6. Build animated results reveal on TV and phone
7. Add network sync for all `tr_*` message types
8. Add tests for aggregation, scoring, duplicate detection, and auto-fallback logic
