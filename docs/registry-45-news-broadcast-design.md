# News Broadcast Design

## Document Status

- **Game title:** News Broadcast
- **Game ID:** `registry-45-news-broadcast`
- **Document purpose:** canonical design and implementation reference
- **Document location:** `docs/registry-45-news-broadcast-design.md`
- **Game plugin path:** `server/src/games/registry-45-news-broadcast/`
- **Registry status:** this is the canonical design document; registry entry lives at `docs/registry/registry-45-news-broadcast.md`

## Summary

News Broadcast is a single-round creative party game where each player writes a news headline, receives another player's headline, then turns it into a full fake news segment by choosing a GIF or short media clip, writing a short script, and selecting a pre-defined anchor voice. After the creation phase, each segment is presented on the shared TV in a stylized newsroom layout. The player's custom icon appears as the anchor avatar, the selected media plays on a newsroom screen, the generated voice reads the headline and script, and the room votes on the best segment.

This feature combines four major systems:

- Server-authoritative party game flow within the existing Gamma plugin architecture
- Reused media search and selection logic based on `registry-26-audio-overlay`
- A TV viewer scene rendered on the shared display (2D layout today, optional 3D newsroom later)
- A queued, CPU-first text-to-speech service built around `OpenMOSS MOSS-TTS-Nano-100M-ONNX`

The most important architectural conclusion in this document is that the TTS system is asynchronous, job-based, and artifact-backed. Speech is not generated synchronously during presentation. Instead, TTS begins as soon as players finalize their entries, continues in the background during the presentation phase, and stores completed audio outside Redis.

## Goals

- Deliver a funny, polished fake-news presentation experience on the shared TV
- Reuse as much proven Gamma infrastructure as possible, especially from `Audio Overlay`
- Keep the TV reveal smooth even on CPU-only or modest Kubernetes deployments
- Make the TTS system work well for both constrained single-node installs and larger multi-worker deployments
- Keep the implementation operationally simple enough to ship incrementally
- Avoid storing generated audio in Redis or keeping all audio in process memory

## Non-Goals

- Real-time streaming conversational TTS
- Per-player custom voice cloning in v1
- Complex facial animation or lip sync in v1
- A fully realistic newsroom art style
- A heavy asset pipeline that depends on large authored 3D scenes for the first implementation

## Alignment With Existing Gamma Architecture

This design is intentionally shaped around the current repository structure and code patterns.

Relevant existing references:

- `server/src/games/BaseGame.ts`
- `server/src/games/gameLoader.ts`
- `server/src/games/registry-26-audio-overlay/index.ts`
- `client/app/src/games/player/AudioOverlay.svelte`
- `client/app/src/games/viewer/AudioOverlayTV.svelte`
- `server/src/schema/PlayerState.ts`
- `client/app/src/components/PlayerIcon.svelte`
- `docs/adr/007-kubernetes-operator-and-redis.md`

Design implications from the current repo:

- New games follow the `BaseGame` plugin model under `server/src/games/registry-XX-slug/`
- Shared replicated room state remains minimal, with private assignments delivered via `room.send()`
- `Audio Overlay` already provides a strong pattern for media browsing, allowed-media validation, submission tracking, and redistribution
- The repo already uses `three` in the client, so a newsroom viewer can be built without adding a new rendering stack
- Player icon data already exists in `PlayerState` and should be reused directly for the anchor face treatment
- The Kubernetes operator is already designed around `Deployment` and `StatefulSet` primitives and has been extended with TTS `Deployment` support

## Game Metadata

| Field | Value |
|---|---|
| Title | `News Broadcast` |
| ID | `registry-45-news-broadcast` |
| `requiresTV` | `true` |
| `supportsBracket` | `false` |
| `defaultRoundCount` | `1` |
| `minRounds` | `1` |
| `maxRounds` | `1` |
| `hasInstructionsPhase` | `true` |
| `instructionsDelivery` | `broadcast` |
| `activityLevel` | `none` |
| `requiresSameRoom` | `true` |
| `requiresSecondaryDisplay` | `true` |

Rationale:

- This is a presentation-first party game, so the TV is part of the core payoff, not a secondary enhancement.
- The flow is naturally a single complete session rather than a repeated score-round loop.
- Phone-only play would lose the central broadcast reveal, so same-room TV play is the intended format.

## High-Level Player Experience

Each player should feel like a comedy producer creating a local news segment under time pressure.

The experience should feel like:

- Serious TV framing applied to ridiculous content
- A fast but understandable creative loop
- A strong reveal moment for each player
- A polished shared-display payoff that justifies the setup

The tone should aim for:

- Local newsroom absurdity
- Dry seriousness applied to nonsense
- Clean, easy-to-follow pacing rather than chaotic overload

## Core Game Loop

The round has two authored phases and one reveal phase.

1. Every player writes a headline.
2. The server redistributes headlines so each player gets a different player's headline.
3. Every player builds a segment around their assigned headline.
4. The TV presents the finished segments one by one.
5. The room votes on the best one.

## Phase Structure

| Phase | Duration | Notes |
|---|---:|---|
| Instructions | 20 to 30s | Explain the format and scoring |
| Headline submission | 60s | Each player writes one headline |
| Redistribution reveal | 4 to 6s | Private assignment delivery plus shared transition |
| Broadcast creation | 180s | Choose media, write script, select voice, submit |
| Buffering intro | 5 to 12s | Wait for the first ready presentations if needed |
| Presentation loop | Up to 30s per player | One segment at a time |
| Voting | 25 to 30s | Vote for best segment, no self-vote |
| Results | 8 to 10s | Winner and scores |

## Detailed Phase Design

### Instructions Phase

The instructions should explain only the essential rules:

- Write a headline.
- You will receive somebody else's headline.
- Build a full fake news report using media, a short script, and a voice.
- Best final segment wins.

The instructions should also explain the creative target:

- Make it sound like a real news story.
- Keep the script short and punchy.
- Think about how the media and voice choice change the joke.

### Headline Submission Phase

Each player submits a single original headline.

Constraints:

| Rule | Recommendation |
|---|---|
| Minimum length | 12 characters |
| Maximum length | 90 characters |
| Minimum words | 2 |
| Preferred format | 5 to 12 words |
| Edit behavior | Free editing until final submit or timeout |

Phone UI contents:

- Single multiline text field or single-line field with wrapping
- Character counter
- Small prompt hint such as `Write a ridiculous but believable news headline`
- Primary submit button

Timeout behavior:

- If the player has draft text, auto-submit the draft.
- If the field is empty, assign a fallback headline from a small curated server-side pool.

### Redistribution Phase

Once all headlines are locked, the server performs a derangement.

Rules:

- No player receives their own headline.
- Every headline is used exactly once.
- Assignments are private.
- The original author is not revealed during the creation phase.

This follows the same core redistribution logic already used in `Audio Overlay`, where no player is assigned their own submitted media.

### Broadcast Creation Phase

This is the main authoring phase. Each player receives their assigned headline and must complete all required fields.

Required tasks:

1. Select a GIF or short clip for the story.
2. Write a short script describing the event.
3. Select a voice preset.
4. Submit the segment.

Input constraints:

| Field | Recommendation |
|---|---|
| Media required | Yes |
| Script max length | 300 to 350 characters |
| Script spoken target | 18 to 20 seconds max |
| Voice required | Yes |
| Final submit behavior | Final and locked |

The recommended design is that `Submit` should finalize the entry. Players may edit freely until they submit, but after submission the entry should lock.

Reasoning:

- Final submission can immediately trigger TTS generation.
- The 3-minute authoring phase becomes free TTS pre-processing time.
- Locked submissions remove cancelation, supersession, and wasted inference work.
- The reveal phase becomes much more reliable on constrained hardware.

Timeout behavior:

- If the player has selected media and entered any script text, auto-submit their draft using a default voice if necessary.
- If they have not selected media, choose a fallback media asset from the available allowed pool.
- If they have no meaningful script, use a small fallback sentence built from the assigned headline.

### Presentation Phase

After all entries are submitted or the timer expires, the game enters a short buffering stage and then presents each segment on the TV.

Per-presentation pacing:

| Segment | Duration | Purpose |
|---|---:|---|
| Broadcast sting | 2s | Establish tone |
| Camera settle and lower third | 2s | Show headline and anchor |
| Spoken segment | 14 to 20s | Headline plus script |
| End hold | 3 to 6s | Let the joke land |

Target total: keep each segment under 30 seconds.

This requirement must drive the text limit and TTS queue design. The spoken payload must be short enough to keep reveals predictable.

### Voting Phase

After all segments are presented:

- Every active player votes for their favorite segment.
- Players cannot vote for themselves.
- One vote per player.
- Ties are allowed.

Scoring:

| Event | Points |
|---|---:|
| Participation | 25 |
| Each vote received | 50 |
| Winner bonus | 100 |

This score shape is consistent with existing Gamma party-game patterns.

## Media System Design

### Reuse Strategy From Audio Overlay

The existing `Audio Overlay` game already provides the most important baseline behaviors needed here:

- GIF search via Klipy
- Allowed-URL tracking and validation
- Secret per-player selection
- Submission progress updates
- Redistribution logic patterns

The `News Broadcast` game reuses that logic and upgrades it for presentation playback.

### Media Search and Selection Requirements

Phone-side browsing should feel similar to `Audio Overlay`, but with slightly different selection criteria.

Selection goals:

- Fast browsing on phones
- Safe server-side validation of allowed media
- Cleaner playback on the viewer screen
- Flexibility to support both GIF and video-backed assets

### Normalized Media Object

| Field | Purpose |
|---|---|
| `provider` | Source provider, such as `klipy` |
| `providerAssetId` | Provider asset identifier if available |
| `label` | Human-readable title |
| `previewUrl` | Lightweight preview for phone browsing |
| `playbackUrl` | Preferred URL for viewer playback |
| `fallbackImageUrl` | Static image fallback |
| `mimeType` | Playback decision support |
| `width` | Optional media layout support |
| `height` | Optional media layout support |
| `durationMs` | Optional if provider exposes it |

### Prefer Video Variants Over Raw GIF Playback

The viewer presentation should prefer video variants such as MP4 or WebM when the provider exposes them.

Reasons:

- GIFs are larger and less efficient than video for playback
- Browser video elements are better optimized
- Video is easier to preload, pause, and synchronize
- Mapping video to a 3D screen is cleaner than using animated GIFs as textures

Media policy:

- Browsing can show GIF or WebP style previews.
- The final presentation should prefer video playback URLs.
- If no video variant is available, fall back to a DOM-based GIF presentation path.

### Mirroring Media Assets

Best long-term design:

- Mirror selected presentation media into short-lived internal storage if provider terms allow it.

Benefits:

- Reduced risk of provider hotlink failure during live reveals
- Better caching and MIME control
- Cleaner viewer-side behavior
- Less reliance on third-party uptime during presentations

If mirroring is not allowed, the server must still strictly validate that the selected URL came from an allowed server-issued result set.

### Viewer Playback Strategy

Preferred presentation implementation:

- Use a real `HTMLVideoElement` for the newsroom screen content
- Either map it to a `VideoTexture` in `three` or overlay it as a positioned DOM element that matches the screen mesh region

Fallback implementation:

- If the selected media is GIF-only, overlay a DOM image or GIF layer over the TV screen region

This document does not recommend a raw GIF texture pipeline as the main solution.

## Viewer Design

### Rendering Approach

The recommended v1 approach is a polished 2D broadcast layout, not a large authored GLB scene.

Reasons:

- The 2D layout is reliable, fast, and easy to iterate
- Procedural primitives keep the bundle and asset pipeline small
- Existing repo history already shows deployment sensitivity around 3D asset loading
- A 2D layout is easier to tweak in code during the first implementation

A 3D newsroom viewer may be added later once the reveal loop is stable.

### Scene Contents

The viewer should contain:

- Media playback region (video or image)
- Anchor avatar card (player icon)
- Lower third text band with headline and script
- Voice preset badge
- Segment progress indicator
- Optional `breaking news` bug or station badge

### Player Icon as Anchor Avatar

The current `PlayerState` already includes:

- `iconEmoji`
- `iconText`
- `iconBgColor`
- `iconDesign`

Those should be reused directly.

Recommended approach:

- Render the existing player icon into a square texture or offscreen canvas
- Display it prominently in the anchor card region
- Keep the icon visible at all times during the presentation

Benefits:

- No new avatar system is required
- The result stays consistent with the rest of Gamma
- The comedic identity of each segment becomes immediately recognizable

### Camera Composition

The TV framing should be fixed and cinematic.

Recommended layout:

| Element | Screen area recommendation |
|---|---|
| Anchor avatar | Left 25 to 35 percent |
| Newsroom screen | Right 40 to 50 percent |
| Lower third | Bottom 15 to 18 percent |
| Safe area | Preserve top-left space if room code overlay still exists |

The anchor should remain visible during the entire segment, even while the screen media is active.

### Fallback Viewer Mode

The game must still work if WebGL fails or `three` initialization breaks.

Required fallback:

- 2D broadcast layout with anchor card, media region, lower third, and audio playback

The 3D scene is a presentation enhancement, not a hard correctness dependency.

## Text and Script Design

### Spoken Payload Shape

The spoken script should be assembled in a simple, deterministic way:

`headline + short pause + script`

The design should avoid long auto-generated intros in v1.

Reasons:

- Keeps timing predictable
- Keeps the player's own writing central
- Reduces synthesis time
- Simplifies queue behavior and presentation timing

### Text Cleanup Rules

Before TTS submission, normalize text server-side:

- Trim outer whitespace
- Collapse repeated internal spaces
- Limit repeated punctuation
- Remove unsupported emoji from spoken text
- Ensure the headline ends as a sentence
- Ensure the script ends cleanly
- Reject or truncate text that exceeds the spoken time budget

### Length Control Strategy

This game will only feel smooth if the text-to-speech duration is strongly bounded.

Recommended design:

- Estimate spoken time on submit
- Hard limit the script so speech stays at or below 18 to 20 seconds
- Prefer rejection with clear feedback over silently producing very long clips

Suggested UX feedback:

- Show a rough `estimated speech time` indicator as the player types
- Warn when the text is too long to fit the broadcast slot

## Server State and Messaging Design

### Public Versus Private Data

The design follows the existing Gamma pattern where public replicated state is minimal and private assignments are sent via direct messages.

Public replicated state should include:

- Current phase
- Phase start timestamp
- Current presentation index
- Ready counts
- Vote counts
- Final result data

Private per-player messages should include:

- Assigned headline
- Personal draft confirmation
- Personal selected voice confirmation if needed

### Internal Session Objects

| Object | Purpose |
|---|---|
| `headlineSubmissions` | Original player-authored headlines |
| `headlineAssignments` | Private player-to-headline mapping |
| `broadcastSubmissions` | Final per-player segment packages |
| `presentationOrder` | Ordered reveal list |
| `presentationAssets` | Media refs and TTS refs for reveals |
| `votes` | Voter to target mapping |
| `ttsJobs` | Tracking of synthesis job state |
| `mediaMirrorJobs` | Optional tracking for mirrored selected media |

### Final Broadcast Submission Shape

| Field | Purpose |
|---|---|
| `playerId` | Final segment author |
| `assignedHeadline` | The shuffled headline they received |
| `script` | News script body |
| `voicePresetId` | Selected anchor voice |
| `selectedMedia` | Normalized media object |
| `submittedAt` | Audit and ordering |
| `estimatedSpeechMs` | Queue planning and validation |

### Game Messages

| Message | Direction | Visibility | Purpose |
|---|---|---|---|
| `headline_submission_start` | server to clients | all | Start headline phase |
| `headline_submission_update` | server to clients | all | Ready count |
| `headline_assigned` | server to player | private | Deliver assigned headline |
| `broadcast_creation_start` | server to clients | all | Start 3-minute authoring phase |
| `gif_search_results` | server to player | private | Media search results |
| `broadcast_submission_confirmed` | server to player | private | Final submission accepted |
| `broadcast_submission_update` | server to clients | all | Submission progress count |
| `broadcast_buffering_start` | server to clients | all | Buffering before reveals |
| `presentation_prepare` | server to clients | all | `Up next` transition |
| `presentation_start` | server to clients | all | Start the current reveal |
| `presentation_end` | server to clients | all | End transition |
| `voting_start` | server to clients | all | Start voting |
| `vote_confirmed` | server to player | private | Vote accepted |
| `vote_count_update` | server to clients | all | Vote progress |
| `round_result` | server to clients | all | Winner and score breakdown |

## TTS Architecture

### Model Choice

The strongest fit for this game is `OpenMOSS-Team/MOSS-TTS-Nano-100M-ONNX`.

Research findings that matter for this project:

- `MOSS-TTS-Nano` is a 0.1B multilingual TTS model designed for lightweight deployment
- The upstream project now strongly recommends the ONNX CPU path for lightweight local and service deployments
- The ONNX release is explicitly built for CPU and browser-oriented runtime usage
- The upstream ONNX path claims roughly 2x better efficiency than the original non-ONNX inference path
- The runtime supports built-in voices and direct reference-audio voice cloning
- The runtime supports streaming, but streaming is not required for this game design

This makes the ONNX CPU version the correct default backend for Gamma's deployment constraints.

### TTS Product Strategy

Use the model in preset voice mode only for v1.

Recommended v1 TTS characteristics:

- ONNX CPU backend
- Pre-defined anchor voices only
- Full clip generation, not live streaming
- Asynchronous job queue
- Background generation as soon as player entries finalize
- Artifact storage outside Redis

Recommended v1 exclusions:

- Player-uploaded reference-audio cloning
- Per-room custom voice training or fine-tuning
- Streaming speech to the client while the sentence is still generating

### Why Preset Voices Are Better Than Custom Cloning Here

Although the upstream runtime can use direct prompt audio, preset voices are a better fit for this game's operational and UX requirements.

Preset voices provide:

- Predictable latency
- Stable audio quality
- Lower compute cost per request
- Simpler UI for players
- Easier moderation and legal review
- Easier benchmarking on constrained hardware

### Voice Library Size

Start with 6 to 8 curated preset anchor voices.

That is enough to create meaningful variety without cluttering the creation screen.

Suggested player-facing voice set:

| Internal ID | Player Label | Intended Tone |
|---|---|---|
| `anchor_classic_a` | Classic Anchor | Formal nightly news |
| `anchor_classic_b` | Veteran Anchor | Older and steady |
| `anchor_local_fast` | Local Reporter | Fast and energetic |
| `anchor_tabloid` | Tabloid Host | Dramatic and urgent |
| `anchor_calm_night` | Overnight Desk | Calm and dry |
| `anchor_breaking` | Breaking News | High urgency |
| `anchor_morning` | Morning Show | Lighter delivery |
| `anchor_deadpan` | Deadpan Desk | Flat comedic contrast |

### Voice Asset Strategy

Two implementation strategies are acceptable.

Strategy A:

- Use the built-in voice presets exposed by the upstream ONNX runtime and map them to internal product IDs.

Strategy B:

- Build a product-controlled voice pack offline by storing prompt audio or encoded prompt audio codes for a curated set of reference voices.

Recommended long-term choice: Strategy B.

Why Strategy B is better long-term:

- Better product control
- Stable voice naming independent of upstream changes
- Easier versioning of the voice pack
- Can avoid runtime prompt encoding on the hot path if codes are precomputed

### Voice Preview Design

Voice previews should not use the live TTS queue.

Recommended preview design:

- Pre-generate a short fixed preview clip for each voice
- Store previews as static assets
- Let players tap a voice card to hear a preview instantly

This avoids flooding the TTS system during the creation phase and keeps preview UX responsive.

### Why Full Clip Generation Is Better Than Streaming Here

The model supports streaming, but the core game reveal should not depend on streaming inference.

Full clip generation is better because it gives:

- Predictable clip duration before reveal
- Easy preload behavior for the TV client
- Cacheability and artifact reuse
- Easier retry and failure recovery
- Less playback complexity during the most visible part of the game

Streaming may still be useful for future tools or admin demos, but it should not be the primary reveal strategy in v1.

### Service Split

Use two logical services.

| Service | Responsibility |
|---|---|
| `tts-api` | Validate requests, check cache, create jobs, return status, expose voice list |
| `tts-worker` | Load model, synthesize speech, post-process audio, store artifact |

### Small Deployment Mode

For a single-node or constrained install:

- `tts-api` and `tts-worker` may run in the same pod or even the same process
- Worker concurrency should remain at 1

### Larger Deployment Mode

For scale:

- Keep `tts-api` lightweight and stateless
- Run one or more `tts-worker` replicas separately
- Scale worker count horizontally rather than increasing per-worker concurrency early

### Deployment Primitive Choice

Use Kubernetes `Deployment` for both API and worker.

Recommended default:

- `Deployment` for `tts-api`
- `Deployment` for `tts-worker`

Do not use `StatefulSet` by default.

Reasoning:

- TTS workers are logically stateless
- Stable pod identity is not required
- Failed workers should be freely replaceable
- Rolling updates are easier
- Horizontal scaling is simpler

`StatefulSet` would only make sense if you deliberately wanted a single appliance-like pod with local persistent model cache semantics. That is not the right default architecture.

### Internal Call Flow

Recommended internal flow:

1. Gamma server receives a finalized player submission.
2. Gamma server submits an async TTS request to `tts-api`.
3. `tts-api` validates text length and voice, checks cache, and enqueues a job if needed.
4. `tts-worker` claims the job from Redis-backed queue metadata.
5. The worker runs inference, post-processes the audio, and stores the artifact.
6. Gamma server observes job readiness by polling or completion notification.
7. During reveal, the server broadcasts an artifact reference rather than raw audio bytes.

Clients should never talk directly to the worker.

### Queue System Design

#### Redis Role

Redis should be used for:

- Queue metadata
- Scheduling lanes
- Job status
- Lease management
- TTL tracking
- Optional completion notifications

Redis should not be used to store generated audio blobs.

#### Why Plain FIFO Is Not Enough

The right scheduling behavior is not global first-in-first-out.

The game needs priority based on live reveal blocking risk.

Correct priority principle:

- Jobs needed for the next reveal should go first
- Jobs for the current active room should move forward in reveal order
- One room should not be able to monopolize the entire worker pool

#### Queue Lane Model

Use three scheduling lanes:

| Lane | Purpose |
|---|---|
| `blocker` | A job that must be ready immediately for the next reveal |
| `next` | A job likely needed soon in the current room |
| `background` | Useful work that is not immediately reveal-blocking |

#### Per-Room Priority Cap

Each room should be allowed only a small number of elevated jobs at once.

Recommended rule:

- No more than 2 high-priority jobs per room at a time

Benefits:

- Prevents a single 8-player room from starving other active rooms
- Still lets the next reveal items get prepared in time
- Preserves fairness without making scheduling too complex

#### Queue Behavior Across The Game Timeline

During the 3-minute creation phase:

- As soon as a player presses final submit, Gamma should create the TTS job immediately.
- These jobs usually enter `background` unless reveal order is already known and urgency is obvious.

Once all submissions are locked and presentation order is known:

- The first unready presentation should move to `blocker`.
- The second unready presentation should move to `blocker` or `next`.
- Remaining jobs should stay in `background` unless workers are idle.

During live presentation:

- While presentation `N` is playing, `N+1` should be treated as `blocker`.
- `N+2` should be treated as `next`.
- Later items may remain `background`.

This takes advantage of the fact that the reveal phase itself provides free synthesis time for subsequent segments.

#### Required Prebuffer Rule

The game should not start the presentation loop immediately when the creation phase ends.

Recommended buffering policy:

- Enter a short `broadcast buffering` phase
- Wait until the first 2 presentation assets are ready, or until a maximum timeout is reached

Recommended defaults:

| Setting | Recommendation |
|---|---|
| Target ready count before reveal | 2 presentations |
| Maximum prebuffer timeout | 12s |

This is one of the most important smoothness controls in the whole design.

#### Job Lifecycle

Recommended job states:

| State | Meaning |
|---|---|
| `queued` | Waiting in a scheduling lane |
| `leased` | Claimed by a worker |
| `processing` | Inference is active |
| `postprocessing` | Audio normalization, transcode, and storage write |
| `ready` | Artifact available for use |
| `failed_retryable` | Temporary failure, will retry |
| `failed_final` | Retries exhausted |
| `expired` | Artifact cleaned up |

#### Lease and Retry Design

Recommended worker lease behavior:

- Worker claims a job with a lease TTL
- Worker heartbeats while processing
- If the worker crashes or stalls, the lease expires and the job becomes available again
- Retries use bounded backoff with jitter

Recommended defaults:

| Setting | Recommendation |
|---|---|
| Lease TTL | 90 to 120s |
| Heartbeat interval | 5s |
| Max retries | 3 |
| Retry backoff | Exponential plus jitter |

#### Cache Design

Use content-addressed cache semantics.

Recommended cache key inputs:

- Normalized spoken text
- Voice preset ID
- Locale
- TTS model version
- Post-processing version

Cache reuse is especially valuable for:

- Voice preview clips
- Exact retry cases
- Repeated debugging and replay flows

### Storage Design

#### Hard Rule: Do Not Store Audio In Redis

Generated audio should not be stored in Redis.

Reasons:

- Bad memory efficiency
- Increased eviction risk
- Poor fit for multi-client artifact access
- No long-term scaling benefit

Redis should hold metadata, not binary speech payloads.

#### Recommended Artifact Backends

Use a pluggable artifact storage backend.

For small deployments:

- Shared or local filesystem-backed storage

For larger deployments:

- S3-compatible object storage such as S3 or MinIO

#### Storage Path Shape

Recommended path structure:

`news-broadcast/<roomId>/<roundId>/<playerId>/<jobId>/final.mp3`

Recommended stored metadata:

- Duration
- MIME type
- Created timestamp
- Expiration timestamp
- Content hash
- Voice preset ID
- TTS model version

#### Artifact Lifetime

Generated artifacts should be short-lived.

Recommended default retention:

- Expire 2 hours after room completion

This is long enough for reconnects, delayed playback, and limited debugging, while keeping storage pressure low.

#### Memory Use Policy

Only the minimum needed playback artifacts should stay warm in memory during reveal.

Recommended memory policy:

- Current presentation clip may be preloaded in memory
- Next presentation clip may be preloaded in memory
- All other clips should remain file- or object-backed until needed

This directly addresses the requirement to avoid memory-only audio retention.

### Audio Post-Processing

#### Generation Format

The upstream model produces native 48 kHz stereo audio.

Recommended internal flow:

- Generate in the model's native format first
- Then post-process for delivery

#### Delivery Format

Recommended v1 delivery artifact:

- `mp3`
- Mono
- Speech-friendly bitrate

Reasons:

- Broad browser compatibility
- Much smaller than WAV
- Good enough quality for comedic speech playback

If future optimization is needed, an Opus path can be added later.

#### Loudness Normalization

Post-process each clip so different voices feel broadly consistent.

Goals:

- Avoid extreme loudness differences between presets
- Avoid clipping
- Keep segments sounding broadcast-ready even though they are synthetic

### API Contract

The TTS layer should expose job-oriented internal endpoints rather than only a synchronous `text in, audio out` API.

Recommended endpoints:

| Endpoint | Purpose |
|---|---|
| `POST /tts/jobs` | Submit async synthesis request |
| `GET /tts/jobs/{jobId}` | Query job status |
| `GET /tts/jobs/{jobId}/artifact` | Fetch or redirect to stored artifact |
| `GET /tts/voices` | List allowed voice presets |
| `GET /healthz` | Liveness probe |
| `GET /readyz` | Readiness after model warmup |
| `GET /metrics` | Prometheus-style metrics |

Behavior of `POST /tts/jobs`:

- Validate text length, locale, and voice ID
- Normalize text
- Compute cache key
- If cached artifact exists, return that result immediately
- Otherwise create a job and return `jobId`

Recommended gameplay policy:

- Gamma uses the async path only
- A synchronous path may exist for admin or debug tooling, but not for live room flow

### Text Normalization Strategy

The upstream project includes optional text normalization paths that can pull in heavier dependencies.

Recommended v1 strategy for this game:

- English-focused normalization only
- Lightweight deterministic cleanup in Gamma or the TTS API layer
- Avoid operational dependence on heavier multilingual normalization tooling unless multilingual gameplay is truly needed at launch

This keeps the deployment smaller and easier to operate.

## Kubernetes Deployment Plan

### Model Asset Delivery

Production pods should not rely on first-request model downloads.

Recommended pattern:

- Use an init container or pre-seeded model volume to fetch model assets before startup
- Warm the model during startup
- Only report readiness after successful warmup

This reduces cold-start risk during active room play.

### Worker Sizing Guidance

Start conservatively and benchmark on the real target hardware.

Suggested starting points:

| Profile | Worker replicas | CPU | Memory | Worker concurrency |
|---|---|---:|---:|---:|
| Dev or single node | 1 | 2 to 4 vCPU | 4 to 6 GiB | 1 |
| Small production | 2 | 4 vCPU | 6 to 8 GiB | 1 |
| Larger production | Horizontal scaling | 4 to 8 vCPU | 8+ GiB | 1 |

Important default:

- Keep concurrency at 1 per worker until real benchmarks prove a higher value is safe and beneficial.

### Thread Tuning Guidance

The ONNX worker should be benchmarked with different thread counts such as 1, 2, and 4.

Do not assume that a higher thread count automatically improves room-level throughput. In many cases, one active job per worker with a fixed thread count produces more predictable latency than trying to run many jobs concurrently inside one worker.

### Redis Deployment Guidance

For small deployments:

- The existing Redis instance may be reused with strict key prefixing and queue isolation discipline.

For larger deployments:

- Prefer a dedicated queue-oriented Redis deployment or instance for TTS job metadata.

Reason:

- Gamma room state is core gameplay infrastructure and should not compete with bursty TTS queue traffic if scale grows.

## Performance Budgets

### Viewer Performance Targets

| Target | Recommendation |
|---|---|
| Desktop or TV-class browser | 60 fps target |
| Lower-end integrated GPU | 30 fps acceptable |
| WebGL fallback | Required |
| Scene asset footprint | Keep very small |

### TTS Performance Targets

The exact values must be validated on real hardware, but the design should target:

- Warm worker startup before room use
- First 2 presentation clips ready by the end of the buffer stage in normal room sizes
- Most later clips synthesized during earlier reveal playback windows

The reveal pacing itself provides slack, so the main risk is cold start or an unready first clip. That is why the prebuffer phase is mandatory.

## Failure Modes And Recovery

### TTS Slow Or Not Ready In Time

If the next segment is not ready:

- Stay in the transition bumper for a short grace window
- If still not ready, either keep waiting or fall back based on implementation policy

Recommended v1 behavior:

- Preserve fixed presentation order
- Allow a short extra wait if the next item is nearly ready
- Do not introduce dynamic reordering unless load testing proves it is necessary

### Worker Crash Mid-Job

Recovery path:

- Lease expires
- Job returns to queue
- Another worker may claim it

### Artifact Storage Failure

Recovery path:

- Mark the job as retryable
- Retry post-processing and storage write
- Do not broadcast incomplete artifact references

### Provider Media Failure During Reveal

If media fails to load during reveal:

- Show a `technical difficulties` or fallback frame in the newsroom screen region
- Continue the segment if audio is ready
- Do not stall the room indefinitely on third-party media failure

### Final TTS Failure

Recommended tiered fallback:

1. Retry the same job
2. Retry with a known-safe default anchor voice
3. Present a captions-only or no-audio fallback if all retries fail

The room must continue even if a single segment degrades.

## Observability Requirements

The TTS system should expose metrics that are useful both for gameplay quality and operations.

Recommended metrics:

- Job queue depth by lane
- Job wait time by lane
- Synthesis duration
- Post-processing duration
- Artifact size
- Cache hit rate
- Worker ready count
- Retry count
- Failure count by reason
- First reveal buffer wait time
- Count of rooms entering buffering with fewer than 2 ready clips

Recommended logs:

- Job creation
- Cache hit or miss
- Lease claim and release
- Voice preset used
- Text length and estimated speech duration
- Artifact path and final duration
- Failure reason with retry decision

## Security And Abuse Considerations

Although this is an internal game feature, the design should still account for basic misuse resistance.

Recommended controls:

- Strict text length limits
- Input sanitation and normalization
- Allowed-media validation from server-issued search results only
- TTL cleanup for generated artifacts
- No public client access to worker internals
- Internal-only TTS endpoints where possible
- Artifact URLs should be scoped or short-lived if external object storage is used

## Acceptance Criteria

An implementation based on this design should satisfy all of the following:

- No player ever receives their own headline.
- The TV viewer is a required and central part of the experience.
- Players can complete all authoring steps entirely from their phones.
- Media search and validation reuse the proven `Audio Overlay` search pattern.
- The viewer presents each segment in a newsroom scene or a reliable 2D fallback.
- The player's custom icon is visible as the anchor face.
- TTS jobs begin when entries are finalized, not only when reveal begins.
- The reveal phase buffers until at least the first 2 segments are ready or timeout is reached.
- Later reveal clips can be generated while earlier clips are presenting.
- Generated audio is never sent as large base64 payloads over Colyseus.
- Generated audio is not stored in Redis.
- Generated artifacts expire automatically after their retention window.
- Worker failure does not permanently lose queued jobs.
- The TTS system can run on CPU-only Kubernetes nodes.
- The deployment can scale horizontally by adding worker replicas without redesigning the API.

## Final Recommendation

If only one TTS recommendation is carried forward from this document, it should be this:

Use `MOSS-TTS-Nano-100M-ONNX` in a separate internal TTS service, run it on CPU with worker concurrency set to 1, use curated preset anchor voices only, enqueue synthesis as soon as players finalize their segments, schedule jobs with `blocker`, `next`, and `background` lanes in Redis, and store the resulting audio as short-lived filesystem or object-storage artifacts rather than in Redis or process memory.

That architecture is the best fit for the current Gamma stack, the hardware-constrained deployment target, and future larger-scale operation.

## Open Questions For Later Refinement

These do not block the design direction, but they should be finalized before implementation begins:

- What exact presentation order rule should be used: submit order, random order, or seeded random order?
- Should selected media be mirrored into internal storage or left as provider-hosted assets?
- How many voice presets should launch in v1: 6 or 8?
- Should the game be English-only at launch or expose multilingual voices immediately?
- Should failed media playback still allow a segment to remain eligible for voting if the TTS succeeds?
- Should reveal order remain fixed even when a later segment is ready first, or should dynamic skipping ever be allowed?

## Implementation History

- **Phase 1:** Core game flow built without 3D — headline submission, redistribution, media selection, script writing, voice selection, final submission lock, async TTS integration, 2D reveal shell, voting and results.
- **Phase 2:** TTS service implemented — Go `tts-api` with Gin, Python `tts-worker` with vendored MOSS-TTS-Nano ONNX runtime, MinIO S3-compatible artifact storage, explicit room artifact deletion on teardown, 2-hour backup cleanup loop.
- **Phase 3:** Operator and deployment wiring — TTS spec/status added to `GammaInstance` CRD, ingress routes `/api/tts` to Gamma server proxy, k8s examples updated, Helm chart validated.
- **Phase 4 (future):** 3D newsroom viewer — procedural low poly geometry, anchor body, player icon face plate, screen media playback region, lower third graphics, idle animations and camera motion, 2D fallback path retained.
