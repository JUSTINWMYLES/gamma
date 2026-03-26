/**
 * server/src/schema/BracketState.ts
 *
 * Bracket state for single-elimination tournaments with variable heat sizes.
 *
 * Supports:
 *   - Classic 1v1 matches (heatSize=2, advanceCount=1)
 *   - Multi-player heats (heatSize=3 or 4, advanceCount=1 or 2)
 *   - Byes for uneven player counts
 *
 * Server builds and advances this; all clients see it via Schema replication.
 */

import { Schema, type, ArraySchema } from "@colyseus/schema";

/**
 * A single heat (match) within a bracket round.
 *
 * For 1v1: playerIds has 2 entries, advancingIds has 1 (the winner).
 * For multi-player: playerIds has 2-4 entries, advancingIds has 1-2 top finishers.
 * For byes: playerIds has 1 entry, advancingIds is set immediately, status is "complete".
 */
export class Heat extends Schema {
  @type("string") id: string = "";

  /** All player session IDs competing in this heat. */
  @type(["string"]) playerIds = new ArraySchema<string>();

  /**
   * Session IDs of players who advanced from this heat.
   * Empty until heat is resolved. Populated by the game plugin after scoring.
   */
  @type(["string"]) advancingIds = new ArraySchema<string>();

  @type("string") status: "pending" | "in_progress" | "complete" = "pending";
}

export class BracketRound extends Schema {
  @type([Heat]) heats = new ArraySchema<Heat>();
}

export class BracketState extends Schema {
  @type([BracketRound]) rounds = new ArraySchema<BracketRound>();
  @type("number") currentRound: number = 0;

  /** Max players per heat for this bracket (2, 3, or 4). */
  @type("number") heatSize: number = 2;

  /** How many players advance from each heat (1 or 2). */
  @type("number") advanceCount: number = 1;
}

// ── Backward-compatible aliases ───────────────────────────────────────────────
// TapSpeed and other 1v1 games reference "Match" — alias it to Heat so existing
// code continues to work without changes.

/** @deprecated Use `Heat` instead. Alias kept for backward compatibility. */
export const Match = Heat;
export type Match = Heat;
