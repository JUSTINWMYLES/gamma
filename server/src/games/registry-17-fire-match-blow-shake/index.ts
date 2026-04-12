import { Client } from "@colyseus/core";
import { BaseGame } from "../BaseGame";
import { buildBracket, advanceBracket, resolveHeat } from "../../utils/bracket";
import { Heat } from "../../schema/BracketState";

const UPDATE_INTERVAL_MS = 250;

/**
 * The four sequential stages of the fire game.
 * Each player progresses through these independently.
 */
type FireStage = "strike" | "blow" | "shake" | "extinguish";

const STAGE_ORDER: FireStage[] = ["strike", "blow", "shake", "extinguish"];

interface StageConfig {
  /** Base target value (individual per player). */
  baseTarget: number;
  /** Extra target per round (0-indexed). */
  perRound: number;
  /** The accepted input action name(s). */
  actions: string[];
  /** Base gain per input. */
  baseGain: number;
  /** For extinguish: progress is inverted (fire level starts high, must reach 0). */
  invertedProgress: boolean;
}

const STAGE_CONFIGS: Record<FireStage, StageConfig> = {
  strike: {
    baseTarget: 12,
    perRound: 3,
    actions: ["fire_strike"],
    baseGain: 1,
    invertedProgress: false,
  },
  blow: {
    baseTarget: 18,
    perRound: 4,
    actions: ["fire_blow"],
    baseGain: 1,
    invertedProgress: false,
  },
  shake: {
    baseTarget: 50,
    perRound: 10,
    actions: ["fire_shake"],
    baseGain: 3,
    invertedProgress: false,
  },
  extinguish: {
    baseTarget: 30,
    perRound: 8,
    actions: ["fire_tap"],
    baseGain: 1,
    invertedProgress: true,
  },
};

/** Per-player state tracking their individual progression through stages. */
interface PlayerProgress {
  /** Current stage index (0-3). 4 = finished all stages. */
  stageIndex: number;
  /** Accumulated input toward current stage target. */
  current: number;
  /** Target for current stage. */
  target: number;
  /** Total contribution across all stages (for scoring). */
  totalContribution: number;
  /** Whether this player finished all 4 stages. */
  finished: boolean;
  /** Timestamp when they finished (for ranking). */
  finishedAt: number;
}

export default class FireMatchBlowShakeGame extends BaseGame {
  static override requiresTV = false;
  static override supportsBracket = true;
  static override defaultRoundCount = 3;
  static override minRounds = 1;
  static override maxRounds = 6;
  static override hasInstructionsPhase = true;
  static override instructionsDelivery = "broadcast" as const;

  static override activityLevel: "none" | "some" | "full" = "some";
  static override requiresSameRoom = false;
  static override requiresSecondaryDisplay = false;

  /** Per-player progress, keyed by sessionId. */
  private playerProgress = new Map<string, PlayerProgress>();

  /** Per-round results for scoring. */
  private roundResults = new Map<
    number,
    { playerResults: { playerId: string; finished: boolean; stagesCompleted: number; totalContribution: number; finishedAt: number }[] }
  >();

  /** The single game timer interval. */
  private updateTimer: ReturnType<typeof setInterval> | null = null;
  private roundResolve: (() => void) | null = null;
  private roundEndAt = 0;

  /** Seed for bracket randomization. */
  private bracketSeed = 0;

  protected override async onLoad(): Promise<void> {
    for (const p of this.room.state.players.values()) {
      p.score = 0;
      p.isReady = false;
      p.isEliminated = false;
    }

    this.bracketSeed = Date.now();

    // If bracket mode, build the bracket
    if (this.room.state.gameConfig.matchMode === "1v1_bracket") {
      const playerIds = this._activePlayers().map((p) => p.id);
      // Use 3-player heats for bracket play (good balance of speed vs competition)
      const heatSize = playerIds.length <= 6 ? 2 : 3;
      const bracket = buildBracket(playerIds, this.bracketSeed, { heatSize, advanceCount: 1 });
      this.room.state.bracket = bracket;
    }
  }

  /**
   * Override runRounds for bracket mode.
   * All players in the current bracket round play the same round simultaneously.
   * After scoring, each heat is resolved by ranking its members, and top finisher(s) advance.
   */
  protected override async runRounds(): Promise<void> {
    if (this.room.state.gameConfig.matchMode !== "1v1_bracket") {
      // FFA mode — use the default round loop from BaseGame
      return super.runRounds();
    }

    const bracket = this.room.state.bracket;

    if (this.hasPracticeRound()) {
      await this._runBracketPracticeRound();
    }

    this.broadcast("bracket_init", {
      totalPlayers: this._activePlayers().length,
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
        // Collect advancers
        const advancers: string[] = [];
        for (const h of currentBracketRound.heats) {
          for (const aid of h.advancingIds) {
            if (aid) advancers.push(aid);
          }
        }

        if (advancers.length <= 1) break; // Tournament complete

        // Mark non-advancers as eliminated
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

      // Mark all pending heats as in_progress
      for (const h of pendingHeats) {
        h.status = "in_progress";
      }

      // Run a normal round — all active (non-eliminated) players play simultaneously
      this.setPhase("countdown");
      await this.delay(3000);

      this.setPhase("in_round");
      this.room.state.phaseStartedAt = Date.now();
      await this.delay(500);

      await this.runRound(bracketRoundNum);
      this.scoreRound(bracketRoundNum);

      // Now resolve each heat based on round results
      for (const heat of pendingHeats) {
        const heatPlayerIds = [...heat.playerIds].filter((id): id is string => !!id);
        // Rank players in this heat by their round performance
        const ranked = this._rankPlayersForBracket(heatPlayerIds);

        if (ranked.length > 0) {
          // Top player(s) advance (advanceCount from bracket config, default 1)
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

    // Apply final eliminations
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

  protected override async runRound(round: number): Promise<void> {
    const players = this._activePlayers();
    if (players.length < 1) {
      this.broadcast("fire_timeout", { reason: "No active players" });
      return;
    }

    // Compute per-stage targets for this round.
    const stageTargets = STAGE_ORDER.map((stage) => {
      const cfg = STAGE_CONFIGS[stage];
      return Math.round(cfg.baseTarget + (round - 1) * cfg.perRound);
    });

    // Initialize per-player progress.
    this.playerProgress.clear();
    for (const p of players) {
      this.playerProgress.set(p.id, {
        stageIndex: 0,
        current: 0,
        target: stageTargets[0],
        totalContribution: 0,
        finished: false,
        finishedAt: 0,
      });
    }

    // Total time limit: use the configured timeLimitSecs from game config.
    // Default is typically 60s, but host can set 10-120.
    const totalDurationMs = this.room.state.gameConfig.timeLimitSecs * 1000;
    const startedAt = Date.now();
    this.roundEndAt = startedAt + totalDurationMs;

    // Broadcast round start with per-player initial state.
    this.broadcast("fire_round_start", {
      round,
      totalStages: STAGE_ORDER.length,
      stages: STAGE_ORDER,
      stageTargets,
      totalDurationMs,
      serverTimestamp: startedAt,
      players: players.map((p) => ({
        playerId: p.id,
        playerName: p.name,
        stageIndex: 0,
        stage: STAGE_ORDER[0],
        current: 0,
        target: stageTargets[0],
        finished: false,
      })),
    });

    // Wait for either all players to finish or time to run out.
    await new Promise<void>((resolve) => {
      this.roundResolve = resolve;

      this.updateTimer = setInterval(() => {
        this._broadcastUpdate(stageTargets);

        // Check: all players finished?
        const allFinished = [...this.playerProgress.values()].every((pp) => pp.finished);
        if (allFinished) {
          this._endRound(round, stageTargets, true);
          return;
        }

        // Check: time's up?
        if (Date.now() >= this.roundEndAt) {
          this._endRound(round, stageTargets, false);
          return;
        }
      }, UPDATE_INTERVAL_MS);

      // Safety net timeout.
      this.delay(totalDurationMs + 2000).then(() => {
        if (this.roundResolve) {
          this._endRound(round, stageTargets, false);
        }
      });
    });

    await this.delay(2000);
  }

  protected override scoreRound(round: number): void {
    const result = this.roundResults.get(round);
    if (!result) return;

    // Sort by: finished first (by finishedAt), then by stagesCompleted desc, then by totalContribution desc.
    const sorted = [...result.playerResults].sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished && b.finished) return a.finishedAt - b.finishedAt;
      if (a.stagesCompleted !== b.stagesCompleted) return b.stagesCompleted - a.stagesCompleted;
      return b.totalContribution - a.totalContribution;
    });

    const players = this._activePlayers();
    for (let rank = 0; rank < sorted.length; rank++) {
      const pr = sorted[rank];
      const player = players.find((p) => p.id === pr.playerId);
      if (!player) continue;

      // Points: completion bonus + rank bonus + effort bonus
      const completionBonus = pr.finished ? 100 : pr.stagesCompleted * 20;
      const rankBonus = Math.max(0, (sorted.length - rank) * 15);
      const effortBonus = Math.min(30, Math.round(pr.totalContribution / 5));
      player.score += completionBonus + rankBonus + effortBonus;
    }
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

    const input = data as {
      action?: string;
      power?: number;
      magnitude?: number;
      amplitude?: number;
    };
    if (!input?.action) return;

    const player = this.room.state.players.get(client.sessionId);
    if (!player || !player.isConnected || player.isEliminated) return;

    const pp = this.playerProgress.get(client.sessionId);
    if (!pp || pp.finished) return;

    const stageIdx = pp.stageIndex;
    if (stageIdx >= STAGE_ORDER.length) return;

    const stage = STAGE_ORDER[stageIdx];
    const cfg = STAGE_CONFIGS[stage];

    // Only accept actions valid for the player's current stage.
    if (!cfg.actions.includes(input.action)) return;
    if (stage === "blow" && !this.hasMicPermission(player)) return;
    if (stage === "shake" && !this.hasMotionPermission(player)) return;

    let gain = 0;

    switch (input.action) {
      case "fire_strike":
        gain = cfg.baseGain;
        break;
      case "fire_blow": {
        const amp = Number.isFinite(input.amplitude)
          ? Math.max(0.3, Math.min(3, input.amplitude as number))
          : 1;
        gain = Math.round(cfg.baseGain * amp);
        break;
      }
      case "fire_shake": {
        const mag = Number.isFinite(input.magnitude)
          ? Math.max(0.5, Math.min(3, input.magnitude as number))
          : 1;
        gain = Math.round(cfg.baseGain * mag);
        break;
      }
      case "fire_tap":
        gain = cfg.baseGain;
        break;
    }

    if (gain <= 0) return;

    pp.current += gain;
    pp.totalContribution += gain;

    // Check if player completed their current stage.
    const completed = cfg.invertedProgress
      ? pp.current >= pp.target   // For extinguish: current >= target means fire is out
      : pp.current >= pp.target;

    if (completed) {
      // Send per-player stage completion.
      this.send(client.sessionId, "fire_player_stage_complete", {
        stage,
        stageIndex: stageIdx,
      });
      // Also broadcast so TV can update.
      this.broadcast("fire_player_advanced", {
        playerId: client.sessionId,
        playerName: player.name,
        completedStage: stage,
        completedStageIndex: stageIdx,
        newStageIndex: stageIdx + 1,
        newStage: stageIdx + 1 < STAGE_ORDER.length ? STAGE_ORDER[stageIdx + 1] : null,
      });

      // Advance to next stage.
      pp.stageIndex = stageIdx + 1;
      pp.current = 0;

      if (pp.stageIndex >= STAGE_ORDER.length) {
        // Player finished all stages!
        pp.finished = true;
        pp.finishedAt = Date.now();
        this.send(client.sessionId, "fire_player_finished", {});
        this.broadcast("fire_player_done", {
          playerId: client.sessionId,
          playerName: player.name,
        });
      } else {
        // Set target for next stage — we need the stageTargets. Compute inline.
        const round = this.room.state.isPracticeRound
          ? 1
          : Math.max(1, this.room.state.currentRound);
        const nextStage = STAGE_ORDER[pp.stageIndex];
        const nextCfg = STAGE_CONFIGS[nextStage];
        pp.target = Math.round(nextCfg.baseTarget + (round - 1) * nextCfg.perRound);
      }
    }
  }

  override teardown(): void {
    super.teardown();
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
    this.playerProgress.clear();
    this.roundResults.clear();
    this.roundResolve = null;
  }

  override onPlayerReconnected(oldId: string, newId: string, _client: Client): void {
    const pp = this.playerProgress.get(oldId);
    if (pp) {
      this.playerProgress.delete(oldId);
      this.playerProgress.set(newId, pp);
    }
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private _activePlayers() {
    return [...this.room.state.players.values()].filter(
      (p) => this.isPlayerActive(p) && this.hasMicPermission(p) && this.hasMotionPermission(p),
    );
  }

  /**
   * Rank players within a heat by their round performance.
   * Uses the playerProgress map: finished first (by finishedAt), then by
   * stagesCompleted desc, then by totalContribution desc.
   */
  private _rankPlayersForBracket(
    playerIds: string[],
  ): { playerId: string; rank: number }[] {
    const results = playerIds.map((pid) => {
      const pp = this.playerProgress.get(pid);
      return {
        playerId: pid,
        finished: pp?.finished ?? false,
        stagesCompleted: pp ? Math.min(pp.stageIndex, STAGE_ORDER.length) : 0,
        totalContribution: pp?.totalContribution ?? 0,
        finishedAt: pp?.finishedAt ?? Infinity,
      };
    });

    results.sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished && b.finished) return a.finishedAt - b.finishedAt;
      if (a.stagesCompleted !== b.stagesCompleted)
        return b.stagesCompleted - a.stagesCompleted;
      return b.totalContribution - a.totalContribution;
    });

    return results.map((r, i) => ({ playerId: r.playerId, rank: i + 1 }));
  }

  private _broadcastUpdate(stageTargets: number[]): void {
    const timeLeftMs = Math.max(0, this.roundEndAt - Date.now());
    const playerStates = [...this.playerProgress.entries()].map(([pid, pp]) => {
      const player = this.room.state.players.get(pid);
      const stage = pp.stageIndex < STAGE_ORDER.length ? STAGE_ORDER[pp.stageIndex] : null;
      const cfg = stage ? STAGE_CONFIGS[stage] : null;
      return {
        playerId: pid,
        playerName: player?.name ?? "???",
        stageIndex: pp.stageIndex,
        stage,
        current: pp.current,
        target: pp.target,
        totalContribution: pp.totalContribution,
        finished: pp.finished,
        invertedProgress: cfg?.invertedProgress ?? false,
      };
    });

    this.broadcast("fire_update", {
      timeLeftMs,
      players: playerStates,
    });
  }

  private _endRound(round: number, stageTargets: number[], allFinished: boolean): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }

    // Final update.
    this._broadcastUpdate(stageTargets);

    const playerResults = [...this.playerProgress.entries()].map(([pid, pp]) => ({
      playerId: pid,
      finished: pp.finished,
      stagesCompleted: Math.min(pp.stageIndex, STAGE_ORDER.length),
      totalContribution: pp.totalContribution,
      finishedAt: pp.finishedAt,
    }));

    this.roundResults.set(round, { playerResults });

    this.broadcast("fire_round_end", {
      allFinished,
      playerResults: playerResults.map((pr) => {
        const player = this.room.state.players.get(pr.playerId);
        return {
          ...pr,
          playerName: player?.name ?? "???",
        };
      }),
    });

    if (this.roundResolve) {
      this.roundResolve();
      this.roundResolve = null;
    }
  }
}
