<script lang="ts">
  /**
   * TV game component for "Odd One Out" (registry-20).
   *
   * Displays the shared-screen view: sub-phase info, observation timer with
   * live vote progress, final voting countdown, and round results with scores.
   *
   * Server messages listened:
   *   phase_info, voting_open, window_start, window_pause,
   *   voting_final, vote_count_update, round_result, round_skipped
   */
  import { onMount, onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState } from "../../../../shared/types";

  export let room: Room;
  export let state: RoomState;

  // ── Local state ────────────────────────────────────────────────────

  type SubPhase = "waiting" | "prompts" | "observing" | "paused" | "voting_final" | "results";
  let subPhase: SubPhase = "waiting";

  // Observation windows
  let currentWindow = 0;
  let totalWindows = 0;
  let windowTimeLeft = 0;
  let windowEndTime = 0;
  let windowTimer: ReturnType<typeof setInterval> | null = null;
  let oddPrompt = "";  // Shown to everyone during observation

  // Pause
  let pauseTimeLeft = 0;
  let pauseEndTime = 0;
  let pauseTimer: ReturnType<typeof setInterval> | null = null;

  // Voting (open during observation)
  let votingOpen = false;
  let votesIn = 0;
  let totalVoters = 0;

  // Final voting timer
  let votingTimeLeft = 0;
  let votingEndTime = 0;
  let votingTimer: ReturnType<typeof setInterval> | null = null;

  // Results
  let results: {
    oddPlayerIds: string[];
    votes: Record<string, string>;
    scores: Record<string, number>;
    promptPair: { normal: string; odd: string };
  } | null = null;

  // Round skipped
  let roundSkipped = false;
  let skipReason = "";

  // ── Message handlers ──────────────────────────────────────────────

  function onPhaseInfo(data: { subPhase: string }) {
    if (data.subPhase === "prompt_acknowledge") {
      subPhase = "prompts";
    }
  }

  function onVotingOpen(data: {
    serverTimestamp: number;
    playerIds: { id: string; name: string }[];
    voterCount: number;
  }) {
    votingOpen = true;
    votesIn = 0;
    totalVoters = data.voterCount;
  }

  function onWindowStart(data: { windowNumber: number; totalWindows: number; durationMs: number; serverTimestamp: number; oddPrompt: string }) {
    subPhase = "observing";
    currentWindow = data.windowNumber;
    totalWindows = data.totalWindows;
    oddPrompt = data.oddPrompt;

    windowEndTime = data.serverTimestamp + data.durationMs;
    windowTimeLeft = Math.max(0, (windowEndTime - Date.now()) / 1000);

    clearTimer("window");
    windowTimer = setInterval(() => {
      windowTimeLeft = Math.max(0, (windowEndTime - Date.now()) / 1000);
    }, 100);
  }

  function onWindowPause(data: { nextWindowIn: number; serverTimestamp: number }) {
    subPhase = "paused";
    clearTimer("window");

    pauseEndTime = data.serverTimestamp + data.nextWindowIn;
    pauseTimeLeft = Math.max(0, (pauseEndTime - Date.now()) / 1000);

    clearTimer("pause");
    pauseTimer = setInterval(() => {
      pauseTimeLeft = Math.max(0, (pauseEndTime - Date.now()) / 1000);
    }, 100);
  }

  function onVotingFinal(data: { durationMs: number; serverTimestamp: number; playerIds: { id: string; name: string }[] }) {
    subPhase = "voting_final";
    clearTimer("window");
    clearTimer("pause");

    votingEndTime = data.serverTimestamp + data.durationMs;
    votingTimeLeft = Math.max(0, (votingEndTime - Date.now()) / 1000);

    clearTimer("voting");
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
    votingOpen = false;
    clearTimer("window");
    clearTimer("pause");
    clearTimer("voting");
  }

  function onRoundSkipped(data: { reason: string }) {
    roundSkipped = true;
    skipReason = data.reason;
  }

  // ── Helpers ────────────────────────────────────────────────────────

  function clearTimer(which: "window" | "pause" | "voting") {
    if (which === "window" && windowTimer) { clearInterval(windowTimer); windowTimer = null; }
    if (which === "pause" && pauseTimer) { clearInterval(pauseTimer); pauseTimer = null; }
    if (which === "voting" && votingTimer) { clearInterval(votingTimer); votingTimer = null; }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────

  onMount(() => {
    room.onMessage("phase_info", onPhaseInfo);
    room.onMessage("voting_open", onVotingOpen);
    room.onMessage("window_start", onWindowStart);
    room.onMessage("window_pause", onWindowPause);
    room.onMessage("voting_final", onVotingFinal);
    room.onMessage("vote_count_update", onVoteCountUpdate);
    room.onMessage("round_result", onRoundResult);
    room.onMessage("round_skipped", onRoundSkipped);
  });

  onDestroy(() => {
    clearTimer("window");
    clearTimer("pause");
    clearTimer("voting");
  });

  $: sortedPlayers = [...state.players.values()].sort((a, b) => b.score - a.score);
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-8 p-10" data-testid="odd-one-out-tv">

  <!-- Round header -->
  <p class="text-sm text-gray-400 uppercase tracking-widest">
    Odd One Out — Round {state.currentRound} of {state.gameConfig.roundCount}
  </p>

  {#if roundSkipped}
    <!-- Round was skipped (e.g. not enough players) -->
    <div class="text-center space-y-4">
      <h1 class="text-3xl font-black text-yellow-400">Round Skipped</h1>
      <p class="text-xl text-gray-300">{skipReason}</p>
    </div>

  {:else if subPhase === "waiting" || subPhase === "prompts"}
    <!-- Prompts being distributed -->
    <div class="text-center space-y-4">
      <h1 class="text-4xl font-black text-indigo-400">Check your phones!</h1>
      <p class="text-xl text-gray-300">Each player is receiving their role...</p>
      <div class="flex gap-3 justify-center flex-wrap mt-4">
        {#each [...state.players.values()] as p}
          <div class="px-4 py-2 bg-gray-800 rounded-lg text-center min-w-[100px]">
            <p class="font-semibold text-white">{p.name}</p>
            <p class="text-xs {p.isReady ? 'text-green-400' : 'text-gray-500'}">
              {p.isReady ? 'Ready' : 'Reading...'}
            </p>
          </div>
        {/each}
      </div>
    </div>

  {:else if subPhase === "observing"}
    <!-- Observation window -->
    <div class="text-center space-y-6">
      <h1 class="text-3xl font-bold text-white">Observe!</h1>
      <p class="text-gray-400">Window {currentWindow} of {totalWindows}</p>
      <p class="text-8xl font-mono font-black text-white" data-testid="tv-window-timer">
        {Math.ceil(windowTimeLeft)}
      </p>
      {#if oddPrompt}
        <div class="bg-indigo-900/50 border border-indigo-600 rounded-xl p-4 max-w-md mx-auto">
          <p class="text-xs text-indigo-400 uppercase tracking-widest mb-2">The Odd One Out's Action</p>
          <p class="text-xl text-indigo-200 font-semibold">{oddPrompt}</p>
        </div>
      {/if}
      <p class="text-lg text-gray-300">Watch each other carefully... vote on your phones when ready!</p>

      <!-- Live vote progress during observation -->
      {#if votingOpen && totalVoters > 0}
        <div class="w-full max-w-md mx-auto">
          <div class="flex justify-between text-sm text-gray-400 mb-1">
            <span>Votes in</span>
            <span>{votesIn} / {totalVoters}</span>
          </div>
          <div class="h-4 bg-gray-700 rounded-full overflow-hidden">
            <div
              class="h-full bg-indigo-500 rounded-full transition-all"
              style="width:{totalVoters > 0 ? (votesIn / totalVoters) * 100 : 0}%"
            ></div>
          </div>
        </div>
      {/if}
    </div>

  {:else if subPhase === "paused"}
    <!-- Between windows -->
    <div class="text-center space-y-4">
      <p class="text-2xl text-gray-300">Next window in...</p>
      <p class="text-6xl font-mono font-black text-indigo-400">
        {Math.ceil(pauseTimeLeft)}
      </p>

      <!-- Vote progress during pause -->
      {#if votingOpen && totalVoters > 0}
        <div class="w-full max-w-md mx-auto">
          <div class="flex justify-between text-sm text-gray-400 mb-1">
            <span>Votes in</span>
            <span>{votesIn} / {totalVoters}</span>
          </div>
          <div class="h-4 bg-gray-700 rounded-full overflow-hidden">
            <div
              class="h-full bg-indigo-500 rounded-full transition-all"
              style="width:{totalVoters > 0 ? (votesIn / totalVoters) * 100 : 0}%"
            ></div>
          </div>
        </div>
      {/if}
    </div>

  {:else if subPhase === "voting_final"}
    <!-- Final voting window (last chance) -->
    <div class="text-center space-y-6">
      <h1 class="text-3xl font-bold text-indigo-400">Last Chance to Vote!</h1>
      <p class="text-6xl font-mono font-black {votingTimeLeft < 5 ? 'text-red-400' : 'text-white'}" data-testid="tv-voting-timer">
        {Math.ceil(votingTimeLeft)}
      </p>
      <p class="text-xl text-gray-300">Who is the odd one out?</p>

      <!-- Vote progress bar -->
      <div class="w-full max-w-md mx-auto">
        <div class="flex justify-between text-sm text-gray-400 mb-1">
          <span>Votes in</span>
          <span>{votesIn} / {totalVoters}</span>
        </div>
        <div class="h-4 bg-gray-700 rounded-full overflow-hidden">
          <div
            class="h-full bg-indigo-500 rounded-full transition-all"
            style="width:{totalVoters > 0 ? (votesIn / totalVoters) * 100 : 0}%"
          ></div>
        </div>
      </div>
    </div>

  {:else if subPhase === "results"}
    <!-- Results -->
    <div class="w-full max-w-2xl space-y-6">
      <h1 class="text-3xl font-bold text-center text-indigo-400">Results</h1>

      {#if results}
        <!-- Who was odd -->
        <div class="text-center">
          <p class="text-sm text-gray-400 uppercase tracking-widest mb-3">The odd one(s) out:</p>
          <div class="flex gap-3 justify-center flex-wrap">
            {#each results.oddPlayerIds as oddId}
              {@const oddPlayer = state.players.get(oddId)}
              <span class="px-5 py-2 bg-indigo-900 border-2 border-indigo-500 rounded-xl text-xl font-black text-white">
                {oddPlayer?.name ?? oddId}
              </span>
            {/each}
          </div>
        </div>

        <!-- Prompts revealed -->
        <div class="grid grid-cols-2 gap-4 max-w-lg mx-auto">
          <div class="bg-gray-800 rounded-xl p-4 text-center">
            <p class="text-xs text-gray-400 uppercase tracking-widest mb-2">Normal players</p>
            <p class="text-white font-medium">(no action — just observe)</p>
          </div>
          <div class="bg-indigo-900 rounded-xl p-4 text-center border border-indigo-600">
            <p class="text-xs text-indigo-400 uppercase tracking-widest mb-2">Odd action</p>
            <p class="text-white font-medium">{results.promptPair.odd}</p>
          </div>
        </div>

        <!-- Scores this round -->
        <div class="bg-gray-800 rounded-xl p-4">
          <p class="text-xs text-gray-400 uppercase tracking-widest mb-3 text-center">Round Scores</p>
          <div class="space-y-2">
            {#each sortedPlayers as p}
              {@const roundScore = results.scores[p.id] ?? 0}
              {@const isOdd = results.oddPlayerIds.includes(p.id)}
              <div class="flex items-center gap-3">
                <span class="w-28 truncate font-semibold text-white">
                  {p.name}
                  {#if isOdd}
                    <span class="text-indigo-400 text-xs ml-1">(odd)</span>
                  {/if}
                </span>
                <div class="flex-1 h-6 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all {roundScore > 0 ? 'bg-green-500' : 'bg-gray-600'}"
                    style="width:{roundScore > 0 ? Math.min(100, (roundScore / 150) * 100) : 0}%"
                  ></div>
                </div>
                <span class="w-16 text-right font-mono {roundScore > 0 ? 'text-green-400' : 'text-gray-500'}">
                  +{roundScore}
                </span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>
