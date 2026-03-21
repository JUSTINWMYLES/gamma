## Title

Slap-and-Run

## ID

registry-18-slap-run

## One-line Summary

Perform a slap gesture with the phone, then run or perform a follow-up action within time limits.

## Long Description

The mini-game requires a physical slap-like motion (detected via accelerometer), followed by a secondary action like running (step count) or another gesture. Sequence and timing determine success.

## Target Platforms

- Primary: mobile with accelerometer

## Core Mechanics

- Gesture detection (slap), secondary sensor input (step counting or GPS) and timing

## Player Interactions

- Controls: perform gestures, move the device
- Feedback: animation and score after each stage

## Required Inputs / Sensors

- `accelerometer`, optional `pedometer`/`gps`, `touch`

## Outputs / Network

- Event logs: {playerId, slapDetected, followUpMetric}

## UI Flow

1. Prompt -> perform slap -> follow-up -> result

## State Machine

- `idle`->`stage1`->`stage2`->`score`

## Data Structures

- GestureEvent: {type, magnitude, timestamp}

## Assets

- Slap FX, transition animations

## Performance & Constraints

- Accurate slap detection without false positives from normal movement

## Failure Modes & Recovery

- False detection -> require clear threshold or double-confirm

## AI Integration Guide

- Purpose: classify slap gestures and adapt thresholds per-device

## Test Cases / Acceptance Criteria

- Slap detection true positive rate >95% on test devices

## Implementation Tasks

1. Implement slap classifier and follow-up metric tracking
