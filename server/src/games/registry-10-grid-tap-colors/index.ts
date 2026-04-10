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
  getConcurrentPlayerCount,
  assignPhones,
  getPhonesForGroup,
  generateColorSequence,
  scoreSpeedTapRound,
  scoreColorSequenceRound,
  countSequenceErrors,
  buildPlayerGroups,
  getGridLayout,
  GRID_COLORS,
  type PhoneAssignment,
  type ColorSequenceStep,
  type SpeedTapPlayerResult,
  type ColorSequencePlayerResult,
} from "./gridTapLogic";

// ── Constants ────────────────────────────────────────────────────────────────

/** Default number of taps per Speed Tap round. */
const DEFAULT_TOTAL_TAPS = 10;

/** Minimum taps per round. */
const MIN_TOTAL_TAPS = 3;

/** Maximum taps per round. */
const MAX_TOTAL_TAPS = 20;

/** Delay between groups within a round (ms). */
const INTER_GROUP_DELAY_MS = 3_000;

/** How long the TV shows the color sequence per step in Mode 2 (ms). */
const SEQUENCE_DISPLAY_TIME_PER_STEP_MS = 1_200;

/** Extra time after sequence finishes before players can tap (ms). */
const SEQUENCE_MEMORIZE_BUFFER_MS = 2_000;

/** Maximum time for Mode 2 player input (ms). */
const MODE2_INPUT_TIMEOUT_MS = 30_000;

/** Maximum time to wait for a Mode 1 tap before auto-advancing (ms). */
const MODE1_TAP_TIMEOUT_MS = 10_000;

/** Maximum total duration for a Speed Tap round per player (ms). */
const MODE1_ROUND_CAP_MS = 20_000;

/** Delay to show results after a group finishes (ms). */
const RESULT_DISPLAY_MS = 4_000;

/** Default color sequence length for Mode 2. */
const DEFAULT_SEQUENCE_LENGTH = 5;

/** Music track placeholder identifier. */
const MUSIC_TRACK_PLACEHOLDER = "grid-tap-colors-bgm-placeholder";

/** Time for the player to get in position before their turn (ms). */
const PLAYER_READY_DELAY_MS = 10_000;

/** Max time to wait for phone-placement confirmation once the round screen is live. */
const GRID_READY_TIMEOUT_MS = 20_000;

// ── Input types ──────────────────────────────────────────────────────────────

interface GridTapInput {
  action: "tap" | "submit_sequence" | "admin_grid_ready";
  /** Phone index tapped (Mode 1 & 2). */
  phoneIndex?: number;
}

// ── Per-match tracking ───────────────────────────────────────────────────────

interface ActiveSpeedTap {
  playerId: string;
  /** Which phone index is currently lit. */
  currentPhoneIndex: number;
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

interface ActiveColorSequence {
  playerId: string;
  /** The correct sequence to replicate. */
  sequence: ColorSequenceStep[];
  /** Taps collected so far. */
  taps: number[];
  /** Timestamp when player input phase began. */
  inputStartedAt: number;
  /** Whether the player has submitted. */
  submitted: boolean;
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

  /** Number of concurrent players per group. */
  private concurrentPlayers: 1 | 2 | 4 = 1;

  /** Player groups for round rotation. */
  private playerGroups: string[][] = [];

  /** Mode 1 active states keyed by playerId. */
  private activeSpeedTaps: Map<string, ActiveSpeedTap> = new Map();

  /** Mode 2 active states keyed by playerId. */
  private activeSequences: Map<string, ActiveColorSequence> = new Map();

  /** Current game mode (from gameConfig.gameMode). */
  private gameMode: "speed_tap" | "color_sequence" = "speed_tap";

  /** Configurable total taps for Mode 1. */
  private totalTaps: number = DEFAULT_TOTAL_TAPS;

  /** Sequence length for Mode 2. */
  private sequenceLength: number = DEFAULT_SEQUENCE_LENGTH;

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
    // Reset all players
    for (const p of this.room.state.players.values()) {
      p.score = 0;
      p.isReady = false;
      p.isEliminated = false;
    }

    // Determine game mode from config
    const mode = this.room.state.gameConfig.gameMode;
    this.gameMode = mode === "color_sequence" ? "color_sequence" : "speed_tap";

    // Parse total taps from round duration (repurposed config field)
    const configTaps = this.room.state.gameConfig.timeLimitSecs;
    if (configTaps >= MIN_TOTAL_TAPS && configTaps <= MAX_TOTAL_TAPS) {
      this.totalTaps = configTaps;
    } else {
      this.totalTaps = DEFAULT_TOTAL_TAPS;
    }

    // Determine concurrency
    const playerIds = this._activePlayers().map((p) => p.id);
    this.concurrentPlayers = getConcurrentPlayerCount(playerIds.length);

    // Assign phones (all connected players' phones form the grid)
    this.phoneAssignments = assignPhones(
      playerIds,
      this.concurrentPlayers > 1 ? this.concurrentPlayers : 1,
    );

    // Build player groups
    this.playerGroups = buildPlayerGroups(playerIds, this.concurrentPlayers);

    this.gridSetupComplete = false;
  }

  // ── Round logic ──────────────────────────────────────────────────

  protected override async runRound(round: number): Promise<void> {
    await this._runGridSetupIfNeeded();

    // Broadcast round start — all phones go white
    this.broadcast("grid_round_start", {
      round,
      gameMode: this.gameMode,
      totalTaps: this.totalTaps,
    });

    // Notify music placeholder
    this.broadcast("grid_music", {
      action: "play",
      track: MUSIC_TRACK_PLACEHOLDER,
    });

    if (this.gameMode === "speed_tap") {
      await this._runSpeedTapRound(round);
    } else {
      await this._runColorSequenceRound(round);
    }

    // Stop music
    this.broadcast("grid_music", {
      action: "stop",
      track: MUSIC_TRACK_PLACEHOLDER,
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
      if (this.gameMode === "speed_tap") {
        this._handleSpeedTap(client.sessionId, input.phoneIndex);
      } else {
        this._handleSequenceTap(client.sessionId, input.phoneIndex);
      }
    } else if (input.action === "submit_sequence") {
      this._handleSequenceSubmit(client.sessionId);
    }
  }

  override teardown(): void {
    super.teardown();
    for (const t of this._extraTimers) clearTimeout(t);
    this._extraTimers = [];
    this.activeSpeedTaps.clear();
    this.activeSequences.clear();
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
        concurrentPlayers: this.concurrentPlayers,
      });

      // Give the player(s) time to get in position
      await this.delay(PLAYER_READY_DELAY_MS);

      // Announce group starting (countdown)
      this.broadcast("grid_group_start", {
        round,
        groupIndex: gi,
        playerIds: group,
        playerNames,
      });

      await this.delay(2000);

      // Run all players in this group concurrently
      const groupResults = await this._runSpeedTapGroup(group, round);
      allResults.push(...groupResults);

      // Broadcast group results
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
          fastestTap: r.tapTimesMs.length > 0 ? Math.min(...r.tapTimesMs) : 0,
          slowestTap: r.tapTimesMs.length > 0 ? Math.max(...r.tapTimesMs) : 0,
        })),
      });

      await this.delay(RESULT_DISPLAY_MS);

      if (gi < this.playerGroups.length - 1) {
        await this.delay(INTER_GROUP_DELAY_MS);
      }
    }

    // Score the round
    const scores = scoreSpeedTapRound(allResults);
    for (const [playerId, points] of scores.entries()) {
      const player = this.room.state.players.get(playerId);
      if (player) player.score += points;
    }

    // Broadcast round scores
    this.broadcast("grid_round_scores", {
      round,
      scores: Object.fromEntries(scores),
    });
  }

  private async _runSpeedTapGroup(
    playerIds: string[],
    _round: number,
  ): Promise<SpeedTapPlayerResult[]> {
    // Initialize active states for each player
    const phones = this.phoneAssignments;

    for (const playerId of playerIds) {
      const firstPhoneIdx = Math.floor(Math.random() * phones.length);
      const state: ActiveSpeedTap = {
        playerId,
        currentPhoneIndex: firstPhoneIdx,
        litAt: Date.now(),
        tapTimesMs: [],
        startedAt: Date.now(),
        totalTaps: this.totalTaps,
        completed: false,
      };
      this.activeSpeedTaps.set(playerId, state);

      // Light up the first phone for this player
      this._lightUpPhone(playerId, firstPhoneIdx);
    }

    // Wait for all players to complete or timeout
    await this._waitForAllSpeedTapsComplete(playerIds);

    // Collect results
    const results: SpeedTapPlayerResult[] = [];
    for (const playerId of playerIds) {
      const state = this.activeSpeedTaps.get(playerId);
      if (state) {
        results.push({
          playerId,
          completionTimeMs: state.completed
            ? state.tapTimesMs.reduce((a, b) => a + b, 0)
            : Date.now() - state.startedAt,
          tapTimesMs: state.tapTimesMs,
          completed: state.completed,
        });
      }
    }

    // Clear active states
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
    // Find the player whose run involves this tap
    // The tap comes from the phone that was tapped, so we need to find
    // which player has that phone lit
    for (const [playerId, state] of this.activeSpeedTaps) {
      if (state.completed) continue;
      if (state.currentPhoneIndex !== phoneIndex) continue;

      // Correct phone tapped
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

      // Send tap confirmation
      this.send(sessionId, "grid_tap_confirmed", {
        playerId,
        tapNumber: state.tapTimesMs.length,
        tapTimeMs: tapTime,
        totalTaps: state.totalTaps,
      });

      // Broadcast progress to TV
      this.broadcast("grid_tap_progress", {
        playerId,
        playerName:
          this.room.state.players.get(playerId)?.name ?? "Unknown",
        tapNumber: state.tapTimesMs.length,
        totalTaps: state.totalTaps,
        tapTimeMs: tapTime,
      });

      // Check if done
      if (state.tapTimesMs.length >= state.totalTaps) {
        state.completed = true;

        this.broadcast("grid_player_complete", {
          playerId,
          playerName:
            this.room.state.players.get(playerId)?.name ?? "Unknown",
          completionTimeMs: state.tapTimesMs.reduce((a, b) => a + b, 0),
        });

        // Check if all active players are done
        this._checkAllSpeedTapsDone();
      } else {
        // Light up next phone
        const nextPhoneIdx = this._pickNextPhone(phoneIndex);
        state.currentPhoneIndex = nextPhoneIdx;
        state.litAt = Date.now();
        this._lightUpPhone(playerId, nextPhoneIdx);
      }

      return;
    }
  }

  private _pickNextPhone(currentIndex: number): number {
    // Pick a random phone that's different from the current one
    const count = this.phoneAssignments.length;
    if (count <= 1) return 0;
    let next = currentIndex;
    while (next === currentIndex) {
      next = Math.floor(Math.random() * count);
    }
    return next;
  }

  private _waitForAllSpeedTapsComplete(playerIds: string[]): Promise<void> {
    return new Promise<void>((resolve) => {
      this.tapResolve = resolve;

      // Cap the entire round at 20 seconds (MODE1_ROUND_CAP_MS)
      const timeout = setTimeout(() => {
        // Mark uncompleted players
        for (const pid of playerIds) {
          const state = this.activeSpeedTaps.get(pid);
          if (state && !state.completed) {
            state.completed = true;
            this.broadcast("grid_player_complete", {
              playerId: pid,
              playerName:
                this.room.state.players.get(pid)?.name ?? "Unknown",
              completionTimeMs: Date.now() - state.startedAt,
              timedOut: true,
            });
          }
        }
        this.tapResolve = null;
        resolve();
      }, MODE1_ROUND_CAP_MS);
      this._extraTimers.push(timeout);

      // Check if already done
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

  // ── Mode 2: Color Sequence Memory ──────────────────────────────

  private async _runColorSequenceRound(round: number): Promise<void> {
    const allResults: ColorSequencePlayerResult[] = [];
    // Increase sequence length each round
    const seqLen = this.sequenceLength + (round - 1);
    const gridLayout = getGridLayout(this.phoneAssignments.length);

    for (let gi = 0; gi < this.playerGroups.length; gi++) {
      const group = this.playerGroups[gi];
      const playerNames = group.map((id) => {
        const p = this.room.state.players.get(id);
        return p?.name ?? "Unknown";
      });

      // Generate a color sequence
      const sequence = generateColorSequence(
        this.phoneAssignments.length,
        seqLen,
      );

      // Announce which player/group is next with get-in-position time
      this.broadcast("grid_player_announce", {
        round,
        groupIndex: gi,
        totalGroups: this.playerGroups.length,
        playerIds: group,
        playerNames,
        readyDurationMs: PLAYER_READY_DELAY_MS,
        gridLayout,
        concurrentPlayers: this.concurrentPlayers,
      });

      // Give the player(s) time to get in position
      await this.delay(PLAYER_READY_DELAY_MS);

      // Announce group starting
      this.broadcast("grid_group_start", {
        round,
        groupIndex: gi,
        playerIds: group,
        playerNames,
      });

      await this.delay(2000);

      // Show sequence on TV
      this.broadcast("grid_sequence_show", {
        round,
        groupIndex: gi,
        sequence: sequence.map((s) => ({
          phoneIndex: s.phoneIndex,
          color: s.color,
        })),
        displayTimePerStepMs: SEQUENCE_DISPLAY_TIME_PER_STEP_MS,
      });

      // Flash sequence on phones too
      for (let si = 0; si < sequence.length; si++) {
        const step = sequence[si];
        const assignment = this.phoneAssignments[step.phoneIndex];
        if (assignment) {
          this.send(assignment.phoneId, "grid_phone_light", {
            playerId: "sequence",
            phoneIndex: step.phoneIndex,
            color: step.color,
            lit: true,
          });
        }
        this.broadcast("grid_phone_state", {
          playerId: "sequence",
          phoneIndex: step.phoneIndex,
          color: step.color,
          lit: true,
        });
        await this.delay(SEQUENCE_DISPLAY_TIME_PER_STEP_MS);
        if (assignment) {
          this.send(assignment.phoneId, "grid_phone_light", {
            playerId: "sequence",
            phoneIndex: step.phoneIndex,
            color: step.color,
            lit: false,
          });
        }
        this.broadcast("grid_phone_state", {
          playerId: "sequence",
          phoneIndex: step.phoneIndex,
          color: step.color,
          lit: false,
        });
      }

      // Memorize buffer
      this.broadcast("grid_sequence_memorize", {
        round,
        groupIndex: gi,
        bufferMs: SEQUENCE_MEMORIZE_BUFFER_MS,
      });
      await this.delay(SEQUENCE_MEMORIZE_BUFFER_MS);

      // Start input phase
      const groupResults = await this._runColorSequenceGroup(
        group,
        sequence,
        round,
      );
      allResults.push(...groupResults);

      // Broadcast group results
      this.broadcast("grid_group_results", {
        round,
        groupIndex: gi,
        results: groupResults.map((r) => {
          const errors = countSequenceErrors(r.taps, r.correctSequence);
          return {
            playerId: r.playerId,
            playerName:
              this.room.state.players.get(r.playerId)?.name ?? "Unknown",
            errors,
            correctCount: r.correctSequence.length - errors,
            totalSteps: r.correctSequence.length,
            completionTimeMs: r.completionTimeMs,
            submitted: r.submitted,
          };
        }),
      });

      await this.delay(RESULT_DISPLAY_MS);

      if (gi < this.playerGroups.length - 1) {
        await this.delay(INTER_GROUP_DELAY_MS);
      }
    }

    // Score the round
    const scores = scoreColorSequenceRound(allResults);
    for (const [playerId, points] of scores.entries()) {
      const player = this.room.state.players.get(playerId);
      if (player) player.score += points;
    }

    this.broadcast("grid_round_scores", {
      round,
      scores: Object.fromEntries(scores),
    });
  }

  private async _runColorSequenceGroup(
    playerIds: string[],
    sequence: ColorSequenceStep[],
    _round: number,
  ): Promise<ColorSequencePlayerResult[]> {
    const now = Date.now();

    // Initialize active sequence states
    for (const playerId of playerIds) {
      this.activeSequences.set(playerId, {
        playerId,
        sequence,
        taps: [],
        inputStartedAt: now,
        submitted: false,
      });
    }

    // Notify players that input phase has started
    this.broadcast("grid_sequence_input_start", {
      playerIds,
      sequenceLength: sequence.length,
      timeoutMs: MODE2_INPUT_TIMEOUT_MS,
    });

    // Highlight all phone colors so players know which phone = which color
    for (const assignment of this.phoneAssignments) {
      this.send(assignment.phoneId, "grid_phone_color_hint", {
        color: assignment.color,
        displayNumber: assignment.displayNumber,
      });
    }

    // Wait for all players to submit or timeout
    await new Promise<void>((resolve) => {
      this.tapResolve = resolve;

      const timeout = setTimeout(() => {
        this.tapResolve = null;
        resolve();
      }, MODE2_INPUT_TIMEOUT_MS);
      this._extraTimers.push(timeout);

      this._checkAllSequencesDone();
    });

    // Collect results
    const results: ColorSequencePlayerResult[] = [];
    for (const playerId of playerIds) {
      const state = this.activeSequences.get(playerId);
      if (state) {
        results.push({
          playerId,
          taps: state.taps,
          correctSequence: state.sequence,
          completionTimeMs: state.submitted
            ? Date.now() - state.inputStartedAt
            : MODE2_INPUT_TIMEOUT_MS,
          submitted: state.submitted,
        });
      }
    }

    // Clear active states
    for (const pid of playerIds) {
      this.activeSequences.delete(pid);
    }

    return results;
  }

  private _handleSequenceTap(sessionId: string, phoneIndex: number): void {
    const state = this.activeSequences.get(sessionId);
    if (!state || state.submitted) return;

    state.taps.push(phoneIndex);

    // Notify the player of their tap
    this.send(sessionId, "grid_sequence_tap_confirmed", {
      tapIndex: state.taps.length - 1,
      phoneIndex,
      totalSteps: state.sequence.length,
    });

    // Broadcast tap progress to TV
    this.broadcast("grid_sequence_tap_progress", {
      playerId: sessionId,
      playerName:
        this.room.state.players.get(sessionId)?.name ?? "Unknown",
      tapCount: state.taps.length,
      totalSteps: state.sequence.length,
    });

    // Auto-submit when enough taps collected
    if (state.taps.length >= state.sequence.length) {
      this._handleSequenceSubmit(sessionId);
    }
  }

  private _handleSequenceSubmit(sessionId: string): void {
    const state = this.activeSequences.get(sessionId);
    if (!state || state.submitted) return;

    state.submitted = true;

    const errors = countSequenceErrors(state.taps, state.sequence);
    this.broadcast("grid_player_sequence_complete", {
      playerId: sessionId,
      playerName:
        this.room.state.players.get(sessionId)?.name ?? "Unknown",
      errors,
      totalSteps: state.sequence.length,
    });

    this._checkAllSequencesDone();
  }

  private _checkAllSequencesDone(): void {
    const allDone = [...this.activeSequences.values()].every(
      (s) => s.submitted,
    );
    if (allDone && this.tapResolve) {
      this.tapResolve();
      this.tapResolve = null;
    }
  }

  // ── Utilities ─────────────────────────────────────────────────────

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
      concurrentPlayers: this.concurrentPlayers,
      gameMode: this.gameMode,
      totalTaps: this.totalTaps,
      musicTrack: MUSIC_TRACK_PLACEHOLDER,
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
        totalGroups: this.concurrentPlayers > 1 ? this.concurrentPlayers : 1,
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
