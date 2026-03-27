/**
 * server/src/games/registry-40-paint-match/index.ts
 *
 * "Paint Match" — colour-mixing party game.
 *
 * Game Rules
 * ──────────
 * The server generates a random target RGB colour displayed on the TV.
 * Each player's phone shows a colour-mixing canvas with five virtual paint
 * buckets: red, yellow, blue, white, and black.  Players adjust the amount
 * of each paint to blend a custom colour in real time.  When satisfied, they
 * submit their mix.  Once everyone has submitted (or the timer expires),
 * the server computes the perceptual colour distance (CIE76 deltaE) between
 * each player's mix and the target, ranking players closest → farthest.
 *
 * Server Flow
 * ───────────
 *   onLoad()      — reset scores, clear previous targets
 *   runRound(n)   — generate target → broadcast target → wait for submissions
 *                    or timer → compute distances → broadcast results
 *   scoreRound(n) — apply round scores to player state
 *   handleInput() — handle "mix_update" (throttled preview) and "mix_submit"
 *
 * Message Protocol
 * ────────────────
 *   Server → All:
 *     "color_target"   { targetRGB: [r,g,b] }
 *     "round_results"  { rankings: RoundResult[] }
 *     "submit_count"   { submitted: number, total: number }
 *
 *   Client → Server (via handleInput):
 *     { action: "mix_update",  mix: PaintMix }
 *     { action: "mix_submit",  mix: PaintMix }
 */

import { Client } from "@colyseus/core";
import { BaseGame } from "../BaseGame";
import {
  PaintMix,
  RGB,
  RoundResult,
  mixToRGB,
  deltaE,
  computeScore,
  rankResults,
  generateTargetColor,
} from "./colorUtils";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Time allowed per round (ms).  Host timeLimitSecs overrides this. */
const DEFAULT_ROUND_DURATION_MS = 30_000;

/** Time to display results between rounds (ms). */
const RESULTS_DISPLAY_MS = 6_000;

/** Default paint mix (no paint = white canvas). */
const EMPTY_MIX: PaintMix = { red: 0, yellow: 0, blue: 0, white: 0, black: 0 };

// ── Per-round tracking ────────────────────────────────────────────────────────

interface PlayerSubmission {
  mix: PaintMix;
  rgb: RGB;
  distance: number;
  score: number;
  submittedAt: number;
}

interface RoundData {
  targetRGB: RGB;
  /** Last known mix for each player (updated on mix_update). */
  currentMixes: Map<string, PaintMix>;
  /** Locked submissions. */
  submissions: Map<string, PlayerSubmission>;
  /** Epoch ms when the round started. */
  startedAt: number;
}

// ── Game class ────────────────────────────────────────────────────────────────

export default class PaintMatchGame extends BaseGame {
  // ── Plugin metadata ─────────────────────────────────────────────────────

  static override requiresTV = true;
  static override supportsBracket = true;
  static override defaultRoundCount = 5;
  static override minRounds = 1;
  static override maxRounds = 10;
  static override hasInstructionsPhase = true;
  static override instructionsDelivery = "broadcast" as const;

  static override activityLevel: "none" | "some" | "full" = "none";
  static override requiresSameRoom = false;
  static override requiresSecondaryDisplay = false;

  // ── Instance state ────────────────────────────────────────────────────────

  private roundData: RoundData | null = null;
  private previousTargets: RGB[] = [];
  private roundResults: RoundResult[] = [];

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  protected override async onLoad(): Promise<void> {
    this.previousTargets = [];
    for (const p of this.room.state.players.values()) {
      p.score = 0;
      p.isReady = false;
      p.isEliminated = false;
    }
  }

  protected override async runRound(round: number): Promise<void> {
    const players = this._activePlayers();
    if (players.length === 0) return;

    // 1. Generate target colour (distinct from previous rounds)
    const targetRGB = generateTargetColor(this.previousTargets);
    this.previousTargets.push(targetRGB);

    // 2. Initialise round data
    this.roundData = {
      targetRGB,
      currentMixes: new Map(),
      submissions: new Map(),
      startedAt: Date.now(),
    };

    // Set each player's starting mix to empty
    for (const p of players) {
      this.roundData.currentMixes.set(p.id, { ...EMPTY_MIX });
    }

    // 3. Broadcast target to all players (TV + phones)
    this.broadcast("color_target", {
      roundId: round,
      targetRGB,
    });

    // 4. Broadcast initial submit count
    this._broadcastSubmitCount();

    // 5. Wait for all submissions or timer expiry
    const roundDurationMs = (this.room.state.gameConfig.timeLimitSecs || 30) * 1000;
    await this._waitForSubmissionsOrTimeout(roundDurationMs);

    // 6. Auto-submit for any player who didn't submit
    this._autoSubmitRemaining();

    // 7. Compute results
    this.roundResults = this._computeResults();

    // 8. Broadcast results
    this.broadcast("round_results", {
      roundId: round,
      targetRGB,
      rankings: this.roundResults,
    });

    await this.delay(RESULTS_DISPLAY_MS);
  }

  protected override scoreRound(_round: number): void {
    for (const result of this.roundResults) {
      const player = this.room.state.players.get(result.playerId);
      if (player) {
        player.score += result.score;
      }
    }
  }

  override handleInput(client: Client, data: unknown): void {
    const input = data as {
      action?: string;
      mix?: PaintMix;
    };
    if (!input || !input.action) return;

    switch (input.action) {
      case "mix_update":
        this._handleMixUpdate(client, input.mix);
        break;
      case "mix_submit":
        this._handleMixSubmit(client, input.mix);
        break;
    }
  }

  override teardown(): void {
    super.teardown();
    this.roundData = null;
    this.roundResults = [];
  }

  // ── Input handlers ────────────────────────────────────────────────────────

  private _handleMixUpdate(client: Client, mix: PaintMix | undefined): void {
    if (!this.roundData || !mix) return;
    if (!this._isValidMix(mix)) return;

    // Only accept updates from active, non-submitted players
    if (this.roundData.submissions.has(client.sessionId)) return;

    this.roundData.currentMixes.set(client.sessionId, {
      red: mix.red,
      yellow: mix.yellow,
      blue: mix.blue,
      white: mix.white,
      black: mix.black,
    });
  }

  private _handleMixSubmit(client: Client, mix: PaintMix | undefined): void {
    if (!this.roundData) return;

    // Can't submit twice
    if (this.roundData.submissions.has(client.sessionId)) return;

    // Use provided mix or fall back to last known mix
    const finalMix = this._isValidMix(mix)
      ? { red: mix!.red, yellow: mix!.yellow, blue: mix!.blue, white: mix!.white, black: mix!.black }
      : this.roundData.currentMixes.get(client.sessionId) ?? { ...EMPTY_MIX };

    const rgb = mixToRGB(finalMix);
    const distance = deltaE(rgb, this.roundData.targetRGB);
    const score = computeScore(distance);

    this.roundData.submissions.set(client.sessionId, {
      mix: finalMix,
      rgb,
      distance,
      score,
      submittedAt: Date.now(),
    });

    // Confirm to the submitting player
    this.send(client.sessionId, "submit_confirmed", {
      mixRGB: rgb,
      distance,
      score,
    });

    // Broadcast updated submit count
    this._broadcastSubmitCount();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Return connected, non-eliminated players. */
  private _activePlayers() {
    return [...this.room.state.players.values()].filter(
      (p) => p.isConnected && !p.isEliminated,
    );
  }

  /** Validate that a mix has the required fields and reasonable values. */
  private _isValidMix(mix: PaintMix | undefined | null): mix is PaintMix {
    if (!mix || typeof mix !== "object") return false;
    return (
      typeof mix.red === "number" &&
      typeof mix.yellow === "number" &&
      typeof mix.blue === "number" &&
      typeof mix.white === "number" &&
      typeof mix.black === "number"
    );
  }

  /** Wait until all active players have submitted or timeout elapses. */
  private _waitForSubmissionsOrTimeout(durationMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (this._allSubmitted()) {
          clearInterval(check);
          resolve();
        }
      }, 200);

      const timeout = setTimeout(() => {
        clearInterval(check);
        resolve();
      }, durationMs);

      // Register for cleanup
      this._registerTimer(timeout);
    });
  }

  /** Check if all active players have submitted. */
  private _allSubmitted(): boolean {
    if (!this.roundData) return true;
    const active = this._activePlayers();
    return active.length > 0 && active.every((p) => this.roundData!.submissions.has(p.id));
  }

  /** Auto-submit for players who didn't submit (uses their last known mix). */
  private _autoSubmitRemaining(): void {
    if (!this.roundData) return;
    for (const p of this._activePlayers()) {
      if (this.roundData.submissions.has(p.id)) continue;

      const mix = this.roundData.currentMixes.get(p.id) ?? { ...EMPTY_MIX };
      const rgb = mixToRGB(mix);
      const distance = deltaE(rgb, this.roundData.targetRGB);
      const score = computeScore(distance);

      this.roundData.submissions.set(p.id, {
        mix,
        rgb,
        distance,
        score,
        submittedAt: Date.now(),
      });
    }
  }

  /** Compute and rank results for all submitted players. */
  private _computeResults(): RoundResult[] {
    if (!this.roundData) return [];

    const results: RoundResult[] = [];
    for (const [playerId, sub] of this.roundData.submissions) {
      results.push({
        playerId,
        mixRGB: sub.rgb,
        distance: Math.round(sub.distance * 100) / 100,
        score: sub.score,
        rank: 0, // filled by rankResults
      });
    }

    return rankResults(results);
  }

  /** Broadcast the current submit count to all clients. */
  private _broadcastSubmitCount(): void {
    if (!this.roundData) return;
    const total = this._activePlayers().length;
    const submitted = this.roundData.submissions.size;
    this.broadcast("submit_count", { submitted, total });
  }

  /**
   * Register a timeout for cleanup in teardown.
   * Uses the parent class's delay mechanism indirectly — we push to
   * the parent's timer array.
   */
  private _registerTimer(timer: ReturnType<typeof setTimeout>): void {
    // Access the parent's private _timers array
    (this as unknown as { _timers: ReturnType<typeof setTimeout>[] })._timers.push(timer);
  }
}
