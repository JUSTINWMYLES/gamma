<script lang="ts">
  /**
   * TV game component for "Sound Replication" (registry-06).
   *
   * Displays: target sound playback, turn-by-turn recording progress,
   * scoring animation, and per-player result reveals with waveform visualization.
   *
   * Server messages listened:
   *   sound_target_play, sound_turn_start, sound_recording_countdown,
   *   sound_recording_active, sound_turn_complete, sound_player_submitted,
   *   sound_player_retry, sound_scoring,
   *   sound_result_reveal, sound_round_leaderboard, round_skipped
   */
  import { onMount, onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState } from "../../../../shared/types";

  export let room: Room;
  export let state: RoomState;

  // ── Sub-phase ────────────────────────────────────────────────────

  type SubPhase =
    | "waiting"
    | "target_playback"
    | "turn_recording"
    | "turn_countdown"
    | "turn_active"
    | "turn_complete"
    | "scoring"
    | "result_reveal"
    | "leaderboard";

  let subPhase: SubPhase = "waiting";

  // ── Target playback ──────────────────────────────────────────────

  let turnOrder: { id: string; name: string }[] = [];
  let currentRound = 0;
  let targetAudio: HTMLAudioElement | null = null;

  // ── Turn tracking ────────────────────────────────────────────────

  let currentTurnPlayerId = "";
  let currentTurnPlayerName = "";
  let currentTurnIndex = 0;
  let totalTurns = 0;
  let recordingDurationMs = 0;
  let recordingTimeLeft = 0;
  let recordingEndTime = 0;
  let recordingTimer: ReturnType<typeof setInterval> | null = null;
  let playerSubmitted = false;

  // ── Completed turns ──────────────────────────────────────────────

  let completedPlayerIds: Set<string> = new Set();

  // ── Results ──────────────────────────────────────────────────────

  let revealPlayerName = "";
  let revealScore = 0;
  let revealPoints = 0;
  let revealRank = 0;
  let revealTotal = 0;
  let revealIsLast = false;

  let leaderboard: { playerId: string; playerName: string; similarityScore: number; points: number; rank: number }[] = [];

  let roundSkipped = false;
  let skipReason = "";

  // ── Waveform visualization (fake but fun) ────────────────────────

  let waveformBars: number[] = [];
  let waveformInterval: ReturnType<typeof setInterval> | null = null;

  function startWaveform() {
    stopWaveform();
    waveformBars = Array(24).fill(0).map(() => Math.random());
    waveformInterval = setInterval(() => {
      waveformBars = waveformBars.map(() => 0.1 + Math.random() * 0.9);
    }, 120);
  }

  function stopWaveform() {
    if (waveformInterval) {
      clearInterval(waveformInterval);
      waveformInterval = null;
    }
    waveformBars = Array(24).fill(0.1);
  }

  // ── Timer ────────────────────────────────────────────────────────

  function clearAllTimers() {
    if (recordingTimer) { clearInterval(recordingTimer); recordingTimer = null; }
    stopWaveform();
  }

  // ── Audio ────────────────────────────────────────────────────────

  function playTargetSound() {
    stopTargetSound();
    // whoosh.flac served from /audio/ directory
    targetAudio = new Audio("/audio/whoosh.flac");
    targetAudio.play().catch(() => {
      // Autoplay might be blocked
    });
  }

  function stopTargetSound() {
    if (targetAudio) {
      targetAudio.pause();
      targetAudio.src = "";
      targetAudio = null;
    }
  }

  // ── Message handlers ─────────────────────────────────────────────

  function onTargetPlay(data: {
    round: number;
    targetId: string;
    durationMs: number;
    turnOrder: { id: string; name: string }[];
  }) {
    subPhase = "target_playback";
    currentRound = data.round;
    turnOrder = data.turnOrder;
    totalTurns = data.turnOrder.length;
    completedPlayerIds = new Set();

    playTargetSound();
    startWaveform();

    // Stop waveform when target finishes
    setTimeout(() => {
      stopWaveform();
    }, data.durationMs);
  }

  function onTurnStart(data: {
    playerId: string;
    playerName: string;
    turnIndex: number;
    totalTurns: number;
  }) {
    subPhase = "turn_recording";
    currentTurnPlayerId = data.playerId;
    currentTurnPlayerName = data.playerName;
    currentTurnIndex = data.turnIndex;
    totalTurns = data.totalTurns;
    playerSubmitted = false;
  }

  function onRecordingCountdown(data: { playerId: string; playerName: string }) {
    subPhase = "turn_countdown";
  }

  function onRecordingActive(data: {
    playerId: string;
    playerName: string;
    durationMs: number;
  }) {
    subPhase = "turn_active";
    recordingDurationMs = data.durationMs;
    recordingEndTime = Date.now() + data.durationMs;
    recordingTimeLeft = data.durationMs / 1000;

    recordingTimer = setInterval(() => {
      recordingTimeLeft = Math.max(0, (recordingEndTime - Date.now()) / 1000);
    }, 100);

    startWaveform();
  }

  function onPlayerSubmitted(data: { playerId: string; playerName: string }) {
    if (data.playerId === currentTurnPlayerId) {
      playerSubmitted = true;
      stopWaveform();
    }
  }

  function onPlayerRetry(data: { playerId: string; playerName: string; retriesUsed: number }) {
    playerSubmitted = false;
    startWaveform();
  }

  function onTurnComplete(data: {
    playerId: string;
    playerName: string;
    turnIndex: number;
  }) {
    subPhase = "turn_complete";
    completedPlayerIds.add(data.playerId);
    completedPlayerIds = completedPlayerIds; // trigger reactivity
    clearAllTimers();
  }

  function onScoring(_data: { message: string }) {
    subPhase = "scoring";
  }

  function onResultReveal(data: {
    playerId: string;
    playerName: string;
    similarityScore: number;
    points: number;
    rank: number;
    totalPlayers: number;
    revealIndex: number;
    isLast: boolean;
  }) {
    subPhase = "result_reveal";
    revealPlayerName = data.playerName;
    revealScore = data.similarityScore;
    revealPoints = data.points;
    revealRank = data.rank;
    revealTotal = data.totalPlayers;
    revealIsLast = data.isLast;
  }

  function onLeaderboard(data: {
    round: number;
    results: { playerId: string; playerName: string; similarityScore: number; points: number; rank: number }[];
  }) {
    subPhase = "leaderboard";
    leaderboard = data.results;
  }

  function onRoundSkipped(data: { reason: string }) {
    roundSkipped = true;
    skipReason = data.reason;
  }

  // ── Lifecycle ────────────────────────────────────────────────────

  onMount(() => {
    room.onMessage("sound_target_play", onTargetPlay);
    room.onMessage("sound_turn_start", onTurnStart);
    room.onMessage("sound_recording_countdown", onRecordingCountdown);
    room.onMessage("sound_recording_active", onRecordingActive);
    room.onMessage("sound_player_submitted", onPlayerSubmitted);
    room.onMessage("sound_player_retry", onPlayerRetry);
    room.onMessage("sound_turn_complete", onTurnComplete);
    room.onMessage("sound_scoring", onScoring);
    room.onMessage("sound_result_reveal", onResultReveal);
    room.onMessage("sound_round_leaderboard", onLeaderboard);
    room.onMessage("round_skipped", onRoundSkipped);
  });

  onDestroy(() => {
    clearAllTimers();
    stopTargetSound();
  });

  $: sortedPlayers = [...state.players.values()].sort((a, b) => b.score - a.score);
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-8 p-10" data-testid="sound-replication-tv">

  <p class="text-sm text-gray-400 uppercase tracking-widest">
    Sound Replication &mdash; Round {state.currentRound}
  </p>

  {#if roundSkipped}
    <div class="text-center space-y-4">
      <h1 class="text-3xl font-black text-yellow-400">Round Skipped</h1>
      <p class="text-xl text-gray-300">{skipReason}</p>
    </div>

  {:else if subPhase === "waiting"}
    <div class="text-center space-y-6">
      <h1 class="text-5xl font-black text-purple-400">Sound Replication</h1>
      <p class="text-2xl text-gray-300">Listen. Record. Match.</p>
    </div>

  {:else if subPhase === "target_playback"}
    <!-- Target sound playing -->
    <div class="text-center space-y-6 w-full max-w-3xl">
      <h1 class="text-4xl font-black text-purple-400">Listen to the Target!</h1>

      <!-- Waveform visualization -->
      <div class="flex items-end gap-1 h-32 justify-center bg-gray-800 rounded-2xl p-4">
        {#each waveformBars as bar, i}
          <div
            class="w-3 bg-purple-500 rounded-full transition-all duration-100"
            style="height:{bar * 100}%"
          ></div>
        {/each}
      </div>

      <p class="text-xl text-gray-300">Playing target sound...</p>

      <!-- Turn order -->
      <div>
        <p class="text-xs text-gray-500 uppercase tracking-widest mb-3">Turn Order</p>
        <div class="flex gap-3 justify-center flex-wrap">
          {#each turnOrder as t, i}
            <div class="px-4 py-2 bg-gray-800 rounded-lg text-center min-w-[100px]">
              <p class="text-xs text-gray-500">{i + 1}</p>
              <p class="font-semibold text-white">{t.name}</p>
            </div>
          {/each}
        </div>
      </div>
    </div>

  {:else if subPhase === "turn_recording" || subPhase === "turn_countdown"}
    <!-- Turn announce / countdown -->
    <div class="text-center space-y-8 w-full max-w-3xl">
      <p class="text-sm text-gray-500 uppercase tracking-widest">
        Turn {currentTurnIndex + 1} of {totalTurns}
      </p>
      <h1 class="text-5xl font-black text-white">{currentTurnPlayerName}</h1>
      <p class="text-2xl text-gray-300">
        {subPhase === "turn_countdown" ? "3...2...1..." : "Get Ready!"}
      </p>

      <!-- Player roster with status -->
      <div class="flex gap-3 justify-center flex-wrap">
        {#each turnOrder as t, i}
          <div class="px-4 py-2 rounded-lg text-center min-w-[100px]
            {t.id === currentTurnPlayerId ? 'bg-purple-600 border-2 border-purple-400' :
             completedPlayerIds.has(t.id) ? 'bg-green-900 border border-green-600' :
             'bg-gray-800'}">
            <p class="font-semibold {t.id === currentTurnPlayerId ? 'text-white' : completedPlayerIds.has(t.id) ? 'text-green-400' : 'text-gray-400'}">
              {t.name}
            </p>
            <p class="text-xs {completedPlayerIds.has(t.id) ? 'text-green-500' : t.id === currentTurnPlayerId ? 'text-purple-200' : 'text-gray-600'}">
              {completedPlayerIds.has(t.id) ? 'Done' : t.id === currentTurnPlayerId ? 'Up Now' : 'Waiting'}
            </p>
          </div>
        {/each}
      </div>
    </div>

  {:else if subPhase === "turn_active"}
    <!-- Active recording -->
    <div class="text-center space-y-6 w-full max-w-3xl">
      <h1 class="text-3xl font-black text-red-400 animate-pulse">Recording Live!</h1>

      <div class="rounded-2xl bg-gray-800 shadow-2xl p-8 space-y-6">
        <p class="text-sm text-gray-400 uppercase tracking-widest">Recording</p>
        <p class="text-5xl font-black text-white">{currentTurnPlayerName}</p>

        <!-- Waveform -->
        <div class="flex items-end gap-1 h-24 justify-center">
          {#each waveformBars as bar, i}
            <div
              class="w-2 bg-red-500/70 rounded-full transition-all duration-100"
              style="height:{bar * 100}%"
            ></div>
          {/each}
        </div>

        <!-- Recording indicator -->
        <div class="flex items-center justify-center gap-2">
          <div class="px-4 py-2 bg-red-600 rounded-full flex items-center gap-2">
            <div class="w-3 h-3 rounded-full bg-white animate-pulse"></div>
            <span class="text-white text-sm font-bold">
              {playerSubmitted ? 'DONE' : 'REC'}
            </span>
          </div>
        </div>
      </div>

      <!-- Timer -->
      <p class="text-5xl font-mono font-black {recordingTimeLeft < 2 ? 'text-red-400' : 'text-white'}">
        {Math.ceil(recordingTimeLeft)}
      </p>

      {#if playerSubmitted}
        <p class="text-green-400 font-bold text-lg">Recording submitted!</p>
      {/if}
    </div>

  {:else if subPhase === "turn_complete"}
    <div class="text-center space-y-4">
      <h1 class="text-3xl font-bold text-green-400">Turn Complete!</h1>
      <p class="text-xl text-gray-300">
        {completedPlayerIds.size} of {totalTurns} players recorded
      </p>
    </div>

  {:else if subPhase === "scoring"}
    <div class="text-center space-y-6">
      <h1 class="text-4xl font-black text-purple-400">Analyzing...</h1>
      <div class="flex items-end gap-2 h-20 justify-center">
        {#each Array(16) as _, i}
          <div
            class="w-3 bg-purple-500/50 rounded-full animate-pulse"
            style="height:{30 + Math.random() * 70}%;animation-delay:{i * 0.07}s;animation-duration:{0.5 + Math.random() * 0.5}s"
          ></div>
        {/each}
      </div>
      <p class="text-xl text-gray-300">Comparing recordings to the target sound...</p>
    </div>

  {:else if subPhase === "result_reveal"}
    <!-- Per-player result reveal -->
    <div class="text-center space-y-6 w-full max-w-3xl">
      <p class="text-sm text-gray-500 uppercase tracking-widest">
        {revealIsLast ? 'Best Match!' : `Rank ${revealRank} of ${revealTotal}`}
      </p>

      <h1 class="text-4xl font-black text-white">{revealPlayerName}</h1>

      <!-- Score visualization -->
      <div class="w-full max-w-md mx-auto space-y-4">
        <!-- Score bar -->
        <div class="relative h-16 bg-gray-800 rounded-2xl overflow-hidden">
          <div
            class="absolute left-0 top-0 bottom-0 rounded-2xl transition-all duration-1000
              {revealScore >= 70 ? 'bg-gradient-to-r from-green-600 to-green-400' :
               revealScore >= 40 ? 'bg-gradient-to-r from-yellow-600 to-yellow-400' :
               'bg-gradient-to-r from-red-600 to-red-400'}"
            style="width:{revealScore}%"
          ></div>
          <div class="absolute inset-0 flex items-center justify-center">
            <span class="text-4xl font-black text-white drop-shadow-lg">{revealScore}%</span>
          </div>
        </div>

        <p class="text-xl font-bold {revealScore >= 70 ? 'text-green-400' : revealScore >= 40 ? 'text-yellow-400' : 'text-red-400'}">
          {revealScore >= 80 ? 'Amazing match!' :
           revealScore >= 60 ? 'Pretty close!' :
           revealScore >= 40 ? 'Not bad!' :
           'Nice try!'}
        </p>

        <p class="text-2xl text-white font-mono">+{revealPoints} points</p>
      </div>
    </div>

  {:else if subPhase === "leaderboard"}
    <!-- Round leaderboard -->
    <div class="w-full max-w-2xl space-y-6">
      <h1 class="text-3xl font-bold text-center text-purple-400">Round Results</h1>

      <div class="space-y-2">
        {#each leaderboard as entry, i}
          <div class="flex items-center gap-3 bg-gray-800 rounded-xl px-5 py-3">
            <span class="w-8 text-center text-2xl font-black
              {i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-amber-600' : 'text-gray-500'}">
              {entry.rank}
            </span>
            <span class="flex-1 text-xl font-bold text-white">{entry.playerName}</span>

            <!-- Score bar mini -->
            <div class="w-32 h-6 bg-gray-700 rounded-full overflow-hidden">
              <div
                class="h-full rounded-full
                  {entry.similarityScore >= 70 ? 'bg-green-500' : entry.similarityScore >= 40 ? 'bg-yellow-500' : 'bg-red-500'}"
                style="width:{entry.similarityScore}%"
              ></div>
            </div>

            <span class="w-14 text-right font-mono
              {entry.similarityScore >= 70 ? 'text-green-400' : entry.similarityScore >= 40 ? 'text-yellow-400' : 'text-red-400'}">
              {entry.similarityScore}%
            </span>
            <span class="w-20 text-right font-mono text-white">+{entry.points}</span>
          </div>
        {/each}
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
    </div>
  {/if}
</div>
