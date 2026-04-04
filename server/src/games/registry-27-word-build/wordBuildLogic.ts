/**
 * server/src/games/registry-27-word-build/wordBuildLogic.ts
 *
 * Pure logic utilities for the Word Build game (registry-27).
 * Separated from the game class for testability.
 */

// ── Word dictionary ──────────────────────────────────────────────────────────

/**
 * Each entry is a word with its valid anagram arrangements.
 * All words are 5–10 letters with at most 3 valid arrangements.
 */
export interface WordEntry {
  word: string;
  /** All valid words that can be formed from the same ordered fragments. */
  validArrangements: string[];
}

/**
 * Curated word list: common English words, 5–10 letters.
 * Each word has at most 3 valid anagram arrangements when split
 * into consecutive fragments.
 */
export const WORD_LIST: WordEntry[] = [
  { word: "PLANET", validArrangements: ["PLANET"] },
  { word: "BRIDGE", validArrangements: ["BRIDGE"] },
  { word: "CHANGE", validArrangements: ["CHANGE"] },
  { word: "FROZEN", validArrangements: ["FROZEN"] },
  { word: "MARKET", validArrangements: ["MARKET"] },
  { word: "ORANGE", validArrangements: ["ORANGE"] },
  { word: "PURPLE", validArrangements: ["PURPLE"] },
  { word: "SIMPLE", validArrangements: ["SIMPLE"] },
  { word: "TRAVEL", validArrangements: ["TRAVEL"] },
  { word: "WONDER", validArrangements: ["WONDER"] },
  { word: "BASKET", validArrangements: ["BASKET"] },
  { word: "CASTLE", validArrangements: ["CASTLE"] },
  { word: "DRAGON", validArrangements: ["DRAGON"] },
  { word: "FLOWER", validArrangements: ["FLOWER"] },
  { word: "GARDEN", validArrangements: ["GARDEN"] },
  { word: "HAMMER", validArrangements: ["HAMMER"] },
  { word: "JUNGLE", validArrangements: ["JUNGLE"] },
  { word: "KNIGHT", validArrangements: ["KNIGHT"] },
  { word: "LEGEND", validArrangements: ["LEGEND"] },
  { word: "PENCIL", validArrangements: ["PENCIL"] },
  { word: "ROCKET", validArrangements: ["ROCKET"] },
  { word: "SILVER", validArrangements: ["SILVER"] },
  { word: "TROPHY", validArrangements: ["TROPHY"] },
  { word: "WINTER", validArrangements: ["WINTER"] },
  { word: "BLANKET", validArrangements: ["BLANKET"] },
  { word: "CAPTAIN", validArrangements: ["CAPTAIN"] },
  { word: "DOLPHIN", validArrangements: ["DOLPHIN"] },
  { word: "FORTUNE", validArrangements: ["FORTUNE"] },
  { word: "KINGDOM", validArrangements: ["KINGDOM"] },
  { word: "MONSTER", validArrangements: ["MONSTER"] },
  { word: "PAINTING", validArrangements: ["PAINTING"] },
  { word: "QUESTION", validArrangements: ["QUESTION"] },
  { word: "SANDWICH", validArrangements: ["SANDWICH"] },
  { word: "TREASURE", validArrangements: ["TREASURE"] },
  { word: "UMBRELLA", validArrangements: ["UMBRELLA"] },
  { word: "CHAMPION", validArrangements: ["CHAMPION"] },
  { word: "DINOSAUR", validArrangements: ["DINOSAUR"] },
  { word: "ELEPHANT", validArrangements: ["ELEPHANT"] },
  { word: "MAGNETIC", validArrangements: ["MAGNETIC"] },
  { word: "POWERFUL", validArrangements: ["POWERFUL"] },
];

// ── Fragment distribution ────────────────────────────────────────────────────

export interface Fragment {
  /** The letters on this device. */
  letters: string;
  /** 0-based index in the correct word order. */
  index: number;
}

/**
 * Split a word into N consecutive fragments for N team members.
 * Each fragment gets 1 or 2 letters; distributes as evenly as possible.
 *
 * @param word    The target word (uppercase)
 * @param count   Number of fragments (= number of team members)
 * @returns       Array of Fragment objects
 */
export function splitWordIntoFragments(word: string, count: number): Fragment[] {
  if (count <= 0) return [];
  if (count >= word.length) {
    // One letter per fragment; extra fragments get empty strings (shouldn't happen with valid words)
    return Array.from({ length: count }, (_, i) => ({
      letters: i < word.length ? word[i] : "",
      index: i,
    }));
  }

  const fragments: Fragment[] = [];
  const baseSize = Math.floor(word.length / count);
  const extra = word.length % count;
  let offset = 0;

  for (let i = 0; i < count; i++) {
    const size = baseSize + (i < extra ? 1 : 0);
    fragments.push({
      letters: word.substring(offset, offset + size),
      index: i,
    });
    offset += size;
  }

  return fragments;
}

// ── Word selection ───────────────────────────────────────────────────────────

/**
 * Select a random word from the dictionary that fits the team size.
 * Prefers words where the letter count allows meaningful fragments
 * (each fragment gets 1–2 letters).
 *
 * @param teamSize        Number of players on the team
 * @param usedWords       Words already used this session (to avoid repeats)
 * @param rng             Optional random function for testability
 * @returns               The selected WordEntry, or null if none fit
 */
export function selectWord(
  teamSize: number,
  usedWords: Set<string> = new Set(),
  rng: () => number = Math.random,
): WordEntry | null {
  // Filter to words where teamSize fits: each fragment gets 1–2 letters
  // So word length must be >= teamSize and <= teamSize * 2
  const candidates = WORD_LIST.filter((entry) => {
    if (usedWords.has(entry.word)) return false;
    const len = entry.word.length;
    return len >= teamSize && len <= teamSize * 2;
  });

  if (candidates.length === 0) {
    // Fallback: allow any word not yet used
    const fallback = WORD_LIST.filter((e) => !usedWords.has(e.word));
    if (fallback.length === 0) return null;
    return fallback[Math.floor(rng() * fallback.length)];
  }

  return candidates[Math.floor(rng() * candidates.length)];
}

// ── Team assignment ──────────────────────────────────────────────────────────

export interface TeamAssignment {
  teamId: string;
  playerIds: string[];
}

/**
 * Split players into 2 roughly equal teams.
 * Shuffles the player list before splitting.
 *
 * @param playerIds  Array of player session IDs
 * @param rng        Optional random function
 * @returns          Two TeamAssignment objects
 */
export function assignTeams(
  playerIds: string[],
  rng: () => number = Math.random,
): [TeamAssignment, TeamAssignment] {
  // Shuffle using Fisher-Yates
  const shuffled = [...playerIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const mid = Math.ceil(shuffled.length / 2);
  return [
    { teamId: "team-a", playerIds: shuffled.slice(0, mid) },
    { teamId: "team-b", playerIds: shuffled.slice(mid) },
  ];
}

// ── Scoring ──────────────────────────────────────────────────────────────────

/** Points for the team that finishes first with a correct arrangement. */
export const FIRST_CORRECT_POINTS = 100;

/** Points for the team that finishes second with a correct arrangement. */
export const SECOND_CORRECT_POINTS = 50;

/** Points when both teams fail (draw). */
export const DRAW_POINTS = 0;

export interface TeamResult {
  teamId: string;
  completionTimeMs: number | null;
  selfReportCorrect: boolean | null;
}

/**
 * Compute per-player scores for a round based on team results.
 *
 * @param teams      Array of team assignments
 * @param results    Array of team results
 * @returns          Map of playerId → points earned this round
 */
export function scoreRoundResults(
  teams: TeamAssignment[],
  results: TeamResult[],
): Map<string, number> {
  const scores = new Map<string, number>();

  // Sort results by completion time (earliest first), null means did not complete
  const sorted = [...results].sort((a, b) => {
    if (a.completionTimeMs === null && b.completionTimeMs === null) return 0;
    if (a.completionTimeMs === null) return 1;
    if (b.completionTimeMs === null) return -1;
    return a.completionTimeMs - b.completionTimeMs;
  });

  let firstCorrectId: string | null = null;
  let secondCorrectId: string | null = null;

  for (const result of sorted) {
    if (result.selfReportCorrect && result.completionTimeMs !== null) {
      if (!firstCorrectId) {
        firstCorrectId = result.teamId;
      } else if (!secondCorrectId) {
        secondCorrectId = result.teamId;
      }
    }
  }

  for (const team of teams) {
    let points = DRAW_POINTS;
    if (team.teamId === firstCorrectId) {
      points = FIRST_CORRECT_POINTS;
    } else if (team.teamId === secondCorrectId) {
      points = SECOND_CORRECT_POINTS;
    }

    for (const playerId of team.playerIds) {
      scores.set(playerId, points);
    }
  }

  return scores;
}

/** The round duration in seconds. */
export const ROUND_DURATION_SECS = 60;

/** Minimum players required to play. */
export const MIN_PLAYERS = 6;

/** Maximum players supported. */
export const MAX_PLAYERS = 20;
