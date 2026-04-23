import { Client } from "@colyseus/core";
import { BaseGame } from "../BaseGame";
import {
  buildBracket,
  advanceBracket,
  estimateBracketRounds,
  getMatchPlayers,
  resolveHeat1v1,
} from "../../utils/bracket";
import { Heat } from "../../schema/BracketState";
import {
  OrientationSnapshot,
  normalizeOrientation,
  pickDeterministicWinner,
  validateShotPose,
} from "./westernStandoffLogic";

const MATCH_PREVIEW_MS = 10_000;
const CALIBRATION_TIMEOUT_MS = 20_000;
const PACE_COUNTDOWN_SECONDS = 3;
const LIVE_DUEL_TIMEOUT_MS = 12_000;
const LIVE_TICK_MS = 200;
const INTER_MATCH_DELAY_MS = 3_000;
const BRACKET_ROUND_DELAY_MS = 4_000;
const MATCH_RESULT_DELAY_MS = 4_000;
const MATCH_WIN_POINTS = 1;

type MatchStage = "preview" | "calibrating" | "countdown" | "live" | "resolved";
type MatchResolutionReason = "shot" | "disconnect" | "timeout";

interface MatchState {
  matchId: string;
  player1Id: string;
  player2Id: string;
  bracketRound: number;
  isPractice: boolean;
  stage: MatchStage;
  calibrations: Map<string, OrientationSnapshot>;
  readyPlayerIds: Set<string>;
  drawAt: number;
  ended: boolean;
  winnerId: string;
  loserId: string;
  shooterId: string;
  reactionMs: number;
  resolutionReason: MatchResolutionReason | "";
  timeoutSeed: number;
}

interface MatchOutcome {
  winnerId: string;
  loserId: string;
  shooterId: string;
  reactionMs: number;
  reason: MatchResolutionReason;
  isPractice: boolean;
}

interface WesternStandoffInput {
  action?: string;
  alpha?: number;
  beta?: number;
  gamma?: number;
}

interface DuelOptions {
  matchId: string;
  player1Id: string;
  player2Id: string;
  player1Name: string;
  player2Name: string;
  bracketRound: number;
  isPractice: boolean;
}

export default class WesternStandoffGame extends BaseGame {
  static override requiresTV = true;
  static override supportsBracket = true;
  static override defaultRoundCount = 1;
  static override minRounds = 1;
  static override maxRounds = 1;
  static override hasInstructionsPhase = true;
  static override instructionsDelivery = "broadcast" as const;

  static override activityLevel: "none" | "some" | "full" = "some";
  static override requiresSameRoom = true;
  static override requiresSecondaryDisplay = true;

  private currentMatch: MatchState | null = null;
  private pendingScores = new Map<string, number>();
  private bracketSeed = 0;

  private liveMonitorInterval: ReturnType<typeof setInterval> | null = null;
  private liveResolutionTimeout: ReturnType<typeof setTimeout> | null = null;
  private matchResolve: (() => void) | null = null;
  private calibrationResolve: (() => void) | null = null;
  private extraTimers: ReturnType<typeof setTimeout>[] = [];

  protected override async onLoad(): Promise<void> {
    for (const player of this.room.state.players.values()) {
      player.score = 0;
      player.isReady = false;
      player.isEliminated = false;
      player.currentMatchOpponentId = "";
    }

    this.room.state.gameConfig.matchMode = "1v1_bracket";
    this.bracketSeed = Date.now();

    const playerIds = this._activePlayers().map((player) => player.id);
    this.room.state.bracket = buildBracket(playerIds, this.bracketSeed);
  }

  protected override async runRounds(): Promise<void> {
    const activePlayers = this._activePlayers();

    this.setPhase("in_round");
    this.room.state.phaseStartedAt = Date.now();
    await this.delay(500);

    if (activePlayers.length < 2) {
      this.broadcast("round_skipped", { reason: "Not enough connected players (need 2+)" });
      this.room.state.isPracticeRound = false;
      this.setPhase("scoreboard");
      await this.delay(6000);
      return;
    }

    this.broadcast("standoff_bracket_init", {
      totalPlayers: activePlayers.length,
      totalRounds: estimateBracketRounds(activePlayers.length, 2, 1),
    });

    await this.delay(2000);

    if (this.hasPracticeRound()) {
      await this._runPracticeDuel();
      if (this.isCancelled()) return;
      this.room.state.isPracticeRound = false;
    }

    const bracket = this.room.state.bracket;

    while (true) {
      const currentBracketRound = bracket.rounds[bracket.currentRound];
      if (!currentBracketRound) break;

      const pendingHeats = currentBracketRound.heats.filter((heat: Heat) => heat.status !== "complete");

      if (pendingHeats.length === 0) {
        const advancers: string[] = [];
        for (const heat of currentBracketRound.heats) {
          for (const playerId of heat.advancingIds) {
            if (playerId) advancers.push(playerId);
          }
        }

        if (advancers.length <= 1) break;

        advanceBracket(bracket, this.bracketSeed);
        this.broadcast("standoff_bracket_round_advance", {
          newRound: bracket.currentRound + 1,
          remainingPlayers: advancers.length,
        });
        await this.delay(BRACKET_ROUND_DELAY_MS);
        continue;
      }

      for (const heat of pendingHeats) {
        const [player1Id, player2Id] = getMatchPlayers(heat);
        if (!player1Id || !player2Id) continue;

        const player1 = this.room.state.players.get(player1Id);
        const player2 = this.room.state.players.get(player2Id);
        if (!player1 || !player2) continue;

        this.room.state.currentRound = bracket.currentRound + 1;
        player1.currentMatchOpponentId = player2Id;
        player2.currentMatchOpponentId = player1Id;
        heat.status = "in_progress";

        const outcome = await this._runDuel({
          matchId: heat.id,
          player1Id,
          player2Id,
          player1Name: player1.name,
          player2Name: player2.name,
          bracketRound: bracket.currentRound + 1,
          isPractice: false,
        });

        if (this.isCancelled()) return;

        resolveHeat1v1(heat, outcome.winnerId);
        this._addScore(outcome.winnerId, MATCH_WIN_POINTS);

        const loser = this.room.state.players.get(outcome.loserId);
        if (loser) loser.isEliminated = true;

        player1.currentMatchOpponentId = "";
        player2.currentMatchOpponentId = "";
        this.currentMatch = null;

        await this.delay(MATCH_RESULT_DELAY_MS);

        const remaining = currentBracketRound.heats.filter((candidate: Heat) => candidate.status !== "complete");
        if (remaining.length > 0) {
          await this.delay(INTER_MATCH_DELAY_MS);
        }
      }
    }

    const finalRound = bracket.rounds[bracket.currentRound];
    const finalHeat = finalRound?.heats[0];
    const championId = finalHeat?.advancingIds[0] ?? "";
    const [finalPlayer1Id, finalPlayer2Id] = finalHeat ? getMatchPlayers(finalHeat) : ["", ""];
    const runnerUpId = championId === finalPlayer1Id ? finalPlayer2Id : finalPlayer1Id;

    if (championId) {
      this.broadcast("standoff_tournament_complete", {
        championId,
        championName: this.room.state.players.get(championId)?.name ?? "Unknown",
        runnerUpId: runnerUpId ?? "",
        runnerUpName: runnerUpId ? this.room.state.players.get(runnerUpId)?.name ?? "" : "",
      });
    }

    this._applyScores();

    this.room.state.isPracticeRound = false;
    this.setPhase("scoreboard");
    await this.delay(6000);
  }

  protected override async runRound(_round: number): Promise<void> {
    // Bracket-driven game; runRounds() owns the full flow.
  }

  protected override scoreRound(_round: number): void {
    // Scores are accumulated per duel and applied once at tournament end.
  }

  override handleInput(client: Client, data: unknown): void {
    const input = data as WesternStandoffInput;
    if (!input?.action) return;

    switch (input.action) {
      case "standoff_calibrate_done":
        this._handleCalibration(client, input);
        break;
      case "standoff_shoot":
        this._handleShoot(client, input);
        break;
    }
  }

  override teardown(): void {
    super.teardown();
    this._clearLiveMonitor();
    this._clearLiveResolutionTimeout();
    for (const timer of this.extraTimers) clearTimeout(timer);
    this.extraTimers = [];
    this.matchResolve = null;
    this.calibrationResolve = null;
    this.currentMatch = null;
    this.pendingScores.clear();
  }

  override onPlayerReconnected(oldId: string, newId: string, _client: Client): void {
    const match = this.currentMatch;
    if (match) {
      if (match.player1Id === oldId) match.player1Id = newId;
      if (match.player2Id === oldId) match.player2Id = newId;
      if (match.winnerId === oldId) match.winnerId = newId;
      if (match.loserId === oldId) match.loserId = newId;
      if (match.shooterId === oldId) match.shooterId = newId;

      const calibration = match.calibrations.get(oldId);
      if (calibration) {
        match.calibrations.delete(oldId);
        match.calibrations.set(newId, calibration);
      }

      if (match.readyPlayerIds.has(oldId)) {
        match.readyPlayerIds.delete(oldId);
        match.readyPlayerIds.add(newId);
      }
    }

    if (this.pendingScores.has(oldId)) {
      const score = this.pendingScores.get(oldId) ?? 0;
      this.pendingScores.delete(oldId);
      this.pendingScores.set(newId, (this.pendingScores.get(newId) ?? 0) + score);
    }

    this._replaceBracketPlayerId(oldId, newId);
  }

  private async _runPracticeDuel(): Promise<void> {
    const players = this._activePlayers();
    if (players.length < 2) return;

    const player1 = players[0];
    const player2 = players[1];
    if (!player1 || !player2) return;

    this.room.state.currentRound = 0;
    this.room.state.isPracticeRound = true;
    player1.currentMatchOpponentId = player2.id;
    player2.currentMatchOpponentId = player1.id;

    await this._runDuel({
      matchId: "practice-standoff",
      player1Id: player1.id,
      player2Id: player2.id,
      player1Name: player1.name,
      player2Name: player2.name,
      bracketRound: 0,
      isPractice: true,
    });

    player1.currentMatchOpponentId = "";
    player2.currentMatchOpponentId = "";
    this.currentMatch = null;
    await this.delay(MATCH_RESULT_DELAY_MS);
  }

  private async _runDuel(options: DuelOptions): Promise<MatchOutcome> {
    this.currentMatch = {
      matchId: options.matchId,
      player1Id: options.player1Id,
      player2Id: options.player2Id,
      bracketRound: options.bracketRound,
      isPractice: options.isPractice,
      stage: "preview",
      calibrations: new Map(),
      readyPlayerIds: new Set(),
      drawAt: 0,
      ended: false,
      winnerId: "",
      loserId: "",
      shooterId: "",
      reactionMs: 0,
      resolutionReason: "",
      timeoutSeed: this.bracketSeed + this._stringSeed(options.matchId),
    };

    this.broadcast("standoff_match_preview", {
      matchId: options.matchId,
      player1Id: options.player1Id,
      player1Name: options.player1Name,
      player2Id: options.player2Id,
      player2Name: options.player2Name,
      bracketRound: options.bracketRound,
      previewMs: MATCH_PREVIEW_MS,
      isPractice: options.isPractice,
      serverTimestamp: Date.now(),
    });

    await this.delay(MATCH_PREVIEW_MS);

    if (!this.currentMatch || this.currentMatch.ended) {
      return this.currentMatch ? this._matchOutcome(this.currentMatch) : this._fallbackOutcome(options);
    }

    this.currentMatch.stage = "calibrating";
    this.broadcast("standoff_calibrate_start", {
      matchId: options.matchId,
      timeoutMs: CALIBRATION_TIMEOUT_MS,
      totalCount: 2,
      isPractice: options.isPractice,
    });

    const calibrationPromise = this._waitForCalibration(CALIBRATION_TIMEOUT_MS);
    await calibrationPromise;

    if (!this.currentMatch) {
      return this._fallbackOutcome(options);
    }

    if (this.currentMatch.ended) {
      return this._matchOutcome(this.currentMatch);
    }

    this.currentMatch.stage = "countdown";
    this.broadcast("standoff_paces_countdown", {
      matchId: options.matchId,
      seconds: PACE_COUNTDOWN_SECONDS,
      isPractice: options.isPractice,
    });
    await this.delay(PACE_COUNTDOWN_SECONDS * 1000);

    if (!this.currentMatch) {
      return this._fallbackOutcome(options);
    }

    if (this.currentMatch.ended) {
      return this._matchOutcome(this.currentMatch);
    }

    this.currentMatch.stage = "live";
    this.currentMatch.drawAt = Date.now();
    this.room.state.roundDurationSecs = Math.ceil(LIVE_DUEL_TIMEOUT_MS / 1000);
    this.broadcast("standoff_draw", {
      matchId: options.matchId,
      timeoutMs: LIVE_DUEL_TIMEOUT_MS,
      serverTimestamp: this.currentMatch.drawAt,
      isPractice: options.isPractice,
    });

    await this._waitForLiveResolution(LIVE_DUEL_TIMEOUT_MS);

    return this.currentMatch ? this._matchOutcome(this.currentMatch) : this._fallbackOutcome(options);
  }

  private async _waitForCalibration(timeoutMs: number): Promise<void> {
    const match = this.currentMatch;
    if (!match) return;

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (this.calibrationResolve === finish) {
          this.calibrationResolve = null;
        }
        clearInterval(interval);
        clearTimeout(timeout);
        resolve();
      };

      this.calibrationResolve = finish;

      const interval = setInterval(() => {
        if (!this.currentMatch || this.currentMatch !== match) {
          finish();
          return;
        }

        if (match.ended || match.calibrations.size >= 2) {
          finish();
          return;
        }

        if (this._resolveDisconnectedMatch(match)) {
          finish();
        }
      }, LIVE_TICK_MS);

      const timeout = setTimeout(() => {
        if (!match.ended && match.calibrations.size < 2) {
          this._resolveCalibrationTimeout(match);
        }
        finish();
      }, timeoutMs);

      this.extraTimers.push(interval as unknown as ReturnType<typeof setTimeout>);
      this.extraTimers.push(timeout);
    });
  }

  private async _waitForLiveResolution(timeoutMs: number): Promise<void> {
    const match = this.currentMatch;
    if (!match) return;

    this._clearLiveResolutionTimeout();

    await new Promise<void>((resolve) => {
      this.matchResolve = resolve;

      this.liveMonitorInterval = setInterval(() => this._monitorCurrentMatch(), LIVE_TICK_MS);

      this.liveResolutionTimeout = setTimeout(() => {
        if (this.currentMatch !== match || match.ended) return;
        this._resolveLiveTimeout(match);
      }, timeoutMs);

      this.extraTimers.push(this.liveResolutionTimeout);
    });
  }

  private _handleCalibration(client: Client, data: WesternStandoffInput): void {
    const match = this.currentMatch;
    if (!match || match.ended) return;
    if (match.stage !== "calibrating") return;
    if (!this._isPlayerInCurrentMatch(client.sessionId)) return;

    const orientation = normalizeOrientation(data);
    if (!orientation) {
      this.send(client.sessionId, "standoff_invalid_shot", {
        matchId: match.matchId,
        reason: "invalid_orientation",
        message: "Move your phone and try calibrating again.",
      });
      return;
    }

    match.stage = "calibrating";
    match.calibrations.set(client.sessionId, orientation);
    match.readyPlayerIds.add(client.sessionId);

    this.send(client.sessionId, "standoff_calibration_saved", {
      matchId: match.matchId,
      readyCount: match.readyPlayerIds.size,
      totalCount: 2,
    });

    this.broadcast("standoff_ready", {
      matchId: match.matchId,
      readyCount: match.readyPlayerIds.size,
      totalCount: 2,
      readyPlayerId: client.sessionId,
    });

    if (match.calibrations.size >= 2 && this.calibrationResolve) {
      const resolve = this.calibrationResolve;
      this.calibrationResolve = null;
      resolve();
    }
  }

  private _handleShoot(client: Client, data: WesternStandoffInput): void {
    const match = this.currentMatch;
    if (!match || match.ended) return;
    if (!this._isPlayerInCurrentMatch(client.sessionId)) return;

    if (match.stage !== "live") {
      this.send(client.sessionId, "standoff_invalid_shot", {
        matchId: match.matchId,
        reason: "too_early",
        message: "Wait for the draw signal!",
      });
      return;
    }

    const orientation = normalizeOrientation(data);
    if (!orientation) {
      this.send(client.sessionId, "standoff_invalid_shot", {
        matchId: match.matchId,
        reason: "invalid_orientation",
        message: "Motion data unavailable — try again.",
      });
      return;
    }

    const calibration = match.calibrations.get(client.sessionId);
    if (!calibration) {
      this.send(client.sessionId, "standoff_invalid_shot", {
        matchId: match.matchId,
        reason: "not_calibrated",
        message: "Calibrate before you draw.",
      });
      return;
    }

    const validation = validateShotPose(calibration, orientation);
    if (!validation.valid) {
      this.send(client.sessionId, "standoff_invalid_shot", {
        matchId: match.matchId,
        reason: !validation.turnedAround ? "not_turned" : "not_aimed",
        message: !validation.turnedAround
          ? "Turn all the way around first."
          : "Raise your phone into a landscape draw pose.",
      });
      return;
    }

    const winnerId = client.sessionId;
    const loserId = winnerId === match.player1Id ? match.player2Id : match.player1Id;
    const reactionMs = Math.max(0, Date.now() - match.drawAt);

    this._resolveCurrentMatch({
      winnerId,
      loserId,
      shooterId: winnerId,
      reactionMs,
      reason: "shot",
    });
  }

  private _monitorCurrentMatch(): void {
    const match = this.currentMatch;
    if (!match || match.ended || match.stage !== "live") return;
    this._resolveDisconnectedMatch(match);
  }

  private _resolveDisconnectedMatch(match: MatchState): boolean {
    const player1Active = this.isPlayerActive(this.room.state.players.get(match.player1Id));
    const player2Active = this.isPlayerActive(this.room.state.players.get(match.player2Id));

    if (player1Active && player2Active) return false;

    if (player1Active && !player2Active) {
      this._resolveCurrentMatch({
        winnerId: match.player1Id,
        loserId: match.player2Id,
        shooterId: "",
        reactionMs: 0,
        reason: "disconnect",
      });
      return true;
    }

    if (!player1Active && player2Active) {
      this._resolveCurrentMatch({
        winnerId: match.player2Id,
        loserId: match.player1Id,
        shooterId: "",
        reactionMs: 0,
        reason: "disconnect",
      });
      return true;
    }

    this._resolveLiveTimeout(match);
    return true;
  }

  private _resolveCalibrationTimeout(match: MatchState): void {
    if (match.ended) return;

    if (match.calibrations.size === 1) {
      const winnerId = [...match.calibrations.keys()][0] ?? "";
      const loserId = winnerId === match.player1Id ? match.player2Id : match.player1Id;
      this._resolveCurrentMatch({
        winnerId,
        loserId,
        shooterId: "",
        reactionMs: 0,
        reason: "timeout",
      });
      return;
    }

    this._resolveLiveTimeout(match);
  }

  private _resolveLiveTimeout(match: MatchState): void {
    if (match.ended) return;
    const winnerId = pickDeterministicWinner([match.player1Id, match.player2Id], match.timeoutSeed);
    const loserId = winnerId === match.player1Id ? match.player2Id : match.player1Id;

    this._resolveCurrentMatch({
      winnerId,
      loserId,
      shooterId: "",
      reactionMs: LIVE_DUEL_TIMEOUT_MS,
      reason: "timeout",
    });
  }

  private _resolveCurrentMatch(outcome: Omit<MatchOutcome, "isPractice">): void {
    const match = this.currentMatch;
    if (!match || match.ended) return;

    match.ended = true;
    match.stage = "resolved";
    match.winnerId = outcome.winnerId;
    match.loserId = outcome.loserId;
    match.shooterId = outcome.shooterId;
    match.reactionMs = outcome.reactionMs;
    match.resolutionReason = outcome.reason;

    this._clearLiveMonitor();
    this._clearLiveResolutionTimeout();

    this.broadcast("standoff_match_result", {
      matchId: match.matchId,
      winnerId: outcome.winnerId,
      winnerName: this.room.state.players.get(outcome.winnerId)?.name ?? "Unknown",
      loserId: outcome.loserId,
      loserName: this.room.state.players.get(outcome.loserId)?.name ?? "Unknown",
      shooterId: outcome.shooterId,
      reactionMs: outcome.reactionMs,
      reason: outcome.reason,
      bracketRound: match.bracketRound,
      isPractice: match.isPractice,
    });

    if (this.matchResolve) {
      const resolve = this.matchResolve;
      this.matchResolve = null;
      resolve();
    }
  }

  private _matchOutcome(match: MatchState): MatchOutcome {
    return {
      winnerId: match.winnerId,
      loserId: match.loserId,
      shooterId: match.shooterId,
      reactionMs: match.reactionMs,
      reason: match.resolutionReason === "" ? "timeout" : match.resolutionReason,
      isPractice: match.isPractice,
    };
  }

  private _fallbackOutcome(options: Pick<DuelOptions, "player1Id" | "player2Id" | "isPractice">): MatchOutcome {
    const winnerId = pickDeterministicWinner([options.player1Id, options.player2Id], this.bracketSeed);
    const loserId = winnerId === options.player1Id ? options.player2Id : options.player1Id;
    return {
      winnerId,
      loserId,
      shooterId: "",
      reactionMs: 0,
      reason: "timeout",
      isPractice: options.isPractice,
    };
  }

  private _replaceBracketPlayerId(oldId: string, newId: string): void {
    const bracket = this.room.state.bracket;
    for (const round of bracket.rounds) {
      for (const heat of round.heats) {
        for (let i = 0; i < heat.playerIds.length; i++) {
          if (heat.playerIds[i] === oldId) heat.playerIds[i] = newId;
        }
        for (let i = 0; i < heat.advancingIds.length; i++) {
          if (heat.advancingIds[i] === oldId) heat.advancingIds[i] = newId;
        }
      }
    }
  }

  private _activePlayers() {
    return [...this.room.state.players.values()].filter((player) => this.isPlayerActive(player));
  }

  private _isPlayerInCurrentMatch(sessionId: string): boolean {
    const match = this.currentMatch;
    return !!match && (sessionId === match.player1Id || sessionId === match.player2Id);
  }

  private _addScore(playerId: string, points: number): void {
    this.pendingScores.set(playerId, (this.pendingScores.get(playerId) ?? 0) + points);
  }

  private _applyScores(): void {
    for (const [playerId, points] of this.pendingScores.entries()) {
      const player = this.room.state.players.get(playerId);
      if (player) {
        player.score += points;
      }
    }
    this.pendingScores.clear();
  }

  private _stringSeed(value: string): number {
    let seed = 0;
    for (let index = 0; index < value.length; index++) {
      seed = (seed * 31 + value.charCodeAt(index)) >>> 0;
    }
    return seed;
  }

  private _clearLiveMonitor(): void {
    if (this.liveMonitorInterval) {
      clearInterval(this.liveMonitorInterval);
      this.liveMonitorInterval = null;
    }
  }

  private _clearLiveResolutionTimeout(): void {
    if (this.liveResolutionTimeout) {
      clearTimeout(this.liveResolutionTimeout);
      this.liveResolutionTimeout = null;
    }
  }
}
