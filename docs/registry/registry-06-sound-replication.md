## Title

Sound Replication Turn Match

## ID

registry-06-sound-replication

## One-line Summary

Players hear a sound on the main display and take turns replicating it; closeness is measured acoustically.

## Long Description

A random player is chosen to select the category (for example: vehicles, animals, weather, instruments). The viewer (host/TV) plays a short target sound from a curated sound library. Players take turns replicating the sound using their phone microphone; each turn shows an explicit per-player UI on the phone (countdown, visual recording meter, playback controls) and a synchronized view on the central display.

Playback and recording are coordinated with a strict per-turn flow: the viewer plays the target, the next player sees a ready/prepare prompt, a short countdown, and then a recording segment. After the recording finishes the player may preview and optionally re-take (within limits) or submit. Once all players have submitted attempts the system performs feature extraction (on-device or server-side), compares embeddings to compute perceptual similarity (pitch, timbre, rhythm and coarse spectral features), and then displays scored results one player at a time on the viewer with a simple waveform overlay comparing the attempt to the original.

Privacy note: record locally and upload only the minimal representation required for scoring (e.g., feature vectors or short samples) unless explicit consent is given. Consider on-device feature extraction to avoid transferring raw audio.

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

1. Random user selects category (or category is auto-selected)
2. Viewer plays target sound (visual cue + small waveform preview on TV)
3. Turn order shown on viewer; current player is highlighted on phones
4. Current player: "Prepare" screen → 3..2..1 countdown → recording window (with live volume meter)
5. Preview & re-take option (limited retries) or submit
6. Repeat steps 3–5 until all players have a submitted attempt
7. Feature extraction & scoring (server or client-side) — compute similarity scores and optional embeddings
8. Viewer displays results sequentially: for each player, show their waveform vs target, similarity score, and short commentary
9. Final leaderboard/summary and optional replay of best attempts

## State Machine

The previous state machine was simplified; replace with these more explicit states that match the updated UI flow:

- `idle` — lobby / waiting for host to start
- `category_selection` — chosen player (or system) picks the category/sound
- `host_playback` — viewer plays the target sound and shows visual preview
- `turn_start` — viewer highlights next player; phones show "Prepare" screen
- `countdown` — short 3..2..1 countdown before recording
- `recording` — active recording window on the phone (meter + timer)
- `review` — player previews attempt, optionally retries or submits
- `turn_end` — finalize and store the attempt, advance to next player or next phase
- `scoring` — extract features/embeddings and compute similarity scores
- `result_display` — show each player's comparison and score on the viewer sequentially
- `finished` — show leaderboard / summary and offer replay or return to lobby

## Data Structures

Attempt: {
	playerId: string,
	audioUrl?: string,           // optional: stored sample URL (short clip) when allowed
	duration: number,           // seconds
	rawAudioHash?: string,      // optional content-hash if storing raw audio
	features: Record<string, number | number[]>, // extracted features (MFCCs, spectral centroid, tempo, etc.)
	embedding?: number[],       // numeric embedding for perceptual similarity (optional)
	similarityScore?: number,   // computed score against target
	submittedAt: number,
	retries?: number,
}

## Assets

Required assets and components:
- Sound library (short target clips)
- Recording UI (phone) with live volume meter and countdown
- Visualizer for viewer (waveform overlay + comparison view)
- On-device or server-side feature extractor (e.g., Meyda, Tensor models, or native WebAudio DSP)
- Optional short sample storage (if raw audio retention is permitted)

## Performance & Constraints

- Prefer on-device feature extraction when possible for privacy and reduced upload latency; if server-side scoring is used aim for <3s score turnaround time under normal network conditions
- Recordings should be short (1–5s) to keep feature extraction and transfer lightweight

## Failure Modes & Recovery

- Noisy environment → implement a noise/level threshold detector and allow re-take when signal quality is low
- Network failure → queue compressed features locally and retry upload; allow offline scoring if feasible
- Privacy opt-out → if a user declines upload of raw audio, fall back to client-side feature extraction and upload features only

## AI Integration Guide

Purpose: compute perceptual similarity using embeddings or ML models; you can use lightweight DSP features (MFCCs, chroma, spectral centroid) or learned embeddings from a small model tuned for audio similarity.

Input example (minimal):
```
{ "playerId": "abc123", "features": { "mfcc": [...], "centroid": 123.4 } }
```

Output example:
```
{ "embedding": [...], "score": 0.82 }
```

## Test Cases / Acceptance Criteria

- Scores correlate with perceptual similarity across sample set

## Implementation Tasks

1. Add viewer-side playback controls and short target preview (safe autoplay handling)
2. Implement phone recording UI: prepare/countdown/record/review/submit with retry limits
3. Integrate on-device feature extraction (Meyda or WebAudio-based DSP) and produce compact feature payloads
4. Define server APIs to receive attempts (or features) and to return scoring results
5. Implement scoring pipeline (embedding comparison, normalization, ranking)
6. Viewer result UI: waveform overlay, per-player reveal, and final leaderboard
7. Add privacy controls and consent UI; support feature-only submission to avoid raw audio uploads
8. Add automated tests for timing, recording lifecycle, and scoring pipeline

