<script lang="ts">
  /**
   * TV game component for "Evil Laugh Overlay" (registry-26).
   *
   * Displays the shared-screen view:
   *   - Recording countdown while players record
   *   - Gallery: plays each entry's audio over a CSS-animated villain scene
   *   - Vote progress
   *   - Round results with vote counts + scores
   *
   * Server messages listened:
   *   start_recording, gallery_entry, gallery_done,
   *   voting_start, vote_count_update, round_result, round_skipped
   */
  import { onMount, onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState } from "../../../../shared/types";

  export let room: Room;
  export let state: RoomState;

  // ── Sub-phase state ──────────────────────────────────────────────

  type SubPhase = "waiting" | "recording" | "gallery" | "gallery_done" | "voting" | "results";
  let subPhase: SubPhase = "waiting";

  // ── Recording phase ──────────────────────────────────────────────

  let recordingTimeLeft = 0;
  let recordingEndTime = 0;
  let recordingTimer: ReturnType<typeof setInterval> | null = null;

  // ── Gallery phase ────────────────────────────────────────────────

  let currentEntryName = "";
  let currentEntryScene = "";
  let currentAudioSrc = "";
  let galleryIndex = 0;
  let galleryTotal = 0;
  let audioEl: HTMLAudioElement | null = null;

  // ── Voting phase ─────────────────────────────────────────────────

  let votingTimeLeft = 0;
  let votingEndTime = 0;
  let votingTimer: ReturnType<typeof setInterval> | null = null;
  let votesIn = 0;
  let totalVoters = 0;
  let votingEntries: { playerId: string; playerName: string }[] = [];

  // ── Results ──────────────────────────────────────────────────────

  let results: {
    winner: string | null;
    scores: Record<string, number>;
    entries: { playerId: string; playerName: string; sceneId: string; voteCount: number }[];
  } | null = null;

  // Round skipped
  let roundSkipped = false;
  let skipReason = "";

  // ── Scene config ─────────────────────────────────────────────────

  const SCENE_CONFIG: Record<string, { bg: string; accent: string; label: string }> = {
    "thunderstorm":    { bg: "from-gray-900 via-blue-900 to-gray-800",    accent: "text-blue-300",   label: "Thunderstorm" },
    "volcano-lair":    { bg: "from-red-950 via-orange-900 to-red-900",    accent: "text-orange-300", label: "Volcano Lair" },
    "haunted-castle":  { bg: "from-gray-900 via-purple-950 to-gray-900",  accent: "text-purple-300", label: "Haunted Castle" },
    "evil-laboratory": { bg: "from-green-950 via-emerald-900 to-gray-900",accent: "text-emerald-300",label: "Evil Laboratory" },
    "dark-throne":     { bg: "from-gray-950 via-yellow-950 to-gray-900",  accent: "text-yellow-300", label: "Dark Throne" },
    "sinister-forest": { bg: "from-green-950 via-gray-900 to-emerald-950",accent: "text-green-300",  label: "Sinister Forest" },
    "underwater-base": { bg: "from-blue-950 via-cyan-900 to-blue-900",    accent: "text-cyan-300",   label: "Underwater Base" },
    "space-station":   { bg: "from-gray-950 via-indigo-950 to-gray-900",  accent: "text-indigo-300", label: "Space Station" },
  };

  // ── Timer helpers ────────────────────────────────────────────────

  function clearAllTimers() {
    if (recordingTimer) { clearInterval(recordingTimer); recordingTimer = null; }
    if (votingTimer) { clearInterval(votingTimer); votingTimer = null; }
  }

  // ── Audio playback ───────────────────────────────────────────────

  function playAudio(base64: string) {
    stopAudio();
    // Reconstruct data URL from raw base64
    const dataUrl = `data:audio/webm;base64,${base64}`;
    audioEl = new Audio(dataUrl);
    audioEl.play().catch(() => {
      // Autoplay might be blocked — that's ok, visual scene still displays
    });
  }

  function stopAudio() {
    if (audioEl) {
      audioEl.pause();
      audioEl.src = "";
      audioEl = null;
    }
  }

  // ── Message handlers ─────────────────────────────────────────────

  function onStartRecording(data: { durationMs: number; serverTimestamp: number }) {
    subPhase = "recording";
    recordingEndTime = data.serverTimestamp + data.durationMs;
    recordingTimeLeft = Math.max(0, (recordingEndTime - Date.now()) / 1000);

    recordingTimer = setInterval(() => {
      recordingTimeLeft = Math.max(0, (recordingEndTime - Date.now()) / 1000);
    }, 100);
  }

  function onGalleryEntry(data: {
    playerId: string;
    playerName: string;
    sceneId: string;
    audioBase64: string;
  }) {
    subPhase = "gallery";
    galleryIndex++;
    currentEntryName = data.playerName;
    currentEntryScene = data.sceneId;
    currentAudioSrc = data.audioBase64;

    // Play the audio
    playAudio(data.audioBase64);
  }

  function onGalleryDone() {
    subPhase = "gallery_done";
    stopAudio();
    currentEntryName = "";
    currentEntryScene = "";
  }

  function onVotingStart(data: {
    durationMs: number;
    serverTimestamp: number;
    entries: { playerId: string; playerName: string }[];
  }) {
    subPhase = "voting";
    clearAllTimers();

    votingEntries = data.entries;
    votingEndTime = data.serverTimestamp + data.durationMs;
    votingTimeLeft = Math.max(0, (votingEndTime - Date.now()) / 1000);
    votesIn = 0;
    totalVoters = data.entries.length;
    galleryTotal = data.entries.length;

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

  // ── Lifecycle ────────────────────────────────────────────────────

  onMount(() => {
    room.onMessage("start_recording", onStartRecording);
    room.onMessage("gallery_entry", onGalleryEntry);
    room.onMessage("gallery_done", onGalleryDone);
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
  $: sceneInfo = SCENE_CONFIG[currentEntryScene] ?? SCENE_CONFIG["thunderstorm"];
  $: sortedResults = results?.entries
    ? [...results.entries].sort((a, b) => b.voteCount - a.voteCount)
    : [];
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-8 p-10" data-testid="evil-laugh-tv">

  <!-- Round header -->
  <p class="text-sm text-gray-400 uppercase tracking-widest">
    Evil Laugh Overlay — Round {state.currentRound} of {state.gameConfig.roundCount}
  </p>

  {#if roundSkipped}
    <div class="text-center space-y-4">
      <h1 class="text-3xl font-black text-yellow-400">Round Skipped</h1>
      <p class="text-xl text-gray-300">{skipReason}</p>
    </div>

  {:else if subPhase === "waiting"}
    <div class="text-center space-y-4">
      <h1 class="text-4xl font-black text-purple-400">Evil Laugh Overlay</h1>
      <p class="text-xl text-gray-300">Getting ready...</p>
    </div>

  {:else if subPhase === "recording"}
    <!-- Recording phase — TV shows countdown + encouragement -->
    <div class="text-center space-y-8">
      <h1 class="text-4xl font-black text-red-400 animate-pulse">Recording in Progress!</h1>
      <p class="text-7xl font-mono font-black text-white">
        {Math.ceil(recordingTimeLeft)}
      </p>
      <p class="text-xl text-gray-300">Players are recording their best evil laughs...</p>

      <!-- Player status -->
      <div class="flex gap-4 justify-center flex-wrap">
        {#each [...state.players.values()] as p}
          <div class="px-4 py-3 bg-gray-800 rounded-xl text-center min-w-[110px]">
            <p class="font-semibold text-white">{p.name}</p>
            <p class="text-xs mt-1 {p.isReady ? 'text-green-400' : 'text-red-400 animate-pulse'}">
              {p.isReady ? 'Submitted' : 'Recording...'}
            </p>
          </div>
        {/each}
      </div>

      <!-- Animated mic icon -->
      <div class="flex justify-center">
        <div class="w-24 h-24 rounded-full bg-red-600/30 border-4 border-red-500 flex items-center justify-center animate-pulse">
          <span class="text-5xl">🎤</span>
        </div>
      </div>
    </div>

  {:else if subPhase === "gallery"}
    <!-- Gallery: show villain scene + play audio -->
    <div class="w-full max-w-3xl">
      <!-- Scene backdrop -->
      <div class="relative rounded-2xl overflow-hidden bg-gradient-to-br {sceneInfo.bg} p-12 min-h-[400px] flex flex-col items-center justify-center gap-6 shadow-2xl">
        <!-- Scene name badge -->
        <div class="absolute top-4 right-4 px-3 py-1 bg-black/40 rounded-lg">
          <p class="text-xs {sceneInfo.accent} font-bold uppercase tracking-widest">{sceneInfo.label}</p>
        </div>

        <!-- Animated atmospheric elements per scene -->
        {#if currentEntryScene === "thunderstorm"}
          <div class="absolute inset-0 opacity-20">
            <div class="absolute top-0 left-1/4 w-px h-full bg-blue-300 animate-pulse"></div>
            <div class="absolute top-0 left-3/4 w-px h-3/4 bg-blue-200 animate-pulse" style="animation-delay:0.5s"></div>
          </div>
        {:else if currentEntryScene === "volcano-lair"}
          <div class="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-orange-600/30 to-transparent animate-pulse"></div>
        {:else if currentEntryScene === "haunted-castle"}
          <div class="absolute inset-0 bg-gradient-to-b from-purple-900/20 via-transparent to-purple-900/30"></div>
        {:else if currentEntryScene === "evil-laboratory"}
          <div class="absolute bottom-0 left-0 right-0 h-1/4 bg-gradient-to-t from-green-500/20 to-transparent animate-pulse" style="animation-duration:2s"></div>
        {:else if currentEntryScene === "dark-throne"}
          <div class="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(234,179,8,0.1),transparent_70%)]"></div>
        {:else if currentEntryScene === "sinister-forest"}
          <div class="absolute inset-0 bg-gradient-to-b from-transparent via-green-900/10 to-green-900/30"></div>
        {:else if currentEntryScene === "underwater-base"}
          <div class="absolute inset-0 opacity-20">
            <div class="absolute top-1/4 left-1/3 w-3 h-3 rounded-full bg-cyan-300 animate-bounce" style="animation-duration:3s"></div>
            <div class="absolute top-1/2 left-2/3 w-2 h-2 rounded-full bg-cyan-200 animate-bounce" style="animation-duration:2.5s;animation-delay:0.5s"></div>
            <div class="absolute top-3/4 left-1/2 w-4 h-4 rounded-full bg-cyan-300 animate-bounce" style="animation-duration:3.5s;animation-delay:1s"></div>
          </div>
        {:else if currentEntryScene === "space-station"}
          <div class="absolute inset-0">
            <div class="absolute top-[10%] left-[20%] w-1 h-1 rounded-full bg-white animate-pulse"></div>
            <div class="absolute top-[30%] left-[70%] w-1 h-1 rounded-full bg-white animate-pulse" style="animation-delay:0.3s"></div>
            <div class="absolute top-[60%] left-[40%] w-1.5 h-1.5 rounded-full bg-white animate-pulse" style="animation-delay:0.7s"></div>
            <div class="absolute top-[80%] left-[80%] w-1 h-1 rounded-full bg-white animate-pulse" style="animation-delay:1s"></div>
          </div>
        {/if}

        <!-- Player name -->
        <p class="text-sm text-gray-400 uppercase tracking-widest z-10">Presenting...</p>
        <h2 class="text-5xl font-black text-white z-10 drop-shadow-lg">{currentEntryName}</h2>

        <!-- Audio waveform indicator -->
        <div class="flex items-end gap-1 h-12 z-10">
          {#each Array(12) as _, i}
            <div
              class="w-2 bg-white/60 rounded-full animate-pulse"
              style="height:{20 + Math.random() * 80}%;animation-delay:{i * 0.08}s;animation-duration:{0.4 + Math.random() * 0.4}s"
            ></div>
          {/each}
        </div>
      </div>
    </div>

  {:else if subPhase === "gallery_done"}
    <div class="text-center space-y-4">
      <h1 class="text-3xl font-bold text-purple-400">Gallery Complete!</h1>
      <p class="text-xl text-gray-300">Time to vote...</p>
    </div>

  {:else if subPhase === "voting"}
    <!-- Voting in progress -->
    <div class="text-center space-y-6 w-full max-w-2xl">
      <h1 class="text-3xl font-bold text-purple-400">Vote Now!</h1>
      <p class="text-6xl font-mono font-black {votingTimeLeft < 5 ? 'text-red-400' : 'text-white'}">
        {Math.ceil(votingTimeLeft)}
      </p>
      <p class="text-xl text-gray-300">Who had the best evil laugh?</p>

      <!-- Contestants -->
      <div class="flex gap-4 justify-center flex-wrap">
        {#each votingEntries as entry}
          <div class="px-6 py-3 bg-gray-800 rounded-xl text-center min-w-[120px]">
            <p class="font-bold text-white text-lg">{entry.playerName}</p>
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
          <div class="text-center bg-yellow-900/40 border-2 border-yellow-500 rounded-2xl p-6 shadow-lg">
            <p class="text-sm text-yellow-400 uppercase tracking-widest mb-2">Most Evil Laugh</p>
            <p class="text-4xl font-black text-yellow-200">{winnerEntry?.playerName ?? "???"}</p>
            <p class="text-lg text-yellow-400 mt-1">{winnerEntry?.voteCount ?? 0} votes</p>
          </div>
        {/if}

        <!-- All entries ranked -->
        <div class="bg-gray-800 rounded-xl p-4">
          <p class="text-xs text-gray-400 uppercase tracking-widest mb-3 text-center">Round Scores</p>
          <div class="space-y-2">
            {#each sortedResults as entry, i}
              {@const score = results.scores[entry.playerId] ?? 0}
              {@const isWinner = entry.playerId === results.winner}
              <div class="flex items-center gap-3">
                <span class="w-6 text-center text-gray-500 font-mono text-sm">{i + 1}.</span>
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
