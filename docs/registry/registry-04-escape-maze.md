## Title

Escape A Maze

## ID

registry-04-escape-maze

## One-line Summary

Players navigate a maze to escape; multiplayer variants can hide player identity or share partial maps.

## Long Description

Single or multiplayer maze navigation where players must find exits within a time limit. Variants include shared maze where each phone shows a different section, cooperative map stitching, or a competitive race.

## Target Platforms

- Primary: mobile, web

## Core Mechanics

- Player movement (swipe or tilt)
- Collision with walls
- Map reveal mechanics

## Player Interactions

- Controls: swipe-to-move or on-screen joystick; optional tilt
- Feedback: footsteps, collision sounds, minimap reveals

## Required Inputs / Sensors

- `touch`, optional `accelerometer`

## Outputs / Network

- Sync player positions in multiplayer (messages: {playerId, position, timestamp})

## UI Flow

1. Lobby -> choose maze/difficulty -> start -> in_play -> exit/timeout

## State Machine

- `lobby`->`in_round`->`escaped`/`failed`

## Data Structures

- Maze: {cells, start, exit, seed}
- Player: {id, pos, moves}

## Assets

- Tile set, player avatar, minimap overlay

## Performance & Constraints

- Procedural maze generation must be deterministic from seed for synced multiplayer

## Failure Modes & Recovery

- Out-of-sync positions -> authoritative reconciliation from host

## AI Integration Guide

- Purpose: generate mazes, adapt difficulty, create hints

## Test Cases / Acceptance Criteria

- Deterministic maze generation from seed

## Implementation Tasks

1. Maze generator and renderer
2. Movement and collision
3. Multiplayer sync (optional)
