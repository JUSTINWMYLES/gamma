## Title

Lowball Marketplace Game

## ID

registry-25-lowball-marketplace

## One-line Summary

A humorous auction-style game where players submit lowball offers for items and the most creative/lowest accepted wins.

## Long Description

Similar to any online marketplace such as facebook marketplace, fake listings exist on the marketplace and users are given 2 minutes to scroll through, identify 2 items, and come up with a funny lowball offer.

Following the completion, all users lowball offers are presented one at a time on the primary view screen and on the individual viewers screens. Users vote on which individual listing comment was the funniest

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
