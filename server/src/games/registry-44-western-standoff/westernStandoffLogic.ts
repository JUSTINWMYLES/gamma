import { seededRng } from "../../utils/rng";

export interface OrientationSnapshot {
  alpha: number;
  beta: number;
  gamma: number;
}

export const MIN_TURN_DELTA_DEG = 120;
export const LANDSCAPE_GAMMA_TARGET_DEG = 90;
export const LANDSCAPE_GAMMA_TOLERANCE_DEG = 30;
export const AIM_BETA_MAX_DEG = 70;

export interface ShotValidation {
  valid: boolean;
  turnedAround: boolean;
  aimed: boolean;
}

export function normalizeOrientation(input: Partial<OrientationSnapshot>): OrientationSnapshot | null {
  const alpha = Number(input.alpha);
  const beta = Number(input.beta);
  const gamma = Number(input.gamma);

  if (!Number.isFinite(alpha) || !Number.isFinite(beta) || !Number.isFinite(gamma)) {
    return null;
  }

  return {
    alpha: normalizeDegrees(alpha),
    beta,
    gamma,
  };
}

export function normalizeDegrees(angle: number): number {
  const normalized = angle % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export function shortestAngleDelta(a: number, b: number): number {
  const diff = Math.abs(normalizeDegrees(a) - normalizeDegrees(b));
  return diff > 180 ? 360 - diff : diff;
}

export function isTurnedAround(
  baseline: OrientationSnapshot,
  current: OrientationSnapshot,
  minTurnDeltaDeg: number = MIN_TURN_DELTA_DEG,
): boolean {
  return shortestAngleDelta(baseline.alpha, current.alpha) >= minTurnDeltaDeg;
}

export function isLandscapeAimPose(
  current: OrientationSnapshot,
  gammaToleranceDeg: number = LANDSCAPE_GAMMA_TOLERANCE_DEG,
  maxBetaDeg: number = AIM_BETA_MAX_DEG,
): boolean {
  const gammaDistance = Math.abs(Math.abs(current.gamma) - LANDSCAPE_GAMMA_TARGET_DEG);
  return gammaDistance <= gammaToleranceDeg && Math.abs(current.beta) <= maxBetaDeg;
}

export function validateShotPose(
  baseline: OrientationSnapshot,
  current: OrientationSnapshot,
): ShotValidation {
  const turnedAround = isTurnedAround(baseline, current);
  const aimed = isLandscapeAimPose(current);
  return {
    valid: turnedAround && aimed,
    turnedAround,
    aimed,
  };
}

export function pickDeterministicWinner(playerIds: string[], seed: number): string {
  if (playerIds.length === 0) return "";
  if (playerIds.length === 1) return playerIds[0] ?? "";
  const rng = seededRng(seed);
  return playerIds[Math.floor(rng() * playerIds.length)] ?? playerIds[0] ?? "";
}
