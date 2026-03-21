/**
 * server/src/schema/RoomState.ts
 *
 * Root Colyseus Schema for a GammaRoom.
 * Every field here is replicated to all connected clients (view screen + players).
 * Private per-player data is sent via room.send() instead.
 */

import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";
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

  /** Session ID of the host/admin client (view screen if present, else creating player). */
  @type("string") hostSessionId: string = "";

  /** True while a view-screen client is connected. Some games require this. */
  @type("boolean") viewScreenConnected: boolean = false;

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

  /**
   * Guards for registry-14. Keyed by guard index string ("0", "1", …).
   * Populated/cleared by the DontGetCaughtGame plugin.
   * Replaces the old single `guard` field — supports multiple guards per round.
   */
  @type({ map: GuardState }) guards = new MapSchema<GuardState>();

  /**
   * Flat tile array for the current game map, serialised as a JSON string.
   * Clients deserialise this to render the procedural map.
   * Empty string in lobby (no game loaded yet).
   */
  @type("string") mapTiles: string = "";

  /** Width of the current game map in tiles. */
  @type("number") mapWidth: number = 0;

  /** Height of the current game map in tiles. */
  @type("number") mapHeight: number = 0;

  // ── Lobby setup criteria ──────────────────────────────────────────────────
  // Set during the 3-step setup flow before game selection.
  // Used to filter/grey-out games that don't match the current setup.

  /** "same" = players in same physical room; "remote" = playing remotely. */
  @type("string") locationMode: "same" | "remote" | "" = "";

  /**
   * Physical activity level selected by the host.
   * "none" = seated, "some" = light movement, "full" = active movement.
   */
  @type("string") activityLevel: "none" | "some" | "full" | "" = "";

  /**
   * Whether a secondary TV/screen display is available.
   * For same-room: is there a central screen?
   * For remote: is each player at a secondary display?
   */
  @type("boolean") hasSecondaryDisplay: boolean = false;

  /** Step in the lobby setup flow (0 = not started, 1 = location, 2 = activity, 3 = display, 4 = done). */
  @type("number") setupStep: number = 0;
}
