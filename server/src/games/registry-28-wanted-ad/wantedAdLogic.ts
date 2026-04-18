export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 12;

export const SUBMISSION_DURATION_SECS = 45;
export const POSTER_REVEAL_MS = 10_000;
export const VOTING_DURATION_SECS = 20;
export const RESULTS_DISPLAY_MS = 15_000;

export const PARTICIPATION_POINTS = 25;
export const VOTE_RECEIVED_POINTS = 50;
export const WINNER_BONUS = 100;

export const MAX_CONDITION_LENGTH = 28;
export const MAX_REASON_LENGTH = 96;
export const MAX_BOUNTY = 999_999;

export const CONDITION_SUGGESTIONS = [
  "Dead or Alive",
  "Alive",
  "Dead",
  "Bring In Gently",
  "No Questions Asked",
  "Horse Optional",
] as const;

export interface WantedPosterSubmission {
  authorId: string;
  targetPlayerId: string;
  condition: string;
  bounty: number | null;
  reason: string;
  submittedAt: number;
}

export interface WantedPosterResult extends WantedPosterSubmission {
  voteCount: number;
  isWinner: boolean;
}

function normalizeText(value: string, maxLength: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function normalizeCondition(value: string): string {
  return normalizeText(value, MAX_CONDITION_LENGTH);
}

export function normalizeReason(value: string): string {
  return normalizeText(value, MAX_REASON_LENGTH);
}

export function normalizeBounty(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const raw = typeof value === "number" ? String(value) : String(value);
  const digits = raw.replace(/[^\d.-]/g, "");
  if (!digits) return null;
  const parsed = Number(digits);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  if (rounded < 0) return null;
  return Math.min(rounded, MAX_BOUNTY);
}

export function createRoundAssignments(
  playerIds: string[],
  rng: () => number = Math.random,
): Map<string, string> {
  if (playerIds.length < 2) return new Map();

  const shuffled = [...playerIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const assignments = new Map<string, string>();
  for (let i = 0; i < shuffled.length; i++) {
    assignments.set(shuffled[i], shuffled[(i + 1) % shuffled.length]);
  }
  return assignments;
}

export function haveAllExpectedPlayersResponded(
  responded: Set<string>,
  expectedPlayerIds: string[],
): boolean {
  return expectedPlayerIds.every((playerId) => responded.has(playerId));
}

export function tallyPosterVotes(
  posters: WantedPosterSubmission[],
  votes: Map<string, string>,
): WantedPosterResult[] {
  const counts = new Map<string, number>();
  for (const poster of posters) counts.set(poster.authorId, 0);
  for (const targetAuthorId of votes.values()) {
    if (counts.has(targetAuthorId)) {
      counts.set(targetAuthorId, (counts.get(targetAuthorId) ?? 0) + 1);
    }
  }

  const highestVoteCount = Math.max(0, ...counts.values());
  return posters
    .map((poster) => ({
      ...poster,
      voteCount: counts.get(poster.authorId) ?? 0,
      isWinner: highestVoteCount > 0 && (counts.get(poster.authorId) ?? 0) === highestVoteCount,
    }))
    .sort((a, b) => {
      if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
      return a.submittedAt - b.submittedAt;
    });
}

export function computeRoundPoints(results: WantedPosterResult[]): Map<string, number> {
  const scores = new Map<string, number>();

  for (const result of results) {
    let points = PARTICIPATION_POINTS + result.voteCount * VOTE_RECEIVED_POINTS;
    if (result.isWinner) points += WINNER_BONUS;
    scores.set(result.authorId, points);
  }

  return scores;
}
