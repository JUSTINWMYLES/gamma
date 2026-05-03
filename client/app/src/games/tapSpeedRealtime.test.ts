import { describe, expect, it } from "vitest";
import {
  getTapSpeedPerspectiveCounts,
  getTapSpeedTimeRemainingSecs,
  resolveTapSpeedEndsAt,
} from "./tapSpeedRealtime";

describe("tapSpeedRealtime", () => {
  it("prefers the server end timestamp when provided", () => {
    expect(resolveTapSpeedEndsAt(5_000, 12_345, 1_000)).toBe(12_345);
  });

  it("falls back to a local timer origin when no end timestamp is provided", () => {
    expect(resolveTapSpeedEndsAt(5_000, undefined, 1_000)).toBe(6_000);
  });

  it("computes non-negative remaining seconds from an end timestamp", () => {
    expect(getTapSpeedTimeRemainingSecs(10_000, 7_500)).toBe(2.5);
    expect(getTapSpeedTimeRemainingSecs(10_000, 11_000)).toBe(0);
  });

  it("maps live tap counts into the current player's perspective", () => {
    expect(
      getTapSpeedPerspectiveCounts("p1", {
        matchId: "heat-1",
        player1Id: "p1",
        player1Taps: 6,
        player2Id: "p2",
        player2Taps: 4,
      }),
    ).toEqual({ myTaps: 6, opponentTaps: 4 });

    expect(
      getTapSpeedPerspectiveCounts("p2", {
        matchId: "heat-1",
        player1Id: "p1",
        player1Taps: 6,
        player2Id: "p2",
        player2Taps: 4,
      }),
    ).toEqual({ myTaps: 4, opponentTaps: 6 });
  });

  it("returns null for non-participants", () => {
    expect(
      getTapSpeedPerspectiveCounts("spectator", {
        matchId: "heat-1",
        player1Id: "p1",
        player1Taps: 6,
        player2Id: "p2",
        player2Taps: 4,
      }),
    ).toBeNull();
  });
});
