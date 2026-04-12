/**
 * server/src/games/registry-19-shave-the-yak/index.ts
 *
 * "Shave The Yak" — 20-second swipe mini-game.
 *
 * Game Rules
 * ──────────
 * • Each player sees a cartoon yak on their phone.
 * • They swipe ON the yak to shave fur; every on-target swipe increments a
 *   pixel mask that tracks how much fur has been removed.
 * • Off-target swipes (outside the yak bounds) nudge the yak — translating
 *   and slightly rotating it — making the shave area harder to hit.
 * • Consecutive on-target swipes build a combo multiplier.
 * • After 20 s the round ends; the server computes each player's shaved %
 *   and assigns a score + letter rank.
 *
 * Swipe protocol (client → server)
 * ─────────────────────────────────
 * {
 *   action : "swipe",
 *   x1, y1 : swipe start in yak-canvas coordinates (0–YAK_W, 0–YAK_H)
 *   x2, y2 : swipe end   in yak-canvas coordinates
 *   onTarget: boolean   — true if both endpoints are inside the yak bounds
 *                         (client performs hit-test, server validates loosely)
 * }
 *
 * Broadcast messages (server → all clients)
 * ──────────────────────────────────────────
 * "yak_nudge"    { playerId, dx, dy, dRotation }
 * "round_result" { results: RoundResult[], rankings: {playerId, rank, score}[] }
 */

import { Client } from "@colyseus/core";
import { BaseGame } from "../BaseGame";
import { buildBracket, advanceBracket, resolveHeat } from "../../utils/bracket";
import { Heat } from "../../schema/BracketState";
import {
  createYakMask,
  applySwipe,
  computeShavedPercent,
  computeScore,
  buildRoundResult,
  rankLeaderboard,
  assignRank,
  YakMask,
  RoundResult,
} from "./shavedPercent";

// ── Constants ──────────────────────────────────────────────────────────────

/** Default round duration (seconds) — matches the spec. */
const DEFAULT_ROUND_TIME_SECS = 20;

/** Yak canvas size (virtual pixels) — clients render to this coordinate space. */
export const YAK_W = 300;
export const YAK_H = 280;

/** How far an off-target swipe nudges the yak (pixels). */
const NUDGE_PX = 18;
/** Max rotation delta per off-target swipe (radians). */
const NUDGE_ROT = 0.12;
/** How many on-target swipes to max out the combo. */
const COMBO_MAX_CAP = 10;

// ── Input type ──────────────────────────────────────────────────────────────

interface SwipeInput {
  action: "swipe";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  onTarget: boolean;
}

// ── Per-player round state ──────────────────────────────────────────────────

interface PlayerRound {
  mask: YakMask;
  hits: number;
  misses: number;
  combo: number;
  comboMax: number;
  /** Current yak offset (pixels, broadcast to client). */
  yakOffsetX: number;
  yakOffsetY: number;
  /** Current yak rotation (radians, broadcast to client). */
  yakRotation: number;
}

// ── Game class ──────────────────────────────────────────────────────────────

export default class ShaveYakGame extends BaseGame {
  static override requiresTV = false;
  static override supportsBracket = true;
  static override defaultRoundCount = 1;
  static override minRounds = 1;
  static override maxRounds = 3;
  static override hasInstructionsPhase = true;
  static override instructionsDelivery = "broadcast" as const;

  static override activityLevel: "none" | "some" | "full" = "none";
  static override requiresSameRoom = false;
  static override requiresSecondaryDisplay = false;

  private playerRounds = new Map<string, PlayerRound>();
  private roundResolve: (() => void) | null = null;
  private roundTimer: ReturnType<typeof setTimeout> | null = null;
  /** Interval that broadcasts all-player progress to view_screen clients. */
  private progressInterval: ReturnType<typeof setInterval> | null = null;

  /** Seed for bracket randomization. */
  private bracketSeed = 0;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  protected override async onLoad(): Promise<void> {
    for (const p of this.room.state.players.values()) {
      p.isReady = false;
      p.isEliminated = false;
    }

    this.bracketSeed = Date.now();

    // If bracket mode, build the bracket
    if (this.room.state.gameConfig.matchMode === "1v1_bracket") {
      const playerIds = [...this.room.state.players.values()]
        .filter((p) => this.isPlayerActive(p))
        .map((p) => p.id);
      const heatSize = playerIds.length <= 6 ? 2 : 3;
      const bracket = buildBracket(playerIds, this.bracketSeed, { heatSize, advanceCount: 1 });
      this.room.state.bracket = bracket;
    }
  }

  /**
   * Override runRounds for bracket mode.
   * All players in the current bracket round play simultaneously.
   * After scoring, each heat is resolved by shaved percentage ranking.
   */
  protected override async runRounds(): Promise<void> {
    if (this.room.state.gameConfig.matchMode !== "1v1_bracket") {
      return super.runRounds();
    }

    const bracket = this.room.state.bracket;

    if (this.hasPracticeRound()) {
      await this._runBracketPracticeRound();
    }

    this.broadcast("bracket_init", {
      totalPlayers: [...this.room.state.players.values()].filter((p) => this.isPlayerActive(p)).length,
      heatSize: bracket.heatSize,
    });

    let bracketRoundNum = 0;

    while (true) {
      const currentBracketRound = bracket.rounds[bracket.currentRound];
      if (!currentBracketRound) break;

      const pendingHeats = currentBracketRound.heats.filter(
        (h: Heat) => h.status !== "complete",
      );

      if (pendingHeats.length === 0) {
        const advancers: string[] = [];
        for (const h of currentBracketRound.heats) {
          for (const aid of h.advancingIds) {
            if (aid) advancers.push(aid);
          }
        }

        if (advancers.length <= 1) break;

        for (const p of this.room.state.players.values()) {
          if (!p.isEliminated && !advancers.includes(p.id)) {
            p.isEliminated = true;
          }
        }

        advanceBracket(bracket, this.bracketSeed);

        this.broadcast("bracket_round_advance", {
          newRound: bracket.currentRound + 1,
          remainingPlayers: advancers.length,
        });

        await this.delay(3000);
        continue;
      }

      bracketRoundNum++;
      this.room.state.currentRound = bracketRoundNum;

      this.broadcast("bracket_heat_round", {
        bracketRound: bracket.currentRound + 1,
        heats: ([...currentBracketRound.heats] as Heat[]).map((h) => ({
          id: h.id,
          playerIds: [...h.playerIds],
          status: h.status,
        })),
      });

      for (const h of pendingHeats) {
        h.status = "in_progress";
      }

      this.setPhase("countdown");
      await this.delay(3000);

      this.setPhase("in_round");
      this.room.state.phaseStartedAt = Date.now();
      await this.delay(500);

      await this.runRound(bracketRoundNum);
      this.scoreRound(bracketRoundNum);

      // Resolve each heat by shaved percentage
      for (const heat of pendingHeats) {
        const heatPlayerIds = [...heat.playerIds].filter((id): id is string => !!id);
        const ranked = this._rankPlayersForBracket(heatPlayerIds);

        if (ranked.length > 0) {
          const advanceCount = bracket.advanceCount;
          const advancing = ranked.slice(0, advanceCount).map((r) => r.playerId);
          resolveHeat(heat, advancing);
        } else {
          heat.status = "complete";
        }
      }

      this.setPhase("round_end");
      await this.delay(4000);
    }

    const finalRound = bracket.rounds[bracket.currentRound];
    if (finalRound) {
      const champion = finalRound.heats[0]?.advancingIds[0];
      if (champion) {
        const champPlayer = this.room.state.players.get(champion);
        this.broadcast("bracket_champion", {
          championId: champion,
          championName: champPlayer?.name ?? "Unknown",
        });
      }
    }

    this.room.state.isPracticeRound = false;
    this.setPhase("scoreboard");
    await this.delay(6000);
  }

  protected override async runRound(_round: number): Promise<void> {
    this.playerRounds.clear();

    // Initialise a fresh fur mask for each player
    for (const p of this.room.state.players.values()) {
      if (!this.isPlayerActive(p)) continue;
      const mask = createYakMask(YAK_W, YAK_H);
      this.playerRounds.set(p.id, {
        mask,
        hits: 0,
        misses: 0,
        combo: 0,
        comboMax: 0,
        yakOffsetX: 0,
        yakOffsetY: 0,
        yakRotation: 0,
      });
    }

    const timeSecs = this.room.state.gameConfig.timeLimitSecs ?? DEFAULT_ROUND_TIME_SECS;

    // Broadcast all-player shave progress to view_screen clients every 500ms
    this.progressInterval = setInterval(() => {
      this._broadcastProgress();
    }, 500);

    await new Promise<void>((resolve) => {
      this.roundResolve = resolve;
      this.roundTimer = setTimeout(() => this._endRound(), timeSecs * 1000);
    });
  }

  protected override scoreRound(_round: number): void {
    const results: RoundResult[] = [];

    for (const [playerId, pr] of this.playerRounds) {
      const result = buildRoundResult(playerId, pr.mask, pr.hits, pr.misses, pr.comboMax);
      results.push(result);

      // Apply score to the persistent player state
      const player = this.room.state.players.get(playerId);
      if (player) {
        player.score += result.score;
      }
    }

    const ranked = rankLeaderboard(results);
    const rankings = ranked.map((r, i) => ({
      place: i + 1,
      playerId: r.playerId,
      playerName: this.room.state.players.get(r.playerId)?.name ?? r.playerId,
      rank: assignRank(r.shavedPercent),
      shavedPercent: r.shavedPercent,
      score: r.score,
      hits: r.hits,
      misses: r.misses,
      comboMax: r.comboMax,
    }));

    this.broadcast("round_result", { results, rankings });
  }

  private async _runBracketPracticeRound(): Promise<void> {
    this.room.state.currentRound = 0;
    this.room.state.isPracticeRound = true;

    this.setPhase("countdown");
    await this.delay(3000);

    this.setPhase("in_round");
    this.room.state.phaseStartedAt = Date.now();
    await this.delay(500);

    await this.runRound(1);

    this.setPhase("round_end");
    await this.delay(4000);

    this.room.state.isPracticeRound = false;
  }

  override handleInput(client: Client, data: unknown): void {
    if (this.room.state.phase !== "in_round") return;

    const pr = this.playerRounds.get(client.sessionId);
    if (!pr) return;

    const input = data as SwipeInput;
    if (input.action !== "swipe") return;

    const { x1, y1, x2, y2, onTarget } = input;

    if (onTarget) {
      // Validate the swipe coordinates are at least partially in bounds (loose check)
      const inBounds =
        x1 >= 0 && x1 <= YAK_W && y1 >= 0 && y1 <= YAK_H &&
        x2 >= 0 && x2 <= YAK_W && y2 >= 0 && y2 <= YAK_H;

      if (inBounds) {
        applySwipe(pr.mask, { x: x1, y: y1 }, { x: x2, y: y2 });
        pr.hits++;
        pr.combo++;
        pr.comboMax = Math.min(COMBO_MAX_CAP, Math.max(pr.comboMax, pr.combo));

        // Send live shave percentage update to the individual player
        const pct = computeShavedPercent(pr.mask);
        const score = computeScore(pct, pr.comboMax);
        client.send("shave_update", {
          shavedPercent: pct,
          score,
          combo: pr.combo,
          comboMax: pr.comboMax,
          yakOffsetX: pr.yakOffsetX,
          yakOffsetY: pr.yakOffsetY,
          yakRotation: pr.yakRotation,
        });
      } else {
        // Treat out-of-bounds claimed on-target as a miss
        this._handleMiss(client.sessionId, pr, x1, y1, x2, y2);
      }
    } else {
      this._handleMiss(client.sessionId, pr, x1, y1, x2, y2);
    }
  }

  override teardown(): void {
    super.teardown();
    this._clearProgressInterval();
    if (this.roundTimer) {
      clearTimeout(this.roundTimer);
      this.roundTimer = null;
    }
    this.playerRounds.clear();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Rank players within a heat by their shaved percentage (descending).
   * Uses the playerRounds map to compute shaved % for each player.
   */
  private _rankPlayersForBracket(
    playerIds: string[],
  ): { playerId: string; rank: number }[] {
    const results = playerIds.map((pid) => {
      const pr = this.playerRounds.get(pid);
      const pct = pr ? computeShavedPercent(pr.mask) : 0;
      return { playerId: pid, shavedPercent: pct };
    });

    results.sort((a, b) => b.shavedPercent - a.shavedPercent);

    return results.map((r, i) => ({ playerId: r.playerId, rank: i + 1 }));
  }

  private _handleMiss(
    sessionId: string,
    pr: PlayerRound,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ): void {
    pr.misses++;
    pr.combo = 0; // reset combo on miss

    // Compute nudge direction from swipe vector
    const sdx = x2 - x1;
    const sdy = y2 - y1;
    const len = Math.sqrt(sdx * sdx + sdy * sdy);

    let ndx = 0;
    let ndy = 0;
    let rot = 0;

    if (len > 0) {
      ndx = (sdx / len) * NUDGE_PX;
      ndy = (sdy / len) * NUDGE_PX;
      // Rotation: cross-product sign determines CW/CCW
      rot = (sdx * ndy - sdy * ndx) > 0 ? NUDGE_ROT : -NUDGE_ROT;
    } else {
      // Tap outside → small random-ish nudge based on position
      ndx = x1 > YAK_W / 2 ? NUDGE_PX / 2 : -NUDGE_PX / 2;
      ndy = y1 > YAK_H / 2 ? NUDGE_PX / 2 : -NUDGE_PX / 2;
      rot = NUDGE_ROT / 2;
    }

    // Update yak position (clamp so it doesn't wander too far off screen)
    pr.yakOffsetX = Math.max(-80, Math.min(80, pr.yakOffsetX + ndx));
    pr.yakOffsetY = Math.max(-80, Math.min(80, pr.yakOffsetY + ndy));
    pr.yakRotation = Math.max(-0.5, Math.min(0.5, pr.yakRotation + rot));

    // Notify the player's client of the yak nudge
    const client = [...(this.room.clients as Iterable<Client>)].find(
      (c) => c.sessionId === sessionId,
    );
    if (client) {
      client.send("yak_nudge", {
        dx: ndx,
        dy: ndy,
        dRotation: rot,
        yakOffsetX: pr.yakOffsetX,
        yakOffsetY: pr.yakOffsetY,
        yakRotation: pr.yakRotation,
      });
    }
  }

  /** Broadcast a snapshot of every player's shaving progress to all clients. */
  private _broadcastProgress(): void {
    const playerProgress: {
      playerId: string;
      playerName: string;
      shavedPercent: number;
      score: number;
      combo: number;
      comboMax: number;
    }[] = [];

    for (const [playerId, pr] of this.playerRounds) {
      const player = this.room.state.players.get(playerId);
      const pct = computeShavedPercent(pr.mask);
      const score = computeScore(pct, pr.comboMax);
      playerProgress.push({
        playerId,
        playerName: player?.name ?? playerId,
        shavedPercent: pct,
        score,
        combo: pr.combo,
        comboMax: pr.comboMax,
      });
    }

    this.broadcast("shave_progress_all", { players: playerProgress });
  }

  private _clearProgressInterval(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  private _endRound(): void {
    this._clearProgressInterval();
    // Send one final progress snapshot before resolving
    this._broadcastProgress();

    if (this.roundResolve) {
      this.roundResolve();
      this.roundResolve = null;
    }
    this.roundTimer = null;
  }
}
