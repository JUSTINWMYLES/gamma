## Title

Shave The Yak

## ID

registry-19-shave-the-yak

## One-line Summary

Time-limited swipe mini-game: shave as much of a cartoon yak as possible by swiping on-target while avoiding off-target swipes that move the yak.

## Long Description

A literal cartoonish animated yak is on the players screen, they need to swipe their finger across the screen to trigger an animation that the yak is being shaved. Players are given 20 seconds to shave as much as they can off the yak, swiping a finger on the yak shaves the yak, swiping a finger outside of the yak moves the yak around. 

Players are awarded rank based on what % of the yak is shaved

## Target Platforms

- Primary: mobile, web

## Core Mechanics

- Touch hit detection: swipes inside yak bounds increment shaved area
- Yak movement: off-target swipes push and rotate the yak, reducing effective shave window
- Time-limited round (default 20s) with combo and multiplier for continuous on-target swipes
- Percent-based scoring and rank assignment across players

## Player Interactions

- Controls: swipe gestures on the yak area to shave; tapping outside yaw toggles a subtle nudge (moves yak); `Ready` to begin
- Feedback: shaving particle effect, progress ring, combo counter, vibration on hit and miss

## Required Inputs / Sensors

- `touch` for swipe detection (primary)
- Optional `accelerometer` for optional shake-to-stabilize mechanic

Note: avoid camera usage by default to preserve privacy; if camera-based proof is added, it must be opt-in and local-only processing.

## Outputs / Network

- Round events: {playerId, roundId, shavedPercent, rawSwipes, hits, misses, score}
- Live leaderboard updates and final rankings: {rankList}

Network messages should be small and infrequent; send periodic summaries rather than per-swipe events to reduce bandwidth.

## UI Flow

1. Lobby: players join, choose avatar, and ready up
2. Pre-round: show yak preview, controls tutorial, and `Ready` countdown
3. In-round (20s): player swipes to shave; UI shows shaved percent, combo, and time left
4. End-round: compute shaved percent and score, display rank and replay of shaved area
5. Optional: next round or return to lobby

## State Machine

- `idle` -> `lobby` -> `countdown` -> `in_round` -> `round_end` -> `scoreboard` -> `idle`

Transitions: playerReady, startCountdown, roundTimerExpired, scoreComputed, nextRound

## Data Structures

- PlayerState: { id: string, name: string, avatar?: string, score: number }
- YakState: { seed: number, shapeMask: string, currentOffset: {x,y}, rotation: number }
- RoundResult: { playerId: string, shavedPercent: number, hits: number, misses: number, comboMax: number, score: number }
- GameConfig: { roundTimeSecs: number, rounds: number, shavePerPixel: number }

## Assets

- SVG yak sprite with layered mask for shaved area
- Shave particle and foam sprites, progress ring, combo badges
- Simple UI kit for buttons, timer, and scoreboard

## Performance & Constraints

- Maintain 60 FPS on mid-range phones; throttle particle effects on low-end devices
- Batch server updates (send round summary at end of round) to conserve bandwidth

## Failure Modes & Recovery

- Input lag or missed swipe events: provide client-side smoothing and local prediction for instantaneous feedback
- App backgrounding mid-round: pause the round for that player and mark as inactive after short grace period
- Network disconnect during round: allow local scoring and reconcile with server when reconnected; if reconciliation impossible, discard remote score and log for audit

## Failure Modes & Recovery

- Proof fails validation -> allow retry or manual review

## AI Integration Guide

- Purpose: tune yak behavior (movement sensitivity), generate difficulty curves, and synthesize varied yak shapes from a seed
- Example model inputs: {"difficulty":"easy","seed":1234}
- Example model outputs: {"shapeMask":"...base64...","movementProfile":"gentle"}

## Test Cases / Acceptance Criteria

- Swipe detection: on-target swipes increase shaved area; off-target swipes move yak
- Scoring: shaved percent calculation matches pixel-mask simulation within 1%
- Round timing: rounds last configured seconds and stop accepting input after timer expires
- Leaderboard: final ranks correctly order players by score

## Implementation Tasks

1. Implement `ShaveYakGame` server plugin handling round timers, seeded yak masks, and score aggregation
2. Client: build `YakCanvas` component that renders SVG mask and handles swipe gestures with hit-testing
3. Create particle/shave FX and optimize for low-end devices
4. Add client-side smoothing and combo logic
5. Add unit tests for shaved-percent math and server scoring
6. Add E2E test that runs a full round with simulated swipe inputs and asserts final rankings
7. Documentation: write a short dev guide explaining mask format, how to tune `shavePerPixel`, and how to add new yak skins


## Test Cases / Acceptance Criteria

- Rewards and progress persist across sessions

## Implementation Tasks

1. Implement task queue and validation pipeline
