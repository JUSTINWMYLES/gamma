## Title

Meme Silly Poses

## ID

registry-24-meme-silly-poses

## One-line Summary

Players stand and perform silly pose prompts shown on-screen (e.g., one hand on head, other in ear).

## Long Description

Each round presents a silly pose. Players perform the pose and optionally take a photo or simply indicate completion. The game can rotate players through prompts to build a sequence of memes.

## Target Platforms

- Primary: mobile

## Core Mechanics

- Prompt display, timed completion, optional photo capture

## Player Interactions

- Controls: view prompt, capture photo, pass

## Required Inputs / Sensors

- `camera` (optional), `touch`

## Outputs / Network

- Submissions: {playerId, photoRef, time}

## UI Flow

1. Show prompt -> perform -> submit -> next

## State Machine

- `idle`->`prompt`->`submit`->`review`

## Data Structures

- Prompt: {id, text, poseImage}

## Assets

- Pose illustrations, timer UI

## Performance & Constraints

- Keep prompts concise for quick rounds

## Failure Modes & Recovery

- Photo upload fails -> allow retry or manual confirm

## AI Integration Guide

- Purpose: generate creative pose prompts and moderate submissions

## Test Cases / Acceptance Criteria

- Players can complete and submit poses within time limits

## Implementation Tasks

1. Build prompt deck and submission flow
