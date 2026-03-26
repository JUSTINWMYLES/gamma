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

/**
 * Maximum number of windows to shift in either direction when
 * auto-aligning the recording profile against the target.
 * With 20-window profiles, ±5 means up to 25% shift.
 */
const MAX_ALIGN_SHIFT = 5;

/** Duration to show final leaderboard (ms). */
const LEADERBOARD_DISPLAY_MS = 6_000;

/** Points per similarity unit (0–100 similarity → 0–1000 points). */
const POINTS_PER_SIMILARITY = 10;

/** Bonus for the closest match. */
const BEST_MATCH_BONUS = 200;

/** Participation bonus for submitting an attempt. */
const PARTICIPATION_BONUS = 50;

// ── Target sound features (pre-computed characteristics for whoosh.flac) ──────
// These represent the actual characteristics of the target "whoosh" sound.
// The energy profile is divided into 20 windows across the ~1.5s duration,
// normalized 0–1 where 1.0 = peak energy.
//
// A whoosh has a distinctive fast attack → peak → gradual decay shape.

const TARGET_FEATURES = {
  /** Approximate duration in seconds. */
  durationSecs: 1.5,
  /**
   * Normalized RMS energy profile (20 windows).
   * Shape: silence → rapid rise → peak near center → gradual decay → silence.
   */
  energyProfile: [
    0.02, 0.05, 0.12, 0.25, 0.45,
    0.65, 0.82, 0.94, 1.00, 0.97,
    0.88, 0.75, 0.60, 0.45, 0.32,
    0.20, 0.12, 0.07, 0.03, 0.01,
  ],
  /** Average zero-crossing rate (normalized 0–1). */
  zeroCrossingRate: 0.45,
  /** Spectral centroid (normalized 0–1, higher = brighter). */
  spectralBrightness: 0.6,
  /** Average frame energy (bytes per frame for Opus @ 48kHz). */
  avgFrameEnergy: 0.55,
  /** Energy variability (std dev of frame sizes / mean). Whoosh has moderate variation. */
  energyVariability: 0.45,
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
  /** Normalized energy profile (20 windows, 0–1). Delay-compensated. */
  energyProfile: number[];
  /**
   * Alignment offset found by cross-correlation.
   * Negative = recording started early, positive = recording started late.
   * Unit: profile windows (each ~durationSecs/20).
   */
  alignmentOffset: number;
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
          energyProfile: [],
          alignmentOffset: 0,
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
        // Energy profiles for visualization
        targetProfile: TARGET_FEATURES.energyProfile,
        recordingProfile: attempt.energyProfile,
        // Delay compensation info
        alignmentOffset: attempt.alignmentOffset,
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
          energyProfile: [], // computed later
          alignmentOffset: 0, // computed later
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
            energyProfile: [],
            alignmentOffset: 0,
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
   * Analysis approach (server-side, no native DSP):
   * We parse the WebM container to extract Opus frame sizes as an energy
   * proxy. Larger Opus frames encode more audio content/energy. We then:
   *
   * 1. Duration similarity (20% weight, 20 pts max)
   *    How close the recording length matches the target.
   *
   * 2. Energy envelope shape (35% weight, 35 pts max)
   *    Resample both target and recording energy profiles to 20 windows
   *    and compute cosine similarity of the shapes.
   *
   * 3. Energy dynamics (20% weight, 20 pts max)
   *    Compare the variability (coefficient of variation) of frame sizes.
   *    A whoosh has moderate dynamics; flat recordings or chaotic ones differ.
   *
   * 4. Attack-decay shape (15% weight, 15 pts max)
   *    Check if the recording has a similar attack-peak-decay pattern:
   *    peak position, attack steepness, and decay ratio.
   *
   * 5. Average level match (10% weight, 10 pts max)
   *    Compare mean energy levels. Very quiet or very loud recordings
   *    score lower even if the shape is somewhat right.
   *
   * Total: 100 points max.
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
        attempt.energyProfile = [];
        this.pendingScores.set(attempt.playerId, PARTICIPATION_BONUS);
        continue;
      }

      // Decode base64 and extract frame-level energy proxy
      const audioBytes = Buffer.from(attempt.audioBase64, "base64");
      const frameSizes = this._extractWebMFrameSizes(audioBytes);

      // Build a 20-window energy profile from the frame sizes
      const rawRecordingProfile = this._buildEnergyProfile(frameSizes, 20);

      // ── 0. Delay compensation (auto-alignment) ───────────────
      // The user's recording may not start at the same instant as
      // the target. We slide the recording profile ±MAX_ALIGN_SHIFT
      // windows along the target and pick the offset that maximizes
      // cosine similarity. This corrects for reaction-time delays
      // or early starts without requiring manual user adjustment.
      const alignResult = this._findBestAlignment(
        TARGET_FEATURES.energyProfile,
        rawRecordingProfile,
      );
      const alignedProfile = alignResult.alignedProfile;
      attempt.energyProfile = alignedProfile;
      attempt.alignmentOffset = alignResult.offset;

      // ── 1. Duration similarity (20 pts) ──────────────────────
      const durationDiff = Math.abs(attempt.durationSecs - TARGET_FEATURES.durationSecs);
      const durationRatio = durationDiff / TARGET_FEATURES.durationSecs;
      // Perfect match = 20, off by 100%+ = 0
      const durationScore = Math.max(0, 20 * (1 - durationRatio));
      totalScore += durationScore;

      // ── 2. Energy envelope shape (35 pts) ────────────────────
      // Uses the delay-compensated (aligned) profile
      if (alignedProfile.length >= 5) {
        const cosSim = this._cosineSimilarity(
          TARGET_FEATURES.energyProfile,
          alignedProfile,
        );
        // cosSim ranges -1 to 1, practically 0 to 1 for audio
        // Map: 1.0 → 35 pts, 0.0 → 0 pts
        const envelopeScore = Math.max(0, cosSim * 35);
        totalScore += envelopeScore;
      }

      // ── 3. Energy dynamics / variability (20 pts) ────────────
      if (frameSizes.length > 2) {
        const mean = frameSizes.reduce((a, b) => a + b, 0) / frameSizes.length;
        const variance = frameSizes.reduce((a, b) => a + (b - mean) ** 2, 0) / frameSizes.length;
        const coeffVar = mean > 0 ? Math.sqrt(variance) / mean : 0;
        // Target has ~0.45 variability. Score based on how close.
        const varDiff = Math.abs(coeffVar - TARGET_FEATURES.energyVariability);
        // 0 diff → 20 pts, >0.5 diff → 0 pts
        const dynamicsScore = Math.max(0, 20 * (1 - varDiff / 0.5));
        totalScore += dynamicsScore;
      }

      // ── 4. Attack-decay shape (15 pts) ────────────────────────
      // Uses the delay-compensated (aligned) profile
      if (alignedProfile.length >= 5) {
        const shapeScore = this._scoreAttackDecay(alignedProfile);
        totalScore += shapeScore; // 0–15
      }

      // ── 5. Average level match (10 pts) ───────────────────────
      if (alignedProfile.length > 0) {
        const recMean = alignedProfile.reduce((a, b) => a + b, 0) / alignedProfile.length;
        const targetMean = TARGET_FEATURES.energyProfile.reduce((a, b) => a + b, 0) / TARGET_FEATURES.energyProfile.length;
        const levelDiff = Math.abs(recMean - targetMean);
        // 0 diff → 10 pts, >0.5 diff → 0 pts
        const levelScore = Math.max(0, 10 * (1 - levelDiff / 0.5));
        totalScore += levelScore;
      }

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
   * Extract frame/block sizes from a WebM (Matroska) container as an energy proxy.
   *
   * WebM uses EBML (Extensible Binary Meta Language). Audio data lives inside
   * Cluster → SimpleBlock elements. Each SimpleBlock's size correlates with
   * the amount of audio energy encoded (Opus uses variable bitrate).
   *
   * We don't need a full parser — just scan for SimpleBlock element IDs (0xA3)
   * and read their sizes.
   */
  private _extractWebMFrameSizes(data: Buffer): number[] {
    const frameSizes: number[] = [];

    // SimpleBlock element ID = 0xA3
    // We scan for this byte and attempt to read EBML variable-length size after it.
    for (let i = 0; i < data.length - 4; i++) {
      if (data[i] === 0xa3) {
        // Try to read EBML VINT size
        const sizeResult = this._readEBMLVint(data, i + 1);
        if (sizeResult && sizeResult.value > 0 && sizeResult.value < 65536) {
          frameSizes.push(sizeResult.value);
          i += sizeResult.length; // skip past this block
        }
      }
    }

    // Fallback: if WebM parsing found very few frames, use a chunking approach
    // This handles edge cases where the container format is slightly different
    if (frameSizes.length < 5) {
      return this._chunkBasedEnergy(data);
    }

    return frameSizes;
  }

  /**
   * Read an EBML variable-length integer (VINT) from the buffer.
   * Returns { value, length } or null if invalid.
   */
  private _readEBMLVint(data: Buffer, offset: number): { value: number; length: number } | null {
    if (offset >= data.length) return null;

    const first = data[offset];
    if (first === 0) return null;

    // Count leading zeros to determine VINT width
    let width = 1;
    let mask = 0x80;
    while (width <= 8 && (first & mask) === 0) {
      width++;
      mask >>= 1;
    }

    if (width > 4 || offset + width > data.length) return null;

    // Read the value
    let value = first & (mask - 1); // strip the VINT marker bit
    for (let i = 1; i < width; i++) {
      value = (value << 8) | data[offset + i];
    }

    return { value, length: width };
  }

  /**
   * Fallback energy extraction: divide the raw bytes into equal chunks
   * and use byte variance within each chunk as an energy proxy.
   * Compressed silence has very uniform bytes; audio content has more variation.
   */
  private _chunkBasedEnergy(data: Buffer): number[] {
    const numChunks = Math.min(40, Math.max(5, Math.floor(data.length / 500)));
    const chunkSize = Math.floor(data.length / numChunks);
    const energies: number[] = [];

    // Skip the first ~200 bytes (WebM header)
    const headerOffset = Math.min(200, Math.floor(data.length * 0.05));

    for (let c = 0; c < numChunks; c++) {
      const start = headerOffset + c * chunkSize;
      const end = Math.min(start + chunkSize, data.length);
      if (start >= data.length) break;

      // Compute byte-level variance as energy proxy
      let sum = 0;
      let sumSq = 0;
      const n = end - start;
      for (let i = start; i < end; i++) {
        sum += data[i];
        sumSq += data[i] * data[i];
      }
      const mean = sum / n;
      const variance = sumSq / n - mean * mean;
      energies.push(Math.sqrt(Math.max(0, variance)));
    }

    return energies;
  }

  /**
   * Resample a variable-length energy array to `windowCount` windows
   * and normalize to 0–1 range.
   */
  private _buildEnergyProfile(frameSizes: number[], windowCount: number): number[] {
    if (frameSizes.length === 0) return Array(windowCount).fill(0);

    // Group frames into windows
    const framesPerWindow = Math.max(1, Math.floor(frameSizes.length / windowCount));
    const profile: number[] = [];

    for (let w = 0; w < windowCount; w++) {
      const start = w * framesPerWindow;
      const end = Math.min(start + framesPerWindow, frameSizes.length);
      if (start >= frameSizes.length) {
        profile.push(0);
        continue;
      }

      let sum = 0;
      for (let i = start; i < end; i++) {
        sum += frameSizes[i];
      }
      profile.push(sum / (end - start));
    }

    // Normalize to 0–1
    const max = Math.max(...profile, 0.001);
    return profile.map((v) => v / max);
  }

  /**
   * Cosine similarity between two equal-length vectors.
   * Returns a value between -1 and 1 (1 = identical shape).
   */
  private _cosineSimilarity(a: number[], b: number[]): number {
    const len = Math.min(a.length, b.length);
    if (len === 0) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < len; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    if (denom === 0) return 0;
    return dotProduct / denom;
  }

  /**
   * Score the attack-decay shape of the recording (0–15 pts).
   *
   * A "whoosh" has:
   * - Peak energy near the 40-55% mark (not at the start or end)
   * - Rising energy in the first half
   * - Falling energy in the second half
   *
   * We check: peak position, attack ratio, decay ratio.
   */
  private _scoreAttackDecay(profile: number[]): number {
    if (profile.length < 5) return 0;

    let maxVal = 0;
    let maxIdx = 0;
    for (let i = 0; i < profile.length; i++) {
      if (profile[i] > maxVal) {
        maxVal = profile[i];
        maxIdx = i;
      }
    }

    let score = 0;
    const peakPosition = maxIdx / (profile.length - 1); // 0–1

    // Target peak position is ~0.4–0.5
    const peakTarget = 0.45;
    const peakDist = Math.abs(peakPosition - peakTarget);
    // Within 0.15 of target → full marks (6 pts)
    score += Math.max(0, 6 * (1 - peakDist / 0.35));

    // Attack: average energy in first third should be lower than peak region
    const thirdLen = Math.floor(profile.length / 3);
    const firstThird = profile.slice(0, thirdLen);
    const middleThird = profile.slice(thirdLen, thirdLen * 2);
    const lastThird = profile.slice(thirdLen * 2);

    const avgFirst = firstThird.reduce((a, b) => a + b, 0) / firstThird.length;
    const avgMiddle = middleThird.reduce((a, b) => a + b, 0) / middleThird.length;
    const avgLast = lastThird.reduce((a, b) => a + b, 0) / lastThird.length;

    // Middle should be highest (5 pts)
    if (avgMiddle > avgFirst && avgMiddle > avgLast) {
      score += 5;
    } else if (avgMiddle > avgFirst || avgMiddle > avgLast) {
      score += 2.5;
    }

    // Decay: last third should be less than middle (4 pts)
    if (avgMiddle > 0) {
      const decayRatio = avgLast / avgMiddle; // target: ~0.3-0.5
      const decayTarget = 0.4;
      const decayDist = Math.abs(decayRatio - decayTarget);
      score += Math.max(0, 4 * (1 - decayDist / 0.5));
    }

    return Math.min(15, score);
  }

  /**
   * Find the best time-alignment between the target and recording profiles
   * using sliding cross-correlation.
   *
   * The recording may be delayed (user reacted late) or early (user
   * anticipated). We slide the recording profile across the target by
   * ±MAX_ALIGN_SHIFT windows and return the offset that produces the
   * highest cosine similarity, along with the shifted recording profile
   * (padded with zeros so it stays the same length as the target).
   *
   * @returns { offset, alignedProfile, bestSimilarity }
   *   - offset: negative = recording started early, positive = started late
   *   - alignedProfile: 20-window profile shifted to best-match the target
   *   - bestSimilarity: the cosine similarity at that offset (for diagnostics)
   */
  private _findBestAlignment(
    target: number[],
    recording: number[],
  ): { offset: number; alignedProfile: number[]; bestSimilarity: number } {
    const len = target.length; // 20

    // If the recording is too short to meaningfully align, return as-is
    if (recording.length < 3) {
      // Pad/trim to match target length
      const padded = Array(len).fill(0);
      for (let i = 0; i < Math.min(recording.length, len); i++) {
        padded[i] = recording[i];
      }
      return { offset: 0, alignedProfile: padded, bestSimilarity: 0 };
    }

    let bestOffset = 0;
    let bestSim = -Infinity;
    let bestProfile: number[] = recording.length === len
      ? [...recording]
      : this._padOrTrimProfile(recording, len);

    // Try each offset from -MAX_ALIGN_SHIFT to +MAX_ALIGN_SHIFT
    for (let shift = -MAX_ALIGN_SHIFT; shift <= MAX_ALIGN_SHIFT; shift++) {
      // Create shifted version of recording:
      // shift > 0 means we think the recording started late,
      //   so we shift recording LEFT (earlier samples matter more)
      // shift < 0 means recording started early,
      //   so we shift recording RIGHT (later samples matter more)
      const shifted = Array(len).fill(0);

      for (let i = 0; i < len; i++) {
        const srcIdx = i + shift; // index into recording
        if (srcIdx >= 0 && srcIdx < recording.length) {
          shifted[i] = recording[srcIdx];
        }
        // else: stays 0 (zero-padded)
      }

      // Re-normalize shifted profile so zero-padding doesn't
      // artificially deflate the similarity. Only normalize if
      // there are non-zero values.
      const maxVal = Math.max(...shifted, 0.001);
      const normalized = shifted.map((v: number) => v / maxVal);

      const sim = this._cosineSimilarity(target, normalized);

      if (sim > bestSim) {
        bestSim = sim;
        bestOffset = shift;
        bestProfile = normalized;
      }
    }

    return {
      offset: bestOffset,
      alignedProfile: bestProfile,
      bestSimilarity: bestSim,
    };
  }

  /**
   * Pad a profile with trailing zeros or trim it to exactly `len` elements.
   */
  private _padOrTrimProfile(profile: number[], len: number): number[] {
    if (profile.length >= len) return profile.slice(0, len);
    const result = [...profile];
    while (result.length < len) result.push(0);
    return result;
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  private _activePlayers() {
    return [...this.room.state.players.values()].filter(
      (p) => p.isConnected && !p.isEliminated,
    );
  }
}
