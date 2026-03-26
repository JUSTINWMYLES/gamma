/**
 * server/src/utils/bracket.ts
 *
 * Multi-format bracket builder and advancement helpers.
 * Supports 1v1 single-elimination and multi-player heats (2-4 per heat).
 * All randomness uses the seeded RNG for reproducible results.
 */

import { BracketState, BracketRound, Heat } from "../schema/BracketState";
import { seededShuffle } from "./rng";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BracketConfig {
  /** Maximum players per heat. Default 2 (classic 1v1). */
  heatSize?: number;
  /** How many players advance from each heat. Default 1. */
  advanceCount?: number;
}

// ── Builder ───────────────────────────────────────────────────────────────────

/**
 * Build the first round of a bracket.
 *
 * @param playerIds  Array of session IDs participating.
 * @param seed       Seed for the random draw (use Date.now() at game start).
 * @param config     Optional bracket configuration for heat sizes.
 */
export function buildBracket(
  playerIds: string[],
  seed: number,
  config?: BracketConfig,
): BracketState {
  const heatSize = config?.heatSize ?? 2;
  const advanceCount = config?.advanceCount ?? 1;

  const state = new BracketState();
  state.heatSize = heatSize;
  state.advanceCount = advanceCount;

  const shuffled = seededShuffle([...playerIds], seed);
  const round = buildRoundFromPlayers(shuffled, heatSize, 1);

  state.rounds.push(round);
  return state;
}

/**
 * Build a BracketRound from a list of player IDs.
 * Distributes players into heats of up to `heatSize` players.
 * If there are leftover players that can't fill a full heat, they form a
 * smaller heat (or get a bye if only 1 player).
 */
function buildRoundFromPlayers(
  playerIds: string[],
  heatSize: number,
  roundNumber: number,
): BracketRound {
  const round = new BracketRound();
  let heatIndex = 0;

  for (let i = 0; i < playerIds.length; i += heatSize) {
    const slice = playerIds.slice(i, i + heatSize);
    const heat = new Heat();
    heat.id = `r${roundNumber}-h${heatIndex}`;

    for (const pid of slice) {
      heat.playerIds.push(pid);
    }

    // Bye: a heat with only 1 player auto-advances
    if (slice.length === 1) {
      heat.advancingIds.push(slice[0]);
      heat.status = "complete";
    } else {
      heat.status = "pending";
    }

    round.heats.push(heat);
    heatIndex++;
  }

  return round;
}

// ── Advancement ───────────────────────────────────────────────────────────────

/**
 * Collect advancers from the current bracket round and build the next round.
 * Mutates `state` in place (Colyseus Schema mutation is intentional).
 *
 * @param state  The bracket state to advance.
 * @param seed   Seed for re-shuffling advancers into the next round.
 */
export function advanceBracket(state: BracketState, seed: number): void {
  const currentRound = state.rounds[state.currentRound];
  if (!currentRound) return;

  // Collect all advancing player IDs from every heat
  const advancers: string[] = [];
  for (const heat of currentRound.heats) {
    for (const aid of heat.advancingIds) {
      if (aid) advancers.push(aid);
    }
  }

  if (advancers.length <= 1) return; // tournament finished

  const shuffled = seededShuffle(advancers, seed + state.currentRound);
  const next = buildRoundFromPlayers(
    shuffled,
    state.heatSize,
    state.currentRound + 2,
  );

  state.rounds.push(next);
  state.currentRound++;
}

// ── Convenience for 1v1 (backward compat) ─────────────────────────────────────

/**
 * Helper to get a heat's first two player IDs (for 1v1 games like TapSpeed).
 * Returns ["", ""] if the heat doesn't have 2 players.
 */
export function getMatchPlayers(heat: Heat): [string, string] {
  return [heat.playerIds[0] ?? "", heat.playerIds[1] ?? ""];
}

/**
 * Helper to set the winner of a 1v1 heat (convenience for games using 2-player heats).
 * Sets advancingIds to [winnerId] and marks heat complete.
 */
export function resolveHeat1v1(heat: Heat, winnerId: string): void {
  heat.advancingIds.push(winnerId);
  heat.status = "complete";
}

/**
 * Resolve a multi-player heat by providing the ordered list of advancing player IDs.
 * Marks the heat as complete.
 */
export function resolveHeat(heat: Heat, advancingIds: string[]): void {
  for (const id of advancingIds) {
    heat.advancingIds.push(id);
  }
  heat.status = "complete";
}

// ── Planning helper ───────────────────────────────────────────────────────────

/**
 * Estimate the total number of bracket rounds needed for N players
 * with a given heat size and advance count.
 */
export function estimateBracketRounds(
  playerCount: number,
  heatSize: number = 2,
  advanceCount: number = 1,
): number {
  if (playerCount <= 1) return 0;
  let remaining = playerCount;
  let rounds = 0;
  while (remaining > 1) {
    const numHeats = Math.ceil(remaining / heatSize);
    remaining = numHeats * advanceCount;
    // Handle edge: if all heats only advance 1 and there's 1 heat, we're done next round
    if (remaining >= playerCount) break; // safety: prevent infinite loop
    rounds++;
  }
  return rounds;
}
