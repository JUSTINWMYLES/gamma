export interface TapSpeedCountsPayload {
  matchId: string;
  player1Id: string;
  player1Taps: number;
  player2Id: string;
  player2Taps: number;
}

export function resolveTapSpeedEndsAt(
  durationMs: number,
  endsAt?: number,
  now: number = Date.now(),
): number {
  return typeof endsAt === "number" ? endsAt : now + durationMs;
}

export function getTapSpeedTimeRemainingSecs(
  endsAt: number,
  now: number = Date.now(),
): number {
  return Math.max(0, (endsAt - now) / 1000);
}

export function getTapSpeedPerspectiveCounts(
  meId: string | undefined,
  payload: TapSpeedCountsPayload,
): { myTaps: number; opponentTaps: number } | null {
  if (meId === payload.player1Id) {
    return {
      myTaps: Math.max(0, payload.player1Taps),
      opponentTaps: Math.max(0, payload.player2Taps),
    };
  }

  if (meId === payload.player2Id) {
    return {
      myTaps: Math.max(0, payload.player2Taps),
      opponentTaps: Math.max(0, payload.player1Taps),
    };
  }

  return null;
}
