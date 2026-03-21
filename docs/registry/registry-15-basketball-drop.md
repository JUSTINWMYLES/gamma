## Title

High Drop Basketball

## ID

registry-15-basketball-drop

## One-line Summary

Drop a basketball from a high distance; player chooses spin and angle to land in hoop.

## Long Description

Players select drop parameters (spin, angle, release offset) to try to land a ball in a target zone from great height. A physics model simulates trajectory and bounce; scoring based on landing accuracy.

## Target Platforms

- Primary: mobile, web

## Core Mechanics

- Physics-based projectile simulation, user parameter selection

## Player Interactions

- Controls: sliders for spin, angle, and drop offset
- Feedback: trajectory preview, result replay

## Required Inputs / Sensors

- `touch`

## Outputs / Network

- Send run results and replays for leaderboard

## UI Flow

1. Select parameters -> simulate -> show result -> score

## State Machine

- `setup`->`simulate`->`result`

## Data Structures

- Run: {playerId, params, result, score}

## Assets

- Ball model, hoop, background

## Performance & Constraints

- Ensure deterministic physics across platforms for replay comparison

## Failure Modes & Recovery

- Floating point differences -> use fixed-step simulation or authoritative server

## AI Integration Guide

- Purpose: suggest optimal parameters or generate wind/obstacle patterns

## Test Cases / Acceptance Criteria

- Simulation reproduces expected trajectories for known inputs

## Implementation Tasks

1. Implement physics simulation and parameter UI
