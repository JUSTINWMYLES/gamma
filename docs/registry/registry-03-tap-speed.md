## Title

Tap Speed Count

## ID

registry-03-tap-speed

## One-line Summary

Players tap the screen as fast as possible during a short window; counts determine scores.

## Long Description

Each round gives players a fixed time window to tap the screen. The app counts taps, debounces accidental multi-touch if needed, and reports counts. Variants include per-finger counts or alternating taps.

## Target Platforms

- Primary: mobile (touch)

## Core Mechanics

- Tap detection and counting
- Time-limited rounds
- Anti-cheat debouncing and multi-touch handling

## Player Interactions

- Controls: rapid touch input
- Feedback: per-tap sound, combo visual, final count animation

## Required Inputs / Sensors

- `touch`

## Outputs / Network

- Send {playerId, taps, duration} to scoreboard aggregator when round ends

## UI Flow

1. Ready screen -> countdown -> tapping window -> results

## State Machine

- `idle`->`countdown`->`active`->`reporting`

## Data Structures

- Player: {id, name, tapCount}
- Round: {id, timeLimit, startTime}

## Assets

- Tap sound, progress bar, animated counter

## Performance & Constraints

- Must reliably count high-frequency taps (200+ taps/min) without missing events

## Failure Modes & Recovery

- Touch event flood -> throttle with high-resolution timestamp checks

## AI Integration Guide

- Purpose: analyze tap patterns, suggest fairness thresholds, or generate variations

## Test Cases / Acceptance Criteria

- Accurate counting across iOS/Android devices for 30s window

## Implementation Tasks

1. Implement touch listener and debouncing
2. Add visual/audio feedback
3. Integrate scoreboard
