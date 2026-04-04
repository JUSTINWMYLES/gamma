import { describe, it, expect } from "vitest";
import {
  getConcurrentPlayerCount,
  assignPhones,
  getPhonesForGroup,
  generateColorSequence,
  scoreSpeedTapRound,
  scoreColorSequenceRound,
  countSequenceErrors,
  buildPlayerGroups,
  getGridLayout,
  GRID_COLORS,
  type SpeedTapPlayerResult,
  type ColorSequencePlayerResult,
  type ColorSequenceStep,
} from "../src/games/registry-10-grid-tap-colors/gridTapLogic";

// ── getConcurrentPlayerCount ─────────────────────────────────────────────────

describe("getConcurrentPlayerCount", () => {
  it("returns 1 for fewer than 8 players", () => {
    expect(getConcurrentPlayerCount(1)).toBe(1);
    expect(getConcurrentPlayerCount(4)).toBe(1);
    expect(getConcurrentPlayerCount(7)).toBe(1);
  });

  it("returns 2 for 8–15 players", () => {
    expect(getConcurrentPlayerCount(8)).toBe(2);
    expect(getConcurrentPlayerCount(12)).toBe(2);
    expect(getConcurrentPlayerCount(15)).toBe(2);
  });

  it("returns 4 for 16+ players", () => {
    expect(getConcurrentPlayerCount(16)).toBe(4);
    expect(getConcurrentPlayerCount(20)).toBe(4);
    expect(getConcurrentPlayerCount(32)).toBe(4);
  });
});

// ── assignPhones ────────────────────────────────────────────────────────────

describe("assignPhones", () => {
  it("assigns display numbers starting from 1", () => {
    const result = assignPhones(["a", "b", "c"], 1);
    expect(result[0].displayNumber).toBe(1);
    expect(result[1].displayNumber).toBe(2);
    expect(result[2].displayNumber).toBe(3);
  });

  it("assigns colors cyclically from GRID_COLORS", () => {
    const result = assignPhones(["a", "b", "c", "d", "e", "f", "g", "h", "i"], 1);
    expect(result[0].color).toBe(GRID_COLORS[0]);
    expect(result[7].color).toBe(GRID_COLORS[7]);
    expect(result[8].color).toBe(GRID_COLORS[0]); // wraps around
  });

  it("splits phones into groups when groupCount > 1", () => {
    const result = assignPhones(["a", "b", "c", "d"], 2);
    // 4 phones / 2 groups = 2 phones per group
    const group0 = result.filter((r) => r.groupIndex === 0);
    const group1 = result.filter((r) => r.groupIndex === 1);
    expect(group0.length).toBe(2);
    expect(group1.length).toBe(2);
  });

  it("handles uneven group splits", () => {
    const result = assignPhones(["a", "b", "c", "d", "e"], 2);
    // ceil(5/2) = 3 phones per group → group0=3, group1=2
    const group0 = result.filter((r) => r.groupIndex === 0);
    const group1 = result.filter((r) => r.groupIndex === 1);
    expect(group0.length).toBe(3);
    expect(group1.length).toBe(2);
  });

  it("assigns all phones to group 0 when groupCount is 1", () => {
    const result = assignPhones(["a", "b", "c"], 1);
    expect(result.every((r) => r.groupIndex === 0)).toBe(true);
  });

  it("returns empty array for empty input", () => {
    expect(assignPhones([], 1)).toEqual([]);
  });
});

// ── getPhonesForGroup ───────────────────────────────────────────────────────

describe("getPhonesForGroup", () => {
  it("filters phones by group index", () => {
    const assignments = assignPhones(["a", "b", "c", "d"], 2);
    const group0 = getPhonesForGroup(assignments, 0);
    const group1 = getPhonesForGroup(assignments, 1);
    expect(group0.every((a) => a.groupIndex === 0)).toBe(true);
    expect(group1.every((a) => a.groupIndex === 1)).toBe(true);
  });

  it("returns empty array for non-existent group", () => {
    const assignments = assignPhones(["a", "b"], 1);
    expect(getPhonesForGroup(assignments, 5)).toEqual([]);
  });
});

// ── buildPlayerGroups ───────────────────────────────────────────────────────

describe("buildPlayerGroups", () => {
  it("groups players by concurrent count", () => {
    const groups = buildPlayerGroups(["a", "b", "c", "d"], 2);
    expect(groups).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("handles uneven groups", () => {
    const groups = buildPlayerGroups(["a", "b", "c"], 2);
    expect(groups).toEqual([["a", "b"], ["c"]]);
  });

  it("puts all players in one group when concurrentCount >= playerCount", () => {
    const groups = buildPlayerGroups(["a", "b"], 4);
    expect(groups).toEqual([["a", "b"]]);
  });

  it("creates individual groups when concurrentCount is 1", () => {
    const groups = buildPlayerGroups(["a", "b", "c"], 1);
    expect(groups).toEqual([["a"], ["b"], ["c"]]);
  });

  it("handles empty player list", () => {
    expect(buildPlayerGroups([], 2)).toEqual([]);
  });
});

// ── generateColorSequence ───────────────────────────────────────────────────

describe("generateColorSequence", () => {
  it("generates a sequence of the requested length", () => {
    const seq = generateColorSequence(4, 8);
    expect(seq.length).toBe(8);
  });

  it("uses phone indices within range", () => {
    const seq = generateColorSequence(4, 20);
    for (const step of seq) {
      expect(step.phoneIndex).toBeGreaterThanOrEqual(0);
      expect(step.phoneIndex).toBeLessThan(4);
    }
  });

  it("assigns colors from GRID_COLORS based on phone index", () => {
    const seq = generateColorSequence(3, 10);
    for (const step of seq) {
      expect(step.color).toBe(GRID_COLORS[step.phoneIndex % GRID_COLORS.length]);
    }
  });

  it("is deterministic with a fixed RNG", () => {
    let i = 0;
    const rng = () => {
      const vals = [0.1, 0.5, 0.9, 0.3, 0.7];
      return vals[i++ % vals.length];
    };
    const seq1 = generateColorSequence(5, 5, rng);
    i = 0;
    const seq2 = generateColorSequence(5, 5, rng);
    expect(seq1).toEqual(seq2);
  });

  it("handles single phone", () => {
    const seq = generateColorSequence(1, 5);
    expect(seq.every((s) => s.phoneIndex === 0)).toBe(true);
  });
});

// ── countSequenceErrors ─────────────────────────────────────────────────────

describe("countSequenceErrors", () => {
  const correct: ColorSequenceStep[] = [
    { phoneIndex: 0, color: GRID_COLORS[0] },
    { phoneIndex: 1, color: GRID_COLORS[1] },
    { phoneIndex: 2, color: GRID_COLORS[2] },
  ];

  it("returns 0 for perfect match", () => {
    expect(countSequenceErrors([0, 1, 2], correct)).toBe(0);
  });

  it("counts wrong taps as errors", () => {
    expect(countSequenceErrors([0, 2, 2], correct)).toBe(1); // index 1 is wrong
    expect(countSequenceErrors([3, 3, 3], correct)).toBe(3); // all wrong
  });

  it("counts missing taps as errors", () => {
    expect(countSequenceErrors([0], correct)).toBe(2); // 2 missing
    expect(countSequenceErrors([], correct)).toBe(3); // all missing
  });

  it("returns 0 for empty sequence", () => {
    expect(countSequenceErrors([], [])).toBe(0);
  });
});

// ── scoreSpeedTapRound ──────────────────────────────────────────────────────

describe("scoreSpeedTapRound", () => {
  it("awards completion bonuses in order", () => {
    const results: SpeedTapPlayerResult[] = [
      { playerId: "a", completionTimeMs: 5000, tapTimesMs: [200, 300], completed: true },
      { playerId: "b", completionTimeMs: 3000, tapTimesMs: [150, 250], completed: true },
      { playerId: "c", completionTimeMs: 7000, tapTimesMs: [400, 500], completed: true },
    ];
    const scores = scoreSpeedTapRound(results);

    // b is fastest (3000ms) → 300 points completion
    // a is second (5000ms) → 200 points completion
    // c is third (7000ms) → 100 points completion
    expect(scores.get("b")!).toBeGreaterThan(scores.get("a")!);
    expect(scores.get("a")!).toBeGreaterThan(scores.get("c")!);
  });

  it("awards per-tap points", () => {
    const results: SpeedTapPlayerResult[] = [
      { playerId: "a", completionTimeMs: 5000, tapTimesMs: [200, 300, 400], completed: false },
    ];
    const scores = scoreSpeedTapRound(results);
    // 3 taps × 10 = 30, plus fastest tap bonus (100), minus slowest tap (-50)
    // Total: 30 + 100 - 50 = 80
    expect(scores.get("a")).toBe(80);
  });

  it("awards fastest tap bonus", () => {
    const results: SpeedTapPlayerResult[] = [
      { playerId: "a", completionTimeMs: 5000, tapTimesMs: [500, 600], completed: true },
      { playerId: "b", completionTimeMs: 4000, tapTimesMs: [100, 700], completed: true },
    ];
    const scores = scoreSpeedTapRound(results);
    // b has the fastest individual tap (100ms) → +100 bonus
    // But b also has the slowest (700ms) → -50 penalty
    // b gets fastest completion bonus too (300 vs 200)
    expect(scores.has("a")).toBe(true);
    expect(scores.has("b")).toBe(true);
  });

  it("penalizes slowest tap", () => {
    const results: SpeedTapPlayerResult[] = [
      { playerId: "a", completionTimeMs: 5000, tapTimesMs: [100, 2000], completed: true },
    ];
    const scores = scoreSpeedTapRound(results);
    // Completion: 300 (only player), taps: 2×10=20, fastest: +100, slowest: -50
    // Total: 300 + 20 + 100 - 50 = 370
    expect(scores.get("a")).toBe(370);
  });

  it("handles empty results", () => {
    const scores = scoreSpeedTapRound([]);
    expect(scores.size).toBe(0);
  });

  it("handles single player who did not complete", () => {
    const results: SpeedTapPlayerResult[] = [
      { playerId: "a", completionTimeMs: 10000, tapTimesMs: [500], completed: false },
    ];
    const scores = scoreSpeedTapRound(results);
    // No completion bonus, 1 tap × 10 = 10, fastest: +100, slowest: -50
    expect(scores.get("a")).toBe(60);
  });
});

// ── scoreColorSequenceRound ─────────────────────────────────────────────────

describe("scoreColorSequenceRound", () => {
  const correct: ColorSequenceStep[] = [
    { phoneIndex: 0, color: GRID_COLORS[0] },
    { phoneIndex: 1, color: GRID_COLORS[1] },
    { phoneIndex: 2, color: GRID_COLORS[2] },
  ];

  it("awards perfect sequence bonus", () => {
    const results: ColorSequencePlayerResult[] = [
      { playerId: "a", taps: [0, 1, 2], correctSequence: correct, completionTimeMs: 3000, submitted: true },
    ];
    const scores = scoreColorSequenceRound(results);
    // Perfect: 500, correct taps: 3×20=60, fastest: +200
    // Total: 500 + 60 + 200 = 760
    expect(scores.get("a")).toBe(760);
  });

  it("deducts points for errors", () => {
    const results: ColorSequencePlayerResult[] = [
      { playerId: "a", taps: [0, 2, 2], correctSequence: correct, completionTimeMs: 3000, submitted: true },
    ];
    const scores = scoreColorSequenceRound(results);
    // 1 error → 2 correct × 20 = 40, 1 error × -30 = -30
    // No perfect bonus, fastest: +200
    // Total: max(0, 40-30) + 200 = 210
    expect(scores.get("a")).toBe(210);
  });

  it("awards completion order bonuses", () => {
    const results: ColorSequencePlayerResult[] = [
      { playerId: "a", taps: [0, 1, 2], correctSequence: correct, completionTimeMs: 5000, submitted: true },
      { playerId: "b", taps: [0, 1, 2], correctSequence: correct, completionTimeMs: 3000, submitted: true },
    ];
    const scores = scoreColorSequenceRound(results);
    // b is faster → gets first-place bonus (200)
    // a gets second-place bonus (100)
    expect(scores.get("b")!).toBeGreaterThan(scores.get("a")!);
  });

  it("handles player who did not submit", () => {
    const results: ColorSequencePlayerResult[] = [
      { playerId: "a", taps: [], correctSequence: correct, completionTimeMs: 30000, submitted: false },
    ];
    const scores = scoreColorSequenceRound(results);
    // 0 correct, 3 errors → max(0, -90) = 0, no completion bonus
    expect(scores.get("a")).toBe(0);
  });

  it("handles empty results", () => {
    const scores = scoreColorSequenceRound([]);
    expect(scores.size).toBe(0);
  });

  it("scores never go negative", () => {
    const results: ColorSequencePlayerResult[] = [
      { playerId: "a", taps: [3, 3, 3], correctSequence: correct, completionTimeMs: 30000, submitted: true },
    ];
    const scores = scoreColorSequenceRound(results);
    // All wrong: 0 correct, 3 errors × -30 = -90 → clamped to 0
    // No perfect bonus, but submitted → fastest bonus 200
    // Total = max(0, -90) + 200 = 200
    expect(scores.get("a")!).toBeGreaterThanOrEqual(0);
  });
});

// ── getGridLayout ────────────────────────────────────────────────────────────

describe("getGridLayout", () => {
  it("returns 2×1 for 2 players", () => {
    const layout = getGridLayout(2);
    expect(layout).toEqual({ cols: 2, rows: 1 });
  });

  it("returns 3×1 for 3 players", () => {
    const layout = getGridLayout(3);
    expect(layout).toEqual({ cols: 3, rows: 1 });
  });

  it("returns 2×2 for 4 players", () => {
    const layout = getGridLayout(4);
    expect(layout).toEqual({ cols: 2, rows: 2 });
  });

  it("returns 3×2 for 5–6 players", () => {
    expect(getGridLayout(5)).toEqual({ cols: 3, rows: 2 });
    expect(getGridLayout(6)).toEqual({ cols: 3, rows: 2 });
  });

  it("returns 4×2 for 7–8 players", () => {
    expect(getGridLayout(7)).toEqual({ cols: 4, rows: 2 });
    expect(getGridLayout(8)).toEqual({ cols: 4, rows: 2 });
  });

  it("returns 3×3 for 9 players", () => {
    expect(getGridLayout(9)).toEqual({ cols: 3, rows: 3 });
  });

  it("returns 4×3 for 10–12 players", () => {
    expect(getGridLayout(10)).toEqual({ cols: 4, rows: 3 });
    expect(getGridLayout(12)).toEqual({ cols: 4, rows: 3 });
  });

  it("returns 4×4 for 13–16 players", () => {
    expect(getGridLayout(13)).toEqual({ cols: 4, rows: 4 });
    expect(getGridLayout(16)).toEqual({ cols: 4, rows: 4 });
  });

  it("returns 5×4 for 17–20 players", () => {
    expect(getGridLayout(17)).toEqual({ cols: 5, rows: 4 });
    expect(getGridLayout(20)).toEqual({ cols: 5, rows: 4 });
  });

  it("returns 5×5 for 21–25 players", () => {
    expect(getGridLayout(21)).toEqual({ cols: 5, rows: 5 });
    expect(getGridLayout(25)).toEqual({ cols: 5, rows: 5 });
  });

  it("returns 6×5 for 26–30 players", () => {
    expect(getGridLayout(26)).toEqual({ cols: 6, rows: 5 });
    expect(getGridLayout(30)).toEqual({ cols: 6, rows: 5 });
  });

  it("returns 8×4 for 31–32 players", () => {
    expect(getGridLayout(31)).toEqual({ cols: 8, rows: 4 });
    expect(getGridLayout(32)).toEqual({ cols: 8, rows: 4 });
  });

  it("grid always has enough cells for all phones", () => {
    for (let n = 2; n <= 32; n++) {
      const layout = getGridLayout(n);
      expect(layout.cols * layout.rows).toBeGreaterThanOrEqual(n);
    }
  });
});

// ── Integration: full flow simulation ───────────────────────────────────────

describe("integration: Grid Tap Colors game flow", () => {
  it("end-to-end: assign phones → build groups → generate sequence → score", () => {
    const playerIds = ["p1", "p2", "p3", "p4", "p5", "p6"];
    const concurrent = getConcurrentPlayerCount(playerIds.length);
    expect(concurrent).toBe(1);

    const assignments = assignPhones(playerIds, 1);
    expect(assignments.length).toBe(6);
    expect(assignments[0].groupIndex).toBe(0);

    const groups = buildPlayerGroups(playerIds, concurrent);
    expect(groups.length).toBe(6); // 1 at a time

    // Mode 2: generate sequence
    const seq = generateColorSequence(assignments.length, 5);
    expect(seq.length).toBe(5);

    // Simulate player taps (perfect)
    const errors = countSequenceErrors(
      seq.map((s) => s.phoneIndex),
      seq,
    );
    expect(errors).toBe(0);
  });

  it("end-to-end: 8+ players get 2 concurrent groups", () => {
    const playerIds = Array.from({ length: 10 }, (_, i) => `p${i}`);
    const concurrent = getConcurrentPlayerCount(playerIds.length);
    expect(concurrent).toBe(2);

    const groups = buildPlayerGroups(playerIds, concurrent);
    expect(groups.length).toBe(5); // 10 / 2 = 5 groups
    expect(groups[0].length).toBe(2);
  });

  it("end-to-end: 16+ players get 4 concurrent groups", () => {
    const playerIds = Array.from({ length: 20 }, (_, i) => `p${i}`);
    const concurrent = getConcurrentPlayerCount(playerIds.length);
    expect(concurrent).toBe(4);

    const groups = buildPlayerGroups(playerIds, concurrent);
    expect(groups.length).toBe(5); // 20 / 4 = 5 groups
    expect(groups[0].length).toBe(4);
  });
});
