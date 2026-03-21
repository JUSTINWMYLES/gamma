## Title

S-Tier Ranking

## ID

registry-11-tier-ranking

## One-line Summary

Players sort items into tiers; the most common items gain higher scores.

## Long Description

Players collaboratively or competitively rank a list of items into tiers (S, A, B, etc.). The system aggregates votes and identifies consensus; items placed in higher tiers that match population consensus get higher points.

## Target Platforms

- Primary: mobile, web

## Core Mechanics

- Drag-and-drop tiering, voting aggregation, consensus scoring

## Player Interactions

- Controls: drag items to tiers, confirm placement
- Feedback: heatmap of placements, consensus indicator

## Required Inputs / Sensors

- `touch`, `network`

## Outputs / Network

- Messages: {playerId, itemId, tier}

## UI Flow

1. Present items -> players arrange -> submit -> aggregate results

## State Machine

- `lobby`->`arrange`->`submit`->`results`

## Data Structures

- Item: {id, label, image}
- Placement: {playerId, itemId, tier}

## Assets

- Item thumbnails, tier panels

## Performance & Constraints

- Support up to N items without UI performance degradation

## Failure Modes & Recovery

- Conflicting submissions -> last-write or server merge policy

## AI Integration Guide

- Purpose: suggest default tiers, detect outliers, or auto-rank items from data

## Test Cases / Acceptance Criteria

- Aggregation produces expected consensus for test voters

## Implementation Tasks

1. Build drag-and-drop tier UI
2. Implement aggregation and scoring
