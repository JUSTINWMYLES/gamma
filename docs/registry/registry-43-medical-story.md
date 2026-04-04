## Title

Medical Story

## ID

registry-43-medical-story

## One-line Summary

Players are assigned hospital roles and collaboratively invent the funniest diagnosis, emergency procedure, and doctor catchphrase for a patient brought in by ambulance.

## Long Description

A patient arrives by ambulance and the lobby votes to assign roles: patient, doctor, and nurse. The remaining players are bystanders. The group then works through three creative rounds: first inventing a hilariously made-up diagnosis (a fake medical term paired with a body part), next devising an emergency procedure (a made-up procedure name paired with a physical action from a preset list), and finally completing the doctor's classic boast — "well that's why they call me the ___ doctor in the country". After each submission phase, all players vote for their favourite entry, and points are awarded to the winning submission's author.

## Target Platforms

- Primary: mobile iOS/Android
- Secondary: web

## Core Mechanics

- Role assignment by player vote (patient, doctor, nurse, bystanders)
- Three sequential creative-submission phases per round
- Peer voting after each submission phase to determine the funniest entry
- Points awarded to the author of the highest-voted submission each phase

## Player Interactions

- Controls: touch — tap to cast role vote, type free-text submission, tap to select body part or preset action, tap to cast content vote
- Feedback: visual confirmation of submitted entry, animated reveal of votes, score update after each phase

## Required Inputs / Sensors

- `touch`

## Outputs / Network

- Local display of prompts, submissions, and vote results
- Messages: `{playerId, submissionText, bodyPart?, action?, votes}`
- Vote tally broadcast to all players and TV at end of each phase

## TV Requirement

- `requiresTV`: false — all prompts and results are displayed on individual phones; TV display is optional but enhances the shared experience by showing vote reveals and role assignments to the whole room

## Round Configuration

- `defaultRoundCount`: 3
- `minRounds`: 1
- `maxRounds`: 6
- `supportsBracket`: false

## Instructions Phase

- `hasInstructionsPhase`: true
- `instructionsDelivery`: `broadcast` — all players receive the same overview of the three phases before play begins

## UI Flow

1. Lobby / Join: players enter name and wait for host to start
2. Game loading: no sensor permissions required
3. Instructions: TV and phones show overview of the three phases; players tap "Got it"
4. Role voting: all players vote to assign patient, doctor, and nurse from the lobby
5. Diagnosis phase: players submit a fake medical term and select a body part; votes reveal the winner
6. Procedure phase: players submit a made-up procedure name and select a physical action (Compressions, Shock, Punch, Slap, Roll, Shake); votes reveal the winner
7. Catchphrase phase: players complete "well that's why they call me the ___ doctor in the country"; votes reveal the winner
8. Round end recap: phase winners and scores shown
9. Scoreboard / final results after all rounds

## State Machine

- States: `idle` -> `lobby` -> `instructions` -> `role_voting` -> `diagnosis_submission` -> `diagnosis_voting` -> `procedure_submission` -> `procedure_voting` -> `catchphrase_submission` -> `catchphrase_voting` -> `round_end` -> `scoreboard`
- Transitions:
  - `hostStart` — `lobby` -> `instructions`
  - `allReady` — `instructions` -> `role_voting`
  - `roleVoteComplete` — `role_voting` -> `diagnosis_submission`
  - `allSubmitted` — `*_submission` -> `*_voting`
  - `voteTimerExpired` — `*_voting` -> next submission state or `round_end`
  - `allRoundsComplete` — `round_end` -> `scoreboard`
  - `hostRestart` — `scoreboard` -> `lobby`

## Data Structures

- Player: `{id, name, deviceId, role: "patient"|"doctor"|"nurse"|"bystander", score}`
- Submission: `{playerId, phase: "diagnosis"|"procedure"|"catchphrase", text, bodyPart?: string, action?: string, votes: number}`
- Round: `{id, patientId, doctorId, nurseId, submissions: Submission[], phaseWinners: {diagnosis, procedure, catchphrase}}`

## Assets

- Ambulance arrival animation (intro sequence)
- Hospital / ER themed background
- Role badge icons (patient, doctor, nurse, bystander)
- Body-part selector diagram (front/back human outline)
- Preset action icons (Compressions, Shock, Punch, Slap, Roll, Shake)
- Vote reveal animation (drumroll + result card)
- Score badge and points pop-up

## Performance & Constraints

- No high-frequency sensor polling required; standard 60 fps UI target
- Submission text capped at 60 characters to fit vote-display cards
- Vote phase timer: 30 s default; configurable by host
- Bandwidth: low — text submissions only, no media uploads

## Failure Modes & Recovery

- Player disconnects during submission phase -> their entry is dropped; remaining submissions proceed to vote
- Player disconnects during role-voting -> host can manually reassign roles
- All submissions empty for a phase -> skip vote and advance automatically
- Vote tie -> both authors share points

## AI Integration Guide

- Purpose: generate creative prompt suggestions to help players who are stuck, auto-generate fallback submissions if a player does not submit in time, and produce body-part / action pairings for the diagnosis and procedure phases.
- Input to model:
```json
{"phase":"diagnosis","patientName":"Jordan","bodyParts":["elbow","spleen","kneecap"],"style":"funny"}
```
- Expected model output:
```json
{"suggestions":[{"text":"Reverse Flibbertigibbitis","bodyPart":"spleen"},{"text":"Acute Wobble Syndrome","bodyPart":"kneecap"}]}
```

### Example prompt skeleton
```
Generate medical story content for: {"id":"registry-43-medical-story","phase":"diagnosis","players":6}
Return: {"suggestions":[{"text":"...","bodyPart":"..."}]}
```

## Test Cases / Acceptance Criteria

- Role voting correctly assigns exactly one patient, one doctor, and one nurse when ≥ 3 players are present
- Submission phase closes and advances when all connected players have submitted or the timer expires
- Votes are tallied correctly and the highest-voted submission author receives points
- Disconnected players do not block game progression
- Catchphrase fill-in-the-blank renders correctly on all screen sizes
- Scoreboard reflects cumulative points across all rounds

## Implementation Tasks

1. Implement role-voting UI and assignment logic
2. Build reusable submission + voting phase component (used for all three phases)
3. Add body-part selector diagram for diagnosis phase
4. Add preset action picker for procedure phase
5. Build catchphrase fill-in-the-blank prompt UI
6. Implement vote reveal animation and score update
7. Add round recap and final scoreboard screens
8. Integrate AI suggestion endpoint for fallback submissions
9. Add tests for role assignment, vote tallying, and disconnect recovery