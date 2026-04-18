import { describe, expect, it } from "vitest";
import {
  CONDITION_SUGGESTIONS,
  MAX_BOUNTY,
  MAX_CONDITION_LENGTH,
  MAX_REASON_LENGTH,
  MIN_PLAYERS,
  PARTICIPATION_POINTS,
  POSTER_REVEAL_MS,
  RESULTS_DISPLAY_MS,
  SUBMISSION_DURATION_SECS,
  VOTING_DURATION_SECS,
  VOTE_RECEIVED_POINTS,
  WINNER_BONUS,
  computeRoundPoints,
  createRoundAssignments,
  haveAllExpectedPlayersResponded,
  normalizeBounty,
  normalizeCondition,
  normalizeReason,
  tallyPosterVotes,
  type WantedPosterSubmission,
} from "../src/games/registry-28-wanted-ad/wantedAdLogic";

describe("wanted ad constants", () => {
  it("matches the requested round timing", () => {
    expect(SUBMISSION_DURATION_SECS).toBe(45);
    expect(POSTER_REVEAL_MS).toBe(10_000);
    expect(VOTING_DURATION_SECS).toBe(20);
    expect(RESULTS_DISPLAY_MS).toBe(15_000);
  });

  it("uses expected player minimum and scoring", () => {
    expect(MIN_PLAYERS).toBe(2);
    expect(PARTICIPATION_POINTS).toBe(25);
    expect(VOTE_RECEIVED_POINTS).toBe(50);
    expect(WINNER_BONUS).toBe(100);
  });

  it("includes western-style condition suggestions", () => {
    expect(CONDITION_SUGGESTIONS).toContain("Dead or Alive");
    expect(CONDITION_SUGGESTIONS).toContain("Horse Optional");
  });
});

describe("normalizeCondition", () => {
  it("trims, collapses whitespace, and limits length", () => {
    const value = normalizeCondition("   Bring   in   gently   after supper, sheriff   ");
    expect(value).toBe("Bring in gently after supper");
    expect(value.length).toBeLessThanOrEqual(MAX_CONDITION_LENGTH);
  });
});

describe("normalizeReason", () => {
  it("trims, collapses whitespace, and limits length", () => {
    const value = normalizeReason("   Stole    every   pie in town and blamed the horse for it.   ");
    expect(value).toBe("Stole every pie in town and blamed the horse for it.");
    expect(value.length).toBeLessThanOrEqual(MAX_REASON_LENGTH);
  });
});

describe("normalizeBounty", () => {
  it("accepts plain numbers and currency strings", () => {
    expect(normalizeBounty(1250)).toBe(1250);
    expect(normalizeBounty("$4,500")).toBe(4500);
  });

  it("rejects invalid and negative inputs", () => {
    expect(normalizeBounty("")).toBeNull();
    expect(normalizeBounty("none")).toBeNull();
    expect(normalizeBounty(-50)).toBeNull();
  });

  it("caps overly large bounties", () => {
    expect(normalizeBounty("999999999")).toBe(MAX_BOUNTY);
  });
});

describe("createRoundAssignments", () => {
  it("assigns every player to exactly one different player", () => {
    const assignments = createRoundAssignments(["a", "b", "c", "d"], () => 0);
    expect(assignments.size).toBe(4);

    const targets = [...assignments.values()];
    expect(new Set(targets).size).toBe(4);
    for (const [authorId, targetId] of assignments.entries()) {
      expect(targetId).not.toBe(authorId);
    }
  });

  it("supports the two-player case", () => {
    const assignments = createRoundAssignments(["a", "b"], () => 0);
    expect(assignments.get("a")).toBe("b");
    expect(assignments.get("b")).toBe("a");
  });
});

describe("haveAllExpectedPlayersResponded", () => {
  it("returns true only when all expected players are present", () => {
    expect(haveAllExpectedPlayersResponded(new Set(["a", "b"]), ["a", "b"])).toBe(true);
    expect(haveAllExpectedPlayersResponded(new Set(["a"]), ["a", "b"])).toBe(false);
  });
});

describe("tallyPosterVotes", () => {
  const posters: WantedPosterSubmission[] = [
    { authorId: "p1", targetPlayerId: "p2", condition: "Alive", bounty: 1000, reason: "Pie theft", submittedAt: 10 },
    { authorId: "p2", targetPlayerId: "p3", condition: "Dead or Alive", bounty: 2500, reason: "Train robbery", submittedAt: 20 },
    { authorId: "p3", targetPlayerId: "p1", condition: "No Questions Asked", bounty: null, reason: "Horse whispering fraud", submittedAt: 30 },
  ];

  it("counts votes and marks tied winners", () => {
    const results = tallyPosterVotes(
      posters,
      new Map([
        ["v1", "p1"],
        ["v2", "p2"],
        ["v3", "p1"],
        ["v4", "p2"],
      ]),
    );

    expect(results[0].voteCount).toBe(2);
    expect(results[1].voteCount).toBe(2);
    expect(results[0].isWinner).toBe(true);
    expect(results[1].isWinner).toBe(true);
    expect(results[2].isWinner).toBe(false);
  });

  it("keeps submission order when vote counts tie", () => {
    const results = tallyPosterVotes(
      posters,
      new Map([
        ["v1", "p2"],
        ["v2", "p1"],
      ]),
    );

    expect(results.map((result) => result.authorId)).toEqual(["p1", "p2", "p3"]);
  });

  it("does not declare a winner when nobody votes", () => {
    const results = tallyPosterVotes(posters, new Map());
    expect(results.every((result) => !result.isWinner)).toBe(true);
  });
});

describe("computeRoundPoints", () => {
  it("awards participation, votes received, and winner bonus", () => {
    const scores = computeRoundPoints([
      { authorId: "p1", targetPlayerId: "p2", condition: "Alive", bounty: 1000, reason: "Pie theft", submittedAt: 10, voteCount: 2, isWinner: true },
      { authorId: "p2", targetPlayerId: "p3", condition: "Dead", bounty: 500, reason: "Fence jumping", submittedAt: 20, voteCount: 1, isWinner: false },
    ]);

    expect(scores.get("p1")).toBe(PARTICIPATION_POINTS + 2 * VOTE_RECEIVED_POINTS + WINNER_BONUS);
    expect(scores.get("p2")).toBe(PARTICIPATION_POINTS + VOTE_RECEIVED_POINTS);
  });
});
