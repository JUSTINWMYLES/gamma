## Title

News Broadcast

## ID

registry-45-news-broadcast

## One-line Summary

Players write absurd headlines, inherit someone else's story, build a fake news segment with media, script, and a synthetic anchor voice, then watch the TV present each segment while the room votes for the best broadcast.

## Long Description

News Broadcast is a single-round creative party game built around the comedy of serious TV framing applied to ridiculous content. Each player begins by writing an original news headline. The server then redistributes headlines in a derangement so no one receives their own. During the three-minute broadcast creation phase, players search for a GIF or short clip, write a punchy anchor script, and select a synthetic voice preset. Once all entries are locked, the game enters a short buffering phase while the text-to-speech system generates audio clips. The TV then presents each segment one at a time: the player's custom icon appears as the anchor avatar, the selected media plays on a newsroom screen, and the generated voice reads the headline and script aloud. After all segments air, the room votes for the funniest complete package. The game is presentation-first: the shared TV display is required for the core payoff.

## Target Platforms

- Primary: mobile iOS/Android (phone controller)
- Secondary: web / TV display (shared viewer)

## Core Mechanics

- Headline submission with auto-submit and fallback pool
- Server-side derangement redistribution (no player receives their own headline)
- Broadcast creation: media search, script writing, voice selection, final submission lock
- Async TTS generation triggered on final submission
- Buffered presentation loop with per-segment audio, media, and anchor avatar
- Peer voting for favorite segment (no self-vote, ties allowed)
- Participation + vote-based scoring

## Player Interactions

- Controls: touch — tap to submit, type text, tap media result, tap voice card
- Feedback: visual confirmation of submission, progress bars, timer countdown, vote tally animation, score update
- Audio: synthetic voice reads headline + script during TV presentation; voice preview clips during creation

## Required Inputs / Sensors

- `touch`
- `microphone` — optional, for voice preview playback (not required for core loop)

## Outputs / Network

- Phone output: headline input, media browser, script editor, voice picker, voting buttons
- TV output: presentation layout with media region, anchor avatar, lower third headline/script, voice badge, segment progress
- Key server messages:
  - `headline_submission_start`
  - `headline_submission_update`
  - `headline_assignment_reveal`
  - `broadcast_creation_start`
  - `broadcast_submission_update`
  - `broadcast_buffering_start`
  - `presentation_prepare`
  - `presentation_start`
  - `presentation_end`
  - `voting_start`
  - `vote_count_update`
  - `round_result`
  - `round_skipped`
- Client input payloads:
  - `{ action: "submit_headline", headline }`
  - `{ action: "search_media", query }`
  - `{ action: "select_media", media }`
  - `{ action: "update_script", script }`
  - `{ action: "select_voice", voicePresetId }`
  - `{ action: "submit_broadcast" }`
  - `{ action: "cast_vote", targetPlayerId }`

## TV Requirement

- `requiresTV`: true
- The TV is required because the core payoff is the shared broadcast presentation: synthetic voice, media playback, anchor avatar, and lower third graphics are all designed for a large shared display. Phone-only play would lose the central reveal moment.

## Round Configuration

- `defaultRoundCount`: 1
- `minRounds`: 1
- `maxRounds`: 1
- `supportsBracket`: false

## Instructions Phase

- `hasInstructionsPhase`: true
- `instructionsDelivery`: `broadcast` — all players and TV receive the same overview of headline writing, redistribution, broadcast creation, and voting before play begins

## UI Flow

1. Lobby / Join: players enter name and wait for host to start
2. Game loading: no sensor permissions required
3. Instructions: TV and phones show overview of the four phases; players tap "Got it"
4. Headline submission: players write a headline on their phones (60s)
5. Redistribution reveal: TV shows transition; phones privately display assigned headline (4-6s)
6. Broadcast creation: players search media, write script, pick voice, and submit (180s)
7. Buffering intro: TV shows "Cueing the reel" while TTS prepares first clips (5-12s)
8. Presentation loop: TV presents each segment one at a time with audio, media, and anchor avatar
9. Voting: players vote for their favorite segment on phones (25-30s)
10. Results: TV shows winner, vote counts, and score breakdown (8-10s)
11. Scoreboard / final results

## State Machine

- Room-level states: `lobby` -> `game_loading` -> `instructions` -> `in_round` -> `scoreboard` -> `game_over`
- In-round substates:
  - `headline_submission`
  - `assignment_reveal`
  - `broadcast_creation`
  - `buffering`
  - `presentation`
  - `voting`
  - `results`
- Transitions:
  - `start_game` -> instructions
  - `allReady` -> headline_submission
  - `allSubmittedOrTimeout` -> assignment_reveal
  - `revealTimerExpired` -> broadcast_creation
  - `allSubmittedOrTimeout` -> buffering
  - `prebufferReadyOrTimeout` -> presentation
  - `allPresentationsComplete` -> voting
  - `allVotedOrTimeout` -> results
  - `resultsTimerExpired` -> scoreboard
  - `hostRestart` -> lobby

## Data Structures

- Player: `{ id, name, score, isEliminated, iconEmoji, iconText, iconBgColor, iconDesign }`
- Headline submission: `{ playerId, headline, submittedAt }`
- Headline assignment: `{ playerId, assignedHeadline, originalAuthorId }`
- Broadcast submission: `{ playerId, assignedHeadline, script, voicePresetId, selectedMedia, estimatedSpeechMs, artifactJobId, artifactReady, submittedAt }`
- Presentation entry: `{ playerId, playerName, assignedHeadline, script, voicePresetId, voiceLabel, selectedMedia, estimatedSpeechMs, artifactJobId, artifactReady, captionsOnly }`
- Vote: `{ voterId, targetPlayerId }`
- Round result: `{ winnerId, scores, entries, presentationOrder, totalVotes, participationPoints }`

## Assets

- `news-broadcast-default-frame.svg` — fallback "Technical Difficulties" frame
- Voice preview clips (static MP3 assets, one per preset)
- TV presentation layout CSS/styling
- Phone UI: headline input, media browser grid, script textarea, voice picker cards

## Performance & Constraints

- No high-frequency sensor polling required; standard 60 fps UI target
- Headline capped at 90 characters; script capped at 300-350 characters (~18-20s spoken)
- TTS worker: 4-6 GiB memory per replica, 1 job at a time for predictable latency
- Prebuffer phase waits for first 2 clips ready or 12s timeout
- Bandwidth: low during creation (text + media URLs); audio fetched on demand via server proxy
- Viewer must support WebGL fallback to 2D layout

## Failure Modes & Recovery

- Player disconnects during headline submission -> auto-submit draft or fallback headline; game continues
- Player disconnects during broadcast creation -> auto-submit draft with fallback voice/media if any draft exists
- TTS job fails after retries -> segment falls back to captions-only presentation
- TTS not ready for next segment -> short grace wait, then continue with captions-only if needed
- Media fails to load during reveal -> show fallback "Technical Difficulties" frame, continue with audio
- All headlines empty -> skip round with `round_skipped` message
- Worker crash mid-job -> lease expires, job requeued, another worker claims it
- Room teardown -> explicit artifact deletion triggered; 2-hour backup cleanup loop handles misses

## AI Integration Guide

- Purpose: generate synthetic speech from player-authored text using a lightweight ONNX TTS model; schedule jobs with priority lanes to ensure reveal-blocking clips are ready first
- Input to model:
```json
{
  "text": "Local man discovers he has been paying rent to a raccoon.",
  "voicePresetId": "anchor_classic_a",
  "modelVersion": "OpenMOSS-Team/MOSS-TTS-Nano-100M-ONNX"
}
```
- Expected model output:
```json
{
  "jobId": "tts-abc123",
  "status": "ready",
  "artifactUrl": "/api/tts/audio/tts-abc123",
  "durationMs": 4200
}
```

### Example prompt skeleton
```
Generate TTS job for: {"text":"...","voicePresetId":"anchor_classic_a"}
Return: {"jobId":"...","status":"ready","artifactUrl":"...","durationMs":4200}
```

## Test Cases / Acceptance Criteria

- Headline derangement guarantees no player receives their own headline
- Broadcast creation accepts media, script, and voice; final submission locks entry
- TTS job is created immediately on final submission
- Prebuffer phase waits for first 2 clips or timeout before starting presentation
- Presentation loop shows media, anchor avatar, headline, script, and plays audio in sequence
- Voting prevents self-vote and tallies correctly; ties are allowed
- Scoreboard reflects participation points + vote points + winner bonus
- TTS failure degrades to captions-only without crashing presentation
- Media failure shows fallback frame and continues with audio
- Room teardown explicitly deletes artifacts; cleanup loop handles missed deletions
- Full server unit suite passes with news broadcast tests included

## Implementation Tasks

1. Add server game plugin with headline submission, derangement, broadcast creation, and voting logic
2. Build phone UI: headline input, media browser, script editor, voice picker, voting buttons
3. Build TV viewer: 2D presentation layout with media region, anchor avatar, lower third, and audio playback
4. Integrate async TTS job creation and polling into game plugin
5. Add TTS priority lane scheduling (blocker / next / background) in game plugin
6. Add prebuffer phase with ready-count wait and timeout
7. Add voice preview playback using static assets
8. Add fallback handling for missing headlines, TTS failures, and media failures
9. Add explicit artifact deletion on room teardown and background cleanup loop
10. Add automated server tests for logic, derangement, TTS polling, voting, and fallback behavior
