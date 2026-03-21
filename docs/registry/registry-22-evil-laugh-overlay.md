## Title

Evil Laugh Overlay

## ID

registry-22-evil-laugh-overlay

## One-line Summary

Record an evil laugh and overlay it on a looping GIF; players may plug ears for a silly effect.

## Long Description

Players have 2 minutes to select a gif. The gif ideally involves someone laughing or something similar. Once all users have selected a gif in secret, each user is then prompted to plug their ears. One by one users phones will indicate it's their turns to record. They will record themselves then align the laugh to match at the correct time of the gif, then mark themselves as complete. They will be given 60 seconds for their turn entirely.

## Target Platforms

- Primary: mobile

## Core Mechanics

- Audio recording, audio/visual overlay, simple effects (reverb, pitch)

## Player Interactions

- Controls: record, choose GIF, apply effect
- Feedback: visual preview, playback

## Required Inputs / Sensors

- `microphone`, `touch`

## Outputs / Network

- Share media packages: {gifId, audioRef, effects}

## UI Flow

1. Record -> choose overlay -> apply effects -> share/play

## State Machine

- `idle`->`recording`->`preview`->`share`

## Data Structures

- MediaPackage: {gif, audio, effects}

## Assets

- GIF library, audio FX presets

## Performance & Constraints

- Keep generated media small for quick sharing

## Failure Modes & Recovery

- Recording failure -> retry prompt

## AI Integration Guide

- Purpose: suggest effect presets or generate GIF pairings

## Test Cases / Acceptance Criteria

- Player can record and share audio overlaid GIF within 5s

## Implementation Tasks

1. Implement recording and overlay pipeline
