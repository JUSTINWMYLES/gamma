import { describe, it, expect } from "vitest";
import {
  canGuardSeeTarget,
  hasLineOfSight,
  isWall,
} from "../src/utils/los";
import type { TileMap } from "../src/utils/los";

// ── Test map (5x5) ────────────────────────────────────────────────────────────
// 0=floor, 1=wall
// . . . . .
// . # . . .
// . # . . .
// . . . . .
// . . . . .
const TEST_TILES = [
  0, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 0, 0, 0,
  0, 0, 0, 0, 0,
];

const MAP: TileMap = {
  width: 5,
  height: 5,
  tiles: TEST_TILES,
  wallTileIds: new Set([1]),
};

describe("isWall", () => {
  it("returns true for wall tiles", () => {
    expect(isWall(MAP, 1, 1)).toBe(true);
    expect(isWall(MAP, 1, 2)).toBe(true);
  });

  it("returns false for floor tiles", () => {
    expect(isWall(MAP, 0, 0)).toBe(false);
    expect(isWall(MAP, 2, 2)).toBe(false);
  });

  it("returns true for out-of-bounds positions", () => {
    expect(isWall(MAP, -1, 0)).toBe(true);
    expect(isWall(MAP, 10, 10)).toBe(true);
  });
});

describe("hasLineOfSight", () => {
  it("returns true for unobstructed line", () => {
    expect(hasLineOfSight(MAP, { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true);
  });

  it("returns false when wall blocks path", () => {
    // Ray from left of wall to right — should be blocked by column at x=1
    expect(hasLineOfSight(MAP, { x: 0, y: 1 }, { x: 4, y: 1 })).toBe(false);
  });

  it("returns true for same-tile", () => {
    expect(hasLineOfSight(MAP, { x: 2, y: 2 }, { x: 2, y: 2 })).toBe(true);
  });

  it("returns true for diagonal path that avoids walls", () => {
    // Diagonal from (0,0) to (4,4) — no walls on that path
    expect(hasLineOfSight(MAP, { x: 0, y: 0 }, { x: 4, y: 4 })).toBe(true);
  });
});

describe("canGuardSeeTarget", () => {
  const openMap: TileMap = {
    width: 10,
    height: 10,
    tiles: Array(100).fill(0),
    wallTileIds: new Set(),
  };

  it("sees target within range and FOV", () => {
    expect(
      canGuardSeeTarget(
        { x: 5, y: 5 },
        0, // facing right
        { x: 9, y: 5 },
        openMap,
        Math.PI / 3,
        6,
      ),
    ).toBe(true);
  });

  it("does not see target outside range", () => {
    expect(
      canGuardSeeTarget(
        { x: 0, y: 0 },
        0,
        { x: 9, y: 0 },
        openMap,
        Math.PI / 3,
        6,
      ),
    ).toBe(false);
  });

  it("does not see target outside FOV cone", () => {
    // Target is directly behind the guard (facing right, target is left)
    expect(
      canGuardSeeTarget(
        { x: 5, y: 5 },
        0, // facing right (+x)
        { x: 1, y: 5 }, // target is to the left
        openMap,
        Math.PI / 3,
        6,
      ),
    ).toBe(false);
  });

  it("does not see target when wall blocks LOS", () => {
    // Wall at (2,1) blocks view from (0,1) to (4,1)
    expect(
      canGuardSeeTarget(
        { x: 0, y: 1 },
        0, // facing right
        { x: 4, y: 1 },
        MAP,
        Math.PI / 3,
        6,
      ),
    ).toBe(false);
  });

  it("returns false when target is exactly at FOV boundary edge+epsilon", () => {
    const fov = Math.PI / 3;
    // Place target just outside the FOV angle
    const justOutsideAngle = fov + 0.01;
    const tx = 5 + 4 * Math.cos(justOutsideAngle);
    const ty = 5 + 4 * Math.sin(justOutsideAngle);
    expect(
      canGuardSeeTarget(
        { x: 5, y: 5 },
        0,
        { x: tx, y: ty },
        openMap,
        fov,
        6,
      ),
    ).toBe(false);
  });
});
