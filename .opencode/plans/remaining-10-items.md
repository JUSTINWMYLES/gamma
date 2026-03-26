# Remaining 10 Items — Implementation Plan

## 1. Audio Overlay: Category Selection Revamp

### Server (`server/src/games/registry-26-audio-overlay/index.ts`)

**Replace `GIF_POOL` with categorized pools:**
- Define `GifCategory` type: `"evil_laughs" | "animals" | "vehicles" | "yells" | "dance" | "sports" | "any"`
- Define `CategoryInfo` interface: `{ id, name, icon, description }`
- Create `CATEGORIES` array with 7 entries
- Create `CATEGORY_GIF_POOLS: Record<string, GifEntry[]>` — move existing 30 villain GIFs into `evil_laughs`, add ~20 GIFs each for animals, vehicles, yells, dance, sports
- Modify `getGifPool(category)` to look up from the map; "any" combines all pools shuffled and capped at 30
- Add `CATEGORY_SELECTION_DURATION_MS = 30_000`

**Add to `SessionData`:**
- `categoryChooserId: string` — randomly selected player
- `chosenCategory: GifCategory | null`
- `categoryResolve: (() => void) | null` — to unblock wait

**New phase in `runRound()` — insert BEFORE Phase 1 (GIF Selection):**
```
Phase 0: CATEGORY_SELECTION (30s)
1. Pick random active player as chooser
2. Broadcast "category_selection_start" { chooserId, chooserName, categories: CategoryInfo[], durationMs, serverTimestamp }
3. Wait for category choice or timeout (auto-pick random on timeout)
4. Broadcast "category_chosen" { category: CategoryInfo, chooserName }
5. Wait 3 seconds for reveal animation
6. Proceed to Phase 1 with getGifPool(chosenCategory)
```

**New input handler:**
- `{ action: "select_category", category: string }` — only accepted from chooserId, validates against CATEGORIES, resolves wait

**Modify Phase 1:** Change `const gifPool = getGifPool()` to `const gifPool = getGifPool(this.session.chosenCategory ?? "any")`

### Player Client (`client/app/src/games/player/AudioOverlay.svelte`)

**New sub-phases:** Add `"category_choosing"` and `"category_waiting"` to SubPhase type

**New state variables:**
- `categories: CategoryInfo[]`
- `categoryChooserId: string`
- `categoryChooserName: string`
- `categoryTimeLeft: number`
- `chosenCategory: CategoryInfo | null`
- `amCategoryChooser: boolean`

**New message handlers:**
- `onCategorySelectionStart` → sets sub-phase to `category_choosing` (if me) or `category_waiting` (if not), starts timer
- `onCategoryChosen` → shows brief reveal with category name + icon, then transitions to existing gif_browsing flow

**New UI blocks:**
- `category_choosing`: Grid of category cards (icon + name + description), tap to select, timer shown
- `category_waiting`: "PlayerName is picking the category..." with animated dots, timer, list of available categories shown dimmed

### TV Client (`client/app/src/games/viewer/AudioOverlayTV.svelte`)

**New sub-phase:** `"category_selection"` and brief `"category_reveal"`

**New message handlers:** Same as player but display-only

**New UI:**
- `category_selection`: "PlayerName is choosing the theme!" with large animated display of all category options, timer
- `category_reveal`: Big animated reveal of chosen category (2-3s), then transition to existing gif_selection

---

## 2. Hot Potato: Complete Redesign

### Server (`server/src/games/registry-07-hot-potato/index.ts`)

**Core concept change:** One DEVICE is the potato. The holder's phone shows who to physically pass to. The target taps "Accept" on their phone to confirm receipt.

**Modified `RoundState`:**
- Keep `holderId`, `targetId`, `passCounts`, `timer`
- Add `acceptDeadlines: Map<string, number>` — track how long each person takes to accept
- Add `passChain: { from: string, to: string, acceptTime: number }[]`

**Modified round flow:**
1. Timer starts (same escalating timer)
2. Random player selected as initial holder
3. Server sends `potato_assigned` to holder with target info
4. Holder physically passes phone and presses "Pass"
5. Server sends `potato_incoming` to target
6. Target presses "Accept" on their phone
7. Server logs accept time, picks new target, sends new `potato_assigned`
8. When timer expires, whoever is holding gets -50 points
9. Voting phase: "Who do you think unfairly delayed accepting?" — voted player loses 25 points

**Key messages:**
- `potato_assigned { targetName, targetId, timeRemaining }` — to holder
- `potato_incoming { fromName, fromId }` — to target
- `potato_accepted { newHolderId }` — broadcast
- `potato_exploded { holderId, holderName }` — broadcast
- `delay_voting_start { players[], durationMs }` — broadcast
- `delay_vote_result { penalizedPlayer, voteCount }` — broadcast

### Player Client (`client/app/src/games/player/HotPotato.svelte`)

Complete rewrite of sub-phases:
- `waiting` — not holding, not target, watching TV
- `holding` — "Pass to [NAME]!" with big pass button, timer visible
- `incoming` — "[NAME] is passing to you!" with big "Accept" button
- `exploded` — shows who was holding when it blew
- `voting` — "Who delayed unfairly?" vote list
- `results` — scores

### TV Client (`client/app/src/games/viewer/HotPotatoTV.svelte`)

Shows the potato chain in real-time: who has it, who's next, timer, pass history. Explosion animation when timer runs out.

---

## 3. Marketplace: Fix Results Review

### Server (`server/src/games/registry-25-lowball-marketplace/index.ts`)

- Increase `RESULTS_DISPLAY_MS` from 6000 to 15000 (classic mode)
- Increase funny messages results from 8000 to 15000
- In `_runClassicRound()` results broadcast, include full item details: `{ name, description, category, askingPrice, reservePrice, imageHint }` alongside existing bid data
- In funny messages results, include full listing + all user responses

### Player Client (`client/app/src/games/player/LowballMarketplace.svelte`)

- In results sub-phase for classic: show full listing card (title, description, category, asking price, reserve price) + bid table
- For funny messages: show full listing + each player's message, scrollable

### TV Client (`client/app/src/games/viewer/LowballMarketplaceTV.svelte`)

- Classic results: full listing card on left, ranked bids on right, animated reveal of winner
- Funny messages results: full listing displayed, then scroll through each player's message with reactions

---

## 4. Marketplace: Dynamic Characteristic-Based Pricing

### Server (`server/src/games/registry-25-lowball-marketplace/index.ts`)

**Replace `reserveFraction` with characteristics system:**

```typescript
interface ItemCharacteristic {
  label: string;        // e.g. "Condition", "Brand", "Rarity"
  value: string;        // e.g. "Mint", "Generic", "Common"  
  priceMultiplier: number; // e.g. 1.2, 0.5, 0.8
}

interface MarketItem {
  name: string;
  description: string;
  category: string;
  basePrice: number;           // Replaces askingPrice
  characteristics: ItemCharacteristic[];
  imageHint: string;
}
```

**Reserve price = `basePrice * product(all characteristic multipliers)`**

Example: "Vintage Lamp" with basePrice $200
- Condition: "Scratched" (0.6) → $120
- Brand: "Designer" (1.5) → $180  
- Rarity: "Uncommon" (1.3) → $234
- Final reserve = $234

Players see the characteristics displayed and must reason about the price. This gives them information to work with rather than blind guessing.

**Asking price** = `reservePrice * (1.3 to 2.0 random markup)` — seller always asks more than reserve

Migrate all 80 existing items to new format.

---

## 5. Marketplace: Generate 100 More Items

Add 100 new items to `ITEM_CATALOGUE` following the existing humorous/quirky style. Categories should span: Electronics, Furniture, Clothing, Collectibles, Vehicles, Sporting Goods, Kitchen, Art, Musical Instruments, Weird/Funny. Each item gets 2-4 characteristics for dynamic pricing.

---

## 6. Sound Replication: Real Audio Analysis

### Server (`server/src/games/registry-06-sound-replication/index.ts`)

**Replace `_computeScores()` entirely:**

1. Decode WebM/Opus base64 to raw PCM using `@ffmpeg/ffmpeg` WASM or a Node native module like `fluent-ffmpeg`/`opusscript`
2. Extract amplitude envelope from PCM (RMS over windowed frames)
3. Compare target features vs user recording:
   - **Duration similarity** (20%): ratio of durations
   - **Amplitude envelope correlation** (40%): Pearson correlation of RMS envelopes after resampling to same length
   - **Spectral centroid similarity** (20%): compare brightness of sound
   - **Zero-crossing rate similarity** (20%): compare noisiness/tonality
4. Score = weighted sum, scaled 0-100

**Alternative simpler approach** (if ffmpeg dependency is too heavy):
- Use the Web Audio API on the CLIENT side to extract features before sending
- Client sends `{ audioBase64, features: { rmsEnvelope: number[], duration: number, zeroCrossingRate: number } }`
- Server compares feature vectors directly (no decoding needed)

The client-side approach is likely better since browsers already have Web Audio API with AnalyserNode.

---

## 7. Sound Replication: Visualization + Delay Compensation

### Player Client (`client/app/src/games/player/SoundReplication.svelte`)

- After recording, show side-by-side amplitude waveforms: target (from pre-computed features) vs recording (from Web Audio API AnalyserNode during recording)
- Use canvas or SVG bars for visualization
- Add a horizontal slider for delay offset: user can drag their waveform left/right to align with target
- The offset value is sent to server with the recording submission

### TV Client (`client/app/src/games/viewer/SoundReplicationTV.svelte`)

- Replace fake random bars with real amplitude visualization
- During scoring reveal, show overlaid waveforms (target vs recording) for each player

---

## 8. Instructions: Slide-Based Presentation Revamp

### Create shared instruction data (`client/shared/instructionSlides.ts`)

```typescript
interface InstructionSlide {
  heading: string;
  body: string;
  bgColor: string;      // Tailwind gradient or solid
  textColor: string;
  fontFamily: string;    // e.g. "font-mono", "font-serif", etc.
  icon?: string;         // optional emoji or icon key
  audioPlaceholder?: string; // future narration hook
}

const GAME_INSTRUCTIONS: Record<string, InstructionSlide[]> = { ... };
```

Define 3-5 slides per game with varied visual styles.

### Components

Create `InstructionSlideshow.svelte`:
- Full-screen slide display with crossfade/slide transitions
- Auto-advance with configurable timing (3-5s per slide)
- Progress dots at bottom
- "Got it!" button appears on final slide (or always visible)
- Each slide has different colors/fonts per the data

### Update all instruction screens

Replace the `{#if}` chain in:
- `client/app/src/screens/player/InstructionsScreen.svelte`
- `client/app/src/screens/viewer/InstructionsScreen.svelte`  
- `client/phone/src/screens/InstructionsScreen.svelte`
- `client/tv/src/screens/InstructionsScreen.svelte`

All import from shared data and use `InstructionSlideshow.svelte`.

---

## 9. Player Icon/Character Customization

### Server

**Add to `PlayerState` schema:**
- `iconEmoji: string` (default "")
- `iconText: string` (default "")
- `iconBgColor: string` (default "")

**Add message handler in `GammaRoom.ts`:**
- `"customize_player"` → validates + sets the 3 fields on PlayerState

### Player Client

**New component `PlayerCustomizer.svelte`:**
- Shows in lobby after joining, before game starts
- Circle preview of your icon
- Emoji picker (common emoji grid)
- Text field (1-3 characters, like initials)
- Color picker (8-12 preset bg colors)
- "Done" button sends `customize_player` message

**Update lobby screens:**
- Show player icons next to names in player list
- Use icon in game cards, scoreboards, etc.

---

## 10. Bracket System: Multi-Format Design

### Server (`server/src/utils/bracket.ts`)

**Redesign bracket builder for flexible match sizes:**

```typescript
interface BracketConfig {
  playerCount: number;
  maxPlayersPerHeat: number;  // 2 for 1v1, up to 4 for multi-player
  advanceCount: number;       // how many advance from each heat (e.g., top 2)
}

interface Heat {
  playerIds: string[];
  advancingIds: string[];     // filled after heat completes
  status: "pending" | "active" | "complete";
}

interface BracketRound {
  heats: Heat[];
}
```

**Design for player counts:**
- 1-3 players: FFA (no bracket needed)
- 4 players: 2 heats of 2, then finals
- 8 players: 4 heats of 2, semis, finals (classic single-elim)
- 12 players: 4 heats of 3, advance top 2 each → 8 in semis → 4 in finals
- 20 players: 5 heats of 4, advance top 2 each → 10 → 5 heats of 2 → finals

**Update `BracketState` schema** to support variable heat sizes.

**Update TapSpeed** to use new bracket system (test with existing game).

Identify other games that could support bracket play (Escape Maze, Shave the Yak are good candidates).

---

## Execution Order

All 10 items should be implemented in the order listed. Each item is self-contained and can be tested independently.
