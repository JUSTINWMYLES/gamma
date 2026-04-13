<script lang="ts">
  /**
   * TV game component for "Audio Overlay" (registry-26).
   *
   * Displays the shared-screen view through the category + GIF-based flow:
   *   category_selection → category_reveal → gif_selection → recording →
   *   playback → voting → results
   *
   * Server messages listened:
   *   category_selection_start, category_chosen,
   *   gif_selection_start, gif_selection_update,
   *   recording_turn, recording_submitted,
   *   playback_entry, playback_done,
   *   voting_start, vote_count_update,
   *   round_result, round_skipped
   */
  import { onMount, onDestroy, createEventDispatcher } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState } from "../../../../shared/types";
  import PlayerIcon from "../../components/PlayerIcon.svelte";

  export let room: Room;
  export let state: RoomState;

  const dispatch = createEventDispatcher<{
    musictrackchange: { trackId: "two_finger_johnny" | null };
  }>();

  // ── Sub-phase state ──────────────────────────────────────────────

  type SubPhase =
    | "waiting"
    | "category_selection"
    | "category_reveal"
    | "gif_selection"
    | "recording_prepare"
    | "recording"
    | "playback"
    | "playback_done"
    | "voting"
    | "results";

  let subPhase: SubPhase = "waiting";

  // ── Category Selection phase ────────────────────────────────────

  interface CategoryInfo {
    id: string;
    name: string;
    icon: string;
    description: string;
  }

  let categories: CategoryInfo[] = [];
  let categoryChooserName = "";
  let categoryTimeLeft = 0;
  let categoryEndTime = 0;
  let categoryTimer: ReturnType<typeof setInterval> | null = null;
  let chosenCategory: CategoryInfo | null = null;

  const CATEGORY_ICONS: Record<string, string> = {
    devil: "\uD83D\uDE08",
    paw: "\uD83D\uDC3E",
    car: "\uD83D\uDE97",
    megaphone: "\uD83D\uDCE2",
    music: "\uD83C\uDFB5",
    trophy: "\uD83C\uDFC6",
    shuffle: "\uD83C\uDFB2",
  };

  // ── GIF Selection phase ─────────────────────────────────────────

  let selectionTimeLeft = 0;
  let selectionEndTime = 0;
  let selectionTimer: ReturnType<typeof setInterval> | null = null;
  let selectionsSubmitted = 0;
  let selectionsTotal = 0;
  let gifCategoryInfo: CategoryInfo | null = null;

  // ── Recording phase ─────────────────────────────────────────────

  let recorderName = "";
  let recordingTimeLeft = 0;
  let recordingEndTime = 0;
  let recordingTimer: ReturnType<typeof setInterval> | null = null;
  let recorderSubmitted = false;
  let recordingMode: "randomized" | "record_own" = "randomized";
  let maxClipDurationMs = 10_000;

  // ── Playback phase ──────────────────────────────────────────────

  let playbackName = "";
  let playbackGifUrl = "";
  let playbackGifLabel = "";
  let playbackIntroOnly = true;
  let playbackAudioDurationMs = 0;
  let audioEl: HTMLAudioElement | null = null;
  let playbackStageTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Voting phase ────────────────────────────────────────────────

  let votingTimeLeft = 0;
  let votingEndTime = 0;
  let votingTimer: ReturnType<typeof setInterval> | null = null;
  let votesIn = 0;
  let totalVoters = 0;
  let votingEntries: { playerId: string; playerName: string; gifUrl: string; gifLabel: string }[] = [];

  // ── Results ─────────────────────────────────────────────────────

  let results: {
    winner: string | null;
    scores: Record<string, number>;
    category: string;
    entries: { playerId: string; playerName: string; gifUrl: string; gifLabel: string; voteCount: number }[];
  } | null = null;

  let roundSkipped = false;
  let skipReason = "";

  // ── Timer helpers ───────────────────────────────────────────────

  function clearAllTimers() {
    if (categoryTimer) { clearInterval(categoryTimer); categoryTimer = null; }
    if (selectionTimer) { clearInterval(selectionTimer); selectionTimer = null; }
    if (recordingTimer) { clearInterval(recordingTimer); recordingTimer = null; }
    if (votingTimer) { clearInterval(votingTimer); votingTimer = null; }
    if (playbackStageTimer) { clearTimeout(playbackStageTimer); playbackStageTimer = null; }
  }

  // ── Audio playback ──────────────────────────────────────────────

  function playAudio(base64: string) {
    stopAudio();
    const dataUrl = `data:audio/webm;base64,${base64}`;
    audioEl = new Audio(dataUrl);
    audioEl.play().catch(() => {
      // Autoplay might be blocked
    });
  }

  function stopAudio() {
    if (audioEl) {
      audioEl.pause();
      audioEl.src = "";
      audioEl = null;
    }
  }

  // ── Message handlers ────────────────────────────────────────────

  function onCategorySelectionStart(data: {
    chooserId: string;
    chooserName: string;
    categories: CategoryInfo[];
    durationMs: number;
    serverTimestamp: number;
  }) {
    subPhase = "category_selection";
    categories = data.categories;
    categoryChooserName = data.chooserName;
    chosenCategory = null;

    categoryEndTime = data.serverTimestamp + data.durationMs;
    categoryTimeLeft = Math.max(0, (categoryEndTime - Date.now()) / 1000);

    categoryTimer = setInterval(() => {
      categoryTimeLeft = Math.max(0, (categoryEndTime - Date.now()) / 1000);
    }, 100);
  }

  function onCategoryChosen(data: { category: CategoryInfo; chooserName: string }) {
    subPhase = "category_reveal";
    chosenCategory = data.category;
    categoryChooserName = data.chooserName;
    if (categoryTimer) { clearInterval(categoryTimer); categoryTimer = null; }
  }

  function onGifSelectionStart(data: {
    gifs: { url: string; label: string }[];
    category: CategoryInfo;
    durationMs: number;
    serverTimestamp: number;
  }) {
    subPhase = "gif_selection";
    gifCategoryInfo = data.category;
    selectionEndTime = data.serverTimestamp + data.durationMs;
    selectionTimeLeft = Math.max(0, (selectionEndTime - Date.now()) / 1000);
    selectionsSubmitted = 0;
    selectionsTotal = [...state.players.values()].filter((p) => p.isConnected).length;

    selectionTimer = setInterval(() => {
      selectionTimeLeft = Math.max(0, (selectionEndTime - Date.now()) / 1000);
    }, 100);
  }

  function onGifSelectionUpdate(data: { submitted: number; total: number }) {
    selectionsSubmitted = data.submitted;
    selectionsTotal = data.total;
  }

  function onRecordingTurn(data: {
    playerId: string;
    playerName: string;
    durationMs: number;
    serverTimestamp: number;
    maxClipDurationMs: number;
    mode: "randomized" | "record_own";
  }) {
    subPhase = "recording";
    clearAllTimers();

    recorderName = data.playerName;
    recorderSubmitted = false;
    recordingMode = data.mode;
    maxClipDurationMs = data.maxClipDurationMs;

    recordingEndTime = data.serverTimestamp + data.durationMs;
    recordingTimeLeft = Math.max(0, (recordingEndTime - Date.now()) / 1000);

    recordingTimer = setInterval(() => {
      recordingTimeLeft = Math.max(0, (recordingEndTime - Date.now()) / 1000);
    }, 100);
  }

  function onRecordingPrepare(data: {
    playerId: string;
    playerName: string;
    durationMs: number;
    serverTimestamp: number;
  }) {
    clearAllTimers();
    subPhase = "recording_prepare";
    recorderName = data.playerName;
    recorderSubmitted = false;
    recordingEndTime = data.serverTimestamp + data.durationMs;
    recordingTimeLeft = Math.max(0, (recordingEndTime - Date.now()) / 1000);

    recordingTimer = setInterval(() => {
      recordingTimeLeft = Math.max(0, (recordingEndTime - Date.now()) / 1000);
    }, 100);
  }

  function onRecordingSubmitted(_data: { playerId: string }) {
    recorderSubmitted = true;
  }

  function onPlaybackEntry(data: {
    playerId: string;
    playerName: string;
    gifUrl: string;
    gifLabel: string;
    audioBase64: string;
    audioDurationMs: number;
    introDurationMs: number;
    postDurationMs: number;
  }) {
    subPhase = "playback";
    playbackName = data.playerName;
    playbackGifUrl = data.gifUrl;
    playbackGifLabel = data.gifLabel;
    playbackIntroOnly = true;
    playbackAudioDurationMs = data.audioDurationMs;

    if (playbackStageTimer) clearTimeout(playbackStageTimer);
    playbackStageTimer = setTimeout(() => {
      playbackIntroOnly = false;
      playAudio(data.audioBase64);
    }, data.introDurationMs);
  }

  function onPlaybackDone() {
    subPhase = "playback_done";
    stopAudio();
    playbackName = "";
    playbackGifUrl = "";
  }

  function onVotingStart(data: {
    durationMs: number;
    serverTimestamp: number;
    totalVoters: number;
    entries: { playerId: string; playerName: string; gifUrl: string; gifLabel: string }[];
  }) {
    subPhase = "voting";
    clearAllTimers();

    votingEntries = data.entries;
    votingEndTime = data.serverTimestamp + data.durationMs;
    votingTimeLeft = Math.max(0, (votingEndTime - Date.now()) / 1000);
    votesIn = 0;
    totalVoters = data.totalVoters;

    votingTimer = setInterval(() => {
      votingTimeLeft = Math.max(0, (votingEndTime - Date.now()) / 1000);
    }, 100);
  }

  function onVoteCountUpdate(data: { votesIn: number; totalVoters: number }) {
    votesIn = data.votesIn;
    totalVoters = data.totalVoters;
  }

  function onRoundResult(data: typeof results) {
    subPhase = "results";
    results = data;
    clearAllTimers();
    stopAudio();
  }

  function onRoundSkipped(data: { reason: string }) {
    roundSkipped = true;
    skipReason = data.reason;
  }

  // ── Lifecycle ───────────────────────────────────────────────────

  onMount(() => {
    room.onMessage("category_selection_start", onCategorySelectionStart);
    room.onMessage("category_chosen", onCategoryChosen);
    room.onMessage("gif_selection_start", onGifSelectionStart);
    room.onMessage("gif_selection_update", onGifSelectionUpdate);
    room.onMessage("recording_prepare", onRecordingPrepare);
    room.onMessage("recording_turn", onRecordingTurn);
    room.onMessage("recording_submitted", onRecordingSubmitted);
    room.onMessage("playback_entry", onPlaybackEntry);
    room.onMessage("playback_done", onPlaybackDone);
    room.onMessage("voting_start", onVotingStart);
    room.onMessage("vote_count_update", onVoteCountUpdate);
    room.onMessage("round_result", onRoundResult);
    room.onMessage("round_skipped", onRoundSkipped);
  });

  onDestroy(() => {
    clearAllTimers();
    stopAudio();
  });

  $: sortedPlayers = [...state.players.values()].sort((a, b) => b.score - a.score);
  $: sortedResults = results?.entries
    ? [...results.entries].sort((a, b) => b.voteCount - a.voteCount)
    : [];

  let activeMusicTrack: "two_finger_johnny" | null = null;

  $: {
    const nextMusicTrack = !roundSkipped && subPhase === "gif_selection"
      ? "two_finger_johnny"
      : null;
    if (nextMusicTrack !== activeMusicTrack) {
      activeMusicTrack = nextMusicTrack;
      dispatch("musictrackchange", { trackId: nextMusicTrack });
    }
  }
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-8 p-10" data-testid="audio-overlay-tv">

  <!-- Round header -->
  <p class="text-sm text-gray-400 uppercase tracking-widest">
    Audio Overlay
  </p>

  {#if roundSkipped}
    <div class="text-center space-y-4">
      <h1 class="text-3xl font-black text-yellow-400">Round Skipped</h1>
      <p class="text-xl text-gray-300">{skipReason}</p>
    </div>

  {:else if subPhase === "waiting"}
    <div class="text-center space-y-4">
      <h1 class="text-4xl font-black text-purple-400">Audio Overlay</h1>
      <p class="text-xl text-gray-300">Getting ready...</p>
    </div>

  {:else if subPhase === "category_selection"}
    <!-- Category Selection — TV shows who is choosing + available categories -->
    <div class="text-center space-y-8 w-full max-w-4xl">
      <h1 class="text-4xl font-black text-purple-400">Choose a Category!</h1>
      <p class="text-2xl text-gray-300">
        <span class="font-bold text-white">{categoryChooserName}</span> is picking the theme...
      </p>
      <p class="text-6xl font-mono font-black text-white">
        {Math.ceil(categoryTimeLeft)}
      </p>

      <!-- Available categories grid -->
      <div class="grid grid-cols-4 gap-4 max-w-3xl mx-auto">
        {#each categories as cat}
          <div class="bg-gray-800 rounded-2xl p-5 text-center space-y-2 border-2 border-gray-700 transition-all hover:border-purple-500">
            <span class="text-4xl block">{CATEGORY_ICONS[cat.icon] ?? '?'}</span>
            <p class="font-bold text-white text-lg">{cat.name}</p>
            <p class="text-xs text-gray-400">{cat.description}</p>
          </div>
        {/each}
      </div>
    </div>

  {:else if subPhase === "category_reveal"}
    <!-- Category Reveal — big animated display of chosen category -->
    <div class="text-center space-y-6">
      <p class="text-xl text-gray-400">
        {categoryChooserName} chose...
      </p>
      {#if chosenCategory}
        <div class="animate-bounce">
          <span class="text-[120px] block">{CATEGORY_ICONS[chosenCategory.icon] ?? '?'}</span>
        </div>
        <h1 class="text-6xl font-black text-purple-400">{chosenCategory.name}</h1>
        <p class="text-xl text-gray-300">{chosenCategory.description}</p>
      {/if}
    </div>

  {:else if subPhase === "gif_selection"}
    <!-- GIF Selection — TV shows progress -->
    <div class="text-center space-y-8">
      <h1 class="text-4xl font-black text-purple-400">Pick Your GIFs!</h1>
      {#if gifCategoryInfo}
        <p class="text-lg text-purple-300">
          {CATEGORY_ICONS[gifCategoryInfo.icon] ?? ''} {gifCategoryInfo.name}
        </p>
      {/if}
      <p class="text-7xl font-mono font-black text-white">
        {Math.ceil(selectionTimeLeft)}
      </p>
      <p class="text-xl text-gray-300">Players are browsing the GIF pool on their phones...</p>

      <!-- Player status -->
      <div class="flex gap-4 justify-center flex-wrap">
        {#each [...state.players.values()] as p}
          <div class="px-5 py-3 bg-gray-800 rounded-xl text-center min-w-[120px]">
            <p class="font-semibold text-white">{p.name}</p>
            <p class="text-xs mt-1 {p.isReady ? 'text-green-400' : 'text-yellow-400 animate-pulse'}">
              {p.isReady ? 'Picked!' : 'Browsing...'}
            </p>
          </div>
        {/each}
      </div>

      <!-- Progress -->
      <div class="w-full max-w-md mx-auto">
        <div class="flex justify-between text-sm text-gray-400 mb-1">
          <span>Selections</span>
          <span>{selectionsSubmitted} / {selectionsTotal}</span>
        </div>
        <div class="h-4 bg-gray-700 rounded-full overflow-hidden">
          <div
            class="h-full bg-purple-500 rounded-full transition-all"
            style="width:{selectionsTotal > 0 ? (selectionsSubmitted / selectionsTotal) * 100 : 0}%"
          ></div>
        </div>
      </div>
    </div>

  {:else if subPhase === "recording"}
    <!-- Recording — show who's recording (no GIF — that's revealed during playback) -->
    <div class="text-center space-y-6 w-full max-w-3xl">
      <h1 class="text-3xl font-black text-red-400 animate-pulse">Recording Live!</h1>

      <div class="rounded-2xl bg-gray-800 shadow-2xl p-10 space-y-6">
        <p class="text-sm text-gray-400 uppercase tracking-widest">Now dubbing...</p>
        <p class="text-5xl font-black text-white">{recorderName}</p>
        <p class="text-lg text-gray-400">
          Recording their audio {recordingMode === 'record_own' ? 'for their own GIF' : 'for a shuffled GIF'}...
        </p>

        <!-- Recording indicator -->
        <div class="flex items-center justify-center gap-2">
          <div class="px-4 py-2 bg-red-600 rounded-full flex items-center gap-2">
            <div class="w-3 h-3 rounded-full bg-white animate-pulse"></div>
            <span class="text-white text-sm font-bold">
              {recorderSubmitted ? 'DONE' : 'REC'}
            </span>
          </div>
        </div>

        <p class="text-sm text-gray-500">Each take can be up to {Math.ceil(maxClipDurationMs / 1000)} seconds.</p>
      </div>

      <!-- Timer -->
      <p class="text-5xl font-mono font-black {recordingTimeLeft < 10 ? 'text-red-400' : 'text-white'}">
        {Math.ceil(recordingTimeLeft)}
      </p>

      <!-- Audio waveform indicator -->
      {#if !recorderSubmitted}
        <div class="flex items-end gap-1 h-10 justify-center">
          {#each Array(16) as _, i}
            <div
              class="w-2 bg-red-500/60 rounded-full animate-pulse"
              style="height:{15 + Math.random() * 85}%;animation-delay:{i * 0.06}s;animation-duration:{0.3 + Math.random() * 0.5}s"
            ></div>
          {/each}
        </div>
      {:else}
        <p class="text-green-400 font-bold text-lg">Recording submitted! Moving on...</p>
      {/if}
    </div>

  {:else if subPhase === "recording_prepare"}
    <div class="text-center space-y-6 w-full max-w-3xl">
      <p class="text-sm uppercase tracking-[0.35em] text-yellow-400">Get Ready</p>
      <h1 class="text-5xl font-black text-white">{recorderName}</h1>
      <p class="text-xl text-gray-300">is up next to record</p>
      <p class="text-7xl font-mono font-black text-white">{Math.ceil(recordingTimeLeft)}</p>
      <p class="text-gray-500">They can hold to record and retry as many times as they want in their 60 second turn.</p>
    </div>

  {:else if subPhase === "playback"}
    <!-- Playback: show GIF + play audio -->
    <div class="w-full max-w-3xl text-center space-y-4">
      <p class="text-sm text-gray-400 uppercase tracking-widest">Presenting...</p>
      <h2 class="text-4xl font-black text-white">{playbackName}</h2>
      <p class="text-gray-400">
        {playbackIntroOnly ? 'Intro: watch the GIF first' : `Audio playing now (${(playbackAudioDurationMs / 1000).toFixed(1)}s)`}
      </p>

      <div class="relative rounded-2xl overflow-hidden bg-gray-800 shadow-2xl">
        {#if playbackGifUrl}
          <img
            src={playbackGifUrl}
            alt={playbackGifLabel}
            class="w-full max-h-[450px] object-contain"
          />
        {/if}

        {#if !playbackIntroOnly}
          <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
            <div class="flex items-end gap-1 h-8 justify-center">
              {#each Array(20) as _, i}
                <div
                  class="w-1.5 bg-purple-400/70 rounded-full animate-pulse"
                  style="height:{10 + Math.random() * 90}%;animation-delay:{i * 0.05}s;animation-duration:{0.3 + Math.random() * 0.4}s"
                ></div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>

  {:else if subPhase === "playback_done"}
    <div class="text-center space-y-4">
      <h1 class="text-3xl font-bold text-purple-400">All Entries Played!</h1>
      <p class="text-xl text-gray-300">Time to vote...</p>
    </div>

  {:else if subPhase === "voting"}
    <!-- Voting in progress -->
    <div class="text-center space-y-6 w-full max-w-2xl">
      <h1 class="text-3xl font-bold text-purple-400">Vote Now!</h1>
      <p class="text-6xl font-mono font-black {votingTimeLeft < 5 ? 'text-red-400' : 'text-white'}">
        {Math.ceil(votingTimeLeft)}
      </p>
      <p class="text-xl text-gray-300">Who had the best audio overlay?</p>

      <!-- Contestants -->
      <div class="flex gap-4 justify-center flex-wrap">
        {#each votingEntries as entry}
          <div class="w-52 bg-gray-800 rounded-xl overflow-hidden text-center">
            <img src={entry.gifUrl} alt={entry.gifLabel} class="w-full h-28 object-cover" />
            <div class="px-4 py-3">
              <p class="font-bold text-white text-lg">{entry.playerName}</p>
              <p class="text-xs text-gray-400 truncate mt-1">{entry.gifLabel}</p>
            </div>
          </div>
        {/each}
      </div>

      <!-- Vote progress bar -->
      <div class="w-full max-w-md mx-auto">
        <div class="flex justify-between text-sm text-gray-400 mb-1">
          <span>Votes in</span>
          <span>{votesIn} / {totalVoters}</span>
        </div>
        <div class="h-4 bg-gray-700 rounded-full overflow-hidden">
          <div
            class="h-full bg-purple-500 rounded-full transition-all"
            style="width:{totalVoters > 0 ? (votesIn / totalVoters) * 100 : 0}%"
          ></div>
        </div>
      </div>
    </div>

  {:else if subPhase === "results"}
    <!-- Results -->
    <div class="w-full max-w-2xl space-y-6">
      <h1 class="text-3xl font-bold text-center text-purple-400">Results</h1>

      {#if results}
        <!-- Winner -->
        {#if results.winner}
          {@const winnerEntry = results.entries.find((e) => e.playerId === results?.winner)}
          <div class="text-center space-y-4">
            <div class="bg-yellow-900/40 border-2 border-yellow-500 rounded-2xl p-6 shadow-lg">
              <p class="text-sm text-yellow-400 uppercase tracking-widest mb-2">Best Audio Overlay</p>
              <p class="text-4xl font-black text-yellow-200">{winnerEntry?.playerName ?? "???"}</p>
              <p class="text-lg text-yellow-400 mt-1">{winnerEntry?.voteCount ?? 0} votes</p>
            </div>
            <!-- Show winner's GIF -->
            {#if winnerEntry?.gifUrl}
              <img
                src={winnerEntry.gifUrl}
                alt={winnerEntry.gifLabel}
                class="w-64 h-40 object-cover rounded-xl mx-auto border-2 border-yellow-500"
              />
            {/if}
          </div>
        {/if}

        <!-- All entries ranked -->
        <div class="bg-gray-800 rounded-xl p-4">
          <p class="text-xs text-gray-400 uppercase tracking-widest mb-3 text-center">Scores</p>
          <div class="space-y-2">
            {#each sortedResults as entry, i}
              {@const score = results.scores[entry.playerId] ?? 0}
              {@const isWinner = entry.playerId === results.winner}
              {@const resultPlayer = state.players.get(entry.playerId)}
              <div class="flex items-center gap-3">
                <span class="w-6 text-center text-gray-500 font-mono text-sm">{i + 1}.</span>
                {#if resultPlayer}
                  <PlayerIcon player={resultPlayer} size={28} />
                {:else}
                  <div class="w-7 h-7 rounded-full bg-gray-700"></div>
                {/if}
                <span class="w-28 truncate font-semibold text-white">
                  {entry.playerName}
                  {#if isWinner}
                    <span class="text-yellow-400 text-xs ml-1">★</span>
                  {/if}
                </span>
                <div class="flex-1 h-6 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all {isWinner ? 'bg-yellow-500' : score > 0 ? 'bg-purple-500' : 'bg-gray-600'}"
                    style="width:{score > 0 ? Math.min(100, (score / 200) * 100) : 0}%"
                  ></div>
                </div>
                <span class="w-10 text-right text-xs text-gray-400">{entry.voteCount}v</span>
                <span class="w-16 text-right font-mono {score > 0 ? 'text-green-400' : 'text-gray-500'}">
                  +{score}
                </span>
              </div>
            {/each}
          </div>
        </div>

        <!-- Overall standings -->
        <div class="bg-gray-800 rounded-xl p-4">
          <p class="text-xs text-gray-400 uppercase tracking-widest mb-3 text-center">Overall Standings</p>
          <div class="space-y-1">
            {#each sortedPlayers as p, i}
              <div class="flex items-center gap-3">
                <span class="w-6 text-center text-gray-500 font-mono text-sm">{i + 1}.</span>
                <PlayerIcon player={p} size={24} />
                <span class="flex-1 truncate font-semibold text-white">{p.name}</span>
                <span class="font-mono text-lg font-bold text-white">{p.score}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>
