<script lang="ts">
  /**
   * Phone game component for "Odd One Out" (registry-20).
   *
   * Sub-phases during `in_round`:
   *   prompt_acknowledge → observing (voting open for normals) → voting_final → results
   *
   * Key behavior changes:
   *   - Normal players: see "You are normal" with no action prompt, can vote
   *     at ANY time during observation or the final voting window.
   *   - Odd players: see their secret action prompt, perform it during
   *     observation, CANNOT vote — they earn points from deception.
   *
   * Server messages listened:
   *   assign_prompt, phase_info, voting_open, window_start, window_pause,
   *   voting_final, vote_confirmed, vote_count_update, round_result,
   *   round_skipped
   */
  import { onMount, onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState, PlayerState } from "../../../../shared/types";

  export let room: Room;
  export let state: RoomState;
  export let me: PlayerState | undefined;

  // ── Local state ────────────────────────────────────────────────────

  type SubPhase = "waiting" | "prompt" | "observing" | "paused" | "voting_final" | "results";
  let subPhase: SubPhase = "waiting";

  // Prompt / role
  let myRole: "odd" | "normal" | "" = "";
  let myPrompt = "";
  let windowCount = 0;
  let windowDurationMs = 10_000;

  // Observation windows
  let currentWindow = 0;
  let totalWindows = 0;
  let windowTimeLeft = 0;
  let windowEndTime = 0;
  let windowTimer: ReturnType<typeof setInterval> | null = null;
  let oddPrompt = "";  // The odd player's prompt — shown to everyone during observation

  // Pause
  let pauseTimeLeft = 0;
  let pauseEndTime = 0;
  let pauseTimer: ReturnType<typeof setInterval> | null = null;

  // Voting (available during observation for normal players)
  let votablePlayers: { id: string; name: string }[] = [];
  let votingOpen = false;
  let myVote: string | null = null;
  let voteConfirmed = false;
  let votesIn = 0;
  let totalVoters = 0;

  // Final voting window timer
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

  function onVotingOpen(data: {
    serverTimestamp: number;
    playerIds: { id: string; name: string }[];
    voterCount: number;
  }) {
    // Voting is now open — normal players can vote at any time
    votingOpen = true;
    // Filter out self from votable list
    votablePlayers = data.playerIds.filter((p) => p.id !== me?.id);
    myVote = null;
    voteConfirmed = false;
    votesIn = 0;
    totalVoters = data.voterCount;
  }

  function onWindowStart(data: { windowNumber: number; totalWindows: number; durationMs: number; serverTimestamp: number; oddPrompt: string }) {
    subPhase = "observing";
    currentWindow = data.windowNumber;
    totalWindows = data.totalWindows;
    oddPrompt = data.oddPrompt;

    // Use server timestamp to compute end time — immune to setInterval throttling
    windowEndTime = data.serverTimestamp + data.durationMs;
    windowTimeLeft = Math.max(0, (windowEndTime - Date.now()) / 1000);

    clearTimer("window");
    windowTimer = setInterval(() => {
      windowTimeLeft = Math.max(0, (windowEndTime - Date.now()) / 1000);
    }, 200);
  }

  function onWindowPause(data: { nextWindowIn: number; serverTimestamp: number }) {
    subPhase = "paused";
    clearTimer("window");

    pauseEndTime = data.serverTimestamp + data.nextWindowIn;
    pauseTimeLeft = Math.max(0, (pauseEndTime - Date.now()) / 1000);

    clearTimer("pause");
    pauseTimer = setInterval(() => {
      pauseTimeLeft = Math.max(0, (pauseEndTime - Date.now()) / 1000);
    }, 200);
  }

  function onVotingFinal(data: { durationMs: number; serverTimestamp: number; playerIds: { id: string; name: string }[] }) {
    subPhase = "voting_final";
    clearTimer("window");
    clearTimer("pause");

    // Update votable list in case it changed
    votablePlayers = data.playerIds.filter((p) => p.id !== me?.id);

    votingEndTime = data.serverTimestamp + data.durationMs;
    votingTimeLeft = Math.max(0, (votingEndTime - Date.now()) / 1000);

    clearTimer("voting");
    votingTimer = setInterval(() => {
      votingTimeLeft = Math.max(0, (votingEndTime - Date.now()) / 1000);
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

  function acknowledgePrompt() {
    room.send("game_input", { action: "acknowledge_prompt" });
  }

  function castVote(suspectId: string) {
    if (myVote || voteConfirmed) return;
    if (myRole === "odd") return; // odd players can't vote
    myVote = suspectId;
    room.send("game_input", { action: "vote", suspectId });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────

  onMount(() => {
    room.onMessage("assign_prompt", onAssignPrompt);
    room.onMessage("phase_info", onPhaseInfo);
    room.onMessage("voting_open", onVotingOpen);
    room.onMessage("window_start", onWindowStart);
    room.onMessage("window_pause", onWindowPause);
    room.onMessage("voting_final", onVotingFinal);
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
  $: isOdd = myRole === "odd";
  $: canVote = myRole === "normal" && votingOpen && !voteConfirmed;
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
    <p class="text-gray-400 text-center">Getting ready...</p>

  {:else if subPhase === "prompt"}
    <!-- Prompt display + acknowledge -->
    <div class="w-full max-w-sm text-center space-y-4">
      {#if isOdd}
        <!-- ODD player: sees their secret action -->
        <h2 class="text-xl font-black text-red-400">You Are the Odd One Out!</h2>
        <div class="bg-red-900/40 border border-red-600 rounded-xl p-6">
          <p class="text-xs text-red-400 uppercase tracking-widest mb-2">Your Secret Action</p>
          <p class="text-lg font-semibold text-white">{myPrompt}</p>
        </div>
        <p class="text-xs text-gray-400">
          Perform this action during observation windows. Try not to get caught!
          You earn points when others guess wrong.
        </p>
      {:else}
        <!-- NORMAL player: no action prompt, just told they're normal -->
        <h2 class="text-xl font-black text-indigo-400">You Are Normal</h2>
        <div class="bg-indigo-900/40 border border-indigo-600 rounded-xl p-6">
          <p class="text-lg font-semibold text-white">Watch everyone carefully!</p>
          <p class="text-sm text-gray-400 mt-2">
            One or more players have a secret action. Spot who's doing something different.
          </p>
        </div>
        <p class="text-xs text-gray-400">
          You can vote at any time during the observation windows.
        </p>
      {/if}
      <p class="text-xs text-gray-500">
        There will be {windowCount} observation windows of {windowDurationMs / 1000}s each.
      </p>
      <button
        class="w-full py-4 rounded-xl text-lg font-bold bg-indigo-600 active:bg-indigo-500 text-white transition-all active:scale-95"
        on:click={acknowledgePrompt}
      >Got it!</button>
    </div>

  {:else if subPhase === "observing"}
    <!-- Observation window -->
    <div class="w-full max-w-sm space-y-4">
      <div class="text-center">
        <p class="text-xs text-gray-400 uppercase tracking-widest">
          Window {currentWindow} / {totalWindows}
        </p>
        <p class="text-5xl font-mono font-black text-white mt-2" data-testid="window-timer">
          {Math.ceil(windowTimeLeft)}
        </p>
      </div>

      {#if isOdd}
        <!-- ODD: show their action reminder -->
        <div class="bg-red-900/40 border border-red-600 rounded-xl p-4 text-center">
          <p class="text-xs text-red-400 uppercase tracking-widest mb-1">Your Action</p>
          <p class="text-sm text-white font-medium">{myPrompt}</p>
        </div>
        <p class="text-xs text-gray-500 text-center">Perform your action. Don't get caught!</p>
      {:else}
        <!-- NORMAL: show the odd prompt (what to look for) + vote buttons -->
        {#if oddPrompt}
          <div class="bg-indigo-900/50 border border-indigo-600 rounded-xl p-3 text-center">
            <p class="text-xs text-indigo-400 uppercase tracking-widest mb-1">Look For This Action</p>
            <p class="text-sm text-indigo-200 font-medium">{oddPrompt}</p>
          </div>
        {/if}

        <!-- Inline voting during observation -->
        {#if canVote}
          <div class="border-t border-gray-700 pt-3">
            <p class="text-xs text-indigo-400 uppercase tracking-widest text-center mb-2">
              Vote when you're ready
            </p>
            <div class="space-y-2">
              {#each votablePlayers as player}
                <button
                  class="w-full text-left px-4 py-2 rounded-lg border transition-colors text-sm
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
          </div>
        {:else if voteConfirmed}
          <div class="bg-green-900/50 border border-green-600 rounded-xl p-3 text-center">
            <p class="text-green-200 font-bold text-sm">Vote submitted!</p>
          </div>
        {/if}
      {/if}

      <!-- Vote progress (shown to all) -->
      {#if votesIn > 0}
        <p class="text-xs text-gray-500 text-center">{votesIn}/{totalVoters} votes in</p>
      {/if}
    </div>

  {:else if subPhase === "paused"}
    <!-- Between windows -->
    <div class="text-center space-y-3">
      <p class="text-gray-400">Next window in...</p>
      <p class="text-4xl font-mono font-black text-indigo-400">
        {Math.ceil(pauseTimeLeft)}
      </p>

      {#if isOdd}
        <p class="text-xs text-gray-500">Get ready to perform your action again</p>
      {:else if canVote}
        <p class="text-xs text-indigo-400">You can still vote below</p>
        <div class="space-y-2 max-w-xs mx-auto">
          {#each votablePlayers as player}
            <button
              class="w-full text-left px-4 py-2 rounded-lg border transition-colors text-sm
                border-gray-700 bg-gray-800 text-gray-300 active:border-indigo-500"
              on:click={() => castVote(player.id)}
              disabled={!!myVote}
            >
              <p class="font-semibold">{player.name}</p>
            </button>
          {/each}
        </div>
      {:else if voteConfirmed}
        <div class="bg-green-900/50 border border-green-600 rounded-xl p-3 text-center max-w-xs mx-auto">
          <p class="text-green-200 font-bold text-sm">Vote submitted!</p>
        </div>
      {/if}
    </div>

  {:else if subPhase === "voting_final"}
    <!-- Final voting window (last chance) -->
    <div class="w-full max-w-sm space-y-4">
      <div class="text-center">
        <h2 class="text-xl font-black text-indigo-400">
          {isOdd ? "Survive!" : "Last Chance to Vote!"}
        </h2>
        <p class="text-sm text-gray-400 mt-1">
          {Math.ceil(votingTimeLeft)}s remaining
          {#if votesIn > 0}
            <span class="ml-2 text-gray-500">({votesIn}/{totalVoters} voted)</span>
          {/if}
        </p>
      </div>

      {#if isOdd}
        <!-- Odd player: can't vote, just wait -->
        <div class="bg-red-900/40 border border-red-600 rounded-xl p-4 text-center">
          <p class="text-red-200 font-bold">You can't vote!</p>
          <p class="text-red-400 text-sm mt-1">
            You earn points for every wrong guess against you.
          </p>
        </div>
      {:else if voteConfirmed}
        <div class="bg-green-900 border border-green-600 rounded-xl p-4 text-center">
          <p class="text-green-200 font-bold">Vote submitted!</p>
          <p class="text-green-400 text-sm mt-1">Waiting for others...</p>
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
          <div class="text-left">
            <span class="text-gray-400">Normal:</span>
            <span class="text-gray-200 ml-1">(no action — just observe)</span>
          </div>
          <div class="text-left">
            <span class="text-gray-400">Odd:</span>
            <span class="text-indigo-300 ml-1">{results.promptPair.odd}</span>
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
