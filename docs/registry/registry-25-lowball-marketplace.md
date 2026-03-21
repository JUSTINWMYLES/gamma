## Title

Lowball Marketplace Game

## ID

registry-25-lowball-marketplace

## One-line Summary

A humorous auction-style game where players submit lowball offers for items and the most creative/lowest accepted wins.

## Long Description

Players are presented with an item and must submit their best lowball offer. Variants include auction rounds, bluffing mechanics, and voting on which lowball is the funniest or most creative.

## Target Platforms

- Primary: mobile, web

## Core Mechanics

- Offer submission, voting/acceptance, rounds and scoring

## Player Interactions

- Controls: enter numeric/text offer, submit, vote

## Required Inputs / Sensors

- `touch`, `keyboard`, `network`

## Outputs / Network

- Messages: {playerId, itemId, offer, votes}

## UI Flow

1. Present item -> collect offers -> reveal -> vote/accept -> score

## State Machine

- `present`->`collect_offers`->`reveal`->`vote`

## Data Structures

- Offer: {playerId, amount, text}

## Assets

- Item thumbnails, bidding UI

## Performance & Constraints

- Prevent numeric overflow; sanitize text inputs

## Failure Modes & Recovery

- Duplicate offers or spam -> rate-limit submissions

## AI Integration Guide

- Purpose: suggest items, generate comedic descriptions, or auto-rate offers

## Test Cases / Acceptance Criteria

- Offers persist and votes aggregate correctly

## Implementation Tasks

1. Build offer collection and reveal UI
