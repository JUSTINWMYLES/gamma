## Title

S-Tier Ranking

## ID

registry-11-tier-ranking

## One-line Summary

Players sort items into tiers; the most common items gain higher scores.

## Long Description

At the start of the game, one random player is selected to choose a category. there will be a list of possible suggestions, but the used will submit their own category as text.

based on th categories, each player will submit one unique entry to the system.

once all the entries have been collected, each player wull then have a 90 second window to go through esch entry snd classify it on the s tier table. 

once all players have submitted, the main display will go theough each item and place it in its most voted tier spot. players who had their entries in the matching category eill get points. Take the following example:

- the category is best cereal
- each player submits one cereal, the application needs to block duplicated entries
- once all have submitted yheir cereals, each player goes theough each cereal and places it somewhere on the tier list
- once all players are done assigning their yiers, the main display system will then begin
- it will go through each entry and place it on the main tier system. the location of an entry will be based on most voted for yhsy tier. so if 5/6 players vote thst frodted flakes are B tier, then it will sit in B tier. if 2/6 players for it to be B tier, but then all other players vote different tiers, it will still be a B yier because thst had the most common votes
- if players had the match for an entry, they will get points

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
