import { Client } from "@colyseus/core";
import { BaseGame } from "../BaseGame";
import {
  CHARACTER_CREATION_DURATION_SECS,
  computeRoundPoints,
  createRoundAssignments,
  buildCharacterAssignments,
  haveAllExpectedPlayersResponded,
  MAX_BOUNTY_LENGTH,
  MIN_PLAYERS,
  normalizeBounty,
  normalizeCharacterDescription,
  normalizeCharacterName,
  normalizeCondition,
  normalizeReason,
  POSTER_REVEAL_MS,
  POSTER_SUBMISSION_DURATION_SECS,
  RESULTS_DISPLAY_MS,
  tallyPosterVotes,
  type WantedCharacterAssignment,
  type WantedCharacterSubmission,
  type WantedPosterResult,
  type WantedPosterSubmission,
  VOTING_DURATION_SECS,
} from "./wantedAdLogic";

interface WantedAdInput {
  action: "wa_submit_character" | "wa_submit_poster" | "wa_vote";
  characterName?: string;
  characterDescription?: string;
  portraitDesign?: string;
  condition?: string;
  bounty?: string | number | null;
  reason?: string;
  targetAuthorId?: string;
}

interface RoundData {
  characterAssignments: Map<string, WantedCharacterAssignment>;
  characters: Map<string, WantedCharacterSubmission>;
  posters: Map<string, WantedPosterSubmission>;
  characterSubmittedPlayers: Set<string>;
  posterSubmittedPlayers: Set<string>;
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
  private characterResolve: (() => void) | null = null;
  private posterResolve: (() => void) | null = null;
  private votingResolve: (() => void) | null = null;
  private expectedCharacterPlayerIds: string[] = [];
  private expectedPosterPlayerIds: string[] = [];
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
    this.round = {
      characterAssignments: new Map(),
      characters: new Map(),
      posters: new Map(),
      characterSubmittedPlayers: new Set(),
      posterSubmittedPlayers: new Set(),
      votes: new Map(),
      votedPlayers: new Set(),
      results: null,
    };

    await this.runCharacterCreationPhase(playerIds);

    const createdCharacters = [...this.round.characters.values()].sort((a, b) => a.submittedAt - b.submittedAt);
    if (createdCharacters.length < MIN_PLAYERS) {
      this.broadcast("round_skipped", { reason: "Not enough outlaw characters were submitted" });
      return;
    }

    this.round.characterAssignments = buildCharacterAssignments(createdCharacters);

    const posterAuthorIds = [...this.round.characterAssignments.keys()];
    await this.runPosterCreationPhase(posterAuthorIds);

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
      case "wa_submit_character":
        this.handleCharacterSubmission(client, input);
        break;
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
      if (this.round.characterAssignments.has(oldId)) {
        const assignment = this.round.characterAssignments.get(oldId)!;
        this.round.characterAssignments.delete(oldId);
        this.round.characterAssignments.set(newId, assignment.creatorId === oldId
          ? { ...assignment, creatorId: newId }
          : assignment);
      }

      for (const [authorId, assignment] of [...this.round.characterAssignments.entries()]) {
        if (assignment.creatorId === oldId) {
          this.round.characterAssignments.set(authorId, { ...assignment, creatorId: newId });
        }
      }

      if (this.round.characters.has(oldId)) {
        const character = this.round.characters.get(oldId)!;
        this.round.characters.delete(oldId);
        character.creatorId = newId;
        this.round.characters.set(newId, character);
      }

      if (this.round.posters.has(oldId)) {
        const poster = this.round.posters.get(oldId)!;
        this.round.posters.delete(oldId);
        poster.authorId = newId;
        this.round.posters.set(newId, poster);
      }

      for (const poster of this.round.posters.values()) {
        if (poster.characterCreatorId === oldId) poster.characterCreatorId = newId;
      }

      if (this.round.characterSubmittedPlayers.delete(oldId)) this.round.characterSubmittedPlayers.add(newId);
      if (this.round.posterSubmittedPlayers.delete(oldId)) this.round.posterSubmittedPlayers.add(newId);
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
          characterCreatorId: result.characterCreatorId === oldId ? newId : result.characterCreatorId,
        }));
      }
    }

    this.expectedCharacterPlayerIds = this.expectedCharacterPlayerIds.map((id) => id === oldId ? newId : id);
    this.expectedPosterPlayerIds = this.expectedPosterPlayerIds.map((id) => id === oldId ? newId : id);
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
    this.characterResolve = null;
    this.posterResolve = null;
    this.votingResolve = null;
    this.expectedCharacterPlayerIds = [];
    this.expectedPosterPlayerIds = [];
    this.expectedVotingPlayerIds = [];
  }

  private activePlayers() {
    return [...this.room.state.players.values()].filter((player) => this.isPlayerActive(player));
  }

  private async runCharacterCreationPhase(playerIds: string[]) {
    const durationMs = CHARACTER_CREATION_DURATION_SECS * 1000;
    const serverTimestamp = Date.now();

    this.broadcast("wa_character_creation_start", {
      totalPlayers: playerIds.length,
      durationMs,
      serverTimestamp,
    });

    await this.waitForCharacters(playerIds);
  }

  private async runPosterCreationPhase(playerIds: string[]) {
    const durationMs = POSTER_SUBMISSION_DURATION_SECS * 1000;
    const serverTimestamp = Date.now();

    this.broadcast("wa_submission_start", {
      totalPlayers: playerIds.length,
      durationMs,
      serverTimestamp,
      maxBountyLength: MAX_BOUNTY_LENGTH,
    });

    for (const [authorId, character] of this.round!.characterAssignments.entries()) {
      this.send(authorId, "wa_assignment", {
        character,
        durationMs,
        serverTimestamp,
        maxBountyLength: MAX_BOUNTY_LENGTH,
      });
    }

    await this.waitForPosters(playerIds);
  }

  private waitForCharacters(playerIds: string[]): Promise<void> {
    this.expectedCharacterPlayerIds = [...playerIds];
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timeout);
        this.characterResolve = null;
        resolve();
      };

      this.characterResolve = () => finish();

      const timeout = setTimeout(() => finish(), CHARACTER_CREATION_DURATION_SECS * 1000);
      this.extraTimers.push(timeout);
    });
  }

  private waitForPosters(playerIds: string[]): Promise<void> {
    this.expectedPosterPlayerIds = [...playerIds];
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timeout);
        this.posterResolve = null;
        resolve();
      };

      this.posterResolve = () => finish();

      const timeout = setTimeout(() => finish(), POSTER_SUBMISSION_DURATION_SECS * 1000);
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

  private handleCharacterSubmission(client: Client, input: WantedAdInput): void {
    if (!this.round || !this.characterResolve) return;
    if (this.round.characterSubmittedPlayers.has(client.sessionId)) {
      this.send(client.sessionId, "wa_character_ack", {
        accepted: false,
        reason: "You already turned in your outlaw character.",
      });
      return;
    }

    const name = normalizeCharacterName(input.characterName ?? "");
    const description = normalizeCharacterDescription(input.characterDescription ?? "");
    const portraitDesign = typeof input.portraitDesign === "string" ? input.portraitDesign.slice(0, 20_000) : "";

    if (!name || !portraitDesign) {
      this.send(client.sessionId, "wa_character_ack", {
        accepted: false,
        reason: "Add a character name and drawing before submitting.",
      });
      return;
    }

    const character: WantedCharacterSubmission = {
      creatorId: client.sessionId,
      name,
      description,
      portraitDesign,
      submittedAt: Date.now(),
    };

    this.round.characters.set(client.sessionId, character);
    this.round.characterSubmittedPlayers.add(client.sessionId);

    this.send(client.sessionId, "wa_character_ack", {
      accepted: true,
      character,
    });
    this.broadcast("wa_character_progress", {
      submittedCount: this.round.characterSubmittedPlayers.size,
      totalPlayers: this.expectedCharacterPlayerIds.length,
    });

    if (haveAllExpectedPlayersResponded(this.round.characterSubmittedPlayers, this.expectedCharacterPlayerIds)) {
      this.characterResolve?.();
    }
  }

  private handlePosterSubmission(client: Client, input: WantedAdInput): void {
    if (!this.round || !this.posterResolve) return;
    if (this.round.posterSubmittedPlayers.has(client.sessionId)) {
      this.send(client.sessionId, "wa_submit_ack", {
        accepted: false,
        reason: "You already turned in your poster for this round.",
      });
      return;
    }

    const character = this.round.characterAssignments.get(client.sessionId);
    if (!character) return;

    const poster: WantedPosterSubmission = {
      authorId: client.sessionId,
      characterCreatorId: character.creatorId,
      characterName: character.name,
      characterDescription: character.description,
      portraitDesign: character.portraitDesign,
      condition: normalizeCondition(input.condition ?? ""),
      bounty: normalizeBounty(input.bounty),
      reason: normalizeReason(input.reason ?? ""),
      submittedAt: Date.now(),
    };

    this.round.posters.set(client.sessionId, poster);
    this.round.posterSubmittedPlayers.add(client.sessionId);

    this.send(client.sessionId, "wa_submit_ack", {
      accepted: true,
      poster,
    });
    this.broadcast("wa_submission_progress", {
      submittedCount: this.round.posterSubmittedPlayers.size,
      totalPlayers: this.expectedPosterPlayerIds.length,
    });

    if (haveAllExpectedPlayersResponded(this.round.posterSubmittedPlayers, this.expectedPosterPlayerIds)) {
      this.posterResolve?.();
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
