/**
 * server/src/games/registry-27-word-build/index.ts
 *
 * "Word Build" — team-based physical phone arrangement word game.
 *
 * Mechanic
 * ───────
 * - Players are split into 2 teams.
 * - A word (5–10 letters) is selected and split into consecutive fragments,
 *   one per team member's phone.
 * - Players physically arrange their phones in the correct order to spell
 *   the word within 60 seconds.
 * - One random phone per team has a "Done" button to lock in completion time.
 * - After both teams lock in (or time expires), the correct word is revealed.
 * - The "Done" button holder on each team confirms if their team got it right.
 * - Fastest correct team wins the round.
 *
 * Server messages → clients:
 *   "wb_round_setup"   { teams, myTeamId, myFragment, myFragmentIndex, hasDoneButton, roundDurationMs }
 *   "wb_round_go"      { serverTimestamp }
 *   "wb_team_done"     { teamId, timestamp }
 *   "wb_round_reveal"  { correctWord, validWords }
 *   "wb_confirm_start" { teamId, durationMs }
 *   "wb_confirm_received" {}
 *   "wb_round_result"  { teamResults, scores }
 *   "round_skipped"    { reason }
 *
 * Client messages ← players:
 *   { action: "wb_done" }
 *   { action: "wb_confirm", correct: boolean }
 */

import { Client } from "@colyseus/core";
import { BaseGame } from "../BaseGame";
import {
  selectWord,
  splitWordIntoFragments,
  assignTeams,
  scoreRoundResults,
  ROUND_DURATION_SECS,
  type TeamAssignment,
  type TeamResult,
  type WordEntry,
  type Fragment,
} from "./wordBuildLogic";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Time for self-report confirmation phase (ms). */
const CONFIRM_DURATION_MS = 15_000;

/** Time to display results before moving on (ms). */
const RESULTS_DISPLAY_MS = 5_000;

// ── Per-round tracking ────────────────────────────────────────────────────────

interface PlayerAssignment {
  sessionId: string;
  teamId: string;
  fragment: Fragment;
  hasDoneButton: boolean;
}

interface RoundData {
  word: WordEntry;
  teams: TeamAssignment[];
  assignments: Map<string, PlayerAssignment>;
  roundStartMs: number;
  roundDurationMs: number;

  /** Team completion times. */
  teamDone: Map<string, number>;

  /** Self-report results. */
  teamConfirm: Map<string, boolean>;

  /** Whether the round has ended. */
  ended: boolean;
}

// ── Input types ───────────────────────────────────────────────────────────────

interface WordBuildInput {
  action: "wb_done" | "wb_confirm";
  correct?: boolean;
}

// ── Game class ────────────────────────────────────────────────────────────────

export default class WordBuildGame extends BaseGame {
  static override requiresTV = false;
  static override supportsBracket = false;
  static override defaultRoundCount = 3;
  static override minRounds = 1;
  static override maxRounds = 10;
  static override hasInstructionsPhase = true;
  static override instructionsDelivery = "broadcast" as const;

  static override activityLevel: "none" | "some" | "full" = "some";
  static override requiresSameRoom = true;
  static override requiresSecondaryDisplay = false;

  private round: RoundData | null = null;
  private roundResolve: (() => void) | null = null;
  private usedWords: Set<string> = new Set();
  private pendingScores: Map<string, number> = new Map();
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

    if (players.length < 6) {
      this.broadcast("round_skipped", { reason: "Not enough connected players (need 6+)" });
      return;
    }

    // ── 1. Assign teams ───────────────────────────────────────────────────
    const playerIds = players.map((p) => p.id);
    const [teamA, teamB] = assignTeams(playerIds);
    const teams = [teamA, teamB];

    // ── 2. Select word ────────────────────────────────────────────────────
    // Pick a word that fits the smaller team size
    const minTeamSize = Math.min(teamA.playerIds.length, teamB.playerIds.length);
    const wordEntry = selectWord(minTeamSize, this.usedWords);

    if (!wordEntry) {
      this.broadcast("round_skipped", { reason: "No suitable words available" });
      return;
    }

    this.usedWords.add(wordEntry.word);

    // ── 3. Build assignments ──────────────────────────────────────────────
    const assignments = new Map<string, PlayerAssignment>();

    for (const team of teams) {
      const fragments = splitWordIntoFragments(wordEntry.word, team.playerIds.length);
      const doneButtonIndex = Math.floor(Math.random() * team.playerIds.length);

      for (let i = 0; i < team.playerIds.length; i++) {
        assignments.set(team.playerIds[i], {
          sessionId: team.playerIds[i],
          teamId: team.teamId,
          fragment: fragments[i],
          hasDoneButton: i === doneButtonIndex,
        });
      }
    }

    const now = Date.now();
    const roundDurationMs = ROUND_DURATION_SECS * 1000;

    this.round = {
      word: wordEntry,
      teams,
      assignments,
      roundStartMs: now,
      roundDurationMs,
      teamDone: new Map(),
      teamConfirm: new Map(),
      ended: false,
    };

    // ── 4. Send assignments to each player ────────────────────────────────
    for (const [sessionId, assignment] of assignments) {
      this.send(sessionId, "wb_round_setup", {
        teams: teams.map((t) => ({
          teamId: t.teamId,
          playerIds: t.playerIds,
          playerNames: t.playerIds.map((id) => this.room.state.players.get(id)?.name ?? "Unknown"),
        })),
        myTeamId: assignment.teamId,
        myFragment: assignment.fragment.letters,
        myFragmentIndex: assignment.fragment.index,
        hasDoneButton: assignment.hasDoneButton,
        roundDurationMs,
      });
    }

    // Also broadcast to TV/viewer
    this.broadcast("wb_round_go", {
      serverTimestamp: now,
      roundDurationMs,
      teams: teams.map((t) => ({
        teamId: t.teamId,
        playerNames: t.playerIds.map((id) => this.room.state.players.get(id)?.name ?? "Unknown"),
      })),
    });

    // Set round duration for client timers
    this.room.state.roundDurationSecs = ROUND_DURATION_SECS;

    // ── 5. Wait for both teams done or timeout ────────────────────────────
    await new Promise<void>((resolve) => {
      this.roundResolve = resolve;

      const timeout = setTimeout(() => {
        if (this.round && !this.round.ended) {
          this.round.ended = true;
          resolve();
        }
      }, roundDurationMs);

      this._extraTimers.push(timeout);
    });

    // ── 6. Reveal phase ──────────────────────────────────────────────────
    this.broadcast("wb_round_reveal", {
      correctWord: wordEntry.word,
      validWords: wordEntry.validArrangements,
    });

    // ── 7. Confirmation phase ────────────────────────────────────────────
    await this._runConfirmPhase();

    // ── 8. Compute results ───────────────────────────────────────────────
    this._computeAndBroadcastResults();

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
    const input = data as WordBuildInput;
    if (!input || !input.action) return;

    switch (input.action) {
      case "wb_done":
        this._handleDone(client);
        break;
      case "wb_confirm":
        this._handleConfirm(client, input.correct);
        break;
    }
  }

  override teardown(): void {
    super.teardown();
    for (const t of this._extraTimers) clearTimeout(t);
    this._extraTimers = [];
    this.round = null;
    this.roundResolve = null;
    this.pendingScores.clear();
  }

  // ── Input handlers ────────────────────────────────────────────────────────

  private _handleDone(client: Client): void {
    const rd = this.round;
    if (!rd || rd.ended) return;

    const assignment = rd.assignments.get(client.sessionId);
    if (!assignment || !assignment.hasDoneButton) return;

    // Already done?
    if (rd.teamDone.has(assignment.teamId)) return;

    const now = Date.now();
    rd.teamDone.set(assignment.teamId, now);

    this.broadcast("wb_team_done", {
      teamId: assignment.teamId,
      timestamp: now,
    });

    // Check if both teams are done
    if (rd.teamDone.size >= 2) {
      rd.ended = true;
      if (this.roundResolve) {
        this.roundResolve();
        this.roundResolve = null;
      }
    }
  }

  private _handleConfirm(client: Client, correct: boolean | undefined): void {
    const rd = this.round;
    if (!rd) return;

    const assignment = rd.assignments.get(client.sessionId);
    if (!assignment || !assignment.hasDoneButton) return;

    // Already confirmed?
    if (rd.teamConfirm.has(assignment.teamId)) return;

    rd.teamConfirm.set(assignment.teamId, correct === true);

    this.send(client.sessionId, "wb_confirm_received", {});

    // Check if both teams have confirmed
    if (rd.teamConfirm.size >= 2) {
      // Will resolve the confirm phase
    }
  }

  // ── Confirm phase ─────────────────────────────────────────────────────────

  private async _runConfirmPhase(): Promise<void> {
    const rd = this.round;
    if (!rd) return;

    // Tell each team's "Done" button holder to confirm
    for (const [, assignment] of rd.assignments) {
      if (assignment.hasDoneButton) {
        this.send(assignment.sessionId, "wb_confirm_start", {
          teamId: assignment.teamId,
          durationMs: CONFIRM_DURATION_MS,
        });
      }
    }

    await new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        if (rd.teamConfirm.size >= 2) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 200);

      const timeout = setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, CONFIRM_DURATION_MS);

      this._extraTimers.push(timeout);
    });
  }

  // ── Results ───────────────────────────────────────────────────────────────

  private _computeAndBroadcastResults(): void {
    const rd = this.round;
    if (!rd) return;

    const teamResults: TeamResult[] = rd.teams.map((team) => ({
      teamId: team.teamId,
      completionTimeMs: rd.teamDone.get(team.teamId) ?? null,
      selfReportCorrect: rd.teamConfirm.get(team.teamId) ?? null,
    }));

    const scores = scoreRoundResults(rd.teams, teamResults);

    // Store for scoreRound()
    this.pendingScores.clear();
    for (const [id, pts] of scores.entries()) {
      this.pendingScores.set(id, pts);
    }

    this.broadcast("wb_round_result", {
      teamResults: teamResults.map((tr) => ({
        teamId: tr.teamId,
        completionTimeMs: tr.completionTimeMs,
        selfReportCorrect: tr.selfReportCorrect,
        playerNames: rd.teams.find((t) => t.teamId === tr.teamId)
          ?.playerIds.map((id) => this.room.state.players.get(id)?.name ?? "Unknown") ?? [],
      })),
      scores: Object.fromEntries(scores),
      correctWord: rd.word.word,
      validWords: rd.word.validArrangements,
    });
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  private _activePlayers() {
    return [...this.room.state.players.values()].filter(
      (p) => p.isConnected && !p.isEliminated,
    );
  }
}
