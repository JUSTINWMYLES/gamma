/**
 * server/src/schema/BracketState.ts
 *
 * Single-elimination bracket for 1v1 match modes.
 * Server builds and advances this; all clients see it via Schema replication.
 */

import { Schema, type, ArraySchema } from "@colyseus/schema";

export class Match extends Schema {
  @type("string") id: string = "";
  @type("string") player1Id: string = "";
  @type("string") player2Id: string = "";
  /** Empty string until match is resolved. "BYE" for auto-advance byes. */
  @type("string") winnerId: string = "";
  @type("string") status: "pending" | "in_progress" | "complete" = "pending";
}

export class BracketRound extends Schema {
  @type([Match]) matches = new ArraySchema<Match>();
}

export class BracketState extends Schema {
  @type([BracketRound]) rounds = new ArraySchema<BracketRound>();
  @type("number") currentRound: number = 0;
}
