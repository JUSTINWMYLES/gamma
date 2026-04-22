/**
 * server/src/games/registry-43-medical-story/index.ts
 *
 * "Medical Story" — collaborative medical comedy game.
 *
 * Mechanic
 * ───────
 * A patient arrives by ambulance and the lobby votes to assign roles:
 * patient, doctor, and nurse. The remaining players are bystanders (purely
 * cosmetic — roles don't affect gameplay). The group then works through
 * four creative submission + voting phases:
 *
 *   1. Complaint  — describe the patient's primary complaint + select a body part
 *   2. Diagnosis  — invent a fake medical term + select a body part
 *   3. Procedure  — devise an emergency procedure name + pick an action
 *   4. Catchphrase — complete "well that's why they call me the ___ doctor"
 *
 * After each submission phase, all players vote for the funniest entry.
 * The winning author earns points.
 *
 * Server messages → clients:
 *   "ms_role_phase"         { playerList, durationMs, serverTimestamp }
 *   "ms_roles_assigned"     { roles }
 *   "ms_phase_preview"      { phase, durationMs, serverTimestamp, history }
 *   "ms_submission_phase"   { phase, durationMs, serverTimestamp, bodyParts?, actions?, tests?, history, promptExamples? }
 *   "ms_submit_ack"         { accepted, reason? }
 *   "ms_voting_phase"       { phase, submissions, durationMs, serverTimestamp, history }
 *   "ms_vote_ack"           {}
 *   "ms_results_pending"    { phase, history }
 *   "ms_phase_result"       { phase, results, phaseWinner, points, history }
 *   "ms_round_recap"        { phaseWinners, scores, history, recapTimeline }
 *   "round_skipped"         { reason }
 *
 * Client messages ← players:
 *   { action: "ms_role_vote", patient: string, doctor: string, nurse: string }
 *   { action: "ms_submit", text: string, bodyPart?: string, action?: string, tests?: string[] }
 *   { action: "ms_vote", targetPlayerId: string }
 */

import { Client } from "@colyseus/core";
import { BaseGame } from "../BaseGame";
import {
  tallyRoleVotes,
  assignRolesRandomly,
  normalizeSubmission,
  isValidBodyPart,
  isValidAction,
  normalizeFunnyTests,
  haveAllExpectedPlayersResponded,
  tallySubmissionVotes,
  computePhasePoints,
  BODY_PARTS,
  ACTIONS,
  FUNNY_TESTS,
  PHASES,
  ROLE_VOTE_DURATION_SECS,
  SUBMISSION_DURATION_SECS,
  PHASE_PREVIEW_SECS,
  VOTING_DURATION_SECS,
  RESULTS_PENDING_MS,
  RESULTS_DISPLAY_MS,
  RECAP_DISPLAY_MS,
  RECAP_STEP_MS,
  getPhaseVoteWeight,
  type Phase as GamePhase,
  type Role,
  type Submission,
  type VoteResult,
} from "./medicalStoryLogic";

// ── Input types ───────────────────────────────────────────────────────────────

interface MedicalStoryInput {
  action: "ms_role_vote" | "ms_submit" | "ms_vote";
  // role vote
  patient?: string;
  doctor?: string;
  nurse?: string;
  // submission
  text?: string;
  bodyPart?: string;
  actionName?: string; // "action" conflicts with the action field
  tests?: string[];
  // vote
  targetPlayerId?: string;
}

interface PhaseHistoryEntry {
  phase: GamePhase;
  winner: VoteResult | null;
}

interface RecapTimelineEntry {
  phase: GamePhase;
  revealAtMs: number;
  winner: VoteResult | null;
}

// ── Per-round tracking ────────────────────────────────────────────────────────

interface RoundData {
  /** Assigned roles for this round. */
  roles: Map<string, Role>;
  /** Role votes: voterId → { patient, doctor, nurse } */
  roleVotes: Map<string, { patient: string; doctor: string; nurse: string }>;
  /** Current creative phase. */
  currentPhase: GamePhase | null;
  /** Submissions for the current phase. */
  submissions: Map<string, Submission>;
  /** Votes for the current phase: voterId → targetPlayerId */
  phaseVotes: Map<string, string>;
  /** Players who have submitted. */
  submittedPlayers: Set<string>;
  /** Players who have voted. */
  votedPlayers: Set<string>;
  /** Winners per phase. */
  phaseWinners: Map<GamePhase, VoteResult | null>;
  /** Ordered history of revealed phase winners for the round. */
  history: PhaseHistoryEntry[];
}

// ── Game class ────────────────────────────────────────────────────────────────

export default class MedicalStoryGame extends BaseGame {
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
  private _extraTimers: ReturnType<typeof setTimeout>[] = [];
  private roleVoteTimeout: ReturnType<typeof setTimeout> | null = null;
  private submissionTimeout: ReturnType<typeof setTimeout> | null = null;
  private votingTimeout: ReturnType<typeof setTimeout> | null = null;

  // Resolve callbacks for async phase waits
  private roleVoteResolve: (() => void) | null = null;
  private submissionResolve: (() => void) | null = null;
  private votingResolve: (() => void) | null = null;
  private expectedRoleVotePlayerIds: string[] = [];
  private expectedSubmissionPlayerIds: string[] = [];
  private expectedVotingPlayerIds: string[] = [];

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

    if (players.length < 3) {
      this.broadcast("round_skipped", { reason: "Not enough connected players (need 3+)" });
      return;
    }

    const playerIds = players.map((p) => p.id);

    this.round = {
      roles: new Map(),
      roleVotes: new Map(),
      currentPhase: null,
      submissions: new Map(),
      phaseVotes: new Map(),
      submittedPlayers: new Set(),
      votedPlayers: new Set(),
      phaseWinners: new Map(),
      history: [],
    };

    // ── 1. Role voting ──────────────────────────────────────────────────────

    const playerList = players.map((p) => ({ id: p.id, name: p.name }));

    this.broadcast("ms_role_phase", {
      playerList,
      durationMs: ROLE_VOTE_DURATION_SECS * 1000,
      serverTimestamp: Date.now(),
    });

    await this._waitForRoleVotes(playerIds);

    // Tally or assign randomly if not enough votes
    let roles: Map<string, Role>;
    if (this.round.roleVotes.size > 0) {
      roles = tallyRoleVotes(this.round.roleVotes, playerIds);
    } else {
      roles = assignRolesRandomly(playerIds);
    }
    this.round.roles = roles;

    // Broadcast assigned roles
    const rolesObj: Record<string, Role> = {};
    for (const [id, role] of roles.entries()) {
      rolesObj[id] = role;
    }
    this.broadcast("ms_roles_assigned", { roles: rolesObj });
    await this.delay(3000);

    // ── 2–5. Creative phases ────────────────────────────────────────────────

    for (const phase of PHASES) {
      this.round.currentPhase = phase;
      this.round.submissions.clear();
      this.round.phaseVotes.clear();
      this.round.submittedPlayers.clear();
      this.round.votedPlayers.clear();

      // ── Phase preview (10-second info screen before countdown) ────────
      this.broadcast("ms_phase_preview", {
        phase,
        durationMs: PHASE_PREVIEW_SECS * 1000,
        serverTimestamp: Date.now(),
        history: this._getPhaseHistory(),
      });
      await this.delay(PHASE_PREVIEW_SECS * 1000);

      // ── Submission phase ──────────────────────────────────────────────
      this.broadcast("ms_submission_phase", {
        phase,
        durationMs: SUBMISSION_DURATION_SECS * 1000,
        serverTimestamp: Date.now(),
        bodyParts: phase === "complaint" ? [...BODY_PARTS] : undefined,
        actions: phase === "procedure" ? [...ACTIONS] : undefined,
        tests: phase === "diagnosis" ? [...FUNNY_TESTS] : undefined,
        promptExamples: phase === "catchphrase"
          ? [
              "the coupon surgeon",
              "Dr. Oops-But-It-Worked",
              "the allergic-to-bad-vibes specialist",
            ]
          : undefined,
        history: this._getPhaseHistory(),
        // 3D scene placeholder: body part selector, action animation viewer
        scene3dPlaceholder: this._get3DPlaceholder(phase, "submission"),
      });

      await this._waitForSubmissions(playerIds);

      const submissions = [...this.round.submissions.values()];

      if (submissions.length === 0) {
        // Skip voting if no submissions
        this.round.phaseWinners.set(phase, null);
        this.round.history.push({ phase, winner: null });
        continue;
      }

      // ── Voting phase ──────────────────────────────────────────────────
      const submissionList = submissions.map((s) => ({
        playerId: s.playerId,
        text: s.text,
        bodyPart: s.bodyPart,
        action: s.action,
        tests: s.tests,
      }));

      const expectedVoterIds = playerIds.filter((playerId) => submissions.some((submission) => submission.playerId !== playerId));

      this.broadcast("ms_voting_phase", {
        phase,
        submissions: submissionList,
        durationMs: VOTING_DURATION_SECS * 1000,
        serverTimestamp: Date.now(),
        history: this._getPhaseHistory(),
        // 3D scene placeholder: action preview animations
        scene3dPlaceholder: this._get3DPlaceholder(phase, "voting"),
      });

      await this._waitForVotes(expectedVoterIds);

      // ── Tally and score ───────────────────────────────────────────────
      const results = tallySubmissionVotes(submissions, this.round.phaseVotes, this._getVoteWeights(phase));
      const points = computePhasePoints(results, playerIds.length);

      // Accumulate pending scores
      for (const [id, pts] of points.entries()) {
        this.pendingScores.set(id, (this.pendingScores.get(id) ?? 0) + pts);
      }

      const winner = results.length > 0 ? results[0] : null;
      this.round.phaseWinners.set(phase, winner);
      this.round.history.push({ phase, winner });

       this.broadcast("ms_results_pending", {
         phase,
         history: this._getPhaseHistory(),
       });

       await this.delay(RESULTS_PENDING_MS);

       this.broadcast("ms_phase_result", {
         phase,
         results,
         phaseWinner: winner,
        points: Object.fromEntries(points),
        history: this._getPhaseHistory(),
        // 3D scene placeholder: winner celebration animation
        scene3dPlaceholder: this._get3DPlaceholder(phase, "result"),
      });

      await this.delay(RESULTS_DISPLAY_MS);
    }

    // ── Round recap ─────────────────────────────────────────────────────────

    const phaseWinnersObj: Record<string, VoteResult | null> = {};
    for (const [phase, winner] of this.round.phaseWinners.entries()) {
      phaseWinnersObj[phase] = winner;
    }

    this.broadcast("ms_round_recap", {
      phaseWinners: phaseWinnersObj,
      scores: Object.fromEntries(this.pendingScores),
      roles: rolesObj,
      history: this._getPhaseHistory(),
      recapTimeline: this._getRecapTimeline(),
    });

    await this.delay(RECAP_DISPLAY_MS);
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
    const input = data as MedicalStoryInput;
    if (!input || !input.action) return;

    switch (input.action) {
      case "ms_role_vote":
        this._handleRoleVote(client, input);
        break;
      case "ms_submit":
        this._handleSubmission(client, input);
        break;
      case "ms_vote":
        this._handleVote(client, input);
        break;
    }
  }

  override teardown(): void {
    super.teardown();
    this._clearRoleVoteTimeout();
    this._clearSubmissionTimeout();
    this._clearVotingTimeout();
    for (const t of this._extraTimers) clearTimeout(t);
    this._extraTimers = [];
    this.round = null;
    this.roleVoteResolve = null;
    this.submissionResolve = null;
    this.votingResolve = null;
    this.expectedRoleVotePlayerIds = [];
    this.expectedSubmissionPlayerIds = [];
    this.expectedVotingPlayerIds = [];
    this.pendingScores.clear();
  }

  // ── Phase wait helpers ────────────────────────────────────────────────────

  private _clearRoleVoteTimeout(): void {
    if (!this.roleVoteTimeout) return;
    clearTimeout(this.roleVoteTimeout);
    this.roleVoteTimeout = null;
  }

  private _clearSubmissionTimeout(): void {
    if (!this.submissionTimeout) return;
    clearTimeout(this.submissionTimeout);
    this.submissionTimeout = null;
  }

  private _clearVotingTimeout(): void {
    if (!this.votingTimeout) return;
    clearTimeout(this.votingTimeout);
    this.votingTimeout = null;
  }

  private _waitForRoleVotes(playerIds: string[]): Promise<void> {
    return new Promise<void>((resolve) => {
      this.expectedRoleVotePlayerIds = [...playerIds];
      this._clearRoleVoteTimeout();

      const finish = () => {
        this._clearRoleVoteTimeout();
        this.roleVoteResolve = null;
        resolve();
      };

      this.roleVoteResolve = finish;

      const timeout = setTimeout(finish, ROLE_VOTE_DURATION_SECS * 1000);

      this.roleVoteTimeout = timeout;
      this._extraTimers.push(timeout);
      this._checkRoleVotesComplete(playerIds);
    });
  }

  private _checkRoleVotesComplete(playerIds: string[]): void {
    const rd = this.round;
    if (!rd || !this.roleVoteResolve) return;

    if (haveAllExpectedPlayersResponded(playerIds, rd.roleVotes.keys())) {
      this.roleVoteResolve();
    }
  }

  private _waitForSubmissions(playerIds: string[]): Promise<void> {
    return new Promise<void>((resolve) => {
      this.expectedSubmissionPlayerIds = [...playerIds];
      this._clearSubmissionTimeout();

      const finish = () => {
        this._clearSubmissionTimeout();
        this.submissionResolve = null;
        resolve();
      };

      this.submissionResolve = finish;

      const timeout = setTimeout(finish, SUBMISSION_DURATION_SECS * 1000);

      this.submissionTimeout = timeout;
      this._extraTimers.push(timeout);
      this._checkSubmissionsComplete(playerIds);
    });
  }

  private _checkSubmissionsComplete(playerIds: string[]): void {
    const rd = this.round;
    if (!rd || !this.submissionResolve) return;

    if (haveAllExpectedPlayersResponded(playerIds, rd.submittedPlayers)) {
      this.submissionResolve();
    }
  }

  private _waitForVotes(playerIds: string[]): Promise<void> {
    return new Promise<void>((resolve) => {
      this.expectedVotingPlayerIds = [...playerIds];
      this._clearVotingTimeout();

      const finish = () => {
        this._clearVotingTimeout();
        this.votingResolve = null;
        resolve();
      };

      this.votingResolve = finish;

      const timeout = setTimeout(finish, VOTING_DURATION_SECS * 1000);

      this.votingTimeout = timeout;
      this._extraTimers.push(timeout);
      this._checkVotesComplete(playerIds);
    });
  }

  private _checkVotesComplete(playerIds: string[]): void {
    const rd = this.round;
    if (!rd || !this.votingResolve) return;

    if (haveAllExpectedPlayersResponded(playerIds, rd.votedPlayers)) {
      this.votingResolve();
    }
  }

  // ── Input handlers ────────────────────────────────────────────────────────

  private _handleRoleVote(client: Client, input: MedicalStoryInput): void {
    const rd = this.round;
    if (!rd || !this.roleVoteResolve) return;
    if (!input.patient || !input.doctor || !input.nurse) return;

    // Validate that voted players exist
    if (!this.expectedRoleVotePlayerIds.includes(input.patient)) return;
    if (!this.expectedRoleVotePlayerIds.includes(input.doctor)) return;
    if (!this.expectedRoleVotePlayerIds.includes(input.nurse)) return;

    // All three must be different
    if (input.patient === input.doctor || input.patient === input.nurse || input.doctor === input.nurse) return;

    rd.roleVotes.set(client.sessionId, {
      patient: input.patient,
      doctor: input.doctor,
      nurse: input.nurse,
    });

    this._checkRoleVotesComplete(this.expectedRoleVotePlayerIds);
  }

  private _handleSubmission(client: Client, input: MedicalStoryInput): void {
    const rd = this.round;
    if (!rd || !rd.currentPhase) return;

    // Timer already expired — reject gracefully so client doesn't stay stuck
    if (!this.submissionResolve) {
      this.send(client.sessionId, "ms_submit_ack", {
        accepted: false,
        reason: "Time's up! Submission window has closed.",
      });
      return;
    }

    // Already submitted
    if (rd.submittedPlayers.has(client.sessionId)) {
      this.send(client.sessionId, "ms_submit_ack", {
        accepted: false,
        reason: "You already submitted for this phase.",
      });
      return;
    }

    const text = normalizeSubmission(input.text ?? "");
    if (!text) {
      this.send(client.sessionId, "ms_submit_ack", {
        accepted: false,
        reason: "Submission cannot be empty.",
      });
      return;
    }

    const submission: Submission = { playerId: client.sessionId, text };

    // Validate body part for complaint phase
    if (rd.currentPhase === "complaint") {
      if (!input.bodyPart || !isValidBodyPart(input.bodyPart)) {
        this.send(client.sessionId, "ms_submit_ack", {
          accepted: false,
          reason: "Choose a valid body part before submitting.",
        });
        return;
      }
      submission.bodyPart = input.bodyPart;
    }

    if (rd.currentPhase === "diagnosis") {
      submission.tests = normalizeFunnyTests(input.tests ?? []);
    }

    // Validate action for procedure phase
    if (rd.currentPhase === "procedure") {
      if (!input.actionName || !isValidAction(input.actionName)) {
        this.send(client.sessionId, "ms_submit_ack", {
          accepted: false,
          reason: "Choose a valid action before submitting.",
        });
        return;
      }
      submission.action = input.actionName;
    }

    rd.submissions.set(client.sessionId, submission);
    rd.submittedPlayers.add(client.sessionId);

    this.send(client.sessionId, "ms_submit_ack", { accepted: true });

    this._checkSubmissionsComplete(this.expectedSubmissionPlayerIds);
  }

  private _handleVote(client: Client, input: MedicalStoryInput): void {
    const rd = this.round;
    if (!rd || !this.votingResolve) return;

    // Already voted
    if (rd.votedPlayers.has(client.sessionId)) return;

    const targetId = input.targetPlayerId;
    if (!targetId) return;

    // Can't vote for yourself
    if (targetId === client.sessionId) return;

    // Must be a valid submission author
    if (!rd.submissions.has(targetId)) return;

    rd.phaseVotes.set(client.sessionId, targetId);
    rd.votedPlayers.add(client.sessionId);

    this.send(client.sessionId, "ms_vote_ack", {});

    this._checkVotesComplete(this.expectedVotingPlayerIds);
  }

  // ── 3D Placeholder ────────────────────────────────────────────────────────

  /**
   * Returns placeholder metadata for future Three.js 3D scenes.
   * These will be replaced with actual 3D scene configurations later.
   */
  private _get3DPlaceholder(
    phase: GamePhase,
    subPhase: "submission" | "voting" | "result",
  ): { type: string; description: string } {
    const placeholders: Record<string, Record<string, { type: string; description: string }>> = {
      complaint: {
        submission: {
          type: "body_selector_3d",
          description: "3D body model for selecting the affected area. Players tap on body parts to choose the primary complaint location.",
        },
        voting: {
          type: "body_highlight_3d",
          description: "3D body model highlighting each submission's selected body part during voting.",
        },
        result: {
          type: "complaint_reveal_3d",
          description: "3D animation showing the winning complaint with body part highlighted.",
        },
      },
      diagnosis: {
        submission: {
          type: "diagnosis_lab_3d",
          description: "Comedy lab station showing the fake diagnosis and optional funny tests players ran before deciding.",
        },
        voting: {
          type: "diagnosis_cards_3d",
          description: "3D floating medical charts showing each diagnosis for voting.",
        },
        result: {
          type: "diagnosis_reveal_3d",
          description: "3D animation revealing the winning fake diagnosis with dramatic effect.",
        },
      },
      procedure: {
        submission: {
          type: "action_preview_3d",
          description: "3D character performing preview of each action (Punch, Slap, Shock, etc.) for player to choose from.",
        },
        voting: {
          type: "action_playback_3d",
          description: "3D animations of each procedure action playing alongside submission text during voting.",
        },
        result: {
          type: "procedure_reveal_3d",
          description: "3D surgery/action scene animation for the winning procedure.",
        },
      },
      catchphrase: {
        submission: {
          type: "doctor_avatar_3d",
          description: '3D doctor character with speech bubble for a more open-ended boast: "That\'s why they call me ___."',
        },
        voting: {
          type: "catchphrase_display_3d",
          description: "3D podium with each catchphrase displayed for voting.",
        },
        result: {
          type: "catchphrase_celebration_3d",
          description: "3D doctor character celebrating with the winning catchphrase.",
        },
      },
    };

    return placeholders[phase]?.[subPhase] ?? {
      type: "placeholder",
      description: "3D scene placeholder — to be implemented with Three.js",
    };
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  private _activePlayers() {
    return [...this.room.state.players.values()].filter(
      (p) => this.isPlayerActive(p),
    );
  }

  private _getVoteWeights(phase: GamePhase): Map<string, number> {
    const weights = new Map<string, number>();
    if (!this.round) return weights;

    for (const [playerId, role] of this.round.roles.entries()) {
      weights.set(playerId, getPhaseVoteWeight(role, phase));
    }

    return weights;
  }

  private _getPhaseHistory(): PhaseHistoryEntry[] {
    return this.round ? this.round.history.map((entry) => ({ ...entry })) : [];
  }

  private _getRecapTimeline(): RecapTimelineEntry[] {
    return PHASES.map((phase, index) => ({
      phase,
      revealAtMs: index * RECAP_STEP_MS,
      winner: this.round?.phaseWinners.get(phase) ?? null,
    }));
  }
}
