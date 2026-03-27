/**
 * server/src/games/registry-40-paint-match/colorUtils.ts
 *
 * Pure, side-effect-free utilities for the Paint Match game.
 *
 * Responsibilities:
 *   1. Subtractive colour mixing  — blend five paint buckets (red, yellow,
 *      blue, white, black) into an RGB colour using a simplified
 *      RYB-to-RGB subtractive model.
 *   2. Perceptual colour distance  — CIE76 deltaE computed in CIELAB space.
 *   3. Scoring and ranking         — convert distance to points; rank players.
 *   4. Target colour generation    — random RGB target with minimum distance
 *      from previous targets.
 *
 * This module is imported by both the game plugin (server) and the test suite.
 * It has zero dependencies on Colyseus or Node.
 */

// ── Types ────────────────────────────────────────────────────────────────────

/** A paint mix: fractional amounts [0, 1] for each bucket. */
export interface PaintMix {
  red: number;
  yellow: number;
  blue: number;
  white: number;
  black: number;
}

/** An RGB triplet, each channel in [0, 255]. */
export type RGB = [number, number, number];

/** CIELAB triplet: L* [0, 100], a* and b* unbounded but typically [-128, 127]. */
export type Lab = [number, number, number];

/** Result for one player in a round. */
export interface RoundResult {
  playerId: string;
  mixRGB: RGB;
  distance: number; // CIE76 deltaE
  score: number;
  rank: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Maximum possible deltaE (rough upper bound used for scoring). */
const MAX_DELTA_E = 150;

/** Maximum score for a perfect (distance = 0) match. */
const PERFECT_SCORE = 1000;

/**
 * Minimum perceptual distance (deltaE) between consecutive target colours
 * so they feel visually distinct.
 */
export const MIN_TARGET_DISTANCE = 30;

/** Maximum random-generation attempts before accepting whatever we got. */
const MAX_GEN_ATTEMPTS = 50;

// ── Subtractive (RYB → RGB) colour mixing ───────────────────────────────────

/**
 * Convert a PaintMix to an RGB colour.
 *
 * The five paints correspond to the artist's primaries:
 *   red, yellow, blue  — subtractive primaries
 *   white              — lightens (tint)
 *   black              — darkens (shade)
 *
 * We use the Gosset & Chen trilinear interpolation for RYB→RGB
 * (simplified version) — the canonical cube corners are:
 *
 *   RYB (0,0,0) → RGB (255,255,255)  white
 *   RYB (1,0,0) → RGB (255,0,0)      red
 *   RYB (0,1,0) → RGB (255,255,0)    yellow
 *   RYB (0,0,1) → RGB (0,0,255)      blue
 *   RYB (1,1,0) → RGB (255,128,0)    orange
 *   RYB (1,0,1) → RGB (128,0,128)    purple
 *   RYB (0,1,1) → RGB (0,128,0)      green
 *   RYB (1,1,1) → RGB (0,0,0)        dark (near black)
 *
 * After the RYB→RGB conversion, white and black proportions shift the
 * result towards pure white / pure black.
 */
export function mixToRGB(mix: PaintMix): RGB {
  // Clamp each channel to [0, 1]
  const r = clamp01(mix.red);
  const y = clamp01(mix.yellow);
  const b = clamp01(mix.blue);
  const w = clamp01(mix.white);
  const k = clamp01(mix.black);

  // Total paint poured — if zero, return white (empty canvas)
  const total = r + y + b + w + k;
  if (total === 0) return [255, 255, 255];

  // Normalise RYB proportions out of the chromatic portion
  const chromatic = r + y + b;

  let baseR: number, baseG: number, baseB: number;

  if (chromatic === 0) {
    // Only white / black present
    baseR = 255;
    baseG = 255;
    baseB = 255;
  } else {
    // Normalised RYB coordinates in [0, 1]
    const rn = r / chromatic;
    const yn = y / chromatic;
    const bn = b / chromatic;

    // Trilinear interpolation across the RYB cube corners
    baseR = cubicInterp(rn, yn, bn, RYB_CUBE_R);
    baseG = cubicInterp(rn, yn, bn, RYB_CUBE_G);
    baseB = cubicInterp(rn, yn, bn, RYB_CUBE_B);
  }

  // Apply white (tint) and black (shade) as proportions of total
  const chromaticFrac = chromatic / total;
  const whiteFrac = w / total;
  const blackFrac = k / total;

  const finalR = Math.round(baseR * chromaticFrac + 255 * whiteFrac + 0 * blackFrac);
  const finalG = Math.round(baseG * chromaticFrac + 255 * whiteFrac + 0 * blackFrac);
  const finalB = Math.round(baseB * chromaticFrac + 255 * whiteFrac + 0 * blackFrac);

  return [
    clamp255(finalR),
    clamp255(finalG),
    clamp255(finalB),
  ];
}

/**
 * RYB cube corner values for each RGB output channel.
 * Index order: [R0Y0B0, R1Y0B0, R0Y1B0, R1Y1B0, R0Y0B1, R1Y0B1, R0Y1B1, R1Y1B1]
 */
const RYB_CUBE_R = [255, 255, 255, 255, 0, 128, 0, 0];
const RYB_CUBE_G = [255, 0, 255, 128, 0, 0, 128, 0];
const RYB_CUBE_B = [255, 0, 0, 0, 255, 128, 0, 0];

/** Trilinear interpolation inside a unit cube. */
function cubicInterp(r: number, y: number, b: number, corners: number[]): number {
  // corners indexed as [RYB] binary: 000, 100, 010, 110, 001, 101, 011, 111
  const c000 = corners[0];
  const c100 = corners[1];
  const c010 = corners[2];
  const c110 = corners[3];
  const c001 = corners[4];
  const c101 = corners[5];
  const c011 = corners[6];
  const c111 = corners[7];

  // Interpolate along R
  const c00 = c000 * (1 - r) + c100 * r;
  const c01 = c001 * (1 - r) + c101 * r;
  const c10 = c010 * (1 - r) + c110 * r;
  const c11 = c011 * (1 - r) + c111 * r;

  // Interpolate along Y
  const c0 = c00 * (1 - y) + c10 * y;
  const c1 = c01 * (1 - y) + c11 * y;

  // Interpolate along B
  return c0 * (1 - b) + c1 * b;
}

// ── CIE76 deltaE in CIELAB ──────────────────────────────────────────────────

/**
 * Compute perceptual colour distance between two RGB colours.
 * Uses CIE76 deltaE: Euclidean distance in CIELAB space.
 *
 * Returns a non-negative number. Typical range:
 *   0       = identical colours
 *   1–2     = not perceptible by most
 *   2–10    = noticeable if closely compared
 *   10–50   = clearly different
 *   50+     = very different colours
 */
export function deltaE(a: RGB, b: RGB): number {
  const labA = rgbToLab(a);
  const labB = rgbToLab(b);
  const dL = labA[0] - labB[0];
  const da = labA[1] - labB[1];
  const db = labA[2] - labB[2];
  return Math.sqrt(dL * dL + da * da + db * db);
}

/**
 * Convert sRGB [0, 255] to CIELAB.
 * Pipeline: sRGB → linear RGB → XYZ (D65) → CIELAB.
 */
export function rgbToLab(rgb: RGB): Lab {
  // sRGB → linear
  let r = rgb[0] / 255;
  let g = rgb[1] / 255;
  let b = rgb[2] / 255;

  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

  // Linear RGB → XYZ (D65 reference white)
  let x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  let y = (r * 0.2126729 + g * 0.7151522 + b * 0.0721750) / 1.0;
  let z = (r * 0.0193339 + g * 0.1191920 + b * 0.9503041) / 1.08883;

  // XYZ → CIELAB
  const epsilon = 0.008856;
  const kappa = 903.3;

  x = x > epsilon ? Math.cbrt(x) : (kappa * x + 16) / 116;
  y = y > epsilon ? Math.cbrt(y) : (kappa * y + 16) / 116;
  z = z > epsilon ? Math.cbrt(z) : (kappa * z + 16) / 116;

  const L = 116 * y - 16;
  const a = 500 * (x - y);
  const bStar = 200 * (y - z);

  return [L, a, bStar];
}

// ── Scoring ──────────────────────────────────────────────────────────────────

/**
 * Compute a score from 0–1000 based on the deltaE distance.
 * A perfect match (distance=0) gives 1000; the score drops linearly to 0
 * at MAX_DELTA_E, then stays at 0.
 */
export function computeScore(distance: number): number {
  const ratio = Math.min(1, Math.max(0, distance / MAX_DELTA_E));
  return Math.round(PERFECT_SCORE * (1 - ratio));
}

// ── Ranking ──────────────────────────────────────────────────────────────────

/**
 * Rank an array of RoundResults by distance (ascending — closest first).
 * Ties are broken by higher score (which is effectively the same ordering).
 * Mutates and returns the array. Assigns `rank` starting from 1.
 */
export function rankResults(results: RoundResult[]): RoundResult[] {
  results.sort((a, b) => a.distance - b.distance || b.score - a.score);
  for (let i = 0; i < results.length; i++) {
    results[i].rank = i + 1;
  }
  return results;
}

// ── Target colour generation ─────────────────────────────────────────────────

/**
 * Generate a random target RGB colour that is at least MIN_TARGET_DISTANCE
 * (in deltaE) from every colour in `previousTargets`.
 *
 * If the maximum attempts are exhausted, returns the best candidate found.
 */
export function generateTargetColor(previousTargets: RGB[] = []): RGB {
  let bestCandidate: RGB = randomRGB();
  let bestMinDist = minDistanceToPrevious(bestCandidate, previousTargets);

  for (let i = 0; i < MAX_GEN_ATTEMPTS; i++) {
    const candidate = randomRGB();
    const minDist = minDistanceToPrevious(candidate, previousTargets);

    if (minDist >= MIN_TARGET_DISTANCE) {
      return candidate;
    }

    if (minDist > bestMinDist) {
      bestCandidate = candidate;
      bestMinDist = minDist;
    }
  }

  return bestCandidate;
}

/** Generate a random RGB colour. */
function randomRGB(): RGB {
  return [
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256),
  ];
}

/** Return the minimum deltaE from `color` to any colour in `targets`. */
function minDistanceToPrevious(color: RGB, targets: RGB[]): number {
  if (targets.length === 0) return Infinity;
  let min = Infinity;
  for (const t of targets) {
    const d = deltaE(color, t);
    if (d < min) min = d;
  }
  return min;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}
