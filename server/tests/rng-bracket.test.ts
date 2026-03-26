import { describe, it, expect } from "vitest";
import { seededRng, seededShuffle, generateRoomCode } from "../src/utils/rng";
import { buildBracket, advanceBracket, getMatchPlayers, resolveHeat1v1 } from "../src/utils/bracket";

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
    expect(state.rounds[0]!.heats.length).toBe(2);
    // All heats have two real players
    for (const h of state.rounds[0]!.heats) {
      const [p1, p2] = getMatchPlayers(h);
      expect(p1).not.toBe("");
      expect(p2).not.toBe("");
    }
  });

  it("handles odd player count with a bye", () => {
    const state = buildBracket(["p1", "p2", "p3"], 1);
    const heats = state.rounds[0]!.heats;
    // 1 real heat + 1 bye heat = 2 entries
    expect(heats.length).toBe(2);
    const byeHeat = [...heats].find((h: any) => h.playerIds.length === 1);
    expect(byeHeat).toBeDefined();
    expect(byeHeat!.advancingIds[0]).toBe(byeHeat!.playerIds[0]);
    expect(byeHeat!.status).toBe("complete");
  });

  it("is deterministic with same seed", () => {
    const a = buildBracket(["p1", "p2", "p3", "p4"], 42);
    const b = buildBracket(["p1", "p2", "p3", "p4"], 42);
    const [aP1] = getMatchPlayers(a.rounds[0]!.heats[0]!);
    const [bP1] = getMatchPlayers(b.rounds[0]!.heats[0]!);
    expect(aP1).toBe(bP1);
  });

  it("advances bracket after round completion", () => {
    const state = buildBracket(["p1", "p2", "p3", "p4"], 1);
    // Manually resolve heats
    const heat0 = state.rounds[0]!.heats[0]!;
    const heat1 = state.rounds[0]!.heats[1]!;
    resolveHeat1v1(heat0, "p1");
    resolveHeat1v1(heat1, "p3");

    advanceBracket(state, 10);

    expect(state.rounds.length).toBe(2);
    const finalHeat = state.rounds[1]!.heats[0]!;
    const [fp1, fp2] = getMatchPlayers(finalHeat);
    expect([fp1, fp2]).toContain("p1");
    expect([fp1, fp2]).toContain("p3");
  });

  it("does not advance when only 1 winner remains", () => {
    const state = buildBracket(["p1", "p2"], 1);
    resolveHeat1v1(state.rounds[0]!.heats[0]!, "p1");
    advanceBracket(state, 10);
    // Should still be just 1 round — tournament over
    expect(state.rounds.length).toBe(1);
  });
});
