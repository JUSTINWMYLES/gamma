<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { Room } from "colyseus.js";
  import type { PlayerState, RoomState } from "../../../../shared/types";
  import IconDesignEditor from "../../components/IconDesignEditor.svelte";
  import {
    createEmptyIconDesign,
    parseIconDesign,
    serializeIconDesign,
    type IconDesign,
  } from "../../../../shared/playerIconDesign";

  export let room: Room;
  export let state: RoomState;
  export let me: PlayerState | undefined;

  type SubPhase =
    | "waiting"
    | "headline_submission"
    | "assignment_reveal"
    | "script_voice_submission"
    | "gif_selection"
    | "logo_creation"
    | "buffering"
    | "presentation"
    | "voting"
    | "results";

  interface VoiceOption {
    id: string;
    label: string;
    tone: string;
    available: boolean;
    source?: string;
    placeholder?: boolean;
    availabilityReason?: string;
  }

  interface MediaEntry {
    provider: string;
    providerAssetId: string;
    label: string;
    previewUrl: string;
    playbackUrl: string;
    fallbackImageUrl: string;
    mimeType: string;
    width?: number;
    height?: number;
    durationMs?: number;
  }

  interface BroadcastSubmission {
    playerId: string;
    playerName: string;
    assignedHeadline: string;
    script: string;
    voicePresetId: string;
    voiceLabel: string;
    selectedMedia: MediaEntry;
    logoDesign: string;
    estimatedSpeechMs: number;
    submittedAt?: number;
    ttsJobId?: string;
    ttsStatus?: string;
    audioDurationMs?: number;
    audioMimeType?: string;
  }

  interface PresentationPreparePayload {
    index: number;
    total: number;
    upNext: {
      playerId: string;
      playerName: string;
      assignedHeadline: string;
    };
    durationMs: number;
    serverTimestamp: number;
  }

  interface PresentationEntryPayload {
    playerId: string;
    playerName: string;
    assignedHeadline: string;
    script: string;
    voicePresetId: string;
    voiceLabel: string;
    selectedMedia: MediaEntry;
    estimatedSpeechMs: number;
    artifactJobId: string | null;
    artifactReady: boolean;
    captionsOnly: boolean;
  }

  interface VotingEntry {
    playerId: string;
    playerName: string;
    assignedHeadline: string;
    selectedMedia: MediaEntry;
  }

  interface ResultEntry extends BroadcastSubmission {
    voteCount: number;
    isWinner: boolean;
  }

  interface SyncPayload {
    stage: Exclude<SubPhase, "waiting">;
    voices: VoiceOption[];
    assignedHeadline: string | null;
    headlineSubmitted: boolean;
    scriptVoiceSubmitted: boolean;
    gifSelected: boolean;
    logoSubmitted: boolean;
    broadcastSubmitted: boolean;
    submission: BroadcastSubmission | null;
    submittedCount: number;
    scriptVoiceCount: number;
    gifSelectedCount: number;
    logoSubmittedCount: number;
    totalPlayers: number;
    currentPresentationIndex: number;
    presentationOrder: string[];
  }

  const DEFAULT_VOICE_PRESET_ID = "anchor_classic_a";
  const MAX_HEADLINE_LENGTH = 90;
  const MAX_SCRIPT_LENGTH = 150;

  const FALLBACK_MEDIA: MediaEntry = {
    provider: "gamma_builtin",
    providerAssetId: "news-broadcast-default-frame",
    label: "Technical Difficulties",
    previewUrl: "/news-broadcast-default-frame.svg",
    playbackUrl: "",
    fallbackImageUrl: "/news-broadcast-default-frame.svg",
    mimeType: "image/svg+xml",
    width: 1280,
    height: 720,
  };

  let subPhase: SubPhase = "waiting";
  let roundSkipped = false;
  let skipReason = "";

  let timeLeft = 0;
  let timerInterval: ReturnType<typeof setInterval> | null = null;
  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let headlineDraftDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let draftDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  let headlineInput = "";
  let headlineSubmitted = false;
  let headlineError = "";
  let submittedCount = 0;
  let totalPlayers = 0;

  let assignedHeadline = "";
  let voices: VoiceOption[] = [];
  let selectedVoicePresetId = DEFAULT_VOICE_PRESET_ID;
  let scriptInput = "";
  let selectedMedia: MediaEntry | null = FALLBACK_MEDIA;
  let mediaSearchQuery = "";
  let mediaSearchResults: MediaEntry[] = [];
  let isSearching = false;
  let lastDraftSignature = "";

  let scriptVoiceSubmitted = false;
  let scriptVoiceError = "";
  let scriptVoiceTTSStatus = "";
  let scriptVoiceEstimatedSpeechMs = 0;

  let gifSelected = false;
  let gifError = "";

  let logoSubmitted = false;
  let logoError = "";
  let logoDesign: IconDesign = createEmptyIconDesign();

  let creationSubmitted = false;
  let creationLocked = false;
  let creationError = "";
  let creationTTSStatus = "";
  let creationEstimatedSpeechMs = 0;

  let bufferingTargetReadyCount = 0;
  let prepareState: PresentationPreparePayload | null = null;
  let currentPresentation:
    | {
        index: number;
        total: number;
        entry: PresentationEntryPayload;
      }
    | null = null;
  let currentPresentationIndex = -1;
  let presentationOrder: string[] = [];

  let votingEntries: VotingEntry[] = [];
  let myVote = "";
  let voteConfirmed = false;
  let votesIn = 0;
  let totalVoters = 0;

  let results:
    | {
        winner: string | null;
        scores: Record<string, number>;
        entries: ResultEntry[];
        presentationOrder: string[];
        totalVotes: number;
        participationPoints: number;
      }
    | null = null;

  function clearStageTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function startStageTimer(serverTimestamp: number, durationMs: number) {
    const endTime = serverTimestamp + durationMs;
    clearStageTimer();

    const tick = () => {
      timeLeft = Math.max(0, (endTime - Date.now()) / 1000);
    };

    tick();
    timerInterval = setInterval(tick, 100);
  }

  function clearTransientTimers() {
    clearStageTimer();
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = null;
    }
    if (headlineDraftDebounceTimer) {
      clearTimeout(headlineDraftDebounceTimer);
      headlineDraftDebounceTimer = null;
    }
    if (draftDebounceTimer) {
      clearTimeout(draftDebounceTimer);
      draftDebounceTimer = null;
    }
  }

  function resetRoundState() {
    roundSkipped = false;
    skipReason = "";
    headlineInput = "";
    headlineSubmitted = false;
    headlineError = "";
    submittedCount = 0;
    totalPlayers = 0;
    assignedHeadline = "";
    voices = [];
    selectedVoicePresetId = DEFAULT_VOICE_PRESET_ID;
    scriptInput = "";
    selectedMedia = FALLBACK_MEDIA;
    mediaSearchQuery = "";
    mediaSearchResults = [];
    isSearching = false;
    lastDraftSignature = "";
    scriptVoiceSubmitted = false;
    scriptVoiceError = "";
    scriptVoiceTTSStatus = "";
    scriptVoiceEstimatedSpeechMs = 0;
    gifSelected = false;
    gifError = "";
    logoSubmitted = false;
    logoError = "";
    logoDesign = createEmptyIconDesign();
    creationSubmitted = false;
    creationLocked = false;
    creationError = "";
    creationTTSStatus = "";
    creationEstimatedSpeechMs = 0;
    bufferingTargetReadyCount = 0;
    prepareState = null;
    currentPresentation = null;
    currentPresentationIndex = -1;
    presentationOrder = [];
    votingEntries = [];
    myVote = "";
    voteConfirmed = false;
    votesIn = 0;
    totalVoters = 0;
    results = null;
  }

  function getPlayerName(playerId: string): string {
    return state.players.get(playerId)?.name ?? playerId;
  }

  function isVideoMedia(media: MediaEntry | null | undefined): boolean {
    return (media?.mimeType ?? "").startsWith("video/");
  }

  function getPreviewUrl(media: MediaEntry | null | undefined): string {
    if (!media) return FALLBACK_MEDIA.previewUrl;
    if (isVideoMedia(media)) {
      return media.playbackUrl || media.previewUrl || media.fallbackImageUrl || FALLBACK_MEDIA.previewUrl;
    }
    return media.fallbackImageUrl || media.previewUrl || media.playbackUrl || FALLBACK_MEDIA.previewUrl;
  }

  function getGalleryUrl(media: MediaEntry): string {
    if (isVideoMedia(media)) {
      return media.playbackUrl || media.previewUrl || media.fallbackImageUrl || FALLBACK_MEDIA.previewUrl;
    }
    return media.fallbackImageUrl || media.previewUrl || media.playbackUrl || FALLBACK_MEDIA.previewUrl;
  }

  function selectMedia(media: MediaEntry) {
    selectedMedia = media;
    creationError = "";
  }

  function chooseVoice(voice: VoiceOption) {
    if (!voice.available) return;
    selectedVoicePresetId = voice.id;
    creationError = "";
  }

  function submitHeadline() {
    if (!canSubmitHeadline) return;
    headlineError = "";
    room.send("game_input", {
      action: "nb_submit_headline",
      text: headlineInput,
    });
  }

  function queueHeadlineDraftSync() {
    if (subPhase !== "headline_submission") return;
    if (headlineDraftDebounceTimer) clearTimeout(headlineDraftDebounceTimer);
    headlineDraftDebounceTimer = setTimeout(() => {
      room.send("game_input", {
        action: "nb_headline_draft",
        text: headlineInput,
      });
    }, 250);
  }

  function runMediaSearch() {
    const query = mediaSearchQuery.trim();
    if (query.length < 2) {
      isSearching = false;
      return;
    }
    isSearching = true;
    room.send("game_input", {
      action: "nb_search_media",
      query,
    });
  }

  function onSearchInput() {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    const query = mediaSearchQuery.trim();
    if (query.length < 2) {
      isSearching = false;
      return;
    }
    searchDebounceTimer = setTimeout(() => {
      runMediaSearch();
    }, 400);
  }

  function queueDraftSync() {
    if (subPhase !== "broadcast_creation" || creationSubmitted || creationLocked) return;
    if (draftDebounceTimer) clearTimeout(draftDebounceTimer);
    draftDebounceTimer = setTimeout(() => {
      room.send("game_input", {
        action: "nb_draft_broadcast",
        script: scriptInput,
        voicePresetId: selectedVoicePresetId,
        media: selectedMedia ?? FALLBACK_MEDIA,
      });
    }, 250);
  }

  function submitScriptVoice() {
    if (!canSubmitScriptVoice || scriptVoiceSubmitted) return;
    scriptVoiceError = "";
    room.send("game_input", {
      action: "nb_submit_script_voice",
      script: scriptInput,
      voicePresetId: selectedVoicePresetId,
    });
  }

  function selectGif(media: MediaEntry) {
    if (gifSelected) return;
    selectedMedia = media;
    gifError = "";
  }

  function submitGif() {
    if (gifSelected || !selectedMedia) return;
    gifError = "";
    room.send("game_input", {
      action: "nb_select_gif",
      media: selectedMedia,
    });
  }

  function submitLogo() {
    if (logoSubmitted) return;
    logoError = "";
    room.send("game_input", {
      action: "nb_submit_logo",
      logoDesign: serializeIconDesign(logoDesign),
    });
  }

  function castVote(targetId: string) {
    if (!targetId || voteConfirmed || myVote) return;
    if (targetId === me?.id) return;
    myVote = targetId;
    room.send("game_input", {
      action: "nb_vote",
      targetId,
    });
  }

  function applySubmission(submission: BroadcastSubmission | null) {
    if (!submission) return;
    assignedHeadline = submission.assignedHeadline;
    scriptInput = submission.script;
    selectedVoicePresetId = submission.voicePresetId;
    selectedMedia = submission.selectedMedia ?? FALLBACK_MEDIA;
    logoDesign = parseIconDesign(submission.logoDesign) ?? logoDesign;
    scriptVoiceTTSStatus = submission.ttsStatus ?? scriptVoiceTTSStatus;
    scriptVoiceEstimatedSpeechMs = submission.estimatedSpeechMs ?? scriptVoiceEstimatedSpeechMs;
  }

  function onHeadlineSubmissionStart(data: { durationMs: number; serverTimestamp: number; totalPlayers: number }) {
    resetRoundState();
    subPhase = "headline_submission";
    totalPlayers = data.totalPlayers;
    submittedCount = 0;
    startStageTimer(data.serverTimestamp, data.durationMs);
  }

  function onHeadlineSubmissionUpdate(data: { submitted: number; total: number }) {
    submittedCount = data.submitted;
    totalPlayers = data.total;
  }

  function onHeadlineSubmissionConfirmed(data: { headline: string }) {
    headlineSubmitted = true;
    headlineError = "";
    headlineInput = data.headline;
  }

  function onHeadlineSubmissionRejected(data: { reason: string }) {
    headlineSubmitted = false;
    headlineError = data.reason;
  }

  function onHeadlineAssigned(data: { headline: string }) {
    assignedHeadline = data.headline;
  }

  function onHeadlineAssignmentReveal(data: { durationMs: number; serverTimestamp: number }) {
    subPhase = "assignment_reveal";
    startStageTimer(data.serverTimestamp, data.durationMs);
  }

  function onScriptVoiceSubmissionStart(data: {
    durationMs: number;
    serverTimestamp: number;
    voices: VoiceOption[];
    totalPlayers: number;
  }) {
    subPhase = "script_voice_submission";
    voices = data.voices ?? [];
    totalPlayers = data.totalPlayers;
    submittedCount = 0;
    scriptInput = "";
    scriptVoiceSubmitted = false;
    scriptVoiceError = "";
    scriptVoiceTTSStatus = "";
    scriptVoiceEstimatedSpeechMs = 0;
    const firstAvailableVoice = voices.find((voice) => voice.available);
    selectedVoicePresetId = firstAvailableVoice?.id ?? DEFAULT_VOICE_PRESET_ID;
    startStageTimer(data.serverTimestamp, data.durationMs);
  }

  function onScriptVoiceConfirmed(data: {
    accepted: boolean;
    reason?: string;
    headline?: string;
    ttsJobId?: string | null;
    ttsStatus?: string;
    estimatedSpeechMs?: number;
  }) {
    if (!data.accepted) {
      scriptVoiceError = data.reason ?? "Could not submit script.";
      return;
    }
    scriptVoiceSubmitted = true;
    scriptVoiceError = "";
    assignedHeadline = data.headline ?? assignedHeadline;
    scriptVoiceTTSStatus = data.ttsStatus ?? scriptVoiceTTSStatus;
    scriptVoiceEstimatedSpeechMs = data.estimatedSpeechMs ?? scriptVoiceEstimatedSpeechMs;
  }

  function onScriptVoiceUpdate(data: { submitted: number; total: number }) {
    submittedCount = data.submitted;
    totalPlayers = data.total;
  }

  function onGifSelectionStart(data: {
    durationMs: number;
    serverTimestamp: number;
    totalPlayers: number;
  }) {
    subPhase = "gif_selection";
    totalPlayers = data.totalPlayers;
    gifSelected = false;
    gifError = "";
    mediaSearchQuery = "";
    mediaSearchResults = [];
    isSearching = false;
    startStageTimer(data.serverTimestamp, data.durationMs);
  }

  function onGifSelectConfirmed(data: { accepted: boolean; reason?: string }) {
    if (!data.accepted) {
      gifError = data.reason ?? "Could not select GIF.";
      return;
    }
    gifSelected = true;
    gifError = "";
  }

  function onGifSelectUpdate(data: { selected: number; total: number }) {
    submittedCount = data.selected;
    totalPlayers = data.total;
  }

  function onLogoCreationStart(data: {
    durationMs: number;
    serverTimestamp: number;
    totalPlayers: number;
  }) {
    subPhase = "logo_creation";
    totalPlayers = data.totalPlayers;
    logoSubmitted = false;
    logoError = "";
    logoDesign = createEmptyIconDesign();
    startStageTimer(data.serverTimestamp, data.durationMs);
  }

  function onLogoSubmitConfirmed(data: { accepted: boolean; reason?: string }) {
    if (!data.accepted) {
      logoError = data.reason ?? "Could not submit logo.";
      return;
    }
    logoSubmitted = true;
    logoError = "";
  }

  function onLogoSubmitUpdate(data: { submitted: number; total: number }) {
    submittedCount = data.submitted;
    totalPlayers = data.total;
  }

  function onMediaSearchResults(data: { query: string; media: MediaEntry[] }) {
    isSearching = false;
    mediaSearchResults = data.media ?? [];
  }

  function onBroadcastSubmissionUpdate(data: { submitted: number; total: number }) {
    submittedCount = data.submitted;
    totalPlayers = data.total;
  }

  function onBroadcastSubmissionConfirmed(data: {
    accepted: boolean;
    reason?: string;
    headline?: string;
    ttsStatus?: string;
    estimatedSpeechMs?: number;
    locked?: boolean;
  }) {
    if (!data.accepted) {
      creationError = data.reason ?? "Could not lock your segment.";
      myVote = "";
      return;
    }

    creationSubmitted = true;
    creationLocked = Boolean(data.locked);
    creationError = "";
    assignedHeadline = data.headline ?? assignedHeadline;
    creationTTSStatus = data.ttsStatus ?? creationTTSStatus;
    creationEstimatedSpeechMs = data.estimatedSpeechMs ?? creationEstimatedSpeechMs;
  }

  function onBroadcastBufferingStart(data: { durationMs: number; serverTimestamp: number; targetReadyCount: number }) {
    subPhase = "buffering";
    bufferingTargetReadyCount = data.targetReadyCount;
    prepareState = null;
    currentPresentation = null;
    startStageTimer(data.serverTimestamp, data.durationMs);
  }

  function onPresentationPrepare(data: PresentationPreparePayload) {
    subPhase = "presentation";
    currentPresentation = null;
    prepareState = data;
    currentPresentationIndex = data.index;
    startStageTimer(data.serverTimestamp, data.durationMs);
  }

  function onPresentationStart(data: {
    index: number;
    total: number;
    entry: PresentationEntryPayload;
    durationMs: number;
    serverTimestamp: number;
  }) {
    subPhase = "presentation";
    prepareState = null;
    currentPresentation = {
      index: data.index,
      total: data.total,
      entry: data.entry,
    };
    currentPresentationIndex = data.index;
    startStageTimer(data.serverTimestamp, data.durationMs);
  }

  function onPresentationEnd() {
    clearStageTimer();
  }

  function onVotingStart(data: {
    durationMs: number;
    serverTimestamp: number;
    totalVoters: number;
    entries: VotingEntry[];
  }) {
    subPhase = "voting";
    votingEntries = (data.entries ?? []).filter((entry) => entry.playerId !== me?.id);
    totalVoters = data.totalVoters;
    votesIn = 0;
    myVote = "";
    voteConfirmed = false;
    startStageTimer(data.serverTimestamp, data.durationMs);
  }

  function onVoteConfirmed(data: { targetId: string }) {
    voteConfirmed = true;
    myVote = data.targetId;
  }

  function onVoteCountUpdate(data: { votesIn: number; totalVoters: number }) {
    votesIn = data.votesIn;
    totalVoters = data.totalVoters;
  }

  function onRoundResult(data: {
    winner: string | null;
    scores: Record<string, number>;
    entries: ResultEntry[];
    presentationOrder: string[];
    totalVotes: number;
    participationPoints: number;
  }) {
    subPhase = "results";
    results = data;
    presentationOrder = data.presentationOrder ?? [];
    clearStageTimer();
  }

  function onRoundSkipped(data: { reason: string }) {
    roundSkipped = true;
    skipReason = data.reason;
    clearStageTimer();
  }

  function onSync(data: SyncPayload) {
    roundSkipped = false;
    skipReason = "";
    subPhase = data.stage;
    voices = data.voices ?? voices;
    assignedHeadline = data.assignedHeadline ?? assignedHeadline;
    headlineSubmitted = Boolean(data.headlineSubmitted);
    scriptVoiceSubmitted = Boolean(data.scriptVoiceSubmitted);
    gifSelected = Boolean(data.gifSelected);
    logoSubmitted = Boolean(data.logoSubmitted);
    creationSubmitted = Boolean(data.broadcastSubmitted);
    creationLocked = Boolean(data.broadcastSubmitted);
    submittedCount = data.submittedCount ?? submittedCount;
    totalPlayers = data.totalPlayers ?? totalPlayers;
    currentPresentationIndex = data.currentPresentationIndex ?? currentPresentationIndex;
    presentationOrder = data.presentationOrder ?? presentationOrder;
    applySubmission(data.submission);
  }

  onMount(() => {
    room.onMessage("headline_submission_start", onHeadlineSubmissionStart);
    room.onMessage("headline_submission_update", onHeadlineSubmissionUpdate);
    room.onMessage("headline_submission_confirmed", onHeadlineSubmissionConfirmed);
    room.onMessage("headline_submission_rejected", onHeadlineSubmissionRejected);
    room.onMessage("headline_assigned", onHeadlineAssigned);
    room.onMessage("headline_assignment_reveal", onHeadlineAssignmentReveal);
    room.onMessage("script_voice_submission_start", onScriptVoiceSubmissionStart);
    room.onMessage("script_voice_confirmed", onScriptVoiceConfirmed);
    room.onMessage("script_voice_update", onScriptVoiceUpdate);
    room.onMessage("gif_selection_start", onGifSelectionStart);
    room.onMessage("gif_select_confirmed", onGifSelectConfirmed);
    room.onMessage("gif_select_update", onGifSelectUpdate);
    room.onMessage("logo_creation_start", onLogoCreationStart);
    room.onMessage("logo_submit_confirmed", onLogoSubmitConfirmed);
    room.onMessage("logo_submit_update", onLogoSubmitUpdate);
    room.onMessage("media_search_results", onMediaSearchResults);
    room.onMessage("broadcast_buffering_start", onBroadcastBufferingStart);
    room.onMessage("presentation_prepare", onPresentationPrepare);
    room.onMessage("presentation_start", onPresentationStart);
    room.onMessage("presentation_end", onPresentationEnd);
    room.onMessage("voting_start", onVotingStart);
    room.onMessage("vote_confirmed", onVoteConfirmed);
    room.onMessage("vote_count_update", onVoteCountUpdate);
    room.onMessage("round_result", onRoundResult);
    room.onMessage("round_skipped", onRoundSkipped);
    room.onMessage("news_broadcast_sync", onSync);

    room.send("game_input", { action: "nb_request_sync" });
  });

  onDestroy(() => {
    clearTransientTimers();
  });

  $: headlineWordCount = headlineInput.trim().split(/\s+/).filter(Boolean).length;
  $: canSubmitHeadline = !headlineSubmitted && headlineInput.trim().length >= 12 && headlineWordCount >= 2;
  $: selectedVoice = voices.find((voice) => voice.id === selectedVoicePresetId) ?? voices.find((voice) => voice.available) ?? null;
  $: if (voices.length > 0 && !voices.some((voice) => voice.id === selectedVoicePresetId && voice.available)) {
    const fallbackVoice = voices.find((voice) => voice.available);
    if (fallbackVoice) selectedVoicePresetId = fallbackVoice.id;
  }
  $: scriptCharsLeft = Math.max(0, MAX_SCRIPT_LENGTH - scriptInput.length);
  $: canSubmitScriptVoice = Boolean(assignedHeadline) && Boolean(scriptInput.trim()) && Boolean(selectedVoice?.available);
  $: myResult = results?.entries.find((entry) => entry.playerId === me?.id) ?? null;
  $: winningEntries = results?.entries.filter((entry) => entry.isWinner) ?? [];
</script>

<div class="flex-1 flex w-full flex-col items-center justify-start gap-4 overflow-y-auto rounded-[28px] border border-slate-800 bg-slate-950/90 p-4 pb-24 sm:justify-center" data-testid="news-broadcast-player">
  {#if roundSkipped}
    <div class="flex-1 flex items-center justify-center">
      <div class="w-full max-w-sm rounded-3xl border border-yellow-500/40 bg-yellow-950/30 p-6 text-center space-y-3">
        <p class="text-4xl">🛑</p>
        <h2 class="text-2xl font-black text-yellow-300">Round Skipped</h2>
        <p class="text-sm text-yellow-100/85">{skipReason}</p>
      </div>
    </div>

  {:else if subPhase === "waiting"}
    <div class="flex-1 flex items-center justify-center">
      <div class="w-full max-w-sm rounded-3xl border border-sky-500/20 bg-slate-900/80 p-6 text-center space-y-4">
        <p class="text-5xl">📰</p>
        <h2 class="text-2xl font-black text-sky-300">News Broadcast</h2>
        <p class="text-sm text-slate-300">The control room is warming up. Keep your phone ready.</p>
      </div>
    </div>

  {:else if subPhase === "headline_submission"}
    <div class="w-full max-w-sm space-y-4">
      <div class="text-center space-y-2">
        <p class="text-xs uppercase tracking-[0.35em] text-sky-300/80">Newsroom Pitch</p>
        <h2 class="text-2xl font-black text-white">Write a ridiculous breaking headline</h2>
        <p class="text-sm text-slate-400">{Math.ceil(timeLeft)}s remaining</p>
      </div>

      <div class="rounded-3xl border border-sky-500/20 bg-slate-900/80 p-4 space-y-3">
        <textarea
          rows="4"
          maxlength={MAX_HEADLINE_LENGTH}
          bind:value={headlineInput}
          on:input={queueHeadlineDraftSync}
          class="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
          placeholder="Mayor denies rumors of secret alpaca emergency task force..."
        ></textarea>
        <div class="flex items-center justify-between text-xs text-slate-500">
          <span>At least two words.</span>
          <span>{headlineInput.length}/{MAX_HEADLINE_LENGTH}</span>
        </div>

        {#if headlineSubmitted}
          <div class="rounded-2xl border border-emerald-500/30 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-100">
            Headline submitted and locked.
          </div>
        {/if}

        {#if headlineError}
          <p class="text-sm text-red-400">{headlineError}</p>
        {/if}

        <button
          type="button"
          class={`w-full rounded-2xl py-3 font-bold transition-all ${canSubmitHeadline ? "bg-sky-600 text-white active:scale-[0.98] active:bg-sky-500" : "bg-slate-800 text-slate-600"}`}
          disabled={!canSubmitHeadline}
          on:click={submitHeadline}
        >
          Submit Headline
        </button>
      </div>

      <div class="rounded-3xl border border-slate-800 bg-slate-950/70 p-4 space-y-3">
        <div class="flex items-center justify-between text-sm text-slate-300">
          <span>Headlines in</span>
          <span class="font-black text-white">{submittedCount} / {totalPlayers}</span>
        </div>
        <div class="h-3 overflow-hidden rounded-full bg-slate-800">
          <div class="h-full bg-sky-500 transition-all duration-500" style="width:{totalPlayers > 0 ? (submittedCount / totalPlayers) * 100 : 0}%"></div>
        </div>
      </div>
    </div>

  {:else if subPhase === "assignment_reveal"}
    <div class="w-full max-w-sm space-y-4">
      <div class="text-center space-y-2">
        <p class="text-xs uppercase tracking-[0.35em] text-violet-300/80">Assignment Incoming</p>
        <h2 class="text-2xl font-black text-white">You are reading someone else's headline</h2>
        <p class="text-sm text-slate-400">{Math.ceil(timeLeft)}s remaining</p>
      </div>

      <div class="rounded-3xl border border-violet-500/25 bg-violet-950/25 p-5 space-y-3 text-center">
        <p class="text-xs uppercase tracking-[0.3em] text-violet-200/80">Your breaking story</p>
        <p class="text-xl font-black text-white leading-snug">
          {assignedHeadline || "Checking the newsroom feed..."}
        </p>
        <p class="text-sm text-violet-100/80">Build the visual and write the anchor script on the next screen.</p>
      </div>
    </div>

  {:else if subPhase === "script_voice_submission"}
    <div class="w-full max-w-md space-y-4">
      <div class="text-center space-y-2">
        <p class="text-xs uppercase tracking-[0.35em] text-fuchsia-300/80">Write Your Script</p>
        <h2 class="text-2xl font-black text-white">Script + Voice</h2>
        <p class="text-sm text-slate-400">{Math.ceil(timeLeft)}s remaining</p>
      </div>

      <div class="rounded-3xl border border-fuchsia-500/20 bg-slate-900/80 p-4 space-y-3">
        <p class="text-xs uppercase tracking-[0.3em] text-fuchsia-200/80">Assigned headline</p>
        <p class="text-lg font-black text-white leading-snug">{assignedHeadline}</p>
      </div>

      <div class="rounded-3xl border border-slate-800 bg-slate-950/70 p-4 space-y-3">
        <div class="flex items-center justify-between text-sm text-slate-300">
          <span>Scripts submitted</span>
          <span class="font-black text-white">{submittedCount} / {totalPlayers}</span>
        </div>
        <div class="h-3 overflow-hidden rounded-full bg-slate-800">
          <div class="h-full bg-fuchsia-500 transition-all duration-500" style="width:{totalPlayers > 0 ? (submittedCount / totalPlayers) * 100 : 0}%"></div>
        </div>
      </div>

      <div class="rounded-3xl border border-slate-800 bg-slate-900/80 p-4 space-y-4">
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <p class="text-xs uppercase tracking-[0.3em] text-slate-400">Anchor script</p>
            <span class={`text-xs ${scriptCharsLeft < 30 ? "text-amber-300" : "text-slate-500"}`}>{scriptInput.length}/{MAX_SCRIPT_LENGTH}</span>
          </div>
          <textarea
            rows="4"
            maxlength={MAX_SCRIPT_LENGTH}
            bind:value={scriptInput}
            disabled={scriptVoiceSubmitted}
            class="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white placeholder-slate-500 focus:border-fuchsia-500 focus:outline-none disabled:opacity-50"
            placeholder="Good evening. Witnesses say the raccoon accepted the award before anyone realized it was not an employee..."
          ></textarea>
          <p class="text-xs text-slate-500">Write the line the anchor should read. Max {MAX_SCRIPT_LENGTH} characters.</p>
        </div>

        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <p class="text-xs uppercase tracking-[0.3em] text-slate-400">Anchor voice</p>
            {#if selectedVoice}
              <span class="text-xs text-slate-500">{selectedVoice.label}</span>
            {/if}
          </div>
          <div class="space-y-2">
            {#each voices as voice}
              <button
                type="button"
                disabled={!voice.available || scriptVoiceSubmitted}
                title={voice.available ? `${voice.label} — ${voice.tone}` : voice.availabilityReason ?? "Unavailable"}
                class={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${voice.id === selectedVoicePresetId ? "border-fuchsia-400 bg-fuchsia-900/40" : voice.available ? "border-slate-600 bg-slate-900/80 active:border-fuchsia-500" : "border-slate-700 bg-slate-900/40 text-slate-500"} disabled:opacity-50`}
                on:click={() => chooseVoice(voice)}
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class={`font-semibold ${voice.available ? "text-white" : "text-slate-400"}`}>{voice.label}</p>
                    <p class={`text-xs ${voice.available ? "text-slate-300" : "text-slate-500"}`}>{voice.tone}</p>
                  </div>
                  {#if !voice.available}
                    <span class="rounded-full border border-slate-600 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Soon</span>
                  {:else if voice.id === selectedVoicePresetId}
                    <span class="rounded-full border border-fuchsia-400/40 bg-fuchsia-900/40 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-fuchsia-200">Selected</span>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        </div>

        {#if scriptVoiceSubmitted}
          <div class="rounded-2xl border border-emerald-500/30 bg-emerald-950/30 p-4 space-y-1 text-sm text-emerald-100">
            <p class="font-bold">Script submitted.</p>
            {#if scriptVoiceTTSStatus}
              <p class="text-emerald-200/80">TTS status: {scriptVoiceTTSStatus}</p>
            {/if}
            {#if scriptVoiceEstimatedSpeechMs > 0}
              <p class="text-emerald-200/80">Estimated read time: {Math.max(1, Math.round(scriptVoiceEstimatedSpeechMs / 1000))}s</p>
            {/if}
          </div>
        {/if}

        {#if scriptVoiceError}
          <p class="text-sm text-red-400">{scriptVoiceError}</p>
        {/if}

        <button
          type="button"
          class={`w-full rounded-2xl py-3 font-bold transition-all ${canSubmitScriptVoice && !scriptVoiceSubmitted ? "bg-fuchsia-600 text-white active:scale-[0.98] active:bg-fuchsia-500" : "bg-slate-800 text-slate-600"}`}
          disabled={!canSubmitScriptVoice || scriptVoiceSubmitted}
          on:click={submitScriptVoice}
        >
          {scriptVoiceSubmitted ? "Script Locked" : "Submit Script + Voice"}
        </button>
      </div>
    </div>

  {:else if subPhase === "gif_selection"}
    <div class="w-full max-w-md space-y-4">
      <div class="sticky top-0 z-10 space-y-3 rounded-3xl border border-slate-800/80 bg-slate-950/95 p-4 backdrop-blur-sm">
        <div class="text-center space-y-2">
          <p class="text-xs uppercase tracking-[0.35em] text-sky-300/80">Select Visual</p>
          <h2 class="text-2xl font-black text-white">Pick a GIF</h2>
          <p class="text-sm text-slate-400">{Math.ceil(timeLeft)}s remaining</p>
        </div>

        <div class="rounded-2xl border border-sky-500/20 bg-sky-950/25 px-4 py-3 text-center">
          <p class="text-xs uppercase tracking-[0.3em] text-sky-200/80">Assigned headline</p>
          <p class="mt-2 text-base font-black leading-snug text-white">{assignedHeadline || "Waiting for your headline..."}</p>
        </div>
      </div>

      <div class="rounded-3xl border border-slate-800 bg-slate-950/70 p-4 space-y-3">
        <div class="flex items-center justify-between text-sm text-slate-300">
          <span>Visuals selected</span>
          <span class="font-black text-white">{submittedCount} / {totalPlayers}</span>
        </div>
        <div class="h-3 overflow-hidden rounded-full bg-slate-800">
          <div class="h-full bg-sky-500 transition-all duration-500" style="width:{totalPlayers > 0 ? (submittedCount / totalPlayers) * 100 : 0}%"></div>
        </div>
      </div>

      <div class="rounded-3xl border border-slate-800 bg-slate-900/80 p-4 space-y-4">
        <div class="space-y-3 rounded-2xl border border-slate-700 bg-slate-900/90 p-3">
          <div class="flex items-center justify-between gap-3">
            <p class="text-xs uppercase tracking-[0.3em] text-slate-300">Search visual library</p>
            {#if isSearching}
              <span class="text-xs text-sky-300">Searching...</span>
            {/if}
          </div>
          <div class="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              bind:value={mediaSearchQuery}
              on:input={onSearchInput}
              disabled={gifSelected}
              placeholder="raccoon mayor, exploding cake, penguin traffic..."
              class="flex-1 rounded-2xl border border-slate-600 bg-slate-800 px-4 py-3 text-white placeholder-slate-400 focus:border-sky-500 focus:outline-none disabled:opacity-50"
            />
            <button
              type="button"
              class={`rounded-2xl px-4 py-3 font-bold sm:flex-shrink-0 ${mediaSearchQuery.trim().length >= 2 ? "bg-sky-600 text-white active:bg-sky-500" : "bg-slate-700 text-slate-400"}`}
              disabled={mediaSearchQuery.trim().length < 2 || gifSelected}
              on:click={runMediaSearch}
            >Search</button>
          </div>
        </div>

        {#if selectedMedia && selectedMedia.providerAssetId !== FALLBACK_MEDIA.providerAssetId}
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <p class="text-xs uppercase tracking-[0.3em] text-slate-400">Selected visual</p>
            </div>
            <div class="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
              {#if isVideoMedia(selectedMedia)}
                <video class="h-44 w-full object-cover" src={getPreviewUrl(selectedMedia)} autoplay muted loop playsinline></video>
              {:else}
                <img class="h-44 w-full object-cover" src={getPreviewUrl(selectedMedia)} alt={selectedMedia.label} />
              {/if}
            </div>
            <p class="text-sm font-semibold text-white">{selectedMedia.label}</p>
          </div>
        {/if}

        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <p class="text-xs uppercase tracking-[0.3em] text-slate-400">Search results</p>
            <span class="text-xs text-slate-500">{mediaSearchResults.length} clips</span>
          </div>

          {#if mediaSearchQuery.trim().length >= 2 && !isSearching && mediaSearchResults.length === 0}
            <div class="rounded-2xl border border-dashed border-slate-600 bg-slate-900/70 p-4 text-sm text-slate-300">
              No clips came back yet. Try another query.
            </div>
          {/if}

          {#if mediaSearchResults.length > 0}
            <div class="grid grid-cols-2 gap-3">
              {#each mediaSearchResults as media}
                <button
                  type="button"
                  disabled={gifSelected}
                  class={`overflow-hidden rounded-2xl border text-left transition-colors ${selectedMedia?.providerAssetId === media.providerAssetId ? "border-sky-400 bg-sky-900/40" : "border-slate-700 bg-slate-900/80 active:border-sky-500"} disabled:opacity-50`}
                  on:click={() => selectGif(media)}
                >
                  {#if isVideoMedia(media)}
                    <video class="h-24 w-full object-cover" src={getGalleryUrl(media)} autoplay muted loop playsinline></video>
                  {:else}
                    <img class="h-24 w-full object-cover" src={getGalleryUrl(media)} alt={media.label} />
                  {/if}
                </button>
              {/each}
            </div>
          {/if}
        </div>

        {#if selectedMedia && selectedMedia.providerAssetId !== FALLBACK_MEDIA.providerAssetId && !gifSelected}
          <button
            type="button"
            class={`w-full rounded-2xl py-3 font-bold transition-all active:scale-[0.98] ${selectedMedia ? "bg-sky-600 text-white active:bg-sky-500" : "bg-slate-800 text-slate-600"}`}
            disabled={!selectedMedia || gifSelected}
            on:click={submitGif}
          >
            Submit Visual Choice
          </button>
        {/if}

        {#if gifSelected}
          <div class="rounded-2xl border border-emerald-500/30 bg-emerald-950/30 p-4 text-sm text-emerald-100">
            <p class="font-bold">Visual selected.</p>
          </div>
        {/if}

        {#if gifError}
          <p class="text-sm text-red-400">{gifError}</p>
        {/if}
      </div>
    </div>

  {:else if subPhase === "logo_creation"}
    <div class="w-full max-w-md space-y-4">
      <div class="text-center space-y-2">
        <p class="text-xs uppercase tracking-[0.35em] text-violet-300/80">Brand Your Broadcast</p>
        <h2 class="text-2xl font-black text-white">News Company Logo</h2>
        <p class="text-sm text-slate-400">{Math.ceil(timeLeft)}s remaining</p>
      </div>

      <div class="rounded-3xl border border-slate-800 bg-slate-950/70 p-4 space-y-3">
        <div class="flex items-center justify-between text-sm text-slate-300">
          <span>Logos submitted</span>
          <span class="font-black text-white">{submittedCount} / {totalPlayers}</span>
        </div>
        <div class="h-3 overflow-hidden rounded-full bg-slate-800">
          <div class="h-full bg-violet-500 transition-all duration-500" style="width:{totalPlayers > 0 ? (submittedCount / totalPlayers) * 100 : 0}%"></div>
        </div>
      </div>

      <div class="rounded-3xl border border-slate-800 bg-slate-900/80 p-4 space-y-4">
        <div class="space-y-2">
          <p class="text-xs uppercase tracking-[0.3em] text-slate-400">Design your logo</p>
          <div class="rounded-2xl border border-slate-700 bg-slate-900/90 p-4">
            <IconDesignEditor
              bind:design={logoDesign}
              previewSize={120}
              disabled={logoSubmitted}
            />
          </div>
        </div>

        {#if logoSubmitted}
          <div class="rounded-2xl border border-emerald-500/30 bg-emerald-950/30 p-4 text-sm text-emerald-100">
            <p class="font-bold">Logo submitted.</p>
          </div>
        {/if}

        {#if logoError}
          <p class="text-sm text-red-400">{logoError}</p>
        {/if}

        <button
          type="button"
          class={`w-full rounded-2xl py-3 font-bold transition-all ${!logoSubmitted ? "bg-violet-600 text-white active:scale-[0.98] active:bg-violet-500" : "bg-slate-800 text-slate-600"}`}
          disabled={logoSubmitted}
          on:click={submitLogo}
        >
          {logoSubmitted ? "Logo Locked" : "Submit Logo"}
        </button>
      </div>
    </div>

  {:else if subPhase === "buffering"}
    <div class="w-full max-w-sm space-y-4 text-center">
      <div class="rounded-3xl border border-cyan-500/20 bg-slate-900/80 p-6 space-y-4">
        <p class="text-5xl">📡</p>
        <h2 class="text-2xl font-black text-cyan-300">Cueing the control room</h2>
        <p class="text-sm text-slate-300">We are lining up the first segments and getting the broadcast order ready.</p>
        <p class="text-sm text-slate-400">{Math.ceil(timeLeft)}s remaining</p>
        {#if bufferingTargetReadyCount > 0}
          <p class="text-xs uppercase tracking-[0.25em] text-cyan-200/80">Target: {bufferingTargetReadyCount} ready clip{bufferingTargetReadyCount === 1 ? "" : "s"}</p>
        {/if}
      </div>

      <div class="rounded-3xl border border-slate-800 bg-slate-950/70 p-4 text-left space-y-2">
        <p class="text-xs uppercase tracking-[0.3em] text-slate-400">Your headline</p>
        <p class="font-semibold text-white">{assignedHeadline}</p>
      </div>
    </div>

  {:else if subPhase === "presentation"}
    <div class="w-full max-w-sm space-y-4">
      <div class="rounded-3xl border border-indigo-500/20 bg-slate-900/80 p-6 text-center space-y-4">
        <p class="text-5xl">📺</p>
        <h2 class="text-2xl font-black text-indigo-300">Watch the TV</h2>
        <p class="text-sm text-slate-300">The broadcast reel is running on the big screen.</p>
        {#if timeLeft > 0}
          <p class="text-sm text-slate-400">{Math.ceil(timeLeft)}s remaining</p>
        {/if}
      </div>

      {#if prepareState}
        <div class="rounded-3xl border border-indigo-500/20 bg-indigo-950/20 p-5 space-y-3 text-center">
          <p class="text-xs uppercase tracking-[0.3em] text-indigo-200/80">Up next</p>
          <p class="text-lg font-black text-white">{prepareState.upNext.playerName}</p>
          <p class="text-sm text-indigo-100/85">{prepareState.upNext.assignedHeadline}</p>
          <p class="text-xs text-slate-400">Segment {prepareState.index + 1} of {prepareState.total}</p>
        </div>
      {/if}

      {#if currentPresentation}
        <div class="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 space-y-3">
          <div class="flex items-center justify-between gap-3">
            <p class="text-xs uppercase tracking-[0.3em] text-slate-400">Now presenting</p>
            <span class="text-xs text-slate-500">{currentPresentation.index + 1} / {currentPresentation.total}</span>
          </div>
          <p class="text-lg font-black text-white">{currentPresentation.entry.playerName}</p>
          <p class="text-sm font-semibold text-indigo-200">{currentPresentation.entry.assignedHeadline}</p>
          <p class="rounded-2xl bg-slate-900 px-4 py-3 text-sm text-slate-200 leading-relaxed">“{currentPresentation.entry.script}”</p>
          {#if currentPresentation.entry.playerId === me?.id}
            <div class="rounded-2xl border border-amber-500/30 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
              That's your segment on screen.
            </div>
          {/if}
        </div>
      {/if}
    </div>

  {:else if subPhase === "voting"}
    <div class="w-full max-w-md space-y-4">
      <div class="text-center space-y-2">
        <p class="text-xs uppercase tracking-[0.35em] text-amber-300/80">Town Poll</p>
        <h2 class="text-2xl font-black text-white">Vote for the best broadcast</h2>
        <p class="text-sm text-slate-400">{Math.ceil(timeLeft)}s remaining</p>
      </div>

      <div class="rounded-3xl border border-slate-800 bg-slate-950/70 p-4 space-y-3">
        <div class="flex items-center justify-between text-sm text-slate-300">
          <span>Votes in</span>
          <span class="font-black text-white">{votesIn} / {totalVoters}</span>
        </div>
        <div class="h-3 overflow-hidden rounded-full bg-slate-800">
          <div class="h-full bg-amber-500 transition-all duration-500" style="width:{totalVoters > 0 ? (votesIn / totalVoters) * 100 : 0}%"></div>
        </div>
      </div>

      {#if voteConfirmed}
        <div class="rounded-3xl border border-emerald-500/30 bg-emerald-950/30 p-4 text-sm text-emerald-100">
          Vote locked in for <span class="font-bold">{getPlayerName(myVote)}</span>.
        </div>
      {/if}

      {#if votingEntries.length === 0}
        <div class="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 text-center text-sm text-slate-400">
          Nothing to vote on from this phone. Sit tight while the newsroom finishes the tally.
        </div>
      {:else}
        <div class="space-y-3">
          {#each votingEntries as entry}
            <button
              type="button"
              class={`w-full rounded-3xl border text-left transition-colors ${myVote === entry.playerId ? "border-amber-400 bg-amber-900/40" : voteConfirmed ? "border-slate-700 bg-slate-900/50" : "border-slate-700 bg-slate-900/90 active:border-amber-500"}`}
              disabled={voteConfirmed}
              on:click={() => castVote(entry.playerId)}
            >
              {#if isVideoMedia(entry.selectedMedia)}
                <video class="h-28 w-full rounded-t-3xl object-cover" src={getPreviewUrl(entry.selectedMedia)} autoplay muted loop playsinline></video>
              {:else}
                <img class="h-28 w-full rounded-t-3xl object-cover" src={getPreviewUrl(entry.selectedMedia)} alt={entry.selectedMedia.label} />
              {/if}
              <div class="space-y-2 p-4">
                <div class="flex items-center justify-between gap-3">
                  <p class="font-black text-white">{entry.playerName}</p>
                  <span class="text-[10px] uppercase tracking-[0.25em] text-slate-500">Segment</span>
                </div>
                <p class="text-sm font-semibold text-amber-200">{entry.assignedHeadline}</p>
                <p class="text-xs text-slate-400">{entry.selectedMedia.label}</p>
              </div>
            </button>
          {/each}
        </div>
      {/if}
    </div>

  {:else if subPhase === "results"}
    <div class="w-full max-w-md space-y-4">
      <div class="text-center space-y-2">
        <p class="text-xs uppercase tracking-[0.35em] text-emerald-300/80">Broadcast Results</p>
        <h2 class="text-2xl font-black text-white">The newsroom has spoken</h2>
        {#if winningEntries.length > 0}
          <p class="text-sm text-slate-300">
            Winner{winningEntries.length === 1 ? "" : "s"}: {winningEntries.map((entry) => entry.playerName).join(", ")}
          </p>
        {:else}
          <p class="text-sm text-slate-400">No audience favorite this time.</p>
        {/if}
      </div>

      {#if myResult}
        <div class="rounded-3xl border border-emerald-500/25 bg-emerald-950/25 p-5 space-y-2">
          <p class="text-xs uppercase tracking-[0.3em] text-emerald-200/80">Your result</p>
          <p class="text-lg font-black text-white">{myResult.assignedHeadline}</p>
          <div class="flex items-center justify-between text-sm text-emerald-100">
            <span>{myResult.voteCount} vote{myResult.voteCount === 1 ? "" : "s"}</span>
            <span>+{results?.scores[myResult.playerId] ?? 0} pts</span>
          </div>
        </div>
      {/if}

      <div class="rounded-3xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
        <div class="flex items-center justify-between text-sm text-slate-300">
          <span>Total votes</span>
          <span class="font-black text-white">{results?.totalVotes ?? 0}</span>
        </div>
        <div class="flex items-center justify-between text-sm text-slate-300">
          <span>Participation bonus</span>
          <span class="font-black text-white">+{results?.participationPoints ?? 0}</span>
        </div>
      </div>

      <div class="space-y-3">
        {#each results?.entries ?? [] as entry, index}
          <div class={`rounded-3xl border p-4 ${entry.isWinner ? "border-amber-400/40 bg-amber-950/20" : "border-slate-800 bg-slate-950/70"}`}>
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-xs uppercase tracking-[0.25em] text-slate-500">#{index + 1}</p>
                <p class="text-lg font-black text-white">{entry.playerName}</p>
                <p class="text-sm font-semibold text-slate-300">{entry.assignedHeadline}</p>
              </div>
              <div class="text-right text-sm">
                <p class="font-bold text-white">{entry.voteCount} 🗳️</p>
                <p class="text-emerald-300">+{results?.scores[entry.playerId] ?? 0}</p>
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
