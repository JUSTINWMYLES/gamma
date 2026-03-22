<script lang="ts">
  /**
   * Phone game component for "Hot Potato" (registry-07).
   *
   * Server messages listened:
   *   potato_assigned, potato_waiting, potato_status, potato_passed,
   *   potato_accepted, potato_timer, potato_exploded, potato_vote_start,
   *   potato_vote_confirmed, potato_vote_update, potato_result, round_skipped
   *
   * Client actions sent:
   *   { action: "potato_pass" }
   *   { action: "potato_accept" }
   *   { action: "potato_vote", targetId }
   */
  import { onMount, onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState, PlayerState } from "../../../../shared/types";

  export let room: Room;
  export let state: RoomState;
  export let me: PlayerState | undefined;

  // ── Sub-phase state ──────────────────────────────────────────────

  type SubPhase =
    | "waiting"
    | "holding"       // I have the potato, must pass
    | "receiving"     // Potato is coming to me, must tap accept
    | "spectating"    // Someone else has the potato
    | "exploded"      // Timer ran out
    | "voting"        // Vote on who was holding
    | "results";      // Round results

  let subPhase: SubPhase = "waiting";

  // ── Potato state ────────────────────────────────────────────────

  let targetName = "";
  let targetId = "";
  let timeRemaining = 0;
  let holderName = "";
  let holderId = "";
  let passCount = 0;
  let hasPassed = false;  // Whether I've tapped "pass" this turn
  let fromName = "";      // Who passed the potato to me

  // Timer display
  let timerInterval: ReturnType<typeof setInterval> | null = null;

  // ── Explosion state ─────────────────────────────────────────────

  let explodedHolderName = "";
  let explodedHolderId = "";
  let suspects: { id: string; name: string }[] = [];

  // ── Voting state ────────────────────────────────────────────────

  let voteSuspects: { id: string; name: string }[] = [];
  let votingTimeLeft = 0;
  let votingEndTime = 0;
  let votingTimer: ReturnType<typeof setInterval> | null = null;
  let myVote: string | null = null;
  let voteConfirmed = false;
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
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    if (votingTimer) { clearInterval(votingTimer); votingTimer = null; }
  }

  // ── Actions ─────────────────────────────────────────────────────

  function passPotato() {
    if (subPhase !== "holding" || hasPassed) return;
    hasPassed = true;
    room.send("game_input", { action: "potato_pass" });
  }

  function acceptPotato() {
    if (subPhase !== "receiving") return;
    room.send("game_input", { action: "potato_accept" });
  }

  function castVote(tid: string) {
    if (myVote || voteConfirmed) return;
    myVote = tid;
    room.send("game_input", { action: "potato_vote", targetId: tid });
  }

  // ── Message handlers ────────────────────────────────────────────

  function onPotatoAssigned(data: {
    targetName: string;
    targetId: string;
    timeRemaining: number;
  }) {
    subPhase = "holding";
    targetName = data.targetName;
    targetId = data.targetId;
    timeRemaining = data.timeRemaining;
    hasPassed = false;
    // Vibrate on assignment
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  }

  function onPotatoWaiting() {
    if (subPhase !== "receiving" && subPhase !== "holding") {
      subPhase = "spectating";
    }
  }

  function onPotatoStatus(data: {
    holderId: string;
    holderName: string;
    targetName: string;
    timeRemaining: number;
    passCount: number;
  }) {
    holderId = data.holderId;
    holderName = data.holderName;
    timeRemaining = data.timeRemaining;
    passCount = data.passCount;

    // Update my sub-phase if I'm the holder
    if (data.holderId === me?.id && subPhase !== "holding") {
      subPhase = "holding";
      targetName = data.targetName;
      hasPassed = false;
    } else if (data.holderId !== me?.id && subPhase === "holding") {
      subPhase = "spectating";
    }
  }

  function onPotatoPassed(data: { fromName: string }) {
    subPhase = "receiving";
    fromName = data.fromName;
    // Vibrate to alert
    if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 100]);
  }

  function onPotatoAccepted(data: {
    holderName: string;
    targetName: string;
    timeRemaining: number;
  }) {
    holderName = data.holderName;
    timeRemaining = data.timeRemaining;

    // If I was the receiver and just accepted, server will send potato_assigned next
    // If someone else accepted, I'm spectating
    if (subPhase === "receiving") {
      // Server should send potato_assigned immediately after
    } else if (subPhase !== "holding") {
      subPhase = "spectating";
    }
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

    // Big vibration for explosion
    if (navigator.vibrate) navigator.vibrate([500, 200, 500]);
  }

  function onPotatoVoteStart(data: {
    suspects: { id: string; name: string }[];
    durationMs: number;
    serverTimestamp: number;
  }) {
    subPhase = "voting";
    voteSuspects = data.suspects.filter((s) => s.id !== me?.id);
    myVote = null;
    voteConfirmed = false;
    votesIn = 0;

    votingEndTime = data.serverTimestamp + data.durationMs;
    votingTimeLeft = Math.max(0, (votingEndTime - Date.now()) / 1000);

    clearAllTimers();
    votingTimer = setInterval(() => {
      votingTimeLeft = Math.max(0, (votingEndTime - Date.now()) / 1000);
    }, 200);
  }

  function onPotatoVoteConfirmed() {
    voteConfirmed = true;
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
    room.onMessage("potato_assigned", onPotatoAssigned);
    room.onMessage("potato_waiting", onPotatoWaiting);
    room.onMessage("potato_status", onPotatoStatus);
    room.onMessage("potato_passed", onPotatoPassed);
    room.onMessage("potato_accepted", onPotatoAccepted);
    room.onMessage("potato_timer", onPotatoTimer);
    room.onMessage("potato_exploded", onPotatoExploded);
    room.onMessage("potato_vote_start", onPotatoVoteStart);
    room.onMessage("potato_vote_confirmed", onPotatoVoteConfirmed);
    room.onMessage("potato_vote_update", onPotatoVoteUpdate);
    room.onMessage("potato_result", onPotatoResult);
    room.onMessage("round_skipped", onRoundSkipped);
  });

  onDestroy(() => {
    clearAllTimers();
  });

  // ── Derived ─────────────────────────────────────────────────────

  $: myScore = resultScores[me?.id ?? ""] ?? 0;
  $: iWasCorrect = correctVoters.includes(me?.id ?? "");
  $: iWasHolder = resultHolderId === me?.id;
  $: timerUrgent = timeRemaining < 4;
  $: timerDisplay = Math.max(0, Math.ceil(timeRemaining * 10) / 10).toFixed(1);
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-6 p-6" data-testid="hot-potato">

  {#if roundSkipped}
    <div class="text-center space-y-3">
      <h2 class="text-xl font-black text-yellow-400">Round Skipped</h2>
      <p class="text-gray-300">{skipReason}</p>
    </div>

  {:else if subPhase === "waiting"}
    <div class="text-center space-y-3">
      <p class="text-5xl">🥔</p>
      <p class="text-gray-400">Get ready...</p>
      <p class="text-xs text-gray-500">The potato is about to be assigned!</p>
    </div>

  {:else if subPhase === "holding"}
    <!-- I have the potato! -->
    <div class="w-full max-w-sm space-y-5 text-center">
      <!-- Timer -->
      <p class="text-5xl font-mono font-black {timerUrgent ? 'text-red-400 animate-pulse' : 'text-orange-400'}">
        {timerDisplay}s
      </p>

      <!-- Hot potato visual -->
      <div class="relative mx-auto w-32 h-32">
        <div class="absolute inset-0 bg-red-600/30 rounded-full animate-ping"></div>
        <div class="relative w-32 h-32 bg-gradient-to-br from-orange-500 to-red-600 rounded-full flex items-center justify-center border-4 {timerUrgent ? 'border-red-400' : 'border-orange-400'} shadow-lg shadow-red-500/50">
          <span class="text-6xl">🥔</span>
        </div>
      </div>

      <div class="space-y-2">
        <p class="text-xl font-black text-red-400">YOU HAVE THE POTATO!</p>
        <p class="text-lg text-gray-300">
          Pass it to <span class="font-black text-orange-400">{targetName}</span>
        </p>
      </div>

      <button
        class="w-full py-5 rounded-xl text-xl font-black transition-all active:scale-95
          {hasPassed
            ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
            : 'bg-orange-600 text-white active:bg-orange-500 shadow-lg shadow-orange-500/30'}"
        disabled={hasPassed}
        on:click={passPotato}
      >
        {hasPassed ? "Passing..." : "PASS THE POTATO!"}
      </button>

      <p class="text-xs text-gray-500">{passCount} passes this round</p>
    </div>

  {:else if subPhase === "receiving"}
    <!-- Potato is coming to me! -->
    <div class="w-full max-w-sm space-y-5 text-center">
      <p class="text-5xl font-mono font-black {timerUrgent ? 'text-red-400 animate-pulse' : 'text-orange-400'}">
        {timerDisplay}s
      </p>

      <div class="relative mx-auto w-32 h-32 animate-bounce">
        <div class="w-32 h-32 bg-gradient-to-br from-orange-500 to-red-600 rounded-full flex items-center justify-center border-4 border-yellow-400 shadow-lg shadow-orange-500/50">
          <span class="text-6xl">🥔</span>
        </div>
      </div>

      <div class="space-y-2">
        <p class="text-xl font-black text-yellow-400">INCOMING POTATO!</p>
        <p class="text-lg text-gray-300">
          <span class="font-bold text-white">{fromName}</span> is passing to you!
        </p>
      </div>

      <button
        class="w-full py-5 rounded-xl text-xl font-black bg-yellow-500 text-black
          active:bg-yellow-400 active:scale-95 transition-all shadow-lg shadow-yellow-500/30"
        on:click={acceptPotato}
      >
        TAP TO ACCEPT!
      </button>
    </div>

  {:else if subPhase === "spectating"}
    <!-- Someone else has the potato -->
    <div class="w-full max-w-sm space-y-5 text-center">
      <p class="text-4xl font-mono font-black {timerUrgent ? 'text-red-400 animate-pulse' : 'text-white'}">
        {timerDisplay}s
      </p>

      <div class="mx-auto w-24 h-24 bg-gray-800 border-2 border-gray-600 rounded-full flex items-center justify-center">
        <span class="text-4xl opacity-50">🥔</span>
      </div>

      <div class="space-y-2">
        <p class="text-lg text-gray-400">Safe... for now</p>
        <p class="text-sm text-gray-500">
          <span class="font-bold text-orange-400">{holderName}</span> has the potato
        </p>
        <p class="text-xs text-gray-600">{passCount} passes so far</p>
      </div>
    </div>

  {:else if subPhase === "exploded"}
    <!-- Explosion! -->
    <div class="w-full max-w-sm space-y-5 text-center">
      <div class="text-7xl animate-bounce">💥</div>
      <h2 class="text-3xl font-black text-red-400">BOOM!</h2>
      <p class="text-lg text-gray-300">
        The potato exploded on
        <span class="font-black text-red-400">{explodedHolderName}</span>!
      </p>
      <p class="text-sm text-gray-500">Get ready to vote...</p>
    </div>

  {:else if subPhase === "voting"}
    <!-- Vote on who was holding the potato -->
    <div class="w-full max-w-sm space-y-4">
      <div class="text-center">
        <h2 class="text-xl font-black text-orange-400">Who Had the Potato?</h2>
        <p class="text-sm text-gray-400 mt-1">
          {Math.ceil(votingTimeLeft)}s remaining
          {#if votesIn > 0}
            <span class="ml-2 text-gray-500">({votesIn}/{totalVoters} voted)</span>
          {/if}
        </p>
      </div>

      {#if voteConfirmed}
        <div class="bg-orange-900 border border-orange-600 rounded-xl p-4 text-center">
          <p class="text-orange-200 font-bold">Vote submitted!</p>
          <p class="text-orange-400 text-sm mt-1">Waiting for others...</p>
        </div>
      {:else}
        <div class="space-y-2">
          {#each voteSuspects as suspect}
            <button
              class="w-full text-left px-4 py-3 rounded-lg border transition-colors active:scale-[0.98]
                {myVote === suspect.id
                  ? 'border-orange-500 bg-orange-900 text-white'
                  : 'border-gray-700 bg-gray-800 text-gray-300 active:border-orange-500'}"
              on:click={() => castVote(suspect.id)}
              disabled={!!myVote}
            >
              <p class="font-semibold">{suspect.name}</p>
            </button>
          {/each}
        </div>
      {/if}
    </div>

  {:else if subPhase === "results"}
    <!-- Results -->
    <div class="w-full max-w-sm space-y-4 text-center">
      <h2 class="text-xl font-black text-orange-400">Round Results</h2>

      <!-- Who was holding it -->
      <div class="bg-red-900/40 border border-red-600 rounded-xl p-4">
        <p class="text-xs text-red-400 uppercase tracking-widest mb-1">Caught Holding</p>
        <p class="text-2xl font-black text-red-200">{resultHolderName}</p>
      </div>

      <!-- My result -->
      <div class="bg-gray-800 rounded-xl p-4 space-y-2">
        {#if iWasHolder}
          <p class="text-red-400 font-bold">You were holding the potato!</p>
        {:else if iWasCorrect}
          <p class="text-green-400 font-bold">You guessed correctly!</p>
        {:else}
          <p class="text-gray-400">You guessed wrong</p>
        {/if}
        <p class="text-3xl font-black {myScore > 0 ? 'text-green-400' : 'text-gray-500'}">
          +{myScore}
        </p>
      </div>

      {#if passLeader}
        <div class="bg-gray-800/50 rounded-xl p-3">
          <p class="text-xs text-gray-500">
            Most passes: <span class="text-orange-400 font-bold">{passLeader.name}</span>
            ({passLeader.count} passes, +25 bonus)
          </p>
        </div>
      {/if}
    </div>
  {/if}
</div>
