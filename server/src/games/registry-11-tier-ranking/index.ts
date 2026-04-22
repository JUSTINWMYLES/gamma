/**
 * server/src/games/registry-11-tier-ranking/index.ts
 *
 * "S-Tier Ranking" — category-based tier list voting game.
 *
 * Mechanic
 * ───────
 * 1. One random player is selected to choose a category (30 s window).
 *    If they do not respond in time, the server picks a random suggestion.
 * 2. All players submit one unique entry for the category (30 s window).
 *    Duplicate entries are rejected.
 * 3. All submitted entries are shown. Each player has 90 s to assign every
 *    entry to a tier (S / A / B / C / D). Round ends early when all submit.
 * 4. The server tallies votes per entry (majority wins; ties → higher tier).
 *    Players who predicted the consensus tier earn points weighted by tier.
 *
 * Server messages → clients:
 *   "tr_category_phase"   { chooserId, chooserName, suggestions, durationMs }
 *   "tr_category_chosen"  { category }
 *   "tr_entry_phase"      { category, durationMs }
 *   "tr_entry_ack"        { accepted, reason?, currentEntryCount }
 *   "tr_ranking_phase"    { items, category, durationMs }
 *   "tr_rankings_ack"     {}
 *   "tr_round_result"     { finalTiers, scores, category, revealStepMs }
 *   "round_skipped"       { reason }
 *
 * Client messages ← players:
 *   { action: "tr_set_category", category: string }
 *   { action: "tr_submit_entry", entry: string }
 *   { action: "tr_submit_rankings", rankings: { item: string; tier: string }[] }
 */

import { Client } from "@colyseus/core";
import { BaseGame } from "../BaseGame";
import {
  selectCategoryChooser,
  pickRandomSuggestion,
  normalizeEntry,
  isDuplicateEntry,
  haveAllExpectedPlayersResponded,
  aggregateVotes,
  getResultsDisplayMs,
  RESULT_REVEAL_STEP_MS,
  orderResultsForReveal,
  scoreRound,
  CATEGORY_SUGGESTIONS,
  CATEGORY_PICK_DURATION_SECS,
  ENTRY_SUBMIT_DURATION_SECS,
  TIER_RANK_DURATION_SECS,
  TIERS,
  type Tier,
  type ItemResult,
} from "./tierRankingLogic";

// ── Input types ───────────────────────────────────────────────────────────────

interface TierRankingInput {
  action: "tr_set_category" | "tr_submit_entry" | "tr_submit_rankings";
  category?: string;
  entry?: string;
  rankings?: { item: string; tier: string }[];
}

// ── Per-round tracking ────────────────────────────────────────────────────────

interface RoundData {
  chooserId: string;
  category: string | null;
  /** Accepted unique entries (original casing for display). */
  entries: string[];
  /** Players who have submitted an entry. */
  entryPlayersSubmitted: Set<string>;
  /** Per-player tier votes: Map<playerId, Map<item, Tier>> */
  playerVotes: Map<string, Map<string, Tier>>;
  /** Players who have submitted their rankings. */
  rankingsSubmitted: Set<string>;
  results: ItemResult[] | null;
}

// ── Game class ────────────────────────────────────────────────────────────────

export default class TierRankingGame extends BaseGame {
  static override requiresTV = false;
  static override supportsBracket = false;
  static override defaultRoundCount = 3;
  static override minRounds = 1;
  static override maxRounds = 10;
  static override hasInstructionsPhase = true;
  static override instructionsDelivery = "broadcast" as const;

  static override activityLevel: "none" | "some" | "full" = "none";
  static override requiresSameRoom = false;
  static override requiresSecondaryDisplay = false;

  private round: RoundData | null = null;

  /** Resolves when the category chooser submits (or timeout fires). */
  private categoryResolve: ((category: string) => void) | null = null;

  /** Resolves when entry submission phase ends. */
  private entryPhaseResolve: (() => void) | null = null;

  /** Resolves when all players have submitted rankings (or timeout fires). */
  private rankingResolve: (() => void) | null = null;

  private expectedEntryPlayerIds: string[] = [];
  private expectedRankingPlayerIds: string[] = [];

  private pendingScores: Map<string, number> = new Map();
  private _extraTimers: ReturnType<typeof setTimeout>[] = [];

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  protected override async onLoad(): Promise<void> {
    for (const p of this.room.state.players.values()) {
      p.score = 0;
      p.isReady = false;
      p.isEliminated = false;
    }
  }

  protected override async runRound(roundNum: number): Promise<void> {
    const players = this._activePlayers();

    if (players.length < 2) {
      this.broadcast("round_skipped", { reason: "Not enough connected players (need 2+)" });
      return;
    }

    const playerIds = players.map((p) => p.id);

    // ── 1. Select category chooser ─────────────────────────────────────────
    const chooserId = selectCategoryChooser(playerIds);
    const chooserName = this.room.state.players.get(chooserId)?.name ?? "Unknown";

    this.round = {
      chooserId,
      category: null,
      entries: [],
      entryPlayersSubmitted: new Set(),
      playerVotes: new Map(),
      rankingsSubmitted: new Set(),
      results: null,
    };

    // Notify all players of the category-pick phase
    this.broadcast("tr_category_phase", {
      chooserId,
      chooserName,
      suggestions: CATEGORY_SUGGESTIONS,
      durationMs: CATEGORY_PICK_DURATION_SECS * 1000,
    });

    // ── 2. Wait for category choice (or timeout) ───────────────────────────
    const category = await this._waitForCategory();
    this.round.category = category;

    this.broadcast("tr_category_chosen", { category });

    // ── 3. Entry submission phase ──────────────────────────────────────────
    this.broadcast("tr_entry_phase", {
      category,
      durationMs: ENTRY_SUBMIT_DURATION_SECS * 1000,
    });

    await this._waitForEntries(playerIds);

    const entries = this.round.entries;

    if (entries.length < 1) {
      this.broadcast("round_skipped", { reason: "No entries were submitted" });
      return;
    }

    // ── 4. Tier ranking phase ──────────────────────────────────────────────
    this.broadcast("tr_ranking_phase", {
      items: entries,
      category,
      durationMs: TIER_RANK_DURATION_SECS * 1000,
    });

    this.room.state.roundDurationSecs = TIER_RANK_DURATION_SECS;
    this.expectedRankingPlayerIds = [...playerIds];

    await this._waitForRankings(playerIds);

    // ── 5. Aggregate results ───────────────────────────────────────────────
    const results = aggregateVotes(this.round.playerVotes, entries);
    this.round.results = results;

    const scores = scoreRound(this.round.playerVotes, results);

    // Store for scoreRound()
    this.pendingScores.clear();
    for (const [id, pts] of scores.entries()) {
      this.pendingScores.set(id, pts);
    }

    this.broadcast("tr_round_result", {
      finalTiers: orderResultsForReveal(results).map((r) => ({
        item: r.item,
        tier: r.tier,
        voteCounts: r.voteCounts,
      })),
      scores: Object.fromEntries(scores),
      category,
      revealStepMs: RESULT_REVEAL_STEP_MS,
    });

    await this.delay(getResultsDisplayMs(results.length));
  }

  protected override scoreRound(_round: number): void {
    for (const [playerId, points] of this.pendingScores.entries()) {
      const player = this.room.state.players.get(playerId);
      if (player) {
        player.score += points;
      }
    }
    this.pendingScores.clear();
  }

  override handleInput(client: Client, data: unknown): void {
    const input = data as TierRankingInput;
    if (!input || !input.action) return;

    switch (input.action) {
      case "tr_set_category":
        this._handleSetCategory(client, input.category);
        break;
      case "tr_submit_entry":
        this._handleSubmitEntry(client, input.entry);
        break;
      case "tr_submit_rankings":
        this._handleSubmitRankings(client, input.rankings);
        break;
    }
  }

  override teardown(): void {
    super.teardown();
    for (const t of this._extraTimers) clearTimeout(t);
    this._extraTimers = [];
    this.round = null;
    this.categoryResolve = null;
    this.entryPhaseResolve = null;
    this.rankingResolve = null;
    this.expectedEntryPlayerIds = [];
    this.expectedRankingPlayerIds = [];
    this.pendingScores.clear();
  }

  // ── Phase wait helpers ────────────────────────────────────────────────────

  private _waitForCategory(): Promise<string> {
    return new Promise<string>((resolve) => {
      this.categoryResolve = resolve;

      const timeout = setTimeout(() => {
        if (this.categoryResolve) {
          const fallback = pickRandomSuggestion();
          this.categoryResolve = null;
          resolve(fallback);
        }
      }, CATEGORY_PICK_DURATION_SECS * 1000);

      this._extraTimers.push(timeout);
    });
  }

  private _waitForEntries(playerIds: string[]): Promise<void> {
    return new Promise<void>((resolve) => {
      this.expectedEntryPlayerIds = [...playerIds];
      this.entryPhaseResolve = resolve;

      const timeout = setTimeout(() => {
        this.entryPhaseResolve = null;
        resolve();
      }, ENTRY_SUBMIT_DURATION_SECS * 1000);

      this._extraTimers.push(timeout);

      // Also check immediately in case all players already submitted
      // (unlikely at this point, but safe to check)
      this._checkEntryPhaseComplete(playerIds);
    });
  }

  private _checkEntryPhaseComplete(playerIds: string[]): void {
    const rd = this.round;
    if (!rd || !this.entryPhaseResolve) return;

    if (haveAllExpectedPlayersResponded(playerIds, rd.entryPlayersSubmitted)) {
      const resolve = this.entryPhaseResolve;
      this.entryPhaseResolve = null;
      resolve();
    }
  }

  private _waitForRankings(playerIds: string[]): Promise<void> {
    return new Promise<void>((resolve) => {
      this.expectedRankingPlayerIds = [...playerIds];
      this.rankingResolve = resolve;

      const timeout = setTimeout(() => {
        this.rankingResolve = null;
        resolve();
      }, TIER_RANK_DURATION_SECS * 1000);

      this._extraTimers.push(timeout);

      // Check immediately in case all players have already submitted
      this._checkRankingPhaseComplete(playerIds);
    });
  }

  private _checkRankingPhaseComplete(playerIds: string[]): void {
    const rd = this.round;
    if (!rd || !this.rankingResolve) return;

    if (haveAllExpectedPlayersResponded(playerIds, rd.rankingsSubmitted)) {
      const resolve = this.rankingResolve;
      this.rankingResolve = null;
      resolve();
    }
  }

  // ── Input handlers ────────────────────────────────────────────────────────

  private _handleSetCategory(client: Client, category: string | undefined): void {
    const rd = this.round;
    if (!rd || !this.categoryResolve) return;
    if (client.sessionId !== rd.chooserId) return;

    const normalized = category?.trim();
    if (!normalized || normalized.length === 0) return;

    const resolve = this.categoryResolve;
    this.categoryResolve = null;
    resolve(normalized);
  }

  private _handleSubmitEntry(client: Client, entry: string | undefined): void {
    const rd = this.round;
    if (!rd || !this.entryPhaseResolve) return;

    if (rd.entryPlayersSubmitted.has(client.sessionId)) {
      this.send(client.sessionId, "tr_entry_ack", {
        accepted: false,
        reason: "You already submitted an entry for this round.",
        currentEntryCount: rd.entries.length,
      });
      return;
    }

    const normalized = normalizeEntry(entry ?? "");
    if (!normalized) {
      this.send(client.sessionId, "tr_entry_ack", {
        accepted: false,
        reason: "Entry cannot be empty.",
        currentEntryCount: rd.entries.length,
      });
      return;
    }

    if (isDuplicateEntry(normalized, rd.entries)) {
      this.send(client.sessionId, "tr_entry_ack", {
        accepted: false,
        reason: "That entry has already been submitted. Try something else!",
        currentEntryCount: rd.entries.length,
      });
      return;
    }

    // Accept the entry (store original casing for display)
    rd.entries.push(entry!.trim());
    rd.entryPlayersSubmitted.add(client.sessionId);

    this.send(client.sessionId, "tr_entry_ack", {
      accepted: true,
      currentEntryCount: rd.entries.length,
    });

    // Check if all connected players have submitted
    this._checkEntryPhaseComplete(this.expectedEntryPlayerIds);
  }

  private _handleSubmitRankings(
    client: Client,
    rankings: { item: string; tier: string }[] | undefined,
  ): void {
    const rd = this.round;
    if (!rd || !this.rankingResolve) return;
    if (!rankings || !Array.isArray(rankings)) return;

    // Already submitted
    if (rd.rankingsSubmitted.has(client.sessionId)) return;

    const votes = new Map<string, Tier>();
    for (const { item, tier } of rankings) {
      if ((TIERS as readonly string[]).includes(tier) && rd.entries.includes(item)) {
        votes.set(item, tier as Tier);
      }
    }

    rd.playerVotes.set(client.sessionId, votes);
    rd.rankingsSubmitted.add(client.sessionId);

    this.send(client.sessionId, "tr_rankings_ack", {});

    // Check if all connected players have submitted
    this._checkRankingPhaseComplete(this.expectedRankingPlayerIds);
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  private _activePlayers() {
    return [...this.room.state.players.values()].filter(
      (p) => this.isPlayerActive(p),
    );
  }
}
