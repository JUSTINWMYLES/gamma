import { Client } from "@colyseus/core";
import { BaseGame } from "../BaseGame";
import { MAX_DESIGN_PAYLOAD_CHARS } from "../../utils/designPayload";
import { fetchKlipyMedia } from "./klipyMedia";
import {
  BUFFERING_MAX_WAIT_MS,
  buildFallbackScript,
  computeRoundPoints,
  createHeadlineAssignments,
  createPresentationOrder,
  DEFAULT_VOICE_PRESET_ID,
  FALLBACK_MEDIA_ENTRY,
  FALLBACK_VOICE_OPTIONS,
  type BroadcastSubmission,
  type HeadlineSubmission,
  type NormalizedMediaEntry,
  type VoiceOption,
  haveAllExpectedPlayersResponded,
  HEADLINE_SUBMISSION_DURATION_MS,
  MIN_PLAYERS,
  normalizeHeadline,
  normalizeMediaEntry,
  normalizeScript,
  normalizeSpokenText,
  PARTICIPATION_POINTS,
  PRESENTATION_END_HOLD_MS,
  PRESENTATION_EXTRA_WAIT_MS,
  PRESENTATION_PREPARE_MS,
  SCRIPT_VOICE_DURATION_MS,
  GIF_SELECTION_DURATION_MS,
  LOGO_CREATION_DURATION_MS,
  tallyBroadcastVotes,
  trimTextToSpeechBudget,
  validateSpokenTextWithinBudget,
  VOTING_DURATION_MS,
  RESULTS_DISPLAY_MS,
  ASSIGNMENT_REVEAL_DURATION_MS,
  estimateSpeechMs,
  pickFallbackHeadline,
  isAllowedMediaSelection,
  MAX_SPOKEN_DURATION_MS,
} from "./newsBroadcastLogic";
import {
  createTTSJob,
  deleteRoomArtifacts,
  fetchAvailableVoices,
  getTTSJob,
  isTTSEnabled,
  updateTTSJobPriority,
} from "./ttsApiClient";

type Stage =
  | "headline_submission"
  | "assignment_reveal"
  | "script_voice_submission"
  | "gif_selection"
  | "logo_creation"
  | "buffering"
  | "presentation"
  | "voting"
  | "results";

interface BroadcastDraft {
  media: NormalizedMediaEntry | null;
  script: string;
  voicePresetId: string;
  voiceLabel: string;
  logoDesign: string;
  updatedAt: number;
}

interface SessionData {
  seed: number;
  roundId: string;
  stage: Stage;
  voices: VoiceOption[];
  headlineDrafts: Map<string, string>;
  headlineSubmissions: Map<string, HeadlineSubmission>;
  headlineAssignments: Map<string, string>;
  assignedHeadlines: Map<string, string>;
  broadcastDrafts: Map<string, BroadcastDraft>;
  broadcastSubmissions: Map<string, BroadcastSubmission>;
  allowedMediaUrls: Set<string>;
  scriptVoiceSubmitted: Set<string>;
  gifSelectedPlayers: Set<string>;
  logoSubmittedPlayers: Set<string>;
  submittedPlayers: Set<string>;
  votedPlayers: Set<string>;
  votes: Map<string, string>;
  presentationOrder: string[];
  currentPresentationIndex: number;
  cleanupRequested: boolean;
}

interface NewsBroadcastInput {
  action?: string;
  text?: string;
  script?: string;
  query?: string;
  targetId?: string;
  voicePresetId?: string;
  voiceLabel?: string;
  media?: unknown;
  logoDesign?: string;
}

export default class NewsBroadcastGame extends BaseGame {
  static override requiresTV = true;
  static override supportsBracket = false;
  static override defaultRoundCount = 1;
  static override minRounds = 1;
  static override maxRounds = 1;
  static override hasInstructionsPhase = true;
  static override instructionsDelivery = "broadcast" as const;

  static override activityLevel: "none" | "some" | "full" = "none";
  static override requiresSameRoom = true;
  static override requiresSecondaryDisplay = true;

  private session: SessionData | null = null;
  private pendingScores: Map<string, number> = new Map();

  protected override async onLoad(): Promise<void> {
    for (const player of this.room.state.players.values()) {
      player.score = 0;
      player.isReady = false;
      player.isEliminated = false;
    }
  }

  protected override async runRound(round: number): Promise<void> {
    const players = this._activePlayers();
    if (players.length < MIN_PLAYERS) {
      this.broadcast("round_skipped", { reason: `Need at least ${MIN_PLAYERS} connected players` });
      return;
    }

    const roundSeed = Date.now();
    const voices = await this._resolveVoices();
    const roundId = `round-${round}`;

    this.session = {
      seed: roundSeed,
      roundId,
      stage: "headline_submission",
      voices,
      headlineDrafts: new Map(),
      headlineSubmissions: new Map(),
      headlineAssignments: new Map(),
      assignedHeadlines: new Map(),
      broadcastDrafts: new Map(),
      broadcastSubmissions: new Map(),
      allowedMediaUrls: new Set([FALLBACK_MEDIA_ENTRY.previewUrl, FALLBACK_MEDIA_ENTRY.fallbackImageUrl].filter(Boolean)),
      scriptVoiceSubmitted: new Set(),
      gifSelectedPlayers: new Set(),
      logoSubmittedPlayers: new Set(),
      submittedPlayers: new Set(),
      votedPlayers: new Set(),
      votes: new Map(),
      presentationOrder: [],
      currentPresentationIndex: -1,
      cleanupRequested: false,
    };

    const playerIds = players.map((player) => player.id);

    this.broadcast("headline_submission_start", {
      durationMs: HEADLINE_SUBMISSION_DURATION_MS,
      serverTimestamp: Date.now(),
      totalPlayers: playerIds.length,
    });
    await this._waitForResponses(() => haveAllExpectedPlayersResponded(new Set(this.session?.headlineSubmissions.keys() ?? []), playerIds), HEADLINE_SUBMISSION_DURATION_MS);
    if (this.isCancelled() || !this.session) return;

    this._finalizeHeadlineSubmissions(players);
    if (this.isCancelled() || !this.session) return;

    this.session.stage = "assignment_reveal";
    this._assignHeadlines(playerIds);
    this.broadcast("headline_assignment_reveal", {
      durationMs: ASSIGNMENT_REVEAL_DURATION_MS,
      serverTimestamp: Date.now(),
    });
    await this.delay(ASSIGNMENT_REVEAL_DURATION_MS);
    if (this.isCancelled() || !this.session) return;

    this.session.stage = "script_voice_submission";
    this.broadcast("script_voice_submission_start", {
      durationMs: SCRIPT_VOICE_DURATION_MS,
      serverTimestamp: Date.now(),
      voices: this.session.voices,
      totalPlayers: playerIds.length,
    });
    await this._waitForResponses(() => haveAllExpectedPlayersResponded(this.session?.scriptVoiceSubmitted ?? new Set(), playerIds), SCRIPT_VOICE_DURATION_MS);
    if (this.isCancelled() || !this.session) return;

    await this._finalizeScriptVoiceSubmissions(players);
    if (this.isCancelled() || !this.session) return;

    this.session.stage = "gif_selection";
    this.broadcast("gif_selection_start", {
      durationMs: GIF_SELECTION_DURATION_MS,
      serverTimestamp: Date.now(),
      totalPlayers: playerIds.length,
      assignments: players.map((player) => ({
        playerId: player.id,
        playerName: player.name,
        assignedHeadline: this.session?.assignedHeadlines.get(player.id) ?? "Breaking update incoming.",
      })),
    });
    await this._waitForResponses(() => haveAllExpectedPlayersResponded(this.session?.gifSelectedPlayers ?? new Set(), playerIds), GIF_SELECTION_DURATION_MS);
    if (this.isCancelled() || !this.session) return;

    this.session.stage = "logo_creation";
    this.broadcast("logo_creation_start", {
      durationMs: LOGO_CREATION_DURATION_MS,
      serverTimestamp: Date.now(),
      totalPlayers: playerIds.length,
    });
    await this._waitForResponses(() => haveAllExpectedPlayersResponded(this.session?.logoSubmittedPlayers ?? new Set(), playerIds), LOGO_CREATION_DURATION_MS);
    if (this.isCancelled() || !this.session) return;

    await this._finalizeBroadcastSubmissions(players);
    if (this.isCancelled() || !this.session) return;

    this.session.presentationOrder = createPresentationOrder([...this.session.broadcastSubmissions.keys()], this.session.seed + 2);
    this.session.stage = "buffering";
    await this._refreshAllTTSStatuses();
    await this._promoteUpcomingJobs(0);

    this.broadcast("broadcast_buffering_start", {
      durationMs: BUFFERING_MAX_WAIT_MS,
      serverTimestamp: Date.now(),
      targetReadyCount: Math.min(2, this._submittedEntryCountWithJobs()),
    });
    await this._waitForInitialReady();
    if (this.isCancelled() || !this.session) return;

    this.session.stage = "presentation";
    for (let index = 0; index < this.session.presentationOrder.length; index++) {
      if (this.isCancelled() || !this.session) return;

      this.session.currentPresentationIndex = index;
      const playerId = this.session.presentationOrder[index];
      const entry = this.session.broadcastSubmissions.get(playerId);
      if (!entry) continue;

      await this._refreshAllTTSStatuses();
      await this._promoteUpcomingJobs(index);

      this.broadcast("presentation_prepare", {
        index,
        total: this.session.presentationOrder.length,
        upNext: {
          playerId: entry.playerId,
          playerName: entry.playerName,
          assignedHeadline: entry.assignedHeadline,
        },
        durationMs: PRESENTATION_PREPARE_MS,
        serverTimestamp: Date.now(),
      });
      await this.delay(PRESENTATION_PREPARE_MS);
      if (this.isCancelled() || !this.session) return;

      await this._waitForPresentationReady(entry);
      await this._refreshEntryTTSStatus(entry);

      const artifactReady = entry.ttsStatus === "ready" && !!entry.ttsJobId;
      const presentationDurationMs = artifactReady
        ? Math.min(MAX_SPOKEN_DURATION_MS, Math.max(5_000, entry.audioDurationMs ?? entry.estimatedSpeechMs))
        : Math.min(8_000, Math.max(4_000, entry.estimatedSpeechMs));

      this.broadcast("presentation_start", {
        index,
        total: this.session.presentationOrder.length,
        entry: {
          playerId: entry.playerId,
          playerName: entry.playerName,
          assignedHeadline: entry.assignedHeadline,
          script: entry.script,
          voicePresetId: entry.voicePresetId,
          voiceLabel: entry.voiceLabel,
          selectedMedia: entry.selectedMedia,
          estimatedSpeechMs: entry.estimatedSpeechMs,
          artifactJobId: artifactReady ? entry.ttsJobId : null,
          artifactReady,
          captionsOnly: !artifactReady,
        },
        durationMs: presentationDurationMs,
        serverTimestamp: Date.now(),
      });
      await this.delay(presentationDurationMs + PRESENTATION_END_HOLD_MS);
      if (this.isCancelled() || !this.session) return;
      this.broadcast("presentation_end", { index, playerId: entry.playerId });
    }

    if (this.isCancelled() || !this.session) return;

    this.session.stage = "voting";
    const votingEntries = this.session.presentationOrder
      .map((playerId) => this.session?.broadcastSubmissions.get(playerId))
      .filter((entry): entry is BroadcastSubmission => Boolean(entry))
      .map((entry) => ({
        playerId: entry.playerId,
        playerName: entry.playerName,
        assignedHeadline: entry.assignedHeadline,
        selectedMedia: entry.selectedMedia,
      }));

    this.broadcast("voting_start", {
      durationMs: VOTING_DURATION_MS,
      serverTimestamp: Date.now(),
      totalVoters: playerIds.length,
      entries: votingEntries,
    });
    await this._waitForResponses(() => haveAllExpectedPlayersResponded(this.session?.votedPlayers ?? new Set(), playerIds), VOTING_DURATION_MS);
    if (this.isCancelled() || !this.session) return;

    this.session.stage = "results";
    const orderedSubmissions = this.session.presentationOrder
      .map((playerId) => this.session?.broadcastSubmissions.get(playerId))
      .filter((entry): entry is BroadcastSubmission => Boolean(entry));
    const results = tallyBroadcastVotes(orderedSubmissions, this.session.votes);
    const points = computeRoundPoints(results);
    for (const [playerId, score] of points.entries()) {
      this.pendingScores.set(playerId, (this.pendingScores.get(playerId) ?? 0) + score);
    }

    const winner = results.find((entry) => entry.isWinner) ?? null;
    this.broadcast("round_result", {
      winner: winner?.playerId ?? null,
      scores: Object.fromEntries(points),
      entries: results,
      presentationOrder: this.session.presentationOrder,
      totalVotes: this.session.votes.size,
      participationPoints: PARTICIPATION_POINTS,
    });
    await this.delay(RESULTS_DISPLAY_MS);
    await this._deleteRoomArtifactsIfNeeded();
  }

  protected override scoreRound(_round: number): void {
    for (const [playerId, points] of this.pendingScores.entries()) {
      const player = this.room.state.players.get(playerId);
      if (player) player.score += points;
    }
    this.pendingScores.clear();
  }

  override handleInput(client: Client, data: unknown): void {
    const input = data as NewsBroadcastInput;
    if (!input?.action || !this.session) return;

    switch (input.action) {
      case "nb_request_sync":
        this._sendSync(client.sessionId);
        return;
      case "nb_headline_draft":
        this._handleHeadlineDraft(client.sessionId, input.text ?? "");
        return;
      case "nb_submit_headline":
        this._handleHeadlineSubmit(client.sessionId, input.text ?? "");
        return;
      case "nb_search_media":
        void this._handleMediaSearch(client.sessionId, input.query ?? "");
        return;
      case "nb_draft_broadcast":
        this._handleBroadcastDraft(client.sessionId, input);
        return;
      case "nb_submit_script_voice":
        void this._handleScriptVoiceSubmit(client.sessionId, input);
        return;
      case "nb_select_gif":
        this._handleGifSelect(client.sessionId, input);
        return;
      case "nb_submit_logo":
        this._handleLogoSubmit(client.sessionId, input);
        return;
      case "nb_vote":
        this._handleVote(client.sessionId, input.targetId ?? "");
        return;
    }
  }

  override teardown(): void {
    super.teardown();
    void this._deleteRoomArtifactsIfNeeded();
    this.session = null;
    this.pendingScores.clear();
  }

  override onPlayerReconnected(oldId: string, newId: string, client: Client): void {
    if (!this.session) return;
    this._moveMapValue(this.session.headlineDrafts, oldId, newId);
    this._moveMapValue(this.session.headlineSubmissions, oldId, newId, (submission) => ({
      ...submission,
      playerId: newId,
    }));
    this._moveMapValue(this.session.headlineAssignments, oldId, newId);
    this._moveMapValue(this.session.assignedHeadlines, oldId, newId);
    this._moveMapValue(this.session.broadcastDrafts, oldId, newId);
    this._moveMapValue(this.session.broadcastSubmissions, oldId, newId, (submission) => ({
      ...submission,
      playerId: newId,
      playerName: this.room.state.players.get(newId)?.name ?? submission.playerName,
    }));
    this._moveSetValue(this.session.scriptVoiceSubmitted, oldId, newId);
    this._moveSetValue(this.session.gifSelectedPlayers, oldId, newId);
    this._moveSetValue(this.session.logoSubmittedPlayers, oldId, newId);
    this._moveSetValue(this.session.submittedPlayers, oldId, newId);
    this._moveSetValue(this.session.votedPlayers, oldId, newId);

    if (this.session.votes.has(oldId)) {
      const target = this.session.votes.get(oldId) ?? "";
      this.session.votes.delete(oldId);
      this.session.votes.set(newId, target === oldId ? newId : target);
    }
    for (const [voterId, targetId] of [...this.session.votes.entries()]) {
      if (targetId === oldId) this.session.votes.set(voterId, newId);
    }
    this.session.presentationOrder = this.session.presentationOrder.map((playerId) => playerId === oldId ? newId : playerId);
    for (const [playerId, sourceId] of [...this.session.headlineAssignments.entries()]) {
      if (sourceId === oldId) this.session.headlineAssignments.set(playerId, newId);
    }

    this._sendSync(client.sessionId);
  }

  private _activePlayers() {
    return [...this.room.state.players.values()].filter((player) => this.isPlayerActive(player));
  }

  private async _resolveVoices(): Promise<VoiceOption[]> {
    if (!isTTSEnabled()) return FALLBACK_VOICE_OPTIONS;
    const voices = await fetchAvailableVoices();
    return voices.length > 0 ? voices : FALLBACK_VOICE_OPTIONS;
  }

  private async _waitForResponses(isComplete: () => boolean, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!this.isCancelled() && Date.now() < deadline) {
      if (isComplete()) return;
      await this.delay(250);
    }
  }

  private _handleHeadlineDraft(sessionId: string, text: string): void {
    if (!this.session || this.session.stage !== "headline_submission") return;
    this.session.headlineDrafts.set(sessionId, text.slice(0, 120));
  }

  private _handleHeadlineSubmit(sessionId: string, text: string): void {
    if (!this.session || this.session.stage !== "headline_submission") return;
    const normalized = normalizeHeadline(text) ?? normalizeHeadline(this.session.headlineDrafts.get(sessionId) ?? "");
    if (!normalized) {
      this.send(sessionId, "headline_submission_rejected", { reason: "Write a headline with at least two words." });
      return;
    }

    this.session.headlineDrafts.set(sessionId, normalized);
    this.session.headlineSubmissions.set(sessionId, {
      playerId: sessionId,
      headline: normalized,
      submittedAt: Date.now(),
    });
    this.send(sessionId, "headline_submission_confirmed", { headline: normalized });
    this.broadcast("headline_submission_update", {
      submitted: this.session.headlineSubmissions.size,
      total: this._activePlayers().length,
    });
  }

  private _finalizeHeadlineSubmissions(players: ReturnType<NewsBroadcastGame["_activePlayers"]>): void {
    if (!this.session) return;
    for (const [index, player] of players.entries()) {
      if (this.session.headlineSubmissions.has(player.id)) continue;
      const draft = this.session.headlineDrafts.get(player.id) ?? "";
      const fallback = normalizeHeadline(draft) ?? pickFallbackHeadline(index, this.session.seed + 11);
      this.session.headlineSubmissions.set(player.id, {
        playerId: player.id,
        headline: fallback,
        submittedAt: Date.now(),
      });
    }
  }

  private _assignHeadlines(playerIds: string[]): void {
    if (!this.session) return;
    const assignments = createHeadlineAssignments(playerIds, this.session.seed + 21);
    this.session.headlineAssignments = assignments;
    for (const [playerId, sourcePlayerId] of assignments.entries()) {
      const sourceHeadline = this.session.headlineSubmissions.get(sourcePlayerId)?.headline ?? pickFallbackHeadline(0, this.session.seed + 31);
      this.session.assignedHeadlines.set(playerId, sourceHeadline);
      this.send(playerId, "headline_assigned", { headline: sourceHeadline });
    }
  }

  private async _handleMediaSearch(sessionId: string, query: string): Promise<void> {
    if (!this.session || this.session.stage !== "gif_selection") return;
    const sanitized = query.trim().slice(0, 80);
    if (sanitized.length < 2) return;
    const results = await fetchKlipyMedia(sanitized);
    if (!this.session) return;
    for (const entry of results) {
      for (const url of [entry.previewUrl, entry.playbackUrl, entry.fallbackImageUrl]) {
        if (url) this.session.allowedMediaUrls.add(url);
      }
    }
    this.send(sessionId, "media_search_results", { query: sanitized, media: results });
  }

  private _handleBroadcastDraft(sessionId: string, input: NewsBroadcastInput): void {
    if (!this.session) return;
    const allowedStages = ["script_voice_submission", "gif_selection", "logo_creation"];
    if (!allowedStages.includes(this.session.stage)) return;
    const existing = this.session.broadcastDrafts.get(sessionId);
    const media = normalizeMediaEntry(input.media) ?? existing?.media ?? null;
    const script = normalizeScript(input.script ?? existing?.script ?? "") ?? existing?.script ?? "";
    const resolvedVoice = this._resolveVoiceOption(input.voicePresetId ?? existing?.voicePresetId ?? DEFAULT_VOICE_PRESET_ID);
    const logoDesign = typeof input.logoDesign === "string"
      ? input.logoDesign.slice(0, MAX_DESIGN_PAYLOAD_CHARS)
      : existing?.logoDesign ?? "";
    this.session.broadcastDrafts.set(sessionId, {
      media,
      script,
      voicePresetId: resolvedVoice.id,
      voiceLabel: resolvedVoice.label,
      logoDesign,
      updatedAt: Date.now(),
    });
  }

  private async _handleScriptVoiceSubmit(sessionId: string, input: NewsBroadcastInput): Promise<void> {
    if (!this.session || this.session.stage !== "script_voice_submission") return;
    if (this.session.scriptVoiceSubmitted.has(sessionId)) {
      this.send(sessionId, "script_voice_confirmed", { accepted: false, reason: "Already submitted." });
      return;
    }

    const draft = this.session.broadcastDrafts.get(sessionId);
    const script = normalizeScript(input.script ?? draft?.script ?? "");
    const resolvedVoice = this._resolveVoiceOption(input.voicePresetId ?? draft?.voicePresetId ?? DEFAULT_VOICE_PRESET_ID);
    if (!script || !resolvedVoice.available) {
      this.send(sessionId, "script_voice_confirmed", { accepted: false, reason: "Add a short script and pick a voice before submitting." });
      return;
    }

    // Update draft
    this.session.broadcastDrafts.set(sessionId, {
      media: draft?.media ?? null,
      script,
      voicePresetId: resolvedVoice.id,
      voiceLabel: resolvedVoice.label,
      logoDesign: draft?.logoDesign ?? "",
      updatedAt: Date.now(),
    });

    this.session.scriptVoiceSubmitted.add(sessionId);

    // Create partial submission and TTS job immediately
    const assignedHeadline = this.session.assignedHeadlines.get(sessionId) ?? "Breaking update incoming.";
    const player = this.room.state.players.get(sessionId);
    if (!player) return;

    const spokenText = normalizeSpokenText(script);
    const submission: BroadcastSubmission = {
      playerId: sessionId,
      playerName: player.name,
      assignedHeadline,
      script,
      spokenText,
      voicePresetId: resolvedVoice.id,
      voiceLabel: resolvedVoice.label,
      selectedMedia: draft?.media ?? FALLBACK_MEDIA_ENTRY,
      logoDesign: draft?.logoDesign ?? "",
      estimatedSpeechMs: estimateSpeechMs(spokenText),
      submittedAt: Date.now(),
      ttsStatus: isTTSEnabled() ? "queued" : "unavailable",
    };

    this.session.broadcastSubmissions.set(sessionId, submission);

    if (isTTSEnabled()) {
      const job = await createTTSJob({
        roomId: this.room.roomId,
        roundId: this.session.roundId,
        playerId: submission.playerId,
        locale: "en",
        voicePresetId: submission.voicePresetId,
        text: normalizeSpokenText(submission.spokenText),
        priority: "background",
        estimatedSpeechMs: submission.estimatedSpeechMs,
      });
      if (job) {
        submission.ttsJobId = job.id;
        submission.ttsStatus = job.status;
        submission.audioDurationMs = job.durationMs;
        submission.audioMimeType = job.mimeType;
      } else {
        submission.ttsStatus = "failed_final";
      }
    }

    this.send(sessionId, "script_voice_confirmed", {
      accepted: true,
      headline: assignedHeadline,
      ttsJobId: submission.ttsJobId ?? null,
      ttsStatus: submission.ttsStatus,
      estimatedSpeechMs: submission.estimatedSpeechMs,
    });

    this.broadcast("script_voice_update", {
      submitted: this.session.scriptVoiceSubmitted.size,
      total: this._activePlayers().length,
    });
  }

  private _handleGifSelect(sessionId: string, input: NewsBroadcastInput): void {
    if (!this.session || this.session.stage !== "gif_selection") return;
    if (this.session.gifSelectedPlayers.has(sessionId)) {
      this.send(sessionId, "gif_select_confirmed", { accepted: false, reason: "Already selected." });
      return;
    }

    const draft = this.session.broadcastDrafts.get(sessionId);
    const media = normalizeMediaEntry(input.media) ?? draft?.media ?? null;
    if (!media || !isAllowedMediaSelection(media, this.session.allowedMediaUrls)) {
      this.send(sessionId, "gif_select_confirmed", { accepted: false, reason: "Select valid media before submitting." });
      return;
    }

    // Update draft and existing submission
    this.session.broadcastDrafts.set(sessionId, {
      media,
      script: draft?.script ?? "",
      voicePresetId: draft?.voicePresetId ?? DEFAULT_VOICE_PRESET_ID,
      voiceLabel: draft?.voiceLabel ?? "",
      logoDesign: draft?.logoDesign ?? "",
      updatedAt: Date.now(),
    });

    const submission = this.session.broadcastSubmissions.get(sessionId);
    if (submission) {
      submission.selectedMedia = media;
    }

    this.session.gifSelectedPlayers.add(sessionId);
    this.send(sessionId, "gif_select_confirmed", { accepted: true });
    this.broadcast("gif_select_update", {
      selected: this.session.gifSelectedPlayers.size,
      total: this._activePlayers().length,
    });
  }

  private _handleLogoSubmit(sessionId: string, input: NewsBroadcastInput): void {
    if (!this.session || this.session.stage !== "logo_creation") return;
    if (this.session.logoSubmittedPlayers.has(sessionId)) {
      this.send(sessionId, "logo_submit_confirmed", { accepted: false, reason: "Already submitted." });
      return;
    }

    const logoDesign = typeof input.logoDesign === "string"
      ? input.logoDesign.slice(0, MAX_DESIGN_PAYLOAD_CHARS)
      : "";
    const draft = this.session.broadcastDrafts.get(sessionId);
    this.session.broadcastDrafts.set(sessionId, {
      media: draft?.media ?? null,
      script: draft?.script ?? "",
      voicePresetId: draft?.voicePresetId ?? DEFAULT_VOICE_PRESET_ID,
      voiceLabel: draft?.voiceLabel ?? "",
      logoDesign,
      updatedAt: Date.now(),
    });

    const submission = this.session.broadcastSubmissions.get(sessionId);
    if (submission) {
      submission.logoDesign = logoDesign;
    }

    this.session.logoSubmittedPlayers.add(sessionId);
    this.session.submittedPlayers.add(sessionId);
    this.send(sessionId, "logo_submit_confirmed", { accepted: true });
    this.broadcast("logo_submit_update", {
      submitted: this.session.logoSubmittedPlayers.size,
      total: this._activePlayers().length,
    });
  }

  private async _finalizeScriptVoiceSubmissions(players: ReturnType<NewsBroadcastGame["_activePlayers"]>): Promise<void> {
    if (!this.session) return;
    for (const player of players) {
      if (this.session.scriptVoiceSubmitted.has(player.id)) continue;
      const draft = this.session.broadcastDrafts.get(player.id);
      const script = normalizeScript(draft?.script ?? "") ?? buildFallbackScript(this.session.assignedHeadlines.get(player.id) ?? "Breaking update incoming.");
      const resolvedVoice = this._resolveVoiceOption(draft?.voicePresetId ?? DEFAULT_VOICE_PRESET_ID);

      this.session.broadcastDrafts.set(player.id, {
        media: draft?.media ?? null,
        script,
        voicePresetId: resolvedVoice.id,
        voiceLabel: resolvedVoice.label,
        logoDesign: draft?.logoDesign ?? "",
        updatedAt: Date.now(),
      });

      this.session.scriptVoiceSubmitted.add(player.id);

      // Create partial submission with fallback script
      const assignedHeadline = this.session.assignedHeadlines.get(player.id) ?? "Breaking update incoming.";
      const spokenText = normalizeSpokenText(script);
      const submission: BroadcastSubmission = {
        playerId: player.id,
        playerName: player.name,
        assignedHeadline,
        script,
        spokenText,
        voicePresetId: resolvedVoice.id,
        voiceLabel: resolvedVoice.label,
        selectedMedia: draft?.media ?? FALLBACK_MEDIA_ENTRY,
        logoDesign: draft?.logoDesign ?? "",
        estimatedSpeechMs: estimateSpeechMs(spokenText),
        submittedAt: Date.now(),
        ttsStatus: isTTSEnabled() ? "queued" : "unavailable",
      };

      this.session.broadcastSubmissions.set(player.id, submission);

      if (isTTSEnabled()) {
        const job = await createTTSJob({
          roomId: this.room.roomId,
          roundId: this.session.roundId,
          playerId: submission.playerId,
          locale: "en",
          voicePresetId: submission.voicePresetId,
          text: normalizeSpokenText(submission.spokenText),
          priority: "background",
          estimatedSpeechMs: submission.estimatedSpeechMs,
        });
        if (job) {
          submission.ttsJobId = job.id;
          submission.ttsStatus = job.status;
          submission.audioDurationMs = job.durationMs;
          submission.audioMimeType = job.mimeType;
        } else {
          submission.ttsStatus = "failed_final";
        }
      }
    }
  }

  private async _finalizeBroadcastSubmissions(players: ReturnType<NewsBroadcastGame["_activePlayers"]>): Promise<void> {
    if (!this.session) return;
    for (const player of players) {
      // Ensure GIF fallback
      if (!this.session.gifSelectedPlayers.has(player.id)) {
        const draft = this.session.broadcastDrafts.get(player.id);
        const media = draft?.media ?? FALLBACK_MEDIA_ENTRY;
        this.session.broadcastDrafts.set(player.id, {
          media,
          script: draft?.script ?? "",
          voicePresetId: draft?.voicePresetId ?? DEFAULT_VOICE_PRESET_ID,
          voiceLabel: draft?.voiceLabel ?? "",
          logoDesign: draft?.logoDesign ?? "",
          updatedAt: Date.now(),
        });
        const submission = this.session.broadcastSubmissions.get(player.id);
        if (submission) {
          submission.selectedMedia = media;
        }
        this.session.gifSelectedPlayers.add(player.id);
      }

      // Ensure logo fallback
      if (!this.session.logoSubmittedPlayers.has(player.id)) {
        const draft = this.session.broadcastDrafts.get(player.id);
        this.session.broadcastDrafts.set(player.id, {
          media: draft?.media ?? null,
          script: draft?.script ?? "",
          voicePresetId: draft?.voicePresetId ?? DEFAULT_VOICE_PRESET_ID,
          voiceLabel: draft?.voiceLabel ?? "",
          logoDesign: draft?.logoDesign ?? "",
          updatedAt: Date.now(),
        });
        const submission = this.session.broadcastSubmissions.get(player.id);
        if (submission) {
          submission.logoDesign = draft?.logoDesign ?? "";
        }
        this.session.logoSubmittedPlayers.add(player.id);
        this.session.submittedPlayers.add(player.id);
      }
    }
  }

  private _buildSubmissionFromInput(sessionId: string, input: Partial<NewsBroadcastInput>, allowFallbacks: boolean): BroadcastSubmission | null {
    if (!this.session) return null;
    const player = this.room.state.players.get(sessionId);
    if (!player) return null;
    const draft = this.session.broadcastDrafts.get(sessionId);
    const assignedHeadline = this.session.assignedHeadlines.get(sessionId) ?? "Breaking update incoming.";

    const candidateMedia = normalizeMediaEntry(input.media) ?? draft?.media ?? (allowFallbacks ? FALLBACK_MEDIA_ENTRY : null);
    const media = candidateMedia && isAllowedMediaSelection(candidateMedia, this.session.allowedMediaUrls)
      ? candidateMedia
      : allowFallbacks
      ? FALLBACK_MEDIA_ENTRY
      : null;

    const normalizedScript = normalizeScript(input.script ?? draft?.script ?? "")
      ?? (allowFallbacks ? buildFallbackScript(assignedHeadline) : null);

    const resolvedVoice = this._resolveVoiceOption(input.voicePresetId ?? draft?.voicePresetId ?? DEFAULT_VOICE_PRESET_ID);
    if (!media || !normalizedScript || !resolvedVoice.available) return null;

    let spokenText = normalizeSpokenText(normalizedScript);
    if (!validateSpokenTextWithinBudget(spokenText)) {
      if (!allowFallbacks) return null;
      spokenText = trimTextToSpeechBudget(spokenText);
    }

    const logoDesign = typeof input.logoDesign === "string"
      ? input.logoDesign.slice(0, MAX_DESIGN_PAYLOAD_CHARS)
      : draft?.logoDesign ?? "";

    return {
      playerId: sessionId,
      playerName: player.name,
      assignedHeadline,
      script: normalizedScript,
      spokenText,
      voicePresetId: resolvedVoice.id,
      voiceLabel: resolvedVoice.label,
      selectedMedia: media,
      logoDesign,
      estimatedSpeechMs: estimateSpeechMs(spokenText),
      submittedAt: Date.now(),
      ttsStatus: isTTSEnabled() ? "queued" : "unavailable",
    };
  }

  private async _acceptSubmission(sessionId: string, submission: BroadcastSubmission, announce: boolean): Promise<void> {
    if (!this.session) return;
    this.session.broadcastSubmissions.set(sessionId, submission);
    this.session.submittedPlayers.add(sessionId);

    if (isTTSEnabled()) {
      const job = await createTTSJob({
        roomId: this.room.roomId,
        roundId: this.session.roundId,
        playerId: submission.playerId,
        locale: "en",
        voicePresetId: submission.voicePresetId,
        text: normalizeSpokenText(submission.spokenText),
        priority: "background",
        estimatedSpeechMs: submission.estimatedSpeechMs,
      });
      if (job) {
        submission.ttsJobId = job.id;
        submission.ttsStatus = job.status;
        submission.audioDurationMs = job.durationMs;
        submission.audioMimeType = job.mimeType;
      } else {
        submission.ttsStatus = "failed_final";
      }
    }

    this.send(sessionId, "broadcast_submission_confirmed", {
      accepted: true,
      headline: submission.assignedHeadline,
      ttsJobId: submission.ttsJobId ?? null,
      ttsStatus: submission.ttsStatus,
      estimatedSpeechMs: submission.estimatedSpeechMs,
      locked: announce,
    });

    this.broadcast("broadcast_submission_update", {
      submitted: this.session.submittedPlayers.size,
      total: this._activePlayers().length,
    });
  }

  private _resolveVoiceOption(voicePresetId: string): VoiceOption {
    if (!this.session) return FALLBACK_VOICE_OPTIONS[0];
    return this.session.voices.find((voice) => voice.id === voicePresetId && voice.available)
      ?? this.session.voices.find((voice) => voice.available)
      ?? FALLBACK_VOICE_OPTIONS[0];
  }

  private async _refreshAllTTSStatuses(): Promise<void> {
    if (!this.session) return;
    for (const submission of this.session.broadcastSubmissions.values()) {
      await this._refreshEntryTTSStatus(submission);
    }
  }

  private async _refreshEntryTTSStatus(submission: BroadcastSubmission): Promise<void> {
    if (!submission.ttsJobId) return;
    const status = await getTTSJob(submission.ttsJobId);
    if (!status) return;
    submission.ttsStatus = status.status;
    if (typeof status.durationMs === "number") submission.audioDurationMs = status.durationMs;
    if (status.mimeType) submission.audioMimeType = status.mimeType;
  }

  private async _promoteUpcomingJobs(startIndex: number): Promise<void> {
    if (!this.session) return;
    const queueTargets: Array<{ index: number; priority: "blocker" | "next" | "background" }> = [];
    for (let index = startIndex; index < this.session.presentationOrder.length; index++) {
      const priority = index === startIndex
        ? "blocker"
        : index === startIndex + 1
        ? "next"
        : "background";
      queueTargets.push({ index, priority });
    }
    for (const target of queueTargets) {
      const playerId = this.session.presentationOrder[target.index];
      const submission = this.session.broadcastSubmissions.get(playerId);
      if (!submission?.ttsJobId) continue;
      await updateTTSJobPriority(submission.ttsJobId, target.priority);
    }
  }

  private _submittedEntryCountWithJobs(): number {
    if (!this.session) return 0;
    return [...this.session.broadcastSubmissions.values()].filter((entry) => !!entry.ttsJobId).length;
  }

  private async _waitForInitialReady(): Promise<void> {
    if (!this.session) return;
    const targetReadyCount = Math.min(2, this._submittedEntryCountWithJobs());
    if (targetReadyCount <= 0) return;
    const deadline = Date.now() + BUFFERING_MAX_WAIT_MS;
    while (!this.isCancelled() && Date.now() < deadline) {
      await this._refreshAllTTSStatuses();
      const readyCount = [...this.session.broadcastSubmissions.values()].filter((entry) => entry.ttsStatus === "ready").length;
      if (readyCount >= targetReadyCount) return;
      await this.delay(1_000);
    }
  }

  private async _waitForPresentationReady(entry: BroadcastSubmission): Promise<void> {
    if (!entry.ttsJobId || entry.ttsStatus === "ready") return;
    const deadline = Date.now() + PRESENTATION_EXTRA_WAIT_MS;
    while (!this.isCancelled() && Date.now() < deadline) {
      await this._refreshEntryTTSStatus(entry);
      if (entry.ttsStatus === "ready" || entry.ttsStatus === "failed_final") return;
      await this.delay(750);
    }
  }

  private _handleVote(sessionId: string, targetId: string): void {
    if (!this.session || this.session.stage !== "voting") return;
    if (!targetId || targetId === sessionId) return;
    if (this.session.votedPlayers.has(sessionId)) return;
    if (!this.session.broadcastSubmissions.has(targetId)) return;
    this.session.votedPlayers.add(sessionId);
    this.session.votes.set(sessionId, targetId);
    this.send(sessionId, "vote_confirmed", { targetId });
    this.broadcast("vote_count_update", {
      votesIn: this.session.votedPlayers.size,
      totalVoters: this._activePlayers().length,
    });
  }

  private async _deleteRoomArtifactsIfNeeded(): Promise<void> {
    if (!this.session || this.session.cleanupRequested) return;
    this.session.cleanupRequested = true;
    if (isTTSEnabled()) {
      await deleteRoomArtifacts(this.room.roomId);
    }
  }

  private _sendSync(sessionId: string): void {
    if (!this.session) return;
    const submission = this.session.broadcastSubmissions.get(sessionId) ?? null;
    this.send(sessionId, "news_broadcast_sync", {
      stage: this.session.stage,
      voices: this.session.voices,
      assignedHeadline: this.session.assignedHeadlines.get(sessionId) ?? null,
      headlineSubmitted: this.session.headlineSubmissions.has(sessionId),
      scriptVoiceSubmitted: this.session.scriptVoiceSubmitted.has(sessionId),
      gifSelected: this.session.gifSelectedPlayers.has(sessionId),
      logoSubmitted: this.session.logoSubmittedPlayers.has(sessionId),
      broadcastSubmitted: this.session.submittedPlayers.has(sessionId),
      submission,
      submittedCount: this.session.submittedPlayers.size,
      scriptVoiceCount: this.session.scriptVoiceSubmitted.size,
      gifSelectedCount: this.session.gifSelectedPlayers.size,
      logoSubmittedCount: this.session.logoSubmittedPlayers.size,
      totalPlayers: this._activePlayers().length,
      currentPresentationIndex: this.session.currentPresentationIndex,
      presentationOrder: this.session.presentationOrder,
    });
  }

  private _moveSetValue(set: Set<string>, oldId: string, newId: string): void {
    if (!set.has(oldId)) return;
    set.delete(oldId);
    set.add(newId);
  }

  private _moveMapValue<T>(
    map: Map<string, T>,
    oldId: string,
    newId: string,
    transform?: (value: T) => T,
  ): void {
    if (!map.has(oldId)) return;
    const value = map.get(oldId);
    map.delete(oldId);
    if (value !== undefined) map.set(newId, transform ? transform(value) : value);
  }
}
