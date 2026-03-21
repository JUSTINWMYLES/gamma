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

export const TILE_SIZE_PX = 36; // pixels per tile — smaller to fit the larger 24×16 map

// ── Game registry (client-side metadata for filtering / display) ──────────────

export interface GameMeta {
  id: string;
  label: string;
  description: string;
  activityLevel: "none" | "some" | "full";
  requiresSameRoom: boolean;
  requiresSecondaryDisplay: boolean;
}

export const GAME_REGISTRY: GameMeta[] = [
  {
    id: "registry-14-dont-get-caught",
    label: "Don't Get Caught",
    description: "Avoid supernatural guards on a procedural map. More guards each round.",
    activityLevel: "none",
    requiresSameRoom: false,
    requiresSecondaryDisplay: false,
  },
  {
    id: "registry-19-shave-the-yak",
    label: "Shave The Yak",
    description: "Swipe to shave a cartoon yak before time runs out. Miss and the yak moves!",
    activityLevel: "none",
    requiresSameRoom: false,
    requiresSecondaryDisplay: false,
  },
  {
    id: "registry-20-odd-one-out",
    label: "Odd One Out",
    description: "One player has a secret action. Observe, deduce, and vote — who's the odd one?",
    activityLevel: "none",
    requiresSameRoom: true,
    requiresSecondaryDisplay: false,
  },
];

/**
 * Returns null if the game matches all setup criteria, otherwise a string
 * explaining why it is unavailable given the current setup.
 */
export function getGameUnavailableReason(
  game: GameMeta,
  state: Pick<RoomState, "locationMode" | "activityLevel" | "hasSecondaryDisplay">,
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
  return null;
}
