/**
 * server/src/games/registry-07-hot-potato/index.ts
 *
 * "Hot Potato" — physical pass-the-phone game with voting.
 *
 * Game Rules
 * ──────────
 * - At the start of each round, a random player is assigned the "hot potato"
 *   (their phone becomes the potato).
 * - The holder's screen shows the name of another player — they must physically
 *   pass their phone to that person.
 * - The receiver taps "Accept" to take possession, then sees who to pass to next.
 * - A countdown timer ticks down; when it hits zero the potato explodes.
 * - All players then vote on who they think was holding the potato at detonation.
 *
 * Scoring
 * ───────
 * - Correct vote for the holder:       +100
 * - Survived (not the holder):          +50
 * - Holder when it exploded:              0
 * - Most passes in the round (bonus):   +25
 *
 * Edge Cases
 * ──────────
 * - Player disconnects while holding: auto-pass to a random connected player.
 * - Fewer than 2 connected players: round is skipped.
 * - Timer precision via Date.now() timestamps.
 */

import { Client } from "@colyseus/core";
import { BaseGame } from "../BaseGame";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Base timer for round 1 (ms). */
const BASE_TIMER_MS = 15_000;

/** Timer reduction per round (ms). */
const TIMER_DECREMENT_MS = 1_500;

/** Minimum timer regardless of round (ms). */
const MIN_TIMER_MS = 6_000;

/** How often to broadcast timer updates (ms). */
const TIMER_TICK_MS = 500;

/** Duration of the voting phase (ms). */
const VOTING_DURATION_MS = 15_000;

/** Time to display results before moving on (ms). */
const RESULTS_DISPLAY_MS = 5_000;

/** Points for correctly identifying the holder. */
const CORRECT_VOTE_POINTS = 100;

/** Points for surviving (not being the holder). */
const SURVIVAL_POINTS = 50;

/** Bonus points for the player who passed the most. */
const PASS_LEADER_BONUS = 25;

/** Duration of the delay-penalty voting phase (ms). */
const DELAY_VOTE_DURATION_MS = 12_000;

/** Points deducted from the most-voted delay offender. */
const DELAY_PENALTY_POINTS = 50;

/** Time considered "slow" for accepting (ms) — used as reference info only. */
const SLOW_ACCEPT_THRESHOLD_MS = 4_000;

// ── Per-round tracking (not in schema — private server state) ─────────────────

interface PassRecord {
  /** Session ID of the player who passed. */
  fromId: string;
  /** Session ID of the player who received. */
  toId: string;
  /** Epoch ms when the pass was initiated (holder tapped "Pass"). */
  passedAt: number;
  /** Epoch ms when the target tapped "Accept". */
  acceptedAt: number;
  /** How long the target took to accept (ms). */
  acceptDurationMs: number;
}

interface RoundState {
  /** Session ID of the current potato holder. */
  holderId: string;

  /** Session ID of the current pass target. */
  targetId: string;

  /** Session ID of the previous holder (for "last passer" tracking). */
  lastPasserId: string;

  /** Epoch ms when the round timer ends. */
  timerEndsAt: number;

  /** Whether the potato has exploded this round. */
  exploded: boolean;

  /** Whether the holder has initiated a pass (waiting for target to accept). */
  passInFlight: boolean;

  /** Epoch ms when the current pass was initiated (for tracking accept time). */
  passInitiatedAt: number;

  /** Per-player pass counts for the round. */
  passCounts: Map<string, number>;

  /** Full pass history with accept times. */
  passRecords: PassRecord[];

  /** Votes: voterId -> suspectId (who was holding). */
  votes: Map<string, string>;

  /** Whether voting phase is active. */
  votingOpen: boolean;

  /** Delay votes: voterId -> suspectId (who delayed unfairly). */
  delayVotes: Map<string, string>;

  /** Whether delay voting phase is active. */
  delayVotingOpen: boolean;
}

// ── Input types ───────────────────────────────────────────────────────────────

interface HotPotatoInput {
  action: "potato_pass" | "potato_accept" | "potato_vote" | "potato_delay_vote";
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

  private roundState: RoundState | null = null;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private roundResolve: (() => void) | null = null;

  /** Accumulated scores for the current round, applied in scoreRound(). */
  private pendingScores: Map<string, number> = new Map();

  /** Extra timers tracked for cleanup (BaseGame._timers is private). */
  private _extraTimers: ReturnType<typeof setTimeout>[] = [];

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  protected override async onLoad(): Promise<void> {
    for (const p of this.room.state.players.values()) {
      p.score = 0;
      p.isReady = false;
      p.isEliminated = false;
    }
  }

  protected override async runRound(round: number): Promise<void> {
    const players = this._activePlayers();

    // Need at least 2 players to play
    if (players.length < 2) {
      this.broadcast("round_skipped", { reason: "Not enough connected players (need 2+)" });
      return;
    }

    // ── 1. Calculate timer for this round ──────────────────────────────────
    const timerMs = Math.max(
      MIN_TIMER_MS,
      BASE_TIMER_MS - (round - 1) * TIMER_DECREMENT_MS,
    );

    // ── 2. Pick initial holder and target ──────────────────────────────────
    const holderId = this._randomPlayer(players).id;
    const targetId = this._randomPlayerExcluding(players, [holderId]).id;

    const now = Date.now();
    this.roundState = {
      holderId,
      targetId,
      lastPasserId: "",
      timerEndsAt: now + timerMs,
      exploded: false,
      passInFlight: false,
      passInitiatedAt: 0,
      passCounts: new Map(),
      passRecords: [],
      votes: new Map(),
      votingOpen: false,
      delayVotes: new Map(),
      delayVotingOpen: false,
    };

    // ── 3. Notify all clients ──────────────────────────────────────────────
    const holder = this.room.state.players.get(holderId)!;
    const target = this.room.state.players.get(targetId)!;
    const timeRemaining = timerMs;

    this.send(holderId, "potato_assigned", {
      targetName: target.name,
      targetId: target.id,
      timeRemaining,
    });

    // Everyone else gets a waiting message
    for (const p of players) {
      if (p.id !== holderId) {
        this.send(p.id, "potato_waiting", {});
      }
    }

    this.broadcast("potato_status", {
      holderId: holder.id,
      holderName: holder.name,
      targetName: target.name,
      timeRemaining,
      passCount: 0,
    });

    // ── 4. Start the countdown timer ───────────────────────────────────────
    this.timerInterval = setInterval(() => this._timerTick(), TIMER_TICK_MS);

    // ── 5. Wait for explosion or round end ─────────────────────────────────
    await new Promise<void>((resolve) => {
      this.roundResolve = resolve;
    });

    // ── 6. Voting phase (who was holding?) ──────────────────────────────────
    if (this.roundState) {
      await this._runVotingPhase();
    }

    // ── 7. Delay-penalty voting phase (who unfairly delayed?) ─────────────
    if (this.roundState && this.roundState.passRecords.length > 0) {
      await this._runDelayVotingPhase();
    }

    // ── 8. Results phase ───────────────────────────────────────────────────
    if (this.roundState) {
      this._computeAndBroadcastResults();
    }

    await this.delay(RESULTS_DISPLAY_MS);
  }

  protected override scoreRound(_round: number): void {
    // Apply pending scores accumulated during the round
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
      case "potato_pass":
        this._handlePass(client);
        break;
      case "potato_accept":
        this._handleAccept(client);
        break;
      case "potato_vote":
        this._handleVote(client, input.targetId);
        break;
      case "potato_delay_vote":
        this._handleDelayVote(client, input.targetId);
        break;
    }
  }

  override teardown(): void {
    super.teardown();
    this._clearTimerInterval();
    for (const t of this._extraTimers) clearTimeout(t);
    this._extraTimers = [];
    this.roundState = null;
    this.roundResolve = null;
    this.pendingScores.clear();
  }

  // ── Input handlers ────────────────────────────────────────────────────────

  /**
   * The current holder taps "Pass" to initiate the transfer.
   * The potato is now "in flight" — the target must accept.
   */
  private _handlePass(client: Client): void {
    const rs = this.roundState;
    if (!rs || rs.exploded || rs.votingOpen || rs.delayVotingOpen) return;

    // Only the current holder can pass
    if (client.sessionId !== rs.holderId) return;

    // Can't pass if already in flight
    if (rs.passInFlight) return;

    rs.passInFlight = true;
    rs.passInitiatedAt = Date.now();

    // Increment pass count for this player
    const count = (rs.passCounts.get(client.sessionId) ?? 0) + 1;
    rs.passCounts.set(client.sessionId, count);

    // Notify the target that the potato is coming
    const holder = this.room.state.players.get(rs.holderId);
    this.send(rs.targetId, "potato_passed", {
      fromName: holder?.name ?? "Unknown",
    });
  }

  /**
   * The target taps "Accept" to receive the potato.
   * The potato transfers: the acceptor becomes the new holder,
   * a new random target is picked, and updated messages are sent.
   */
  private _handleAccept(client: Client): void {
    const rs = this.roundState;
    if (!rs || rs.exploded || rs.votingOpen || rs.delayVotingOpen) return;

    // Only the current target can accept
    if (client.sessionId !== rs.targetId) return;

    // Must be in flight (holder already pressed pass)
    if (!rs.passInFlight) return;

    // Record the accept time
    const acceptedAt = Date.now();
    const acceptDurationMs = rs.passInitiatedAt > 0
      ? acceptedAt - rs.passInitiatedAt
      : 0;

    rs.passRecords.push({
      fromId: rs.holderId,
      toId: client.sessionId,
      passedAt: rs.passInitiatedAt,
      acceptedAt,
      acceptDurationMs,
    });

    rs.passInFlight = false;

    // Transfer the potato
    rs.lastPasserId = rs.holderId;
    rs.holderId = client.sessionId;

    // Pick a new target (excluding the new holder)
    const players = this._activePlayers();
    if (players.length < 2) {
      // Not enough players to continue passing — just wait for timer
      return;
    }

    const newTarget = this._randomPlayerExcluding(players, [rs.holderId]);
    rs.targetId = newTarget.id;

    // Calculate remaining time
    const timeRemaining = Math.max(0, rs.timerEndsAt - Date.now());
    const totalPasses = [...rs.passCounts.values()].reduce((sum, c) => sum + c, 0);

    // Notify the new holder
    this.send(rs.holderId, "potato_assigned", {
      targetName: newTarget.name,
      targetId: newTarget.id,
      timeRemaining,
    });

    // Everyone else waits
    for (const p of players) {
      if (p.id !== rs.holderId) {
        this.send(p.id, "potato_waiting", {});
      }
    }

    // Broadcast status update
    const holder = this.room.state.players.get(rs.holderId)!;
    this.broadcast("potato_accepted", {
      holderName: holder.name,
      targetName: newTarget.name,
      timeRemaining,
    });

    this.broadcast("potato_status", {
      holderId: rs.holderId,
      holderName: holder.name,
      targetName: newTarget.name,
      timeRemaining,
      passCount: totalPasses,
    });
  }

  /**
   * During voting phase, a player votes for who they think was holding
   * the potato when it exploded.
   */
  private _handleVote(client: Client, targetId: string | undefined): void {
    const rs = this.roundState;
    if (!rs || !rs.votingOpen || rs.delayVotingOpen || !targetId) return;

    const voterId = client.sessionId;

    // Can't vote twice
    if (rs.votes.has(voterId)) return;

    // Target must be a valid player
    if (!this.room.state.players.has(targetId)) return;

    rs.votes.set(voterId, targetId);

    // Confirm to the voter
    this.send(voterId, "potato_vote_confirmed", {});

    // Broadcast vote progress
    const totalVoters = this._activePlayers().length;
    this.broadcast("potato_vote_update", {
      votesIn: rs.votes.size,
      totalVoters,
    });
  }

  // ── Timer ─────────────────────────────────────────────────────────────────

  private _timerTick(): void {
    const rs = this.roundState;
    if (!rs || rs.exploded) return;

    const timeRemaining = Math.max(0, rs.timerEndsAt - Date.now());

    // Broadcast timer update
    this.broadcast("potato_timer", { timeRemaining });

    // Check for disconnected holder — auto-pass to a random player
    this._checkHolderDisconnect();

    // Check for explosion
    if (timeRemaining <= 0) {
      this._explode();
    }
  }

  /**
   * If the current holder has disconnected, automatically transfer the
   * potato to a random still-connected player.
   */
  private _checkHolderDisconnect(): void {
    const rs = this.roundState;
    if (!rs || rs.exploded) return;

    const holder = this.room.state.players.get(rs.holderId);
    if (holder && holder.isConnected) return;

    // Holder disconnected — find a replacement
    const players = this._activePlayers();
    if (players.length === 0) {
      // No one left — explode immediately
      this._explode();
      return;
    }

    // Transfer to a random connected player
    const newHolder = this._randomPlayer(players);
    rs.lastPasserId = rs.holderId;
    rs.holderId = newHolder.id;
    rs.passInFlight = false;

    // Pick a new target
    if (players.length >= 2) {
      const newTarget = this._randomPlayerExcluding(players, [rs.holderId]);
      rs.targetId = newTarget.id;

      const timeRemaining = Math.max(0, rs.timerEndsAt - Date.now());
      const totalPasses = [...rs.passCounts.values()].reduce((sum, c) => sum + c, 0);

      this.send(rs.holderId, "potato_assigned", {
        targetName: newTarget.name,
        targetId: newTarget.id,
        timeRemaining,
      });

      for (const p of players) {
        if (p.id !== rs.holderId) {
          this.send(p.id, "potato_waiting", {});
        }
      }

      this.broadcast("potato_status", {
        holderId: rs.holderId,
        holderName: newHolder.name,
        targetName: newTarget.name,
        timeRemaining,
        passCount: totalPasses,
      });
    }
    // If only 1 player, they hold it until it explodes (no target needed)
  }

  /**
   * Timer has hit zero — the potato explodes.
   * Stop the timer, notify everyone, then resolve to move to voting.
   */
  private _explode(): void {
    const rs = this.roundState;
    if (!rs || rs.exploded) return;

    rs.exploded = true;
    this._clearTimerInterval();

    const holder = this.room.state.players.get(rs.holderId);
    const lastPasser = rs.lastPasserId
      ? this.room.state.players.get(rs.lastPasserId)
      : null;

    // Build suspects list (all active players)
    const suspects = this._activePlayers().map((p) => ({
      id: p.id,
      name: p.name,
    }));

    this.broadcast("potato_exploded", {
      holderId: rs.holderId,
      holderName: holder?.name ?? "Unknown",
      lastPasserId: rs.lastPasserId,
      lastPasserName: lastPasser?.name ?? "",
      suspects,
    });

    // Resolve the round promise to proceed to voting
    if (this.roundResolve) {
      this.roundResolve();
      this.roundResolve = null;
    }
  }

  // ── Voting phase ──────────────────────────────────────────────────────────

  private async _runVotingPhase(): Promise<void> {
    const rs = this.roundState;
    if (!rs) return;

    rs.votingOpen = true;

    const suspects = this._activePlayers().map((p) => ({
      id: p.id,
      name: p.name,
    }));

    this.broadcast("potato_vote_start", {
      suspects,
      durationMs: VOTING_DURATION_MS,
      serverTimestamp: Date.now(),
    });

    // Wait for all votes or timeout
    const totalVoters = this._activePlayers().length;

    await new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        if (rs.votes.size >= totalVoters) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 200);

      // Timeout fallback
      const timeout = setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, VOTING_DURATION_MS);

      // Register timeout for cleanup
      this._registerTimer(timeout);
    });

    rs.votingOpen = false;
  }

  // ── Delay-penalty voting phase ────────────────────────────────────────────

  /**
   * After the normal "who was holding?" vote, run a second vote:
   * "Who unfairly delayed accepting the potato?"
   *
   * Shows players the average accept times so they can make informed votes.
   * The most-voted player loses DELAY_PENALTY_POINTS.
   */
  private async _runDelayVotingPhase(): Promise<void> {
    const rs = this.roundState;
    if (!rs) return;

    // Compute per-player average accept times from pass records
    const acceptTimesMap = new Map<string, number[]>();
    for (const record of rs.passRecords) {
      const times = acceptTimesMap.get(record.toId) ?? [];
      times.push(record.acceptDurationMs);
      acceptTimesMap.set(record.toId, times);
    }

    // Build suspects list with accept time stats
    const delayStats: {
      id: string;
      name: string;
      avgAcceptMs: number;
      maxAcceptMs: number;
      acceptCount: number;
    }[] = [];

    for (const [playerId, times] of acceptTimesMap.entries()) {
      const player = this.room.state.players.get(playerId);
      if (!player || !player.isConnected || player.isEliminated) continue;
      const avg = times.reduce((sum, t) => sum + t, 0) / times.length;
      const max = Math.max(...times);
      delayStats.push({
        id: playerId,
        name: player.name,
        avgAcceptMs: Math.round(avg),
        maxAcceptMs: max,
        acceptCount: times.length,
      });
    }

    // Only run delay vote if there were at least 2 players who accepted passes
    if (delayStats.length < 2) return;

    // Check if anyone was notably slow (above threshold) — skip if all were fast
    const anyoneSlowish = delayStats.some(
      (s) => s.maxAcceptMs >= SLOW_ACCEPT_THRESHOLD_MS * 0.5,
    );
    if (!anyoneSlowish) return;

    rs.delayVotingOpen = true;

    this.broadcast("potato_delay_vote_start", {
      players: delayStats,
      durationMs: DELAY_VOTE_DURATION_MS,
      serverTimestamp: Date.now(),
      slowThresholdMs: SLOW_ACCEPT_THRESHOLD_MS,
    });

    // Wait for all delay votes or timeout
    const totalVoters = this._activePlayers().length;

    await new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        if (rs.delayVotes.size >= totalVoters) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 200);

      const timeout = setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, DELAY_VOTE_DURATION_MS);

      this._registerTimer(timeout);
    });

    rs.delayVotingOpen = false;

    // Determine who got the most delay votes
    if (rs.delayVotes.size > 0) {
      const voteTally = new Map<string, number>();
      for (const targetId of rs.delayVotes.values()) {
        voteTally.set(targetId, (voteTally.get(targetId) ?? 0) + 1);
      }

      let maxVotes = 0;
      let penalizedId = "";
      for (const [playerId, count] of voteTally.entries()) {
        if (count > maxVotes) {
          maxVotes = count;
          penalizedId = playerId;
        }
      }

      // Apply penalty if someone got at least 1 vote
      if (penalizedId) {
        const penalizedPlayer = this.room.state.players.get(penalizedId);
        const currentPending = this.pendingScores.get(penalizedId) ?? 0;
        this.pendingScores.set(penalizedId, currentPending - DELAY_PENALTY_POINTS);

        this.broadcast("potato_delay_result", {
          penalizedId,
          penalizedName: penalizedPlayer?.name ?? "Unknown",
          penaltyPoints: DELAY_PENALTY_POINTS,
          voteCount: maxVotes,
          totalVotes: rs.delayVotes.size,
        });

        // Brief pause to show the delay result
        await this.delay(3_000);
        return;
      }
    }

    // No votes cast — broadcast skip
    this.broadcast("potato_delay_result", {
      penalizedId: "",
      penalizedName: "",
      penaltyPoints: 0,
      voteCount: 0,
      totalVotes: 0,
    });
  }

  /**
   * During delay-voting phase, a player votes for who they think
   * unfairly delayed accepting the potato.
   */
  private _handleDelayVote(client: Client, targetId: string | undefined): void {
    const rs = this.roundState;
    if (!rs || !rs.delayVotingOpen || !targetId) return;

    const voterId = client.sessionId;

    // Can't vote twice
    if (rs.delayVotes.has(voterId)) return;

    // Target must be a valid player
    if (!this.room.state.players.has(targetId)) return;

    rs.delayVotes.set(voterId, targetId);

    // Confirm to the voter
    this.send(voterId, "potato_delay_vote_confirmed", {});

    // Broadcast vote progress
    const totalVoters = this._activePlayers().length;
    this.broadcast("potato_delay_vote_update", {
      votesIn: rs.delayVotes.size,
      totalVoters,
    });
  }

  // ── Results computation ───────────────────────────────────────────────────

  private _computeAndBroadcastResults(): void {
    const rs = this.roundState;
    if (!rs) return;

    const scores: Record<string, number> = {};
    const correctVoters: string[] = [];
    const players = this._activePlayers();

    // Find the pass leader
    let passLeader: { id: string; name: string; count: number } | null = null;
    let maxPasses = 0;
    for (const [playerId, count] of rs.passCounts.entries()) {
      if (count > maxPasses) {
        maxPasses = count;
        const player = this.room.state.players.get(playerId);
        passLeader = {
          id: playerId,
          name: player?.name ?? "Unknown",
          count,
        };
      }
    }

    // Score each player
    for (const player of players) {
      let points = 0;

      // Survival points (not the holder)
      if (player.id !== rs.holderId) {
        points += SURVIVAL_POINTS;
      }

      // Voting points
      const votedFor = rs.votes.get(player.id);
      if (votedFor === rs.holderId) {
        points += CORRECT_VOTE_POINTS;
        correctVoters.push(player.id);
      }

      // Pass leader bonus
      if (passLeader && player.id === passLeader.id) {
        points += PASS_LEADER_BONUS;
      }

      scores[player.id] = points;
    }

    // Store scores for scoreRound() to apply
    this.pendingScores.clear();
    for (const [id, pts] of Object.entries(scores)) {
      this.pendingScores.set(id, pts);
    }

    const holder = this.room.state.players.get(rs.holderId);

    // Compute delay penalty info for results
    let delayPenalty: {
      penalizedId: string;
      penalizedName: string;
      penaltyPoints: number;
    } | null = null;

    if (rs.delayVotes.size > 0) {
      const voteTally = new Map<string, number>();
      for (const targetId of rs.delayVotes.values()) {
        voteTally.set(targetId, (voteTally.get(targetId) ?? 0) + 1);
      }
      let maxVotes = 0;
      let penalizedId = "";
      for (const [playerId, count] of voteTally.entries()) {
        if (count > maxVotes) {
          maxVotes = count;
          penalizedId = playerId;
        }
      }
      if (penalizedId) {
        const penalized = this.room.state.players.get(penalizedId);
        delayPenalty = {
          penalizedId,
          penalizedName: penalized?.name ?? "Unknown",
          penaltyPoints: DELAY_PENALTY_POINTS,
        };
      }
    }

    this.broadcast("potato_result", {
      holderId: rs.holderId,
      holderName: holder?.name ?? "Unknown",
      correctVoters,
      scores,
      passLeader: passLeader ?? { id: "", name: "", count: 0 },
      delayPenalty,
    });
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  /** Return connected, non-eliminated players. */
  private _activePlayers() {
    return [...this.room.state.players.values()].filter(
      (p) => p.isConnected && !p.isEliminated,
    );
  }

  /** Pick a random player from a list. */
  private _randomPlayer<T>(players: T[]): T {
    return players[Math.floor(Math.random() * players.length)];
  }

  /** Pick a random player excluding certain session IDs. */
  private _randomPlayerExcluding(
    players: { id: string; name: string }[],
    excludeIds: string[],
  ) {
    const eligible = players.filter((p) => !excludeIds.includes(p.id));
    if (eligible.length === 0) {
      // Fallback: return any player (shouldn't happen with >= 2 players)
      return players[0];
    }
    return eligible[Math.floor(Math.random() * eligible.length)];
  }

  /** Clear the timer broadcast interval. */
  private _clearTimerInterval(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  /** Register a timeout for cleanup in teardown. */
  private _registerTimer(timer: ReturnType<typeof setTimeout>): void {
    this._extraTimers.push(timer);
  }
}
