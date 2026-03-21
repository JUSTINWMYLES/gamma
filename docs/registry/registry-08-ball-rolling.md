## Title

Ball Rolling Follow Path

## ID

registry-08-ball-rolling

## One-line Summary

A ball rolls along a hidden path; players see its motion on their screen but don't know which device they're controlling.

## Long Description

Players observe a ball that appears to travel between devices in a shared grid. Each player's view shows the ball moving but anonymity hides which device is the active controller. Players must interact to influence its path or guess identity in variants.

## Target Platforms

- Primary: mobile

## Core Mechanics

- Synchronised animation, hidden ownership, player input mapping

## Player Interactions

- Controls: taps to nudge, swipe to influence direction
- Feedback: local highlight if you're current controller (optional), global animation

## Required Inputs / Sensors

- `touch`, `network` for sync

## Outputs / Network

- Sync messages: {ballPos, ownerId (hidden), velocity}

## UI Flow

1. Grid setup -> show ball -> in_round -> reveal (optional) -> scoreboard

## State Machine

- `idle`->`in_round`->`reveal`->`scoreboard`

## Data Structures

- Ball: {pos, vel, ownerMask}

## Assets

- Ball sprite, grid tiles, nudge FX

## Performance & Constraints

- Tight sync required to keep animations coherent across devices; use interpolation for jitter

## Failure Modes & Recovery

- Network jitter -> client-side prediction and periodic authoritative correction

## AI Integration Guide

- Purpose: generate hidden ownership schedules, plan path difficulty

## Test Cases / Acceptance Criteria

- Ball position remains visually consistent across 4 devices under 200ms jitter

## Implementation Tasks

1. Implement grid and ball physics
2. Build network sync layer
