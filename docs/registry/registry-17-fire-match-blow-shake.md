## Title

Match Fire (Blow & Fan)

## ID

registry-17-fire-match-blow-shake

## One-line Summary

Light a match, blow into the mic to extinguish, shake to fan — mini-game with sequential sensor actions.

## Long Description

Players perform a sequence: strike a match (tap), blow into microphone to simulate extinguishing, then shake phone to fan, then tap rapidly to put out embers. Each action fills a meter; reaching required thresholds completes the step.

## Target Platforms

- Primary: mobile with mic and accelerometer

## Core Mechanics

- Strike (tap), blow detection (audio amplitude pattern), shake detection (accelerometer), rapid taps

## Player Interactions

- Controls: tap, blow into mic, shake device, rapid taps
- Feedback: flame animation, meter progression, success cues

## Required Inputs / Sensors

- `microphone`, `accelerometer`, `touch`

## Outputs / Network

- Local scoring and optional global rounds summary

## UI Flow

1. Start round -> show sequence -> detect actions -> update meters -> success/fail

## State Machine

- `idle`->`strike`->`blow`->`fan`->`extinguish`

## Data Structures

- Step: {name, requiredLevel, currentLevel}

## Assets

- Match flame animation, meter UI, sound effects

## Performance & Constraints

- Audio detection should be robust to background noise; use thresholds and short sample windows

## Failure Modes & Recovery

- Noisy mic -> allow repeat or prompt quieter environment

## AI Integration Guide

- Purpose: classify blow patterns and estimate blow strength; adjust required thresholds dynamically

## Test Cases / Acceptance Criteria

- Blow detection accuracy across sample environments

## Implementation Tasks

1. Implement audio and accelerometer detectors
2. Create meter animations and thresholds
