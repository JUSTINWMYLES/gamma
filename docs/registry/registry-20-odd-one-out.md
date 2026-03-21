## Title

Odd One Out

## ID

registry-20-odd-one-out

## One-line Summary

Subtle odd-one-out social deduction: one or more players receive hidden, hard-to-observe micro-actions; everyone votes to identify them.

## Long Description

The game starts and all players have to look at their phone, they will each have a message. One or multiple players will have a message that says `odd one out`, the other players will have one that says `normal`. Each user will have to approve once they are ready to start the game. 

Once all players have approved, all players will have a message that says one of the following:

- Try not to blink
- Breath only through your nose
- stand up and stay standing up
- sit down and stay sitting down
- You must wink once every 10 second window
- Touch or rub the inside of your left wrist once during the next 10 second window
- Clear your throat once every 10 second window (loud)

On each player's screen, they will have a list of all the players in the lobby and will have the ability to vote. Players who vote correctly and who vote first get more points. Players who vote wrong get no points. Once all have submitted their votes the score for that round will show on the TV. A visible per-round timer helps players track 10-second windows.

## Target Platforms

- Primary: mobile (modern iOS/Android browsers)
- Secondary: web (desktop) for testing and TV display

## Core Mechanics

- Hidden-role assignment (one or more `odd` players)
- Subtle micro-action prompts sent privately to each player
- Repeated observation windows (e.g., 10s) where prompts must occur at least once
- In-person visual observation + phone-based voting
- Scoring: correct votes + speed bonuses; multiple rounds

## Player Interactions

- Controls: `Ready` button, `Vote` UI (select player), optional `Pass` or `Skip` (penalized)
- Feedback: countdown timer per observation window, per-player vote indicators (private), round results on TV
- Optional: on-phone hint or seamless replays of last window timeline for user reference (no video capture)

## Required Inputs / Sensors

- `touch` for UI interactions

## Outputs / Network

- Messages (Colyseus):
	- `join`: {playerId, name}
	- `ready`: {playerId}
	- `assign_prompt`: {playerId, promptId, windowMs}
	- `vote`: {voterId, suspectId, timestamp}
	- `round_result`: {roundId, correctIds, scoresDelta}
	- `state_snapshot`: periodic authoritative snapshot for TV view

## UI Flow

1. Lobby: players join and set display names
2. Ready: players press `Ready` to accept prompts and privacy notices
3. Round Start: server assigns roles and prompts, shows countdown
4. Observation Windows: repeated 10s windows where players perform subtle actions; timer displayed
5. Voting: after N windows or at end of the round, players vote via phone UI
6. Results: TV displays who was `odd`, scores, and per-player accuracy; next round option

## State Machine

- `idle` -> `lobby` -> `ready` -> `round_start` -> `window_active` (repeat) -> `voting` -> `round_result` -> `lobby` or `game_over`

Transitions: hostStart, allReady, windowExpired, allVotesIn, nextRound

## Data Structures

- Player: { id: string, name: string, score: number, isOdd: boolean, lastActionWindow: number }
- Prompt: { id: string, text: string, verification: "visual"|"motion"|"audio"|"self-report", windowMs: number }
- Round: { id: string, oddIds: string[], promptMap: Map<playerId,promptId>, startTime: number, windows: number }
- Vote: { voterId: string, suspectId: string, timestamp: number }

## Assets

- Minimal SVG avatars, simple timer and vote UI components, TV scoreboard layout, privacy/help modal

## Performance & Constraints

- Keep network messages small; only exchange role assignments and votes
- Timer resolution should be accurate to ~100ms for fairness
- UI should remain responsive on low-end phones; avoid heavy animation

## Failure Modes & Recovery

- Late/missing votes: allow short grace period then auto-skip or mark abstain
- Player disconnects mid-round: mark as disconnected and reveal as non-voter; if disconnected player was `odd`, optionally substitute with server-chosen human or cancel round
- Misreports or intentional cheating (players claiming actions they didn't do): mitigate via careful prompt design and optional sensor verification; apply conservative scoring when uncertain

## AI Integration Guide

- Purpose: generate diverse, subtle prompts, balance prompt difficulty, and analyze historical voting patterns to adjust difficulty
- Input to model (example):
```
{
	"players": 6,
	"difficulty": "medium",
	"forbidden_actions": ["camera","audio"],
	"windowMs": 10000
}
```
- Expected model output (example):
```
[
	{"id":"p1","text":"glance_down_short","verification":"visual","notes":"briefly look at lap <2s"},
	{"id":"p2","text":"rub_left_wrist","verification":"visual","notes":"subtle rub inside left wrist once"}
]
```

## Test Cases / Acceptance Criteria

- Role assignment: one or more `odd` players assigned per round as configured
- Prompt delivery: each player receives a private prompt within 500ms of round start
- Timer behavior: 10s windows count down accurately and repeat as configured
- Voting: votes recorded and aggregated; first-correct voters receive speed bonus
- Resilience: system tolerates one mid-round disconnect without corrupting other players' state

## Implementation Tasks

1. Server: add `OddOneOutGame` plugin implementing Game interface (assign roles, manage windows, collect votes, score)
2. Server: implement Colyseus message handlers for `join`, `ready`, `assign_prompt`, `vote`, periodic `state_snapshot`
3. Client (Phone): join UI, ready flow, prompt display (private), countdown timer, vote UI
4. Client (TV): lobby display, round timer, live vote counts (anonymous), final scoreboard
5. Tests: unit tests for role assignment and scoring; E2E tests simulating multiple clients and voting flows
6. Docs: add README and developer notes describing prompt design, privacy choices, and how to add new prompts
