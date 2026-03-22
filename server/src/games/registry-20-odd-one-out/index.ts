/**
 * server/src/games/registry-20-odd-one-out/index.ts
 *
 * "Odd One Out" — social deduction with subtle micro-actions.
 *
 * Game Rules
 * ──────────
 * • Each round, one or more players are secretly designated "odd".
 * • The "odd" players get a secret micro-action prompt (e.g., "Wink once
 *   every 10 seconds"). Normal players see NO action — just "You are normal".
 * • Players observe each other through repeated 10-second windows.
 * • Normal players can vote at ANY TIME during observation or the final
 *   voting phase. The odd player(s) do NOT vote — they earn points based
 *   on deception (incorrect guesses against them).
 * • Correct voters earn base points + a speed bonus. Incorrect voters get 0.
 * • The "odd" player(s) earn deception points for each incorrect vote.
 *
 * Server Flow
 * ───────────
 *   onLoad()    — reset player state
 *   runRound()  — assign roles → send prompts → observation windows (voting
 *                 open throughout) → final voting window → results
 *   scoreRound()— apply points
 *   handleInput()— handle "vote" and "acknowledge_prompt" messages
 *
 * Privacy
 * ───────
 * Roles and prompts are sent via room.send() (private messages), never placed
 * in the public schema, to prevent leaking who is "odd".
 */

import { Client } from "@colyseus/core";
import { BaseGame } from "../BaseGame";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Number of 10-second observation windows per round. */
const OBSERVATION_WINDOWS = 3;

/** Duration of each observation window in milliseconds. */
const WINDOW_DURATION_MS = 10_000;

/** Pause between windows for players to refocus (ms). */
const INTER_WINDOW_PAUSE_MS = 2_000;

/** Time allowed for voting (ms). */
const VOTING_DURATION_MS = 20_000;

/** Base points awarded for a correct vote. */
const CORRECT_VOTE_POINTS = 100;

/** Maximum speed bonus (earned by the first voter). */
const MAX_SPEED_BONUS = 50;

/** Points awarded to each "odd" player per incorrect vote against a non-odd player. */
const ODD_DECEPTION_POINTS = 30;

/** Time to display results before moving on (ms). */
const RESULTS_DISPLAY_MS = 6_000;

// ── Prompt pool ───────────────────────────────────────────────────────────────

/**
 * Each round selects two prompts: one for "normal" players, one for "odd" players.
 * Prompts are designed to be subtle and hard to distinguish at a glance.
 */
const PROMPT_PAIRS: { normal: string; odd: string }[] = [
  { normal: "Try not to blink", odd: "Blink slowly once every 10 seconds" },
  { normal: "Breathe only through your nose", odd: "Breathe only through your mouth" },
  { normal: "Keep both feet flat on the floor", odd: "Cross your legs or ankles" },
  { normal: "Keep your hands completely still", odd: "Tap your thumb against your fingers once every 10 seconds" },
  { normal: "Look straight ahead", odd: "Glance briefly to your left once every 10 seconds" },
  { normal: "Sit perfectly still", odd: "Shift your weight subtly once every 10 seconds" },
  { normal: "Rest your hands on your lap", odd: "Touch or rub the inside of your left wrist once every 10 seconds" },
  { normal: "Keep a neutral expression", odd: "Wink once every 10 seconds" },
  { normal: "Sit with your back straight", odd: "Lean slightly forward once every 10 seconds" },
  { normal: "Keep your mouth closed", odd: "Clear your throat softly once every 10 seconds" },
];

// ── Per-round tracking (not in schema) ────────────────────────────────────────

interface RoundData {
  /** Session IDs of the "odd" players this round. */
  oddPlayerIds: Set<string>;
  /** Map of voterId → suspectId. */
  votes: Map<string, string>;
  /** Map of voterId → epoch ms when vote was cast. */
  voteTimestamps: Map<string, number>;
  /** Epoch ms when voting phase started. */
  votingStartedAt: number;
  /** Which prompt pair index was used this round. */
  promptPairIndex: number;
}

// ── Game class ────────────────────────────────────────────────────────────────

export default class OddOneOutGame extends BaseGame {
  static override requiresTV = false;
  static override supportsBracket = false;
  static override defaultRoundCount = 3;
  static override minRounds = 1;
  static override maxRounds = 5;
  static override hasInstructionsPhase = true;
  static override instructionsDelivery = "private" as const;

  static override activityLevel: "none" | "some" | "full" = "none";
  static override requiresSameRoom = true;
  static override requiresSecondaryDisplay = false;

  private roundData: RoundData | null = null;
  private roundResolve: (() => void) | null = null;
  private usedPromptIndices: Set<number> = new Set();

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  protected override async onLoad(): Promise<void> {
    this.usedPromptIndices.clear();
    for (const p of this.room.state.players.values()) {
      p.score = 0;
      p.isReady = false;
      p.isEliminated = false;
    }
  }

  protected override async runRound(round: number): Promise<void> {
    const players = this._activePlayers();
    if (players.length < 2) {
      // Need at least 2 players for any deduction
      this.broadcast("round_skipped", { reason: "Not enough players (need 2+)" });
      return;
    }

    // 1. Assign roles
    const oddCount = this._oddCountForPlayerCount(players.length);
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    const oddPlayerIds = new Set(shuffled.slice(0, oddCount).map((p) => p.id));

    // 2. Pick a prompt pair (avoid repeats across rounds)
    const promptPairIndex = this._pickPromptPairIndex();
    const promptPair = PROMPT_PAIRS[promptPairIndex];

    this.roundData = {
      oddPlayerIds,
      votes: new Map(),
      voteTimestamps: new Map(),
      votingStartedAt: 0,
      promptPairIndex,
    };

    // 3. Send private prompts to each player
    //    Brief delay to ensure clients have mounted the in_round component
    //    after the phase state change (Colyseus patches at ~50ms intervals).
    await this.delay(200);

    // Normal players: role "normal", NO prompt (just told they're normal)
    // Odd players: role "odd", get the odd prompt
    for (const player of players) {
      const isOdd = oddPlayerIds.has(player.id);
      this.send(player.id, "assign_prompt", {
        role: isOdd ? "odd" : "normal",
        prompt: isOdd ? promptPair.odd : "",
        windowCount: OBSERVATION_WINDOWS,
        windowDurationMs: WINDOW_DURATION_MS,
      });
    }

    // Reset ready flags for prompt acknowledgement
    for (const p of this.room.state.players.values()) {
      p.isReady = false;
    }

    // 4. Wait for all players to acknowledge their prompt (with timeout)
    this.broadcast("phase_info", { subPhase: "prompt_acknowledge" });
    await this.waitForAllReady(15_000);

    // 5. Open voting at the start of observation — players can vote ANY TIME
    //    from now until the final voting window closes.
    //    Odd players are excluded from voting — only normal players vote.
    const voters = players.filter((p) => !oddPlayerIds.has(p.id));
    this.roundData.votingStartedAt = Date.now();
    this.broadcast("voting_open", {
      serverTimestamp: Date.now(),
      // Send ALL player IDs as vote targets (so normals can vote for anyone
      // including other normals), but mark who the voters are
      playerIds: players.map((p) => ({ id: p.id, name: p.name })),
      voterCount: voters.length,
    });

    // 6. Run observation windows (voting is open throughout)
    for (let w = 1; w <= OBSERVATION_WINDOWS; w++) {
      this.broadcast("window_start", {
        windowNumber: w,
        totalWindows: OBSERVATION_WINDOWS,
        durationMs: WINDOW_DURATION_MS,
        serverTimestamp: Date.now(),
        oddPrompt: promptPair.odd,
      });
      await this.delay(WINDOW_DURATION_MS);

      // Check if all votes are already in — can skip remaining windows
      if (this._allVotesIn()) break;

      if (w < OBSERVATION_WINDOWS) {
        this.broadcast("window_pause", {
          nextWindowIn: INTER_WINDOW_PAUSE_MS,
          serverTimestamp: Date.now(),
        });
        await this.delay(INTER_WINDOW_PAUSE_MS);

        if (this._allVotesIn()) break;
      }
    }

    // 7. Final voting window — "last chance" for anyone who hasn't voted
    if (!this._allVotesIn()) {
      this.broadcast("voting_final", {
        durationMs: VOTING_DURATION_MS,
        serverTimestamp: Date.now(),
        playerIds: players.map((p) => ({ id: p.id, name: p.name })),
      });

      // Wait for all votes or timeout
      await new Promise<void>((resolve) => {
        this.roundResolve = resolve;

        const checkVotes = setInterval(() => {
          if (this._allVotesIn()) {
            clearInterval(checkVotes);
            resolve();
          }
        }, 200);

        setTimeout(() => {
          clearInterval(checkVotes);
          resolve();
        }, VOTING_DURATION_MS);
      });

      this.roundResolve = null;
    }

    // 8. Reveal results
    const results = this._computeResults();
    this.broadcast("round_result", results);
    await this.delay(RESULTS_DISPLAY_MS);
  }

  protected override scoreRound(_round: number): void {
    if (!this.roundData) return;

    const results = this._computeResults();

    // Apply scores
    for (const [playerId, points] of Object.entries(results.scores)) {
      const player = this.room.state.players.get(playerId);
      if (player) {
        player.score += points;
      }
    }
  }

  override handleInput(client: Client, data: unknown): void {
    const input = data as { action?: string; suspectId?: string };
    if (!input || !input.action) return;

    switch (input.action) {
      case "acknowledge_prompt":
        this._handleAcknowledgePrompt(client);
        break;
      case "vote":
        this._handleVote(client, input.suspectId);
        break;
    }
  }

  override teardown(): void {
    super.teardown();
    this.roundData = null;
    this.roundResolve = null;
  }

  // ── Input handlers ────────────────────────────────────────────────────────

  private _handleAcknowledgePrompt(client: Client): void {
    const player = this.room.state.players.get(client.sessionId);
    if (player) {
      player.isReady = true;
    }
  }

  private _handleVote(client: Client, suspectId: string | undefined): void {
    if (!this.roundData || !suspectId) return;
    if (this.roundData.votingStartedAt === 0) return; // voting hasn't started

    const voterId = client.sessionId;

    // Odd players cannot vote
    if (this.roundData.oddPlayerIds.has(voterId)) return;

    // Can't vote for yourself
    if (suspectId === voterId) return;

    // Can't vote twice
    if (this.roundData.votes.has(voterId)) return;

    // Suspect must be a valid player
    if (!this.room.state.players.has(suspectId)) return;

    this.roundData.votes.set(voterId, suspectId);
    this.roundData.voteTimestamps.set(voterId, Date.now());

    // Notify the voter their vote was recorded
    this.send(voterId, "vote_confirmed", { suspectId });

    // Broadcast anonymous vote count update — only normal players count as voters
    const normalVoters = this._activePlayers().filter(
      (p) => !this.roundData!.oddPlayerIds.has(p.id),
    );
    this.broadcast("vote_count_update", {
      votesIn: this.roundData.votes.size,
      totalVoters: normalVoters.length,
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Return connected, non-eliminated players. */
  private _activePlayers() {
    return [...this.room.state.players.values()].filter(
      (p) => p.isConnected && !p.isEliminated,
    );
  }

  /** Determine how many "odd" players for a given player count. */
  private _oddCountForPlayerCount(playerCount: number): number {
    if (playerCount <= 3) return 1;
    if (playerCount <= 5) return 1;
    if (playerCount <= 8) return 2;
    return 3;
  }

  /** Pick a prompt pair index, avoiding repeats until all are used. */
  private _pickPromptPairIndex(): number {
    if (this.usedPromptIndices.size >= PROMPT_PAIRS.length) {
      this.usedPromptIndices.clear();
    }
    const available = PROMPT_PAIRS.map((_, i) => i).filter(
      (i) => !this.usedPromptIndices.has(i),
    );
    const idx = available[Math.floor(Math.random() * available.length)];
    this.usedPromptIndices.add(idx);
    return idx;
  }

  /** Check whether all normal (non-odd) players have voted. */
  private _allVotesIn(): boolean {
    if (!this.roundData) return true;
    const normalVoters = this._activePlayers().filter(
      (p) => !this.roundData!.oddPlayerIds.has(p.id),
    );
    return normalVoters.every((p) => this.roundData!.votes.has(p.id));
  }

  /** Compute results and per-player scores for the current round. */
  private _computeResults(): {
    oddPlayerIds: string[];
    votes: Record<string, string>;
    scores: Record<string, number>;
    promptPair: { normal: string; odd: string };
  } {
    if (!this.roundData) {
      return { oddPlayerIds: [], votes: {}, scores: {}, promptPair: PROMPT_PAIRS[0] };
    }

    const { oddPlayerIds, votes, voteTimestamps, votingStartedAt, promptPairIndex } = this.roundData;
    const promptPair = PROMPT_PAIRS[promptPairIndex];
    const scores: Record<string, number> = {};

    // Collect all vote timestamps for speed bonus calculation
    const correctVoteTimestamps: number[] = [];
    for (const [voterId, suspectId] of votes.entries()) {
      if (oddPlayerIds.has(suspectId)) {
        correctVoteTimestamps.push(voteTimestamps.get(voterId) ?? Infinity);
      }
    }
    correctVoteTimestamps.sort((a, b) => a - b);

    // Score voters (only normal players can vote)
    let incorrectVoteCount = 0;
    for (const [voterId, suspectId] of votes.entries()) {
      if (oddPlayerIds.has(suspectId)) {
        // Correct vote — base points + speed bonus
        const voteTime = voteTimestamps.get(voterId) ?? Infinity;
        const elapsedMs = Math.max(0, voteTime - votingStartedAt);
        // Speed bonus: faster voters get more. Linear decay over the total
        // observation + voting duration.
        const totalDurationMs = (OBSERVATION_WINDOWS * WINDOW_DURATION_MS) +
          ((OBSERVATION_WINDOWS - 1) * INTER_WINDOW_PAUSE_MS) + VOTING_DURATION_MS;
        const speedFraction = Math.max(0, 1 - elapsedMs / totalDurationMs);
        const speedBonus = Math.round(MAX_SPEED_BONUS * speedFraction);
        scores[voterId] = CORRECT_VOTE_POINTS + speedBonus;
      } else {
        // Wrong vote
        scores[voterId] = 0;
        incorrectVoteCount++;
      }
    }

    // Non-voters who are NORMAL get 0 (they should have voted)
    for (const p of this._activePlayers()) {
      if (!(p.id in scores) && !oddPlayerIds.has(p.id)) {
        scores[p.id] = 0;
        // Count non-voters as incorrect for deception purposes
        incorrectVoteCount++;
      }
    }

    // Odd players earn deception points for each incorrect/missing vote
    for (const oddId of oddPlayerIds) {
      scores[oddId] = incorrectVoteCount * ODD_DECEPTION_POINTS;
    }

    return {
      oddPlayerIds: [...oddPlayerIds],
      votes: Object.fromEntries(votes),
      scores,
      promptPair,
    };
  }
}
