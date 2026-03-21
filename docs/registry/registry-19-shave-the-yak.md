## Title

Shave The Yak

## ID

registry-19-shave-the-yak

## One-line Summary

Humorous task-oriented game: players complete a long sequence of small chores (metaphorically "shave the yak").

## Long Description

This entry is a meta-game for long, multi-step tasks broken into small microtasks. Use as a joke or productivity-style mini-game where players get points for completing subtasks.

## Target Platforms

- Primary: mobile, web

## Core Mechanics

- Task queue, progress tracking, time-limited subtasks

## Player Interactions

- Controls: accept/complete task, skip (with penalty)

## Required Inputs / Sensors

- `touch`, optional `camera` for visual proof

## Outputs / Network

- Task events: {playerId, taskId, status}

## UI Flow

1. Present task -> complete action -> submit proof -> reward

## State Machine

- `idle`->`in_task`->`submitted`->`validated`

## Data Structures

- Task: {id, description, difficulty, reward}

## Assets

- Task cards, progress meter

## Performance & Constraints

- Keep tasks small to avoid frustration

## Failure Modes & Recovery

- Proof fails validation -> allow retry or manual review

## AI Integration Guide

- Purpose: decompose larger tasks into microtasks, validate proof images

## Test Cases / Acceptance Criteria

- Rewards and progress persist across sessions

## Implementation Tasks

1. Implement task queue and validation pipeline
