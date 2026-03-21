## Title

Skateboard Balance

## ID

registry-05-skateboard-balance

## One-line Summary

Balance a skateboard character using tilt or touch inputs while traversing obstacles.

## Long Description

Players control a skateboarder by tilting their device or using on-screen controls. The goal is to keep balance while navigating ramps and obstacles. Physics-based simulation with simplified controls creates a fun challenge.

## Target Platforms

- Primary: mobile

## Core Mechanics

- Tilt-to-balance, speed control, jump timing

## Player Interactions

- Controls: accelerometer-based lean, tap-to-jump
- Feedback: particle effects, crash sound, vibration on fall

## Required Inputs / Sensors

- `accelerometer`, `touch`

## Outputs / Network

- Local runs; optional ghosts or leaderboards via server

## UI Flow

1. Select course -> countdown -> run -> finish -> scoreboard

## State Machine

- `idle`->`running`->`crashed`->`finished`

## Data Structures

- Run: {playerId, time, score, events}

## Assets

- Skateboard sprite, track tiles, FX

## Performance & Constraints

- Stable physics at 60 FPS for consistent tilt feel

## Failure Modes & Recovery

- Sensor noise -> apply smoothing filter

## AI Integration Guide

- Purpose: generate level obstacles, tune physics parameters

## Test Cases / Acceptance Criteria

- Player can complete simple course with predictable controls

## Implementation Tasks

1. Physics prototype
2. Track editor or procedural generator
