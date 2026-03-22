<script lang="ts">
  /**
   * TV game component for "Hot Potato" (registry-07).
   *
   * Displays the shared-screen view:
   *   - Who holds the potato + countdown timer
   *   - Pass chain visualization
   *   - Explosion animation
   *   - Voting + results
   *
   * Server messages listened:
   *   potato_status, potato_accepted, potato_timer, potato_exploded,
   *   potato_vote_start, potato_vote_update, potato_result, round_skipped
   */
  import { onMount, onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState } from "../../../../shared/types";

  export let room: Room;
  export let state: RoomState;

  // ── Sub-phase state ──────────────────────────────────────────────

  type SubPhase =
    | "waiting"
    | "active"     // Potato is being passed around
    | "exploded"   // Explosion
    | "voting"     // Vote phase
    | "results";   // Round results

  let subPhase: SubPhase = "waiting";

  // ── Active phase state ──────────────────────────────────────────

  let holderName = "";
  let holderId = "";
  let targetName = "";
  let timeRemaining = 0;
  let passCount = 0;
  let passHistory: string[] = []; // names of holders in order

  // ── Explosion state ─────────────────────────────────────────────

  let explodedHolderName = "";
  let explodedHolderId = "";
  let suspects: { id: string; name: string }[] = [];

  // ── Voting state ────────────────────────────────────────────────

  let votingEntries: { id: string; name: string }[] = [];
  let votingTimeLeft = 0;
  let votingEndTime = 0;
  let votingTimer: ReturnType<typeof setInterval> | null = null;
  let votesIn = 0;
  let totalVoters = 0;

  // ── Results state ───────────────────────────────────────────────

  let resultHolderName = "";
  let resultHolderId = "";
  let correctVoters: string[] = [];
  let resultScores: Record<string, number> = {};
  let passLeader: { id: string; name: string; count: number } | null = null;

  // ── Round skipped ───────────────────────────────────────────────

  let roundSkipped = false;
  let skipReason = "";

  // ── Helpers ─────────────────────────────────────────────────────

  function clearAllTimers() {
    if (votingTimer) { clearInterval(votingTimer); votingTimer = null; }
  }

  // ── Message handlers ────────────────────────────────────────────

  function onPotatoStatus(data: {
    holderId: string;
    holderName: string;
    targetName: string;
    timeRemaining: number;
    passCount: number;
  }) {
    subPhase = "active";
    holderId = data.holderId;
    holderName = data.holderName;
    targetName = data.targetName;
    timeRemaining = data.timeRemaining;
    passCount = data.passCount;
  }

  function onPotatoAccepted(data: {
    holderName: string;
    targetName: string;
    timeRemaining: number;
  }) {
    holderName = data.holderName;
    targetName = data.targetName;
    timeRemaining = data.timeRemaining;
    passHistory = [...passHistory, data.holderName];
    if (passHistory.length > 8) passHistory = passHistory.slice(-8);
  }

  function onPotatoTimer(data: { timeRemaining: number }) {
    timeRemaining = data.timeRemaining;
  }

  function onPotatoExploded(data: {
    holderId: string;
    holderName: string;
    suspects: { id: string; name: string }[];
  }) {
    subPhase = "exploded";
    clearAllTimers();
    explodedHolderId = data.holderId;
    explodedHolderName = data.holderName;
    suspects = data.suspects;
    timeRemaining = 0;
  }

  function onPotatoVoteStart(data: {
    suspects: { id: string; name: string }[];
    durationMs: number;
    serverTimestamp: number;
  }) {
    subPhase = "voting";
    votingEntries = data.suspects;
    votesIn = 0;
    totalVoters = 0;

    votingEndTime = data.serverTimestamp + data.durationMs;
    votingTimeLeft = Math.max(0, (votingEndTime - Date.now()) / 1000);

    clearAllTimers();
    votingTimer = setInterval(() => {
      votingTimeLeft = Math.max(0, (votingEndTime - Date.now()) / 1000);
    }, 100);
  }

  function onPotatoVoteUpdate(data: { votesIn: number; totalVoters: number }) {
    votesIn = data.votesIn;
    totalVoters = data.totalVoters;
  }

  function onPotatoResult(data: {
    holderId: string;
    holderName: string;
    correctVoters: string[];
    scores: Record<string, number>;
    passLeader: { id: string; name: string; count: number } | null;
  }) {
    subPhase = "results";
    clearAllTimers();
    resultHolderId = data.holderId;
    resultHolderName = data.holderName;
    correctVoters = data.correctVoters;
    resultScores = data.scores;
    passLeader = data.passLeader;
  }

  function onRoundSkipped(data: { reason: string }) {
    roundSkipped = true;
    skipReason = data.reason;
  }

  // ── Lifecycle ───────────────────────────────────────────────────

  onMount(() => {
    room.onMessage("potato_status", onPotatoStatus);
    room.onMessage("potato_accepted", onPotatoAccepted);
    room.onMessage("potato_timer", onPotatoTimer);
    room.onMessage("potato_exploded", onPotatoExploded);
    room.onMessage("potato_vote_start", onPotatoVoteStart);
    room.onMessage("potato_vote_update", onPotatoVoteUpdate);
    room.onMessage("potato_result", onPotatoResult);
    room.onMessage("round_skipped", onRoundSkipped);
  });

  onDestroy(() => {
    clearAllTimers();
  });

  // ── Derived values ──────────────────────────────────────────────

  $: sortedPlayers = [...state.players.values()].sort((a, b) => b.score - a.score);
  $: timerUrgent = timeRemaining < 4;
  $: timerDisplay = Math.max(0, Math.ceil(timeRemaining * 10) / 10).toFixed(1);
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-8 p-10" data-testid="hot-potato-tv">

  <!-- Round header -->
  <p class="text-sm text-gray-400 uppercase tracking-widest">
    Hot Potato — Round {state.currentRound} of {state.gameConfig.roundCount}
  </p>

  {#if roundSkipped}
    <div class="text-center space-y-4">
      <h1 class="text-3xl font-black text-yellow-400">Round Skipped</h1>
      <p class="text-xl text-gray-300">{skipReason}</p>
    </div>

  {:else if subPhase === "waiting"}
    <div class="text-center space-y-4">
      <div class="text-8xl">🥔</div>
      <h1 class="text-4xl font-black text-orange-400">Hot Potato</h1>
      <p class="text-xl text-gray-300">Don't get caught holding it!</p>
    </div>

  {:else if subPhase === "active"}
    <!-- Active passing phase -->
    <div class="w-full max-w-3xl space-y-8">
      <!-- Big timer -->
      <div class="text-center">
        <p class="text-8xl font-mono font-black {timerUrgent ? 'text-red-400 animate-pulse' : 'text-orange-400'}">
          {timerDisplay}
        </p>
      </div>

      <!-- Potato holder display -->
      <div class="flex items-center justify-center gap-8">
        <!-- Holder -->
        <div class="text-center space-y-3">
          <div class="relative mx-auto w-32 h-32">
            <div class="absolute inset-0 bg-red-600/20 rounded-full {timerUrgent ? 'animate-ping' : 'animate-pulse'}"></div>
            <div class="relative w-32 h-32 bg-gradient-to-br from-orange-500 to-red-600 rounded-full flex items-center justify-center border-4 {timerUrgent ? 'border-red-400' : 'border-orange-400'} shadow-lg shadow-red-500/50">
              <span class="text-6xl">🥔</span>
            </div>
          </div>
          <p class="text-2xl font-black text-white">{holderName}</p>
          <p class="text-sm text-red-400 font-bold">HOLDING</p>
        </div>

        <!-- Arrow -->
        <div class="text-4xl text-gray-500 animate-pulse">→</div>

        <!-- Target -->
        <div class="text-center space-y-3">
          <div class="w-32 h-32 bg-gray-800 border-4 border-gray-600 border-dashed rounded-full flex items-center justify-center">
            <span class="text-5xl opacity-50">👤</span>
          </div>
          <p class="text-2xl font-black text-gray-300">{targetName}</p>
          <p class="text-sm text-yellow-400 font-bold">PASS TO</p>
        </div>
      </div>

      <!-- Pass count -->
      <div class="text-center">
        <p class="text-lg text-gray-500">
          {passCount} pass{passCount !== 1 ? "es" : ""} so far
        </p>
      </div>

      <!-- Pass history trail -->
      {#if passHistory.length > 0}
        <div class="flex items-center justify-center gap-2 flex-wrap">
          {#each passHistory as name, i}
            <span class="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded-full">{name}</span>
            {#if i < passHistory.length - 1}
              <span class="text-gray-600">→</span>
            {/if}
          {/each}
        </div>
      {/if}
    </div>

  {:else if subPhase === "exploded"}
    <!-- Explosion! -->
    <div class="w-full max-w-2xl space-y-6 text-center">
      <div class="text-9xl animate-bounce">💥</div>
      <h1 class="text-5xl font-black text-red-400">BOOM!</h1>
      <p class="text-2xl text-gray-300">
        The potato exploded on
        <span class="font-black text-red-400">{explodedHolderName}</span>!
      </p>
      <p class="text-lg text-gray-500">Players are voting on their phones...</p>
    </div>

  {:else if subPhase === "voting"}
    <!-- Voting phase -->
    <div class="w-full max-w-2xl space-y-6 text-center">
      <div>
        <h1 class="text-3xl font-black text-orange-400">Who Had the Potato?</h1>
        <p class="text-lg text-gray-400 mt-2">Players are voting on their phones</p>
      </div>

      <!-- Suspects list -->
      <div class="space-y-3 max-w-lg mx-auto">
        {#each votingEntries as suspect}
          <div class="bg-gray-800 border border-gray-700 rounded-xl px-6 py-4 flex items-center gap-4">
            <div class="w-12 h-12 bg-orange-900 border border-orange-700 rounded-full flex items-center justify-center">
              <span class="text-xl">🥔</span>
            </div>
            <span class="flex-1 text-xl font-semibold text-white text-left">{suspect.name}</span>
          </div>
        {/each}
      </div>

      <!-- Timer -->
      <p class="text-5xl font-mono font-black {votingTimeLeft < 5 ? 'text-red-400 animate-pulse' : 'text-white'}">
        {Math.ceil(votingTimeLeft)}
      </p>

      <!-- Vote progress -->
      {#if totalVoters > 0}
        <div class="w-64 mx-auto">
          <div class="flex justify-between text-sm text-gray-400 mb-1">
            <span>Votes in</span>
            <span>{votesIn} / {totalVoters}</span>
          </div>
          <div class="h-3 bg-gray-700 rounded-full overflow-hidden">
            <div
              class="h-full bg-orange-500 rounded-full transition-all"
              style="width:{(votesIn / totalVoters) * 100}%"
            ></div>
          </div>
        </div>
      {/if}
    </div>

  {:else if subPhase === "results"}
    <!-- Results -->
    <div class="w-full max-w-2xl space-y-6">
      <h1 class="text-3xl font-bold text-center text-orange-400">Round Results</h1>

      <!-- Who was holding it -->
      <div class="text-center bg-red-900/30 border-2 border-red-600 rounded-2xl p-6 shadow-lg">
        <p class="text-sm text-red-400 uppercase tracking-widest mb-2">Caught Holding the Potato</p>
        <p class="text-4xl font-black text-red-200">{resultHolderName}</p>
        <p class="text-sm text-gray-400 mt-2">
          {correctVoters.length} player{correctVoters.length !== 1 ? "s" : ""} guessed correctly
        </p>
      </div>

      {#if passLeader}
        <div class="text-center bg-orange-900/30 border border-orange-600 rounded-xl p-4">
          <p class="text-xs text-orange-400 uppercase tracking-widest mb-1">Most Passes</p>
          <p class="text-xl font-black text-orange-200">{passLeader.name}</p>
          <p class="text-sm text-orange-400">{passLeader.count} passes (+25 bonus)</p>
        </div>
      {/if}

      <!-- Overall standings -->
      <div class="bg-gray-800 rounded-xl p-4">
        <p class="text-xs text-gray-400 uppercase tracking-widest mb-3 text-center">Standings</p>
        <div class="space-y-1">
          {#each sortedPlayers as p, i}
            <div class="flex items-center gap-3">
              <span class="w-6 text-center text-gray-500 font-mono text-sm">{i + 1}.</span>
              <span class="flex-1 truncate font-semibold text-white
                {p.id === resultHolderId ? 'text-red-400' : ''}">
                {p.name}
                {#if p.id === resultHolderId}
                  <span class="text-red-400 text-xs ml-1">💥</span>
                {/if}
              </span>
              <span class="text-sm font-mono {(resultScores[p.id] ?? 0) > 0 ? 'text-green-400' : 'text-gray-500'}">
                +{resultScores[p.id] ?? 0}
              </span>
              <span class="font-mono text-lg font-bold text-white">{p.score}</span>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>
