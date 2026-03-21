/**
 * server/src/games/registry-26-evil-laugh-overlay/index.ts
 *
 * "Evil Laugh Overlay" — record your best evil laugh and overlay it on a villain scene.
 *
 * Game Rules
 * ──────────
 * • Each round has 4 phases:
 *   1. RECORD: Players record an evil laugh via microphone (max 10s).
 *   2. CHOOSE_SCENE: Players pick a villain scene/backdrop for their overlay.
 *   3. GALLERY: All overlays are played back on the TV in sequence.
 *   4. VOTE: Players vote for the best evil laugh (can't vote for self).
 * • Votes award points. Most-voted player earns bonus points.
 *
 * Audio approach
 * ──────────────
 * Audio is recorded client-side using MediaRecorder API and stored as a
 * base64-encoded blob. The server stores the blobs transiently during the
 * round for broadcast to the TV gallery.
 *
 * Server messages:
 *   → "start_recording"   { durationMs }
 *   → "choose_scene"      { scenes: string[], durationMs }
 *   → "gallery_entry"     { playerId, playerName, sceneId, audioBase64 }
 *   → "gallery_done"      {}
 *   → "voting_start"      { durationMs, entries: { playerId, playerName }[], serverTimestamp }
 *   → "vote_confirmed"    { targetId }
 *   → "vote_count_update" { votesIn, totalVoters }
 *   → "round_result"      { winner, scores, entries }
 *
 * Client messages:
 *   ← { action: "submit_recording", audioBase64, sceneId }
 *   ← { action: "vote", targetId }
 */

import { Client } from "@colyseus/core";
import { BaseGame } from "../BaseGame";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Max recording duration (ms). */
const RECORDING_DURATION_MS = 10_000;
/** Time to choose a scene (ms). */
const SCENE_CHOOSE_DURATION_MS = 15_000;
/** Time each gallery entry is displayed (ms). */
const GALLERY_ENTRY_DISPLAY_MS = 6_000;
/** Voting duration (ms). */
const VOTING_DURATION_MS = 20_000;
/** Results display (ms). */
const RESULTS_DISPLAY_MS = 6_000;

/** Points for each vote received. */
const POINTS_PER_VOTE = 50;
/** Bonus for the most-voted player. */
const WINNER_BONUS = 100;
/** Participation points for submitting. */
const PARTICIPATION_POINTS = 25;

/**
 * Built-in villain scene IDs. Each corresponds to a CSS animated scene
 * rendered client-side. Keeping them curated ensures appropriateness.
 */
const VILLAIN_SCENES = [
  "thunderstorm",
  "volcano-lair",
  "haunted-castle",
  "evil-laboratory",
  "dark-throne",
  "sinister-forest",
  "underwater-base",
  "space-station",
];

// ── Per-round tracking ────────────────────────────────────────────────────────

interface PlayerEntry {
  playerId: string;
  playerName: string;
  sceneId: string;
  audioBase64: string;
}

interface RoundData {
  entries: Map<string, PlayerEntry>;
  votes: Map<string, string>;      // voterId → targetId
  votingStartedAt: number;
}

// ── Game class ────────────────────────────────────────────────────────────────

export default class EvilLaughOverlayGame extends BaseGame {
  static override requiresTV = false;
  static override supportsBracket = false;
  static override defaultRoundCount = 2;
  static override minRounds = 1;
  static override maxRounds = 3;
  static override hasInstructionsPhase = true;
  static override instructionsDelivery = "broadcast" as const;

  static override activityLevel: "none" | "some" | "full" = "none";
  static override requiresSameRoom = true;
  static override requiresSecondaryDisplay = false;

  private roundData: RoundData | null = null;
  private roundResolve: (() => void) | null = null;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  protected override async onLoad(): Promise<void> {
    for (const p of this.room.state.players.values()) {
      p.score = 0;
      p.isReady = false;
      p.isEliminated = false;
    }
  }

  protected override async runRound(_round: number): Promise<void> {
    const players = this._activePlayers();
    if (players.length < 2) {
      this.broadcast("round_skipped", { reason: "Need at least 2 players" });
      return;
    }

    this.roundData = {
      entries: new Map(),
      votes: new Map(),
      votingStartedAt: 0,
    };

    // Phase 1: Record evil laugh
    this.broadcast("start_recording", {
      durationMs: RECORDING_DURATION_MS,
      serverTimestamp: Date.now(),
    });

    // Reset ready flags for submission
    for (const p of this.room.state.players.values()) {
      p.isReady = false;
    }

    // Wait for all submissions or timeout
    await this._waitForSubmissionsOrTimeout(RECORDING_DURATION_MS + SCENE_CHOOSE_DURATION_MS + 5000);

    // Phase 2: Gallery — broadcast each entry sequentially to TV
    const entries = [...this.roundData.entries.values()];
    for (const entry of entries) {
      this.broadcast("gallery_entry", {
        playerId: entry.playerId,
        playerName: entry.playerName,
        sceneId: entry.sceneId,
        audioBase64: entry.audioBase64,
      });
      await this.delay(GALLERY_ENTRY_DISPLAY_MS);
    }
    this.broadcast("gallery_done", {});

    // Phase 3: Vote
    if (entries.length >= 2) {
      this.roundData.votingStartedAt = Date.now();
      this.broadcast("voting_start", {
        durationMs: VOTING_DURATION_MS,
        serverTimestamp: Date.now(),
        entries: entries.map((e) => ({ playerId: e.playerId, playerName: e.playerName })),
      });

      await new Promise<void>((resolve) => {
        this.roundResolve = resolve;
        const checkVotes = setInterval(() => {
          if (this._allVotesIn()) {
            clearInterval(checkVotes);
            resolve();
          }
        }, 200);
        setTimeout(() => {
          clearInterval(checkVotes);
          resolve();
        }, VOTING_DURATION_MS);
      });
      this.roundResolve = null;
    }

    // Phase 4: Results
    const results = this._computeResults();
    this.broadcast("round_result", results);
    await this.delay(RESULTS_DISPLAY_MS);
  }

  protected override scoreRound(_round: number): void {
    if (!this.roundData) return;
    const results = this._computeResults();
    for (const [playerId, points] of Object.entries(results.scores)) {
      const player = this.room.state.players.get(playerId);
      if (player) {
        player.score += points;
      }
    }
  }

  override handleInput(client: Client, data: unknown): void {
    const input = data as { action?: string; audioBase64?: string; sceneId?: string; targetId?: string };
    if (!input || !input.action) return;

    switch (input.action) {
      case "submit_recording":
        this._handleSubmission(client, input.audioBase64, input.sceneId);
        break;
      case "vote":
        this._handleVote(client, input.targetId);
        break;
    }
  }

  override teardown(): void {
    super.teardown();
    this.roundData = null;
    this.roundResolve = null;
  }

  // ── Input handlers ────────────────────────────────────────────────────────

  private _handleSubmission(client: Client, audioBase64?: string, sceneId?: string): void {
    if (!this.roundData || !audioBase64 || !sceneId) return;
    const player = this.room.state.players.get(client.sessionId);
    if (!player) return;

    // Validate scene ID
    if (!VILLAIN_SCENES.includes(sceneId)) return;

    // Limit audio size (base64 ~1.33x raw, cap at ~2MB encoded)
    if (audioBase64.length > 2_800_000) return;

    this.roundData.entries.set(client.sessionId, {
      playerId: client.sessionId,
      playerName: player.name,
      sceneId,
      audioBase64,
    });
    player.isReady = true;

    this.send(client.sessionId, "submission_confirmed", {});
  }

  private _handleVote(client: Client, targetId?: string): void {
    if (!this.roundData || !targetId) return;
    if (this.roundData.votingStartedAt === 0) return;
    if (targetId === client.sessionId) return; // can't vote for self
    if (this.roundData.votes.has(client.sessionId)) return; // already voted
    if (!this.roundData.entries.has(targetId)) return; // target must have submitted

    this.roundData.votes.set(client.sessionId, targetId);
    this.send(client.sessionId, "vote_confirmed", { targetId });

    this.broadcast("vote_count_update", {
      votesIn: this.roundData.votes.size,
      totalVoters: this._activePlayers().length,
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private _activePlayers() {
    return [...this.room.state.players.values()].filter(
      (p) => p.isConnected && !p.isEliminated,
    );
  }

  private _allVotesIn(): boolean {
    if (!this.roundData) return true;
    const active = this._activePlayers();
    return active.every((p) => this.roundData!.votes.has(p.id));
  }

  private async _waitForSubmissionsOrTimeout(timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const check = setInterval(() => {
        const active = this._activePlayers();
        const allSubmitted = active.every((p) => this.roundData?.entries.has(p.id));
        if (allSubmitted) {
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

  private _computeResults(): {
    winner: string | null;
    scores: Record<string, number>;
    entries: { playerId: string; playerName: string; sceneId: string; voteCount: number }[];
  } {
    if (!this.roundData) return { winner: null, scores: {}, entries: [] };

    const voteCounts = new Map<string, number>();
    for (const targetId of this.roundData.votes.values()) {
      voteCounts.set(targetId, (voteCounts.get(targetId) ?? 0) + 1);
    }

    const scores: Record<string, number> = {};
    let maxVotes = 0;
    let winner: string | null = null;

    const entries = [...this.roundData.entries.values()].map((e) => {
      const vc = voteCounts.get(e.playerId) ?? 0;
      scores[e.playerId] = PARTICIPATION_POINTS + vc * POINTS_PER_VOTE;
      if (vc > maxVotes) {
        maxVotes = vc;
        winner = e.playerId;
      }
      return {
        playerId: e.playerId,
        playerName: e.playerName,
        sceneId: e.sceneId,
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
