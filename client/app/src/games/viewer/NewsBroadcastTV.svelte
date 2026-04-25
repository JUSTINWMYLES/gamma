<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState } from "../../../../shared/types";
  import { getRoundProgressLabel } from "../../../../shared/types";
  import { getServerHttpBaseUrl } from "../../../../shared/colyseusClient";
  import PlayerIcon from "../../components/PlayerIcon.svelte";

  export let room: Room;
  export let state: RoomState;

  type SubPhase =
    | "waiting"
    | "headline_submission"
    | "assignment_reveal"
    | "broadcast_creation"
    | "buffering"
    | "presentation"
    | "voting"
    | "results";

  interface Unsubscribe {
    (): void;
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

  interface ResultEntry {
    playerId: string;
    playerName: string;
    assignedHeadline: string;
    script: string;
    voicePresetId: string;
    voiceLabel: string;
    selectedMedia: MediaEntry;
    estimatedSpeechMs: number;
    voteCount: number;
    isWinner: boolean;
  }

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

  const SERVER_HTTP_BASE_URL = getServerHttpBaseUrl();

  let subPhase: SubPhase = "waiting";
  let roundSkipped = false;
  let skipReason = "";

  let timeLeft = 0;
  let timerInterval: ReturnType<typeof setInterval> | null = null;
  let presentationAudio: HTMLAudioElement | null = null;
  let presentationAudioJobId = "";
  let unsubs: Unsubscribe[] = [];

  let submittedCount = 0;
  let totalPlayers = 0;
  let bufferingTargetReadyCount = 0;

  let prepareState: PresentationPreparePayload | null = null;
  let currentPresentation:
    | {
        index: number;
        total: number;
        entry: PresentationEntryPayload;
      }
    | null = null;

  let votingEntries: VotingEntry[] = [];
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

  function clearTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function startTimer(serverTimestamp: number, durationMs: number) {
    const endTime = serverTimestamp + durationMs;
    clearTimer();

    const tick = () => {
      timeLeft = Math.max(0, (endTime - Date.now()) / 1000);
    };

    tick();
    timerInterval = setInterval(tick, 100);
  }

  function buildPresentationAudioUrl(jobId: string): string {
    return `${SERVER_HTTP_BASE_URL}/api/tts/audio/${encodeURIComponent(jobId)}`;
  }

  function stopPresentationAudio() {
    presentationAudioJobId = "";
    if (!presentationAudio) return;

    presentationAudio.pause();
    presentationAudio.currentTime = 0;
    presentationAudio.removeAttribute("src");
    presentationAudio.load();
    presentationAudio = null;
  }

  function playPresentationAudio(entry: PresentationEntryPayload) {
    if (entry.captionsOnly || !entry.artifactReady || !entry.artifactJobId) {
      stopPresentationAudio();
      return;
    }

    if (presentationAudio && presentationAudioJobId === entry.artifactJobId) {
      presentationAudio.currentTime = 0;
      presentationAudio.play().catch(() => {});
      return;
    }

    stopPresentationAudio();

    presentationAudioJobId = entry.artifactJobId;
    presentationAudio = new Audio(buildPresentationAudioUrl(entry.artifactJobId));
    presentationAudio.preload = "auto";
    presentationAudio.autoplay = true;
    presentationAudio.play().catch(() => {});
  }

  function resetRoundState() {
    stopPresentationAudio();
    roundSkipped = false;
    skipReason = "";
    submittedCount = 0;
    totalPlayers = 0;
    bufferingTargetReadyCount = 0;
    prepareState = null;
    currentPresentation = null;
    votingEntries = [];
    votesIn = 0;
    totalVoters = 0;
    results = null;
  }

  function isVideoMedia(media: MediaEntry | null | undefined): boolean {
    return (media?.mimeType ?? "").startsWith("video/");
  }

  function getMediaUrl(media: MediaEntry | null | undefined): string {
    const resolved = media ?? FALLBACK_MEDIA;
    if (isVideoMedia(resolved)) {
      return resolved.playbackUrl || resolved.previewUrl || resolved.fallbackImageUrl || FALLBACK_MEDIA.previewUrl;
    }
    return resolved.fallbackImageUrl || resolved.previewUrl || resolved.playbackUrl || FALLBACK_MEDIA.previewUrl;
  }

  function getPlayerName(playerId: string | null | undefined): string {
    if (!playerId) return "No winner";
    return state.players.get(playerId)?.name ?? playerId;
  }

  function onHeadlineSubmissionStart(data: { durationMs: number; serverTimestamp: number; totalPlayers: number }) {
    resetRoundState();
    subPhase = "headline_submission";
    totalPlayers = data.totalPlayers;
    submittedCount = 0;
    startTimer(data.serverTimestamp, data.durationMs);
  }

  function onHeadlineSubmissionUpdate(data: { submitted: number; total: number }) {
    submittedCount = data.submitted;
    totalPlayers = data.total;
  }

  function onHeadlineAssignmentReveal(data: { durationMs: number; serverTimestamp: number }) {
    stopPresentationAudio();
    subPhase = "assignment_reveal";
    startTimer(data.serverTimestamp, data.durationMs);
  }

  function onBroadcastCreationStart(data: { durationMs: number; serverTimestamp: number; totalPlayers: number }) {
    stopPresentationAudio();
    subPhase = "broadcast_creation";
    submittedCount = 0;
    totalPlayers = data.totalPlayers;
    startTimer(data.serverTimestamp, data.durationMs);
  }

  function onBroadcastSubmissionUpdate(data: { submitted: number; total: number }) {
    submittedCount = data.submitted;
    totalPlayers = data.total;
  }

  function onBroadcastBufferingStart(data: { durationMs: number; serverTimestamp: number; targetReadyCount: number }) {
    stopPresentationAudio();
    subPhase = "buffering";
    bufferingTargetReadyCount = data.targetReadyCount;
    prepareState = null;
    currentPresentation = null;
    startTimer(data.serverTimestamp, data.durationMs);
  }

  function onPresentationPrepare(data: PresentationPreparePayload) {
    stopPresentationAudio();
    subPhase = "presentation";
    prepareState = data;
    currentPresentation = null;
    startTimer(data.serverTimestamp, data.durationMs);
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
    startTimer(data.serverTimestamp, data.durationMs);
    playPresentationAudio(data.entry);
  }

  function onPresentationEnd() {
    stopPresentationAudio();
    clearTimer();
  }

  function onVotingStart(data: {
    durationMs: number;
    serverTimestamp: number;
    totalVoters: number;
    entries: VotingEntry[];
  }) {
    stopPresentationAudio();
    subPhase = "voting";
    votingEntries = data.entries ?? [];
    votesIn = 0;
    totalVoters = data.totalVoters;
    startTimer(data.serverTimestamp, data.durationMs);
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
    stopPresentationAudio();
    subPhase = "results";
    results = data;
    clearTimer();
  }

  function onRoundSkipped(data: { reason: string }) {
    stopPresentationAudio();
    roundSkipped = true;
    skipReason = data.reason;
    clearTimer();
  }

  onMount(() => {
    unsubs = [
      room.onMessage("headline_submission_start", onHeadlineSubmissionStart),
      room.onMessage("headline_submission_update", onHeadlineSubmissionUpdate),
      room.onMessage("headline_assignment_reveal", onHeadlineAssignmentReveal),
      room.onMessage("broadcast_creation_start", onBroadcastCreationStart),
      room.onMessage("broadcast_submission_update", onBroadcastSubmissionUpdate),
      room.onMessage("broadcast_buffering_start", onBroadcastBufferingStart),
      room.onMessage("presentation_prepare", onPresentationPrepare),
      room.onMessage("presentation_start", onPresentationStart),
      room.onMessage("presentation_end", onPresentationEnd),
      room.onMessage("voting_start", onVotingStart),
      room.onMessage("vote_count_update", onVoteCountUpdate),
      room.onMessage("round_result", onRoundResult),
      room.onMessage("round_skipped", onRoundSkipped),
    ];
  });

  onDestroy(() => {
    stopPresentationAudio();
    clearTimer();
    for (const unsub of unsubs) unsub();
    unsubs = [];
  });

  $: if (state.phase !== "in_round") {
    stopPresentationAudio();
  }

  $: leaderboard = [...state.players.values()].sort((a, b) => b.score - a.score);
  $: winningEntries = results?.entries.filter((entry) => entry.isWinner) ?? [];
</script>

<div class="flex-1 flex" data-testid="news-broadcast-tv">
  <div class="w-72 border-r border-slate-800 bg-slate-950/80 px-4 pb-4 pt-6 flex flex-col gap-4 flex-shrink-0">
    <div>
      <p class="text-xs uppercase tracking-widest text-sky-300/80 font-semibold">Broadcast Desk</p>
      <p class="mt-1 text-sm text-slate-400">{getRoundProgressLabel(state)}</p>
    </div>

    <div class="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-2">
      <p class="text-xs uppercase tracking-widest text-slate-400">Current phase</p>
      <p class="text-lg font-black text-white">
        {#if subPhase === "headline_submission"}
          Headline collection
        {:else if subPhase === "assignment_reveal"}
          Story assignment
        {:else if subPhase === "broadcast_creation"}
          Segment creation
        {:else if subPhase === "buffering"}
          Control room buffering
        {:else if subPhase === "presentation"}
          On air
        {:else if subPhase === "voting"}
          Audience vote
        {:else if subPhase === "results"}
          Results
        {:else}
          Getting ready
        {/if}
      </p>
      {#if timeLeft > 0}
        <p class="text-4xl font-black font-mono text-sky-200">{Math.ceil(timeLeft)}</p>
      {/if}
    </div>

    <div class="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
      <div class="flex items-center justify-between text-sm text-slate-300">
        <span>Progress</span>
        <span class="font-black text-white">{submittedCount} / {totalPlayers}</span>
      </div>
      <div class="h-3 overflow-hidden rounded-full bg-slate-800">
        <div class="h-full bg-fuchsia-500 transition-all duration-500" style="width:{totalPlayers > 0 ? (submittedCount / totalPlayers) * 100 : 0}%"></div>
      </div>
      <p class="text-xs text-slate-500">Used during collection and creation phases.</p>
    </div>

    <div class="mt-auto">
      <p class="mb-2 text-xs uppercase tracking-widest text-slate-400">Leaderboard</p>
      <ul class="space-y-1.5">
        {#each leaderboard as player, index}
          <li class="flex items-center gap-2 rounded-xl bg-slate-900 px-2 py-2">
            <span class="w-5 text-xs font-mono text-slate-500">{index + 1}.</span>
            <PlayerIcon {player} size={20} />
            <span class="flex-1 truncate text-sm text-slate-200">{player.name}</span>
            <span class="text-sm font-bold text-white">{player.score}</span>
          </li>
        {/each}
      </ul>
    </div>
  </div>

  <div class="flex-1 flex flex-col items-center justify-center p-8">
    {#if roundSkipped}
      <div class="text-center space-y-4">
        <p class="text-7xl">🛑</p>
        <h2 class="text-5xl font-black text-yellow-300">Round Skipped</h2>
        <p class="text-xl text-slate-300">{skipReason}</p>
      </div>

    {:else if subPhase === "waiting"}
      <div class="text-center space-y-6 max-w-4xl">
        <p class="text-lg uppercase tracking-[0.45em] text-sky-300/70">Gamma Newsroom</p>
        <h2 class="text-7xl font-black text-white tracking-[0.08em]">NEWS BROADCAST</h2>
        <p class="text-2xl text-slate-300">Players pitch absurd headlines, inherit someone else's story, build a fake newscast, then vote for the best on-air disaster.</p>
      </div>

    {:else if subPhase === "headline_submission"}
      <div class="w-full max-w-6xl space-y-8">
        <div class="flex items-start justify-between gap-8">
          <div class="space-y-3 max-w-4xl">
            <p class="text-lg uppercase tracking-[0.45em] text-sky-300/70">Headline Collection</p>
            <h2 class="text-6xl font-black text-white">Pitch tonight's ridiculous breaking news</h2>
            <p class="text-2xl text-slate-300">Everyone writes a headline on their phone. The newsroom will shuffle them before the anchors go live.</p>
          </div>
          <div class="text-right shrink-0">
            <p class:animate-pulse={timeLeft < 10} class="min-w-[3ch] text-7xl font-black font-mono text-white">{Math.ceil(timeLeft)}</p>
            <p class="text-sm uppercase tracking-[0.3em] text-sky-200/60">seconds left</p>
          </div>
        </div>

        <div class="rounded-[32px] border border-sky-500/20 bg-sky-950/15 p-8 space-y-5">
          <div class="flex items-center justify-between text-sky-100/85">
            <span class="text-sm uppercase tracking-[0.3em]">Headlines in</span>
            <span class="text-3xl font-black">{submittedCount} / {totalPlayers}</span>
          </div>
          <div class="h-4 overflow-hidden rounded-full bg-black/30">
            <div class="h-full bg-sky-400 transition-all duration-500" style="width:{totalPlayers > 0 ? (submittedCount / totalPlayers) * 100 : 0}%"></div>
          </div>
          <div class="grid grid-cols-2 xl:grid-cols-3 gap-4 pt-2">
            {#each [...state.players.values()] as player}
              <div class="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 flex items-center gap-3">
                <PlayerIcon {player} size={42} />
                <div>
                  <p class="font-black text-white">{player.name}</p>
                  <p class="text-xs uppercase tracking-[0.2em] text-sky-100/55">Writing headline</p>
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>

    {:else if subPhase === "assignment_reveal"}
      <div class="text-center space-y-6 max-w-5xl">
        <p class="text-7xl">🔀</p>
        <h2 class="text-5xl font-black text-violet-300">Headlines Reassigned</h2>
        <p class="text-2xl text-slate-300">Nobody reads their own story. Each player just got somebody else's breaking headline on their phone.</p>
        <p class="text-lg text-violet-100/80">Next: pick a visual, choose a voice, and write the anchor script.</p>
      </div>

    {:else if subPhase === "broadcast_creation"}
      <div class="w-full max-w-6xl space-y-8">
        <div class="flex items-start justify-between gap-8">
          <div class="space-y-3 max-w-4xl">
            <p class="text-lg uppercase tracking-[0.45em] text-fuchsia-300/70">Segment Creation</p>
            <h2 class="text-6xl font-black text-white">Build the fake broadcast package</h2>
            <p class="text-2xl text-slate-300">Players are choosing media, picking an anchor voice, and writing the on-air script for their assigned headline.</p>
          </div>
          <div class="text-right shrink-0">
            <p class:animate-pulse={timeLeft < 15} class="min-w-[3ch] text-7xl font-black font-mono text-white">{Math.ceil(timeLeft)}</p>
            <p class="text-sm uppercase tracking-[0.3em] text-fuchsia-200/60">seconds left</p>
          </div>
        </div>

        <div class="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] items-start">
          <div class="rounded-[32px] border border-fuchsia-500/20 bg-fuchsia-950/15 p-8 space-y-5">
            <div class="flex items-center justify-between text-fuchsia-100/85">
              <span class="text-sm uppercase tracking-[0.3em]">Segments locked in</span>
              <span class="text-3xl font-black">{submittedCount} / {totalPlayers}</span>
            </div>
            <div class="h-4 overflow-hidden rounded-full bg-black/30">
              <div class="h-full bg-fuchsia-400 transition-all duration-500" style="width:{totalPlayers > 0 ? (submittedCount / totalPlayers) * 100 : 0}%"></div>
            </div>
            <div class="grid grid-cols-2 xl:grid-cols-3 gap-4 pt-2">
              {#each [...state.players.values()] as player}
                <div class="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 flex items-center gap-3">
                  <PlayerIcon {player} size={42} />
                  <div>
                    <p class="font-black text-white">{player.name}</p>
                    <p class="text-xs uppercase tracking-[0.2em] text-fuchsia-100/55">Producing segment</p>
                  </div>
                </div>
              {/each}
            </div>
          </div>

          <div class="rounded-[32px] border border-fuchsia-500/20 bg-black/25 p-8 space-y-4">
            <p class="text-sm uppercase tracking-[0.3em] text-fuchsia-200/70">What players are doing</p>
            <div class="space-y-3 text-lg text-fuchsia-50/80">
              <p>Search for a chaotic clip.</p>
              <p>Pick the anchor voice.</p>
              <p>Write the line the newsroom will read on air.</p>
            </div>
            <p class="text-base text-fuchsia-50/65">If nobody finds the right visual, Gamma falls back to a built-in technical difficulties frame so the round can keep moving.</p>
          </div>
        </div>
      </div>

    {:else if subPhase === "buffering"}
      <div class="text-center space-y-6 max-w-4xl">
        <p class="text-7xl">📡</p>
        <h2 class="text-5xl font-black text-cyan-300">Cueing the reel</h2>
        <p class="text-2xl text-slate-300">The control room is lining up the first few segments before the show starts.</p>
        <p class="text-lg text-cyan-100/80">Target ready clips: {bufferingTargetReadyCount}</p>
      </div>

    {:else if subPhase === "presentation"}
      <div class="w-full max-w-7xl space-y-6">
        {#if prepareState}
          <div class="text-center space-y-5 max-w-5xl mx-auto">
            <p class="text-lg uppercase tracking-[0.45em] text-indigo-300/70">Up Next</p>
            <h2 class="text-6xl font-black text-white">{prepareState.upNext.playerName}</h2>
            <p class="text-3xl text-indigo-100">{prepareState.upNext.assignedHeadline}</p>
            <p class="text-lg text-slate-400">Segment {prepareState.index + 1} of {prepareState.total}</p>
          </div>
        {/if}

        {#if currentPresentation}
          <div class="grid gap-8 xl:grid-cols-[1.3fr_0.7fr] items-start">
            <div class="overflow-hidden rounded-[36px] border border-slate-800 bg-slate-950 shadow-2xl">
              {#if isVideoMedia(currentPresentation.entry.selectedMedia)}
                <video
                  class="h-[34rem] w-full object-cover"
                  src={getMediaUrl(currentPresentation.entry.selectedMedia)}
                  autoplay
                  muted
                  loop
                  playsinline
                ></video>
              {:else}
                <img
                  class="h-[34rem] w-full object-cover"
                  src={getMediaUrl(currentPresentation.entry.selectedMedia)}
                  alt={currentPresentation.entry.selectedMedia?.label ?? "News segment visual"}
                />
              {/if}
            </div>

            <div class="space-y-4">
              <div class="rounded-[32px] border border-indigo-500/20 bg-indigo-950/15 p-6 space-y-3">
                <div class="flex items-center justify-between gap-3 text-sm text-indigo-100/80">
                  <span class="uppercase tracking-[0.3em]">Now on air</span>
                  <span>{currentPresentation.index + 1} / {currentPresentation.total}</span>
                </div>
                <h2 class="text-4xl font-black text-white">{currentPresentation.entry.playerName}</h2>
                <p class="text-2xl font-semibold text-indigo-100">{currentPresentation.entry.assignedHeadline}</p>
                <div class="flex flex-wrap gap-2 pt-1">
                  <span class="rounded-full border border-indigo-400/30 bg-indigo-950/30 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-100">{currentPresentation.entry.voiceLabel}</span>
                  {#if currentPresentation.entry.captionsOnly}
                    <span class="rounded-full border border-amber-400/30 bg-amber-950/30 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">Captions only</span>
                  {/if}
                </div>
              </div>

              <div class="rounded-[32px] border border-slate-800 bg-slate-900/85 p-6 space-y-3">
                <p class="text-xs uppercase tracking-[0.3em] text-slate-400">Caption script</p>
                <p class="text-2xl leading-relaxed text-white">“{currentPresentation.entry.script}”</p>
              </div>

              <div class="rounded-[32px] border border-slate-800 bg-slate-950/70 p-5 space-y-2 text-sm text-slate-300">
                <div class="flex items-center justify-between">
                  <span>Visual label</span>
                  <span class="font-semibold text-white">{currentPresentation.entry.selectedMedia.label}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span>Estimated read time</span>
                  <span class="font-semibold text-white">{Math.max(1, Math.round(currentPresentation.entry.estimatedSpeechMs / 1000))}s</span>
                </div>
                <div class="flex items-center justify-between">
                  <span>Screen timer</span>
                  <span class="font-semibold text-white">{Math.ceil(timeLeft)}s</span>
                </div>
              </div>
            </div>
          </div>
        {/if}
      </div>

    {:else if subPhase === "voting"}
      <div class="w-full max-w-7xl space-y-6">
        <div class="flex items-start justify-between gap-8">
          <div class="space-y-2 max-w-4xl">
            <p class="text-lg uppercase tracking-[0.45em] text-amber-300/70">Audience Vote</p>
            <h2 class="text-6xl font-black text-white">Which segment wins the night?</h2>
            <p class="text-2xl text-slate-300">Players vote on their phones for the funniest complete broadcast package.</p>
          </div>
          <div class="text-right shrink-0">
            <p class:animate-pulse={timeLeft < 10} class="min-w-[3ch] text-7xl font-black font-mono text-white">{Math.ceil(timeLeft)}</p>
            <p class="text-sm uppercase tracking-[0.3em] text-amber-200/60">seconds left</p>
          </div>
        </div>

        <div class="rounded-[28px] border border-amber-500/20 bg-amber-950/15 p-5 flex items-center justify-between text-amber-100/85">
          <span class="uppercase tracking-[0.3em] text-sm">Votes in</span>
          <span class="text-3xl font-black">{votesIn} / {totalVoters}</span>
        </div>

        <div class="grid grid-cols-2 gap-5 xl:grid-cols-3">
          {#each votingEntries as entry}
            <div class="overflow-hidden rounded-[28px] border border-slate-800 bg-slate-950/80">
              {#if isVideoMedia(entry.selectedMedia)}
                <video class="h-40 w-full object-cover" src={getMediaUrl(entry.selectedMedia)} autoplay muted loop playsinline></video>
              {:else}
                <img class="h-40 w-full object-cover" src={getMediaUrl(entry.selectedMedia)} alt={entry.selectedMedia.label} />
              {/if}
              <div class="space-y-2 p-5">
                <div class="flex items-center justify-between gap-3">
                  <p class="text-xl font-black text-white">{entry.playerName}</p>
                  <span class="text-[10px] uppercase tracking-[0.2em] text-slate-500">Vote on phones</span>
                </div>
                <p class="text-base font-semibold text-amber-100">{entry.assignedHeadline}</p>
                <p class="text-sm text-slate-400">{entry.selectedMedia.label}</p>
              </div>
            </div>
          {/each}
        </div>
      </div>

    {:else if subPhase === "results"}
      <div class="w-full max-w-7xl space-y-6">
        <div class="flex items-start justify-between gap-8">
          <div class="space-y-2 max-w-4xl">
            <p class="text-lg uppercase tracking-[0.45em] text-emerald-300/70">Final Results</p>
            <h2 class="text-6xl font-black text-white">
              {#if winningEntries.length > 0}
                {winningEntries.map((entry) => entry.playerName).join(" & ")} won the broadcast
              {:else}
                No clear winner tonight
              {/if}
            </h2>
            <p class="text-2xl text-slate-300">{results?.totalVotes ?? 0} total vote{(results?.totalVotes ?? 0) === 1 ? "" : "s"} cast. Each submitted segment still earns +{results?.participationPoints ?? 0} participation points.</p>
          </div>
          <div class="rounded-[28px] border border-emerald-500/20 bg-emerald-950/15 px-6 py-5 text-right">
            <p class="text-xs uppercase tracking-[0.3em] text-emerald-200/70">Winning anchor</p>
            <p class="mt-2 text-3xl font-black text-white">{getPlayerName(results?.winner)}</p>
          </div>
        </div>

        <div class="grid gap-5 xl:grid-cols-2">
          {#each results?.entries ?? [] as entry, index}
            <div class={`overflow-hidden rounded-[32px] border ${entry.isWinner ? "border-amber-400/40 bg-amber-950/15" : "border-slate-800 bg-slate-950/80"}`}>
              <div class="grid gap-0 md:grid-cols-[0.42fr_0.58fr]">
                <div class="overflow-hidden bg-slate-950">
                  {#if isVideoMedia(entry.selectedMedia)}
                    <video class="h-full min-h-[13rem] w-full object-cover" src={getMediaUrl(entry.selectedMedia)} autoplay muted loop playsinline></video>
                  {:else}
                    <img class="h-full min-h-[13rem] w-full object-cover" src={getMediaUrl(entry.selectedMedia)} alt={entry.selectedMedia.label} />
                  {/if}
                </div>
                <div class="space-y-3 p-5">
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <p class="text-xs uppercase tracking-[0.25em] text-slate-500">#{index + 1}</p>
                      <h3 class="text-2xl font-black text-white">{entry.playerName}</h3>
                    </div>
                    <div class="text-right">
                      <p class="text-lg font-black text-white">{entry.voteCount} 🗳️</p>
                      <p class="text-sm font-semibold text-emerald-300">+{results?.scores[entry.playerId] ?? 0} pts</p>
                    </div>
                  </div>
                  <p class="text-lg font-semibold text-slate-100">{entry.assignedHeadline}</p>
                  <p class="text-sm leading-relaxed text-slate-300">“{entry.script}”</p>
                  <div class="flex flex-wrap gap-2 pt-1 text-xs">
                    <span class="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 font-semibold uppercase tracking-[0.2em] text-slate-300">{entry.voiceLabel}</span>
                    <span class="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 font-semibold uppercase tracking-[0.2em] text-slate-300">{entry.selectedMedia.label}</span>
                    {#if entry.isWinner}
                      <span class="rounded-full border border-amber-400/30 bg-amber-950/30 px-3 py-1 font-semibold uppercase tracking-[0.2em] text-amber-200">Winner</span>
                    {/if}
                  </div>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>
