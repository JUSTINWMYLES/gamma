/**
 * server/src/schema/GameConfig.ts
 *
 * Host-configurable options for the current game session.
 * Sent as Schema so the TV lobby can display live config edits.
 */

import { Schema, type } from "@colyseus/schema";

export type MatchMode = "ffa" | "1v1_bracket";

export class GameConfig extends Schema {
  /** Number of rounds to play. Default per-game; host can override. */
  @type("number") roundCount: number = 1;

  /** Per-round time limit in seconds. */
  @type("number") timeLimitSecs: number = 60;

  /** "ffa" = everyone competes together; "1v1_bracket" = random bracket pairs. */
  @type("string") matchMode: MatchMode = "ffa";
}
