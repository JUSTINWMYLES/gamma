/**
 * server/src/games/registry-10-grid-tap-colors/index.ts
 *
 * "Grid Tap Colors" — Phones form a grid and players compete
 * by tapping lit phones as fast as possible, or memorizing and
 * replicating color sequences.
 *
 * Game Modes
 * ──────────
 * Mode 1 – Speed Tap:
 *   One phone lights up at a time; tap it ASAP.
 *   Next phone lights immediately after tap.
 *   Configurable number of taps (default 10).
 *   Score: completion order, fastest individual tap, slowest tap penalty.
 *
 * Mode 2 – Color Sequence Memory:
 *   TV shows a color order. Players memorize it.
 *   Tap phones in correct color order.
 *   Score: first to finish + fewest errors.
 *
 * Concurrency
 * ───────────
 *   < 8 players → 1 at a time (all phones)
 *   8–15 players → 2 at a time (head-to-head)
 *   16+ players  → 4 at a time
 *
 * Pre-game
 * ────────
 *   Devices show numbered placement indicators.
 *   In competitive mode, phones are color-coded by player group.
 *
 * Music
 * ─────
 *   Placeholder for game music (TODO: pick a song).
 */

import { Client } from "@colyseus/core";
import { BaseGame } from "../BaseGame";
import {
  assignPhones,
  getSpeedTapMetrics,
  scoreSpeedTapRound,
  getGridLayout,
  GRID_COLORS,
  type PhoneAssignment,
  type SpeedTapPlayerResult,
} from "./gridTapLogic";

// ── Constants ────────────────────────────────────────────────────────────────

/** Default number of taps per Speed Tap round. */
const DEFAULT_TOTAL_TAPS = 10;

/** Minimum taps per round. */
const MIN_TOTAL_TAPS = 3;

/** Maximum taps per round. */
const MAX_TOTAL_TAPS = 20;

/** Maximum total duration for a Speed Tap round per player (ms). */
const MODE1_ROUND_CAP_MS = 20_000;

/** Delay to show results after a group finishes (ms). */
const RESULT_DISPLAY_MS = 4_000;

/** Music track identifier. */
const MUSIC_TRACK_ID = "ouroboros";

/** Time for the player to get in position before their turn (ms). */
const PLAYER_READY_DELAY_MS = 10_000;

/** Max time to wait for phone-placement confirmation once the round screen is live. */
const GRID_READY_TIMEOUT_MS = 20_000;

// ── Input types ──────────────────────────────────────────────────────────────

interface GridTapInput {
  action: "tap" | "admin_grid_ready";
  /** Phone index tapped. */
  phoneIndex?: number;
}

// ── Per-match tracking ───────────────────────────────────────────────────────

interface ActiveSpeedTap {
  playerId: string;
  /** Which phone index is currently lit. */
  currentPhoneIndex: number;
  /** Full randomized sequence for this player's turn. */
  sequence: number[];
  /** Timestamp when current phone was lit. */
  litAt: number;
  /** Individual tap times collected so far. */
  tapTimesMs: number[];
  /** Start timestamp for the entire run. */
  startedAt: number;
  /** Total taps required. */
  totalTaps: number;
  /** Whether this player has completed their run. */
  completed: boolean;
}

// ── Game class ───────────────────────────────────────────────────────────────

export default class GridTapColorsGame extends BaseGame {
  // ── Plugin metadata ──────────────────────────────────────────────
  static override requiresTV = true;
  static override supportsBracket = false;
  static override defaultRoundCount = 3;
  static override minRounds = 1;
  static override maxRounds = 5;
  static override hasInstructionsPhase = true;
  static override instructionsDelivery = "broadcast" as const;

  static override activityLevel: "none" | "some" | "full" = "some";
  static override requiresSameRoom = true;
  static override requiresSecondaryDisplay = true;

  // ── Instance state ───────────────────────────────────────────────

  /** Phone grid assignments. */
  private phoneAssignments: PhoneAssignment[] = [];

  /** Player groups for round rotation. */
  private playerGroups: string[][] = [];

  /** Mode 1 active states keyed by playerId. */
  private activeSpeedTaps: Map<string, ActiveSpeedTap> = new Map();

  /** Configurable total taps for Mode 1. */
  private totalTaps: number = DEFAULT_TOTAL_TAPS;

  /** Resolve function for the current tap wait. */
  private tapResolve: (() => void) | null = null;

  /** Resolve function for admin grid ready. */
  private gridReadyResolve: (() => void) | null = null;

  /** Whether the round-one phone placement flow has already completed. */
  private gridSetupComplete = false;

  /** Extra timers. */
  private _extraTimers: ReturnType<typeof setTimeout>[] = [];

  // ── Lifecycle ────────────────────────────────────────────────────

  protected override async onLoad(): Promise<void> {
    for (const p of this.room.state.players.values()) {
      p.score = 0;
      p.isReady = false;
      p.isEliminated = false;
    }

    const configTaps = this.room.state.gameConfig.timeLimitSecs;
    if (configTaps >= MIN_TOTAL_TAPS && configTaps <= MAX_TOTAL_TAPS) {
      this.totalTaps = configTaps;
    } else {
      this.totalTaps = DEFAULT_TOTAL_TAPS;
    }

    const playerIds = this._activePlayers().map((p) => p.id);
    this.phoneAssignments = assignPhones(
      playerIds,
      1,
    );

    this.playerGroups = playerIds.map((playerId) => [playerId]);

    this.gridSetupComplete = false;
  }

  // ── Round logic ──────────────────────────────────────────────────

  protected override async runRound(round: number): Promise<void> {
    await this._runGridSetupIfNeeded();

    // Broadcast round start — all phones go white
    this.broadcast("grid_round_start", {
      round,
      gameMode: "speed_tap",
      totalTaps: this.totalTaps,
    });

    this.broadcast("grid_music", {
      action: "play",
      track: MUSIC_TRACK_ID,
    });

    await this._runSpeedTapRound(round);

    this.broadcast("grid_music", {
      action: "stop",
      track: MUSIC_TRACK_ID,
    });
  }

  protected override scoreRound(_round: number): void {
    // Scoring is handled inline during round execution
  }

  override handleInput(client: Client, data: unknown): void {
    const input = data as GridTapInput;
    if (!input) return;

    if (input.action === "admin_grid_ready") {
      // Only the host can confirm grid ready
      if (client.sessionId === this.room.state.hostSessionId) {
        if (this.gridReadyResolve) {
          this.gridReadyResolve();
          this.gridReadyResolve = null;
        }
      }
      return;
    }

    if (input.action === "tap" && input.phoneIndex !== undefined) {
      this._handleSpeedTap(client.sessionId, input.phoneIndex);
    }
  }

  override teardown(): void {
    super.teardown();
    for (const t of this._extraTimers) clearTimeout(t);
    this._extraTimers = [];
    this.activeSpeedTaps.clear();
    this.tapResolve = null;
    this.gridReadyResolve = null;
    this.gridSetupComplete = false;
  }

  // ── Mode 1: Speed Tap ──────────────────────────────────────────

  private async _runSpeedTapRound(round: number): Promise<void> {
    const allResults: SpeedTapPlayerResult[] = [];
    const gridLayout = getGridLayout(this.phoneAssignments.length);

    for (let gi = 0; gi < this.playerGroups.length; gi++) {
      const group = this.playerGroups[gi];
      const playerNames = group.map((id) => {
        const p = this.room.state.players.get(id);
        return p?.name ?? "Unknown";
      });

      // Announce which player/group is next with get-in-position time
      this.broadcast("grid_player_announce", {
        round,
        groupIndex: gi,
        totalGroups: this.playerGroups.length,
        playerIds: group,
        playerNames,
        readyDurationMs: PLAYER_READY_DELAY_MS,
        gridLayout,
        concurrentPlayers: 1,
      });

      await this.delay(PLAYER_READY_DELAY_MS);

      this.broadcast("grid_group_start", {
        round,
        groupIndex: gi,
        playerIds: group,
        playerNames,
      });

      await this.delay(2000);

      const groupResults = await this._runSpeedTapGroup(group, round);
      allResults.push(...groupResults);

      this.broadcast("grid_group_results", {
        round,
        groupIndex: gi,
        results: groupResults.map((r) => ({
          playerId: r.playerId,
          playerName:
            this.room.state.players.get(r.playerId)?.name ?? "Unknown",
          completionTimeMs: r.completionTimeMs,
          tapTimesMs: r.tapTimesMs,
          completed: r.completed,
          tapCount: getSpeedTapMetrics(r).tapCount,
          averageTapTimeMs: getSpeedTapMetrics(r).averageTapTimeMs,
          fastestTapTimeMs: getSpeedTapMetrics(r).fastestTapTimeMs,
        })),
      });

      await this.delay(RESULT_DISPLAY_MS);
    }

    const scores = scoreSpeedTapRound(allResults);
    for (const [playerId, points] of scores.entries()) {
      const player = this.room.state.players.get(playerId);
      if (player) player.score += points;
    }

    this.broadcast("grid_round_scores", {
      round,
      scores: Object.fromEntries(scores),
    });
  }

  private async _runSpeedTapGroup(
    playerIds: string[],
    _round: number,
  ): Promise<SpeedTapPlayerResult[]> {
    for (const playerId of playerIds) {
      const sequence = this._buildTapSequence();
      const state: ActiveSpeedTap = {
        playerId,
        currentPhoneIndex: sequence[0] ?? 0,
        sequence,
        litAt: Date.now(),
        tapTimesMs: [],
        startedAt: Date.now(),
        totalTaps: this.totalTaps,
        completed: false,
      };
      this.activeSpeedTaps.set(playerId, state);

      this._lightUpPhone(playerId, state.currentPhoneIndex);
    }

    await this._waitForAllSpeedTapsComplete(playerIds);

    const results: SpeedTapPlayerResult[] = [];
    for (const playerId of playerIds) {
      const state = this.activeSpeedTaps.get(playerId);
      if (state) {
        const completionTimeMs = Date.now() - state.startedAt;
        results.push({
          playerId,
          completionTimeMs,
          tapTimesMs: state.tapTimesMs,
          completed: state.tapTimesMs.length >= state.totalTaps,
        });
      }
    }

    for (const pid of playerIds) {
      this.activeSpeedTaps.delete(pid);
    }

    return results;
  }

  private _lightUpPhone(playerId: string, phoneIndex: number): void {
    // Notify the specific phone to light up
    const assignment = this.phoneAssignments[phoneIndex];
    if (assignment) {
      this.send(assignment.phoneId, "grid_phone_light", {
        playerId,
        phoneIndex,
        color: assignment.color,
        lit: true,
      });
    }

    // Broadcast to TV for real-time grid display
    this.broadcast("grid_phone_state", {
      playerId,
      phoneIndex,
      color: assignment?.color ?? GRID_COLORS[0],
      lit: true,
    });
  }

  private _handleSpeedTap(sessionId: string, phoneIndex: number): void {
    const tappedAssignment = this.phoneAssignments[phoneIndex];
    if (!tappedAssignment || tappedAssignment.phoneId !== sessionId) return;

    for (const [playerId, state] of this.activeSpeedTaps) {
      if (state.completed) continue;
      if (state.currentPhoneIndex !== phoneIndex) continue;

      const tapTime = Date.now() - state.litAt;
      state.tapTimesMs.push(tapTime);

      // Unlight current phone
      const oldAssignment = this.phoneAssignments[phoneIndex];
      if (oldAssignment) {
        this.send(oldAssignment.phoneId, "grid_phone_light", {
          playerId,
          phoneIndex,
          color: oldAssignment.color,
          lit: false,
        });
      }
      this.broadcast("grid_phone_state", {
        playerId,
        phoneIndex,
        color: oldAssignment?.color ?? GRID_COLORS[0],
        lit: false,
      });

      this.send(sessionId, "grid_tap_confirmed", {
        playerId,
        tapNumber: state.tapTimesMs.length,
        tapTimeMs: tapTime,
        totalTaps: state.totalTaps,
      });

      this.broadcast("grid_tap_progress", {
        playerId,
        playerName:
          this.room.state.players.get(playerId)?.name ?? "Unknown",
        tapNumber: state.tapTimesMs.length,
        totalTaps: state.totalTaps,
        tapTimeMs: tapTime,
      });

      if (state.tapTimesMs.length >= state.totalTaps) {
        state.completed = true;
        const completionTimeMs = Date.now() - state.startedAt;
        const metrics = getSpeedTapMetrics({
          playerId,
          completionTimeMs,
          tapTimesMs: state.tapTimesMs,
          completed: true,
        });

        this.broadcast("grid_player_complete", {
          playerId,
          playerName:
            this.room.state.players.get(playerId)?.name ?? "Unknown",
          completionTimeMs,
          averageTapTimeMs: metrics.averageTapTimeMs,
          fastestTapTimeMs: metrics.fastestTapTimeMs,
        });

        this._checkAllSpeedTapsDone();
      } else {
        const nextPhoneIdx = state.sequence[state.tapTimesMs.length] ?? state.currentPhoneIndex;
        state.currentPhoneIndex = nextPhoneIdx;
        state.litAt = Date.now();
        this._lightUpPhone(playerId, nextPhoneIdx);
      }

      return;
    }
  }

  private _waitForAllSpeedTapsComplete(playerIds: string[]): Promise<void> {
    return new Promise<void>((resolve) => {
      this.tapResolve = resolve;

      const timeout = setTimeout(() => {
        for (const pid of playerIds) {
          const state = this.activeSpeedTaps.get(pid);
          if (state && !state.completed) {
            state.completed = true;
            const completionTimeMs = Date.now() - state.startedAt;
            const metrics = getSpeedTapMetrics({
              playerId: pid,
              completionTimeMs,
              tapTimesMs: state.tapTimesMs,
              completed: false,
            });
            this.broadcast("grid_player_complete", {
              playerId: pid,
              playerName:
                this.room.state.players.get(pid)?.name ?? "Unknown",
              completionTimeMs,
              averageTapTimeMs: metrics.averageTapTimeMs,
              fastestTapTimeMs: metrics.fastestTapTimeMs,
              timedOut: true,
            });
          }
        }
        this.tapResolve = null;
        resolve();
      }, MODE1_ROUND_CAP_MS);
      this._extraTimers.push(timeout);
      this._checkAllSpeedTapsDone();
    });
  }

  private _checkAllSpeedTapsDone(): void {
    const allDone = [...this.activeSpeedTaps.values()].every(
      (s) => s.completed,
    );
    if (allDone && this.tapResolve) {
      this.tapResolve();
      this.tapResolve = null;
    }
  }

  // ── Utilities ─────────────────────────────────────────────────────

  private _buildTapSequence(): number[] {
    const sequence: number[] = [];
    const phoneCount = this.phoneAssignments.length;
    let previousPhoneIndex = -1;

    for (let i = 0; i < this.totalTaps; i++) {
      let nextPhoneIndex = previousPhoneIndex;
      while (phoneCount > 1 && nextPhoneIndex === previousPhoneIndex) {
        nextPhoneIndex = Math.floor(Math.random() * phoneCount);
      }
      if (phoneCount === 1) {
        nextPhoneIndex = 0;
      }
      sequence.push(nextPhoneIndex);
      previousPhoneIndex = nextPhoneIndex;
    }

    return sequence;
  }

  private _activePlayers() {
    return [...this.room.state.players.values()].filter(
      (p) => p.isConnected && !p.isEliminated,
    );
  }

  /**
   * Broadcast the placement instructions once the game screen is mounted and
   * wait briefly for the host to confirm. If the host never confirms, the game
   * auto-continues instead of hanging on the loading screen.
   */
  private async _runGridSetupIfNeeded(): Promise<void> {
    if (this.gridSetupComplete) return;

    const gridLayout = getGridLayout(this.phoneAssignments.length);

    this.broadcast("grid_setup", {
      phoneAssignments: this.phoneAssignments,
      concurrentPlayers: 1,
      gameMode: "speed_tap",
      totalTaps: this.totalTaps,
      musicTrack: MUSIC_TRACK_ID,
      gridLayout,
      playerGroups: this.playerGroups.map((group, gi) => ({
        groupIndex: gi,
        playerIds: group,
        playerNames: group.map((id) => {
          const p = this.room.state.players.get(id);
          return p?.name ?? "Unknown";
        }),
      })),
    });

    for (const assignment of this.phoneAssignments) {
      this.send(assignment.phoneId, "grid_phone_assignment", {
        displayNumber: assignment.displayNumber,
        color: assignment.color,
        groupIndex: assignment.groupIndex,
        totalGroups: 1,
        gridLayout,
      });
    }

    await this._waitForAdminGridReady();
    this.gridSetupComplete = true;
  }

  private _waitForAdminGridReady(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.gridReadyResolve = resolve;

      // Broadcast that we're waiting for admin confirmation
      this.broadcast("grid_waiting_for_admin", {
        message: "Waiting for host to confirm phone placement",
        timeoutMs: GRID_READY_TIMEOUT_MS,
      });

      // Timeout quickly so the game never appears stuck loading.
      const timeout = setTimeout(() => {
        this.gridReadyResolve = null;
        resolve();
      }, GRID_READY_TIMEOUT_MS);
      this._extraTimers.push(timeout);
    });
  }
}
