## Title

Last To Get Instructions (Confusion Game)

## ID

registry-13-last-to-get-instructions

## One-line Summary

Players follow a sequence of instructions; the last player to receive the prompt is eliminated.

## Long Description

The host issues a complex instruction that the players must perform (e.g., touch top-left then not bottom-right). The trick is that instructions are distributed randomly and players who get the instruction later have less time or are more likely to be confused. Variants randomize instructions each round.

## Target Platforms

- Primary: mobile

## Core Mechanics

- Instruction distribution, timing windows, elimination logic

## Player Interactions

- Controls: follow on-screen prompts, confirm when done
- Feedback: success/failure animations, elimination indicator

## Required Inputs / Sensors

- `touch`, `network`

## Outputs / Network

- Messages: {playerId, instructionId, timestamp, completed}

## UI Flow

1. Lobby -> present instruction -> staggered delivery -> evaluate -> eliminate/continue

## State Machine

- `idle`->`dispatch_instructions`->`collect_responses`->`eliminate`

## Data Structures

- Instruction: {id, steps, timeLimit}

## Assets

- Instruction cards, timers

## Performance & Constraints

- Timed delivery must be reliable with low jitter to ensure fairness

## Failure Modes & Recovery

- Missed delivery -> re-send or mark as late

## AI Integration Guide

- Purpose: generate varied and confusing instruction sets, ensure clarity and fairness

## Test Cases / Acceptance Criteria

- Distribution timing is verifiable and consistent across devices

## Implementation Tasks

1. Implement instruction generator and staggered delivery
