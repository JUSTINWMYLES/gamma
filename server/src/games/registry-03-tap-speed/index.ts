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

const RECONNECT_GRACE_SECONDS = Number(process.env.RECONNECT_GRACE_SECONDS ?? 60);
const RECONNECT_GRACE_MS = RECONNECT_GRACE_SECONDS * 1000;

// ── Constants ─────────────────────────────────────────────────────────────────

/** Minimum tap duration per match (ms). */
const MIN_MATCH_DURATION_MS = 5_000;

/** Maximum tap duration per match (ms). */
const MAX_MATCH_DURATION_MS = 20_000;

/** Minimum interval between accepted taps from one player (ms). */
const TAP_DEBOUNCE_MS = 50;

/** How often to check match state during a live duel (ms). */
const MATCH_MONITOR_TICK_MS = 250;

/** Maximum cadence for broadcasting live tap counts (ms). */
const LIVE_COUNT_BROADCAST_INTERVAL_MS = 100;

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
  player1DisconnectedAt: number;
  player2DisconnectedAt: number;
}

interface MatchOutcome {
  winnerId: string;
  loserId: string;
  winnerTaps: number;
  loserTaps: number;
  forfeitedPlayerId: string;
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

  /** Interval for disconnect / timeout checks during a live match. */
  private matchMonitorInterval: ReturnType<typeof setInterval> | null = null;

  /** Interval for coalesced live tap-count broadcasts. */
  private liveCountInterval: ReturnType<typeof setInterval> | null = null;

  /** Whether the latest tap counts still need broadcasting. */
  private liveCountsDirty = false;

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

    if (this.hasPracticeRound()) {
      await this._runPracticeBracketRound();
      this.room.state.isPracticeRound = false;
    }

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
        const outcome = this._resolveMatchOutcome(cm);
        const { winnerId, loserId, winnerTaps, loserTaps } = outcome;

        // Record winner in bracket state
        resolveHeat1v1(heat, winnerId);

        // Mark loser as eliminated
        const loser = this.room.state.players.get(loserId);
        if (loser) loser.isEliminated = true;

        // Award scores
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
          forfeitedPlayerId: outcome.forfeitedPlayerId,
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
    this.room.state.isPracticeRound = false;
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

    // Coalesce live tap-count updates — the tapping player already has an
    // immediate private confirmation, so everyone else only needs a short,
    // human-visible live cadence rather than a broadcast on every tap.
    this.liveCountsDirty = true;
  }

  override teardown(): void {
    super.teardown();
    this._clearMatchIntervals();
    for (const t of this._extraTimers) clearTimeout(t);
    this._extraTimers = [];
    this.currentMatch = null;
    this.matchResolve = null;
    this.pendingScores.clear();
  }

  override onPlayerReconnected(oldId: string, newId: string, _client: Client): void {
    if (this.currentMatch) {
      if (this.currentMatch.player1Id === oldId) {
        this.currentMatch.player1Id = newId;
        this.currentMatch.player1DisconnectedAt = 0;
      }
      if (this.currentMatch.player2Id === oldId) {
        this.currentMatch.player2Id = newId;
        this.currentMatch.player2DisconnectedAt = 0;
      }
    }

    if (this.pendingScores.has(oldId)) {
      const points = this.pendingScores.get(oldId) ?? 0;
      this.pendingScores.delete(oldId);
      this.pendingScores.set(newId, (this.pendingScores.get(newId) ?? 0) + points);
    }

    this._replaceBracketPlayerId(oldId, newId);
    this._syncCurrentMatchToPlayer(newId);
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
    const endsAt = now + durationMs;
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
      player1DisconnectedAt: 0,
      player2DisconnectedAt: 0,
    };

    // Update room state for client-side timer display
    this.room.state.roundDurationSecs = Math.ceil(durationMs / 1000);

    // Notify both players that tapping begins
    this.send(player1Id, "tap_go", { durationMs, endsAt });
    this.send(player2Id, "tap_go", { durationMs, endsAt });

    // Broadcast match timer info to all (for TV)
    this.broadcast("tap_match_timer_start", {
      matchId,
      durationMs,
      endsAt,
    });

    // Use one light-weight monitor for disconnect / timeout checks and one
    // coalesced score broadcaster so we keep live visibility without sending
    // a room-wide websocket message on every accepted tap.
    this.liveCountsDirty = false;
    this.matchMonitorInterval = setInterval(() => this._matchTimerTick(), MATCH_MONITOR_TICK_MS);
    this.liveCountInterval = setInterval(
      () => this._flushLiveCountBroadcast(),
      LIVE_COUNT_BROADCAST_INTERVAL_MS,
    );

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

  /** Periodic monitor tick — checks for disconnect forfeits and time expiry. */
  private _matchTimerTick(): void {
    const cm = this.currentMatch;
    if (!cm || cm.ended) return;

    // Check for disconnected player — auto-win for opponent
    const p1 = this.room.state.players.get(cm.player1Id);
    const p2 = this.room.state.players.get(cm.player2Id);

    if (p1 && !p1.isConnected) {
      if (cm.player1DisconnectedAt === 0) {
        cm.player1DisconnectedAt = Date.now();
      }
    } else {
      cm.player1DisconnectedAt = 0;
    }
    if (p2 && !p2.isConnected) {
      if (cm.player2DisconnectedAt === 0) {
        cm.player2DisconnectedAt = Date.now();
      }
    } else {
      cm.player2DisconnectedAt = 0;
    }

    if (this._disconnectExceededGrace(cm.player1DisconnectedAt)) {
      this._endMatch();
      return;
    }
    if (this._disconnectExceededGrace(cm.player2DisconnectedAt)) {
      this._endMatch();
      return;
    }

    if (Date.now() >= cm.startedAt + cm.durationMs) {
      this._endMatch();
    }
  }

  /** End the current match and resolve the promise. */
  private _endMatch(): void {
    const cm = this.currentMatch;
    if (!cm || cm.ended) return;

    cm.ended = true;
    this._clearMatchIntervals();

    // Broadcast final state
    this.broadcast("tap_match_end", this._tapCountPayload(cm));

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

  private _disconnectExceededGrace(disconnectedAt: number): boolean {
    return disconnectedAt > 0 && Date.now() - disconnectedAt >= RECONNECT_GRACE_MS;
  }

  private async _runPracticeBracketRound(): Promise<void> {
    const practiceRound = this.room.state.bracket.rounds[0];
    if (!practiceRound) return;

    this.room.state.currentRound = 0;
    this.room.state.isPracticeRound = true;

    const practiceHeats = practiceRound.heats.filter((heat: Heat) => {
      const [, player2Id] = getMatchPlayers(heat);
      return !!player2Id;
    });

    for (let index = 0; index < practiceHeats.length; index++) {
      const heat = practiceHeats[index];
      const [heatP1, heatP2] = getMatchPlayers(heat);
      if (!heatP1 || !heatP2) continue;

      const p1 = this.room.state.players.get(heatP1);
      const p2 = this.room.state.players.get(heatP2);
      if (p1) p1.currentMatchOpponentId = heatP2;
      if (p2) p2.currentMatchOpponentId = heatP1;

      this.broadcast("tap_match_start", {
        matchId: `practice-${heat.id}`,
        player1Id: heatP1,
        player1Name: p1?.name ?? "Unknown",
        player2Id: heatP2,
        player2Name: p2?.name ?? "Unknown",
        bracketRound: 0,
      });

      await this.delay(2000);
      this.broadcast("tap_countdown", { seconds: 3 });
      await this.delay(3000);

      await this._runMatch(`practice-${heat.id}`, heatP1, heatP2);

      const cm = this.currentMatch;
      if (!cm) continue;

      const outcome = this._resolveMatchOutcome(cm);
      const loser = this.room.state.players.get(outcome.loserId);
      const winner = this.room.state.players.get(outcome.winnerId);

      this.broadcast("tap_match_result", {
        matchId: `practice-${heat.id}`,
        winnerId: outcome.winnerId,
        winnerName: winner?.name ?? "Unknown",
        loserId: outcome.loserId,
        loserName: loser?.name ?? "Unknown",
        winnerTaps: outcome.winnerTaps,
        loserTaps: outcome.loserTaps,
        forfeitedPlayerId: outcome.forfeitedPlayerId,
        durationMs: cm.durationMs,
      });

      if (p1) p1.currentMatchOpponentId = "";
      if (p2) p2.currentMatchOpponentId = "";
      this.currentMatch = null;

      await this.delay(MATCH_RESULT_DELAY_MS);

      if (index < practiceHeats.length - 1) {
        await this.delay(INTER_MATCH_DELAY_MS);
      }
    }
  }

  private _resolveMatchOutcome(cm: MatchState): MatchOutcome {
    const player1Forfeited = this._disconnectExceededGrace(cm.player1DisconnectedAt);
    const player2Forfeited = this._disconnectExceededGrace(cm.player2DisconnectedAt);

    if (player1Forfeited !== player2Forfeited) {
      return player1Forfeited
        ? {
            winnerId: cm.player2Id,
            loserId: cm.player1Id,
            winnerTaps: cm.player2Taps,
            loserTaps: cm.player1Taps,
            forfeitedPlayerId: cm.player1Id,
          }
        : {
            winnerId: cm.player1Id,
            loserId: cm.player2Id,
            winnerTaps: cm.player1Taps,
            loserTaps: cm.player2Taps,
            forfeitedPlayerId: cm.player2Id,
          };
    }

    if (cm.player1Taps > cm.player2Taps) {
      return {
        winnerId: cm.player1Id,
        loserId: cm.player2Id,
        winnerTaps: cm.player1Taps,
        loserTaps: cm.player2Taps,
        forfeitedPlayerId: "",
      };
    }

    if (cm.player2Taps > cm.player1Taps) {
      return {
        winnerId: cm.player2Id,
        loserId: cm.player1Id,
        winnerTaps: cm.player2Taps,
        loserTaps: cm.player1Taps,
        forfeitedPlayerId: "",
      };
    }

    const winnerId = Math.random() < 0.5 ? cm.player1Id : cm.player2Id;
    const loserId = winnerId === cm.player1Id ? cm.player2Id : cm.player1Id;

    return {
      winnerId,
      loserId,
      winnerTaps: winnerId === cm.player1Id ? cm.player1Taps : cm.player2Taps,
      loserTaps: loserId === cm.player1Id ? cm.player1Taps : cm.player2Taps,
      forfeitedPlayerId: "",
    };
  }

  private _replaceBracketPlayerId(oldId: string, newId: string): void {
    const bracket = this.room.state.bracket;
    for (const round of bracket.rounds) {
      for (const heat of round.heats) {
        for (let i = 0; i < heat.playerIds.length; i++) {
          if (heat.playerIds[i] === oldId) {
            heat.playerIds[i] = newId;
          }
        }
        for (let i = 0; i < heat.advancingIds.length; i++) {
          if (heat.advancingIds[i] === oldId) {
            heat.advancingIds[i] = newId;
          }
        }
      }
    }
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
      (p) => this.isPlayerActive(p),
    );
  }

  /** Estimate total bracket rounds for N players. */
  private _estimateBracketRounds(playerCount: number): number {
    if (playerCount <= 1) return 0;
    return Math.ceil(Math.log2(playerCount));
  }

  private _tapCountPayload(cm: MatchState) {
    return {
      matchId: cm.matchId,
      player1Id: cm.player1Id,
      player1Taps: cm.player1Taps,
      player2Id: cm.player2Id,
      player2Taps: cm.player2Taps,
    };
  }

  private _flushLiveCountBroadcast(): void {
    const cm = this.currentMatch;
    if (!cm || cm.ended) {
      this.liveCountsDirty = false;
      return;
    }
    if (!this.liveCountsDirty) return;

    this.liveCountsDirty = false;
    this.broadcast("tap_counts", this._tapCountPayload(cm));
  }

  private _syncCurrentMatchToPlayer(sessionId: string): void {
    const cm = this.currentMatch;
    if (!cm || cm.ended) return;
    if (sessionId !== cm.player1Id && sessionId !== cm.player2Id) return;

    const player1 = this.room.state.players.get(cm.player1Id);
    const player2 = this.room.state.players.get(cm.player2Id);
    const endsAt = cm.startedAt + cm.durationMs;

    this.send(sessionId, "tap_match_start", {
      matchId: cm.matchId,
      player1Id: cm.player1Id,
      player1Name: player1?.name ?? "Unknown",
      player2Id: cm.player2Id,
      player2Name: player2?.name ?? "Unknown",
      bracketRound: this.room.state.currentRound,
    });
    this.send(sessionId, "tap_go", {
      durationMs: cm.durationMs,
      endsAt,
    });
    this.send(sessionId, "tap_confirmed", {
      tapCount: sessionId === cm.player1Id ? cm.player1Taps : cm.player2Taps,
    });
    this.send(sessionId, "tap_counts", this._tapCountPayload(cm));
  }

  /** Clear all live-match intervals. */
  private _clearMatchIntervals(): void {
    if (this.matchMonitorInterval) {
      clearInterval(this.matchMonitorInterval);
      this.matchMonitorInterval = null;
    }
    if (this.liveCountInterval) {
      clearInterval(this.liveCountInterval);
      this.liveCountInterval = null;
    }
    this.liveCountsDirty = false;
  }
}
