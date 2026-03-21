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
  isHiding: boolean;
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
  tvConnected: boolean;
  selectedGame: string;
  currentRound: number;
  phaseStartedAt: number;
  roundDurationSecs: number;
  players: Map<string, PlayerState>;
  gameConfig: GameConfig;
  guard: GuardState;
}

/** Tile IDs from the server tilemap — shared knowledge for rendering. */
export const TILE = {
  WALL: 1,
  FLOOR: 0,
  BUSH: 2,
  CRATE: 3,
} as const;

export const MAP_WIDTH = 16;
export const MAP_HEIGHT = 10;
export const TILE_SIZE_PX = 48; // pixels per tile in the TV renderer
