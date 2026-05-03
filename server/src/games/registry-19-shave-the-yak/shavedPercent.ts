/**
 * server/src/games/registry-19-shave-the-yak/shavedPercent.ts
 *
 * Pure, side-effect-free utilities for computing the percentage of a yak
 * that has been shaved, plus rank assignment.
 *
 * The yak's "fur" is modelled as a flat bit-array (Uint8Array) representing
 * a W×H pixel mask.  A cell value of 1 means fur is still present; 0 means
 * shaved.  A swipe is a line segment; every cell whose centre lies within
 * SHAVE_RADIUS pixels of the segment is shaved.
 *
 * This module is imported by both the game plugin (server) and the test suite.
 * It has zero dependencies on Colyseus or Node.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface Point { x: number; y: number; }

export interface YakMask {
  width: number;
  height: number;
  /** 1 = fur present, 0 = shaved.  Length = width * height. */
  cells: Uint8Array;
  /** Total number of cells that started as fur (computed once at creation). */
  totalFurCells: number;
}

/** Result of computing the final round outcome for one player. */
export interface RoundResult {
  playerId: string;
  shavedPercent: number;  // 0–100, rounded to 2 dp
  hits: number;
  misses: number;
  comboMax: number;
  score: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Half-width of the shave brush in mask pixels. */
export const SHAVE_RADIUS = 8;

/** Points per percentage point of fur shaved. */
const POINTS_PER_PERCENT = 10;

/** Bonus multiplier added to the final score per combo-max level. */
const COMBO_BONUS_PER_LEVEL = 0.05;

function roundPercent(rawPercent: number): number {
  return Math.round(Math.min(100, Math.max(0, rawPercent)) * 100) / 100;
}

// ── Mask creation ────────────────────────────────────────────────────────────

/**
 * Build a rectangular fur mask from a 1-bit RLE-encoded string.
 *
 * The shape string encodes run-lengths of alternating 0/1 values starting
 * from 0 (no-fur / transparent background) then 1 (fur).
 *
 * Example:  "5,3,2,1"  →  00000,111,00,1  →  [ 0,0,0,0,0, 1,1,1, 0,0, 1 ]
 *
 * If shapeRle is omitted an ellipse inscribed in the bounding box is used
 * as the default yak silhouette.
 */
export function createYakMask(width: number, height: number, shapeRle?: string): YakMask {
  const cells = new Uint8Array(width * height);

  if (shapeRle) {
    // Decode RLE
    const runs = shapeRle.split(",").map(Number);
    let bit = 0; // starts at 0
    let idx = 0;
    for (const run of runs) {
      for (let r = 0; r < run && idx < cells.length; r++, idx++) {
        cells[idx] = bit;
      }
      bit ^= 1;
    }
  } else {
    // Default: filled ellipse
    const cx = width / 2;
    const cy = height / 2;
    const rx = width / 2;
    const ry = height / 2;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        cells[y * width + x] = dx * dx + dy * dy <= 1 ? 1 : 0;
      }
    }
  }

  let totalFurCells = 0;
  for (let i = 0; i < cells.length; i++) {
    totalFurCells += cells[i];
  }
  return { width, height, cells, totalFurCells };
}

// ── Shave application ────────────────────────────────────────────────────────

/**
 * Apply a swipe stroke to the mask.
 * Shaves every fur cell whose centre is within SHAVE_RADIUS of the
 * line segment (from → to).
 *
 * Returns the number of NEW cells shaved (cells that flipped from 1→0).
 */
export function applySwipe(mask: YakMask, from: Point, to: Point, radius = SHAVE_RADIUS): number {
  const { width, height, cells } = mask;
  let newlyShaved = 0;

  // Bounding box of the stroke + radius (clamped to mask bounds)
  const minX = Math.max(0, Math.floor(Math.min(from.x, to.x) - radius));
  const maxX = Math.min(width - 1,  Math.ceil(Math.max(from.x, to.x) + radius));
  const minY = Math.max(0, Math.floor(Math.min(from.y, to.y) - radius));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(from.y, to.y) + radius));

  const r2 = radius * radius;

  // Segment direction
  const sdx = to.x - from.x;
  const sdy = to.y - from.y;
  const segLen2 = sdx * sdx + sdy * sdy;

  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      const idx = py * width + px;
      if (cells[idx] === 0) continue; // already shaved

      // Point-to-segment squared distance
      const cx = px + 0.5;
      const cy = py + 0.5;

      let dist2: number;
      if (segLen2 === 0) {
        // Degenerate: from === to — treat as a point tap
        const dx = cx - from.x;
        const dy = cy - from.y;
        dist2 = dx * dx + dy * dy;
      } else {
        const t = Math.max(0, Math.min(1, ((cx - from.x) * sdx + (cy - from.y) * sdy) / segLen2));
        const projX = from.x + t * sdx;
        const projY = from.y + t * sdy;
        const ex = cx - projX;
        const ey = cy - projY;
        dist2 = ex * ex + ey * ey;
      }

      if (dist2 <= r2) {
        cells[idx] = 0;
        newlyShaved++;
      }
    }
  }

  return newlyShaved;
}

// ── Percentage calculation ───────────────────────────────────────────────────

export function computeShavedPercentFromCounts(totalFurCells: number, shavedCells: number): number {
  if (totalFurCells <= 0) return 0;
  const clampedShavedCells = Math.min(totalFurCells, Math.max(0, shavedCells));
  return roundPercent((clampedShavedCells / totalFurCells) * 100);
}

/**
 * Compute the current shaved percentage of the mask.
 *
 * shavedPercent = (totalFurCells - remainingFurCells) / totalFurCells * 100
 *
 * Returns 0 when totalFurCells is 0 (edge case: empty mask).
 * Result is clamped to [0, 100] and rounded to 2 decimal places.
 */
export function computeShavedPercent(mask: YakMask): number {
  if (mask.totalFurCells === 0) return 0;

  let remainingFurCells = 0;
  for (let i = 0; i < mask.cells.length; i++) {
    remainingFurCells += mask.cells[i];
  }

  return computeShavedPercentFromCounts(mask.totalFurCells, mask.totalFurCells - remainingFurCells);
}

// ── Rank assignment ──────────────────────────────────────────────────────────

export type Rank = "S" | "A" | "B" | "C" | "D";

/** Map a shaved % to a letter rank. */
export function assignRank(shavedPercent: number): Rank {
  if (shavedPercent >= 90) return "S";
  if (shavedPercent >= 70) return "A";
  if (shavedPercent >= 50) return "B";
  if (shavedPercent >= 25) return "C";
  return "D";
}

// ── Score computation ────────────────────────────────────────────────────────

/**
 * Compute the final score for a player at round end.
 *
 *   base  = shavedPercent * POINTS_PER_PERCENT
 *   bonus = base * (comboMax * COMBO_BONUS_PER_LEVEL)
 *   score = Math.round(base + bonus)
 *
 * The score is always a non-negative integer.
 */
export function computeScore(shavedPercent: number, comboMax: number): number {
  const base = shavedPercent * POINTS_PER_PERCENT;
  const bonus = base * (comboMax * COMBO_BONUS_PER_LEVEL);
  return Math.round(Math.max(0, base + bonus));
}

/**
 * Build the full RoundResult for a player given their mask and stats.
 */
export function buildRoundResult(
  playerId: string,
  mask: YakMask,
  hits: number,
  misses: number,
  comboMax: number,
): RoundResult {
  const shavedPercent = computeShavedPercent(mask);
  const score = computeScore(shavedPercent, comboMax);
  return { playerId, shavedPercent, hits, misses, comboMax, score };
}

// ── Leaderboard sorting ──────────────────────────────────────────────────────

/**
 * Sort an array of RoundResults from highest to lowest score.
 * Mutates the input array in-place and also returns it.
 */
export function rankLeaderboard(results: RoundResult[]): RoundResult[] {
  return results.sort((a, b) => b.score - a.score || b.shavedPercent - a.shavedPercent);
}
