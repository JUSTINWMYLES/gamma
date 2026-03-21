<script lang="ts">
  /**
   * Phone game component for "Odd One Out" (registry-20).
   *
   * Sub-phases during `in_round`:
   *   prompt_acknowledge → observing → voting → results
   *
   * Server messages listened:
   *   assign_prompt, phase_info, window_start, window_pause,
   *   voting_start, vote_confirmed, vote_count_update, round_result
   */
  import { onMount, onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState, PlayerState } from "../../../../shared/types";

  export let room: Room;
  export let state: RoomState;
  export let me: PlayerState | undefined;

  // ── Local state ────────────────────────────────────────────────────

  type SubPhase = "waiting" | "prompt" | "observing" | "paused" | "voting" | "results";
  let subPhase: SubPhase = "waiting";

  // Prompt
  let myRole: "odd" | "normal" | "" = "";
  let myPrompt = "";
  let windowCount = 0;
  let windowDurationMs = 10_000;

  // Observation windows
  let currentWindow = 0;
  let totalWindows = 0;
  let windowTimeLeft = 0;
  let windowTimer: ReturnType<typeof setInterval> | null = null;

  // Pause
  let pauseTimeLeft = 0;
  let pauseTimer: ReturnType<typeof setInterval> | null = null;

  // Voting
  let votablePlayers: { id: string; name: string }[] = [];
  let votingTimeLeft = 0;
  let votingTimer: ReturnType<typeof setInterval> | null = null;
  let myVote: string | null = null;
  let voteConfirmed = false;
  let votesIn = 0;
  let totalVoters = 0;

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

  function onAssignPrompt(data: { role: string; prompt: string; windowCount: number; windowDurationMs: number }) {
    myRole = data.role as "odd" | "normal";
    myPrompt = data.prompt;
    windowCount = data.windowCount;
    windowDurationMs = data.windowDurationMs;
    subPhase = "prompt";
  }

  function onPhaseInfo(data: { subPhase: string }) {
    if (data.subPhase === "prompt_acknowledge") {
      subPhase = "prompt";
    }
  }

  function onWindowStart(data: { windowNumber: number; totalWindows: number; durationMs: number }) {
    subPhase = "observing";
    currentWindow = data.windowNumber;
    totalWindows = data.totalWindows;
    windowTimeLeft = data.durationMs / 1000;

    clearTimer("window");
    windowTimer = setInterval(() => {
      windowTimeLeft = Math.max(0, windowTimeLeft - 0.2);
    }, 200);
  }

  function onWindowPause(data: { nextWindowIn: number }) {
    subPhase = "paused";
    clearTimer("window");
    pauseTimeLeft = data.nextWindowIn / 1000;

    clearTimer("pause");
    pauseTimer = setInterval(() => {
      pauseTimeLeft = Math.max(0, pauseTimeLeft - 0.2);
    }, 200);
  }

  function onVotingStart(data: { durationMs: number; playerIds: { id: string; name: string }[] }) {
    subPhase = "voting";
    clearTimer("window");
    clearTimer("pause");

    // Filter out self from votable list
    votablePlayers = data.playerIds.filter((p) => p.id !== me?.id);
    votingTimeLeft = data.durationMs / 1000;
    myVote = null;
    voteConfirmed = false;
    votesIn = 0;
    totalVoters = data.playerIds.length;

    clearTimer("voting");
    votingTimer = setInterval(() => {
      votingTimeLeft = Math.max(0, votingTimeLeft - 0.2);
    }, 200);
  }

  function onVoteConfirmed(_data: { suspectId: string }) {
    voteConfirmed = true;
  }

  function onVoteCountUpdate(data: { votesIn: number; totalVoters: number }) {
    votesIn = data.votesIn;
    totalVoters = data.totalVoters;
  }

  function onRoundResult(data: typeof results) {
    subPhase = "results";
    results = data;
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

  function acknowledgePrompt() {
    room.send("game_input", { action: "acknowledge_prompt" });
  }

  function castVote(suspectId: string) {
    if (myVote || voteConfirmed) return;
    myVote = suspectId;
    room.send("game_input", { action: "vote", suspectId });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────

  onMount(() => {
    room.onMessage("assign_prompt", onAssignPrompt);
    room.onMessage("phase_info", onPhaseInfo);
    room.onMessage("window_start", onWindowStart);
    room.onMessage("window_pause", onWindowPause);
    room.onMessage("voting_start", onVotingStart);
    room.onMessage("vote_confirmed", onVoteConfirmed);
    room.onMessage("vote_count_update", onVoteCountUpdate);
    room.onMessage("round_result", onRoundResult);
    room.onMessage("round_skipped", onRoundSkipped);
  });

  onDestroy(() => {
    clearTimer("window");
    clearTimer("pause");
    clearTimer("voting");
  });

  // Derive my score from results
  $: myScore = results?.scores[me?.id ?? ""] ?? 0;
  $: wasOdd = results?.oddPlayerIds.includes(me?.id ?? "") ?? false;
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-6 p-6" data-testid="odd-one-out">

  {#if roundSkipped}
    <!-- Round was skipped (e.g. not enough players) -->
    <div class="text-center space-y-3">
      <h2 class="text-xl font-black text-yellow-400">Round Skipped</h2>
      <p class="text-gray-300">{skipReason}</p>
    </div>

  {:else if subPhase === "waiting"}
    <!-- Waiting for server to assign prompt -->
    <p class="text-gray-400 text-center">Getting ready…</p>

  {:else if subPhase === "prompt"}
    <!-- Prompt display + acknowledge -->
    <div class="w-full max-w-sm text-center space-y-4">
      <h2 class="text-xl font-black text-indigo-400">Your Secret Action</h2>
      <p class="text-xs text-gray-400 uppercase tracking-widest">
        {myRole === "odd" ? "You are the odd one out" : "You are normal"}
      </p>
      <div class="bg-gray-800 border border-gray-700 rounded-xl p-6">
        <p class="text-lg font-semibold text-white">{myPrompt}</p>
      </div>
      <p class="text-xs text-gray-500">
        Remember your action. There will be {windowCount} observation windows of {windowDurationMs / 1000}s each.
      </p>
      <button
        class="w-full py-4 rounded-xl text-lg font-bold bg-indigo-600 active:bg-indigo-500 text-white transition-all active:scale-95"
        on:click={acknowledgePrompt}
      >Got it!</button>
    </div>

  {:else if subPhase === "observing"}
    <!-- Observation window -->
    <div class="text-center space-y-4">
      <p class="text-xs text-gray-400 uppercase tracking-widest">
        Window {currentWindow} / {totalWindows}
      </p>
      <p class="text-6xl font-mono font-black text-white" data-testid="window-timer">
        {Math.ceil(windowTimeLeft)}
      </p>
      <div class="bg-gray-800 border border-gray-700 rounded-xl p-4 max-w-xs">
        <p class="text-sm text-gray-300 font-medium">{myPrompt}</p>
      </div>
      <p class="text-xs text-gray-500">Perform your action. Watch other players carefully.</p>
    </div>

  {:else if subPhase === "paused"}
    <!-- Between windows -->
    <div class="text-center space-y-3">
      <p class="text-gray-400">Next window in…</p>
      <p class="text-4xl font-mono font-black text-indigo-400">
        {Math.ceil(pauseTimeLeft)}
      </p>
    </div>

  {:else if subPhase === "voting"}
    <!-- Vote UI -->
    <div class="w-full max-w-sm space-y-4">
      <div class="text-center">
        <h2 class="text-xl font-black text-indigo-400">Who is the Odd One Out?</h2>
        <p class="text-sm text-gray-400 mt-1">
          {Math.ceil(votingTimeLeft)}s remaining
          {#if votesIn > 0}
            <span class="ml-2 text-gray-500">({votesIn}/{totalVoters} voted)</span>
          {/if}
        </p>
      </div>

      {#if voteConfirmed}
        <div class="bg-green-900 border border-green-600 rounded-xl p-4 text-center">
          <p class="text-green-200 font-bold">Vote submitted!</p>
          <p class="text-green-400 text-sm mt-1">Waiting for others…</p>
        </div>
      {:else}
        <div class="space-y-2">
          {#each votablePlayers as player}
            <button
              class="w-full text-left px-4 py-3 rounded-lg border transition-colors
                {myVote === player.id
                  ? 'border-indigo-500 bg-indigo-900 text-white'
                  : 'border-gray-700 bg-gray-800 text-gray-300 active:border-indigo-500'}"
              on:click={() => castVote(player.id)}
              disabled={!!myVote}
            >
              <p class="font-semibold">{player.name}</p>
            </button>
          {/each}
        </div>
      {/if}
    </div>

  {:else if subPhase === "results"}
    <!-- Round results -->
    <div class="w-full max-w-sm space-y-4 text-center">
      <h2 class="text-xl font-black text-indigo-400">Round Results</h2>

      {#if results}
        <!-- Who was odd -->
        <div class="bg-gray-800 rounded-xl p-4">
          <p class="text-xs text-gray-400 uppercase tracking-widest mb-2">The odd one(s) out:</p>
          <div class="flex gap-2 justify-center flex-wrap">
            {#each results.oddPlayerIds as oddId}
              {@const oddPlayer = state.players.get(oddId)}
              <span class="px-3 py-1 bg-indigo-900 border border-indigo-500 rounded-full text-sm font-bold text-white">
                {oddPlayer?.name ?? oddId}
              </span>
            {/each}
          </div>
        </div>

        <!-- Prompts -->
        <div class="bg-gray-800 rounded-xl p-4 text-sm space-y-2">
          <div class="flex justify-between text-gray-400">
            <span>Normal:</span>
            <span class="text-gray-200">{results.promptPair.normal}</span>
          </div>
          <div class="flex justify-between text-gray-400">
            <span>Odd:</span>
            <span class="text-indigo-300">{results.promptPair.odd}</span>
          </div>
        </div>

        <!-- Your score -->
        <div class="bg-gray-800 rounded-xl p-4">
          <p class="text-xs text-gray-400 uppercase tracking-widest mb-1">
            {wasOdd ? "You were the odd one!" : "You were normal"}
          </p>
          <p class="text-3xl font-black {myScore > 0 ? 'text-green-400' : 'text-gray-500'}">
            +{myScore}
          </p>
        </div>
      {/if}
    </div>
  {/if}
</div>