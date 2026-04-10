import { describe, it, expect } from "vitest";
import {
  PHASES,
  BODY_PARTS,
  ACTIONS,
  ROLE_VOTE_DURATION_SECS,
  SUBMISSION_DURATION_SECS,
  VOTING_DURATION_SECS,
  RESULTS_DISPLAY_MS,
  RECAP_DISPLAY_MS,
  MAX_SUBMISSION_LENGTH,
  MIN_PLAYERS,
  MAX_PLAYERS,
  PHASE_WIN_POINTS,
  PHASE_RUNNER_UP_POINTS,
  tallyRoleVotes,
  assignRolesRandomly,
  normalizeSubmission,
  isValidBodyPart,
  isValidAction,
  haveAllExpectedPlayersResponded,
  tallySubmissionVotes,
  computePhasePoints,
  type Role,
  type Submission,
} from "../src/games/registry-43-medical-story/medicalStoryLogic";

// ── PHASES ──────────────────────────────────────────────────────────────────

describe("PHASES", () => {
  it("has exactly 4 phases: complaint, diagnosis, procedure, catchphrase", () => {
    expect(PHASES).toEqual(["complaint", "diagnosis", "procedure", "catchphrase"]);
  });
});

// ── BODY_PARTS ──────────────────────────────────────────────────────────────

describe("BODY_PARTS", () => {
  it("has at least 20 body parts", () => {
    expect(BODY_PARTS.length).toBeGreaterThanOrEqual(20);
  });

  it("includes common body parts", () => {
    expect(BODY_PARTS).toContain("head");
    expect(BODY_PARTS).toContain("chest");
    expect(BODY_PARTS).toContain("left arm");
    expect(BODY_PARTS).toContain("right leg");
    expect(BODY_PARTS).toContain("spleen");
  });

  it("all body parts are non-empty strings", () => {
    for (const part of BODY_PARTS) {
      expect(typeof part).toBe("string");
      expect(part.trim().length).toBeGreaterThan(0);
    }
  });
});

// ── ACTIONS ─────────────────────────────────────────────────────────────────

describe("ACTIONS", () => {
  it("has exactly 6 actions", () => {
    expect(ACTIONS).toEqual(["Compressions", "Shock", "Punch", "Slap", "Roll", "Shake"]);
  });
});

// ── Constants ───────────────────────────────────────────────────────────────

describe("constants", () => {
  it("ROLE_VOTE_DURATION_SECS is 30", () => {
    expect(ROLE_VOTE_DURATION_SECS).toBe(30);
  });

  it("SUBMISSION_DURATION_SECS is 45", () => {
    expect(SUBMISSION_DURATION_SECS).toBe(45);
  });

  it("VOTING_DURATION_SECS is 30", () => {
    expect(VOTING_DURATION_SECS).toBe(30);
  });

  it("RESULTS_DISPLAY_MS is 6000", () => {
    expect(RESULTS_DISPLAY_MS).toBe(6_000);
  });

  it("RECAP_DISPLAY_MS is 5000", () => {
    expect(RECAP_DISPLAY_MS).toBe(5_000);
  });

  it("MAX_SUBMISSION_LENGTH is 60", () => {
    expect(MAX_SUBMISSION_LENGTH).toBe(60);
  });

  it("MIN_PLAYERS is 3", () => {
    expect(MIN_PLAYERS).toBe(3);
  });

  it("MAX_PLAYERS is 12", () => {
    expect(MAX_PLAYERS).toBe(12);
  });

  it("PHASE_WIN_POINTS is 100", () => {
    expect(PHASE_WIN_POINTS).toBe(100);
  });

  it("PHASE_RUNNER_UP_POINTS is 25", () => {
    expect(PHASE_RUNNER_UP_POINTS).toBe(25);
  });
});

// ── tallyRoleVotes ──────────────────────────────────────────────────────────

describe("tallyRoleVotes", () => {
  const playerIds = ["p1", "p2", "p3", "p4", "p5"];

  it("assigns patient, doctor, nurse based on majority vote", () => {
    const votes = new Map([
      ["p1", { patient: "p1", doctor: "p2", nurse: "p3" }],
      ["p2", { patient: "p1", doctor: "p2", nurse: "p3" }],
      ["p3", { patient: "p1", doctor: "p2", nurse: "p3" }],
    ]);

    const roles = tallyRoleVotes(votes, playerIds);

    expect(roles.get("p1")).toBe("patient");
    expect(roles.get("p2")).toBe("doctor");
    expect(roles.get("p3")).toBe("nurse");
    expect(roles.get("p4")).toBe("bystander");
    expect(roles.get("p5")).toBe("bystander");
  });

  it("assigns exactly one patient, one doctor, one nurse", () => {
    const votes = new Map([
      ["p1", { patient: "p2", doctor: "p3", nurse: "p4" }],
      ["p2", { patient: "p3", doctor: "p4", nurse: "p5" }],
    ]);

    const roles = tallyRoleVotes(votes, playerIds);

    const roleValues = [...roles.values()];
    expect(roleValues.filter((r) => r === "patient")).toHaveLength(1);
    expect(roleValues.filter((r) => r === "doctor")).toHaveLength(1);
    expect(roleValues.filter((r) => r === "nurse")).toHaveLength(1);
  });

  it("assigns all players a role", () => {
    const votes = new Map([
      ["p1", { patient: "p1", doctor: "p2", nurse: "p3" }],
    ]);

    const roles = tallyRoleVotes(votes, playerIds);
    expect(roles.size).toBe(5);

    for (const id of playerIds) {
      expect(roles.has(id)).toBe(true);
    }
  });

  it("does not assign the same player to multiple roles", () => {
    const votes = new Map([
      ["p1", { patient: "p1", doctor: "p1", nurse: "p1" }],
      ["p2", { patient: "p1", doctor: "p1", nurse: "p1" }],
    ]);

    const roles = tallyRoleVotes(votes, playerIds);

    // p1 should only get one role (the first assigned: patient)
    expect(roles.get("p1")).toBe("patient");

    const roleValues = [...roles.values()];
    const assigned = new Set(
      [...roles.entries()].filter(([, r]) => r !== "bystander").map(([id]) => id),
    );
    // All three main roles should be different players
    expect(assigned.size).toBe(3);
  });

  it("falls back to random assignment when no votes cast", () => {
    const votes = new Map<string, { patient: string; doctor: string; nurse: string }>();
    const rng = () => 0; // deterministic

    const roles = tallyRoleVotes(votes, playerIds, rng);

    const roleValues = [...roles.values()];
    expect(roleValues.filter((r) => r === "patient")).toHaveLength(1);
    expect(roleValues.filter((r) => r === "doctor")).toHaveLength(1);
    expect(roleValues.filter((r) => r === "nurse")).toHaveLength(1);
  });

  it("handles exactly 3 players (no bystanders)", () => {
    const threePlayerIds = ["p1", "p2", "p3"];
    const votes = new Map([
      ["p1", { patient: "p1", doctor: "p2", nurse: "p3" }],
      ["p2", { patient: "p1", doctor: "p2", nurse: "p3" }],
    ]);

    const roles = tallyRoleVotes(votes, threePlayerIds);

    expect(roles.size).toBe(3);
    const roleValues = [...roles.values()];
    expect(roleValues.filter((r) => r === "bystander")).toHaveLength(0);
  });
});

// ── assignRolesRandomly ─────────────────────────────────────────────────────

describe("assignRolesRandomly", () => {
  it("assigns exactly one patient, one doctor, one nurse", () => {
    const roles = assignRolesRandomly(["p1", "p2", "p3", "p4"]);

    const roleValues = [...roles.values()];
    expect(roleValues.filter((r) => r === "patient")).toHaveLength(1);
    expect(roleValues.filter((r) => r === "doctor")).toHaveLength(1);
    expect(roleValues.filter((r) => r === "nurse")).toHaveLength(1);
    expect(roleValues.filter((r) => r === "bystander")).toHaveLength(1);
  });

  it("assigns all players", () => {
    const playerIds = ["p1", "p2", "p3"];
    const roles = assignRolesRandomly(playerIds);
    expect(roles.size).toBe(3);
  });

  it("is deterministic with fixed rng", () => {
    let callCount = 0;
    const rng = () => {
      callCount++;
      return 0.5;
    };
    const roles1 = assignRolesRandomly(["a", "b", "c"], () => 0.5);
    const roles2 = assignRolesRandomly(["a", "b", "c"], () => 0.5);
    expect([...roles1.entries()]).toEqual([...roles2.entries()]);
  });
});

// ── normalizeSubmission ─────────────────────────────────────────────────────

describe("normalizeSubmission", () => {
  it("trims whitespace", () => {
    expect(normalizeSubmission("  hello  ")).toBe("hello");
  });

  it("returns null for empty string", () => {
    expect(normalizeSubmission("")).toBeNull();
  });

  it("returns null for whitespace-only input", () => {
    expect(normalizeSubmission("   ")).toBeNull();
  });

  it("enforces max length", () => {
    const longText = "a".repeat(100);
    const result = normalizeSubmission(longText);
    expect(result?.length).toBe(MAX_SUBMISSION_LENGTH);
  });

  it("preserves original casing", () => {
    expect(normalizeSubmission("Acute Wobble Syndrome")).toBe("Acute Wobble Syndrome");
  });
});

// ── isValidBodyPart ─────────────────────────────────────────────────────────

describe("isValidBodyPart", () => {
  it("returns true for valid body parts", () => {
    expect(isValidBodyPart("head")).toBe(true);
    expect(isValidBodyPart("spleen")).toBe(true);
    expect(isValidBodyPart("left knee")).toBe(true);
  });

  it("returns false for invalid body parts", () => {
    expect(isValidBodyPart("brain")).toBe(false);
    expect(isValidBodyPart("")).toBe(false);
    expect(isValidBodyPart("not a body part")).toBe(false);
  });
});

// ── isValidAction ───────────────────────────────────────────────────────────

describe("isValidAction", () => {
  it("returns true for valid actions", () => {
    expect(isValidAction("Punch")).toBe(true);
    expect(isValidAction("Shock")).toBe(true);
    expect(isValidAction("Slap")).toBe(true);
  });

  it("returns false for invalid actions", () => {
    expect(isValidAction("Kick")).toBe(false);
    expect(isValidAction("")).toBe(false);
    expect(isValidAction("punch")).toBe(false); // case-sensitive
  });
});

describe("haveAllExpectedPlayersResponded", () => {
  it("returns true when every expected player responds", () => {
    expect(haveAllExpectedPlayersResponded(["p1", "p2", "p3"], ["p3", "p1", "p2"])).toBe(
      true,
    );
  });

  it("returns false when an expected player is missing", () => {
    expect(haveAllExpectedPlayersResponded(["p1", "p2"], ["p1"])).toBe(false);
  });

  it("ignores duplicate and unexpected responders", () => {
    expect(
      haveAllExpectedPlayersResponded(["p1", "p2"], ["p1", "spectator", "p1", "p2"]),
    ).toBe(true);
  });
});

// ── tallySubmissionVotes ────────────────────────────────────────────────────

describe("tallySubmissionVotes", () => {
  it("counts votes correctly", () => {
    const submissions: Submission[] = [
      { playerId: "p1", text: "Wobbly Knee Syndrome" },
      { playerId: "p2", text: "Acute Flibbertigibbitis" },
    ];

    const votes = new Map([
      ["p3", "p1"],
      ["p4", "p1"],
      ["p5", "p2"],
    ]);

    const results = tallySubmissionVotes(submissions, votes);

    const p1Result = results.find((r) => r.playerId === "p1");
    const p2Result = results.find((r) => r.playerId === "p2");
    expect(p1Result?.voteCount).toBe(2);
    expect(p2Result?.voteCount).toBe(1);
  });

  it("sorts by vote count descending", () => {
    const submissions: Submission[] = [
      { playerId: "p1", text: "A" },
      { playerId: "p2", text: "B" },
      { playerId: "p3", text: "C" },
    ];

    const votes = new Map([
      ["p4", "p3"], // 2 votes for p3
      ["p5", "p3"],
      ["p6", "p1"], // 1 vote for p1
    ]);

    const results = tallySubmissionVotes(submissions, votes);

    expect(results[0].playerId).toBe("p3");
    expect(results[0].voteCount).toBe(2);
  });

  it("ignores votes for non-existent submissions", () => {
    const submissions: Submission[] = [
      { playerId: "p1", text: "A" },
    ];

    const votes = new Map([
      ["p2", "p99"], // non-existent
    ]);

    const results = tallySubmissionVotes(submissions, votes);
    expect(results[0].voteCount).toBe(0);
  });

  it("handles no votes", () => {
    const submissions: Submission[] = [
      { playerId: "p1", text: "A" },
    ];

    const results = tallySubmissionVotes(submissions, new Map());
    expect(results[0].voteCount).toBe(0);
  });

  it("handles empty submissions", () => {
    const results = tallySubmissionVotes([], new Map());
    expect(results).toHaveLength(0);
  });

  it("preserves body part and action in results", () => {
    const submissions: Submission[] = [
      { playerId: "p1", text: "Twist & Shout", bodyPart: "left knee", action: "Shake" },
    ];

    const results = tallySubmissionVotes(submissions, new Map());
    expect(results[0].bodyPart).toBe("left knee");
    expect(results[0].action).toBe("Shake");
  });
});

// ── computePhasePoints ──────────────────────────────────────────────────────

describe("computePhasePoints", () => {
  it("awards PHASE_WIN_POINTS to the winner", () => {
    const results = [
      { playerId: "p1", text: "A", voteCount: 3 },
      { playerId: "p2", text: "B", voteCount: 1 },
    ];

    const points = computePhasePoints(results, 5);
    expect(points.get("p1")).toBe(PHASE_WIN_POINTS);
  });

  it("awards runner-up points when 4+ players", () => {
    const results = [
      { playerId: "p1", text: "A", voteCount: 3 },
      { playerId: "p2", text: "B", voteCount: 2 },
      { playerId: "p3", text: "C", voteCount: 1 },
    ];

    const points = computePhasePoints(results, 4);
    expect(points.get("p1")).toBe(PHASE_WIN_POINTS);
    expect(points.get("p2")).toBe(PHASE_RUNNER_UP_POINTS);
  });

  it("does not award runner-up points when fewer than 4 players", () => {
    const results = [
      { playerId: "p1", text: "A", voteCount: 2 },
      { playerId: "p2", text: "B", voteCount: 1 },
    ];

    const points = computePhasePoints(results, 3);
    expect(points.get("p1")).toBe(PHASE_WIN_POINTS);
    expect(points.has("p2")).toBe(false);
  });

  it("awards win points to all tied players", () => {
    const results = [
      { playerId: "p1", text: "A", voteCount: 2 },
      { playerId: "p2", text: "B", voteCount: 2 },
      { playerId: "p3", text: "C", voteCount: 1 },
    ];

    const points = computePhasePoints(results, 5);
    expect(points.get("p1")).toBe(PHASE_WIN_POINTS);
    expect(points.get("p2")).toBe(PHASE_WIN_POINTS);
  });

  it("returns empty map for empty results", () => {
    const points = computePhasePoints([], 5);
    expect(points.size).toBe(0);
  });

  it("does not award runner-up when runner-up has 0 votes", () => {
    const results = [
      { playerId: "p1", text: "A", voteCount: 3 },
      { playerId: "p2", text: "B", voteCount: 0 },
    ];

    const points = computePhasePoints(results, 5);
    expect(points.get("p1")).toBe(PHASE_WIN_POINTS);
    expect(points.has("p2")).toBe(false);
  });
});

// ── Integration ─────────────────────────────────────────────────────────────

describe("integration: full round flow", () => {
  it("end-to-end: assign roles → submit → vote → score", () => {
    const playerIds = ["p1", "p2", "p3", "p4", "p5"];

    // 1. Role voting
    const roleVotes = new Map([
      ["p1", { patient: "p2", doctor: "p3", nurse: "p4" }],
      ["p2", { patient: "p2", doctor: "p3", nurse: "p4" }],
      ["p3", { patient: "p2", doctor: "p3", nurse: "p4" }],
      ["p4", { patient: "p1", doctor: "p5", nurse: "p4" }],
      ["p5", { patient: "p2", doctor: "p3", nurse: "p5" }],
    ]);

    const roles = tallyRoleVotes(roleVotes, playerIds);

    // p2 should be patient (4 votes), p3 doctor (4 votes), p4 nurse (3 votes)
    expect(roles.get("p2")).toBe("patient");
    expect(roles.get("p3")).toBe("doctor");
    expect(roles.get("p4")).toBe("nurse");
    expect(roles.get("p1")).toBe("bystander");
    expect(roles.get("p5")).toBe("bystander");

    // 2. Complaint submissions
    const complaintSubmissions: Submission[] = [
      { playerId: "p1", text: "My elbow is singing opera", bodyPart: "left elbow" },
      { playerId: "p2", text: "Everything tastes purple", bodyPart: "mouth" },
      { playerId: "p3", text: "My knee predicts the weather", bodyPart: "left knee" },
      { playerId: "p4", text: "I sneeze confetti", bodyPart: "nose" },
      { playerId: "p5", text: "My spine plays jazz", bodyPart: "spine" },
    ];

    // 3. Complaint voting
    const complaintVotes = new Map([
      ["p1", "p3"], // p1 votes for p3
      ["p2", "p3"], // p2 votes for p3
      ["p3", "p1"], // p3 votes for p1 (can't vote for self normally, but logic doesn't enforce here)
      ["p4", "p3"], // p4 votes for p3
      ["p5", "p1"], // p5 votes for p1
    ]);

    const complaintResults = tallySubmissionVotes(complaintSubmissions, complaintVotes);

    // p3 should win with 3 votes
    expect(complaintResults[0].playerId).toBe("p3");
    expect(complaintResults[0].voteCount).toBe(3);
    expect(complaintResults[0].text).toBe("My knee predicts the weather");

    // 4. Compute points
    const points = computePhasePoints(complaintResults, 5);
    expect(points.get("p3")).toBe(PHASE_WIN_POINTS); // winner
    expect(points.get("p1")).toBe(PHASE_RUNNER_UP_POINTS); // runner up with 2 votes
  });

  it("validates submission normalization across phases", () => {
    // Empty submission
    expect(normalizeSubmission("")).toBeNull();
    expect(normalizeSubmission("   ")).toBeNull();

    // Valid submission
    const submission = normalizeSubmission("  Reverse Flibbertigibbitis  ");
    expect(submission).toBe("Reverse Flibbertigibbitis");

    // Long submission truncated
    const longSubmission = normalizeSubmission("A".repeat(100));
    expect(longSubmission?.length).toBe(60);

    // Body part and action validation
    expect(isValidBodyPart("spleen")).toBe(true);
    expect(isValidBodyPart("brain")).toBe(false);
    expect(isValidAction("Punch")).toBe(true);
    expect(isValidAction("Kick")).toBe(false);
  });
});
