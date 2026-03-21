## Title

Phone Notes Song Match

## ID

registry-21-phone-notes-song

## One-line Summary

Each phone is assigned a musical note; players tap phones to reproduce an original melody.

## Long Description

The host plays a short melody. Each player’s device corresponds to a single note. Players must tap phones in the right order and timing to reproduce the melody. Scoring based on timing and pitch accuracy.

## Target Platforms

- Primary: mobile with speakers/touch

## Core Mechanics

- Assign notes to devices, sequence replication, timing-based scoring

## Player Interactions

- Controls: tap to play assigned note
- Feedback: metronome, visual beat indicator, correctness highlight

## Required Inputs / Sensors

- `touch`, `audio output`, `network`

## Outputs / Network

- Events: {playerId, noteId, timestamp}

## UI Flow

1. Host plays melody -> practice -> sequence playback -> scoring

## State Machine

- `idle`->`listen`->`perform`->`score`

## Data Structures

- Melody: [{noteId, start, duration}]

## Assets

- Note samples, metronome ticks

## Performance & Constraints

- Low-latency event timing important for accurate scoring

## Failure Modes & Recovery

- Network lag -> client-side buffering and server reconciliation

## AI Integration Guide

- Purpose: analyze performance timing, generate practice melodies, and map difficulty

## Test Cases / Acceptance Criteria

- Melody reproduction accuracy within 100ms tolerance

## Implementation Tasks

1. Assign notes and sync timing
