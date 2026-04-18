import { Client } from "@colyseus/core";
import { BaseGame } from "../BaseGame";
import {
  CONDITION_SUGGESTIONS,
  MIN_PLAYERS,
  SUBMISSION_DURATION_SECS,
  POSTER_REVEAL_MS,
  VOTING_DURATION_SECS,
  RESULTS_DISPLAY_MS,
  createRoundAssignments,
  haveAllExpectedPlayersResponded,
  tallyPosterVotes,
  computeRoundPoints,
  normalizeBounty,
  normalizeCondition,
  normalizeReason,
  type WantedPosterResult,
  type WantedPosterSubmission,
} from "./wantedAdLogic";

interface WantedAdInput {
  action: "wa_submit_poster" | "wa_vote";
  condition?: string;
  bounty?: string | number | null;
  reason?: string;
  targetAuthorId?: string;
}

interface RoundData {
  assignments: Map<string, string>;
  posters: Map<string, WantedPosterSubmission>;
  submittedPlayers: Set<string>;
  votes: Map<string, string>;
  votedPlayers: Set<string>;
  results: WantedPosterResult[] | null;
}

export default class WantedAdGame extends BaseGame {
  static override requiresTV = false;
  static override supportsBracket = false;
  static override defaultRoundCount = 3;
  static override minRounds = 1;
  static override maxRounds = 6;
  static override hasInstructionsPhase = true;
  static override instructionsDelivery = "broadcast" as const;

  static override activityLevel: "none" | "some" | "full" = "none";
  static override requiresSameRoom = false;
  static override requiresSecondaryDisplay = false;

  private round: RoundData | null = null;
  private pendingScores: Map<string, number> = new Map();
  private submissionResolve: (() => void) | null = null;
  private votingResolve: (() => void) | null = null;
  private expectedSubmissionPlayerIds: string[] = [];
  private expectedVotingPlayerIds: string[] = [];
  private extraTimers: ReturnType<typeof setTimeout>[] = [];

  protected override async onLoad(): Promise<void> {
    for (const player of this.room.state.players.values()) {
      player.score = 0;
      player.isReady = false;
      player.isEliminated = false;
    }
  }

  protected override async runRound(_roundNum: number): Promise<void> {
    const players = this.activePlayers();
    if (players.length < MIN_PLAYERS) {
      this.broadcast("round_skipped", { reason: "Not enough connected players (need 2+)" });
      return;
    }

    const playerIds = players.map((player) => player.id);
    const assignments = createRoundAssignments(playerIds);
    const durationMs = SUBMISSION_DURATION_SECS * 1000;
    const serverTimestamp = Date.now();

    this.round = {
      assignments,
      posters: new Map(),
      submittedPlayers: new Set(),
      votes: new Map(),
      votedPlayers: new Set(),
      results: null,
    };

    this.broadcast("wa_submission_start", {
      totalPlayers: playerIds.length,
      durationMs,
      serverTimestamp,
      conditionSuggestions: [...CONDITION_SUGGESTIONS],
    });

    for (const [authorId, targetPlayerId] of assignments.entries()) {
      const targetPlayerName = this.room.state.players.get(targetPlayerId)?.name ?? "Unknown Outlaw";
      this.send(authorId, "wa_assignment", {
        targetPlayerId,
        targetPlayerName,
        durationMs,
        serverTimestamp,
        conditionSuggestions: [...CONDITION_SUGGESTIONS],
      });
    }

    await this.waitForSubmissions(playerIds);

    const posters = [...this.round.posters.values()].sort((a, b) => a.submittedAt - b.submittedAt);
    if (posters.length === 0) {
      this.broadcast("round_skipped", { reason: "No wanted posters were submitted" });
      return;
    }

    this.broadcast("wa_reveal_start", {
      totalPosters: posters.length,
      displayMs: POSTER_REVEAL_MS,
    });

    for (let index = 0; index < posters.length; index++) {
      this.broadcast("wa_reveal_poster", {
        poster: posters[index],
        index,
        totalPosters: posters.length,
        displayMs: POSTER_REVEAL_MS,
        serverTimestamp: Date.now(),
      });
      await this.delay(POSTER_REVEAL_MS);
      if (this.isCancelled()) return;
    }

    let results: WantedPosterResult[];
    if (posters.length === 1) {
      results = [{ ...posters[0], voteCount: 0, isWinner: true }];
    } else {
      const eligibleVoterIds = playerIds.filter((playerId) => posters.some((poster) => poster.authorId !== playerId));

      this.broadcast("wa_voting_start", {
        posters,
        durationMs: VOTING_DURATION_SECS * 1000,
        serverTimestamp: Date.now(),
        totalVoters: eligibleVoterIds.length,
      });

      await this.waitForVotes(eligibleVoterIds);
      results = tallyPosterVotes(posters, this.round.votes);
    }

    this.round.results = results;
    this.pendingScores = computeRoundPoints(results);

    this.broadcast("wa_round_result", {
      posters: results,
      winnerAuthorIds: results.filter((result) => result.isWinner).map((result) => result.authorId),
      scores: Object.fromEntries(this.pendingScores),
      totalVotes: this.round.votes.size,
    });

    await this.delay(RESULTS_DISPLAY_MS);
  }

  protected override scoreRound(_round: number): void {
    for (const [playerId, points] of this.pendingScores.entries()) {
      const player = this.room.state.players.get(playerId);
      if (player) player.score += points;
    }
    this.pendingScores.clear();
  }

  override handleInput(client: Client, data: unknown): void {
    const input = data as WantedAdInput;
    if (!input?.action || !this.round) return;

    switch (input.action) {
      case "wa_submit_poster":
        this.handlePosterSubmission(client, input);
        break;
      case "wa_vote":
        this.handleVote(client, input.targetAuthorId);
        break;
    }
  }

  override onPlayerReconnected(oldId: string, newId: string): void {
    if (this.round) {
      if (this.round.assignments.has(oldId)) {
        const targetId = this.round.assignments.get(oldId)!;
        this.round.assignments.delete(oldId);
        this.round.assignments.set(newId, targetId === oldId ? newId : targetId);
      }

      for (const [authorId, targetId] of [...this.round.assignments.entries()]) {
        if (targetId === oldId) this.round.assignments.set(authorId, newId);
      }

      if (this.round.posters.has(oldId)) {
        const poster = this.round.posters.get(oldId)!;
        this.round.posters.delete(oldId);
        poster.authorId = newId;
        this.round.posters.set(newId, poster);
      }
      for (const poster of this.round.posters.values()) {
        if (poster.targetPlayerId === oldId) poster.targetPlayerId = newId;
      }

      if (this.round.submittedPlayers.delete(oldId)) this.round.submittedPlayers.add(newId);
      if (this.round.votedPlayers.delete(oldId)) this.round.votedPlayers.add(newId);

      if (this.round.votes.has(oldId)) {
        const target = this.round.votes.get(oldId)!;
        this.round.votes.delete(oldId);
        this.round.votes.set(newId, target === oldId ? newId : target);
      }
      for (const [voterId, targetAuthorId] of [...this.round.votes.entries()]) {
        if (targetAuthorId === oldId) this.round.votes.set(voterId, newId);
      }

      if (this.round.results) {
        this.round.results = this.round.results.map((result) => ({
          ...result,
          authorId: result.authorId === oldId ? newId : result.authorId,
          targetPlayerId: result.targetPlayerId === oldId ? newId : result.targetPlayerId,
        }));
      }
    }

    this.expectedSubmissionPlayerIds = this.expectedSubmissionPlayerIds.map((id) => id === oldId ? newId : id);
    this.expectedVotingPlayerIds = this.expectedVotingPlayerIds.map((id) => id === oldId ? newId : id);

    if (this.pendingScores.has(oldId)) {
      const score = this.pendingScores.get(oldId)!;
      this.pendingScores.delete(oldId);
      this.pendingScores.set(newId, score);
    }
  }

  override teardown(): void {
    super.teardown();
    for (const timer of this.extraTimers) clearTimeout(timer);
    this.extraTimers = [];
    this.round = null;
    this.pendingScores.clear();
    this.submissionResolve = null;
    this.votingResolve = null;
    this.expectedSubmissionPlayerIds = [];
    this.expectedVotingPlayerIds = [];
  }

  private activePlayers() {
    return [...this.room.state.players.values()].filter((player) => this.isPlayerActive(player));
  }

  private waitForSubmissions(playerIds: string[]): Promise<void> {
    this.expectedSubmissionPlayerIds = [...playerIds];
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timeout);
        this.submissionResolve = null;
        resolve();
      };

      this.submissionResolve = () => finish();

      const timeout = setTimeout(() => finish(), SUBMISSION_DURATION_SECS * 1000);
      this.extraTimers.push(timeout);
    });
  }

  private waitForVotes(playerIds: string[]): Promise<void> {
    this.expectedVotingPlayerIds = [...playerIds];
    if (playerIds.length === 0) return Promise.resolve();

    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timeout);
        this.votingResolve = null;
        resolve();
      };

      this.votingResolve = () => finish();

      const timeout = setTimeout(() => finish(), VOTING_DURATION_SECS * 1000);
      this.extraTimers.push(timeout);
    });
  }

  private handlePosterSubmission(client: Client, input: WantedAdInput): void {
    if (!this.round || !this.submissionResolve) return;
    if (this.round.submittedPlayers.has(client.sessionId)) {
      this.send(client.sessionId, "wa_submit_ack", {
        accepted: false,
        reason: "You already turned in your poster for this round.",
      });
      return;
    }

    const targetPlayerId = this.round.assignments.get(client.sessionId);
    if (!targetPlayerId) return;

    const poster: WantedPosterSubmission = {
      authorId: client.sessionId,
      targetPlayerId,
      condition: normalizeCondition(input.condition ?? ""),
      bounty: normalizeBounty(input.bounty),
      reason: normalizeReason(input.reason ?? ""),
      submittedAt: Date.now(),
    };

    this.round.posters.set(client.sessionId, poster);
    this.round.submittedPlayers.add(client.sessionId);

    this.send(client.sessionId, "wa_submit_ack", {
      accepted: true,
      poster,
    });
    this.broadcast("wa_submission_progress", {
      submittedCount: this.round.submittedPlayers.size,
      totalPlayers: this.expectedSubmissionPlayerIds.length,
    });

    if (haveAllExpectedPlayersResponded(this.round.submittedPlayers, this.expectedSubmissionPlayerIds)) {
      this.submissionResolve?.();
    }
  }

  private handleVote(client: Client, targetAuthorId?: string): void {
    if (!this.round || !this.votingResolve || !targetAuthorId) return;
    if (!this.expectedVotingPlayerIds.includes(client.sessionId)) return;
    if (this.round.votedPlayers.has(client.sessionId)) {
      this.send(client.sessionId, "wa_vote_ack", {
        accepted: false,
        reason: "Vote already locked in.",
      });
      return;
    }
    if (targetAuthorId === client.sessionId) {
      this.send(client.sessionId, "wa_vote_ack", {
        accepted: false,
        reason: "You can't vote for your own poster.",
      });
      return;
    }
    if (!this.round.posters.has(targetAuthorId)) {
      this.send(client.sessionId, "wa_vote_ack", {
        accepted: false,
        reason: "That poster is no longer available.",
      });
      return;
    }

    this.round.votes.set(client.sessionId, targetAuthorId);
    this.round.votedPlayers.add(client.sessionId);

    this.send(client.sessionId, "wa_vote_ack", { accepted: true, targetAuthorId });
    this.broadcast("wa_vote_update", {
      votesIn: this.round.votedPlayers.size,
      totalVoters: this.expectedVotingPlayerIds.length,
    });

    if (haveAllExpectedPlayersResponded(this.round.votedPlayers, this.expectedVotingPlayerIds)) {
      this.votingResolve?.();
    }
  }
}
