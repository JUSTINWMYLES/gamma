import { describe, it, expect } from "vitest";
import { seededRng, seededShuffle, generateRoomCode } from "../src/utils/rng";
import { buildBracket, advanceBracket } from "../src/utils/bracket";

describe("seededRng", () => {
  it("produces values in [0, 1)", () => {
    const rng = seededRng(12345);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("is deterministic — same seed produces same sequence", () => {
    const a = seededRng(99);
    const b = seededRng(99);
    for (let i = 0; i < 20; i++) {
      expect(a()).toBe(b());
    }
  });

  it("different seeds produce different sequences", () => {
    const a = seededRng(1);
    const b = seededRng(2);
    // Very unlikely to be identical for any first value
    expect(a()).not.toBe(b());
  });
});

describe("seededShuffle", () => {
  const arr = ["a", "b", "c", "d", "e", "f"];

  it("returns same length as input", () => {
    expect(seededShuffle(arr, 42).length).toBe(arr.length);
  });

  it("contains all original elements", () => {
    const shuffled = seededShuffle(arr, 42);
    for (const el of arr) expect(shuffled).toContain(el);
  });

  it("does not mutate original array", () => {
    const original = [...arr];
    seededShuffle(arr, 42);
    expect(arr).toEqual(original);
  });

  it("is deterministic", () => {
    expect(seededShuffle(arr, 7)).toEqual(seededShuffle(arr, 7));
  });

  it("different seeds produce different orderings (high probability)", () => {
    const s1 = seededShuffle(arr, 1);
    const s2 = seededShuffle(arr, 2);
    // With 6 elements, P(identical) ≈ 1/720 — safe to assert
    expect(s1).not.toEqual(s2);
  });
});

describe("generateRoomCode", () => {
  it("returns 4 characters", () => {
    expect(generateRoomCode().length).toBe(4);
  });

  it("only contains allowed characters (no 0, O, 1, I, 5, S, 2, Z)", () => {
    for (let i = 0; i < 100; i++) {
      const code = generateRoomCode();
      expect(code).not.toMatch(/[01IOSZ25]/);
    }
  });

  it("is uppercase", () => {
    const code = generateRoomCode();
    expect(code).toBe(code.toUpperCase());
  });
});

describe("bracket builder", () => {
  it("builds bracket with even player count", () => {
    const state = buildBracket(["p1", "p2", "p3", "p4"], 42);
    expect(state.rounds.length).toBe(1);
    expect(state.rounds[0].matches.length).toBe(2);
    // All matches have two real players
    for (const m of state.rounds[0].matches) {
      expect(m.player1Id).not.toBe("");
      expect(m.player2Id).not.toBe("BYE");
    }
  });

  it("handles odd player count with a bye", () => {
    const state = buildBracket(["p1", "p2", "p3"], 1);
    const matches = state.rounds[0].matches;
    // 1 real match + 1 bye match = 2 entries
    expect(matches.length).toBe(2);
    const byeMatch = matches.find((m) => m.player2Id === "BYE");
    expect(byeMatch).toBeDefined();
    expect(byeMatch!.winnerId).toBe(byeMatch!.player1Id);
    expect(byeMatch!.status).toBe("complete");
  });

  it("is deterministic with same seed", () => {
    const a = buildBracket(["p1", "p2", "p3", "p4"], 42);
    const b = buildBracket(["p1", "p2", "p3", "p4"], 42);
    expect(a.rounds[0].matches[0].player1Id).toBe(b.rounds[0].matches[0].player1Id);
  });

  it("advances bracket after round completion", () => {
    const state = buildBracket(["p1", "p2", "p3", "p4"], 1);
    // Manually set winners
    state.rounds[0].matches[0].winnerId = "p1";
    state.rounds[0].matches[0].status = "complete";
    state.rounds[0].matches[1].winnerId = "p3";
    state.rounds[0].matches[1].status = "complete";

    advanceBracket(state, 10);

    expect(state.rounds.length).toBe(2);
    const finalMatch = state.rounds[1].matches[0];
    expect([finalMatch.player1Id, finalMatch.player2Id]).toContain("p1");
    expect([finalMatch.player1Id, finalMatch.player2Id]).toContain("p3");
  });

  it("does not advance when only 1 winner remains", () => {
    const state = buildBracket(["p1", "p2"], 1);
    state.rounds[0].matches[0].winnerId = "p1";
    state.rounds[0].matches[0].status = "complete";
    advanceBracket(state, 10);
    // Should still be just 1 round — tournament over
    expect(state.rounds.length).toBe(1);
  });
});
