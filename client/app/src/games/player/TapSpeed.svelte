<script lang="ts">
  /**
   * Phone game component for "Tap Speed" (registry-03).
   *
   * Bracket-based 1v1 rapid tapping game.
   *
   * Server messages listened:
   *   tap_bracket_init, tap_match_start, tap_go, tap_confirmed,
   *   tap_counts, tap_timer, tap_match_end, tap_match_result,
   *   tap_bracket_round_advance, tap_tournament_complete, round_skipped
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
    | "bracket_init"
    | "match_preview"
    | "tapping"
    | "match_result"
    | "bracket_advance"
    | "tournament_complete"
    | "eliminated";

  let subPhase: SubPhase = "waiting";

  // ── Bracket info ─────────────────────────────────────────────────

  let totalPlayers = 0;
  let totalBracketRounds = 0;

  // ── Match state ──────────────────────────────────────────────────

  let currentMatchId = "";
  let opponentId = "";
  let opponentName = "";
  let bracketRound = 0;
  let isInMatch = false;

  // ── Tapping ──────────────────────────────────────────────────────

  let myTaps = 0;
  let opponentTaps = 0;
  let timeRemaining = 0;
  let matchDurationMs = 0;
  let matchStartedAt = 0;
  let timerInterval: ReturnType<typeof setInterval> | null = null;

  // ── Match result ─────────────────────────────────────────────────

  let resultWinnerId = "";
  let resultWinnerName = "";
  let resultLoserName = "";
  let resultWinnerTaps = 0;
  let resultLoserTaps = 0;
  let resultDurationMs = 0;
  let iWon = false;

  // ── Tournament result ────────────────────────────────────────────

  let championId = "";
  let championName = "";
  let runnerUpName = "";

  // ── Round skipped ────────────────────────────────────────────────

  let roundSkipped = false;
  let skipReason = "";

  // ── Actions ─────────────────────────────────────────────────────

  function handleTap() {
    if (!isInMatch) return;
    room.send("game_input", { action: "tap" });
    // Optimistic increment (server confirms via tap_confirmed)
    myTaps++;
  }

  // ── Timer ───────────────────────────────────────────────────────

  function startTimer(durationMs: number) {
    clearTimer();
    matchDurationMs = durationMs;
    matchStartedAt = Date.now();
    timeRemaining = durationMs / 1000;
    timerInterval = setInterval(() => {
      const elapsed = Date.now() - matchStartedAt;
      timeRemaining = Math.max(0, (durationMs - elapsed) / 1000);
    }, 50);
  }

  function clearTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  // ── Message handlers ────────────────────────────────────────────

  function onBracketInit(data: { totalPlayers: number; totalRounds: number }) {
    subPhase = "bracket_init";
    totalPlayers = data.totalPlayers;
    totalBracketRounds = data.totalRounds;
  }

  function onMatchStart(data: {
    matchId: string;
    player1Id: string;
    player1Name: string;
    player2Id: string;
    player2Name: string;
    bracketRound: number;
  }) {
    currentMatchId = data.matchId;
    bracketRound = data.bracketRound;

    // Determine if I'm in this match
    const mySessionId = me?.id ?? "";
    if (mySessionId === data.player1Id) {
      isInMatch = true;
      opponentId = data.player2Id;
      opponentName = data.player2Name;
    } else if (mySessionId === data.player2Id) {
      isInMatch = true;
      opponentId = data.player1Id;
      opponentName = data.player1Name;
    } else {
      isInMatch = false;
      opponentName = "";
    }

    myTaps = 0;
    opponentTaps = 0;
    subPhase = "match_preview";
  }

  function onTapGo(data: { durationMs: number }) {
    if (!isInMatch) return;
    subPhase = "tapping";
    myTaps = 0;
    opponentTaps = 0;
    startTimer(data.durationMs);
  }

  function onTapConfirmed(data: { tapCount: number }) {
    // Authoritative tap count from server
    myTaps = data.tapCount;
  }

  function onTapCounts(data: {
    matchId: string;
    player1Id: string;
    player1Taps: number;
    player2Id: string;
    player2Taps: number;
  }) {
    if (data.matchId !== currentMatchId) return;
    const mySessionId = me?.id ?? "";
    if (mySessionId === data.player1Id) {
      opponentTaps = data.player2Taps;
    } else if (mySessionId === data.player2Id) {
      opponentTaps = data.player1Taps;
    } else {
      // Spectating — could show both
    }
  }

  function onTapTimer(data: {
    matchId: string;
    timeRemaining: number;
    player1Taps: number;
    player2Taps: number;
  }) {
    if (data.matchId !== currentMatchId) return;
    // Could sync timer from server if needed, but client timer is fine
  }

  function onMatchEnd(data: {
    matchId: string;
    player1Id: string;
    player1Taps: number;
    player2Id: string;
    player2Taps: number;
  }) {
    isInMatch = false;
    clearTimer();
    // Sync final counts
    const mySessionId = me?.id ?? "";
    if (mySessionId === data.player1Id) {
      myTaps = data.player1Taps;
      opponentTaps = data.player2Taps;
    } else if (mySessionId === data.player2Id) {
      myTaps = data.player2Taps;
      opponentTaps = data.player1Taps;
    }
  }

  function onMatchResult(data: {
    matchId: string;
    winnerId: string;
    winnerName: string;
    loserId: string;
    loserName: string;
    winnerTaps: number;
    loserTaps: number;
    durationMs: number;
  }) {
    subPhase = "match_result";
    resultWinnerId = data.winnerId;
    resultWinnerName = data.winnerName;
    resultLoserName = data.loserName;
    resultWinnerTaps = data.winnerTaps;
    resultLoserTaps = data.loserTaps;
    resultDurationMs = data.durationMs;

    const mySessionId = me?.id ?? "";
    iWon = data.winnerId === mySessionId;

    // If I lost, I'm eliminated
    if (data.loserId === mySessionId) {
      // Will show result first, then transition to eliminated
      setTimeout(() => {
        if (subPhase === "match_result" && !iWon) {
          subPhase = "eliminated";
        }
      }, 4000);
    }
  }

  function onBracketAdvance(data: { newRound: number }) {
    bracketRound = data.newRound;
    if (me?.isEliminated) {
      subPhase = "eliminated";
    } else {
      subPhase = "bracket_advance";
    }
  }

  function onTournamentComplete(data: {
    championId: string;
    championName: string;
    runnerUpId: string;
    runnerUpName: string;
  }) {
    subPhase = "tournament_complete";
    championId = data.championId;
    championName = data.championName;
    runnerUpName = data.runnerUpName;
  }

  function onRoundSkipped(data: { reason: string }) {
    roundSkipped = true;
    skipReason = data.reason;
  }

  // ── Lifecycle ───────────────────────────────────────────────────

  onMount(() => {
    room.onMessage("tap_bracket_init", onBracketInit);
    room.onMessage("tap_match_start", onMatchStart);
    room.onMessage("tap_go", onTapGo);
    room.onMessage("tap_confirmed", onTapConfirmed);
    room.onMessage("tap_counts", onTapCounts);
    room.onMessage("tap_timer", onTapTimer);
    room.onMessage("tap_match_end", onMatchEnd);
    room.onMessage("tap_match_result", onMatchResult);
    room.onMessage("tap_bracket_round_advance", onBracketAdvance);
    room.onMessage("tap_tournament_complete", onTournamentComplete);
    room.onMessage("round_skipped", onRoundSkipped);
  });

  onDestroy(() => {
    clearTimer();
  });

  // ── Derived ─────────────────────────────────────────────────────

  $: timerDisplay = Math.ceil(timeRemaining);
  $: timerPct = matchDurationMs > 0 ? (1 - timeRemaining / (matchDurationMs / 1000)) * 100 : 0;
  $: isWinning = myTaps > opponentTaps;
  $: isTied = myTaps === opponentTaps;
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-6 p-6" data-testid="tap-speed">

  {#if roundSkipped}
    <div class="text-center space-y-3">
      <h2 class="text-xl font-black text-yellow-400">Round Skipped</h2>
      <p class="text-gray-300">{skipReason}</p>
    </div>

  {:else if subPhase === "waiting" || subPhase === "bracket_init"}
    <div class="text-center space-y-4">
      <h2 class="text-3xl font-black text-cyan-400">Tap Speed</h2>
      <p class="text-gray-300">1v1 Bracket Tournament</p>
      {#if totalPlayers > 0}
        <p class="text-sm text-gray-500">{totalPlayers} players, {totalBracketRounds} rounds</p>
      {/if}
      <p class="text-gray-400 text-sm">Waiting for your first match...</p>
    </div>

  {:else if subPhase === "match_preview"}
    <div class="text-center space-y-4">
      <p class="text-xs text-gray-500 uppercase tracking-widest">Round {bracketRound}</p>
      {#if isInMatch}
        <h2 class="text-2xl font-black text-cyan-400">Your Match!</h2>
        <div class="flex items-center gap-4">
          <div class="text-center">
            <p class="text-lg font-bold text-white">{me?.name ?? "You"}</p>
          </div>
          <p class="text-2xl font-black text-gray-500">VS</p>
          <div class="text-center">
            <p class="text-lg font-bold text-white">{opponentName}</p>
          </div>
        </div>
        <p class="text-gray-400 text-sm">Get ready to tap!</p>
      {:else}
        <h2 class="text-xl font-bold text-gray-400">Spectating</h2>
        <p class="text-gray-500 text-sm">Watch the TV for live action!</p>
      {/if}
    </div>

  {:else if subPhase === "tapping"}
    <!-- Main tapping interface -->
    <div class="w-full max-w-sm text-center space-y-4">
      <!-- Timer bar -->
      <div class="w-full h-3 bg-gray-700 rounded-full overflow-hidden">
        <div
          class="h-full rounded-full transition-all duration-100
            {timeRemaining < 3 ? 'bg-red-500' : timeRemaining < 7 ? 'bg-yellow-500' : 'bg-cyan-500'}"
          style="width:{100 - timerPct}%"
        ></div>
      </div>
      <p class="text-4xl font-mono font-black {timeRemaining < 3 ? 'text-red-400' : 'text-white'}">
        {timerDisplay}
      </p>

      <!-- Score comparison -->
      <div class="flex justify-between items-center px-4">
        <div class="text-center">
          <p class="text-xs text-gray-500 uppercase">You</p>
          <p class="text-3xl font-black {isWinning ? 'text-green-400' : isTied ? 'text-white' : 'text-red-400'}">
            {myTaps}
          </p>
        </div>
        <p class="text-lg text-gray-600">vs</p>
        <div class="text-center">
          <p class="text-xs text-gray-500 uppercase">{opponentName}</p>
          <p class="text-3xl font-black text-gray-400">{opponentTaps}</p>
        </div>
      </div>

      <!-- TAP BUTTON -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        class="w-full aspect-square max-w-[280px] mx-auto rounded-3xl flex items-center justify-center select-none
          bg-gradient-to-br from-cyan-500 to-blue-600 active:from-cyan-600 active:to-blue-700
          shadow-lg active:shadow-md active:scale-[0.97] transition-transform duration-75 cursor-pointer"
        on:touchstart|preventDefault={handleTap}
        on:mousedown={handleTap}
      >
        <div class="text-center pointer-events-none">
          <p class="text-6xl font-black text-white">{myTaps}</p>
          <p class="text-sm font-bold text-cyan-100 uppercase tracking-widest mt-2">TAP!</p>
        </div>
      </div>
    </div>

  {:else if subPhase === "match_result"}
    <div class="text-center space-y-4">
      <p class="text-xs text-gray-500 uppercase tracking-widest">Match Result</p>
      {#if iWon}
        <h2 class="text-3xl font-black text-green-400">You Win!</h2>
      {:else}
        <h2 class="text-3xl font-black text-red-400">You Lost</h2>
      {/if}

      <div class="flex justify-center items-center gap-6">
        <div class="text-center">
          <p class="text-sm text-gray-400">{resultWinnerName}</p>
          <p class="text-4xl font-black text-green-400">{resultWinnerTaps}</p>
          <p class="text-xs text-gray-500">taps</p>
        </div>
        <p class="text-gray-600 text-lg">vs</p>
        <div class="text-center">
          <p class="text-sm text-gray-400">{resultLoserName}</p>
          <p class="text-4xl font-black text-red-400">{resultLoserTaps}</p>
          <p class="text-xs text-gray-500">taps</p>
        </div>
      </div>

      <p class="text-sm text-gray-500">
        {(resultDurationMs / 1000).toFixed(1)}s match
      </p>
    </div>

  {:else if subPhase === "bracket_advance"}
    <div class="text-center space-y-4">
      <h2 class="text-2xl font-black text-cyan-400">Next Round!</h2>
      <p class="text-gray-300">Round {bracketRound} starting...</p>
      <p class="text-sm text-gray-500">Get ready for your next match!</p>
    </div>

  {:else if subPhase === "eliminated"}
    <div class="text-center space-y-4">
      <h2 class="text-2xl font-black text-gray-400">Eliminated</h2>
      <p class="text-gray-500">Watch the remaining matches on TV!</p>
      <p class="text-sm text-gray-600">Your score: {me?.score ?? 0}</p>
    </div>

  {:else if subPhase === "tournament_complete"}
    <div class="text-center space-y-4">
      <p class="text-xs text-gray-500 uppercase tracking-widest">Champion</p>
      <h2 class="text-4xl font-black text-yellow-400">{championName}</h2>
      {#if runnerUpName}
        <p class="text-gray-400">Runner-up: {runnerUpName}</p>
      {/if}
      {#if championId === me?.id}
        <p class="text-2xl text-yellow-300 font-bold">That's you!</p>
      {/if}
      <p class="text-sm text-gray-500">Your final score: {me?.score ?? 0}</p>
    </div>
  {/if}
</div>
