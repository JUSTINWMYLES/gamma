/**
 * server/src/games/registry-11-tier-ranking/tierRankingLogic.ts
 *
 * Pure logic utilities for the S-Tier Ranking game (registry-11).
 * Separated from the game class for testability.
 */

// ── Tiers ─────────────────────────────────────────────────────────────────────

/** Ordered from highest to lowest; used for tie-breaking. */
export const TIERS = ["S", "A", "B", "C", "D"] as const;
export type Tier = (typeof TIERS)[number];

/** Points awarded to a player for correctly predicting the consensus tier. */
export const TIER_POINTS: Record<Tier, number> = {
  S: 5,
  A: 4,
  B: 3,
  C: 2,
  D: 1,
};

// ── Category suggestions ──────────────────────────────────────────────────────

export const CATEGORY_SUGGESTIONS: string[] = [
  "Best cereals",
  "Superhero movies",
  "Pizza toppings",
  "90s cartoons",
  "Sports",
  "Video games",
  "Fast food restaurants",
  "Board games",
  "Ice cream flavors",
  "Dog breeds",
  "Marvel characters",
  "Streaming services",
  "Social media apps",
  "Candy bars",
  "Animated movies",
  "Holiday traditions",
  "Theme park rides",
  "Reality TV shows",
  "Rock bands",
  "Sandwiches",
];

// ── Category chooser ──────────────────────────────────────────────────────────

/**
 * Randomly select one player to be the category chooser.
 *
 * @param playerIds  Array of active player session IDs
 * @param rng        Optional random function for testability
 * @returns          The chosen player's session ID
 */
export function selectCategoryChooser(
  playerIds: string[],
  rng: () => number = Math.random,
): string {
  return playerIds[Math.floor(rng() * playerIds.length)];
}

/**
 * Pick a random category suggestion.
 *
 * @param rng  Optional random function for testability
 * @returns    A category string from CATEGORY_SUGGESTIONS
 */
export function pickRandomSuggestion(rng: () => number = Math.random): string {
  return CATEGORY_SUGGESTIONS[Math.floor(rng() * CATEGORY_SUGGESTIONS.length)];
}

// ── Entry normalization & deduplication ───────────────────────────────────────

/**
 * Normalize an entry string for comparison: trim whitespace and lowercase.
 * Returns null if the entry is empty after normalization.
 */
export function normalizeEntry(entry: string): string | null {
  const normalized = entry.trim().toLowerCase().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : null;
}

/**
 * Check whether an entry is a duplicate of any entry already in the list.
 * Comparison is case-insensitive and whitespace-normalized.
 */
export function isDuplicateEntry(entry: string, existingEntries: string[]): boolean {
  const normalized = normalizeEntry(entry);
  if (!normalized) return false;
  return existingEntries.some((e) => normalizeEntry(e) === normalized);
}

/**
 * Return true when every expected player has responded exactly once.
 *
 * Extra responses from players outside the expected list are ignored so a
 * stale reconnect or duplicated client event cannot hold the phase open.
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

// ── Vote aggregation ──────────────────────────────────────────────────────────

export interface VoteCounts {
  S: number;
  A: number;
  B: number;
  C: number;
  D: number;
}

export interface ItemResult {
  item: string;
  tier: Tier;
  voteCounts: VoteCounts;
}

const REVEAL_TIER_ORDER: Record<Tier, number> = {
  D: 0,
  C: 1,
  B: 2,
  A: 3,
  S: 4,
};

/**
 * Aggregate per-player tier votes and compute the consensus tier for each item.
 *
 * Consensus = the tier with the most votes.
 * Ties are broken in favour of the higher tier (S > A > B > C > D).
 * Items with no votes default to C tier.
 *
 * @param votes  Map of playerId → (Map of item → tier)
 * @param items  Ordered list of all items in the round
 * @returns      Array of ItemResult objects
 */
export function aggregateVotes(
  votes: Map<string, Map<string, Tier>>,
  items: string[],
): ItemResult[] {
  return items.map((item) => {
    const counts: VoteCounts = { S: 0, A: 0, B: 0, C: 0, D: 0 };

    for (const playerVotes of votes.values()) {
      const tier = playerVotes.get(item);
      if (tier && (TIERS as readonly string[]).includes(tier)) {
        counts[tier as Tier]++;
      }
    }

    // Pick the tier with the highest count; ties prefer higher tiers (S first)
    // Only assign a tier if at least one vote was cast; otherwise default to C.
    const totalVotes = Object.values(counts).reduce((a, b) => a + b, 0);
    if (totalVotes === 0) {
      return { item, tier: "C" as Tier, voteCounts: counts };
    }

    let bestTier: Tier = "S";
    let bestCount = -1;
    for (const tier of TIERS) {
      if (counts[tier] > bestCount) {
        bestCount = counts[tier];
        bestTier = tier;
      }
    }

    return { item, tier: bestTier, voteCounts: counts };
  });
}

// ── Scoring ───────────────────────────────────────────────────────────────────

/**
 * Compute per-player scores for a round.
 *
 * For each item, a player earns TIER_POINTS[consensusTier] if their vote
 * matches the consensus tier, otherwise 0.
 *
 * @param playerVotes  Map of playerId → (Map of item → tier submitted by player)
 * @param results      Consensus results from aggregateVotes()
 * @returns            Map of playerId → total points earned this round
 */
export function scoreRound(
  playerVotes: Map<string, Map<string, Tier>>,
  results: ItemResult[],
): Map<string, number> {
  const scores = new Map<string, number>();

  for (const [playerId, votes] of playerVotes.entries()) {
    let total = 0;
    for (const { item, tier: consensusTier } of results) {
      if (votes.get(item) === consensusTier) {
        total += TIER_POINTS[consensusTier];
      }
    }
    scores.set(playerId, total);
  }

  return scores;
}

/**
 * Order results for the TV reveal from lowest tier to highest tier while
 * preserving original item order within each tier.
 */
export function orderResultsForReveal(results: ItemResult[]): ItemResult[] {
  return results
    .map((result, index) => ({ result, index }))
    .sort((a, b) => {
      const tierDiff = REVEAL_TIER_ORDER[a.result.tier] - REVEAL_TIER_ORDER[b.result.tier];
      if (tierDiff !== 0) return tierDiff;
      return a.index - b.index;
    })
    .map(({ result }) => result);
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Duration for the category-pick phase (seconds). */
export const CATEGORY_PICK_DURATION_SECS = 30;

/** Duration for the entry-submission phase (seconds). */
export const ENTRY_SUBMIT_DURATION_SECS = 30;

/** Duration for the tier-ranking phase (seconds). */
export const TIER_RANK_DURATION_SECS = 90;

/** Duration to display results before advancing (ms). */
export const RESULTS_DISPLAY_MS = 10_000;

/** Reveal cadence for the TV result board (ms). */
export const RESULT_REVEAL_STEP_MS = 5_000;

export function getResultsDisplayMs(itemCount: number): number {
  return RESULTS_DISPLAY_MS + Math.max(0, itemCount - 1) * RESULT_REVEAL_STEP_MS;
}

/** Minimum number of connected players required to start a round. */
export const MIN_PLAYERS = 2;

/** Maximum number of supported players. */
export const MAX_PLAYERS = 16;
