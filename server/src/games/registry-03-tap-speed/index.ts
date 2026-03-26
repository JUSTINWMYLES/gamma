/**
 * server/src/games/registry-03-tap-speed/index.ts
 *
 * "Tap Speed" — 1v1 bracket-based rapid tapping game.
 *
 * Game Rules
 * ──────────
 * - Players are seeded into a single-elimination bracket.
 * - Each match pits two players against each other in a tapping duel.
 * - A random countdown timer (5–20 seconds) is set per match.
 * - Both players tap as fast as possible during the window.
 * - The player with more taps wins and advances.
 * - If a player disconnects mid-match, the opponent auto-wins.
 * - The bracket continues until one champion remains.
 *
 * Scoring
 * ───────
 * - Base points for each match won:         +100
 * - Bonus points for each tap:                +1
 * - Champion bonus:                         +500
 * - Runner-up bonus:                        +200
 *
 * Anti-cheat
 * ──────────
 * - Minimum 50ms between taps (debounce) — anything faster is ignored.
 * - Maximum ~20 taps/second is realistic for mobile touch.
 *
 * Lifecycle override
 * ──────────────────
 * This game overrides runRounds() entirely to drive the bracket loop
 * instead of the default N-round loop from BaseGame.
 */

import { Client } from "@colyseus/core";
import { BaseGame } from "../BaseGame";
import { buildBracket, advanceBracket, getMatchPlayers, resolveHeat1v1 } from "../../utils/bracket";
import { BracketState, Heat } from "../../schema/BracketState";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Minimum tap duration per match (ms). */
const MIN_MATCH_DURATION_MS = 5_000;

/** Maximum tap duration per match (ms). */
const MAX_MATCH_DURATION_MS = 20_000;

/** Minimum interval between accepted taps from one player (ms). */
const TAP_DEBOUNCE_MS = 50;

/** How often to broadcast timer updates during a match (ms). */
const TIMER_TICK_MS = 250;

/** Delay between matches within the same bracket round (ms). */
const INTER_MATCH_DELAY_MS = 3_000;

/** Delay after all matches in a bracket round complete (ms). */
const BRACKET_ROUND_DELAY_MS = 4_000;

/** Delay showing match result before moving on (ms). */
const MATCH_RESULT_DELAY_MS = 4_000;

/** Points for winning a match. */
const MATCH_WIN_POINTS = 100;

/** Points per tap (awarded to both players). */
const POINTS_PER_TAP = 1;

/** Bonus for the tournament champion. */
const CHAMPION_BONUS = 500;

/** Bonus for the runner-up. */
const RUNNER_UP_BONUS = 200;

// ── Per-match tracking ────────────────────────────────────────────────────────

interface MatchState {
  matchId: string;
  player1Id: string;
  player2Id: string;
  player1Taps: number;
  player2Taps: number;
  player1LastTapAt: number;
  player2LastTapAt: number;
  durationMs: number;
  startedAt: number;
  ended: boolean;
}

// ── Input types ───────────────────────────────────────────────────────────────

interface TapSpeedInput {
  action: "tap";
}

// ── Game class ────────────────────────────────────────────────────────────────

export default class TapSpeedGame extends BaseGame {
  static override requiresTV = false;
  static override supportsBracket = true;
  static override defaultRoundCount = 1; // bracket-driven, not round-driven
  static override minRounds = 1;
  static override maxRounds = 1;
  static override hasInstructionsPhase = true;
  static override instructionsDelivery = "broadcast" as const;

  static override activityLevel: "none" | "some" | "full" = "none";
  static override requiresSameRoom = false;
  static override requiresSecondaryDisplay = false;

  /** Current active match state (null when no match is in progress). */
  private currentMatch: MatchState | null = null;

  /** Timer interval for broadcasting countdown ticks. */
  private timerInterval: ReturnType<typeof setInterval> | null = null;

  /** Resolve function for the current match promise. */
  private matchResolve: (() => void) | null = null;

  /** Accumulated scores applied at the end. */
  private pendingScores: Map<string, number> = new Map();

  /** Extra timers for cleanup. */
  private _extraTimers: ReturnType<typeof setTimeout>[] = [];

  /** Seed for bracket randomization. */
  private bracketSeed: number = 0;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  protected override async onLoad(): Promise<void> {
    // Reset all player state
    for (const p of this.room.state.players.values()) {
      p.score = 0;
      p.isReady = false;
      p.isEliminated = false;
      p.currentMatchOpponentId = "";
    }

    this.bracketSeed = Date.now();

    // Build the bracket from active player IDs
    const playerIds = this._activePlayers().map((p) => p.id);
    const bracket = buildBracket(playerIds, this.bracketSeed);

    // Assign bracket to room state so clients can render it
    this.room.state.bracket = bracket;
  }

  /**
   * Override runRounds entirely — we drive the bracket loop instead of
   * the default round-count loop from BaseGame.
   */
  protected override async runRounds(): Promise<void> {
    const bracket = this.room.state.bracket;

    // Enter in_round phase immediately — TapSpeed manages its own sub-phases
    // (bracket_init → match_preview → countdown → tapping → result, etc.)
    // We stay in "in_round" for the entire bracket to prevent the game
    // component from being unmounted/remounted by phase switches.
    this.setPhase("in_round");
    this.room.state.phaseStartedAt = Date.now();
    await this.delay(500); // let clients mount the game component

    // Broadcast the bracket setup (now the game component is mounted)
    const playerIds = this._activePlayers().map((p) => p.id);
    this.broadcast("tap_bracket_init", {
      totalPlayers: playerIds.length,
      totalRounds: this._estimateBracketRounds(playerIds.length),
    });

    // Brief pause to show bracket overview
    await this.delay(3000);

    while (true) {
      const bracketRoundIndex = bracket.currentRound;
      const currentBracketRound = bracket.rounds[bracketRoundIndex];
      if (!currentBracketRound) break;

      const pendingHeats = currentBracketRound.heats.filter(
        (h: Heat) => h.status !== "complete",
      );

      if (pendingHeats.length === 0) {
        // All heats done in this round — check if we should advance
        const advancers: string[] = [];
        for (const h of currentBracketRound.heats) {
          for (const aid of h.advancingIds) {
            if (aid) advancers.push(aid);
          }
        }

        if (advancers.length <= 1) {
          // Tournament complete — one champion
          break;
        }

        // Advance to next bracket round
        advanceBracket(bracket, this.bracketSeed);

        this.broadcast("tap_bracket_round_advance", {
          newRound: bracket.currentRound + 1,
        });

        await this.delay(BRACKET_ROUND_DELAY_MS);
        continue;
      }

      // Run each pending heat in this bracket round sequentially
      for (const heat of pendingHeats) {
        // Skip byes (already complete — shouldn't appear since we filtered, but guard)
        const [heatP1, heatP2] = getMatchPlayers(heat);
        if (!heatP2 || heatP2 === "") continue;

        // Update room state round number for UI display
        this.room.state.currentRound = bracketRoundIndex + 1;

        // Set opponents on player state
        const p1 = this.room.state.players.get(heatP1);
        const p2 = this.room.state.players.get(heatP2);
        if (p1) p1.currentMatchOpponentId = heatP2;
        if (p2) p2.currentMatchOpponentId = heatP1;

        // Announce upcoming match
        heat.status = "in_progress";
        this.broadcast("tap_match_start", {
          matchId: heat.id,
          player1Id: heatP1,
          player1Name: p1?.name ?? "Unknown",
          player2Id: heatP2,
          player2Name: p2?.name ?? "Unknown",
          bracketRound: bracketRoundIndex + 1,
        });

        // Show match preview for a moment before countdown
        await this.delay(2000);

        // Broadcast countdown within the game component (no phase change)
        this.broadcast("tap_countdown", { seconds: 3 });
        await this.delay(3000);

        // Run the match (stay in "in_round" phase the whole time)
        await this._runMatch(heat.id, heatP1, heatP2);

        // Determine winner
        const cm = this.currentMatch!;
        let winnerId: string;
        let loserId: string;

        if (cm.player1Taps > cm.player2Taps) {
          winnerId = cm.player1Id;
          loserId = cm.player2Id;
        } else if (cm.player2Taps > cm.player1Taps) {
          winnerId = cm.player2Id;
          loserId = cm.player1Id;
        } else {
          // Tie: random winner (extremely rare in a tap game)
          winnerId = Math.random() < 0.5 ? cm.player1Id : cm.player2Id;
          loserId = winnerId === cm.player1Id ? cm.player2Id : cm.player1Id;
        }

        // Record winner in bracket state
        resolveHeat1v1(heat, winnerId);

        // Mark loser as eliminated
        const loser = this.room.state.players.get(loserId);
        if (loser) loser.isEliminated = true;

        // Award scores
        const winnerTaps = winnerId === cm.player1Id ? cm.player1Taps : cm.player2Taps;
        const loserTaps = loserId === cm.player1Id ? cm.player1Taps : cm.player2Taps;

        this._addScore(winnerId, MATCH_WIN_POINTS + winnerTaps * POINTS_PER_TAP);
        this._addScore(loserId, loserTaps * POINTS_PER_TAP);

        // Broadcast match result
        const winner = this.room.state.players.get(winnerId);
        this.broadcast("tap_match_result", {
          matchId: heat.id,
          winnerId,
          winnerName: winner?.name ?? "Unknown",
          loserId,
          loserName: loser?.name ?? "Unknown",
          winnerTaps,
          loserTaps,
          durationMs: cm.durationMs,
        });

        // Clear opponents
        if (p1) p1.currentMatchOpponentId = "";
        if (p2) p2.currentMatchOpponentId = "";

        this.currentMatch = null;

        // Stay in "in_round" phase — the match_result message drives the
        // client sub-phase. Just delay to let players see the result.
        await this.delay(MATCH_RESULT_DELAY_MS);

        // Inter-match delay if more heats remain
        const remainingInRound = currentBracketRound.heats.filter(
          (h: Heat) => h.status !== "complete",
        );
        if (remainingInRound.length > 0) {
          await this.delay(INTER_MATCH_DELAY_MS);
        }
      }

      // After running all heats in this bracket round, loop back to
      // check if we need to advance or if the tournament is over
    }

    // ── Tournament complete ────────────────────────────────────────────────
    const finalRound = bracket.rounds[bracket.currentRound];
    const finalHeat = finalRound?.heats[0];
    const champion = finalHeat?.advancingIds[0] ?? "";

    if (champion) {
      this._addScore(champion, CHAMPION_BONUS);

      // Find runner-up (loser of final heat)
      const [fp1, fp2] = finalHeat ? getMatchPlayers(finalHeat) : ["", ""];
      const runnerUp = fp1 === champion ? fp2 : fp1;
      if (runnerUp && runnerUp !== "") {
        this._addScore(runnerUp, RUNNER_UP_BONUS);
      }

      const championPlayer = this.room.state.players.get(champion);
      const runnerUpPlayer = runnerUp
        ? this.room.state.players.get(runnerUp)
        : null;

      this.broadcast("tap_tournament_complete", {
        championId: champion,
        championName: championPlayer?.name ?? "Unknown",
        runnerUpId: runnerUp ?? "",
        runnerUpName: runnerUpPlayer?.name ?? "",
      });
    }

    // Apply all accumulated scores to player state
    this._applyScores();

    // Show scoreboard
    this.setPhase("scoreboard");
    await this.delay(6000);
  }

  /**
   * runRound() is required by the abstract class but we don't use it —
   * our bracket loop handles everything in runRounds().
   */
  protected override async runRound(_round: number): Promise<void> {
    // Not used — bracket loop drives matches directly
  }

  protected override scoreRound(_round: number): void {
    // Not used — scores are accumulated per-match and applied at tournament end
  }

  override handleInput(client: Client, data: unknown): void {
    const input = data as TapSpeedInput;
    if (!input || input.action !== "tap") return;

    const cm = this.currentMatch;
    if (!cm || cm.ended) return;

    const now = Date.now();
    const sessionId = client.sessionId;

    if (sessionId === cm.player1Id) {
      // Debounce check
      if (now - cm.player1LastTapAt < TAP_DEBOUNCE_MS) return;
      cm.player1Taps++;
      cm.player1LastTapAt = now;
    } else if (sessionId === cm.player2Id) {
      if (now - cm.player2LastTapAt < TAP_DEBOUNCE_MS) return;
      cm.player2Taps++;
      cm.player2LastTapAt = now;
    } else {
      // Not in this match — ignore
      return;
    }

    // Send tap confirmation to the tapping player
    this.send(sessionId, "tap_confirmed", {
      tapCount: sessionId === cm.player1Id ? cm.player1Taps : cm.player2Taps,
    });

    // Broadcast live tap counts to all clients (for TV display)
    this.broadcast("tap_counts", {
      matchId: cm.matchId,
      player1Id: cm.player1Id,
      player1Taps: cm.player1Taps,
      player2Id: cm.player2Id,
      player2Taps: cm.player2Taps,
    });
  }

  override teardown(): void {
    super.teardown();
    this._clearTimerInterval();
    for (const t of this._extraTimers) clearTimeout(t);
    this._extraTimers = [];
    this.currentMatch = null;
    this.matchResolve = null;
    this.pendingScores.clear();
  }

  // ── Match runner ──────────────────────────────────────────────────────────

  /**
   * Run a single 1v1 match. Resolves when the timer expires or a player
   * disconnects.
   */
  private async _runMatch(
    matchId: string,
    player1Id: string,
    player2Id: string,
  ): Promise<void> {
    // Random duration between 5–20 seconds
    const durationMs =
      MIN_MATCH_DURATION_MS +
      Math.floor(Math.random() * (MAX_MATCH_DURATION_MS - MIN_MATCH_DURATION_MS + 1));

    const now = Date.now();
    this.currentMatch = {
      matchId,
      player1Id,
      player2Id,
      player1Taps: 0,
      player2Taps: 0,
      player1LastTapAt: 0,
      player2LastTapAt: 0,
      durationMs,
      startedAt: now,
      ended: false,
    };

    // Update room state for client-side timer display
    this.room.state.roundDurationSecs = Math.ceil(durationMs / 1000);

    // Notify both players that tapping begins
    this.send(player1Id, "tap_go", { durationMs });
    this.send(player2Id, "tap_go", { durationMs });

    // Broadcast match timer info to all (for TV)
    this.broadcast("tap_match_timer_start", {
      matchId,
      durationMs,
      endsAt: now + durationMs,
    });

    // Start timer tick broadcast
    this.timerInterval = setInterval(() => this._matchTimerTick(), TIMER_TICK_MS);

    // Wait for match to end (timer or disconnect)
    await new Promise<void>((resolve) => {
      this.matchResolve = resolve;

      // Set the main timeout
      const timeout = setTimeout(() => {
        this._endMatch();
      }, durationMs);
      this._extraTimers.push(timeout);
    });
  }

  /** Periodic timer tick — broadcasts remaining time and checks for disconnects. */
  private _matchTimerTick(): void {
    const cm = this.currentMatch;
    if (!cm || cm.ended) return;

    const elapsed = Date.now() - cm.startedAt;
    const remaining = Math.max(0, cm.durationMs - elapsed);

    this.broadcast("tap_timer", {
      matchId: cm.matchId,
      timeRemaining: remaining,
      player1Taps: cm.player1Taps,
      player2Taps: cm.player2Taps,
    });

    // Check for disconnected player — auto-win for opponent
    const p1 = this.room.state.players.get(cm.player1Id);
    const p2 = this.room.state.players.get(cm.player2Id);

    if (p1 && !p1.isConnected) {
      // Player 1 disconnected — player 2 auto-wins by getting max taps
      cm.player1Taps = -1; // ensures player 2 wins
      this._endMatch();
      return;
    }
    if (p2 && !p2.isConnected) {
      cm.player2Taps = -1;
      this._endMatch();
      return;
    }
  }

  /** End the current match and resolve the promise. */
  private _endMatch(): void {
    const cm = this.currentMatch;
    if (!cm || cm.ended) return;

    cm.ended = true;
    this._clearTimerInterval();

    // Broadcast final state
    this.broadcast("tap_match_end", {
      matchId: cm.matchId,
      player1Id: cm.player1Id,
      player1Taps: cm.player1Taps,
      player2Id: cm.player2Id,
      player2Taps: cm.player2Taps,
    });

    if (this.matchResolve) {
      this.matchResolve();
      this.matchResolve = null;
    }
  }

  // ── Scoring ───────────────────────────────────────────────────────────────

  /** Add points to a player's pending score. */
  private _addScore(playerId: string, points: number): void {
    const current = this.pendingScores.get(playerId) ?? 0;
    this.pendingScores.set(playerId, current + points);
  }

  /** Apply all pending scores to room state. */
  private _applyScores(): void {
    for (const [playerId, points] of this.pendingScores.entries()) {
      const player = this.room.state.players.get(playerId);
      if (player) player.score += points;
    }
    this.pendingScores.clear();
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  /** Return connected, non-eliminated players. */
  private _activePlayers() {
    return [...this.room.state.players.values()].filter(
      (p) => p.isConnected && !p.isEliminated,
    );
  }

  /** Estimate total bracket rounds for N players. */
  private _estimateBracketRounds(playerCount: number): number {
    if (playerCount <= 1) return 0;
    return Math.ceil(Math.log2(playerCount));
  }

  /** Clear the timer broadcast interval. */
  private _clearTimerInterval(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }
}
