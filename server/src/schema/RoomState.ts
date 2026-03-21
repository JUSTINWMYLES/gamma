/**
 * server/src/schema/RoomState.ts
 *
 * Root Colyseus Schema for a GammaRoom.
 * Every field here is replicated to all connected clients (TV + phones).
 * Private per-player data is sent via room.send() instead.
 */

import { Schema, type, MapSchema } from "@colyseus/schema";
import { PlayerState } from "./PlayerState";
import { GameConfig } from "./GameConfig";
import { BracketState } from "./BracketState";
import { GuardState } from "./GuardState";

export type Phase =
  | "lobby"
  | "game_loading"
  | "instructions"
  | "countdown"
  | "in_round"
  | "round_end"
  | "scoreboard"
  | "game_over";

export class RoomState extends Schema {
  /** Current phase of the game session. All clients react to phase changes. */
  @type("string") phase: Phase = "lobby";

  /** 4-char uppercase alphanumeric code shown on TV for players to join. */
  @type("string") roomCode: string = "";

  /** Session ID of the TV display client (or first player if no TV). */
  @type("string") hostSessionId: string = "";

  /** True while a TV client is connected. Some games require this. */
  @type("boolean") tvConnected: boolean = false;

  /** Registry ID of the game currently selected (e.g. "registry-14-dont-get-caught"). */
  @type("string") selectedGame: string = "";

  /** Which round of the current game is running (1-indexed). */
  @type("number") currentRound: number = 0;

  /** Epoch ms at which the current phase started (for client-side countdown sync). */
  @type("number") phaseStartedAt: number = 0;

  /** Duration of the current in_round phase in seconds. Mirrors GameConfig.timeLimitSecs. */
  @type("number") roundDurationSecs: number = 60;

  /** All connected players (phones). Key = sessionId. */
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();

  /** Host-configurable game options. */
  @type(GameConfig) gameConfig = new GameConfig();

  /** 1v1 bracket state. Only populated when matchMode = "1v1_bracket". */
  @type(BracketState) bracket = new BracketState();

  /** Guard state for registry-14. Populated by the DontGetCaughtGame plugin. */
  @type(GuardState) guard = new GuardState();
}
