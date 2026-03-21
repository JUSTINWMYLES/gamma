# Game Design Template (Registry Standard)

Use this template for every registry entry. Keep fields concise and complete — AI models will consume these sections to generate code, assets, and tests.

---

## Title

Short human-readable title.

## ID

Canonical ID: `registry-XX-short-slug` (use zero-padded index)

## One-line Summary

Single sentence describing core mechanic and goal.

## Long Description

Detailed description of the game, player goals, and context.

## Target Platforms

- Primary: (e.g., mobile iOS/Android)
- Secondary: (e.g., web)

## Core Mechanics

- List the minimal set of mechanics required to play.

## Player Interactions

- Controls: (touch, tilt, mic, camera, etc.)
- Feedback: (haptics, audio, visual)

## Required Inputs / Sensors

- e.g., `accelerometer`, `gyroscope`, `camera`, `microphone`, `touch`, `proximity`.

## Outputs / Network

- Local display, sound, and optionally: peer-to-peer networking (describe required message types and latency needs).

## TV Requirement

- `requiresTV`: (true/false) — set to true if the game cannot run without a TV display connected
- If true, describe what the TV provides that phones cannot (shared hidden state, central visual, etc.)

## Round Configuration

- `defaultRoundCount`: (number) — default rounds when host does not override
- `minRounds`: (number)
- `maxRounds`: (number)
- `supportsBracket`: (true/false) — set to true if the game supports 1v1 bracket matchmaking

## Instructions Phase

- `hasInstructionsPhase`: (true/false) — set to true if the game requires an instructions screen before play
- `instructionsDelivery`: `broadcast` | `staggered` | `private`
  - `broadcast` — all players and TV receive instructions simultaneously
  - `staggered` — instructions are sent to players one by one with random delays
  - `private` — each player receives a different instruction via private message

## UI Flow

1. Lobby / Join
2. Game loading (sensor permission prompts, if any)
3. Instructions — TV + phone show instruction content; player taps "Got it" (if `hasInstructionsPhase: true`)
4. Countdown (3-2-1)
5. In-play UI
6. Round end recap
7. Scoreboard / final results

## State Machine

- States: `idle`, `lobby`, `game_loading`, `instructions`, `countdown`, `in_round`, `round_end`, `scoreboard`, `game_over`.
- Transitions: list triggers between states.

## Data Structures

- Player object: {id, name, deviceId, score, state}
- Round object: {id, seed, startTime, endTime, metadata}

## Assets

- Placeholder art, sound, and UI element list.

## Performance & Constraints

- Target frame-rate, memory limits, network bandwidth constraints, battery considerations.

## Failure Modes & Recovery

- Describe common failures (disconnects, sensor failure) and recovery strategies.

## AI Integration Guide

- Purpose: How AI will be used (generate levels, tune difficulty, create prompts, synthesize audio, etc.)
- Input to model: structured JSON sample the model should receive.
- Expected model output: structured JSON example.

### Example prompt skeleton
```
Generate game code for: {"id":"registry-01-photo-shape","difficulty":"easy","players":4}
Return: {"name":"...","ui":...,"logic":...}
```

## Test Cases / Acceptance Criteria

- List of automated/manual tests that prove the feature works.

## Implementation Tasks

1. Prototype core mechanic (single-device)
2. Add UI scaffolding and assets
3. Add network sync (if required)
4. Add tests

---

Fill each field in derived files. Where appropriate, include example JSON payloads for AI consumption.
