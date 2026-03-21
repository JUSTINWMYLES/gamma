## Title

Balance Game (Tilt Person)

## ID

registry-02-balance-game

## One-line Summary

Players tilt their phones to keep an on-screen character balanced while random forces knock them off.

## Long Description

Each player sees a character that must remain upright. The phone's accelerometer/gyroscope maps device tilt to character balance. Randomized virtual objects apply impulses that require quick user corrections. Phone is placed on the player's lap.

## Target Platforms

- Primary: mobile (iOS/Android)

## Core Mechanics

- Tilt-to-balance mapping
- Random impulse generator
- Stamina/health meter that decreases when unbalanced

## Player Interactions

- Controls: physical tilt and repositioning; optional touch to brace
- Feedback: haptic rumble on impact, audio cues for incoming objects

## Required Inputs / Sensors

- `accelerometer`, `gyroscope`, `touch`

## Outputs / Network

- Local game state; optional sync for multiplayer competitions (message types: {playerId, tilt, health})

## UI Flow

1. Lobby -> instructions -> place phone on lap
2. Countdown -> in_round -> report -> scoreboard

## State Machine

- `lobby` -> `countdown` -> `in_round` -> `paused` -> `end_round`

## Data Structures

- Player: {id, tiltVector, health, score}
- Round: {seed, duration, impulseSchedule}

## Assets

- Character sprites, impact FX, background, meter UI

## Performance & Constraints

- Sample accelerometer at 60 Hz; ensure low-latency mapping for responsive control

## Failure Modes & Recovery

- Sensor drift: recalibrate by asking user to place phone flat

## AI Integration Guide

- Purpose: tune impulse frequency and difficulty per-player
- Model input: {playerHistory, recentCorrections}
- Model output: {impulseMagnitudeSchedule}

## Test Cases / Acceptance Criteria

- Character remains controllable with <100ms perceived latency

## Implementation Tasks

1. Read sensors and map to balance
2. Implement impulse system
3. Add calibration and haptics
