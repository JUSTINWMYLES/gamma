/**
 * server/src/utils/bracket.ts
 *
 * Single-elimination bracket builder and advancement helpers.
 * All randomness uses the seeded RNG for reproducible results.
 */

import { BracketState, BracketRound, Match } from "../schema/BracketState";
import { seededShuffle } from "./rng";

/**
 * Build the first round of a single-elimination bracket.
 *
 * @param playerIds  Array of session IDs participating.
 * @param seed       Seed for the random draw (use Date.now() at game start).
 */
export function buildBracket(playerIds: string[], seed: number): BracketState {
  const state = new BracketState();
  const shuffled = seededShuffle([...playerIds], seed);

  const round = new BracketRound();

  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    const m = new Match();
    m.id = `r1-m${Math.floor(i / 2)}`;
    m.player1Id = shuffled[i];
    m.player2Id = shuffled[i + 1];
    m.status = "pending";
    round.matches.push(m);
  }

  // Odd player gets a bye — auto-advanced to round 2
  if (shuffled.length % 2 !== 0) {
    const bye = new Match();
    bye.id = "r1-bye";
    bye.player1Id = shuffled[shuffled.length - 1];
    bye.player2Id = "BYE";
    bye.winnerId = shuffled[shuffled.length - 1];
    bye.status = "complete";
    round.matches.push(bye);
  }

  state.rounds.push(round);
  return state;
}

/**
 * Collect winners from the current bracket round and build the next round.
 * Mutates `state` in place (Colyseus Schema mutation is intentional).
 */
export function advanceBracket(state: BracketState, seed: number): void {
  const currentRound = state.rounds[state.currentRound];
  if (!currentRound) return; // no round at this index
  const winners = currentRound.matches
    .map((m) => m.winnerId)
    .filter((w) => w && w !== "");

  if (winners.length <= 1) return; // tournament finished

  const next = new BracketRound();
  const shuffled = seededShuffle(winners, seed + state.currentRound);

  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    const m = new Match();
    m.id = `r${state.currentRound + 2}-m${Math.floor(i / 2)}`;
    m.player1Id = shuffled[i];
    m.player2Id = shuffled[i + 1];
    m.status = "pending";
    next.matches.push(m);
  }

  if (shuffled.length % 2 !== 0) {
    const bye = new Match();
    bye.id = `r${state.currentRound + 2}-bye`;
    bye.player1Id = shuffled[shuffled.length - 1];
    bye.player2Id = "BYE";
    bye.winnerId = shuffled[shuffled.length - 1];
    bye.status = "complete";
    next.matches.push(bye);
  }

  state.rounds.push(next);
  state.currentRound++;
}
