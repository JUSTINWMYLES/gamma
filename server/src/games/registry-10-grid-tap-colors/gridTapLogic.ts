/**
 * server/src/games/registry-10-grid-tap-colors/gridTapLogic.ts
 *
 * Pure logic helpers for the "Grid Tap Colors" game.
 * Extracted for unit testing — no Colyseus/room dependencies.
 */

// ── Grid colors ──────────────────────────────────────────────────────────────

/** The palette of colors available to assign to phones in the grid. */
export const GRID_COLORS = [
  "#ef4444", // red
  "#f59e0b", // amber
  "#22c55e", // green
  "#3b82f6", // blue
  "#a855f7", // purple
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
] as const;

export type GridColor = (typeof GRID_COLORS)[number];

// ── Concurrency grouping ─────────────────────────────────────────────────────

/**
 * Determine how many players compete simultaneously.
 *   <  8 players → 1 at a time
 *   8–15 players → 2 at a time
 *  16+  players → 4 at a time
 */
export function getConcurrentPlayerCount(totalPlayers: number): 1 | 2 | 4 {
  if (totalPlayers >= 16) return 4;
  if (totalPlayers >= 8) return 2;
  return 1;
}

// ── Phone assignment ─────────────────────────────────────────────────────────

export interface PhoneAssignment {
  /** Session ID of the phone/client. */
  phoneId: string;
  /** 1-based display number shown on the physical device. */
  displayNumber: number;
  /** Color assigned to this phone (used in Mode 2). */
  color: GridColor;
  /** Which player group this phone belongs to (0-indexed). */
  groupIndex: number;
}

/**
 * Assign grid phones across player groups.
 *
 * @param phoneIds   All phone session IDs that form the grid.
 * @param groupCount How many groups to split into (1, 2, or 4).
 * @returns A flat array of PhoneAssignments.
 */
export function assignPhones(
  phoneIds: string[],
  groupCount: number,
): PhoneAssignment[] {
  const phonesPerGroup = Math.ceil(phoneIds.length / groupCount);
  return phoneIds.map((phoneId, idx) => ({
    phoneId,
    displayNumber: idx + 1,
    color: GRID_COLORS[idx % GRID_COLORS.length],
    groupIndex: Math.floor(idx / phonesPerGroup),
  }));
}

/**
 * Return the subset of phone assignments belonging to a specific group.
 */
export function getPhonesForGroup(
  assignments: PhoneAssignment[],
  groupIndex: number,
): PhoneAssignment[] {
  return assignments.filter((a) => a.groupIndex === groupIndex);
}

// ── Mode 1: Speed Tap ────────────────────────────────────────────────────────

export interface SpeedTapRoundConfig {
  /** Total number of taps required to complete a round. */
  totalTaps: number;
}

export interface SpeedTapPlayerResult {
  playerId: string;
  /** Total time from first phone lit to final tap (ms). */
  completionTimeMs: number;
  /** Individual tap times (ms) from phone lit → phone tapped. */
  tapTimesMs: number[];
  /** Whether the player completed all taps. */
  completed: boolean;
}

/**
 * Score a Mode 1 (Speed Tap) round.
 *
 * Points breakdown:
 *   - Fastest completion: +300
 *   - Second fastest:     +200
 *   - Third fastest:      +100
 *   - Per completed tap:  +10
 *   - Fastest individual tap in the round: +100
 *   - Slowest individual tap penalty:       -50
 *
 * @param results All player results for the round.
 * @returns Map of playerId → points earned.
 */
export function scoreSpeedTapRound(results: SpeedTapPlayerResult[]): Map<string, number> {
  const scores = new Map<string, number>();
  if (results.length === 0) return scores;

  // Initialize scores
  for (const r of results) {
    scores.set(r.playerId, 0);
  }

  // Completion order (only completed players)
  const completed = results
    .filter((r) => r.completed)
    .sort((a, b) => a.completionTimeMs - b.completionTimeMs);

  const completionBonuses = [300, 200, 100];
  for (let i = 0; i < completed.length && i < completionBonuses.length; i++) {
    const prev = scores.get(completed[i].playerId) ?? 0;
    scores.set(completed[i].playerId, prev + completionBonuses[i]);
  }

  // Points per tap
  for (const r of results) {
    const tapPoints = r.tapTimesMs.length * 10;
    const prev = scores.get(r.playerId) ?? 0;
    scores.set(r.playerId, prev + tapPoints);
  }

  // Fastest individual tap bonus
  const allTaps: { playerId: string; time: number }[] = [];
  for (const r of results) {
    for (const t of r.tapTimesMs) {
      allTaps.push({ playerId: r.playerId, time: t });
    }
  }

  if (allTaps.length > 0) {
    allTaps.sort((a, b) => a.time - b.time);
    const fastestTap = allTaps[0];
    const prev = scores.get(fastestTap.playerId) ?? 0;
    scores.set(fastestTap.playerId, prev + 100);

    // Slowest individual tap penalty
    const slowestTap = allTaps[allTaps.length - 1];
    const prevSlow = scores.get(slowestTap.playerId) ?? 0;
    scores.set(slowestTap.playerId, prevSlow - 50);
  }

  return scores;
}

// ── Mode 2: Color Sequence Memory ────────────────────────────────────────────

export interface ColorSequenceStep {
  /** Index into the phone assignments for the target phone. */
  phoneIndex: number;
  /** Color to display. */
  color: GridColor;
}

/**
 * Generate a random color sequence for Mode 2.
 *
 * @param phoneCount  Number of phones in the grid.
 * @param length      How many steps in the sequence.
 * @param rngFn       Optional RNG function returning [0,1). Defaults to Math.random.
 * @returns Array of sequence steps.
 */
export function generateColorSequence(
  phoneCount: number,
  length: number,
  rngFn: () => number = Math.random,
): ColorSequenceStep[] {
  const sequence: ColorSequenceStep[] = [];
  for (let i = 0; i < length; i++) {
    const phoneIndex = Math.floor(rngFn() * phoneCount);
    const color = GRID_COLORS[phoneIndex % GRID_COLORS.length];
    sequence.push({ phoneIndex, color });
  }
  return sequence;
}

export interface ColorSequencePlayerResult {
  playerId: string;
  /** Taps in order — each entry is the phone index tapped. */
  taps: number[];
  /** The correct sequence for comparison. */
  correctSequence: ColorSequenceStep[];
  /** Time to complete from sequence shown (ms). */
  completionTimeMs: number;
  /** Whether the player submitted their answer. */
  submitted: boolean;
}

/**
 * Evaluate correctness of a player's color sequence taps.
 *
 * @returns Number of errors (wrong taps).
 */
export function countSequenceErrors(
  taps: number[],
  correct: ColorSequenceStep[],
): number {
  let errors = 0;
  for (let i = 0; i < correct.length; i++) {
    if (i >= taps.length || taps[i] !== correct[i].phoneIndex) {
      errors++;
    }
  }
  return errors;
}

/**
 * Score a Mode 2 (Color Sequence) round.
 *
 * Points breakdown:
 *   - Perfect sequence (0 errors): +500
 *   - Per correct tap:              +20
 *   - Per error:                    -30
 *   - Fastest completion bonus:    +200
 *   - Second fastest:              +100
 *
 * @param results All player results for the round.
 * @returns Map of playerId → points earned.
 */
export function scoreColorSequenceRound(
  results: ColorSequencePlayerResult[],
): Map<string, number> {
  const scores = new Map<string, number>();
  if (results.length === 0) return scores;

  for (const r of results) {
    const errors = countSequenceErrors(r.taps, r.correctSequence);
    const correctCount = r.correctSequence.length - errors;
    let points = correctCount * 20 - errors * 30;
    if (errors === 0 && r.submitted) points += 500;
    scores.set(r.playerId, Math.max(0, points));
  }

  // Completion order bonus (only submitted, sorted by time)
  const submitted = results
    .filter((r) => r.submitted)
    .sort((a, b) => a.completionTimeMs - b.completionTimeMs);

  const bonuses = [200, 100];
  for (let i = 0; i < submitted.length && i < bonuses.length; i++) {
    const prev = scores.get(submitted[i].playerId) ?? 0;
    scores.set(submitted[i].playerId, prev + bonuses[i]);
  }

  return scores;
}

// ── Player grouping for rounds ───────────────────────────────────────────────

/**
 * Split player IDs into groups for concurrent play.
 *
 * @param playerIds       All active player IDs.
 * @param concurrentCount How many players play simultaneously.
 * @returns Array of groups, where each group is an array of player IDs.
 */
export function buildPlayerGroups(
  playerIds: string[],
  concurrentCount: number,
): string[][] {
  const groups: string[][] = [];
  for (let i = 0; i < playerIds.length; i += concurrentCount) {
    groups.push(playerIds.slice(i, i + concurrentCount));
  }
  return groups;
}
