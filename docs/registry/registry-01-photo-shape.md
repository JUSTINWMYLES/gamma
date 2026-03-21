## Title

Photo Shape Match

## ID

registry-01-photo-shape

## One-line Summary

Take a photo within a time limit and pose/align to match a target shape displayed on-screen.

## Long Description

Players are shown a silhouette or target shape on the main display. Each player has X seconds to take a photo of a real-world object or person that best matches the shape. The system scores closeness based on shape matching heuristics and optional AI-based visual similarity.

## Target Platforms

- Primary: mobile iOS/Android (camera access required)
- Secondary: web (camera via browser)

## Core Mechanics

- Show target silhouette
- Start countdown timer per-player
- Capture image, run shape-matching algorithm or AI comparator
- Rank players by similarity

## Player Interactions

- Controls: camera capture button, retake (if allowed), ready/submit
- Feedback: visual similarity score, progress bar, animation on match

## Required Inputs / Sensors

- `camera`, `touch`, optional `accelerometer` for orientation

## Outputs / Network

- Local preview and results
- Optional: send images or embeddings to peer devices or server for aggregation; messages: {playerId, imageHash, embedding, score}

## UI Flow

1. Lobby / Join: players enter name
2. Round start: show silhouette and timer
3. Capture: player takes photo and submits
4. Reporting: display similarity scores and leaderboard

## State Machine

- States: `idle` -> `lobby` -> `countdown` -> `capture` -> `scoring` -> `scoreboard`
- Triggers: hostStart, timerExpired, submitPhoto, scoringComplete

## Data Structures

- Player: {id, name, deviceId, imageRef, embedding, score}
- Round: {id, silhouetteId, startTime, timeLimit, scoringMethod}

## Assets

- Silhouette images (vector), placeholder camera overlay, progress rings, score badges

## Performance & Constraints

- Prefer on-device embedding extraction to avoid privacy issues; if remote, encrypt transfers. Real-time scoring target <2s.

## Failure Modes & Recovery

- Camera permission denied -> prompt and fallback to selecting an existing photo
- Upload failure -> retry and local scoring fallback

## AI Integration Guide

- Purpose: generate silhouette variations, compute image embeddings, and produce similarity scores.
- Input sample:
```
{"image_base64":"...","silhouette_id":"sil-03","player_id":"p1"}
```
- Expected model output:
```
{"embedding":[...],"score":0.87}
```

## Test Cases / Acceptance Criteria

- Camera permission flow works across iOS/Android
- Scoring runs under 2s for typical images
- Leaderboard displays correct ranking for 3 players

## Implementation Tasks

1. Implement camera capture UI
2. Add silhouette gallery and selection
3. Integrate embedding/scoring model
4. Add leaderboard and per-round history
