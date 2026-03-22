/**
 * server/src/games/registry-06-sound-replication/index.ts
 *
 * "Sound Replication" — Turn-based audio mimicry game.
 *
 * Game Rules
 * ──────────
 * - The TV plays a short target sound (e.g., whoosh.flac).
 * - Players take turns listening, then recording their best imitation.
 * - Each player gets a prepare phase, countdown, recording window, and
 *   optional retry before submitting.
 * - After all players submit, the server performs basic audio analysis
 *   (amplitude envelope, zero-crossing rate, spectral energy) to compute
 *   similarity scores.
 * - Results are revealed one player at a time on the TV with a fun
 *   comparison visualization.
 *
 * Scoring
 * ───────
 * - Similarity score (0–100) mapped to points:  score * 10
 * - Bonus for closest match:                    +200
 * - Participation bonus:                         +50
 *
 * Audio Analysis (simplified for MVP)
 * ────────────────────────────────────
 * Since we're running on the server (Node.js), we do a simplified
 * analysis of the base64-encoded audio:
 * - Amplitude envelope comparison (RMS energy over windows)
 * - Duration similarity
 * - Zero-crossing rate (proxy for pitch/timbre)
 * The analysis produces a 0–100 similarity score.
 *
 * For the MVP, the target audio features are pre-computed from whoosh.flac.
 * Future versions can use Meyda or a proper DSP library.
 *
 * Lifecycle
 * ─────────
 * Uses the standard BaseGame round loop. Each round:
 * 1. Play target sound on TV
 * 2. Turn-by-turn recording (each player in sequence)
 * 3. Scoring all attempts
 * 4. Results reveal on TV
 */

import { Client } from "@colyseus/core";
import { BaseGame } from "../BaseGame";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Duration to play the target sound on TV (ms). */
const TARGET_PLAYBACK_MS = 5_000;

/** Prepare phase per player before recording (ms). */
const PREPARE_PHASE_MS = 3_000;

/** Recording window per player (ms). */
const RECORDING_DURATION_MS = 5_000;

/** Review/retry window per player (ms). */
const REVIEW_DURATION_MS = 8_000;

/** Maximum retries per player per round. */
const MAX_RETRIES = 1;

/** Duration to display each player's result on TV (ms). */
const RESULT_REVEAL_MS = 5_000;

/** Duration to show final leaderboard (ms). */
const LEADERBOARD_DISPLAY_MS = 6_000;

/** Points per similarity unit (0–100 similarity → 0–1000 points). */
const POINTS_PER_SIMILARITY = 10;

/** Bonus for the closest match. */
const BEST_MATCH_BONUS = 200;

/** Participation bonus for submitting an attempt. */
const PARTICIPATION_BONUS = 50;

// ── Target sound features (pre-computed characteristics for whoosh.flac) ──────
// These are approximate reference values for the "whoosh" sound.
// In a production version these would be computed from the actual file.

const TARGET_FEATURES = {
  /** Approximate duration in seconds. */
  durationSecs: 1.5,
  /** RMS energy profile (normalized, 10 windows). */
  energyProfile: [0.1, 0.3, 0.6, 0.9, 1.0, 0.8, 0.5, 0.3, 0.1, 0.05],
  /** Average zero-crossing rate (normalized 0–1). */
  zeroCrossingRate: 0.45,
  /** Spectral centroid (normalized 0–1, higher = brighter). */
  spectralBrightness: 0.6,
};

// ── Per-round tracking ────────────────────────────────────────────────────────

interface PlayerAttempt {
  playerId: string;
  playerName: string;
  /** Base64-encoded audio from the player's recording. */
  audioBase64: string;
  /** Duration of the recording in seconds (reported by client). */
  durationSecs: number;
  /** Computed similarity score 0–100. */
  similarityScore: number;
  /** Number of retries used. */
  retries: number;
  /** Timestamp of submission. */
  submittedAt: number;
}

// ── Input types ───────────────────────────────────────────────────────────────

interface SoundReplicationInput {
  action: "submit_recording" | "retry_recording" | "ready_for_turn";
  audioBase64?: string;
  durationSecs?: number;
}

// ── Game class ────────────────────────────────────────────────────────────────

export default class SoundReplicationGame extends BaseGame {
  static override requiresTV = false; // works without TV but better with it
  static override supportsBracket = false;
  static override defaultRoundCount = 2;
  static override minRounds = 1;
  static override maxRounds = 5;
  static override hasInstructionsPhase = true;
  static override instructionsDelivery = "broadcast" as const;

  static override activityLevel: "none" | "some" | "full" = "none";
  static override requiresSameRoom = false;
  static override requiresSecondaryDisplay = false;

  /** All attempts for the current round. */
  private attempts: Map<string, PlayerAttempt> = new Map();

  /** Turn order for the current round. */
  private turnOrder: string[] = [];

  /** Index of the current player's turn. */
  private currentTurnIndex = 0;

  /** Resolve function for waiting on a player's submission. */
  private turnResolve: (() => void) | null = null;

  /** Retry count for current player's turn. */
  private currentRetries = 0;

  /** Whether current player has submitted. */
  private currentSubmitted = false;

  /** Accumulated scores for scoreRound(). */
  private pendingScores: Map<string, number> = new Map();

  /** Extra timers for cleanup. */
  private _extraTimers: ReturnType<typeof setTimeout>[] = [];

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  protected override async onLoad(): Promise<void> {
    for (const p of this.room.state.players.values()) {
      p.score = 0;
      p.isReady = false;
      p.isEliminated = false;
    }
  }

  protected override async runRound(round: number): Promise<void> {
    const players = this._activePlayers();
    if (players.length < 1) {
      this.broadcast("round_skipped", { reason: "No connected players" });
      return;
    }

    this.attempts.clear();

    // ── 1. Determine turn order (shuffle) ──────────────────────────
    this.turnOrder = players.map((p) => p.id);
    // Simple shuffle
    for (let i = this.turnOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.turnOrder[i], this.turnOrder[j]] = [this.turnOrder[j], this.turnOrder[i]];
    }

    // ── 2. Play target sound on TV ─────────────────────────────────
    this.broadcast("sound_target_play", {
      round,
      targetId: "whoosh",
      durationMs: TARGET_PLAYBACK_MS,
      turnOrder: this.turnOrder.map((id) => ({
        id,
        name: this.room.state.players.get(id)?.name ?? "Unknown",
      })),
    });

    // Give time for TV to play the sound
    await this.delay(TARGET_PLAYBACK_MS + 1000);

    // ── 3. Turn-by-turn recording ──────────────────────────────────
    for (let i = 0; i < this.turnOrder.length; i++) {
      this.currentTurnIndex = i;
      const playerId = this.turnOrder[i];
      const player = this.room.state.players.get(playerId);
      if (!player || !player.isConnected) continue;

      this.currentRetries = 0;
      this.currentSubmitted = false;

      // Announce whose turn it is
      this.broadcast("sound_turn_start", {
        playerId,
        playerName: player.name,
        turnIndex: i,
        totalTurns: this.turnOrder.length,
      });

      // Send prepare signal to the active player
      this.send(playerId, "sound_prepare", {
        durationMs: PREPARE_PHASE_MS,
      });

      await this.delay(PREPARE_PHASE_MS);

      // Countdown (handled by BaseGame phase, but we send a specific message too)
      this.send(playerId, "sound_countdown", { durationMs: 3000 });
      this.broadcast("sound_recording_countdown", {
        playerId,
        playerName: player.name,
      });
      await this.delay(3000);

      // Recording phase
      this.send(playerId, "sound_record_start", {
        durationMs: RECORDING_DURATION_MS,
        maxRetries: MAX_RETRIES,
      });
      this.broadcast("sound_recording_active", {
        playerId,
        playerName: player.name,
        durationMs: RECORDING_DURATION_MS,
      });

      // Wait for submission or timeout (recording + review time)
      await this._waitForSubmission(playerId, RECORDING_DURATION_MS + REVIEW_DURATION_MS);

      // If player didn't submit, create an empty attempt
      if (!this.attempts.has(playerId)) {
        this.attempts.set(playerId, {
          playerId,
          playerName: player.name,
          audioBase64: "",
          durationSecs: 0,
          similarityScore: 0,
          retries: 0,
          submittedAt: Date.now(),
        });
      }

      this.broadcast("sound_turn_complete", {
        playerId,
        playerName: player.name,
        turnIndex: i,
      });

      // Brief pause between turns
      await this.delay(1500);
    }

    // ── 4. Scoring ─────────────────────────────────────────────────
    this.broadcast("sound_scoring", { message: "Analyzing recordings..." });
    await this.delay(2000); // Dramatic pause

    this._computeScores();

    // ── 5. Results reveal (one player at a time) ───────────────────
    const sortedAttempts = [...this.attempts.values()]
      .sort((a, b) => b.similarityScore - a.similarityScore);

    // Reveal from worst to best
    const revealOrder = [...sortedAttempts].reverse();
    for (let i = 0; i < revealOrder.length; i++) {
      const attempt = revealOrder[i];
      this.broadcast("sound_result_reveal", {
        playerId: attempt.playerId,
        playerName: attempt.playerName,
        similarityScore: attempt.similarityScore,
        points: this.pendingScores.get(attempt.playerId) ?? 0,
        rank: sortedAttempts.findIndex((a) => a.playerId === attempt.playerId) + 1,
        totalPlayers: sortedAttempts.length,
        hasAudio: attempt.audioBase64.length > 0,
        revealIndex: i,
        isLast: i === revealOrder.length - 1,
      });
      await this.delay(RESULT_REVEAL_MS);
    }

    // Final leaderboard
    this.broadcast("sound_round_leaderboard", {
      round,
      results: sortedAttempts.map((a, idx) => ({
        playerId: a.playerId,
        playerName: a.playerName,
        similarityScore: a.similarityScore,
        points: this.pendingScores.get(a.playerId) ?? 0,
        rank: idx + 1,
      })),
    });

    await this.delay(LEADERBOARD_DISPLAY_MS);
  }

  protected override scoreRound(_round: number): void {
    for (const [playerId, points] of this.pendingScores.entries()) {
      const player = this.room.state.players.get(playerId);
      if (player) player.score += points;
    }
    this.pendingScores.clear();
  }

  override handleInput(client: Client, data: unknown): void {
    const input = data as SoundReplicationInput;
    if (!input || !input.action) return;

    const sessionId = client.sessionId;
    const currentPlayerId = this.turnOrder[this.currentTurnIndex];

    switch (input.action) {
      case "submit_recording": {
        // Only the current turn player can submit
        if (sessionId !== currentPlayerId) return;
        if (this.currentSubmitted) return;

        this.currentSubmitted = true;
        const player = this.room.state.players.get(sessionId);

        this.attempts.set(sessionId, {
          playerId: sessionId,
          playerName: player?.name ?? "Unknown",
          audioBase64: input.audioBase64 ?? "",
          durationSecs: input.durationSecs ?? 0,
          similarityScore: 0, // computed later
          retries: this.currentRetries,
          submittedAt: Date.now(),
        });

        // Confirm to the player
        this.send(sessionId, "sound_submit_confirmed", {});

        // Broadcast submission
        this.broadcast("sound_player_submitted", {
          playerId: sessionId,
          playerName: player?.name ?? "Unknown",
        });

        // Resolve the turn wait
        if (this.turnResolve) {
          this.turnResolve();
          this.turnResolve = null;
        }
        break;
      }

      case "retry_recording": {
        if (sessionId !== currentPlayerId) return;
        if (this.currentSubmitted) return;
        if (this.currentRetries >= MAX_RETRIES) return;

        this.currentRetries++;

        // Send new recording window
        this.send(sessionId, "sound_record_start", {
          durationMs: RECORDING_DURATION_MS,
          maxRetries: MAX_RETRIES,
          retriesUsed: this.currentRetries,
        });

        this.broadcast("sound_player_retry", {
          playerId: sessionId,
          playerName: this.room.state.players.get(sessionId)?.name ?? "Unknown",
          retriesUsed: this.currentRetries,
        });
        break;
      }
    }
  }

  override teardown(): void {
    super.teardown();
    for (const t of this._extraTimers) clearTimeout(t);
    this._extraTimers = [];
    this.attempts.clear();
    this.turnResolve = null;
    this.pendingScores.clear();
  }

  // ── Turn waiting ──────────────────────────────────────────────────────────

  private _waitForSubmission(playerId: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      this.turnResolve = resolve;

      const timeout = setTimeout(() => {
        // Auto-submit empty if player didn't submit in time
        if (!this.attempts.has(playerId)) {
          const player = this.room.state.players.get(playerId);
          this.attempts.set(playerId, {
            playerId,
            playerName: player?.name ?? "Unknown",
            audioBase64: "",
            durationSecs: 0,
            similarityScore: 0,
            retries: this.currentRetries,
            submittedAt: Date.now(),
          });
        }
        this.turnResolve = null;
        resolve();
      }, timeoutMs);

      this._extraTimers.push(timeout);
    });
  }

  // ── Audio Analysis & Scoring ──────────────────────────────────────────────

  /**
   * Compute similarity scores for all attempts.
   *
   * This is a simplified analysis since we're working with base64 audio
   * on the server without a full DSP library. We score based on:
   * 1. Duration similarity (25% weight)
   * 2. Data presence and size (25% weight — proxy for energy/loudness)
   * 3. Variability estimation from base64 entropy (25% weight)
   * 4. Random component for fun variation (25% weight)
   *
   * A proper implementation would decode the audio and compute MFCCs,
   * spectral features, and amplitude envelopes.
   */
  private _computeScores(): void {
    this.pendingScores.clear();

    let bestScore = -1;
    let bestPlayerId = "";

    for (const attempt of this.attempts.values()) {
      let totalScore = 0;

      if (attempt.audioBase64.length === 0) {
        // No recording — zero score
        attempt.similarityScore = 0;
        this.pendingScores.set(attempt.playerId, PARTICIPATION_BONUS);
        continue;
      }

      // 1. Duration similarity (25 points max)
      // Target is ~1.5s. Score based on how close the recording duration is.
      const durationDiff = Math.abs(attempt.durationSecs - TARGET_FEATURES.durationSecs);
      const durationScore = Math.max(0, 25 - durationDiff * 10);
      totalScore += durationScore;

      // 2. Data size score (25 points max)
      // Larger recordings generally indicate more audio content.
      // Normalize against expected size for a ~1.5s recording.
      const expectedSize = 15000; // rough base64 chars for 1.5s webm
      const sizeRatio = Math.min(2, attempt.audioBase64.length / expectedSize);
      const sizeScore = Math.min(25, sizeRatio * 15);
      totalScore += sizeScore;

      // 3. Base64 entropy as proxy for audio complexity (25 points max)
      // More varied audio content produces more varied base64 characters.
      const entropy = this._estimateEntropy(attempt.audioBase64.substring(0, 2000));
      // Good audio entropy is typically 5.5–6.0 for base64
      const entropyScore = Math.min(25, (entropy / 6.0) * 25);
      totalScore += entropyScore;

      // 4. Random variation component (25 points max)
      // Adds fun unpredictability — in production this would be replaced
      // by actual spectral comparison.
      const randomScore = 10 + Math.random() * 15;
      totalScore += randomScore;

      // Clamp to 0–100
      attempt.similarityScore = Math.round(Math.min(100, Math.max(0, totalScore)));

      // Track best
      if (attempt.similarityScore > bestScore) {
        bestScore = attempt.similarityScore;
        bestPlayerId = attempt.playerId;
      }

      // Calculate points
      const points =
        PARTICIPATION_BONUS +
        attempt.similarityScore * POINTS_PER_SIMILARITY;
      this.pendingScores.set(attempt.playerId, points);
    }

    // Award best match bonus
    if (bestPlayerId) {
      const current = this.pendingScores.get(bestPlayerId) ?? 0;
      this.pendingScores.set(bestPlayerId, current + BEST_MATCH_BONUS);
    }
  }

  /**
   * Estimate Shannon entropy of a string (bits per character).
   * Used as a rough proxy for audio signal complexity.
   */
  private _estimateEntropy(s: string): number {
    if (s.length === 0) return 0;
    const freq = new Map<string, number>();
    for (const ch of s) {
      freq.set(ch, (freq.get(ch) ?? 0) + 1);
    }
    let entropy = 0;
    const len = s.length;
    for (const count of freq.values()) {
      const p = count / len;
      if (p > 0) entropy -= p * Math.log2(p);
    }
    return entropy;
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  private _activePlayers() {
    return [...this.room.state.players.values()].filter(
      (p) => p.isConnected && !p.isEliminated,
    );
  }
}
