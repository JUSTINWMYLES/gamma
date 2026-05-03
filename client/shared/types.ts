/**
 * client/shared/types.ts
 *
 * TypeScript types that mirror the server Colyseus Schema.
 * These are used for type-safe state access in Svelte components.
 *
 * Note: These are plain interfaces, not Schema classes.
 * They are used for type annotations only; actual state comes from
 * the Colyseus client as a reactive proxy.
 */

export type Phase =
  | "lobby"
  | "game_loading"
  | "instructions"
  | "countdown"
  | "in_round"
  | "round_end"
  | "scoreboard"
  | "game_over";

export type DevicePermissionState = "unknown" | "granted" | "denied";

export interface PlayerState {
  id: string;
  name: string;
  score: number;
  isReady: boolean;
  isConnected: boolean;
  isEliminated: boolean;
  bracketSeed: number;
  currentMatchOpponentId: string;
  // customization
  iconEmoji: string;
  iconText: string;
  iconBgColor: string;
  iconDesign: string;
  micPermission: DevicePermissionState;
  motionPermission: DevicePermissionState;
  // registry-14
  x: number;
  y: number;
  isDetected: boolean;
  detectionMeter: number;
  timesCaught: number;
}

export interface GameConfig {
  roundCount: number;
  practiceRoundEnabled: boolean;
  timeLimitSecs: number;
  matchMode: "ffa" | "1v1_bracket";
  gameMode: string;
}

export interface GuardState {
  id: string;
  x: number;
  y: number;
  facingAngle: number;
  patrolIndex: number;
  guardMode: string;
  targetPlayerId: string;
}

export interface RoomState {
  phase: Phase;
  roomCode: string;
  hostSessionId: string;
  viewScreenConnected: boolean;
  selectedGame: string;
  currentRound: number;
  isPracticeRound: boolean;
  phaseStartedAt: number;
  roundDurationSecs: number;
  players: Map<string, PlayerState>;
  gameConfig: GameConfig;
  /** Multiple guards, keyed by index string ("0", "1", …). */
  guards: Map<string, GuardState>;
  /** JSON-serialised flat tile array for the current procedural map. */
  mapTiles: string;
  mapWidth: number;
  mapHeight: number;
  // Playlist / game queue
  /** Ordered list of game IDs to play through. Empty = single-game mode. */
  gameQueue: string[];
  /** Index into gameQueue for the currently active (or next) game. 0-based. */
  queueIndex: number;
  // Setup criteria
  locationMode: "same" | "remote" | "";
  activityLevel: "none" | "some" | "full" | "";
  hasSecondaryDisplay: boolean;
  setupStep: number;
}

export type NewsBroadcastStage =
  | "headline_submission"
  | "assignment_reveal"
  | "broadcast_creation"
  | "buffering"
  | "presentation"
  | "voting"
  | "results";

export interface NewsBroadcastMediaEntry {
  provider: string;
  providerAssetId: string;
  label: string;
  previewUrl: string;
  playbackUrl: string;
  fallbackImageUrl: string;
  mimeType: string;
  width?: number;
  height?: number;
  durationMs?: number;
}

export interface NewsBroadcastVoiceOption {
  id: string;
  label: string;
  tone: string;
  source?: string;
  available: boolean;
  placeholder?: boolean;
  availabilityReason?: string;
}

export interface NewsBroadcastSubmission {
  playerId: string;
  playerName: string;
  assignedHeadline: string;
  script: string;
  spokenText: string;
  voicePresetId: string;
  voiceLabel: string;
  selectedMedia: NewsBroadcastMediaEntry;
  estimatedSpeechMs: number;
  submittedAt: number;
  ttsJobId?: string;
  ttsStatus?: string;
  audioDurationMs?: number;
  audioMimeType?: string;
}

export interface NewsBroadcastPresentationUpNext {
  playerId: string;
  playerName: string;
  assignedHeadline: string;
}

export interface NewsBroadcastPresentationEntry {
  playerId: string;
  playerName: string;
  assignedHeadline: string;
  script: string;
  voicePresetId: string;
  voiceLabel: string;
  selectedMedia: NewsBroadcastMediaEntry;
  estimatedSpeechMs: number;
  artifactJobId: string | null;
  artifactReady: boolean;
  captionsOnly: boolean;
}

export interface NewsBroadcastVotingEntry {
  playerId: string;
  playerName: string;
  assignedHeadline: string;
  selectedMedia: NewsBroadcastMediaEntry;
}

export interface NewsBroadcastResultEntry extends NewsBroadcastSubmission {
  voteCount: number;
  isWinner: boolean;
}

export interface NewsBroadcastRoundResultPayload {
  winner: string | null;
  scores: Record<string, number>;
  entries: NewsBroadcastResultEntry[];
  presentationOrder: string[];
  totalVotes: number;
  participationPoints: number;
}

export interface NewsBroadcastSyncPayload {
  stage: NewsBroadcastStage;
  voices: NewsBroadcastVoiceOption[];
  assignedHeadline: string | null;
  headlineSubmitted: boolean;
  broadcastSubmitted: boolean;
  submission: NewsBroadcastSubmission | null;
  submittedCount: number;
  totalPlayers: number;
  currentPresentationIndex: number;
  presentationOrder: string[];
}

export const NEWS_BROADCAST_FALLBACK_MEDIA: NewsBroadcastMediaEntry = {
  provider: "gamma_builtin",
  providerAssetId: "news-broadcast-default-frame",
  label: "Technical Difficulties",
  previewUrl: "/news-broadcast-default-frame.svg",
  playbackUrl: "",
  fallbackImageUrl: "/news-broadcast-default-frame.svg",
  mimeType: "image/svg+xml",
  width: 1280,
  height: 720,
};

/** Tile IDs from the server tilemap — shared knowledge for rendering. */
export const TILE = {
  WALL: 1,
  FLOOR: 0,
} as const;

export const TILE_SIZE_PX = 28; // pixels per tile — fits the 36×24 map on standard displays

// ── Game registry (client-side metadata for filtering / display) ──────────────

export interface GameMeta {
  id: string;
  label: string;
  description: string;
  /** Longer description shown on the game detail page. */
  detailDescription: string;
  activityLevel: "none" | "some" | "full";
  requiresSameRoom: boolean;
  requiresSecondaryDisplay: boolean;
  minPlayers: number;
  maxPlayers: number;
  tags: string[];
  /** Estimated play time per round/session in minutes. */
  estimatedMinutes: number;
  /** Viewer music track played during in_round phase. Empty = no music override. */
  musicTrack: string;
}

export const GAME_REGISTRY: GameMeta[] = [
  {
    id: "registry-03-tap-speed",
    label: "Tap Speed",
    description: "Tap as fast as you can in a 1v1 bracket! Random timer between 5–20 seconds.",
    detailDescription: "Players face off in a single-elimination bracket. Each match starts a random countdown (5–20 seconds) and both players tap their screen as fast as possible. Highest tap count wins the match and advances. The bracket continues until a champion is crowned. Great for quick warm-up rounds or tournament-style play.",
    activityLevel: "none",
    requiresSameRoom: false,
    requiresSecondaryDisplay: false,
    minPlayers: 2,
    maxPlayers: 16,
    tags: ["competitive", "bracket", "speed"],
    estimatedMinutes: 5,
    musicTrack: "pinball_spring_160",
  },
  {
    id: "registry-04-escape-maze",
    label: "Escape Maze",
    description: "Navigate a random maze solo or shake your phone in a team of four!",
    detailDescription: "A procedurally generated maze appears on each player's phone. Tilt, swipe, or tap to navigate your way to the exit before time runs out. In team mode, four players each control a different direction — coordination is key! Mazes get more complex each round.",
    activityLevel: "some",
    requiresSameRoom: false,
    requiresSecondaryDisplay: false,
    minPlayers: 1,
    maxPlayers: 16,
    tags: ["puzzle", "maze", "team"],
    estimatedMinutes: 8,
    musicTrack: "pixelland",
  },
  {
    id: "registry-06-sound-replication",
    label: "Sound Replication",
    description: "Listen to a sound, then try to replicate it. Closest match wins!",
    detailDescription: "A target sound plays for everyone to hear. Each player then records their best imitation using their phone's microphone. The system compares amplitude and waveform patterns to score accuracy. Players can see a visual comparison of their recording versus the target. Multiple rounds with increasingly tricky sounds.",
    activityLevel: "none",
    requiresSameRoom: true,
    requiresSecondaryDisplay: false,
    minPlayers: 2,
    maxPlayers: 12,
    tags: ["audio", "creative", "turn-based"],
    estimatedMinutes: 10,
    musicTrack: "",
  },
  {
    id: "registry-07-hot-potato",
    label: "Hot Potato",
    description: "Pass the phone before the timer runs out! Don't get caught holding the potato!",
    detailDescription: "One phone becomes the 'hot potato' for the entire round. The screen shows who to physically pass the phone to next. The receiver presses a button to confirm they have it, then the next target appears. When the hidden timer expires, whoever is holding the potato loses points. A voting round determines if anyone was unfairly slow to accept.",
    activityLevel: "some",
    requiresSameRoom: true,
    requiresSecondaryDisplay: false,
    minPlayers: 2,
    maxPlayers: 12,
    tags: ["physical", "party", "fast"],
    estimatedMinutes: 6,
    musicTrack: "",
  },
  {
    id: "registry-14-dont-get-caught",
    label: "Don't Get Caught",
    description: "Avoid supernatural guards on a procedural map. More guards each round.",
    detailDescription: "Players navigate a top-down procedurally generated map, avoiding AI guards with vision cones. Stay hidden behind walls, time your movements, and reach the exit. Guards patrol, investigate sounds, and chase detected players. Each round adds more guards and the map gets trickier. Getting caught fills your detection meter — three strikes and you're out.",
    activityLevel: "none",
    requiresSameRoom: false,
    requiresSecondaryDisplay: false,
    minPlayers: 1,
    maxPlayers: 12,
    tags: ["stealth", "strategy"],
    estimatedMinutes: 12,
    musicTrack: "le_grand_chase",
  },
  {
    id: "registry-17-fire-match-blow-shake",
    label: "Camp Fire",
    description: "Strike a match, blow to grow the flame, shake to fan it, then tap to extinguish!",
    detailDescription: "A multi-stage physical game using your phone's sensors. First, swipe to strike a match. Then blow into the microphone to grow the flame. Shake your phone to fan the campfire to full blaze. Finally, tap rapidly to extinguish it. Fastest overall time wins. Uses accelerometer and microphone for an immersive experience.",
    activityLevel: "some",
    requiresSameRoom: false,
    requiresSecondaryDisplay: false,
    minPlayers: 1,
    maxPlayers: 16,
    tags: ["physical", "sensor", "fast"],
    estimatedMinutes: 5,
    musicTrack: "vivacity",
  },
  {
    id: "registry-19-shave-the-yak",
    label: "Shave The Yak",
    description: "Swipe to shave a cartoon yak before time runs out. Miss and the yak moves!",
    detailDescription: "A cartoon yak covered in shaggy fur appears on your screen. Swipe in the right direction to shave off patches of fur before the timer expires. But the yak fidgets! Miss a swipe and the yak shifts position, costing you precious time. Precision and speed matter — highest percentage shaved wins.",
    activityLevel: "none",
    requiresSameRoom: false,
    requiresSecondaryDisplay: false,
    minPlayers: 1,
    maxPlayers: 16,
    tags: ["swipe", "reflex", "funny"],
    estimatedMinutes: 5,
    musicTrack: "fart",
  },
  {
    id: "registry-20-odd-one-out",
    label: "Odd One Out",
    description: "One player has a secret action. Observe, deduce, and vote — who's the odd one?",
    detailDescription: "Everyone receives the same secret instruction on their phone — except one player, who gets a different one. Players perform their actions in the same room, trying to blend in. After the performance phase, everyone discusses and votes on who they think had the odd instruction. The odd one scores if they avoid detection; others score if they identify them correctly.",
    activityLevel: "none",
    requiresSameRoom: true,
    requiresSecondaryDisplay: false,
    minPlayers: 3,
    maxPlayers: 12,
    tags: ["social", "deduction", "voting"],
    estimatedMinutes: 8,
    musicTrack: "thinking",
  },
  {
    id: "registry-25-lowball-marketplace",
    label: "Lowball Marketplace",
    description: "Bid on ridiculous items in a fake marketplace. Go low... but not TOO low!",
    detailDescription: "Browse absurd marketplace listings — from haunted toasters to slightly cursed bicycles. Each item has a hidden reserve price. Place the lowest bid you think the seller will still accept. Too high and you overpay, too low and the seller rejects your offer entirely. In 'funny messages' mode, write creative lowball responses instead of bidding. Results review shows every listing and response for maximum laughs.",
    activityLevel: "none",
    requiresSameRoom: false,
    requiresSecondaryDisplay: false,
    minPlayers: 2,
    maxPlayers: 12,
    tags: ["bidding", "strategy", "funny"],
    estimatedMinutes: 10,
    musicTrack: "zazie",
  },
  {
    id: "registry-40-paint-match",
    label: "Paint Match",
    description: "Mix primary colors on your phone to match a mystery target color on the TV!",
    detailDescription: "The server generates a random target color displayed on the TV. Each player's phone shows a color-mixing canvas with five virtual paint buckets: red, yellow, blue, white, and black. Adjust the amounts to blend a custom color in real time. Submit your mix when ready — the server computes perceptual color distance (CIE deltaE) to rank players from closest to farthest. Supports bracket matchmaking for tournament play.",
    activityLevel: "none",
    requiresSameRoom: false,
    requiresSecondaryDisplay: true,
    minPlayers: 2,
    maxPlayers: 16,
    tags: ["creative", "color", "competitive"],
    estimatedMinutes: 8,
    musicTrack: "thinking",
  },
  {
    id: "registry-10-grid-tap-colors",
    label: "Grid Tap Colors",
    description: "Phones form a grid — one player at a time races through a lit tap sequence!",
    detailDescription: "Lay phones out in a grid formation. Each turn, one player is announced, then one phone lights up at a time and must be tapped before the next one appears. Every player completes the full random sequence across the whole grid. Scores are awarded for the fastest overall completion, fastest average press time, and fastest individual press.",
    activityLevel: "some",
    requiresSameRoom: true,
    requiresSecondaryDisplay: true,
    minPlayers: 2,
    maxPlayers: 32,
    tags: ["physical", "speed", "memory", "competitive"],
    estimatedMinutes: 8,
    musicTrack: "ouroboros",
  },
  {
    id: "registry-27-word-build",
    label: "Word Build",
    description: "Teams race to arrange phones showing letter fragments to spell a hidden word!",
    detailDescription: "Players are split into two teams. Each phone displays 1–2 consecutive letters of a hidden word. Teams must physically arrange their phones in the correct order to spell the word within 60 seconds. One random phone per team has a 'Done' button to lock in the team's answer. The fastest correct team wins the round. Words are 5–10 letters long, and all valid arrangements are shown at the end.",
    activityLevel: "some",
    requiresSameRoom: true,
    requiresSecondaryDisplay: false,
    minPlayers: 6,
    maxPlayers: 20,
    tags: ["team", "physical", "word", "party"],
    estimatedMinutes: 8,
    musicTrack: "",
  },
  {
    id: "registry-28-wanted-ad",
    label: "Wanted Ad",
    description: "Fill in a dusty western wanted poster for another player, then vote for the best one!",
    detailDescription: "Each round, the lobby is shuffled and every player is secretly assigned another player as their outlaw target. Phones show an old-west poster template with missing fields for the wanted condition, bounty, and reason. Players fill in as many or as few fields as they like, using the target player's icon as the portrait. The completed posters are displayed one by one for ten seconds each, then everyone votes for their favourite creation.",
    activityLevel: "none",
    requiresSameRoom: false,
    requiresSecondaryDisplay: false,
    minPlayers: 2,
    maxPlayers: 12,
    tags: ["creative", "voting", "party", "western"],
    estimatedMinutes: 8,
    musicTrack: "hyperfun",
  },
  {
    id: "registry-26-audio-overlay",
    label: "Audio Overlay",
    description: "Pick a GIF, record audio over someone else's pick, then vote for the best combo!",
    detailDescription: "A random player picks a sound category (animals, evil laughs, vehicles, yells, etc.). Everyone else selects a GIF that matches the category. GIFs get shuffled and reassigned — you record audio over someone else's GIF pick. All combinations are played back and everyone votes for the funniest pairing. Pure creative chaos.",
    activityLevel: "none",
    requiresSameRoom: true,
    requiresSecondaryDisplay: false,
    minPlayers: 2,
    maxPlayers: 12,
    tags: ["audio", "creative", "voting"],
    estimatedMinutes: 10,
    musicTrack: "",
  },
  {
    id: "registry-43-medical-story",
    label: "Medical Story",
    description: "Assign hospital roles and invent the funniest complaint, diagnosis, procedure, and catchphrase!",
    detailDescription: "A patient arrives by ambulance and everyone votes to assign roles: patient, doctor, and nurse. Then work through four creative rounds — describe the patient's complaint, invent a hilariously made-up diagnosis with optional ridiculous tests, devise an emergency procedure, and finish the doctor's open-ended brag. After each phase, vote for the funniest entry, with some roles getting double voting power in their specialty phase.",
    activityLevel: "none",
    requiresSameRoom: false,
    requiresSecondaryDisplay: false,
    minPlayers: 3,
    maxPlayers: 12,
    tags: ["creative", "voting", "party", "funny"],
    estimatedMinutes: 10,
    musicTrack: "",
  },
  {
    id: "registry-44-western-standoff",
    label: "Western Standoff",
    description: "Back-to-back duelists turn, aim, and tap first in a western quick-draw bracket.",
    detailDescription: "Two players at a time face off in a same-room western duel. After a short match preview, both players calibrate while standing back-to-back, take three paces apart, then wait for the draw signal. The server only accepts shots after the signal and only when the phone has fully turned and is held in a sideways aiming pose. First valid shot wins and advances through the single-elimination bracket.",
    activityLevel: "some",
    requiresSameRoom: true,
    requiresSecondaryDisplay: true,
    minPlayers: 2,
    maxPlayers: 16,
    tags: ["western", "bracket", "reaction", "sensor"],
    estimatedMinutes: 6,
    musicTrack: "",
  },
  {
    id: "registry-45-news-broadcast",
    label: "News Broadcast",
    description: "Write a headline, produce someone else's story, and air a ridiculous TV news segment.",
    detailDescription: "Everyone writes one fake headline, then gets somebody else's headline to turn into a full absurd broadcast. On your phone, choose media, write a short caption script, and pick an anchor voice. The TV presents each finished segment visually in captions-only mode for now, then the room votes for the best newscast.",
    activityLevel: "none",
    requiresSameRoom: true,
    requiresSecondaryDisplay: true,
    minPlayers: 2,
    maxPlayers: 12,
    tags: ["creative", "tv", "captions", "voting"],
    estimatedMinutes: 10,
    musicTrack: "",
  },
  {
    id: "registry-11-tier-ranking",
    label: "S-Tier Ranking",
    description: "One player picks a category, everyone submits an entry, then tier-rank them all!",
    detailDescription: "A random player picks a category (or types their own). Everyone — including the chooser — submits one unique entry for that category. Then the full list is revealed and each player has 90 seconds to assign every entry to a tier: S, A, B, C, or D. The consensus tier for each entry is determined by majority vote. Players who predicted the group's verdict earn points — S-tier correct votes score the most!",
    activityLevel: "none",
    requiresSameRoom: false,
    requiresSecondaryDisplay: false,
    minPlayers: 2,
    maxPlayers: 16,
    tags: ["social", "voting", "creative", "party"],
    estimatedMinutes: 8,
    musicTrack: "newer_wave",
  },
];

/**
 * Returns null if the game matches all setup criteria, otherwise a string
 * explaining why it is unavailable given the current setup.
 */
export function getGameUnavailableReason(
  game: GameMeta,
  state: Pick<RoomState, "locationMode" | "activityLevel" | "hasSecondaryDisplay" | "viewScreenConnected" | "players">,
): string | null {
  if (game.requiresSameRoom && state.locationMode === "remote") {
    return "Requires same-room play";
  }
  if (game.requiresSecondaryDisplay && !state.hasSecondaryDisplay) {
    return "Requires a TV / secondary display";
  }
  // If host selected shared display and game requires it, block until display actually joins
  if (game.requiresSecondaryDisplay && state.hasSecondaryDisplay && !state.viewScreenConnected) {
    return "Waiting for display to connect";
  }
  if (state.activityLevel !== "" && game.activityLevel !== state.activityLevel) {
    // Allow same or less activity than selected
    const levels: Array<"none" | "some" | "full"> = ["none", "some", "full"];
    const selected = levels.indexOf(state.activityLevel as "none" | "some" | "full");
    const required = levels.indexOf(game.activityLevel);
    if (required > selected) {
      return `Requires ${game.activityLevel} activity`;
    }
  }
  // Check player count
  const playerCount = state.players?.size ?? 0;
  if (playerCount > 0 && playerCount < game.minPlayers) {
    return `Needs ${game.minPlayers}+ players`;
  }
  if (playerCount > 0 && playerCount > game.maxPlayers) {
    return `Max ${game.maxPlayers} players`;
  }
  return null;
}

export function getRoundLabel(
  state: Pick<RoomState, "currentRound" | "isPracticeRound">,
): string {
  if (state.isPracticeRound) return "Practice Round";
  return `Round ${Math.max(1, state.currentRound)}`;
}

export function getRoundProgressLabel(
  state: Pick<RoomState, "currentRound" | "isPracticeRound" | "gameConfig">,
): string {
  if (state.isPracticeRound) return "Practice Round";
  return `${getRoundLabel(state)} of ${state.gameConfig.roundCount}`;
}
