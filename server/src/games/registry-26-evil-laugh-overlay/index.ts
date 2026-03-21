/**
 * server/src/games/registry-26-evil-laugh-overlay/index.ts
 *
 * "Evil Laugh Overlay" — pick a GIF, get assigned someone else's pick,
 * record your best evil laugh over it, then everyone votes for the best.
 *
 * Game flow (single round = full session):
 * ─────────────────────────────────────────
 *   1. GIF_SELECTION  (120s) — All players browse a GIF pool and pick one.
 *   2. REDISTRIBUTION        — Server shuffles selections and assigns each
 *                              player a *different* player's GIF.
 *   3. RECORDING     (60s/player) — One player at a time records audio over
 *                              their assigned GIF. TV shows recording live.
 *   4. PLAYBACK               — Each GIF+audio combo is played on TV sequentially.
 *   5. VOTING        (30s)    — All players vote for the funniest (can't vote self).
 *   6. RESULTS                — Scores shown.
 *
 * GIF sourcing
 * ────────────
 * Uses a curated URL pool (GIF_POOL). Designed so swapping to a Giphy/Tenor
 * API is a one-function change: replace `getGifPool()` with an async fetch.
 *
 * Server messages → clients:
 *   "gif_selection_start"  { gifs: GifEntry[], durationMs, serverTimestamp }
 *   "gif_selection_update" { submitted, total }
 *   "gif_assigned"         { gifUrl, gifLabel, originalPicker, durationMs, serverTimestamp }
 *                          ↑ sent privately to the recording player
 *   "recording_turn"       { playerId, playerName, gifUrl, gifLabel, durationMs, serverTimestamp }
 *                          ↑ broadcast to all (TV shows it, other players wait)
 *   "recording_submitted"  { playerId }
 *   "playback_entry"       { playerId, playerName, gifUrl, gifLabel, audioBase64 }
 *   "playback_done"        {}
 *   "voting_start"         { durationMs, entries: { playerId, playerName }[], serverTimestamp }
 *   "vote_confirmed"       { targetId }
 *   "vote_count_update"    { votesIn, totalVoters }
 *   "round_result"         { winner, scores, entries }
 *
 * Client messages ← players:
 *   { action: "select_gif", gifUrl }
 *   { action: "submit_recording", audioBase64 }
 *   { action: "vote", targetId }
 */

import { Client } from "@colyseus/core";
import { BaseGame } from "../BaseGame";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Time for all players to browse and select a GIF (ms). */
const GIF_SELECTION_DURATION_MS = 120_000;
/** Time each player has to record their audio (ms). */
const RECORDING_DURATION_MS = 60_000;
/** Time each playback entry is displayed (ms). */
const PLAYBACK_ENTRY_DISPLAY_MS = 8_000;
/** Voting duration (ms). */
const VOTING_DURATION_MS = 30_000;
/** Results display (ms). */
const RESULTS_DISPLAY_MS = 8_000;

/** Points for each vote received. */
const POINTS_PER_VOTE = 50;
/** Bonus for the most-voted player. */
const WINNER_BONUS = 100;
/** Participation points for submitting a recording. */
const PARTICIPATION_POINTS = 25;

// ── GIF Pool ──────────────────────────────────────────────────────────────────

export interface GifEntry {
  url: string;
  label: string;
}

/**
 * Returns the pool of GIFs available for selection.
 *
 * **Swap point**: To integrate Giphy/Tenor, change this function to
 * `async getGifPool(): Promise<GifEntry[]>` and fetch from the API.
 * The rest of the game code only needs GifEntry[].
 */
function getGifPool(): GifEntry[] {
  return GIF_POOL;
}

/**
 * Curated GIF pool. Each entry has a direct URL to a GIF and a label.
 * Using media.giphy.com direct links for reliability.
 * Replace this array (or the getGifPool function) to use an API.
 */
const GIF_POOL: GifEntry[] = [
  { url: "https://media.giphy.com/media/Vuw9m5wXviFIQ/giphy.gif", label: "Evil Laugh" },
  { url: "https://media.giphy.com/media/cEYFeDKVPTmRgIG9fmo/giphy.gif", label: "Villainous Smile" },
  { url: "https://media.giphy.com/media/3o7abB06u9bNzA8lu8/giphy.gif", label: "Scheming" },
  { url: "https://media.giphy.com/media/11JbaLzOXsg6Fq/giphy.gif", label: "Maniacal" },
  { url: "https://media.giphy.com/media/l0MYB8Jtk0TWnGfjW/giphy.gif", label: "Finger Tapping" },
  { url: "https://media.giphy.com/media/YAlhwn67KT76E/giphy.gif", label: "Evil Genius" },
  { url: "https://media.giphy.com/media/3o7btNhMBytxAM6YBa/giphy.gif", label: "Thunder Clap" },
  { url: "https://media.giphy.com/media/l41YtZOb9EUABnuqA/giphy.gif", label: "Dramatic" },
  { url: "https://media.giphy.com/media/fDzM81OYrNjJC/giphy.gif", label: "Spooky" },
  { url: "https://media.giphy.com/media/xTiTnBMEz7zAKs57LG/giphy.gif", label: "Dark Lord" },
  { url: "https://media.giphy.com/media/Lopx9eUi34rbq/giphy.gif", label: "World Domination" },
  { url: "https://media.giphy.com/media/3oEjI80DSa1grNPTDq/giphy.gif", label: "Wicked" },
  { url: "https://media.giphy.com/media/10FHR5A4cXqVrO/giphy.gif", label: "Cackling" },
  { url: "https://media.giphy.com/media/fcK30LKXjG6Tm/giphy.gif", label: "Sinister" },
  { url: "https://media.giphy.com/media/UO5elnTqo4vSg/giphy.gif", label: "Mischief" },
  { url: "https://media.giphy.com/media/xUPGcJGy8I928hIlWE/giphy.gif", label: "Master Plan" },
  { url: "https://media.giphy.com/media/3oEjHGr1Fhz0kyv8Ig/giphy.gif", label: "Dramatic Reveal" },
  { url: "https://media.giphy.com/media/3orieKZ9ax8nsJnSs8/giphy.gif", label: "Plotting" },
  { url: "https://media.giphy.com/media/LRVnPYqM8DLag/giphy.gif", label: "Mad Scientist" },
  { url: "https://media.giphy.com/media/3o85xIO33l7RlmLR4I/giphy.gif", label: "Chaos" },
  { url: "https://media.giphy.com/media/l4FATJpd4LWgeruTK/giphy.gif", label: "Shadows" },
  { url: "https://media.giphy.com/media/l0MYH8Q83CXvKzXyM/giphy.gif", label: "Fire" },
  { url: "https://media.giphy.com/media/l0HlFZ3c4NENSLQRi/giphy.gif", label: "Storm" },
  { url: "https://media.giphy.com/media/3oEjI1erPMTMBFmNHi/giphy.gif", label: "Evil Eye" },
  { url: "https://media.giphy.com/media/14ceV8wMLIGO6Q/giphy.gif", label: "Dark Side" },
  { url: "https://media.giphy.com/media/3o6Zt481isNVuQI1l6/giphy.gif", label: "Menacing" },
  { url: "https://media.giphy.com/media/xUA7aM09ByyR1w5YWc/giphy.gif", label: "Creepy" },
  { url: "https://media.giphy.com/media/l2JdU7bLgARF0PyKY/giphy.gif", label: "Power" },
  { url: "https://media.giphy.com/media/3o7btUg31OCi0NXdkY/giphy.gif", label: "Haunted" },
  { url: "https://media.giphy.com/media/J2xkAW1E8kvyE/giphy.gif", label: "Diabolical" },
];

// ── Per-session tracking ──────────────────────────────────────────────────────

interface GifSelection {
  playerId: string;
  playerName: string;
  gifUrl: string;
  gifLabel: string;
}

interface GifAssignment {
  playerId: string;
  playerName: string;
  /** The GIF this player must dub (picked by someone else). */
  gifUrl: string;
  gifLabel: string;
  /** Name of the player who originally picked this GIF. */
  originalPicker: string;
  /** Recorded audio as base64 (filled during recording phase). */
  audioBase64: string;
}

interface SessionData {
  /** Which GIF each player selected in phase 1. */
  selections: Map<string, GifSelection>;
  /** Shuffled assignments for recording. */
  assignments: Map<string, GifAssignment>;
  /** Votes: voterId → targetId. */
  votes: Map<string, string>;
  /** Ordered list of player IDs for sequential recording. */
  recordingOrder: string[];
  /** Index of the player currently recording. */
  currentRecorderIndex: number;
  /** Resolve function to unblock the current recording wait. */
  recordingResolve: (() => void) | null;
}

// ── Game class ────────────────────────────────────────────────────────────────

export default class EvilLaughOverlayGame extends BaseGame {
  static override requiresTV = false;
  static override supportsBracket = false;
  static override defaultRoundCount = 1;
  static override minRounds = 1;
  static override maxRounds = 1;
  static override hasInstructionsPhase = true;
  static override instructionsDelivery = "broadcast" as const;

  static override activityLevel: "none" | "some" | "full" = "none";
  static override requiresSameRoom = true;
  static override requiresSecondaryDisplay = false;

  private session: SessionData | null = null;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  protected override async onLoad(): Promise<void> {
    for (const p of this.room.state.players.values()) {
      p.score = 0;
      p.isReady = false;
      p.isEliminated = false;
    }
  }

  /**
   * The entire game runs as a single "round" since the flow
   * (select → record → playback → vote) is one continuous session.
   */
  protected override async runRound(_round: number): Promise<void> {
    const players = this._activePlayers();
    if (players.length < 2) {
      this.broadcast("round_skipped", { reason: "Need at least 2 players" });
      return;
    }

    this.session = {
      selections: new Map(),
      assignments: new Map(),
      votes: new Map(),
      recordingOrder: [],
      currentRecorderIndex: -1,
      recordingResolve: null,
    };

    // ── Phase 1: GIF Selection ──────────────────────────────────────────
    const gifPool = getGifPool();
    this.broadcast("gif_selection_start", {
      gifs: gifPool,
      durationMs: GIF_SELECTION_DURATION_MS,
      serverTimestamp: Date.now(),
    });

    // Reset ready flags for selection tracking
    for (const p of this.room.state.players.values()) {
      p.isReady = false;
    }

    await this._waitForAllSelectionsOrTimeout(GIF_SELECTION_DURATION_MS);

    // Auto-assign a random GIF to anyone who didn't pick
    for (const p of this._activePlayers()) {
      if (!this.session.selections.has(p.id)) {
        const randomGif = gifPool[Math.floor(Math.random() * gifPool.length)];
        this.session.selections.set(p.id, {
          playerId: p.id,
          playerName: p.name,
          gifUrl: randomGif.url,
          gifLabel: randomGif.label,
        });
      }
    }

    // ── Phase 2: Redistribution ─────────────────────────────────────────
    this._redistributeGifs();

    // ── Phase 3: Sequential Recording ───────────────────────────────────
    const order = this.session.recordingOrder;
    for (let i = 0; i < order.length; i++) {
      this.session.currentRecorderIndex = i;
      const playerId = order[i];
      const assignment = this.session.assignments.get(playerId);
      if (!assignment) continue;

      // Tell everyone whose turn it is (TV shows the GIF, others wait)
      this.broadcast("recording_turn", {
        playerId: assignment.playerId,
        playerName: assignment.playerName,
        gifUrl: assignment.gifUrl,
        gifLabel: assignment.gifLabel,
        durationMs: RECORDING_DURATION_MS,
        serverTimestamp: Date.now(),
      });

      // Send private message to the recorder with their assignment
      this.send(playerId, "gif_assigned", {
        gifUrl: assignment.gifUrl,
        gifLabel: assignment.gifLabel,
        originalPicker: assignment.originalPicker,
        durationMs: RECORDING_DURATION_MS,
        serverTimestamp: Date.now(),
      });

      // Wait for recording submission or timeout
      await this._waitForRecordingOrTimeout(playerId, RECORDING_DURATION_MS);
    }

    // ── Phase 4: TV Playback ────────────────────────────────────────────
    const assignments = [...this.session.assignments.values()].filter(
      (a) => a.audioBase64.length > 0,
    );

    for (const entry of assignments) {
      this.broadcast("playback_entry", {
        playerId: entry.playerId,
        playerName: entry.playerName,
        gifUrl: entry.gifUrl,
        gifLabel: entry.gifLabel,
        audioBase64: entry.audioBase64,
      });
      await this.delay(PLAYBACK_ENTRY_DISPLAY_MS);
    }
    this.broadcast("playback_done", {});

    // ── Phase 5: Voting ─────────────────────────────────────────────────
    if (assignments.length >= 2) {
      this.broadcast("voting_start", {
        durationMs: VOTING_DURATION_MS,
        serverTimestamp: Date.now(),
        entries: assignments.map((a) => ({
          playerId: a.playerId,
          playerName: a.playerName,
        })),
      });

      await this._waitForAllVotesOrTimeout(VOTING_DURATION_MS);
    }

    // ── Phase 6: Results ────────────────────────────────────────────────
    const results = this._computeResults();
    this.broadcast("round_result", results);
    await this.delay(RESULTS_DISPLAY_MS);
  }

  protected override scoreRound(_round: number): void {
    if (!this.session) return;
    const results = this._computeResults();
    for (const [playerId, points] of Object.entries(results.scores)) {
      const player = this.room.state.players.get(playerId);
      if (player) {
        player.score += points;
      }
    }
  }

  override handleInput(client: Client, data: unknown): void {
    const input = data as {
      action?: string;
      gifUrl?: string;
      audioBase64?: string;
      targetId?: string;
    };
    if (!input || !input.action) return;

    switch (input.action) {
      case "select_gif":
        this._handleGifSelection(client, input.gifUrl);
        break;
      case "submit_recording":
        this._handleRecordingSubmission(client, input.audioBase64);
        break;
      case "vote":
        this._handleVote(client, input.targetId);
        break;
    }
  }

  override teardown(): void {
    super.teardown();
    // Resolve any pending recording wait
    if (this.session?.recordingResolve) {
      this.session.recordingResolve();
    }
    this.session = null;
  }

  // ── Input handlers ────────────────────────────────────────────────────────

  private _handleGifSelection(client: Client, gifUrl?: string): void {
    if (!this.session || !gifUrl) return;
    const player = this.room.state.players.get(client.sessionId);
    if (!player) return;

    // Validate that the GIF is from our pool
    const pool = getGifPool();
    const match = pool.find((g) => g.url === gifUrl);
    if (!match) return;

    // Already selected? Overwrite (let them change their mind)
    this.session.selections.set(client.sessionId, {
      playerId: client.sessionId,
      playerName: player.name,
      gifUrl: match.url,
      gifLabel: match.label,
    });
    player.isReady = true;

    this.send(client.sessionId, "gif_selection_confirmed", { gifUrl: match.url });

    // Broadcast progress
    this.broadcast("gif_selection_update", {
      submitted: this.session.selections.size,
      total: this._activePlayers().length,
    });
  }

  private _handleRecordingSubmission(client: Client, audioBase64?: string): void {
    if (!this.session || !audioBase64) return;

    // Only accept from the current recorder
    const currentId = this.session.recordingOrder[this.session.currentRecorderIndex];
    if (client.sessionId !== currentId) return;

    // Size cap (~2MB encoded)
    if (audioBase64.length > 2_800_000) return;

    const assignment = this.session.assignments.get(client.sessionId);
    if (!assignment) return;

    assignment.audioBase64 = audioBase64;

    this.broadcast("recording_submitted", { playerId: client.sessionId });

    // Unblock the recording wait
    if (this.session.recordingResolve) {
      this.session.recordingResolve();
      this.session.recordingResolve = null;
    }
  }

  private _handleVote(client: Client, targetId?: string): void {
    if (!this.session || !targetId) return;
    if (targetId === client.sessionId) return; // can't vote for self
    if (this.session.votes.has(client.sessionId)) return; // already voted
    if (!this.session.assignments.has(targetId)) return; // target must exist

    // Verify target actually submitted audio
    const targetAssignment = this.session.assignments.get(targetId);
    if (!targetAssignment || !targetAssignment.audioBase64) return;

    this.session.votes.set(client.sessionId, targetId);
    this.send(client.sessionId, "vote_confirmed", { targetId });

    this.broadcast("vote_count_update", {
      votesIn: this.session.votes.size,
      totalVoters: this._activePlayers().length,
    });
  }

  // ── Redistribution ────────────────────────────────────────────────────────

  /**
   * Shuffle GIF selections so each player dubs someone else's pick.
   * Uses a derangement (no one gets their own selection).
   */
  private _redistributeGifs(): void {
    if (!this.session) return;

    const playerIds = [...this.session.selections.keys()];
    const selections = [...this.session.selections.values()];

    // Create a derangement of indices
    const n = playerIds.length;
    const deranged = this._derangement(n);

    const order: string[] = [];

    for (let i = 0; i < n; i++) {
      const assigneeId = playerIds[i];
      const assigneeName =
        this.room.state.players.get(assigneeId)?.name ?? "Player";
      const source = selections[deranged[i]]; // The GIF they'll dub (someone else's pick)

      this.session.assignments.set(assigneeId, {
        playerId: assigneeId,
        playerName: assigneeName,
        gifUrl: source.gifUrl,
        gifLabel: source.gifLabel,
        originalPicker: source.playerName,
        audioBase64: "",
      });

      order.push(assigneeId);
    }

    // Shuffle recording order
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    this.session.recordingOrder = order;
  }

  /**
   * Generate a random derangement of [0..n-1].
   * A derangement is a permutation where no element appears in its original position.
   */
  private _derangement(n: number): number[] {
    if (n <= 1) return [0]; // Edge case: can't derange a single element

    // Simple rejection method — expected ~e attempts
    const original = Array.from({ length: n }, (_, i) => i);
    let perm: number[];
    do {
      perm = [...original];
      for (let i = perm.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [perm[i], perm[j]] = [perm[j], perm[i]];
      }
    } while (perm.some((val, idx) => val === idx));

    return perm;
  }

  // ── Wait helpers ──────────────────────────────────────────────────────────

  private _activePlayers() {
    return [...this.room.state.players.values()].filter(
      (p) => p.isConnected && !p.isEliminated,
    );
  }

  private async _waitForAllSelectionsOrTimeout(timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const check = setInterval(() => {
        const active = this._activePlayers();
        const allSelected = active.every((p) =>
          this.session?.selections.has(p.id),
        );
        if (allSelected) {
          clearInterval(check);
          resolve();
        }
      }, 300);
      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, timeoutMs);
    });
  }

  private async _waitForRecordingOrTimeout(
    playerId: string,
    timeoutMs: number,
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      // If player already submitted (shouldn't happen, but safety)
      const assignment = this.session?.assignments.get(playerId);
      if (assignment && assignment.audioBase64) {
        resolve();
        return;
      }

      if (this.session) {
        this.session.recordingResolve = resolve;
      }

      setTimeout(() => {
        if (this.session) {
          this.session.recordingResolve = null;
        }
        resolve();
      }, timeoutMs + 2000); // +2s grace for network
    });
  }

  private async _waitForAllVotesOrTimeout(timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const check = setInterval(() => {
        const active = this._activePlayers();
        const allVoted = active.every((p) => this.session?.votes.has(p.id));
        if (allVoted) {
          clearInterval(check);
          resolve();
        }
      }, 200);
      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, timeoutMs);
    });
  }

  // ── Scoring ───────────────────────────────────────────────────────────────

  private _computeResults(): {
    winner: string | null;
    scores: Record<string, number>;
    entries: {
      playerId: string;
      playerName: string;
      gifUrl: string;
      gifLabel: string;
      voteCount: number;
    }[];
  } {
    if (!this.session)
      return { winner: null, scores: {}, entries: [] };

    const voteCounts = new Map<string, number>();
    for (const targetId of this.session.votes.values()) {
      voteCounts.set(targetId, (voteCounts.get(targetId) ?? 0) + 1);
    }

    const scores: Record<string, number> = {};
    let maxVotes = 0;
    let winner: string | null = null;

    const entries = [...this.session.assignments.values()]
      .filter((a) => a.audioBase64.length > 0)
      .map((a) => {
        const vc = voteCounts.get(a.playerId) ?? 0;
        scores[a.playerId] = PARTICIPATION_POINTS + vc * POINTS_PER_VOTE;
        if (vc > maxVotes) {
          maxVotes = vc;
          winner = a.playerId;
        }
        return {
          playerId: a.playerId,
          playerName: a.playerName,
          gifUrl: a.gifUrl,
          gifLabel: a.gifLabel,
          voteCount: vc,
        };
      });

    // Winner bonus
    if (winner && maxVotes > 0) {
      scores[winner] += WINNER_BONUS;
    }

    // Non-submitters get 0
    for (const p of this._activePlayers()) {
      if (!(p.id in scores)) {
        scores[p.id] = 0;
      }
    }

    return { winner, scores, entries };
  }
}
