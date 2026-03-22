## Title

Phone Hot Potato

## ID

registry-07-hot-potato

## One-line Summary

Random phone is selected and a timer counts down; players pass the phone before it expires and loses.

## Long Description

At the start of a round, the system selects a phone to hold the "hot potato". The phone will display another users name on the device and the holder must pass the phone along to that player player within a decreasing timer. Once the user has received the phone they will touch a button and it will inform them of who to pass to next. The counter will continue to decrease and once it runs out the screen will show like an explosion on the phone. The user will then pick between the two users who could have been holding it to indicate which of them was holding the device. 

## Target Platforms

- Primary: mobile

## Core Mechanics

- Random selection, countdown

## Player Interactions

- Controls: tap to pass, confirm receiver
- Feedback: vibration + sound on selection and on imminent explosion

## Required Inputs / Sensors

- `touch`, optional `bluetooth`/`nearby` for proximity pass, `camera` for QR

## Outputs / Network

- Messages: {fromId, toId, timeRemaining}

## UI Flow

1. Lobby -> start round -> random selection -> pass events -> elimination or winner

## State Machine

- `idle`->`holding`->`passing`->`eliminated`

## Data Structures

- PassEvent: {from, to, timestamp, timeLeft}

## Assets

- Timer UI, explosion FX, pass confirmation animation

## Performance & Constraints

- Fast, low-latency discovery for smooth passing experience

## Failure Modes & Recovery

- Failed pass -> allow retry or automatic random pass after timeout

## AI Integration Guide

- Purpose: tune timer decrement formula and suggest pass targets to improve fairness

## Test Cases / Acceptance Criteria

- Pass detection should be reliable within local network

## Implementation Tasks

1. Implement pass detection (choose method)
2. Timer UI and vibration cues
