/**
 * server/src/games/registry-43-medical-story/medicalStoryLogic.ts
 *
 * Pure logic utilities for the Medical Story game (registry-43).
 * Separated from the game class for testability.
 */

// ── Roles ─────────────────────────────────────────────────────────────────────

export type Role = "patient" | "doctor" | "nurse" | "bystander";

// ── Phases (the four creative submission phases) ──────────────────────────────

export const PHASES = ["complaint", "diagnosis", "procedure", "catchphrase"] as const;
export type Phase = (typeof PHASES)[number];

// ── Body parts ────────────────────────────────────────────────────────────────

export const BODY_PARTS = [
  "head",
  "forehead",
  "left eye",
  "right eye",
  "nose",
  "mouth",
  "left ear",
  "right ear",
  "neck",
  "left shoulder",
  "right shoulder",
  "chest",
  "stomach",
  "left arm",
  "right arm",
  "left elbow",
  "right elbow",
  "left hand",
  "right hand",
  "left hip",
  "right hip",
  "left leg",
  "right leg",
  "left knee",
  "right knee",
  "left foot",
  "right foot",
  "back",
  "spine",
  "spleen",
] as const;

export type BodyPart = (typeof BODY_PARTS)[number];

// ── Actions (procedure phase) ─────────────────────────────────────────────────

export const ACTIONS = [
  "Compressions",
  "Shock",
  "Punch",
  "Slap",
  "Roll",
  "Shake",
] as const;

export type Action = (typeof ACTIONS)[number];

export const FUNNY_TESTS = [
  "Gave it a close look",
  "Did a long sniff test",
  "Shook it",
  "Poked it",
  "Held it up to the light",
  "Tapped it with a tiny hammer",
  "Listened to it dramatically",
  "Asked it how it was feeling",
  "Ran the emergency wiggle scan",
  "Put it in rice for a minute",
] as const;

export type FunnyTest = (typeof FUNNY_TESTS)[number];

export const MAX_DIAGNOSIS_TESTS = 3;

// ── Submission interface ──────────────────────────────────────────────────────

export interface Submission {
  playerId: string;
  text: string;
  bodyPart?: string;
  action?: string;
  tests?: string[];
}

// ── Timing constants ──────────────────────────────────────────────────────────

/** Duration for the role-voting phase (seconds). */
export const ROLE_VOTE_DURATION_SECS = 30;

/** Duration for each submission phase (seconds). */
export const SUBMISSION_DURATION_SECS = 45;

/** Duration for each voting phase (seconds). */
export const VOTING_DURATION_SECS = 30;

/** Duration to display vote results before advancing (ms). */
export const RESULTS_DISPLAY_MS = 6_000;

/** Reveal cadence for each recap item (ms). */
export const RECAP_STEP_MS = 5_000;

/** Duration to display round recap (ms). */
export const RECAP_DISPLAY_MS = RECAP_STEP_MS * PHASES.length;

/** Maximum length of a submission text. */
export const MAX_SUBMISSION_LENGTH = 60;

/** Minimum number of connected players to play. */
export const MIN_PLAYERS = 3;

/** Maximum number of supported players. */
export const MAX_PLAYERS = 12;

/** Points awarded to the winning submission's author per phase. */
export const PHASE_WIN_POINTS = 100;

/** Points awarded to the second-most-voted submission (if 4+ players). */
export const PHASE_RUNNER_UP_POINTS = 25;

// ── Role voting logic ─────────────────────────────────────────────────────────

/**
 * Tally role votes and assign roles.
 *
 * Each player votes for who should be patient, doctor, and nurse.
 * The player with the most votes for each role gets it. In case of a tie,
 * the first player alphabetically (by ID) wins. Roles are assigned in order:
 * patient first, then doctor (excluding patient), then nurse (excluding both).
 * Remaining players become bystanders.
 *
 * @param votes     Map of voterId → { patient: playerId, doctor: playerId, nurse: playerId }
 * @param playerIds All active player session IDs
 * @param rng       Optional random function for tie-breaking
 * @returns         Map of playerId → Role
 */
export function tallyRoleVotes(
  votes: Map<string, { patient: string; doctor: string; nurse: string }>,
  playerIds: string[],
  rng: () => number = Math.random,
): Map<string, Role> {
  const roles = new Map<string, Role>();

  // Count votes per role
  const patientVotes = new Map<string, number>();
  const doctorVotes = new Map<string, number>();
  const nurseVotes = new Map<string, number>();

  for (const vote of votes.values()) {
    if (playerIds.includes(vote.patient)) {
      patientVotes.set(vote.patient, (patientVotes.get(vote.patient) ?? 0) + 1);
    }
    if (playerIds.includes(vote.doctor)) {
      doctorVotes.set(vote.doctor, (doctorVotes.get(vote.doctor) ?? 0) + 1);
    }
    if (playerIds.includes(vote.nurse)) {
      nurseVotes.set(vote.nurse, (nurseVotes.get(vote.nurse) ?? 0) + 1);
    }
  }

  const assigned = new Set<string>();

  // Assign patient
  const patientId = pickWinner(patientVotes, playerIds.filter((id) => !assigned.has(id)), rng);
  if (patientId) {
    roles.set(patientId, "patient");
    assigned.add(patientId);
  }

  // Assign doctor (exclude patient)
  const doctorId = pickWinner(doctorVotes, playerIds.filter((id) => !assigned.has(id)), rng);
  if (doctorId) {
    roles.set(doctorId, "doctor");
    assigned.add(doctorId);
  }

  // Assign nurse (exclude patient + doctor)
  const nurseId = pickWinner(nurseVotes, playerIds.filter((id) => !assigned.has(id)), rng);
  if (nurseId) {
    roles.set(nurseId, "nurse");
    assigned.add(nurseId);
  }

  // Remaining players are bystanders
  for (const id of playerIds) {
    if (!roles.has(id)) {
      roles.set(id, "bystander");
    }
  }

  return roles;
}

/**
 * Pick the winner from a vote tally. If no votes, pick randomly from eligible.
 * Ties are broken randomly.
 */
function pickWinner(
  voteCounts: Map<string, number>,
  eligible: string[],
  rng: () => number,
): string | null {
  if (eligible.length === 0) return null;

  // Filter to only eligible candidates
  let maxVotes = 0;
  for (const id of eligible) {
    const count = voteCounts.get(id) ?? 0;
    if (count > maxVotes) maxVotes = count;
  }

  if (maxVotes === 0) {
    // No votes cast for this role — pick randomly from eligible
    return eligible[Math.floor(rng() * eligible.length)];
  }

  const candidates = eligible.filter((id) => (voteCounts.get(id) ?? 0) === maxVotes);
  return candidates[Math.floor(rng() * candidates.length)];
}

/**
 * Assign roles randomly when not enough votes or players skip voting.
 *
 * @param playerIds  Active player IDs
 * @param rng        Optional random function for testability
 * @returns          Map of playerId → Role
 */
export function assignRolesRandomly(
  playerIds: string[],
  rng: () => number = Math.random,
): Map<string, Role> {
  const roles = new Map<string, Role>();
  const shuffled = fisherYatesShuffle([...playerIds], rng);

  if (shuffled.length >= 1) roles.set(shuffled[0], "patient");
  if (shuffled.length >= 2) roles.set(shuffled[1], "doctor");
  if (shuffled.length >= 3) roles.set(shuffled[2], "nurse");
  for (let i = 3; i < shuffled.length; i++) {
    roles.set(shuffled[i], "bystander");
  }

  return roles;
}

/**
 * Fisher-Yates (Knuth) shuffle for unbiased randomization.
 */
function fisherYatesShuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Submission validation ─────────────────────────────────────────────────────

/**
 * Normalize a submission string for display. Trims whitespace and enforces
 * the max length.
 *
 * @returns Cleaned string, or null if empty
 */
export function normalizeSubmission(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, MAX_SUBMISSION_LENGTH);
}

/**
 * Validate that a body part is from the allowed list.
 */
export function isValidBodyPart(part: string): boolean {
  return (BODY_PARTS as readonly string[]).includes(part);
}

/**
 * Validate that an action is from the allowed list.
 */
export function isValidAction(action: string): boolean {
  return (ACTIONS as readonly string[]).includes(action);
}

/**
 * Validate that a funny diagnosis test is from the allowed list.
 */
export function isValidFunnyTest(test: string): boolean {
  return (FUNNY_TESTS as readonly string[]).includes(test);
}

/**
 * Normalize selected diagnosis tests: keep valid unique values in order and
 * clamp to the configured maximum.
 */
export function normalizeFunnyTests(tests: string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const test of tests) {
    if (!isValidFunnyTest(test) || seen.has(test)) continue;
    normalized.push(test);
    seen.add(test);
    if (normalized.length >= MAX_DIAGNOSIS_TESTS) break;
  }

  return normalized;
}

/**
 * Return true when every expected player has responded during the current
 * phase. Unexpected responders are ignored.
 */
export function haveAllExpectedPlayersResponded(
  expectedPlayerIds: string[],
  respondingPlayerIds: Iterable<string>,
): boolean {
  if (expectedPlayerIds.length === 0) return true;

  const expected = new Set(expectedPlayerIds);
  const responded = new Set<string>();

  for (const playerId of respondingPlayerIds) {
    if (expected.has(playerId)) {
      responded.add(playerId);
    }
  }

  return responded.size === expected.size;
}

// ── Vote tallying (submission voting) ─────────────────────────────────────────

export interface VoteResult {
  /** Player ID of the submission author */
  playerId: string;
  /** The submission text */
  text: string;
  /** Optional body part */
  bodyPart?: string;
  /** Optional action */
  action?: string;
  /** Optional funny tests */
  tests?: string[];
  /** Number of votes received */
  voteCount: number;
}

/**
 * Role-specific vote weighting for the matching creative phase.
 */
export function getPhaseVoteWeight(role: Role | undefined, phase: Phase): number {
  if (role === "patient" && phase === "complaint") return 2;
  if (role === "nurse" && phase === "diagnosis") return 2;
  if (role === "doctor" && phase === "catchphrase") return 2;
  return 1;
}

/**
 * Tally votes for submissions in a phase.
 *
 * @param submissions   All submissions for the phase
 * @param votes         Map of voterId → submissionPlayerId (the submission they voted for)
 * @returns             Submissions sorted by vote count (descending), with ties broken randomly
 */
export function tallySubmissionVotes(
  submissions: Submission[],
  votes: Map<string, string>,
  voteWeights: Map<string, number> = new Map(),
): VoteResult[] {
  // Count votes per submission author
  const voteCounts = new Map<string, number>();
  for (const sub of submissions) {
    voteCounts.set(sub.playerId, 0);
  }

  for (const [voterId, targetId] of votes.entries()) {
    if (voteCounts.has(targetId)) {
      const weight = Math.max(1, Math.floor(voteWeights.get(voterId) ?? 1));
      voteCounts.set(targetId, (voteCounts.get(targetId) ?? 0) + weight);
    }
  }

  // Build results
  const results: VoteResult[] = submissions.map((sub) => ({
    playerId: sub.playerId,
    text: sub.text,
    bodyPart: sub.bodyPart,
    action: sub.action,
    tests: sub.tests,
    voteCount: voteCounts.get(sub.playerId) ?? 0,
  }));

  // Sort by vote count descending; ties preserve original submission order
  results.sort((a, b) => b.voteCount - a.voteCount);

  return results;
}

/**
 * Compute points for a phase based on vote results.
 *
 * Winner gets PHASE_WIN_POINTS. If 4+ players, runner-up gets PHASE_RUNNER_UP_POINTS.
 * In case of a tie for first, all tied players share the win points.
 *
 * @param voteResults  Sorted results from tallySubmissionVotes
 * @param playerCount  Number of active players
 * @returns            Map of playerId → points earned
 */
export function computePhasePoints(
  voteResults: VoteResult[],
  playerCount: number,
): Map<string, number> {
  const points = new Map<string, number>();

  if (voteResults.length === 0) return points;

  const maxVotes = voteResults[0].voteCount;

  // All tied winners share the win points
  const winners = voteResults.filter((r) => r.voteCount === maxVotes);
  for (const winner of winners) {
    points.set(winner.playerId, PHASE_WIN_POINTS);
  }

  // Runner-up points if 4+ players and there's a non-tied second place
  if (playerCount >= 4 && winners.length < voteResults.length) {
    const nextBest = voteResults.find((r) => r.voteCount < maxVotes);
    if (nextBest && nextBest.voteCount > 0) {
      points.set(nextBest.playerId, (points.get(nextBest.playerId) ?? 0) + PHASE_RUNNER_UP_POINTS);
    }
  }

  return points;
}
