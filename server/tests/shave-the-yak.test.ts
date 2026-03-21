import { describe, it, expect, beforeEach } from "vitest";
import {
  createYakMask,
  applySwipe,
  computeShavedPercent,
  computeScore,
  buildRoundResult,
  rankLeaderboard,
  assignRank,
  SHAVE_RADIUS,
} from "../src/games/registry-19-shave-the-yak/shavedPercent";
import type { YakMask, RoundResult } from "../src/games/registry-19-shave-the-yak/shavedPercent";

// ── createYakMask ────────────────────────────────────────────────────────────

describe("createYakMask", () => {
  it("creates a mask with the correct dimensions", () => {
    const mask = createYakMask(100, 80);
    expect(mask.width).toBe(100);
    expect(mask.height).toBe(80);
    expect(mask.cells.length).toBe(100 * 80);
  });

  it("default ellipse has some fur cells and some empty cells", () => {
    const mask = createYakMask(100, 100);
    const furCount = mask.cells.reduce((s, v) => s + v, 0);
    const total = mask.cells.length;
    // Ellipse inscribed in 100x100 → ~78.5% area
    expect(furCount).toBeGreaterThan(total * 0.5);
    expect(furCount).toBeLessThan(total);
    expect(mask.totalFurCells).toBe(furCount);
  });

  it("totalFurCells matches actual fur cell count", () => {
    const mask = createYakMask(50, 50);
    const counted = mask.cells.reduce((s, v) => s + v, 0);
    expect(mask.totalFurCells).toBe(counted);
  });

  it("RLE encoding creates correct mask", () => {
    // 3 zeros, 4 ones, 3 zeros = 10 cells
    const mask = createYakMask(10, 1, "3,4,3");
    expect(mask.cells.length).toBe(10);
    expect(mask.totalFurCells).toBe(4);
    // First 3 = 0, next 4 = 1, last 3 = 0
    expect(mask.cells[0]).toBe(0);
    expect(mask.cells[2]).toBe(0);
    expect(mask.cells[3]).toBe(1);
    expect(mask.cells[6]).toBe(1);
    expect(mask.cells[7]).toBe(0);
    expect(mask.cells[9]).toBe(0);
  });

  it("RLE encoding handles all-fur mask", () => {
    // 0 zeros, 5 ones
    const mask = createYakMask(5, 1, "0,5");
    expect(mask.totalFurCells).toBe(5);
    for (let i = 0; i < 5; i++) {
      expect(mask.cells[i]).toBe(1);
    }
  });

  it("handles zero-size mask gracefully", () => {
    const mask = createYakMask(0, 0);
    expect(mask.cells.length).toBe(0);
    expect(mask.totalFurCells).toBe(0);
  });
});

// ── applySwipe ───────────────────────────────────────────────────────────────

describe("applySwipe", () => {
  let mask: YakMask;

  beforeEach(() => {
    // 50×50 all-fur mask (no ellipse — use RLE to fill everything)
    const allOnes = `0,${50 * 50}`;
    mask = createYakMask(50, 50, allOnes);
    expect(mask.totalFurCells).toBe(2500);
  });

  it("shaves cells near the swipe line", () => {
    const shaved = applySwipe(mask, { x: 25, y: 25 }, { x: 25, y: 25 }, 5);
    expect(shaved).toBeGreaterThan(0);
    // After shaving some cells, the remaining count should drop
    const remaining = mask.cells.reduce((s, v) => s + v, 0);
    expect(remaining).toBe(2500 - shaved);
  });

  it("returns 0 when swiping outside the mask", () => {
    const shaved = applySwipe(mask, { x: -100, y: -100 }, { x: -90, y: -90 }, 5);
    expect(shaved).toBe(0);
  });

  it("does not double-shave already shaved cells", () => {
    const first = applySwipe(mask, { x: 25, y: 25 }, { x: 25, y: 25 }, 5);
    const second = applySwipe(mask, { x: 25, y: 25 }, { x: 25, y: 25 }, 5);
    expect(first).toBeGreaterThan(0);
    expect(second).toBe(0);
  });

  it("shaves more cells with a longer swipe", () => {
    const mask1 = createYakMask(50, 50, `0,${2500}`);
    const mask2 = createYakMask(50, 50, `0,${2500}`);

    const shortSwipe = applySwipe(mask1, { x: 25, y: 25 }, { x: 26, y: 25 }, SHAVE_RADIUS);
    const longSwipe = applySwipe(mask2, { x: 5, y: 25 }, { x: 45, y: 25 }, SHAVE_RADIUS);

    expect(longSwipe).toBeGreaterThan(shortSwipe);
  });

  it("shaves more cells with a larger radius", () => {
    const mask1 = createYakMask(50, 50, `0,${2500}`);
    const mask2 = createYakMask(50, 50, `0,${2500}`);

    const smallRadius = applySwipe(mask1, { x: 25, y: 25 }, { x: 30, y: 25 }, 3);
    const largeRadius = applySwipe(mask2, { x: 25, y: 25 }, { x: 30, y: 25 }, 12);

    expect(largeRadius).toBeGreaterThan(smallRadius);
  });

  it("point tap (from === to) shaves a circular area", () => {
    const shaved = applySwipe(mask, { x: 25, y: 25 }, { x: 25, y: 25 }, 5);
    // A circle of radius 5 has area ~78.5 → expect roughly that many cells
    expect(shaved).toBeGreaterThanOrEqual(60);
    expect(shaved).toBeLessThanOrEqual(100);
  });
});

// ── computeShavedPercent ─────────────────────────────────────────────────────

describe("computeShavedPercent", () => {
  it("returns 0 for untouched mask", () => {
    const mask = createYakMask(50, 50);
    expect(computeShavedPercent(mask)).toBe(0);
  });

  it("returns 100 when all fur is shaved", () => {
    const mask = createYakMask(10, 1, "0,10");
    // Manually shave all cells
    for (let i = 0; i < mask.cells.length; i++) {
      mask.cells[i] = 0;
    }
    expect(computeShavedPercent(mask)).toBe(100);
  });

  it("returns 0 for empty mask (no fur cells)", () => {
    // All zeros = no fur
    const mask = createYakMask(10, 1, "10");
    expect(mask.totalFurCells).toBe(0);
    expect(computeShavedPercent(mask)).toBe(0);
  });

  it("returns correct percentage for partial shave", () => {
    const mask = createYakMask(10, 1, "0,10"); // 10 fur cells
    // Shave exactly 5 cells
    mask.cells[0] = 0;
    mask.cells[1] = 0;
    mask.cells[2] = 0;
    mask.cells[3] = 0;
    mask.cells[4] = 0;
    expect(computeShavedPercent(mask)).toBe(50);
  });

  it("matches pixel-mask simulation within 1% (acceptance criteria)", () => {
    // Create a 300×280 mask (production size) and apply known swipes
    const mask = createYakMask(300, 280);
    const totalFur = mask.totalFurCells;

    // Apply a large horizontal swipe across the center
    applySwipe(mask, { x: 0, y: 140 }, { x: 300, y: 140 });
    const pct = computeShavedPercent(mask);

    // Manually compute expected: count remaining fur
    const remaining = mask.cells.reduce((s, v) => s + v, 0);
    const expectedPct = ((totalFur - remaining) / totalFur) * 100;
    const rounded = Math.round(expectedPct * 100) / 100;

    expect(pct).toBe(rounded);
    expect(Math.abs(pct - expectedPct)).toBeLessThan(1);
  });

  it("percentage is clamped to [0, 100]", () => {
    const mask = createYakMask(10, 1, "0,10");
    // Corrupt: claim more fur was there than exists
    (mask as { totalFurCells: number }).totalFurCells = 5; // only 5, but 10 cells exist
    // 10 fur cells remain with totalFurCells=5 → shaved = 5-10 = negative
    // computeShavedPercent should clamp to 0
    const pct = computeShavedPercent(mask);
    expect(pct).toBeGreaterThanOrEqual(0);
    expect(pct).toBeLessThanOrEqual(100);
  });

  it("is rounded to 2 decimal places", () => {
    const mask = createYakMask(10, 1, "0,3"); // 3 fur cells
    mask.cells[0] = 0; // shave 1 of 3 → 33.333...%
    const pct = computeShavedPercent(mask);
    expect(pct).toBe(33.33);
  });
});

// ── assignRank ───────────────────────────────────────────────────────────────

describe("assignRank", () => {
  it("returns S for >= 90%", () => {
    expect(assignRank(90)).toBe("S");
    expect(assignRank(100)).toBe("S");
    expect(assignRank(95.5)).toBe("S");
  });

  it("returns A for 70-89%", () => {
    expect(assignRank(70)).toBe("A");
    expect(assignRank(89.99)).toBe("A");
  });

  it("returns B for 50-69%", () => {
    expect(assignRank(50)).toBe("B");
    expect(assignRank(69.99)).toBe("B");
  });

  it("returns C for 25-49%", () => {
    expect(assignRank(25)).toBe("C");
    expect(assignRank(49.99)).toBe("C");
  });

  it("returns D for < 25%", () => {
    expect(assignRank(0)).toBe("D");
    expect(assignRank(24.99)).toBe("D");
  });
});

// ── computeScore ─────────────────────────────────────────────────────────────

describe("computeScore", () => {
  it("returns 0 for 0% shaved", () => {
    expect(computeScore(0, 0)).toBe(0);
    expect(computeScore(0, 10)).toBe(0);
  });

  it("base score is shavedPercent * 10", () => {
    // combo = 0 → no bonus
    expect(computeScore(50, 0)).toBe(500);
    expect(computeScore(100, 0)).toBe(1000);
  });

  it("combo adds percentage bonus to base", () => {
    // combo=5 → bonus = base * (5 * 0.05) = base * 0.25
    // base = 100 * 10 = 1000, bonus = 250, total = 1250
    expect(computeScore(100, 5)).toBe(1250);
  });

  it("score is always non-negative integer", () => {
    const score = computeScore(1.23, 3);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(score)).toBe(true);
  });

  it("higher combo always yields higher score for same shaved%", () => {
    const low = computeScore(50, 2);
    const high = computeScore(50, 8);
    expect(high).toBeGreaterThan(low);
  });
});

// ── buildRoundResult ─────────────────────────────────────────────────────────

describe("buildRoundResult", () => {
  it("builds a consistent RoundResult", () => {
    const mask = createYakMask(10, 1, "0,10");
    mask.cells[0] = 0; // shave 1 of 10 → 10%
    const result = buildRoundResult("player1", mask, 5, 3, 4);
    expect(result.playerId).toBe("player1");
    expect(result.shavedPercent).toBe(10);
    expect(result.hits).toBe(5);
    expect(result.misses).toBe(3);
    expect(result.comboMax).toBe(4);
    expect(result.score).toBe(computeScore(10, 4));
  });
});

// ── rankLeaderboard ──────────────────────────────────────────────────────────

describe("rankLeaderboard", () => {
  it("sorts players by score descending", () => {
    const results: RoundResult[] = [
      { playerId: "a", shavedPercent: 30, hits: 10, misses: 5, comboMax: 2, score: 300 },
      { playerId: "b", shavedPercent: 80, hits: 20, misses: 1, comboMax: 7, score: 900 },
      { playerId: "c", shavedPercent: 50, hits: 15, misses: 3, comboMax: 4, score: 600 },
    ];
    const ranked = rankLeaderboard(results);
    expect(ranked[0].playerId).toBe("b");
    expect(ranked[1].playerId).toBe("c");
    expect(ranked[2].playerId).toBe("a");
  });

  it("breaks ties by shavedPercent descending", () => {
    const results: RoundResult[] = [
      { playerId: "x", shavedPercent: 40, hits: 10, misses: 5, comboMax: 2, score: 500 },
      { playerId: "y", shavedPercent: 60, hits: 12, misses: 3, comboMax: 3, score: 500 },
    ];
    const ranked = rankLeaderboard(results);
    expect(ranked[0].playerId).toBe("y");
    expect(ranked[1].playerId).toBe("x");
  });

  it("handles empty array", () => {
    expect(rankLeaderboard([])).toEqual([]);
  });

  it("single player returns unchanged", () => {
    const results: RoundResult[] = [
      { playerId: "solo", shavedPercent: 75, hits: 30, misses: 2, comboMax: 8, score: 900 },
    ];
    const ranked = rankLeaderboard(results);
    expect(ranked.length).toBe(1);
    expect(ranked[0].playerId).toBe("solo");
  });
});

// ── Integration: full shave flow ─────────────────────────────────────────────

describe("integration: full shave flow", () => {
  it("multiple swipes progressively increase shaved percent", () => {
    const mask = createYakMask(100, 100);
    const pct0 = computeShavedPercent(mask);
    expect(pct0).toBe(0);

    applySwipe(mask, { x: 10, y: 50 }, { x: 90, y: 50 });
    const pct1 = computeShavedPercent(mask);
    expect(pct1).toBeGreaterThan(0);

    applySwipe(mask, { x: 10, y: 30 }, { x: 90, y: 30 });
    const pct2 = computeShavedPercent(mask);
    expect(pct2).toBeGreaterThan(pct1);

    applySwipe(mask, { x: 10, y: 70 }, { x: 90, y: 70 });
    const pct3 = computeShavedPercent(mask);
    expect(pct3).toBeGreaterThan(pct2);
  });

  it("shaved percent never exceeds 100", () => {
    const mask = createYakMask(20, 20);
    // Blanket the entire mask with overlapping swipes
    for (let y = 0; y < 20; y += 2) {
      applySwipe(mask, { x: 0, y }, { x: 20, y }, 10);
    }
    const pct = computeShavedPercent(mask);
    expect(pct).toBeLessThanOrEqual(100);
    expect(pct).toBeGreaterThanOrEqual(90); // should be nearly 100
  });

  it("production-size mask (300x280) works correctly", () => {
    const mask = createYakMask(300, 280);
    expect(mask.totalFurCells).toBeGreaterThan(0);
    expect(mask.cells.length).toBe(300 * 280);

    // A few strategic swipes
    applySwipe(mask, { x: 50, y: 140 }, { x: 250, y: 140 });
    applySwipe(mask, { x: 150, y: 50 }, { x: 150, y: 230 });
    const pct = computeShavedPercent(mask);
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThan(100);
  });
});
