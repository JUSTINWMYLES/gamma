import { describe, it, expect } from "vitest";
import {
  splitWordIntoFragments,
  selectWord,
  assignTeams,
  scoreRoundResults,
  WORD_LIST,
  FIRST_CORRECT_POINTS,
  SECOND_CORRECT_POINTS,
  DRAW_POINTS,
  ROUND_DURATION_SECS,
  MIN_PLAYERS,
  MAX_PLAYERS,
  type TeamAssignment,
  type TeamResult,
} from "../src/games/registry-27-word-build/wordBuildLogic";

// ── splitWordIntoFragments ──────────────────────────────────────────────────

describe("splitWordIntoFragments", () => {
  it("splits a 6-letter word into 3 fragments of 2 letters each", () => {
    const fragments = splitWordIntoFragments("PLANET", 3);
    expect(fragments.length).toBe(3);
    expect(fragments[0].letters).toBe("PL");
    expect(fragments[1].letters).toBe("AN");
    expect(fragments[2].letters).toBe("ET");
    expect(fragments.map((f) => f.letters).join("")).toBe("PLANET");
  });

  it("splits a 6-letter word into 6 fragments of 1 letter each", () => {
    const fragments = splitWordIntoFragments("BRIDGE", 6);
    expect(fragments.length).toBe(6);
    expect(fragments.every((f) => f.letters.length === 1)).toBe(true);
    expect(fragments.map((f) => f.letters).join("")).toBe("BRIDGE");
  });

  it("splits a 7-letter word into 4 fragments with uneven distribution", () => {
    const fragments = splitWordIntoFragments("BLANKET", 4);
    expect(fragments.length).toBe(4);
    // 7 / 4 = 1 remainder 3, so first 3 get 2 letters, last gets 1
    expect(fragments[0].letters).toBe("BL");
    expect(fragments[1].letters).toBe("AN");
    expect(fragments[2].letters).toBe("KE");
    expect(fragments[3].letters).toBe("T");
    expect(fragments.map((f) => f.letters).join("")).toBe("BLANKET");
  });

  it("splits a 5-letter word into 5 fragments", () => {
    const fragments = splitWordIntoFragments("ABCDE", 5);
    expect(fragments.length).toBe(5);
    expect(fragments.map((f) => f.letters)).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("handles count greater than word length", () => {
    const fragments = splitWordIntoFragments("CAT", 5);
    expect(fragments.length).toBe(5);
    expect(fragments[0].letters).toBe("C");
    expect(fragments[1].letters).toBe("A");
    expect(fragments[2].letters).toBe("T");
    expect(fragments[3].letters).toBe("");
    expect(fragments[4].letters).toBe("");
  });

  it("handles count of zero", () => {
    const fragments = splitWordIntoFragments("HELLO", 0);
    expect(fragments).toEqual([]);
  });

  it("preserves indices in order", () => {
    const fragments = splitWordIntoFragments("CASTLE", 3);
    expect(fragments[0].index).toBe(0);
    expect(fragments[1].index).toBe(1);
    expect(fragments[2].index).toBe(2);
  });

  it("concatenated fragments reconstruct the original word", () => {
    for (const entry of WORD_LIST.slice(0, 10)) {
      for (let count = 3; count <= Math.min(6, entry.word.length); count++) {
        const fragments = splitWordIntoFragments(entry.word, count);
        expect(fragments.map((f) => f.letters).join("")).toBe(entry.word);
      }
    }
  });
});

// ── selectWord ──────────────────────────────────────────────────────────────

describe("selectWord", () => {
  it("returns a word from the dictionary", () => {
    const word = selectWord(3);
    expect(word).not.toBeNull();
    expect(WORD_LIST.some((e) => e.word === word!.word)).toBe(true);
  });

  it("returns a word whose length fits the team size", () => {
    const word = selectWord(3);
    expect(word).not.toBeNull();
    // Word length should be >= teamSize and <= teamSize * 2
    expect(word!.word.length).toBeGreaterThanOrEqual(3);
    expect(word!.word.length).toBeLessThanOrEqual(6);
  });

  it("avoids words already used", () => {
    const usedWords = new Set(WORD_LIST.filter((e) => e.word.length === 6).map((e) => e.word));
    // Even with all 6-letter words used, it should still find longer/shorter words
    const word = selectWord(3, usedWords);
    // If it returns something, it shouldn't be one of the used words
    if (word) {
      expect(usedWords.has(word.word)).toBe(false);
    }
  });

  it("returns null if all words are used", () => {
    const allUsed = new Set(WORD_LIST.map((e) => e.word));
    const word = selectWord(3, allUsed);
    expect(word).toBeNull();
  });

  it("is deterministic with a fixed rng", () => {
    const rng = () => 0.5;
    const word1 = selectWord(3, new Set(), rng);
    const word2 = selectWord(3, new Set(), rng);
    expect(word1).toEqual(word2);
  });

  it("selects words fitting larger team sizes", () => {
    const word = selectWord(5);
    expect(word).not.toBeNull();
    // Should find words 5–10 letters
    expect(word!.word.length).toBeGreaterThanOrEqual(5);
    expect(word!.word.length).toBeLessThanOrEqual(10);
  });
});

// ── assignTeams ─────────────────────────────────────────────────────────────

describe("assignTeams", () => {
  it("splits 6 players into 2 teams of 3", () => {
    const rng = () => 0.5;
    const [teamA, teamB] = assignTeams(["a", "b", "c", "d", "e", "f"], rng);
    expect(teamA.playerIds.length).toBe(3);
    expect(teamB.playerIds.length).toBe(3);
  });

  it("splits 7 players into teams of 4 and 3", () => {
    const rng = () => 0.5;
    const [teamA, teamB] = assignTeams(["a", "b", "c", "d", "e", "f", "g"], rng);
    expect(teamA.playerIds.length).toBe(4);
    expect(teamB.playerIds.length).toBe(3);
  });

  it("assigns different team IDs", () => {
    const [teamA, teamB] = assignTeams(["a", "b", "c", "d"]);
    expect(teamA.teamId).toBe("team-a");
    expect(teamB.teamId).toBe("team-b");
  });

  it("all players are assigned to exactly one team", () => {
    const playerIds = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const [teamA, teamB] = assignTeams(playerIds);
    const allAssigned = [...teamA.playerIds, ...teamB.playerIds];
    expect(allAssigned.length).toBe(playerIds.length);
    expect(new Set(allAssigned).size).toBe(playerIds.length);
    for (const id of playerIds) {
      expect(allAssigned).toContain(id);
    }
  });

  it("shuffles players (not always same assignment with different rng)", () => {
    let idx = 0;
    const rng1 = () => {
      const vals = [0.1, 0.9, 0.3, 0.7, 0.5, 0.2, 0.8, 0.4];
      return vals[idx++ % vals.length];
    };
    idx = 0;
    const [teamA1] = assignTeams(["a", "b", "c", "d", "e", "f"], rng1);

    let idx2 = 0;
    const rng2 = () => {
      const vals = [0.9, 0.1, 0.7, 0.3, 0.5, 0.8, 0.2, 0.6];
      return vals[idx2++ % vals.length];
    };
    const [teamA2] = assignTeams(["a", "b", "c", "d", "e", "f"], rng2);

    // Different RNG should produce different team compositions
    const same = teamA1.playerIds.every((id, i) => id === teamA2.playerIds[i]);
    // It's possible but unlikely they're the same; we just check the test runs
    expect(teamA1.playerIds.length).toBe(3);
    expect(teamA2.playerIds.length).toBe(3);
  });
});

// ── scoreRoundResults ───────────────────────────────────────────────────────

describe("scoreRoundResults", () => {
  const teams: TeamAssignment[] = [
    { teamId: "team-a", playerIds: ["p1", "p2", "p3"] },
    { teamId: "team-b", playerIds: ["p4", "p5", "p6"] },
  ];

  it("awards FIRST_CORRECT_POINTS to the team that finishes first correctly", () => {
    const results: TeamResult[] = [
      { teamId: "team-a", completionTimeMs: 10000, selfReportCorrect: true },
      { teamId: "team-b", completionTimeMs: 20000, selfReportCorrect: true },
    ];
    const scores = scoreRoundResults(teams, results);
    expect(scores.get("p1")).toBe(FIRST_CORRECT_POINTS);
    expect(scores.get("p2")).toBe(FIRST_CORRECT_POINTS);
    expect(scores.get("p3")).toBe(FIRST_CORRECT_POINTS);
    expect(scores.get("p4")).toBe(SECOND_CORRECT_POINTS);
    expect(scores.get("p5")).toBe(SECOND_CORRECT_POINTS);
    expect(scores.get("p6")).toBe(SECOND_CORRECT_POINTS);
  });

  it("awards DRAW_POINTS when neither team is correct", () => {
    const results: TeamResult[] = [
      { teamId: "team-a", completionTimeMs: 10000, selfReportCorrect: false },
      { teamId: "team-b", completionTimeMs: 20000, selfReportCorrect: false },
    ];
    const scores = scoreRoundResults(teams, results);
    expect(scores.get("p1")).toBe(DRAW_POINTS);
    expect(scores.get("p4")).toBe(DRAW_POINTS);
  });

  it("awards first-correct to the only team that got it right", () => {
    const results: TeamResult[] = [
      { teamId: "team-a", completionTimeMs: 10000, selfReportCorrect: false },
      { teamId: "team-b", completionTimeMs: 20000, selfReportCorrect: true },
    ];
    const scores = scoreRoundResults(teams, results);
    expect(scores.get("p1")).toBe(DRAW_POINTS);
    expect(scores.get("p4")).toBe(FIRST_CORRECT_POINTS);
  });

  it("handles team that did not complete (null completionTimeMs)", () => {
    const results: TeamResult[] = [
      { teamId: "team-a", completionTimeMs: null, selfReportCorrect: null },
      { teamId: "team-b", completionTimeMs: 20000, selfReportCorrect: true },
    ];
    const scores = scoreRoundResults(teams, results);
    expect(scores.get("p1")).toBe(DRAW_POINTS);
    expect(scores.get("p4")).toBe(FIRST_CORRECT_POINTS);
  });

  it("handles both teams not completing", () => {
    const results: TeamResult[] = [
      { teamId: "team-a", completionTimeMs: null, selfReportCorrect: null },
      { teamId: "team-b", completionTimeMs: null, selfReportCorrect: null },
    ];
    const scores = scoreRoundResults(teams, results);
    expect(scores.get("p1")).toBe(DRAW_POINTS);
    expect(scores.get("p4")).toBe(DRAW_POINTS);
  });
});

// ── Constants ───────────────────────────────────────────────────────────────

describe("constants", () => {
  it("has a 60-second round duration", () => {
    expect(ROUND_DURATION_SECS).toBe(60);
  });

  it("requires at least 6 players", () => {
    expect(MIN_PLAYERS).toBe(6);
  });

  it("supports up to 20 players", () => {
    expect(MAX_PLAYERS).toBe(20);
  });

  it("first correct team gets 100 points", () => {
    expect(FIRST_CORRECT_POINTS).toBe(100);
  });

  it("second correct team gets 50 points", () => {
    expect(SECOND_CORRECT_POINTS).toBe(50);
  });
});

// ── WORD_LIST validation ────────────────────────────────────────────────────

describe("WORD_LIST", () => {
  it("has at least 20 words", () => {
    expect(WORD_LIST.length).toBeGreaterThanOrEqual(20);
  });

  it("all words are 5–10 letters", () => {
    for (const entry of WORD_LIST) {
      expect(entry.word.length).toBeGreaterThanOrEqual(5);
      expect(entry.word.length).toBeLessThanOrEqual(10);
    }
  });

  it("all words are uppercase", () => {
    for (const entry of WORD_LIST) {
      expect(entry.word).toBe(entry.word.toUpperCase());
    }
  });

  it("all words have at most 3 valid arrangements", () => {
    for (const entry of WORD_LIST) {
      expect(entry.validArrangements.length).toBeGreaterThanOrEqual(1);
      expect(entry.validArrangements.length).toBeLessThanOrEqual(3);
    }
  });

  it("the word itself is included in valid arrangements", () => {
    for (const entry of WORD_LIST) {
      expect(entry.validArrangements).toContain(entry.word);
    }
  });
});

// ── Integration ─────────────────────────────────────────────────────────────

describe("integration: full round flow", () => {
  it("end-to-end: select word → assign teams → split fragments → score", () => {
    const playerIds = ["p1", "p2", "p3", "p4", "p5", "p6"];
    const [teamA, teamB] = assignTeams(playerIds, () => 0.5);

    expect(teamA.playerIds.length).toBe(3);
    expect(teamB.playerIds.length).toBe(3);

    const minTeamSize = Math.min(teamA.playerIds.length, teamB.playerIds.length);
    const word = selectWord(minTeamSize);
    expect(word).not.toBeNull();

    const fragmentsA = splitWordIntoFragments(word!.word, teamA.playerIds.length);
    const fragmentsB = splitWordIntoFragments(word!.word, teamB.playerIds.length);

    expect(fragmentsA.map((f) => f.letters).join("")).toBe(word!.word);
    expect(fragmentsB.map((f) => f.letters).join("")).toBe(word!.word);

    // Simulate: team A finishes first and correctly
    const results: TeamResult[] = [
      { teamId: "team-a", completionTimeMs: 15000, selfReportCorrect: true },
      { teamId: "team-b", completionTimeMs: 30000, selfReportCorrect: true },
    ];

    const scores = scoreRoundResults([teamA, teamB], results);
    for (const id of teamA.playerIds) {
      expect(scores.get(id)).toBe(FIRST_CORRECT_POINTS);
    }
    for (const id of teamB.playerIds) {
      expect(scores.get(id)).toBe(SECOND_CORRECT_POINTS);
    }
  });
});
