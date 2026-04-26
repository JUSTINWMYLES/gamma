import { describe, expect, it } from "vitest";
import {
  buildCharacterAssignments,
  CHARACTER_CREATION_DURATION_SECS,
  computeRoundPoints,
  createRoundAssignments,
  haveAllExpectedPlayersResponded,
  MAX_BOUNTY_LENGTH,
  MAX_CHARACTER_DESCRIPTION_LENGTH,
  MAX_CHARACTER_NAME_LENGTH,
  MAX_CONDITION_LENGTH,
  MAX_REASON_LENGTH,
  MIN_PLAYERS,
  PARTICIPATION_POINTS,
  POSTER_REVEAL_MS,
  POSTER_SUBMISSION_DURATION_SECS,
  RESULTS_DISPLAY_MS,
  normalizeBounty,
  normalizeCharacterDescription,
  normalizeCharacterName,
  normalizeCondition,
  normalizeReason,
  tallyPosterVotes,
  type WantedCharacterSubmission,
  type WantedPosterSubmission,
  VOTING_DURATION_SECS,
  VOTE_RECEIVED_POINTS,
  WINNER_BONUS,
} from "../src/games/registry-28-wanted-ad/wantedAdLogic";

describe("wanted ad constants", () => {
  it("matches the requested two-minute creation windows", () => {
    expect(CHARACTER_CREATION_DURATION_SECS).toBe(120);
    expect(POSTER_SUBMISSION_DURATION_SECS).toBe(120);
    expect(POSTER_REVEAL_MS).toBe(15_000);
    expect(VOTING_DURATION_SECS).toBe(20);
    expect(RESULTS_DISPLAY_MS).toBe(15_000);
  });

  it("uses expected player minimum and scoring", () => {
    expect(MIN_PLAYERS).toBe(2);
    expect(PARTICIPATION_POINTS).toBe(25);
    expect(VOTE_RECEIVED_POINTS).toBe(50);
    expect(WINNER_BONUS).toBe(100);
  });
});

describe("character normalization", () => {
  it("normalizes names and descriptions safely", () => {
    expect(normalizeCharacterName("   Dusty    Sam   ")).toBe("Dusty Sam");
    expect(normalizeCharacterName("x".repeat(100)).length).toBe(MAX_CHARACTER_NAME_LENGTH);
    expect(normalizeCharacterDescription("   stole   every pie   in town   ")).toBe("stole every pie in town");
    expect(normalizeCharacterDescription("x".repeat(300)).length).toBe(MAX_CHARACTER_DESCRIPTION_LENGTH);
  });
});

describe("poster normalization", () => {
  it("trims, collapses whitespace, and limits condition/reason length", () => {
    expect(normalizeCondition("   Bring   in   gently   after supper, sheriff   ")).toBe("Bring in gently after supper");
    expect(normalizeCondition("x".repeat(100)).length).toBe(MAX_CONDITION_LENGTH);
    expect(normalizeReason("   Stole    every   pie in town and blamed the horse for it.   ")).toBe("Stole every pie in town and blamed the horse for it.");
    expect(normalizeReason("x".repeat(300)).length).toBe(MAX_REASON_LENGTH);
  });

  it("keeps bounty free-form text instead of coercing to dollars", () => {
    expect(normalizeBounty("$4,500 reward")).toBe("$4,500 reward");
    expect(normalizeBounty("Three chickens and a favor")).toBe("Three chickens and a favor");
    expect(normalizeBounty(null)).toBe("");
    expect(normalizeBounty("x".repeat(100)).length).toBe(MAX_BOUNTY_LENGTH);
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

describe("buildCharacterAssignments", () => {
  it("reassigns authored characters so nobody writes their own poster", () => {
    const characters: WantedCharacterSubmission[] = [
      { creatorId: "a", name: "Dusty Sam", description: "Pie thief", portraitDesign: "{}", submittedAt: 1 },
      { creatorId: "b", name: "Cactus Jill", description: "Duel champion", portraitDesign: "{}", submittedAt: 2 },
      { creatorId: "c", name: "Snake Teeth", description: "Horse scammer", portraitDesign: "{}", submittedAt: 3 },
    ];

    const assignments = buildCharacterAssignments(characters, () => 0);
    expect(assignments.size).toBe(3);
    for (const [authorId, assignment] of assignments.entries()) {
      expect(assignment.creatorId).not.toBe(authorId);
      expect(assignment.name.length).toBeGreaterThan(0);
      expect(assignment.portraitDesign).toBe("{}");
    }
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
    { authorId: "p1", characterCreatorId: "c2", characterName: "Dusty Sam", characterDescription: "Pie thief", portraitDesign: "{}", condition: "Alive", bounty: "1000 gold", reason: "Pie theft", submittedAt: 10 },
    { authorId: "p2", characterCreatorId: "c3", characterName: "Cactus Jill", characterDescription: "Duel champion", portraitDesign: "{}", condition: "Dead or Alive", bounty: "Train shares", reason: "Train robbery", submittedAt: 20 },
    { authorId: "p3", characterCreatorId: "c1", characterName: "Snake Teeth", characterDescription: "Horse scammer", portraitDesign: "{}", condition: "No Questions Asked", bounty: "", reason: "Horse whispering fraud", submittedAt: 30 }
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
      { authorId: "p1", characterCreatorId: "c2", characterName: "Dusty Sam", characterDescription: "Pie thief", portraitDesign: "{}", condition: "Alive", bounty: "1000 gold", reason: "Pie theft", submittedAt: 10, voteCount: 2, isWinner: true },
      { authorId: "p2", characterCreatorId: "c3", characterName: "Cactus Jill", characterDescription: "Duel champion", portraitDesign: "{}", condition: "Dead", bounty: "Wanted poster fame", reason: "Fence jumping", submittedAt: 20, voteCount: 1, isWinner: false },
    ]);

    expect(scores.get("p1")).toBe(PARTICIPATION_POINTS + 2 * VOTE_RECEIVED_POINTS + WINNER_BONUS);
    expect(scores.get("p2")).toBe(PARTICIPATION_POINTS + VOTE_RECEIVED_POINTS);
  });
});
