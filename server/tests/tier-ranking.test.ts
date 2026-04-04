import { describe, it, expect } from "vitest";
import {
  TIERS,
  TIER_POINTS,
  CATEGORY_SUGGESTIONS,
  selectCategoryChooser,
  pickRandomSuggestion,
  normalizeEntry,
  isDuplicateEntry,
  aggregateVotes,
  scoreRound,
  CATEGORY_PICK_DURATION_SECS,
  ENTRY_SUBMIT_DURATION_SECS,
  TIER_RANK_DURATION_SECS,
  RESULTS_DISPLAY_MS,
  MIN_PLAYERS,
  MAX_PLAYERS,
  type Tier,
  type ItemResult,
} from "../src/games/registry-11-tier-ranking/tierRankingLogic";

// ── TIERS & TIER_POINTS ─────────────────────────────────────────────────────

describe("TIERS", () => {
  it("has exactly 5 tiers: S, A, B, C, D", () => {
    expect(TIERS).toEqual(["S", "A", "B", "C", "D"]);
  });

  it("TIER_POINTS assigns descending values S=5 down to D=1", () => {
    expect(TIER_POINTS.S).toBe(5);
    expect(TIER_POINTS.A).toBe(4);
    expect(TIER_POINTS.B).toBe(3);
    expect(TIER_POINTS.C).toBe(2);
    expect(TIER_POINTS.D).toBe(1);
  });
});

// ── selectCategoryChooser ───────────────────────────────────────────────────

describe("selectCategoryChooser", () => {
  it("returns one of the provided player IDs", () => {
    const playerIds = ["p1", "p2", "p3", "p4"];
    const chooser = selectCategoryChooser(playerIds);
    expect(playerIds).toContain(chooser);
  });

  it("returns the only player when there is one player", () => {
    expect(selectCategoryChooser(["solo"])).toBe("solo");
  });

  it("is deterministic with a fixed rng", () => {
    const rng = () => 0;
    const playerIds = ["p1", "p2", "p3"];
    expect(selectCategoryChooser(playerIds, rng)).toBe("p1");
  });

  it("selects different players with different rng values", () => {
    const playerIds = ["p1", "p2", "p3"];
    const c1 = selectCategoryChooser(playerIds, () => 0);
    const c2 = selectCategoryChooser(playerIds, () => 0.99);
    expect(c1).toBe("p1");
    expect(c2).toBe("p3");
  });
});

// ── pickRandomSuggestion ────────────────────────────────────────────────────

describe("pickRandomSuggestion", () => {
  it("returns a string from CATEGORY_SUGGESTIONS", () => {
    const suggestion = pickRandomSuggestion();
    expect(CATEGORY_SUGGESTIONS).toContain(suggestion);
  });

  it("is deterministic with a fixed rng", () => {
    const rng = () => 0;
    const s1 = pickRandomSuggestion(rng);
    const s2 = pickRandomSuggestion(rng);
    expect(s1).toBe(s2);
  });
});

// ── normalizeEntry ──────────────────────────────────────────────────────────

describe("normalizeEntry", () => {
  it("trims leading and trailing whitespace", () => {
    expect(normalizeEntry("  hello  ")).toBe("hello");
  });

  it("lowercases the entry", () => {
    expect(normalizeEntry("Lucky Charms")).toBe("lucky charms");
  });

  it("collapses multiple spaces into one", () => {
    expect(normalizeEntry("cocoa  puffs")).toBe("cocoa puffs");
  });

  it("returns null for an empty string", () => {
    expect(normalizeEntry("")).toBeNull();
  });

  it("returns null for whitespace-only input", () => {
    expect(normalizeEntry("   ")).toBeNull();
  });
});

// ── isDuplicateEntry ────────────────────────────────────────────────────────

describe("isDuplicateEntry", () => {
  it("returns false when the list is empty", () => {
    expect(isDuplicateEntry("Frosted Flakes", [])).toBe(false);
  });

  it("detects an exact duplicate", () => {
    expect(isDuplicateEntry("Frosted Flakes", ["Frosted Flakes"])).toBe(true);
  });

  it("detects a duplicate regardless of case", () => {
    expect(isDuplicateEntry("frosted flakes", ["Frosted Flakes"])).toBe(true);
    expect(isDuplicateEntry("FROSTED FLAKES", ["frosted flakes"])).toBe(true);
  });

  it("detects a duplicate regardless of surrounding whitespace", () => {
    expect(isDuplicateEntry("  Frosted Flakes  ", ["Frosted Flakes"])).toBe(true);
  });

  it("returns false when the entry is distinct", () => {
    expect(isDuplicateEntry("Lucky Charms", ["Frosted Flakes", "Cheerios"])).toBe(false);
  });

  it("returns false for an empty entry string", () => {
    expect(isDuplicateEntry("", ["Frosted Flakes"])).toBe(false);
  });
});

// ── aggregateVotes ──────────────────────────────────────────────────────────

describe("aggregateVotes", () => {
  it("returns the majority-voted tier for each item", () => {
    const votes = new Map<string, Map<string, Tier>>([
      ["p1", new Map([["Frosted Flakes", "B"], ["Lucky Charms", "S"]])],
      ["p2", new Map([["Frosted Flakes", "B"], ["Lucky Charms", "A"]])],
      ["p3", new Map([["Frosted Flakes", "A"], ["Lucky Charms", "S"]])],
    ]);
    const results = aggregateVotes(votes, ["Frosted Flakes", "Lucky Charms"]);

    expect(results.find((r) => r.item === "Frosted Flakes")?.tier).toBe("B");
    expect(results.find((r) => r.item === "Lucky Charms")?.tier).toBe("S");
  });

  it("breaks ties in favour of the higher tier (S > A > B > C > D)", () => {
    // 1 vote for B, 1 vote for C — B should win (higher tier)
    const votes = new Map<string, Map<string, Tier>>([
      ["p1", new Map([["item1", "B"]])],
      ["p2", new Map([["item1", "C"]])],
    ]);
    const results = aggregateVotes(votes, ["item1"]);
    expect(results[0].tier).toBe("B");
  });

  it("breaks ties S vs A — S wins", () => {
    const votes = new Map<string, Map<string, Tier>>([
      ["p1", new Map([["x", "S"]])],
      ["p2", new Map([["x", "A"]])],
    ]);
    const results = aggregateVotes(votes, ["x"]);
    expect(results[0].tier).toBe("S");
  });

  it("defaults to C tier when no votes are cast", () => {
    const votes = new Map<string, Map<string, Tier>>();
    const results = aggregateVotes(votes, ["Mystery Item"]);
    expect(results[0].tier).toBe("C");
  });

  it("returns correct vote counts", () => {
    const votes = new Map<string, Map<string, Tier>>([
      ["p1", new Map([["Cereal", "S"]])],
      ["p2", new Map([["Cereal", "S"]])],
      ["p3", new Map([["Cereal", "A"]])],
    ]);
    const results = aggregateVotes(votes, ["Cereal"]);
    const vcs = results[0].voteCounts;
    expect(vcs.S).toBe(2);
    expect(vcs.A).toBe(1);
    expect(vcs.B).toBe(0);
    expect(vcs.C).toBe(0);
    expect(vcs.D).toBe(0);
  });

  it("ignores votes for unknown items", () => {
    const votes = new Map<string, Map<string, Tier>>([
      ["p1", new Map([["unknown", "S"]])],
    ]);
    const results = aggregateVotes(votes, ["knownItem"]);
    // knownItem has no votes, so defaults to C
    expect(results[0].tier).toBe("C");
  });

  it("preserves item order from the items array", () => {
    const items = ["Z Item", "A Item", "M Item"];
    const results = aggregateVotes(new Map(), items);
    expect(results.map((r) => r.item)).toEqual(items);
  });
});

// ── scoreRound ──────────────────────────────────────────────────────────────

describe("scoreRound", () => {
  it("awards TIER_POINTS[tier] for each correctly predicted item", () => {
    const results: ItemResult[] = [
      { item: "Frosted Flakes", tier: "B", voteCounts: { S: 0, A: 0, B: 3, C: 0, D: 0 } },
      { item: "Lucky Charms", tier: "S", voteCounts: { S: 2, A: 1, B: 0, C: 0, D: 0 } },
    ];

    const playerVotes = new Map<string, Map<string, Tier>>([
      [
        "p1",
        new Map([
          ["Frosted Flakes", "B"], // correct → 3 pts
          ["Lucky Charms", "S"],   // correct → 5 pts
        ]),
      ],
    ]);

    const scores = scoreRound(playerVotes, results);
    expect(scores.get("p1")).toBe(8); // 3 + 5
  });

  it("awards 0 for an incorrectly predicted item", () => {
    const results: ItemResult[] = [
      { item: "Cereal", tier: "A", voteCounts: { S: 0, A: 3, B: 0, C: 0, D: 0 } },
    ];
    const playerVotes = new Map<string, Map<string, Tier>>([
      ["p1", new Map([["Cereal", "D"]])], // wrong
    ]);
    const scores = scoreRound(playerVotes, results);
    expect(scores.get("p1")).toBe(0);
  });

  it("totals points across multiple items", () => {
    const results: ItemResult[] = [
      { item: "item1", tier: "S", voteCounts: { S: 1, A: 0, B: 0, C: 0, D: 0 } },
      { item: "item2", tier: "A", voteCounts: { S: 0, A: 1, B: 0, C: 0, D: 0 } },
      { item: "item3", tier: "D", voteCounts: { S: 0, A: 0, B: 0, C: 0, D: 1 } },
    ];
    const playerVotes = new Map<string, Map<string, Tier>>([
      [
        "p1",
        new Map([
          ["item1", "S"], // correct → 5
          ["item2", "A"], // correct → 4
          ["item3", "D"], // correct → 1
        ]),
      ],
    ]);
    const scores = scoreRound(playerVotes, results);
    expect(scores.get("p1")).toBe(10); // 5 + 4 + 1
  });

  it("handles players who did not vote for some items (score 0 for those items)", () => {
    const results: ItemResult[] = [
      { item: "item1", tier: "S", voteCounts: { S: 1, A: 0, B: 0, C: 0, D: 0 } },
    ];
    const playerVotes = new Map<string, Map<string, Tier>>([
      ["p1", new Map()], // no votes
    ]);
    const scores = scoreRound(playerVotes, results);
    expect(scores.get("p1")).toBe(0);
  });

  it("scores multiple players independently", () => {
    const results: ItemResult[] = [
      { item: "item1", tier: "A", voteCounts: { S: 0, A: 2, B: 1, C: 0, D: 0 } },
    ];
    const playerVotes = new Map<string, Map<string, Tier>>([
      ["p1", new Map([["item1", "A"]])], // correct → 4
      ["p2", new Map([["item1", "B"]])], // wrong  → 0
      ["p3", new Map([["item1", "A"]])], // correct → 4
    ]);
    const scores = scoreRound(playerVotes, results);
    expect(scores.get("p1")).toBe(4);
    expect(scores.get("p2")).toBe(0);
    expect(scores.get("p3")).toBe(4);
  });
});

// ── Constants ───────────────────────────────────────────────────────────────

describe("constants", () => {
  it("CATEGORY_PICK_DURATION_SECS is 30", () => {
    expect(CATEGORY_PICK_DURATION_SECS).toBe(30);
  });

  it("ENTRY_SUBMIT_DURATION_SECS is 30", () => {
    expect(ENTRY_SUBMIT_DURATION_SECS).toBe(30);
  });

  it("TIER_RANK_DURATION_SECS is 90", () => {
    expect(TIER_RANK_DURATION_SECS).toBe(90);
  });

  it("RESULTS_DISPLAY_MS is 10000", () => {
    expect(RESULTS_DISPLAY_MS).toBe(10_000);
  });

  it("MIN_PLAYERS is 2", () => {
    expect(MIN_PLAYERS).toBe(2);
  });

  it("MAX_PLAYERS is 16", () => {
    expect(MAX_PLAYERS).toBe(16);
  });

  it("CATEGORY_SUGGESTIONS has at least 10 entries", () => {
    expect(CATEGORY_SUGGESTIONS.length).toBeGreaterThanOrEqual(10);
  });

  it("all CATEGORY_SUGGESTIONS are non-empty strings", () => {
    for (const s of CATEGORY_SUGGESTIONS) {
      expect(typeof s).toBe("string");
      expect(s.trim().length).toBeGreaterThan(0);
    }
  });
});

// ── Integration ─────────────────────────────────────────────────────────────

describe("integration: full round flow", () => {
  it("end-to-end: pick chooser → build votes → aggregate → score", () => {
    const playerIds = ["p1", "p2", "p3", "p4"];

    // 1. Select category chooser
    const chooser = selectCategoryChooser(playerIds, () => 0.25);
    expect(playerIds).toContain(chooser);

    // 2. Simulate entries submitted (all unique)
    const entries = ["Frosted Flakes", "Lucky Charms", "Cheerios", "Cap'n Crunch"];
    for (let i = 1; i < entries.length; i++) {
      expect(isDuplicateEntry(entries[i], entries.slice(0, i))).toBe(false);
    }

    // 3. Simulate player votes
    const votes = new Map<string, Map<string, Tier>>([
      [
        "p1",
        new Map<string, Tier>([
          ["Frosted Flakes", "S"],
          ["Lucky Charms", "A"],
          ["Cheerios", "C"],
          ["Cap'n Crunch", "B"],
        ]),
      ],
      [
        "p2",
        new Map<string, Tier>([
          ["Frosted Flakes", "S"],
          ["Lucky Charms", "B"],
          ["Cheerios", "C"],
          ["Cap'n Crunch", "B"],
        ]),
      ],
      [
        "p3",
        new Map<string, Tier>([
          ["Frosted Flakes", "A"],
          ["Lucky Charms", "A"],
          ["Cheerios", "D"],
          ["Cap'n Crunch", "A"],
        ]),
      ],
      [
        "p4",
        new Map<string, Tier>([
          ["Frosted Flakes", "S"],
          ["Lucky Charms", "A"],
          ["Cheerios", "C"],
          ["Cap'n Crunch", "B"],
        ]),
      ],
    ]);

    // 4. Aggregate
    const results = aggregateVotes(votes, entries);

    // Frosted Flakes: S=3, A=1 → consensus S
    expect(results.find((r) => r.item === "Frosted Flakes")?.tier).toBe("S");
    // Lucky Charms: A=3, B=1 → consensus A
    expect(results.find((r) => r.item === "Lucky Charms")?.tier).toBe("A");
    // Cheerios: C=3, D=1 → consensus C
    expect(results.find((r) => r.item === "Cheerios")?.tier).toBe("C");
    // Cap'n Crunch: B=3, A=1 → consensus B
    expect(results.find((r) => r.item === "Cap'n Crunch")?.tier).toBe("B");

    // 5. Score
    const scores = scoreRound(votes, results);

    // p1: S(5) + A(4) + C(2) + B(3) = 14
    expect(scores.get("p1")).toBe(14);
    // p2: S(5) + 0 + C(2) + B(3) = 10
    expect(scores.get("p2")).toBe(10);
    // p3: 0 + A(4) + 0 + 0 = 4
    expect(scores.get("p3")).toBe(4);
    // p4: S(5) + A(4) + C(2) + B(3) = 14
    expect(scores.get("p4")).toBe(14);
  });
});
