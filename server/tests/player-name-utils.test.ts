import { describe, expect, it } from "vitest";
import {
  sanitizePlayerName,
  normalizePlayerNameForComparison,
  playerNamesMatch,
} from "../src/rooms/playerNameUtils";

describe("sanitizePlayerName", () => {
  it("trims whitespace and falls back to Player", () => {
    expect(sanitizePlayerName("  Alice  ")).toBe("Alice");
    expect(sanitizePlayerName("   ")).toBe("Player");
    expect(sanitizePlayerName(undefined)).toBe("Player");
  });

  it("caps names at 20 characters", () => {
    expect(sanitizePlayerName("12345678901234567890Z")).toBe("12345678901234567890");
  });
});

describe("normalizePlayerNameForComparison", () => {
  it("compares names case-insensitively after sanitizing", () => {
    expect(normalizePlayerNameForComparison("  ALIce ")).toBe("alice");
  });
});

describe("playerNamesMatch", () => {
  it("matches exact duplicates regardless of surrounding whitespace or case", () => {
    expect(playerNamesMatch("Alice", " alice ")).toBe(true);
  });

  it("does not match distinct names", () => {
    expect(playerNamesMatch("Alice", "Bob")).toBe(false);
  });
});
