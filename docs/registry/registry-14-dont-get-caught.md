## Title

Don't Get Caught (Hide from Guard)

## ID

registry-14-dont-get-caught

## One-line Summary

Control a character moving in a top-down row view and hide from a patrolling security guard.

## Long Description

Players control characters in a top-row perspective, navigating obstacles and hiding spots to avoid a guard. The guard follows predictable or AI-driven patrol patterns. Players who are caught are eliminated or penalized.

## Target Platforms

- Primary: mobile, web

## Core Mechanics

- Stealth movement, guard AI, hiding mechanics, line-of-sight checks

## Player Interactions

- Controls: swipe or on-screen joystick to move; tap to hide
- Feedback: detection meter, alert sound, visual indicators

## Required Inputs / Sensors

- `touch`, `network` for multiplayer

## Outputs / Network

- Sync positions and detection events: {playerId, pos, detected}

## UI Flow

1. Lobby -> spawn -> in_play -> caught/escaped -> results

## State Machine

- `spawn`->`in_play`->`caught`->`respawn`/`end`

## Data Structures

- Guard: {pos, state, patrolPath}

## Assets

- Character sprites, guard animations, hiding props

## Performance & Constraints

- Line-of-sight and collision checks should be efficient for many players

## Failure Modes & Recovery

- Desync -> authoritative host corrections

## AI Integration Guide

- Purpose: generate patrols, adapt guard behavior to player skill

## Test Cases / Acceptance Criteria

- Guard detection is consistent with visual indicators

## Implementation Tasks

1. Implement basic guard AI and LOS checks
