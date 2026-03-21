## Title

Sound Replication Turn Match

## ID

registry-06-sound-replication

## One-line Summary

Players hear a sound on the main display and take turns replicating it; closeness is measured acoustically.

## Long Description

The host plays a short sound; each player records their attempt using their phone microphone. The system analyses audio similarity (pitch, timbre, rhythm) and scores each player. Can be blind (only host hears) or open.

## Target Platforms

- Primary: mobile with microphone

## Core Mechanics

- Playback on host device
- Per-player audio recording and feature extraction
- Similarity scoring and ranking

## Player Interactions

- Controls: record button, playback of own attempt
- Feedback: waveform preview, similarity score

## Required Inputs / Sensors

- `microphone`, `touch`, optional `speaker` for playback

## Outputs / Network

- Transfer either raw audio or embeddings: {playerId, audioHash, features, score}

## UI Flow

1. Host plays sound -> turn order -> record -> scoring -> leaderboard

## State Machine

- `idle`->`host_playback`->`recording`->`scoring`->`result`

## Data Structures

- Attempt: {playerId, duration, features, score}

## Assets

- Sound library, recording UI, visualizer

## Performance & Constraints

- Use on-device feature extraction for privacy; latency goal <3s for scoring

## Failure Modes & Recovery

- Noisy environment -> provide threshold detection and allow re-take

## AI Integration Guide

- Purpose: compute perceptual similarity using embeddings or ML model
- Input sample: {audio_base64}
- Output: {embedding:[...],score:0.82}

## Test Cases / Acceptance Criteria

- Scores correlate with perceptual similarity across sample set

## Implementation Tasks

1. Add playback and recording UI
2. Integrate audio feature extractor
3. Scoring and leaderboard
