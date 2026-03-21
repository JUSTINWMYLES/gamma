## Title

Tie a Shoelace

## ID

registry-16-tie-shoelace

## One-line Summary

Players follow on-screen instructions or a timed sequence to tie a shoelace.

## Long Description

A step-by-step tutorial or timed challenge where players must perform shoelace-tying steps. Could use camera-based verification or manual confirmation.

## Target Platforms

- Primary: mobile with camera (optional)

## Core Mechanics

- Instruction sequencing, optional image verification

## Player Interactions

- Controls: progress through steps, capture images for verification

## Required Inputs / Sensors

- `camera` (optional), `touch`

## Outputs / Network

- Submit step completions and optional photos for verification

## UI Flow

1. Show step -> user completes -> confirm -> next

## State Machine

- `idle`->`in_tutorial`->`completed`

## Data Structures

- TutorialStep: {id, instruction, sampleImage}

## Assets

- Instruction illustrations, progress tracker

## Performance & Constraints

- Keep steps short and clear for mobile readability

## Failure Modes & Recovery

- Wrong camera angle -> guidance overlay and retry

## AI Integration Guide

- Purpose: verify correctness from images or provide dynamic hints

## Test Cases / Acceptance Criteria

- Users can complete steps and confirm tying successfully

## Implementation Tasks

1. Create steps and UI overlays
