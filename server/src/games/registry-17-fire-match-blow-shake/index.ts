import { Client } from "@colyseus/core";
import { BaseGame } from "../BaseGame";

const UPDATE_INTERVAL_MS = 200;

/**
 * The four sequential stages of the fire game.
 * Each stage has its own input mechanic, target threshold, and duration.
 */
type FireStage = "strike" | "blow" | "shake" | "extinguish";

const STAGE_ORDER: FireStage[] = ["strike", "blow", "shake", "extinguish"];

interface StageConfig {
  /** Base target value (scaled by player count / round). */
  baseTarget: number;
  /** How much to add per player. */
  perPlayer: number;
  /** How much to add per round (0-indexed). */
  perRound: number;
  /** Duration in seconds for this stage. */
  durationSecs: number;
  /** The accepted input action name(s). */
  actions: string[];
  /** Base gain per input. */
  baseGain: number;
  /** For extinguish: the fire starts at this value and must be brought to 0. */
  invertedProgress: boolean;
}

const STAGE_CONFIGS: Record<FireStage, StageConfig> = {
  strike: {
    baseTarget: 15,
    perPlayer: 5,
    perRound: 3,
    durationSecs: 10,
    actions: ["fire_strike"],
    baseGain: 1,
    invertedProgress: false,
  },
  blow: {
    baseTarget: 25,
    perPlayer: 8,
    perRound: 5,
    durationSecs: 12,
    actions: ["fire_blow"],
    baseGain: 1,
    invertedProgress: false,
  },
  shake: {
    baseTarget: 80,
    perPlayer: 25,
    perRound: 15,
    durationSecs: 25,
    actions: ["fire_shake"],
    baseGain: 3,
    invertedProgress: false,
  },
  extinguish: {
    baseTarget: 45,
    perPlayer: 15,
    perRound: 10,
    durationSecs: 15,
    actions: ["fire_tap"],
    baseGain: 1,
    invertedProgress: true,
  },
};

interface FireRoundState {
  stage: FireStage;
  stageIndex: number;
  target: number;
  current: number;
  /** For extinguish: the fire level starts high and must reach 0. */
  fireLevel: number;
  startedAt: number;
  endAt: number;
  success: boolean;
  contributions: Map<string, number>;
  resolve: (() => void) | null;
  updateTimer: ReturnType<typeof setInterval> | null;
}

export default class FireMatchBlowShakeGame extends BaseGame {
  static override requiresTV = false;
  static override supportsBracket = false;
  static override defaultRoundCount = 3;
  static override minRounds = 1;
  static override maxRounds = 6;
  static override hasInstructionsPhase = true;
  static override instructionsDelivery = "broadcast" as const;

  static override activityLevel: "none" | "some" | "full" = "some";
  static override requiresSameRoom = false;
  static override requiresSecondaryDisplay = false;

  private roundState: FireRoundState | null = null;
  private roundResultByNumber = new Map<
    number,
    { success: boolean; contributions: Record<string, number> }
  >();

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
      this.broadcast("fire_timeout", {
        reason: "No active players",
        stage: "strike",
        achieved: 0,
        target: 0,
      });
      return;
    }

    // Aggregate contributions across all stages for this round.
    const roundContributions = new Map<string, number>(
      players.map((p) => [p.id, 0]),
    );

    // Broadcast round start so clients know a new round is beginning.
    this.broadcast("fire_round_start", {
      round,
      totalStages: STAGE_ORDER.length,
      stages: STAGE_ORDER,
      players: players.map((p) => ({ playerId: p.id, playerName: p.name })),
    });

    let allStagesSucceeded = true;

    for (let si = 0; si < STAGE_ORDER.length; si++) {
      const stage = STAGE_ORDER[si];
      const cfg = STAGE_CONFIGS[stage];
      const target = Math.round(
        cfg.baseTarget + players.length * cfg.perPlayer + (round - 1) * cfg.perRound,
      );
      const durationMs = cfg.durationSecs * 1000;
      const startedAt = Date.now();

      this.roundState = {
        stage,
        stageIndex: si,
        target,
        current: 0,
        fireLevel: cfg.invertedProgress ? target : 0,
        startedAt,
        endAt: startedAt + durationMs,
        success: false,
        contributions: new Map(players.map((p) => [p.id, 0])),
        resolve: null,
        updateTimer: null,
      };

      // Broadcast stage start.
      this.broadcast("fire_stage_start", {
        stage,
        stageIndex: si,
        totalStages: STAGE_ORDER.length,
        target,
        durationMs,
        serverTimestamp: startedAt,
        invertedProgress: cfg.invertedProgress,
      });

      // Wait for stage to complete or time out.
      const stageSuccess = await new Promise<boolean>((resolve) => {
        if (!this.roundState) return resolve(false);
        this.roundState.resolve = () => resolve(this.roundState?.success ?? false);

        this.roundState.updateTimer = setInterval(() => {
          if (!this.roundState) return;
          this._broadcastStageUpdate();
          if (Date.now() >= this.roundState.endAt) {
            this._finishStage(false);
          }
        }, UPDATE_INTERVAL_MS);

        this.delay(durationMs + 1500).then(() => {
          if (this.roundState && !this.roundState.success) {
            this._finishStage(false);
          }
        });
      });

      // Merge stage contributions into round contributions.
      if (this.roundState) {
        for (const [pid, c] of this.roundState.contributions) {
          roundContributions.set(pid, (roundContributions.get(pid) ?? 0) + c);
        }
      }

      if (!stageSuccess) {
        allStagesSucceeded = false;
        // On stage failure, still move to next stage but broadcast failure.
      }

      // Brief pause between stages.
      if (si < STAGE_ORDER.length - 1) {
        await this.delay(1500);
      }
    }

    // Round complete -- broadcast final result.
    const payload = {
      success: allStagesSucceeded,
      standings: players.map((p) => ({
        playerId: p.id,
        playerName: p.name,
        contribution: roundContributions.get(p.id) ?? 0,
      })),
    };

    this.broadcast(allStagesSucceeded ? "fire_round_success" : "fire_round_done", payload);

    this.roundResultByNumber.set(round, {
      success: allStagesSucceeded,
      contributions: Object.fromEntries(roundContributions.entries()),
    });

    this.roundState = null;
    await this.delay(2000);
  }

  protected override scoreRound(round: number): void {
    const result = this.roundResultByNumber.get(round);
    if (!result) return;

    const entries = Object.entries(result.contributions);
    const total = entries.reduce((sum, [, v]) => sum + v, 0);

    for (const p of this._activePlayers()) {
      const contrib = result.contributions[p.id] ?? 0;
      const share = total > 0 ? contrib / total : 0;
      const effortPoints = Math.round(share * 120);
      const participation = contrib > 0 ? 20 : 0;
      const successBonus = result.success ? 80 : 0;
      p.score += participation + effortPoints + successBonus;
    }
  }

  override handleInput(client: Client, data: unknown): void {
    if (this.room.state.phase !== "in_round") return;
    if (!this.roundState) return;

    const input = data as {
      action?: string;
      power?: number;
      magnitude?: number;
      amplitude?: number;
    };
    if (!input?.action) return;

    const player = this.room.state.players.get(client.sessionId);
    if (!player || !player.isConnected || player.isEliminated) return;

    const cfg = STAGE_CONFIGS[this.roundState.stage];

    // Only accept actions valid for the current stage.
    if (!cfg.actions.includes(input.action)) return;

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

    const currentPlayer = this.roundState.contributions.get(player.id) ?? 0;
    this.roundState.contributions.set(player.id, currentPlayer + gain);
    this.roundState.current += gain;

    if (cfg.invertedProgress) {
      this.roundState.fireLevel = Math.max(
        0,
        this.roundState.target - this.roundState.current,
      );
      if (this.roundState.fireLevel <= 0) {
        this._finishStage(true);
      }
    } else {
      if (this.roundState.current >= this.roundState.target) {
        this._finishStage(true);
      }
    }
  }

  override teardown(): void {
    super.teardown();
    if (this.roundState?.updateTimer) {
      clearInterval(this.roundState.updateTimer);
    }
    this.roundState = null;
    this.roundResultByNumber.clear();
  }

  private _activePlayers() {
    return [...this.room.state.players.values()].filter(
      (p) => p.isConnected && !p.isEliminated,
    );
  }

  private _broadcastStageUpdate(): void {
    if (!this.roundState) return;
    const cfg = STAGE_CONFIGS[this.roundState.stage];
    const standings = this._activePlayers().map((p) => ({
      playerId: p.id,
      playerName: p.name,
      contribution: this.roundState?.contributions.get(p.id) ?? 0,
    }));

    this.broadcast("fire_stage_update", {
      stage: this.roundState.stage,
      stageIndex: this.roundState.stageIndex,
      current: this.roundState.current,
      target: this.roundState.target,
      fireLevel: cfg.invertedProgress
        ? this.roundState.fireLevel
        : this.roundState.current,
      timeLeftMs: Math.max(0, this.roundState.endAt - Date.now()),
      standings,
      invertedProgress: cfg.invertedProgress,
    });
  }

  private _finishStage(success: boolean): void {
    if (!this.roundState) return;
    if (this.roundState.updateTimer) {
      clearInterval(this.roundState.updateTimer);
      this.roundState.updateTimer = null;
    }

    this.roundState.success = success;
    this._broadcastStageUpdate();

    const payload = {
      stage: this.roundState.stage,
      stageIndex: this.roundState.stageIndex,
      success,
      achieved: this.roundState.current,
      target: this.roundState.target,
    };

    this.broadcast("fire_stage_end", payload);

    if (this.roundState.resolve) {
      this.roundState.resolve();
      this.roundState.resolve = null;
    }
  }
}
