## Title

Dice Roll Best-of-3

## ID

registry-12-dice-roll

## One-line Summary

Players roll virtual dice; best of three rolls wins.

## Long Description

Simple chance-based mini-game where each player rolls a die three times and the highest total wins. Variants include special modifiers or power-ups.

## Target Platforms

- Primary: mobile, web

## Core Mechanics

- Random roll generation with seeded RNG for fairness and auditability

## Player Interactions

- Controls: tap to roll
- Feedback: roll animation, sound, result tally

## Required Inputs / Sensors

- `touch`

## Outputs / Network

- Share rolls and totals: {playerId, rolls:[..], total}

## UI Flow

1. Lobby -> roll sequence -> aggregate -> winner announcement

## State Machine

- `idle`->`rolling`->`scoring`

## Data Structures

- RollEvent: {playerId, values}

## Assets

- Dice sprite, roll FX

## Performance & Constraints

- RNG must be deterministic when using server seed to prevent cheating

## Failure Modes & Recovery

- Network loss -> allow local roll and reconcile later

## AI Integration Guide

- Purpose: create fair RNG seeds or suggest modifiers

## Test Cases / Acceptance Criteria

- Rolls are unbiased over large sample

## Implementation Tasks

1. Implement RNG with optional server seed
