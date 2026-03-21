## Title

Grid Tap Color Sequence

## ID

registry-10-grid-tap-colors

## One-line Summary

Phones laid on the ground form a grid; players take turns tapping phones that flash colors in sequence.

## Long Description

Arrange phones in a grid formation. The system flashes a sequence of colors across the phones. Each player, on their turn, must tap the phone(s) in the correct order. Sequences increase in length/difficulty.

## Target Platforms

- Primary: mobile, local network discovery

## Core Mechanics

- Global sequence broadcast, per-device flash, turn-based taps

## Player Interactions

- Controls: tap phone when flashing, pass phone to next player
- Feedback: local flash, success/fail animation

## Required Inputs / Sensors

- `touch`, `network` for coordination

## Outputs / Network

- Messages: {sequenceStep, activePhoneId, result}

## UI Flow

1. Grid setup -> show sequence -> player turn(s) -> evaluate -> next

## State Machine

- `idle`->`show_sequence`->`player_turn`->`scoring`

## Data Structures

- Sequence: [{phoneId, color, time}]

## Assets

- Color palettes, flash FX, round counter

## Performance & Constraints

- Low-latency sync to ensure flashes align across devices

## Failure Modes & Recovery

- Out-of-sync step -> resync from host and repeat step

## AI Integration Guide

- Purpose: generate sequences tuned to player performance

## Test Cases / Acceptance Criteria

- Sequence playback remains consistent across grid

## Implementation Tasks

1. Implement sequence broadcaster and per-device flash
