## Title

Find The Non-Blinker

## ID

registry-20-blink-identify

## One-line Summary

One player is given the prompt to try not to blink; others must identify who it is.

## Long Description

During a pause, one player receives instructions to avoid blinking and not to breathe through nose or mouth overtly. The rest watch and try to identify the suspect. This can be implemented with short video snippets, timed observation, or live voting.

## Target Platforms

- Primary: mobile with camera (optional) or in-person play with polling

## Core Mechanics

- Prompting a hidden player, timed observation, voting and reveal

## Player Interactions

- Controls: vote UI, optionally record short clips

## Required Inputs / Sensors

- `camera` (optional), `touch`, `network`

## Outputs / Network

- Votes: {voterId, suspectId}

## UI Flow

1. Select hidden player -> observation period -> voting -> reveal

## State Machine

- `setup`->`observe`->`vote`->`reveal`

## Data Structures

- Round: {hiddenPlayerId, votes}

## Assets

- Voting UI, timer visuals

## Performance & Constraints

- Privacy considerations if using camera: opt-in and local-only recording

## Failure Modes & Recovery

- Noisy video -> allow manual selection post-observation

## AI Integration Guide

- Purpose: optionally analyze facial micro-expressions to assist or automate detection (privacy-sensitive)

## Test Cases / Acceptance Criteria

- Voting records and reveal match expected input

## Implementation Tasks

1. Implement hidden role assignment and voting UI
