/**
 * server/src/games/registry-07-hot-potato/index.ts
 *
 * "Hot Potato" — physical pass-the-phone party game.
 *
 * Redesigned Mechanic
 * ───────────────────
 * - One random phone is selected as "the potato" for the ENTIRE round.
 * - That phone's screen shows the name of the player to physically pass to.
 * - The physical receiver taps "Accept" on the potato phone.
 * - A new target name immediately appears on the same potato phone.
 * - A hidden countdown timer ticks down; when it expires the potato "explodes".
 * - All players then vote (from their OWN phones) on who should lose points:
 *   the person who was holding the potato, or the person it was being passed to.
 * - The most-voted player loses points; everyone else gains survival points.
 *
 * Key: only ONE physical phone (the potato) is active during the pass phase.
 * All other players' phones show a waiting/spectating screen until the vote.
 *
 * Sound Placeholder
 * ─────────────────
 * When the timer expires, the server sends a "potato_play_sound" message.
 * The potato phone client should play an explosion sound. The actual audio
 * file is a placeholder — search for SOUND_PLACEHOLDER in the client to
 * replace it with a real asset.
 *
 * Scoring
 * ───────
 * - Survived (not the voted loser):    +50
 * - Voted loser:                         0  (and −50 penalty)
 * - Most passes in the round (bonus):  +25
 *
 * Server messages → clients:
 *   "potato_round_start"  { potatoDeviceId, potatoDeviceName, timerDurationMs }
 *   "potato_show_target"  { targetId, targetName, passNumber }
 *   "potato_accepted"     { acceptorName, passNumber }
 *   "potato_timer"        { timeRemaining }
 *   "potato_exploded"     { holderId, holderName, targetId, targetName, passCount }
 *   "potato_play_sound"   {}
 *   "potato_vote_start"   { holderId, holderName, targetId, targetName, durationMs, serverTimestamp }
 *   "potato_vote_confirmed" {}
 *   "potato_vote_update"  { votesIn, totalVoters }
 *   "potato_result"       { loserId, loserName, loserPenalty, scores, passCount }
 *   "round_skipped"       { reason }
 *
 * Client messages ← players:
 *   { action: "potato_accept" }
 *   { action: "potato_vote", targetId }
 */

import { Client } from "@colyseus/core";
import { BaseGame } from "../BaseGame";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Base timer for round 1 (ms). */
const BASE_TIMER_MS = 20_000;

/** Timer reduction per round (ms). */
const TIMER_DECREMENT_MS = 2_000;

/** Minimum timer regardless of round (ms). */
const MIN_TIMER_MS = 8_000;

/** How often to broadcast timer updates (ms). */
const TIMER_TICK_MS = 500;

/** Duration of the voting phase (ms). */
const VOTING_DURATION_MS = 15_000;

/** Time to display results before moving on (ms). */
const RESULTS_DISPLAY_MS = 5_000;

/** Points for surviving (not the voted loser). */
const SURVIVAL_POINTS = 50;

/** Points deducted from the voted loser. */
const LOSER_PENALTY = 50;

/** Bonus points for the player who passed the most. */
const PASS_LEADER_BONUS = 25;

// ── Per-round tracking ────────────────────────────────────────────────────────

interface RoundData {
  /** Session ID of the player whose phone IS the potato for this round. */
  potatoDeviceId: string;

  /** Session ID of the player currently physically holding the potato phone. */
  holderId: string;

  /** Session ID of the player the potato is being passed to. */
  targetId: string;

  /** Epoch ms when the round timer ends (hidden from players). */
  timerEndsAt: number;

  /** Whether the potato has exploded. */
  exploded: boolean;

  /** Number of completed passes this round. */
  passCount: number;

  /** Per-player pass-received counts (for "most passes" bonus). */
  passCounts: Map<string, number>;

  /** Votes: voterId → who they blame (holderId or targetId). */
  votes: Map<string, string>;

  /** Whether voting phase is active. */
  votingOpen: boolean;
}

// ── Input types ───────────────────────────────────────────────────────────────

interface HotPotatoInput {
  action: "potato_accept" | "potato_vote";
  targetId?: string;
}

// ── Game class ────────────────────────────────────────────────────────────────

export default class HotPotatoGame extends BaseGame {
  static override requiresTV = false;
  static override supportsBracket = false;
  static override defaultRoundCount = 5;
  static override minRounds = 3;
  static override maxRounds = 10;
  static override hasInstructionsPhase = true;
  static override instructionsDelivery = "broadcast" as const;

  static override activityLevel: "none" | "some" | "full" = "some";
  static override requiresSameRoom = true;
  static override requiresSecondaryDisplay = false;

  private round: RoundData | null = null;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private roundResolve: (() => void) | null = null;

  /** Accumulated scores for the current round, applied in scoreRound(). */
  private pendingScores: Map<string, number> = new Map();

  /** Extra timers tracked for cleanup. */
  private _extraTimers: ReturnType<typeof setTimeout>[] = [];

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  protected override async onLoad(): Promise<void> {
    for (const p of this.room.state.players.values()) {
      p.score = 0;
      p.isReady = false;
      p.isEliminated = false;
    }
  }

  protected override async runRound(roundNum: number): Promise<void> {
    const players = this._activePlayers();

    if (players.length < 2) {
      this.broadcast("round_skipped", { reason: "Not enough connected players (need 2+)" });
      return;
    }

    // ── 1. Calculate timer for this round ──────────────────────────────────
    const timerMs = Math.max(
      MIN_TIMER_MS,
      BASE_TIMER_MS - (roundNum - 1) * TIMER_DECREMENT_MS,
    );

    // ── 2. Pick the potato device (random player's phone) ──────────────────
    const potatoPlayer = this._randomPlayer(players);
    const firstTarget = this._randomPlayerExcluding(players, [potatoPlayer.id]);

    const now = Date.now();
    this.round = {
      potatoDeviceId: potatoPlayer.id,
      holderId: potatoPlayer.id,
      targetId: firstTarget.id,
      timerEndsAt: now + timerMs,
      exploded: false,
      passCount: 0,
      passCounts: new Map(),
      votes: new Map(),
      votingOpen: false,
    };

    // ── 3. Notify all clients about the round starting ─────────────────────
    // Tell everyone which phone is the potato
    this.broadcast("potato_round_start", {
      potatoDeviceId: potatoPlayer.id,
      potatoDeviceName: potatoPlayer.name,
      timerDurationMs: timerMs,
    });

    // Tell the potato device who to pass to
    this.send(potatoPlayer.id, "potato_show_target", {
      targetId: firstTarget.id,
      targetName: firstTarget.name,
      passNumber: 0,
    });

    // ── 4. Start the countdown timer (hidden) ──────────────────────────────
    this.timerInterval = setInterval(() => this._timerTick(), TIMER_TICK_MS);

    // ── 5. Wait for explosion ──────────────────────────────────────────────
    await new Promise<void>((resolve) => {
      this.roundResolve = resolve;
    });

    // ── 6. Voting phase ────────────────────────────────────────────────────
    if (this.round) {
      await this._runVotingPhase();
    }

    // ── 7. Results ─────────────────────────────────────────────────────────
    if (this.round) {
      this._computeAndBroadcastResults();
    }

    await this.delay(RESULTS_DISPLAY_MS);
  }

  protected override scoreRound(_round: number): void {
    for (const [playerId, points] of this.pendingScores.entries()) {
      const player = this.room.state.players.get(playerId);
      if (player) {
        player.score += points;
      }
    }
    this.pendingScores.clear();
  }

  override handleInput(client: Client, data: unknown): void {
    const input = data as HotPotatoInput;
    if (!input || !input.action) return;

    switch (input.action) {
      case "potato_accept":
        this._handleAccept(client);
        break;
      case "potato_vote":
        this._handleVote(client, input.targetId);
        break;
    }
  }

  override teardown(): void {
    super.teardown();
    this._clearTimerInterval();
    for (const t of this._extraTimers) clearTimeout(t);
    this._extraTimers = [];
    this.round = null;
    this.roundResolve = null;
    this.pendingScores.clear();
  }

  // ── Input handlers ────────────────────────────────────────────────────────

  /**
   * The physical receiver taps "Accept" on the potato phone.
   *
   * IMPORTANT: The "Accept" button is on the potato device, but the person
   * tapping it is the TARGET (who just received the phone physically).
   * We don't validate client.sessionId here because the potato phone's
   * session always belongs to the original potato device owner. Instead
   * we trust the accept action since only the potato device shows it.
   */
  private _handleAccept(client: Client): void {
    const rd = this.round;
    if (!rd || rd.exploded || rd.votingOpen) return;

    // Only the potato device can send this action
    if (client.sessionId !== rd.potatoDeviceId) return;

    // Record the pass
    rd.passCount++;

    // Track pass count for the acceptor (target)
    const count = (rd.passCounts.get(rd.targetId) ?? 0) + 1;
    rd.passCounts.set(rd.targetId, count);

    // The previous target is now the holder
    const previousTarget = rd.targetId;
    rd.holderId = previousTarget;

    // Broadcast that the pass was accepted
    const acceptor = this.room.state.players.get(previousTarget);
    this.broadcast("potato_accepted", {
      acceptorName: acceptor?.name ?? "Unknown",
      passNumber: rd.passCount,
    });

    // Pick a new target (excluding the current holder)
    const players = this._activePlayers();
    if (players.length < 2) return;

    const newTarget = this._randomPlayerExcluding(players, [rd.holderId]);
    rd.targetId = newTarget.id;

    // Show the new target on the potato device
    this.send(rd.potatoDeviceId, "potato_show_target", {
      targetId: newTarget.id,
      targetName: newTarget.name,
      passNumber: rd.passCount,
    });
  }

  /**
   * During voting, a player votes from their OWN phone for who should
   * lose points: the holder or the intended receiver.
   */
  private _handleVote(client: Client, targetId: string | undefined): void {
    const rd = this.round;
    if (!rd || !rd.votingOpen || !targetId) return;

    const voterId = client.sessionId;

    // Can't vote twice
    if (rd.votes.has(voterId)) return;

    // Target must be either the holder or the target at time of explosion
    if (targetId !== rd.holderId && targetId !== rd.targetId) return;

    rd.votes.set(voterId, targetId);

    this.send(voterId, "potato_vote_confirmed", {});

    const totalVoters = this._activePlayers().length;
    this.broadcast("potato_vote_update", {
      votesIn: rd.votes.size,
      totalVoters,
    });
  }

  // ── Timer ─────────────────────────────────────────────────────────────────

  private _timerTick(): void {
    const rd = this.round;
    if (!rd || rd.exploded) return;

    const timeRemaining = Math.max(0, rd.timerEndsAt - Date.now());

    // Broadcast timer to all clients (for TV display / urgency cues)
    this.broadcast("potato_timer", { timeRemaining });

    // Check for disconnected holder — auto-pass
    this._checkHolderDisconnect();

    if (timeRemaining <= 0) {
      this._explode();
    }
  }

  /**
   * If the potato device owner disconnects, auto-pass to someone else.
   * This shouldn't normally happen since the potato phone is physical,
   * but handles edge cases like phone sleeping / losing connection.
   */
  private _checkHolderDisconnect(): void {
    const rd = this.round;
    if (!rd || rd.exploded) return;

    const potatoDevice = this.room.state.players.get(rd.potatoDeviceId);
    if (potatoDevice && potatoDevice.isConnected) return;

    // Potato device disconnected — explode immediately
    this._explode();
  }

  /**
   * Timer expired — the potato explodes.
   */
  private _explode(): void {
    const rd = this.round;
    if (!rd || rd.exploded) return;

    rd.exploded = true;
    this._clearTimerInterval();

    const holder = this.room.state.players.get(rd.holderId);
    const target = this.room.state.players.get(rd.targetId);

    // Tell the potato phone to play the explosion sound
    this.send(rd.potatoDeviceId, "potato_play_sound", {});

    this.broadcast("potato_exploded", {
      holderId: rd.holderId,
      holderName: holder?.name ?? "Unknown",
      targetId: rd.targetId,
      targetName: target?.name ?? "Unknown",
      passCount: rd.passCount,
    });

    // Resolve to move to voting
    if (this.roundResolve) {
      this.roundResolve();
      this.roundResolve = null;
    }
  }

  // ── Voting phase ──────────────────────────────────────────────────────────

  private async _runVotingPhase(): Promise<void> {
    const rd = this.round;
    if (!rd) return;

    rd.votingOpen = true;

    const holder = this.room.state.players.get(rd.holderId);
    const target = this.room.state.players.get(rd.targetId);

    this.broadcast("potato_vote_start", {
      holderId: rd.holderId,
      holderName: holder?.name ?? "Unknown",
      targetId: rd.targetId,
      targetName: target?.name ?? "Unknown",
      durationMs: VOTING_DURATION_MS,
      serverTimestamp: Date.now(),
    });

    const totalVoters = this._activePlayers().length;

    await new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        if (rd.votes.size >= totalVoters) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 200);

      const timeout = setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, VOTING_DURATION_MS);

      this._registerTimer(timeout);
    });

    rd.votingOpen = false;
  }

  // ── Results ───────────────────────────────────────────────────────────────

  private _computeAndBroadcastResults(): void {
    const rd = this.round;
    if (!rd) return;

    const scores: Record<string, number> = {};
    const players = this._activePlayers();

    // Tally votes to determine the loser
    const voteTally = new Map<string, number>();
    for (const blameId of rd.votes.values()) {
      voteTally.set(blameId, (voteTally.get(blameId) ?? 0) + 1);
    }

    // Determine who got more blame votes
    let loserId = rd.holderId; // default to holder if no votes
    let maxVotes = 0;

    for (const [playerId, count] of voteTally.entries()) {
      if (count > maxVotes) {
        maxVotes = count;
        loserId = playerId;
      }
    }

    // If it's a tie, the holder loses (they had the potato)
    const holderVotes = voteTally.get(rd.holderId) ?? 0;
    const targetVotes = voteTally.get(rd.targetId) ?? 0;
    if (holderVotes === targetVotes) {
      loserId = rd.holderId;
    }

    // Find the pass leader
    let passLeaderId = "";
    let maxPasses = 0;
    for (const [playerId, count] of rd.passCounts.entries()) {
      if (count > maxPasses) {
        maxPasses = count;
        passLeaderId = playerId;
      }
    }

    // Score each player
    for (const player of players) {
      let points = 0;

      if (player.id === loserId) {
        // Loser gets penalized
        points = -LOSER_PENALTY;
      } else {
        // Survivors get points
        points = SURVIVAL_POINTS;
      }

      // Pass leader bonus
      if (passLeaderId && player.id === passLeaderId && maxPasses > 0) {
        points += PASS_LEADER_BONUS;
      }

      scores[player.id] = points;
    }

    // Store for scoreRound()
    this.pendingScores.clear();
    for (const [id, pts] of Object.entries(scores)) {
      this.pendingScores.set(id, pts);
    }

    const loser = this.room.state.players.get(loserId);

    this.broadcast("potato_result", {
      loserId,
      loserName: loser?.name ?? "Unknown",
      loserPenalty: LOSER_PENALTY,
      scores,
      passCount: rd.passCount,
      passLeaderId: passLeaderId || null,
      passLeaderName: passLeaderId
        ? (this.room.state.players.get(passLeaderId)?.name ?? "Unknown")
        : null,
      passLeaderCount: maxPasses,
      holderVotes,
      targetVotes,
    });
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  private _activePlayers() {
    return [...this.room.state.players.values()].filter(
      (p) => p.isConnected && !p.isEliminated,
    );
  }

  private _randomPlayer<T>(players: T[]): T {
    return players[Math.floor(Math.random() * players.length)];
  }

  private _randomPlayerExcluding(
    players: { id: string; name: string }[],
    excludeIds: string[],
  ) {
    const eligible = players.filter((p) => !excludeIds.includes(p.id));
    if (eligible.length === 0) return players[0];
    return eligible[Math.floor(Math.random() * eligible.length)];
  }

  private _clearTimerInterval(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private _registerTimer(timer: ReturnType<typeof setTimeout>): void {
    this._extraTimers.push(timer);
  }
}
