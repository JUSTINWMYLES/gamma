/**
 * server/src/utils/rng.ts
 *
 * Seeded pseudo-random number generator (LCG — fast, deterministic, auditable).
 * Used for bracket draws, patrol generation, and dice rolls.
 * NOT cryptographically secure — use only for game mechanics.
 */

/**
 * Returns a function that produces the next float in [0, 1) using a
 * linear congruential generator seeded with `seed`.
 */
export function seededRng(seed: number): () => number {
  // Knuth multiplicative LCG (32-bit)
  let s = seed >>> 0;
  return (): number => {
    s = Math.imul(1664525, s) + 1013904223 >>> 0;
    return s / 0x100000000;
  };
}

/**
 * Fisher-Yates shuffle using the seeded RNG.
 * Returns a new array; the original is not mutated.
 */
export function seededShuffle<T>(arr: T[], seed: number): T[] {
  const rng = seededRng(seed);
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Generate a 4-character room code.
 * Excludes visually ambiguous characters (0/O, 1/I, 5/S, 2/Z).
 */
export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRTUVWXY3469";
  return Array.from(
    { length: 4 },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
}
