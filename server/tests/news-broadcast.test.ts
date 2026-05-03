import { describe, it, expect } from "vitest";
import {
  MIN_PLAYERS,
  MAX_PLAYERS,
  HEADLINE_SUBMISSION_DURATION_MS,
  ASSIGNMENT_REVEAL_DURATION_MS,
  SCRIPT_VOICE_DURATION_MS,
  GIF_SELECTION_DURATION_MS,
  LOGO_CREATION_DURATION_MS,
  BUFFERING_MAX_WAIT_MS,
  PRESENTATION_PREPARE_MS,
  PRESENTATION_END_HOLD_MS,
  PRESENTATION_EXTRA_WAIT_MS,
  VOTING_DURATION_MS,
  RESULTS_DISPLAY_MS,
  MIN_HEADLINE_LENGTH,
  MAX_HEADLINE_LENGTH,
  MAX_SCRIPT_LENGTH,
  MAX_SPOKEN_DURATION_MS,
  PARTICIPATION_POINTS,
  VOTE_RECEIVED_POINTS,
  WINNER_BONUS,
  DEFAULT_VOICE_PRESET_ID,
  FALLBACK_VOICE_OPTIONS,
  FALLBACK_MEDIA_ENTRY,
  normalizeHeadline,
  normalizeScript,
  normalizeSpokenText,
  buildSpokenText,
  estimateSpeechMs,
  estimateSpeechMsFromNormalizedText,
  validateSpokenTextWithinBudget,
  pickFallbackHeadline,
  buildFallbackScript,
  trimTextToSpeechBudget,
  haveAllExpectedPlayersResponded,
  createHeadlineAssignments,
  createPresentationOrder,
  tallyBroadcastVotes,
  computeRoundPoints,
  normalizeMediaEntry,
  isAllowedMediaSelection,
  toPublicVoiceOption,
} from "../src/games/registry-45-news-broadcast/newsBroadcastLogic";
import NewsBroadcastGame from "../src/games/registry-45-news-broadcast";

// ── Constants ───────────────────────────────────────────────────────────────

describe("constants", () => {
  it("MIN_PLAYERS is 2", () => {
    expect(MIN_PLAYERS).toBe(2);
  });

  it("MAX_PLAYERS is 12", () => {
    expect(MAX_PLAYERS).toBe(12);
  });

  it("HEADLINE_SUBMISSION_DURATION_MS is 60_000", () => {
    expect(HEADLINE_SUBMISSION_DURATION_MS).toBe(60_000);
  });

  it("ASSIGNMENT_REVEAL_DURATION_MS is 5_000", () => {
    expect(ASSIGNMENT_REVEAL_DURATION_MS).toBe(5_000);
  });

  it("SCRIPT_VOICE_DURATION_MS is 90_000", () => {
    expect(SCRIPT_VOICE_DURATION_MS).toBe(90_000);
  });

  it("GIF_SELECTION_DURATION_MS is 120_000", () => {
    expect(GIF_SELECTION_DURATION_MS).toBe(120_000);
  });

  it("LOGO_CREATION_DURATION_MS is 120_000", () => {
    expect(LOGO_CREATION_DURATION_MS).toBe(120_000);
  });

  it("BUFFERING_MAX_WAIT_MS is 60_000", () => {
    expect(BUFFERING_MAX_WAIT_MS).toBe(60_000);
  });

  it("PRESENTATION_PREPARE_MS is 2_000", () => {
    expect(PRESENTATION_PREPARE_MS).toBe(2_000);
  });

  it("PRESENTATION_END_HOLD_MS is 4_000", () => {
    expect(PRESENTATION_END_HOLD_MS).toBe(4_000);
  });

  it("PRESENTATION_EXTRA_WAIT_MS is 60_000", () => {
    expect(PRESENTATION_EXTRA_WAIT_MS).toBe(60_000);
  });

  it("VOTING_DURATION_MS is 30_000", () => {
    expect(VOTING_DURATION_MS).toBe(30_000);
  });

  it("RESULTS_DISPLAY_MS is 8_000", () => {
    expect(RESULTS_DISPLAY_MS).toBe(8_000);
  });

  it("MIN_HEADLINE_LENGTH is 12", () => {
    expect(MIN_HEADLINE_LENGTH).toBe(12);
  });

  it("MAX_HEADLINE_LENGTH is 90", () => {
    expect(MAX_HEADLINE_LENGTH).toBe(90);
  });

  it("MAX_SCRIPT_LENGTH is 150", () => {
    expect(MAX_SCRIPT_LENGTH).toBe(150);
  });

  it("MAX_SPOKEN_DURATION_MS is 20_000", () => {
    expect(MAX_SPOKEN_DURATION_MS).toBe(20_000);
  });

  it("PARTICIPATION_POINTS is 25", () => {
    expect(PARTICIPATION_POINTS).toBe(25);
  });

  it("VOTE_RECEIVED_POINTS is 50", () => {
    expect(VOTE_RECEIVED_POINTS).toBe(50);
  });

  it("WINNER_BONUS is 100", () => {
    expect(WINNER_BONUS).toBe(100);
  });

  it("DEFAULT_VOICE_PRESET_ID is anchor_classic_a", () => {
    expect(DEFAULT_VOICE_PRESET_ID).toBe("anchor_classic_a");
  });

  it("FALLBACK_VOICE_OPTIONS has at least one available voice", () => {
    expect(FALLBACK_VOICE_OPTIONS.some((v) => v.available)).toBe(true);
  });
});

// ── Game class metadata ─────────────────────────────────────────────────────

describe("NewsBroadcastGame metadata", () => {
  it("requiresTV is true", () => {
    expect(NewsBroadcastGame.requiresTV).toBe(true);
  });

  it("supportsBracket is false", () => {
    expect(NewsBroadcastGame.supportsBracket).toBe(false);
  });

  it("defaultRoundCount is 1", () => {
    expect(NewsBroadcastGame.defaultRoundCount).toBe(1);
  });

  it("minRounds is 1", () => {
    expect(NewsBroadcastGame.minRounds).toBe(1);
  });

  it("maxRounds is 1", () => {
    expect(NewsBroadcastGame.maxRounds).toBe(1);
  });

  it("hasInstructionsPhase is true", () => {
    expect(NewsBroadcastGame.hasInstructionsPhase).toBe(true);
  });

  it("instructionsDelivery is broadcast", () => {
    expect(NewsBroadcastGame.instructionsDelivery).toBe("broadcast");
  });

  it("activityLevel is none", () => {
    expect(NewsBroadcastGame.activityLevel).toBe("none");
  });

  it("requiresSameRoom is true", () => {
    expect(NewsBroadcastGame.requiresSameRoom).toBe(true);
  });

  it("requiresSecondaryDisplay is true", () => {
    expect(NewsBroadcastGame.requiresSecondaryDisplay).toBe(true);
  });
});

// ── normalizeHeadline ───────────────────────────────────────────────────────

describe("normalizeHeadline", () => {
  it("returns null for empty string", () => {
    expect(normalizeHeadline("")).toBeNull();
  });

  it("returns null for single word", () => {
    expect(normalizeHeadline("Hello")).toBeNull();
  });

  it("returns null for short text (< 12 chars)", () => {
    expect(normalizeHeadline("Short")).toBeNull();
  });

  it("normalizes and returns valid headline", () => {
    const result = normalizeHeadline("  Mayor denies rumors of secret alpaca emergency task force  ");
    expect(result).toBe("Mayor denies rumors of secret alpaca emergency task force");
  });

  it("truncates to MAX_HEADLINE_LENGTH", () => {
    const long = "a b ".repeat(30);
    const result = normalizeHeadline(long);
    expect(result?.length).toBe(MAX_HEADLINE_LENGTH);
  });

  it("returns null for text with < 2 words but >= 12 chars", () => {
    expect(normalizeHeadline("supercalifragilistic")).toBeNull();
  });
});

// ── normalizeScript ─────────────────────────────────────────────────────────

describe("normalizeScript", () => {
  it("returns null for empty string", () => {
    expect(normalizeScript("")).toBeNull();
  });

  it("returns null for whitespace-only", () => {
    expect(normalizeScript("   ")).toBeNull();
  });

  it("normalizes and returns valid script", () => {
    const result = normalizeScript("  Witnesses say the raccoon accepted the award  ");
    expect(result).toBe("Witnesses say the raccoon accepted the award");
  });

  it("truncates to MAX_SCRIPT_LENGTH", () => {
    const long = "a".repeat(400);
    const result = normalizeScript(long);
    expect(result?.length).toBe(MAX_SCRIPT_LENGTH);
  });
});

// ── normalizeSpokenText ─────────────────────────────────────────────────────

describe("normalizeSpokenText", () => {
  it("removes emoji", () => {
    const result = normalizeSpokenText("Hello world 🎉");
    expect(result).not.toContain("🎉");
  });

  it("collapses repeated punctuation", () => {
    expect(normalizeSpokenText("Hello!!")).toBe("Hello!");
    expect(normalizeSpokenText("Wait...")).toBe("Wait.");
  });

  it("ensures sentence ending", () => {
    expect(normalizeSpokenText("Hello world")).toBe("Hello world.");
  });

  it("preserves existing sentence ending", () => {
    expect(normalizeSpokenText("Hello world!")).toBe("Hello world!");
  });
});

// ── buildSpokenText ─────────────────────────────────────────────────────────

describe("buildSpokenText", () => {
  it("combines headline and script with sentence endings", () => {
    const result = buildSpokenText("Breaking news", "Something happened");
    expect(result).toBe("Breaking news. Something happened.");
  });

  it("normalizes combined text", () => {
    const result = buildSpokenText("Breaking news 🎉", "Something happened!!");
    expect(result).toBe("Breaking news . Something happened!");
  });

  it("handles emoji removal in headline", () => {
    const result = buildSpokenText("Breaking news", "Something happened");
    expect(result).toBe("Breaking news. Something happened.");
  });
});

// ── estimateSpeechMs ────────────────────────────────────────────────────────

describe("estimateSpeechMs", () => {
  it("returns at least 3000ms", () => {
    expect(estimateSpeechMs("Hi")).toBeGreaterThanOrEqual(3_000);
  });

  it("increases with word count", () => {
    const short = estimateSpeechMs("Hello world");
    const long = estimateSpeechMs("Hello world this is a longer sentence with many words");
    expect(long).toBeGreaterThan(short);
  });

  it("adds punctuation bonus", () => {
    const without = estimateSpeechMs("Hello world");
    const withPunctuation = estimateSpeechMs("Hello, world! This is a test.");
    expect(withPunctuation).toBeGreaterThan(without);
  });

  it("matches normalized-text fast path", () => {
    const normalized = normalizeSpokenText("Hello, world! This is a test.");
    expect(estimateSpeechMsFromNormalizedText(normalized)).toBe(estimateSpeechMs(normalized));
  });
});

// ── validateSpokenTextWithinBudget ──────────────────────────────────────────

describe("validateSpokenTextWithinBudget", () => {
  it("returns true for short text", () => {
    expect(validateSpokenTextWithinBudget("Hello world")).toBe(true);
  });

  it("returns false for very long text", () => {
    const longText = "word ".repeat(100);
    expect(validateSpokenTextWithinBudget(longText)).toBe(false);
  });
});

// ── pickFallbackHeadline ────────────────────────────────────────────────────

describe("pickFallbackHeadline", () => {
  it("returns a string", () => {
    expect(typeof pickFallbackHeadline(0, 123)).toBe("string");
  });

  it("is deterministic for same seed and index", () => {
    expect(pickFallbackHeadline(0, 123)).toBe(pickFallbackHeadline(0, 123));
  });

  it("wraps index with modulo", () => {
    const first = pickFallbackHeadline(0, 123);
    const wrapped = pickFallbackHeadline(1000, 123);
    expect(typeof wrapped).toBe("string");
  });
});

// ── buildFallbackScript ─────────────────────────────────────────────────────

describe("buildFallbackScript", () => {
  it("includes the headline", () => {
    const headline = "Test headline";
    const result = buildFallbackScript(headline);
    expect(result).toContain(headline);
  });

  it("does not exceed MAX_SCRIPT_LENGTH", () => {
    const longHeadline = "a".repeat(200);
    const result = buildFallbackScript(longHeadline);
    expect(result.length).toBeLessThanOrEqual(MAX_SCRIPT_LENGTH);
  });
});

// ── trimTextToSpeechBudget ──────────────────────────────────────────────────

describe("trimTextToSpeechBudget", () => {
  it("returns text within budget", () => {
    const longText = "word ".repeat(100);
    const result = trimTextToSpeechBudget(longText);
    expect(validateSpokenTextWithinBudget(result)).toBe(true);
  });

  it("ends with sentence punctuation", () => {
    const longText = "word ".repeat(100);
    const result = trimTextToSpeechBudget(longText);
    expect(/[.!?]$/.test(result)).toBe(true);
  });

  it("preserves as many words as possible", () => {
    const text = "One two three four five";
    const result = trimTextToSpeechBudget(text);
    expect(result).toContain("One");
  });
});

// ── haveAllExpectedPlayersResponded ─────────────────────────────────────────

describe("haveAllExpectedPlayersResponded", () => {
  it("returns true when all responded", () => {
    const responded = new Set(["p1", "p2", "p3"]);
    expect(haveAllExpectedPlayersResponded(responded, ["p1", "p2", "p3"])).toBe(true);
  });

  it("returns false when one missing", () => {
    const responded = new Set(["p1", "p2"]);
    expect(haveAllExpectedPlayersResponded(responded, ["p1", "p2", "p3"])).toBe(false);
  });

  it("returns true for empty expected list", () => {
    expect(haveAllExpectedPlayersResponded(new Set(), [])).toBe(true);
  });
});

// ── createHeadlineAssignments ───────────────────────────────────────────────

describe("createHeadlineAssignments", () => {
  it("returns empty map for < 2 players", () => {
    expect(createHeadlineAssignments(["p1"], 123).size).toBe(0);
  });

  it("assigns each player someone else's headline", () => {
    const players = ["p1", "p2", "p3"];
    const assignments = createHeadlineAssignments(players, 123);
    expect(assignments.size).toBe(3);
    for (const [playerId, sourceId] of assignments.entries()) {
      expect(playerId).not.toBe(sourceId);
      expect(players).toContain(sourceId);
    }
  });

  it("uses every headline exactly once", () => {
    const players = ["p1", "p2", "p3", "p4"];
    const assignments = createHeadlineAssignments(players, 123);
    const sources = new Set(assignments.values());
    expect(sources.size).toBe(players.length);
  });

  it("is deterministic for same seed", () => {
    const players = ["p1", "p2", "p3"];
    const a = createHeadlineAssignments(players, 123);
    const b = createHeadlineAssignments(players, 123);
    expect([...a.entries()]).toEqual([...b.entries()]);
  });
});

// ── createPresentationOrder ─────────────────────────────────────────────────

describe("createPresentationOrder", () => {
  it("returns same players in different order", () => {
    const players = ["p1", "p2", "p3"];
    const order = createPresentationOrder(players, 123);
    expect(order.sort()).toEqual(players.sort());
  });

  it("is deterministic for same seed", () => {
    const players = ["p1", "p2", "p3"];
    const a = createPresentationOrder(players, 123);
    const b = createPresentationOrder(players, 123);
    expect(a).toEqual(b);
  });

  it("handles 1 player", () => {
    expect(createPresentationOrder(["p1"], 123)).toEqual(["p1"]);
  });
});

// ── tallyBroadcastVotes ─────────────────────────────────────────────────────

describe("tallyBroadcastVotes", () => {
  const makeSubmission = (playerId: string, submittedAt: number = Date.now()): any => ({
    playerId,
    playerName: playerId,
    assignedHeadline: "Test",
    script: "Test",
    spokenText: "Test",
    voicePresetId: "anchor_classic_a",
    voiceLabel: "Classic",
    selectedMedia: FALLBACK_MEDIA_ENTRY,
    estimatedSpeechMs: 3000,
    submittedAt,
  });

  it("counts votes correctly", () => {
    const submissions = [makeSubmission("p1"), makeSubmission("p2")];
    const votes = new Map([["v1", "p1"], ["v2", "p1"], ["v3", "p2"]]);
    const results = tallyBroadcastVotes(submissions, votes);
    expect(results[0].voteCount).toBe(2);
    expect(results[1].voteCount).toBe(1);
  });

  it("marks winner on clear majority", () => {
    const submissions = [makeSubmission("p1"), makeSubmission("p2")];
    const votes = new Map([["v1", "p1"], ["v2", "p1"]]);
    const results = tallyBroadcastVotes(submissions, votes);
    expect(results[0].isWinner).toBe(true);
    expect(results[1].isWinner).toBe(false);
  });

  it("handles ties — both winners", () => {
    const submissions = [makeSubmission("p1"), makeSubmission("p2")];
    const votes = new Map([["v1", "p1"], ["v2", "p2"]]);
    const results = tallyBroadcastVotes(submissions, votes);
    expect(results[0].isWinner).toBe(true);
    expect(results[1].isWinner).toBe(true);
  });

  it("zero votes — no winners", () => {
    const submissions = [makeSubmission("p1"), makeSubmission("p2")];
    const votes = new Map();
    const results = tallyBroadcastVotes(submissions, votes);
    expect(results.every((r) => !r.isWinner)).toBe(true);
  });

  it("ignores votes for non-submissions", () => {
    const submissions = [makeSubmission("p1")];
    const votes = new Map([["v1", "p2"]]);
    const results = tallyBroadcastVotes(submissions, votes);
    expect(results[0].voteCount).toBe(0);
  });

  it("sorts by vote count descending, then submittedAt ascending", () => {
    const s1 = makeSubmission("p1", 1000);
    const s2 = makeSubmission("p2", 2000);
    const submissions = [s2, s1];
    const votes = new Map([["v1", "p1"], ["v2", "p2"], ["v3", "p2"]]);
    const results = tallyBroadcastVotes(submissions, votes);
    expect(results[0].playerId).toBe("p2");
    expect(results[1].playerId).toBe("p1");
  });
});

// ── computeRoundPoints ──────────────────────────────────────────────────────

describe("computeRoundPoints", () => {
  const makeResult = (playerId: string, voteCount: number, isWinner: boolean): any => ({
    playerId,
    playerName: playerId,
    assignedHeadline: "Test",
    script: "Test",
    spokenText: "Test",
    voicePresetId: "anchor_classic_a",
    voiceLabel: "Classic",
    selectedMedia: FALLBACK_MEDIA_ENTRY,
    estimatedSpeechMs: 3000,
    submittedAt: Date.now(),
    voteCount,
    isWinner,
  });

  it("awards participation points", () => {
    const results = [makeResult("p1", 0, false)];
    const points = computeRoundPoints(results);
    expect(points.get("p1")).toBe(PARTICIPATION_POINTS);
  });

  it("awards vote received points", () => {
    const results = [makeResult("p1", 2, false)];
    const points = computeRoundPoints(results);
    expect(points.get("p1")).toBe(PARTICIPATION_POINTS + 2 * VOTE_RECEIVED_POINTS);
  });

  it("awards winner bonus", () => {
    const results = [makeResult("p1", 0, true)];
    const points = computeRoundPoints(results);
    expect(points.get("p1")).toBe(PARTICIPATION_POINTS + WINNER_BONUS);
  });

  it("awards combined points correctly", () => {
    const results = [makeResult("p1", 3, true)];
    const points = computeRoundPoints(results);
    expect(points.get("p1")).toBe(PARTICIPATION_POINTS + 3 * VOTE_RECEIVED_POINTS + WINNER_BONUS);
  });
});

// ── normalizeMediaEntry ─────────────────────────────────────────────────────

describe("normalizeMediaEntry", () => {
  it("returns null for non-object", () => {
    expect(normalizeMediaEntry(null)).toBeNull();
    expect(normalizeMediaEntry("string")).toBeNull();
  });

  it("returns null for missing required fields", () => {
    expect(normalizeMediaEntry({ provider: "test" })).toBeNull();
  });

  it("returns null when no URLs present", () => {
    expect(normalizeMediaEntry({ provider: "test", providerAssetId: "id", label: "Test" })).toBeNull();
  });

  it("normalizes valid entry", () => {
    const entry = {
      provider: "klipy",
      providerAssetId: "123",
      label: "Test Media",
      previewUrl: "http://example.com/preview.jpg",
      playbackUrl: "http://example.com/video.mp4",
      fallbackImageUrl: "http://example.com/fallback.jpg",
      mimeType: "video/mp4",
      width: 1920,
      height: 1080,
      durationMs: 5000,
    };
    const result = normalizeMediaEntry(entry);
    expect(result).not.toBeNull();
    expect(result?.provider).toBe("klipy");
    expect(result?.width).toBe(1920);
    expect(result?.durationMs).toBe(5000);
  });

  it("truncates long strings", () => {
    const entry = {
      provider: "a".repeat(50),
      providerAssetId: "b".repeat(150),
      label: "c".repeat(150),
      previewUrl: "d".repeat(600),
      playbackUrl: "",
      fallbackImageUrl: "",
      mimeType: "e".repeat(150),
    };
    const result = normalizeMediaEntry(entry);
    expect(result?.provider.length).toBeLessThanOrEqual(40);
    expect(result?.providerAssetId.length).toBeLessThanOrEqual(100);
    expect(result?.label.length).toBeLessThanOrEqual(120);
    expect(result?.previewUrl.length).toBeLessThanOrEqual(500);
    expect(result?.mimeType.length).toBeLessThanOrEqual(120);
  });
});

// ── isAllowedMediaSelection ─────────────────────────────────────────────────

describe("isAllowedMediaSelection", () => {
  it("allows fallback media regardless of URL set", () => {
    expect(isAllowedMediaSelection(FALLBACK_MEDIA_ENTRY, new Set())).toBe(true);
  });

  it("allows media with URL in allowed set", () => {
    const media = {
      ...FALLBACK_MEDIA_ENTRY,
      provider: "klipy",
      providerAssetId: "123",
      previewUrl: "http://example.com/preview.jpg",
    };
    expect(isAllowedMediaSelection(media, new Set(["http://example.com/preview.jpg"]))).toBe(true);
  });

  it("rejects media with URL not in allowed set", () => {
    const media = {
      ...FALLBACK_MEDIA_ENTRY,
      provider: "klipy",
      providerAssetId: "123",
      previewUrl: "http://evil.com/preview.jpg",
    };
    expect(isAllowedMediaSelection(media, new Set(["http://example.com/preview.jpg"]))).toBe(false);
  });
});

// ── toPublicVoiceOption ─────────────────────────────────────────────────────

describe("toPublicVoiceOption", () => {
  it("returns null for non-object", () => {
    expect(toPublicVoiceOption(null)).toBeNull();
  });

  it("returns null for missing id", () => {
    expect(toPublicVoiceOption({ label: "Test" })).toBeNull();
  });

  it("normalizes valid voice option", () => {
    const voice = {
      id: "anchor_test",
      label: "Test Anchor",
      tone: "Test tone",
      source: "builtin",
      available: true,
      placeholder: false,
      availabilityReason: "",
    };
    const result = toPublicVoiceOption(voice);
    expect(result).not.toBeNull();
    expect(result?.id).toBe("anchor_test");
    expect(result?.available).toBe(true);
  });

  it("uses id as fallback label", () => {
    const voice = { id: "anchor_test" };
    const result = toPublicVoiceOption(voice);
    expect(result?.label).toBe("anchor_test");
  });
});
