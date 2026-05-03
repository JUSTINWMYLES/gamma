<script lang="ts">
  /**
   * TV game component for "Hot Potato" (registry-07).
   *
   * Displays the shared-screen view:
   *   - Which phone is the potato + pass count
   *   - Explosion animation
   *   - Voting status + results
   *
   * Server messages listened:
   *   potato_round_start, potato_accepted,
   *   potato_exploded, potato_vote_start, potato_vote_update,
   *   potato_result, round_skipped
   */
  import { onMount, onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState } from "../../../../shared/types";
  import { getRoundProgressLabel } from "../../../../shared/types";
  import PlayerIcon from "../../components/PlayerIcon.svelte";

  export let room: Room;
  export let state: RoomState;

  // ── Sub-phase state ──────────────────────────────────────────────

  type SubPhase =
    | "waiting"
    | "active"        // Potato is being passed around
    | "exploded"      // Explosion
    | "voting"        // Vote phase
    | "results";      // Round results

  let subPhase: SubPhase = "waiting";

  // ── Active phase state ──────────────────────────────────────────

  let potatoDeviceName = "";
  let passCount = 0;
  let lastAcceptorName = "";
  // ── Explosion state ─────────────────────────────────────────────

  let explodedHolderName = "";
  let explodedTargetName = "";
  let explodedPassCount = 0;

  // ── Voting state ────────────────────────────────────────────────

  let voteHolderName = "";
  let voteTargetName = "";
  let votingTimeLeft = 0;
  let votingEndTime = 0;
  let votingTimer: ReturnType<typeof setInterval> | null = null;
  let votesIn = 0;
  let totalVoters = 0;

  // ── Results state ───────────────────────────────────────────────

  let resultLoserName = "";
  let resultLoserId = "";
  let resultLoserPenalty = 0;
  let resultScores: Record<string, number> = {};
  let resultPassCount = 0;
  let resultPassLeaderName: string | null = null;
  let resultPassLeaderCount = 0;
  let resultHolderVotes = 0;
  let resultTargetVotes = 0;

  // ── Round skipped ───────────────────────────────────────────────

  let roundSkipped = false;
  let skipReason = "";

  // ── Helpers ─────────────────────────────────────────────────────

  function clearAllTimers() {
    if (votingTimer) { clearInterval(votingTimer); votingTimer = null; }
  }

  // ── Message handlers ────────────────────────────────────────────

  function onPotatoRoundStart(data: {
    potatoDeviceId: string;
    potatoDeviceName: string;
    timerDurationMs: number;
  }) {
    subPhase = "active";
    roundSkipped = false;
    potatoDeviceName = data.potatoDeviceName;
    passCount = 0;
    lastAcceptorName = "";
  }

  function onPotatoAccepted(data: {
    acceptorName: string;
    passNumber: number;
  }) {
    lastAcceptorName = data.acceptorName;
    passCount = data.passNumber;
  }

  function onPotatoExploded(data: {
    holderId: string;
    holderName: string;
    targetId: string;
    targetName: string;
    passCount: number;
  }) {
    subPhase = "exploded";
    clearAllTimers();
    explodedHolderName = data.holderName;
    explodedTargetName = data.targetName;
    explodedPassCount = data.passCount;
  }

  function onPotatoVoteStart(data: {
    holderId: string;
    holderName: string;
    targetId: string;
    targetName: string;
    durationMs: number;
    serverTimestamp: number;
  }) {
    subPhase = "voting";
    voteHolderName = data.holderName;
    voteTargetName = data.targetName;
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
    loserId: string;
    loserName: string;
    loserPenalty: number;
    scores: Record<string, number>;
    passCount: number;
    passLeaderName: string | null;
    passLeaderCount: number;
    holderVotes: number;
    targetVotes: number;
  }) {
    subPhase = "results";
    clearAllTimers();
    resultLoserId = data.loserId;
    resultLoserName = data.loserName;
    resultLoserPenalty = data.loserPenalty;
    resultScores = data.scores;
    resultPassCount = data.passCount;
    resultPassLeaderName = data.passLeaderName;
    resultPassLeaderCount = data.passLeaderCount;
    resultHolderVotes = data.holderVotes;
    resultTargetVotes = data.targetVotes;
  }

  function onRoundSkipped(data: { reason: string }) {
    roundSkipped = true;
    skipReason = data.reason;
  }

  // ── Lifecycle ───────────────────────────────────────────────────

  onMount(() => {
    room.onMessage("potato_round_start", onPotatoRoundStart);
    room.onMessage("potato_accepted", onPotatoAccepted);
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
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-8 p-10" data-testid="hot-potato-tv">

  <!-- Round header -->
  <p class="text-sm text-gray-400 uppercase tracking-widest">
    Hot Potato — {getRoundProgressLabel(state)}
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
      <p class="text-xl text-gray-300">Pass the phone before it blows!</p>
    </div>

  {:else if subPhase === "active"}
    <!-- Potato is being passed around -->
    <div class="w-full max-w-3xl space-y-8">
      <!-- Potato visual -->
      <div class="text-center">
        <div class="relative mx-auto w-40 h-40">
          <div class="absolute inset-0 bg-red-600/20 rounded-full animate-pulse"></div>
          <div class="relative w-40 h-40 bg-gradient-to-br from-orange-500 to-red-600 rounded-full flex items-center justify-center border-4 border-orange-400 shadow-lg shadow-red-500/50">
            <span class="text-7xl">🥔</span>
          </div>
        </div>
      </div>

      <!-- Info -->
      <div class="text-center space-y-3">
        <p class="text-xl text-gray-400">
          <span class="font-bold text-orange-400">{potatoDeviceName}</span>'s phone is the potato
        </p>

        {#if lastAcceptorName}
          <p class="text-lg text-gray-400">
            Last accepted by <span class="font-bold text-white">{lastAcceptorName}</span>
          </p>
        {/if}

        <p class="text-6xl font-mono font-black text-white">
          {passCount}
        </p>
        <p class="text-sm text-gray-500 uppercase tracking-widest">
          pass{passCount !== 1 ? "es" : ""}
        </p>
      </div>
    </div>

  {:else if subPhase === "exploded"}
    <!-- Explosion -->
    <div class="w-full max-w-2xl space-y-6 text-center">
      <div class="text-9xl animate-bounce">💥</div>
      <h1 class="text-5xl font-black text-red-400">BOOM!</h1>
      <p class="text-xl text-gray-300">
        After <span class="font-bold text-orange-400">{explodedPassCount}</span> passes!
      </p>
      <div class="flex items-center justify-center gap-8 mt-4">
        <div class="text-center space-y-2">
          <div class="w-24 h-24 bg-red-900 border-2 border-red-600 rounded-full flex items-center justify-center mx-auto">
            <span class="text-4xl">🥔</span>
          </div>
          <p class="text-xl font-bold text-white">{explodedHolderName}</p>
          <p class="text-sm text-red-400">Was holding it</p>
        </div>
        <div class="text-3xl text-gray-600">→</div>
        <div class="text-center space-y-2">
          <div class="w-24 h-24 bg-yellow-900 border-2 border-yellow-600 rounded-full flex items-center justify-center mx-auto">
            <span class="text-4xl">👤</span>
          </div>
          <p class="text-xl font-bold text-white">{explodedTargetName}</p>
          <p class="text-sm text-yellow-400">Was next to receive</p>
        </div>
      </div>
      <p class="text-lg text-gray-500 mt-4">Players are voting on their phones...</p>
    </div>

  {:else if subPhase === "voting"}
    <!-- Voting phase -->
    <div class="w-full max-w-2xl space-y-6 text-center">
      <h1 class="text-3xl font-black text-orange-400">Who Should Lose Points?</h1>
      <p class="text-lg text-gray-400">Players are voting on their phones</p>

      <!-- The two suspects -->
      <div class="flex items-center justify-center gap-12 mt-4">
        <div class="text-center space-y-3">
          <div class="w-28 h-28 bg-red-900 border-2 border-red-600 rounded-full flex items-center justify-center mx-auto">
            <span class="text-5xl">🥔</span>
          </div>
          <p class="text-2xl font-black text-white">{voteHolderName}</p>
          <p class="text-sm text-red-400 font-bold">HOLDER</p>
        </div>

        <div class="text-center space-y-2">
          <p class="text-2xl font-black text-gray-600">VS</p>
        </div>

        <div class="text-center space-y-3">
          <div class="w-28 h-28 bg-yellow-900 border-2 border-yellow-600 rounded-full flex items-center justify-center mx-auto">
            <span class="text-5xl">👤</span>
          </div>
          <p class="text-2xl font-black text-white">{voteTargetName}</p>
          <p class="text-sm text-yellow-400 font-bold">RECEIVER</p>
        </div>
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

      <!-- Voted loser -->
      <div class="text-center bg-red-900/30 border-2 border-red-600 rounded-2xl p-6 shadow-lg">
        <p class="text-sm text-red-400 uppercase tracking-widest mb-2">Voted Out</p>
        <p class="text-4xl font-black text-red-200">{resultLoserName}</p>
        <p class="text-red-400 font-bold text-xl mt-2">-{resultLoserPenalty}</p>
        <p class="text-sm text-gray-400 mt-2">
          {resultHolderVotes} voted holder · {resultTargetVotes} voted receiver
        </p>
      </div>

      <!-- Round stats -->
      <div class="flex items-center justify-center gap-6">
        <div class="bg-gray-800 rounded-xl p-4 text-center">
          <p class="text-3xl font-black text-orange-400">{resultPassCount}</p>
          <p class="text-xs text-gray-500 uppercase tracking-widest mt-1">Passes</p>
        </div>
        {#if resultPassLeaderName}
          <div class="bg-gray-800 rounded-xl p-4 text-center">
            <p class="text-lg font-black text-orange-200">{resultPassLeaderName}</p>
            <p class="text-xs text-gray-500 uppercase tracking-widest mt-1">Most Passes (+25)</p>
          </div>
        {/if}
      </div>

      <!-- Standings -->
      <div class="bg-gray-800 rounded-xl p-4">
        <p class="text-xs text-gray-400 uppercase tracking-widest mb-3 text-center">Standings</p>
        <div class="space-y-1">
          {#each sortedPlayers as p, i}
            <div class="flex items-center gap-3">
              <span class="w-6 text-center text-gray-500 font-mono text-sm">{i + 1}.</span>
              <PlayerIcon player={p} size={24} />
              <span class="flex-1 truncate font-semibold text-white
                {p.id === resultLoserId ? 'text-red-400' : ''}">
                {p.name}
                {#if p.id === resultLoserId}
                  <span class="text-red-400 text-xs ml-1">💥</span>
                {/if}
              </span>
              <span class="text-sm font-mono {(resultScores[p.id] ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}">
                {(resultScores[p.id] ?? 0) >= 0 ? "+" : ""}{resultScores[p.id] ?? 0}
              </span>
              <span class="font-mono text-lg font-bold text-white">{p.score}</span>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>
