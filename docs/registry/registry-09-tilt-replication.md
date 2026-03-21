## Title

Tilt Replication Replay

## ID

registry-09-tilt-replication

## One-line Summary

Watch a video showing device tilt over time, then replicate the same tilt pattern using your phone.

## Long Description

A tutorial video demonstrates a tilt sequence over a specific period. Players then use their phone to replicate the movement; sensors record the trace and the server compares traces for similarity.

## Target Platforms

- Primary: mobile (accelerometer/gyroscope)

## Core Mechanics

- Playback of tutorial, sensor recording, trace comparison and scoring

## Player Interactions

- Controls: start recording, playback own trace
- Feedback: similarity graph and score

## Required Inputs / Sensors

- `accelerometer`, `gyroscope`, `touch`

## Outputs / Network

- Upload trace arrays: {timestamps, accel, gyro} and comparison results

## UI Flow

1. Show tutorial -> countdown -> record -> scoring -> results

## State Machine

- `idle`->`display_tutorial`->`recording`->`scoring`

## Data Structures

- Trace: [{t, ax, ay, az, gx, gy, gz}]

## Assets

- Tutorial video, trace visualizer

## Performance & Constraints

- Record at 50-100Hz for meaningful trace sampling without draining battery

## Failure Modes & Recovery

- Sensor dropouts: interpolate small gaps, allow re-record on large gaps

## AI Integration Guide

- Purpose: align and score traces robustly using DTW or learned model

## Test Cases / Acceptance Criteria

- Trace similarity metric correlates with human judgment across sample set

## Implementation Tasks

1. Implement recording and DTW scoring
