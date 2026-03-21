## Title

Dad Joke Word Mess-Up

## ID

registry-23-dad-joke-mess-up

## One-line Summary

Pick a word or sentence and intentionally mess it up (pun-based dad-joke style) for others to react.

## Long Description

Players are given a prompt word or sentence and must produce a humorous corruption or pun. Other players vote on the funniest entries. AI can suggest variants to inspire players.

## Target Platforms

- Primary: mobile, web

## Core Mechanics

- Prompt generation, user text submission, voting and ranking

## Player Interactions

- Controls: text input, submit, vote

## Required Inputs / Sensors

- `touch`, `keyboard`, `network`

## Outputs / Network

- Submissions: {playerId, text}

## UI Flow

1. Prompt -> write submission -> reveal -> vote -> winner

## State Machine

- `prompt`->`submission`->`voting`->`result`

## Data Structures

- Submission: {id, playerId, text, votes}

## Assets

- Prompt cards, voting UI

## Performance & Constraints

- Filter offensive content with moderation heuristics or require manual approval

## Failure Modes & Recovery

- Offensive submissions -> report and remove

## AI Integration Guide

- Purpose: generate playful prompt alternatives, rate submissions for humor (optional and careful)

## Test Cases / Acceptance Criteria

- Voting correctly selects the highest-voted submission

## Implementation Tasks

1. Implement prompt generator and voting flow
