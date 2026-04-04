<script lang="ts">
  /**
   * Phone game component for "Word Build" (registry-27).
   *
   * Team-based physical phone arrangement word game.
   *
   * Server messages listened:
   *   wb_round_setup, wb_round_go, wb_team_done, wb_round_reveal,
   *   wb_confirm_start, wb_confirm_received, wb_round_result, round_skipped
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
    | "playing"
    | "team_done"
    | "reveal"
    | "confirm"
    | "result";

  let subPhase: SubPhase = "waiting";

  // ── Round data ──────────────────────────────────────────────────
  let myFragment = "";
  let myFragmentIndex = 0;
  let hasDoneButton = false;
  let myTeamId = "";
  let roundDurationMs = 60000;
  let roundStartedAt = 0;

  // ── Team info ───────────────────────────────────────────────────
  interface TeamInfo {
    teamId: string;
    playerNames: string[];
  }
  let teams: TeamInfo[] = [];

  // ── Timer ───────────────────────────────────────────────────────
  let timeLeft = 0;
  let timerInterval: ReturnType<typeof setInterval> | null = null;

  // ── Done state ──────────────────────────────────────────────────
  let myTeamDone = false;
  let otherTeamDone = false;

  // ── Reveal state ────────────────────────────────────────────────
  let correctWord = "";
  let validWords: string[] = [];

  // ── Confirm state ───────────────────────────────────────────────
  let confirmSent = false;

  // ── Result state ────────────────────────────────────────────────
  interface TeamResultDisplay {
    teamId: string;
    completionTimeMs: number | null;
    selfReportCorrect: boolean | null;
    playerNames: string[];
  }
  let teamResults: TeamResultDisplay[] = [];
  let roundScores: Record<string, number> = {};

  // ── Round skipped ───────────────────────────────────────────────
  let roundSkipped = false;
  let skipReason = "";

  // ── Actions ─────────────────────────────────────────────────────
  function handleDone() {
    if (!hasDoneButton || myTeamDone) return;
    room.send("game_input", { action: "wb_done" });
  }

  function handleConfirm(correct: boolean) {
    if (confirmSent) return;
    confirmSent = true;
    room.send("game_input", { action: "wb_confirm", correct });
  }

  // ── Timer ───────────────────────────────────────────────────────
  function startTimer() {
    clearTimer();
    roundStartedAt = Date.now();
    timerInterval = setInterval(() => {
      const elapsed = Date.now() - roundStartedAt;
      timeLeft = Math.max(0, (roundDurationMs - elapsed) / 1000);
    }, 100);
  }

  function clearTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  // ── Message handlers ────────────────────────────────────────────
  function onRoundSetup(data: {
    teams: TeamInfo[];
    myTeamId: string;
    myFragment: string;
    myFragmentIndex: number;
    hasDoneButton: boolean;
    roundDurationMs: number;
  }) {
    subPhase = "playing";
    teams = data.teams;
    myTeamId = data.myTeamId;
    myFragment = data.myFragment;
    myFragmentIndex = data.myFragmentIndex;
    hasDoneButton = data.hasDoneButton;
    roundDurationMs = data.roundDurationMs;
    myTeamDone = false;
    otherTeamDone = false;
    confirmSent = false;
    roundSkipped = false;
    startTimer();
  }

  function onRoundGo(_data: unknown) {
    // Timer already started in setup
  }

  function onTeamDone(data: { teamId: string }) {
    if (data.teamId === myTeamId) {
      myTeamDone = true;
      subPhase = "team_done";
    } else {
      otherTeamDone = true;
    }
  }

  function onRoundReveal(data: { correctWord: string; validWords: string[] }) {
    clearTimer();
    subPhase = "reveal";
    correctWord = data.correctWord;
    validWords = data.validWords;
  }

  function onConfirmStart(_data: { teamId: string; durationMs: number }) {
    subPhase = "confirm";
  }

  function onConfirmReceived() {
    // Confirmation acknowledged
  }

  function onRoundResult(data: {
    teamResults: TeamResultDisplay[];
    scores: Record<string, number>;
    correctWord: string;
    validWords: string[];
  }) {
    subPhase = "result";
    teamResults = data.teamResults;
    roundScores = data.scores;
    correctWord = data.correctWord;
    validWords = data.validWords;
  }

  function onRoundSkipped(data: { reason: string }) {
    roundSkipped = true;
    skipReason = data.reason;
  }

  // ── Lifecycle ───────────────────────────────────────────────────
  onMount(() => {
    room.onMessage("wb_round_setup", onRoundSetup);
    room.onMessage("wb_round_go", onRoundGo);
    room.onMessage("wb_team_done", onTeamDone);
    room.onMessage("wb_round_reveal", onRoundReveal);
    room.onMessage("wb_confirm_start", onConfirmStart);
    room.onMessage("wb_confirm_received", onConfirmReceived);
    room.onMessage("wb_round_result", onRoundResult);
    room.onMessage("round_skipped", onRoundSkipped);
  });

  onDestroy(() => {
    clearTimer();
  });

  // ── Derived ─────────────────────────────────────────────────────
  $: timerDisplay = Math.ceil(timeLeft);
  $: myTeamName = myTeamId === "team-a" ? "Team A" : "Team B";
  $: teamColor = myTeamId === "team-a" ? "cyan" : "amber";
  $: myScore = me ? roundScores[me.id] ?? 0 : 0;
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-6 p-6" data-testid="word-build">
  {#if roundSkipped}
    <div class="text-center space-y-3">
      <h2 class="text-xl font-black text-yellow-400">Round Skipped</h2>
      <p class="text-gray-300">{skipReason}</p>
    </div>

  {:else if subPhase === "waiting"}
    <div class="text-center space-y-4">
      <h2 class="text-3xl font-black text-cyan-400">Word Build</h2>
      <p class="text-gray-300">Arrange your phones to spell the word!</p>
      <p class="text-gray-400 text-sm">Waiting for round to start...</p>
    </div>

  {:else if subPhase === "playing" || subPhase === "team_done"}
    <!-- Main playing interface -->
    <div class="w-full max-w-sm text-center space-y-4">
      <!-- Timer -->
      <p class="text-4xl font-mono font-black {timeLeft < 10 ? 'text-red-400' : 'text-white'}">
        {timerDisplay}
      </p>

      <!-- Team indicator -->
      <p class="text-sm font-bold uppercase tracking-widest
        {myTeamId === 'team-a' ? 'text-cyan-400' : 'text-amber-400'}">
        {myTeamName}
      </p>

      <!-- Letter fragment display -->
      <div class="w-full aspect-[2/1] rounded-2xl flex items-center justify-center
        {myTeamId === 'team-a'
          ? 'bg-gradient-to-br from-cyan-900 to-cyan-700 border-2 border-cyan-400'
          : 'bg-gradient-to-br from-amber-900 to-amber-700 border-2 border-amber-400'}">
        <span class="text-7xl font-black text-white tracking-widest select-none">
          {myFragment}
        </span>
      </div>

      <!-- Fragment index hint -->
      <p class="text-xs text-gray-500">Fragment #{myFragmentIndex + 1}</p>

      {#if myTeamDone}
        <div class="bg-green-900/50 rounded-xl p-4 border border-green-500/30">
          <p class="text-green-400 font-bold">✓ Your team is locked in!</p>
          <p class="text-gray-400 text-sm">Waiting for the other team...</p>
        </div>
      {:else if hasDoneButton}
        <!-- Done button -->
        <button
          class="w-full py-4 rounded-xl font-black text-xl text-white
            bg-gradient-to-r from-green-600 to-emerald-600
            hover:from-green-500 hover:to-emerald-500
            active:scale-95 transition-transform shadow-lg"
          on:click={handleDone}
        >
          ✓ DONE — We Got It!
        </button>
        <p class="text-xs text-gray-500">Press when your team has arranged the word</p>
      {:else}
        <p class="text-gray-400 text-sm">Arrange your phones to spell the word!</p>
        <p class="text-xs text-gray-600">Another teammate has the Done button</p>
      {/if}

      {#if otherTeamDone && !myTeamDone}
        <div class="bg-red-900/30 rounded-xl p-3 border border-red-500/20">
          <p class="text-red-400 text-sm font-bold">⚡ The other team finished! Hurry!</p>
        </div>
      {/if}
    </div>

  {:else if subPhase === "reveal"}
    <div class="text-center space-y-4">
      <p class="text-xs text-gray-500 uppercase tracking-widest">The Word Was</p>
      <h2 class="text-5xl font-black text-cyan-400 tracking-widest">{correctWord}</h2>
      {#if validWords.length > 1}
        <div class="space-y-1">
          <p class="text-xs text-gray-500">Also valid:</p>
          {#each validWords.filter((w) => w !== correctWord) as alt}
            <p class="text-lg text-gray-300">{alt}</p>
          {/each}
        </div>
      {/if}

      {#if hasDoneButton}
        <p class="text-gray-400 text-sm mt-4">Did your team get it right?</p>
      {:else}
        <p class="text-gray-400 text-sm mt-4">Waiting for confirmation...</p>
      {/if}
    </div>

  {:else if subPhase === "confirm"}
    <div class="text-center space-y-4">
      <p class="text-xs text-gray-500 uppercase tracking-widest">The Word Was</p>
      <h2 class="text-4xl font-black text-cyan-400 tracking-widest">{correctWord}</h2>

      {#if hasDoneButton && !confirmSent}
        <p class="text-gray-300 mt-4">Did your team ({myTeamName}) get it right?</p>
        <div class="flex gap-4 justify-center mt-2">
          <button
            class="px-8 py-3 rounded-xl font-bold text-lg text-white
              bg-green-600 hover:bg-green-500 active:scale-95 transition-transform"
            on:click={() => handleConfirm(true)}
          >
            ✓ Correct
          </button>
          <button
            class="px-8 py-3 rounded-xl font-bold text-lg text-white
              bg-red-600 hover:bg-red-500 active:scale-95 transition-transform"
            on:click={() => handleConfirm(false)}
          >
            ✕ Wrong
          </button>
        </div>
      {:else if confirmSent}
        <p class="text-green-400 font-bold mt-4">Confirmation sent!</p>
        <p class="text-gray-400 text-sm">Waiting for results...</p>
      {:else}
        <p class="text-gray-400 text-sm mt-4">Your teammate is confirming...</p>
      {/if}
    </div>

  {:else if subPhase === "result"}
    <div class="text-center space-y-4">
      <p class="text-xs text-gray-500 uppercase tracking-widest">Round Result</p>
      <h2 class="text-3xl font-black tracking-widest text-white">{correctWord}</h2>

      <div class="space-y-3 w-full max-w-sm">
        {#each teamResults as tr}
          <div class="rounded-xl p-3 border
            {tr.teamId === 'team-a'
              ? 'bg-cyan-900/20 border-cyan-500/30'
              : 'bg-amber-900/20 border-amber-500/30'}">
            <p class="font-bold text-sm
              {tr.teamId === 'team-a' ? 'text-cyan-400' : 'text-amber-400'}">
              {tr.teamId === "team-a" ? "Team A" : "Team B"}
            </p>
            <p class="text-gray-300 text-sm">
              {#if tr.selfReportCorrect === true}
                ✓ Correct
                {#if tr.completionTimeMs}
                  — {((tr.completionTimeMs - (roundStartedAt || 0)) / 1000).toFixed(1)}s
                {/if}
              {:else if tr.selfReportCorrect === false}
                ✕ Incorrect
              {:else}
                — Did not finish
              {/if}
            </p>
          </div>
        {/each}
      </div>

      <div class="mt-4">
        <p class="text-sm text-gray-500">Your score this round:</p>
        <p class="text-3xl font-black {myScore > 0 ? 'text-green-400' : 'text-gray-400'}">
          +{myScore}
        </p>
      </div>
    </div>
  {/if}
</div>
