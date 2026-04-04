<script lang="ts">
  /**
   * TV/Viewer game component for "Word Build" (registry-27).
   *
   * Displays the countdown timer during play, the word reveal
   * after the round, and the team results.
   *
   * Server messages listened:
   *   wb_round_go, wb_team_done, wb_round_reveal, wb_round_result, round_skipped
   */
  import { onMount, onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState } from "../../../../shared/types";

  export let room: Room;
  export let state: RoomState;

  // ── Sub-phase state ──────────────────────────────────────────────
  type SubPhase =
    | "waiting"
    | "playing"
    | "reveal"
    | "result";

  let subPhase: SubPhase = "waiting";

  // ── Round data ──────────────────────────────────────────────────
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
  let teamsDone: Set<string> = new Set();

  // ── Reveal state ────────────────────────────────────────────────
  let correctWord = "";
  let validWords: string[] = [];

  // ── Result state ────────────────────────────────────────────────
  interface TeamResultDisplay {
    teamId: string;
    completionTimeMs: number | null;
    selfReportCorrect: boolean | null;
    playerNames: string[];
  }
  let teamResults: TeamResultDisplay[] = [];

  // ── Round skipped ───────────────────────────────────────────────
  let roundSkipped = false;
  let skipReason = "";

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
  function onRoundGo(data: {
    serverTimestamp: number;
    roundDurationMs: number;
    teams: TeamInfo[];
  }) {
    subPhase = "playing";
    teams = data.teams;
    roundDurationMs = data.roundDurationMs;
    teamsDone = new Set();
    roundSkipped = false;
    startTimer();
  }

  function onTeamDone(data: { teamId: string }) {
    teamsDone = new Set([...teamsDone, data.teamId]);
  }

  function onRoundReveal(data: { correctWord: string; validWords: string[] }) {
    clearTimer();
    subPhase = "reveal";
    correctWord = data.correctWord;
    validWords = data.validWords;
  }

  function onRoundResult(data: {
    teamResults: TeamResultDisplay[];
    correctWord: string;
    validWords: string[];
  }) {
    subPhase = "result";
    teamResults = data.teamResults;
    correctWord = data.correctWord;
    validWords = data.validWords;
  }

  function onRoundSkipped(data: { reason: string }) {
    roundSkipped = true;
    skipReason = data.reason;
  }

  // ── Lifecycle ───────────────────────────────────────────────────
  onMount(() => {
    room.onMessage("wb_round_go", onRoundGo);
    room.onMessage("wb_team_done", onTeamDone);
    room.onMessage("wb_round_reveal", onRoundReveal);
    room.onMessage("wb_round_result", onRoundResult);
    room.onMessage("round_skipped", onRoundSkipped);
  });

  onDestroy(() => {
    clearTimer();
  });

  // ── Derived ─────────────────────────────────────────────────────
  $: timerDisplay = Math.ceil(timeLeft);
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-8 p-12" data-testid="word-build-tv">
  {#if roundSkipped}
    <h2 class="text-3xl font-black text-yellow-400">Round Skipped</h2>
    <p class="text-xl text-gray-300">{skipReason}</p>

  {:else if subPhase === "waiting"}
    <h2 class="text-5xl font-black text-cyan-400">Word Build</h2>
    <p class="text-xl text-gray-300">Arrange your phones to spell the word!</p>
    <p class="text-gray-400">Waiting for round to start...</p>

  {:else if subPhase === "playing"}
    <!-- Timer display -->
    <p class="text-9xl font-mono font-black {timeLeft < 10 ? 'text-red-400 animate-pulse' : 'text-white'}">
      {timerDisplay}
    </p>

    <p class="text-2xl text-gray-300 font-bold">Arrange your phones!</p>

    <!-- Team status -->
    <div class="flex gap-12 mt-4">
      {#each teams as team}
        <div class="text-center space-y-2">
          <p class="text-lg font-bold uppercase tracking-widest
            {team.teamId === 'team-a' ? 'text-cyan-400' : 'text-amber-400'}">
            {team.teamId === "team-a" ? "Team A" : "Team B"}
          </p>
          <div class="flex flex-wrap gap-1 justify-center">
            {#each team.playerNames as name}
              <span class="text-sm px-2 py-1 rounded bg-gray-800 text-gray-300">{name}</span>
            {/each}
          </div>
          {#if teamsDone.has(team.teamId)}
            <p class="text-green-400 font-bold text-lg">✓ DONE</p>
          {:else}
            <p class="text-gray-500 text-sm">Working...</p>
          {/if}
        </div>
      {/each}
    </div>

  {:else if subPhase === "reveal"}
    <!-- Word reveal -->
    <p class="text-xl text-gray-400 uppercase tracking-widest">The Word Was</p>
    <h2 class="text-8xl font-black text-cyan-400 tracking-[0.2em]">{correctWord}</h2>
    {#if validWords.length > 1}
      <div class="text-center space-y-2 mt-4">
        <p class="text-sm text-gray-500">Also valid:</p>
        {#each validWords.filter((w) => w !== correctWord) as alt}
          <p class="text-3xl text-gray-300 font-bold">{alt}</p>
        {/each}
      </div>
    {/if}
    <p class="text-gray-400 mt-6">Teams are confirming their results...</p>

  {:else if subPhase === "result"}
    <!-- Results -->
    <p class="text-xl text-gray-400 uppercase tracking-widest">Round Result</p>
    <h2 class="text-6xl font-black text-white tracking-[0.15em]">{correctWord}</h2>

    <div class="flex gap-16 mt-8">
      {#each teamResults as tr}
        <div class="text-center space-y-3 min-w-[200px]">
          <p class="text-2xl font-bold
            {tr.teamId === 'team-a' ? 'text-cyan-400' : 'text-amber-400'}">
            {tr.teamId === "team-a" ? "Team A" : "Team B"}
          </p>
          <div class="rounded-xl p-4 border
            {tr.teamId === 'team-a'
              ? 'bg-cyan-900/20 border-cyan-500/30'
              : 'bg-amber-900/20 border-amber-500/30'}">
            {#if tr.selfReportCorrect === true}
              <p class="text-3xl text-green-400 font-black">✓ Correct</p>
            {:else if tr.selfReportCorrect === false}
              <p class="text-3xl text-red-400 font-black">✕ Wrong</p>
            {:else}
              <p class="text-2xl text-gray-500 font-bold">— DNF</p>
            {/if}
          </div>
          <div class="flex flex-wrap gap-1 justify-center">
            {#each tr.playerNames as name}
              <span class="text-sm px-2 py-1 rounded bg-gray-800 text-gray-300">{name}</span>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
