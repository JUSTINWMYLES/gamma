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

export interface PlayerState {
  id: string;
  name: string;
  score: number;
  isReady: boolean;
  isConnected: boolean;
  isEliminated: boolean;
  bracketSeed: number;
  currentMatchOpponentId: string;
  // registry-14
  x: number;
  y: number;
  isDetected: boolean;
  detectionMeter: number;
  timesCaught: number;
}

export interface GameConfig {
  roundCount: number;
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
  tvConnected: boolean; // @deprecated — use viewScreenConnected
  viewScreenConnected: boolean;
  selectedGame: string;
  currentRound: number;
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
  activityLevel: "none" | "some" | "full";
  requiresSameRoom: boolean;
  requiresSecondaryDisplay: boolean;
  minPlayers: number;
  maxPlayers: number;
  tags: string[];
}

export const GAME_REGISTRY: GameMeta[] = [
  {
    id: "registry-03-tap-speed",
    label: "Tap Speed",
    description: "Tap as fast as you can in a 1v1 bracket! Random timer between 5–20 seconds.",
    activityLevel: "none",
    requiresSameRoom: false,
    requiresSecondaryDisplay: false,
    minPlayers: 2,
    maxPlayers: 16,
    tags: ["competitive", "bracket", "speed"],
  },
  {
    id: "registry-04-escape-maze",
    label: "Escape Maze",
    description: "Navigate a random maze solo or shake your phone in a team of four!",
    activityLevel: "some",
    requiresSameRoom: false,
    requiresSecondaryDisplay: false,
    minPlayers: 1,
    maxPlayers: 16,
    tags: ["puzzle", "maze", "team"],
  },
  {
    id: "registry-06-sound-replication",
    label: "Sound Replication",
    description: "Listen to a sound, then try to replicate it. Closest match wins!",
    activityLevel: "none",
    requiresSameRoom: true,
    requiresSecondaryDisplay: false,
    minPlayers: 2,
    maxPlayers: 12,
    tags: ["audio", "creative", "turn-based"],
  },
  {
    id: "registry-07-hot-potato",
    label: "Hot Potato",
    description: "Pass the phone before the timer runs out! Don't get caught holding the potato!",
    activityLevel: "some",
    requiresSameRoom: true,
    requiresSecondaryDisplay: false,
    minPlayers: 2,
    maxPlayers: 12,
    tags: ["physical", "party", "fast"],
  },
  {
    id: "registry-14-dont-get-caught",
    label: "Don't Get Caught",
    description: "Avoid supernatural guards on a procedural map. More guards each round.",
    activityLevel: "none",
    requiresSameRoom: false,
    requiresSecondaryDisplay: false,
    minPlayers: 1,
    maxPlayers: 8,
    tags: ["stealth", "strategy"],
  },
  {
    id: "registry-17-fire-match-blow-shake",
    label: "Camp Fire",
    description: "Strike a match, blow to grow the flame, shake to fan it, then tap to extinguish!",
    activityLevel: "some",
    requiresSameRoom: false,
    requiresSecondaryDisplay: false,
    minPlayers: 1,
    maxPlayers: 16,
    tags: ["physical", "sensor", "fast"],
  },
  {
    id: "registry-19-shave-the-yak",
    label: "Shave The Yak",
    description: "Swipe to shave a cartoon yak before time runs out. Miss and the yak moves!",
    activityLevel: "none",
    requiresSameRoom: false,
    requiresSecondaryDisplay: false,
    minPlayers: 1,
    maxPlayers: 16,
    tags: ["swipe", "reflex", "funny"],
  },
  {
    id: "registry-20-odd-one-out",
    label: "Odd One Out",
    description: "One player has a secret action. Observe, deduce, and vote — who's the odd one?",
    activityLevel: "none",
    requiresSameRoom: true,
    requiresSecondaryDisplay: false,
    minPlayers: 3,
    maxPlayers: 12,
    tags: ["social", "deduction", "voting"],
  },
  {
    id: "registry-25-lowball-marketplace",
    label: "Lowball Marketplace",
    description: "Bid on ridiculous items in a fake marketplace. Go low... but not TOO low!",
    activityLevel: "none",
    requiresSameRoom: false,
    requiresSecondaryDisplay: false,
    minPlayers: 2,
    maxPlayers: 12,
    tags: ["bidding", "strategy", "funny"],
  },
  {
    id: "registry-26-evil-laugh-overlay",
    label: "Evil Laugh Overlay",
    description: "Record your most evil laugh, pick a villain scene, then vote for the best one!",
    activityLevel: "none",
    requiresSameRoom: true,
    requiresSecondaryDisplay: false,
    minPlayers: 2,
    maxPlayers: 12,
    tags: ["audio", "creative", "voting"],
  },
];

/**
 * Returns null if the game matches all setup criteria, otherwise a string
 * explaining why it is unavailable given the current setup.
 */
export function getGameUnavailableReason(
  game: GameMeta,
  state: Pick<RoomState, "locationMode" | "activityLevel" | "hasSecondaryDisplay" | "players">,
): string | null {
  if (game.requiresSameRoom && state.locationMode === "remote") {
    return "Requires same-room play";
  }
  if (game.requiresSecondaryDisplay && !state.hasSecondaryDisplay) {
    return "Requires a TV / secondary display";
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
