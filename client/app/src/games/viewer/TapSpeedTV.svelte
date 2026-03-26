<script lang="ts">
  /**
   * TV game component for "Tap Speed" (registry-03).
   *
   * Displays the bracket visualization, live match counts, and results.
   *
   * Server messages listened:
   *   tap_bracket_init, tap_match_start, tap_go,
   *   tap_counts, tap_timer, tap_match_timer_start,
   *   tap_match_end, tap_match_result,
   *   tap_bracket_round_advance, tap_tournament_complete, round_skipped
   */
  import { onMount, onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState } from "../../../../shared/types";

  export let room: Room;
  export let state: RoomState;

  // ── Sub-phase state ──────────────────────────────────────────────

  type SubPhase =
    | "waiting"
    | "bracket_overview"
    | "match_preview"
    | "countdown"
    | "match_live"
    | "match_result"
    | "bracket_advance"
    | "tournament_complete";

  let subPhase: SubPhase = "waiting";

  // ── Bracket info ─────────────────────────────────────────────────

  let totalPlayers = 0;
  let totalBracketRounds = 0;

  // ── Live match ───────────────────────────────────────────────────

  let matchId = "";
  let player1Id = "";
  let player1Name = "";
  let player2Id = "";
  let player2Name = "";
  let player1Taps = 0;
  let player2Taps = 0;
  let currentBracketRound = 0;
  let timeRemaining = 0;
  let matchDurationMs = 0;
  let matchEndsAt = 0;
  let timerInterval: ReturnType<typeof setInterval> | null = null;

  // ── Match result ─────────────────────────────────────────────────

  let resultWinnerId = "";
  let resultWinnerName = "";
  let resultLoserName = "";
  let resultWinnerTaps = 0;
  let resultLoserTaps = 0;
  let resultDurationSecs = 0;

  // ── Tournament ───────────────────────────────────────────────────

  let championId = "";
  let championName = "";
  let runnerUpName = "";

  // ── Match history ────────────────────────────────────────────────

  interface MatchRecord {
    winnerName: string;
    loserName: string;
    winnerTaps: number;
    loserTaps: number;
    bracketRound: number;
  }
  let matchHistory: MatchRecord[] = [];

  // ── Round skipped ────────────────────────────────────────────────

  let roundSkipped = false;
  let skipReason = "";

  // ── Countdown ──────────────────────────────────────────────────

  let countdownValue = 0;
  let countdownInterval: ReturnType<typeof setInterval> | null = null;

  // ── Timer ───────────────────────────────────────────────────────

  function startTimer() {
    clearTimer();
    timerInterval = setInterval(() => {
      timeRemaining = Math.max(0, (matchEndsAt - Date.now()) / 1000);
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
    subPhase = "bracket_overview";
    totalPlayers = data.totalPlayers;
    totalBracketRounds = data.totalRounds;
    matchHistory = [];
  }

  function onMatchStart(data: {
    matchId: string;
    player1Id: string;
    player1Name: string;
    player2Id: string;
    player2Name: string;
    bracketRound: number;
  }) {
    subPhase = "match_preview";
    matchId = data.matchId;
    player1Id = data.player1Id;
    player1Name = data.player1Name;
    player2Id = data.player2Id;
    player2Name = data.player2Name;
    player1Taps = 0;
    player2Taps = 0;
    currentBracketRound = data.bracketRound;
  }

  function onMatchTimerStart(data: {
    matchId: string;
    durationMs: number;
    endsAt: number;
  }) {
    subPhase = "match_live";
    matchDurationMs = data.durationMs;
    matchEndsAt = data.endsAt;
    timeRemaining = data.durationMs / 1000;
    startTimer();
  }

  function onTapCounts(data: {
    matchId: string;
    player1Id: string;
    player1Taps: number;
    player2Id: string;
    player2Taps: number;
  }) {
    if (data.matchId !== matchId) return;
    player1Taps = data.player1Taps;
    player2Taps = data.player2Taps;
  }

  function onTapTimer(data: {
    matchId: string;
    timeRemaining: number;
    player1Taps: number;
    player2Taps: number;
  }) {
    if (data.matchId !== matchId) return;
    player1Taps = data.player1Taps;
    player2Taps = data.player2Taps;
  }

  function onMatchEnd(data: {
    matchId: string;
    player1Id: string;
    player1Taps: number;
    player2Id: string;
    player2Taps: number;
  }) {
    clearTimer();
    player1Taps = data.player1Taps;
    player2Taps = data.player2Taps;
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
    resultDurationSecs = data.durationMs / 1000;

    matchHistory = [...matchHistory, {
      winnerName: data.winnerName,
      loserName: data.loserName,
      winnerTaps: data.winnerTaps,
      loserTaps: data.loserTaps,
      bracketRound: currentBracketRound,
    }];
  }

  function onBracketAdvance(data: { newRound: number }) {
    subPhase = "bracket_advance";
    currentBracketRound = data.newRound;
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

  function onCountdown(data: { seconds: number }) {
    countdownValue = data.seconds;
    subPhase = "countdown";
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
      countdownValue--;
      if (countdownValue <= 0) {
        if (countdownInterval) {
          clearInterval(countdownInterval);
          countdownInterval = null;
        }
      }
    }, 1000);
  }

  // ── Lifecycle ───────────────────────────────────────────────────

  onMount(() => {
    room.onMessage("tap_bracket_init", onBracketInit);
    room.onMessage("tap_match_start", onMatchStart);
    room.onMessage("tap_countdown", onCountdown);
    room.onMessage("tap_match_timer_start", onMatchTimerStart);
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
    if (countdownInterval) clearInterval(countdownInterval);
  });

  // ── Derived ─────────────────────────────────────────────────────

  $: sortedPlayers = [...state.players.values()].sort((a, b) => b.score - a.score);
  $: timerDisplay = Math.ceil(timeRemaining);
  $: timerPct = matchDurationMs > 0 ? (1 - timeRemaining / (matchDurationMs / 1000)) * 100 : 0;
  $: p1Leading = player1Taps > player2Taps;
  $: p2Leading = player2Taps > player1Taps;
  $: maxTaps = Math.max(player1Taps, player2Taps, 1);
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-8 p-10" data-testid="tap-speed-tv">

  <!-- Title bar -->
  <p class="text-sm text-gray-400 uppercase tracking-widest">
    Tap Speed &mdash; Bracket Tournament
  </p>

  {#if roundSkipped}
    <div class="text-center space-y-4">
      <h1 class="text-3xl font-black text-yellow-400">Round Skipped</h1>
      <p class="text-xl text-gray-300">{skipReason}</p>
    </div>

  {:else if subPhase === "waiting" || subPhase === "bracket_overview"}
    <div class="text-center space-y-6">
      <h1 class="text-5xl font-black text-cyan-400">Tap Speed</h1>
      <p class="text-2xl text-gray-300">1v1 Bracket Tournament</p>
      {#if totalPlayers > 0}
        <p class="text-lg text-gray-400">
          {totalPlayers} players &bull; {totalBracketRounds} elimination rounds
        </p>
      {/if}

      <!-- Player roster -->
      <div class="flex gap-3 justify-center flex-wrap">
        {#each sortedPlayers as p}
          <div class="px-4 py-2 bg-gray-800 rounded-lg text-center">
            <p class="font-semibold text-white">{p.name}</p>
          </div>
        {/each}
      </div>
    </div>

  {:else if subPhase === "match_preview"}
    <!-- Match announcement -->
    <div class="text-center space-y-8 w-full max-w-3xl">
      <p class="text-sm text-gray-500 uppercase tracking-widest">
        Round {currentBracketRound} &mdash; Next Match
      </p>

      <div class="flex items-center justify-center gap-12">
        <div class="text-center space-y-2">
          <div class="w-24 h-24 rounded-full bg-cyan-900 border-4 border-cyan-500 flex items-center justify-center">
            <span class="text-3xl font-black text-cyan-300">
              {player1Name.charAt(0).toUpperCase()}
            </span>
          </div>
          <p class="text-xl font-bold text-white">{player1Name}</p>
        </div>

        <div class="text-center">
          <p class="text-5xl font-black text-gray-500">VS</p>
        </div>

        <div class="text-center space-y-2">
          <div class="w-24 h-24 rounded-full bg-orange-900 border-4 border-orange-500 flex items-center justify-center">
            <span class="text-3xl font-black text-orange-300">
              {player2Name.charAt(0).toUpperCase()}
            </span>
          </div>
          <p class="text-xl font-bold text-white">{player2Name}</p>
        </div>
      </div>
    </div>

  {:else if subPhase === "countdown"}
    <!-- Countdown before match -->
    <div class="text-center space-y-8 w-full max-w-3xl">
      <p class="text-sm text-gray-500 uppercase tracking-widest">
        Round {currentBracketRound}
      </p>

      <div class="flex items-center justify-center gap-12">
        <div class="text-center space-y-2">
          <div class="w-24 h-24 rounded-full bg-cyan-900 border-4 border-cyan-500 flex items-center justify-center">
            <span class="text-3xl font-black text-cyan-300">
              {player1Name.charAt(0).toUpperCase()}
            </span>
          </div>
          <p class="text-xl font-bold text-white">{player1Name}</p>
        </div>

        <div class="text-center">
          <p class="text-9xl font-black {countdownValue > 0 ? 'text-cyan-400 animate-pulse' : 'text-green-400'}">{countdownValue > 0 ? countdownValue : 'GO!'}</p>
        </div>

        <div class="text-center space-y-2">
          <div class="w-24 h-24 rounded-full bg-orange-900 border-4 border-orange-500 flex items-center justify-center">
            <span class="text-3xl font-black text-orange-300">
              {player2Name.charAt(0).toUpperCase()}
            </span>
          </div>
          <p class="text-xl font-bold text-white">{player2Name}</p>
        </div>
      </div>
    </div>

  {:else if subPhase === "match_live"}
    <!-- Live match view -->
    <div class="w-full max-w-4xl space-y-6">
      <!-- Timer -->
      <div class="text-center">
        <p class="text-8xl font-mono font-black {timeRemaining < 3 ? 'text-red-400 animate-pulse' : 'text-white'}">
          {timerDisplay}
        </p>
        <div class="w-full h-3 bg-gray-700 rounded-full overflow-hidden mt-4">
          <div
            class="h-full rounded-full transition-all duration-100
              {timeRemaining < 3 ? 'bg-red-500' : timeRemaining < 7 ? 'bg-yellow-500' : 'bg-cyan-500'}"
            style="width:{100 - timerPct}%"
          ></div>
        </div>
      </div>

      <!-- Tap battle visualization -->
      <div class="flex items-end justify-center gap-8">
        <!-- Player 1 -->
        <div class="flex-1 text-center space-y-3">
          <p class="text-lg font-bold {p1Leading ? 'text-cyan-400' : 'text-white'}">{player1Name}</p>
          <div class="relative h-64 bg-gray-800 rounded-xl overflow-hidden mx-auto w-full max-w-[200px]">
            <div
              class="absolute bottom-0 left-0 right-0 rounded-t-lg transition-all duration-150
                {p1Leading ? 'bg-gradient-to-t from-cyan-600 to-cyan-400' : 'bg-gradient-to-t from-gray-600 to-gray-500'}"
              style="height:{(player1Taps / maxTaps) * 100}%"
            ></div>
            <div class="absolute inset-0 flex items-center justify-center">
              <span class="text-5xl font-black text-white drop-shadow-lg">{player1Taps}</span>
            </div>
          </div>
        </div>

        <!-- VS -->
        <div class="flex-shrink-0 pb-32">
          <p class="text-2xl font-black text-gray-600">VS</p>
        </div>

        <!-- Player 2 -->
        <div class="flex-1 text-center space-y-3">
          <p class="text-lg font-bold {p2Leading ? 'text-orange-400' : 'text-white'}">{player2Name}</p>
          <div class="relative h-64 bg-gray-800 rounded-xl overflow-hidden mx-auto w-full max-w-[200px]">
            <div
              class="absolute bottom-0 left-0 right-0 rounded-t-lg transition-all duration-150
                {p2Leading ? 'bg-gradient-to-t from-orange-600 to-orange-400' : 'bg-gradient-to-t from-gray-600 to-gray-500'}"
              style="height:{(player2Taps / maxTaps) * 100}%"
            ></div>
            <div class="absolute inset-0 flex items-center justify-center">
              <span class="text-5xl font-black text-white drop-shadow-lg">{player2Taps}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

  {:else if subPhase === "match_result"}
    <!-- Match result -->
    <div class="text-center space-y-6 w-full max-w-3xl">
      <h1 class="text-4xl font-black text-green-400">{resultWinnerName} Wins!</h1>

      <div class="flex items-center justify-center gap-12">
        <div class="text-center space-y-1">
          <p class="text-sm text-green-400 uppercase tracking-widest">Winner</p>
          <p class="text-xl font-bold text-white">{resultWinnerName}</p>
          <p class="text-5xl font-black text-green-400">{resultWinnerTaps}</p>
          <p class="text-xs text-gray-500">taps</p>
        </div>

        <p class="text-2xl text-gray-600">vs</p>

        <div class="text-center space-y-1">
          <p class="text-sm text-red-400 uppercase tracking-widest">Eliminated</p>
          <p class="text-xl font-bold text-gray-400">{resultLoserName}</p>
          <p class="text-5xl font-black text-red-400">{resultLoserTaps}</p>
          <p class="text-xs text-gray-500">taps</p>
        </div>
      </div>

      <p class="text-gray-500">{resultDurationSecs.toFixed(1)}s match</p>

      <!-- Recent match history -->
      {#if matchHistory.length > 1}
        <div class="bg-gray-800 rounded-xl p-4 max-w-md mx-auto">
          <p class="text-xs text-gray-400 uppercase tracking-widest mb-2">Match History</p>
          <div class="space-y-1">
            {#each matchHistory as m, i}
              <div class="flex items-center gap-2 text-sm">
                <span class="w-5 text-gray-500 font-mono">{i + 1}.</span>
                <span class="flex-1 text-white font-semibold">{m.winnerName}</span>
                <span class="text-green-400 font-mono">{m.winnerTaps}</span>
                <span class="text-gray-600">-</span>
                <span class="text-red-400 font-mono">{m.loserTaps}</span>
                <span class="flex-1 text-right text-gray-400">{m.loserName}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>

  {:else if subPhase === "bracket_advance"}
    <div class="text-center space-y-6">
      <h1 class="text-4xl font-black text-cyan-400">Round {currentBracketRound}!</h1>
      <p class="text-xl text-gray-300">Next round of matches starting...</p>

      <!-- Remaining players -->
      <div class="flex gap-3 justify-center flex-wrap">
        {#each sortedPlayers.filter(p => !p.isEliminated) as p}
          <div class="px-4 py-2 bg-cyan-900 border border-cyan-600 rounded-lg text-center">
            <p class="font-semibold text-white">{p.name}</p>
            <p class="text-xs text-cyan-400">{p.score} pts</p>
          </div>
        {/each}
      </div>

      <!-- Eliminated players -->
      {#if sortedPlayers.filter(p => p.isEliminated).length > 0}
        <div>
          <p class="text-xs text-gray-500 uppercase tracking-widest mb-2">Eliminated</p>
          <div class="flex gap-2 justify-center flex-wrap">
            {#each sortedPlayers.filter(p => p.isEliminated) as p}
              <div class="px-3 py-1 bg-gray-800 rounded-lg text-gray-500 text-sm">{p.name}</div>
            {/each}
          </div>
        </div>
      {/if}
    </div>

  {:else if subPhase === "tournament_complete"}
    <div class="text-center space-y-8 w-full max-w-3xl">
      <p class="text-sm text-yellow-400 uppercase tracking-widest">Tournament Complete</p>
      <h1 class="text-6xl font-black text-yellow-400">{championName}</h1>
      <p class="text-2xl text-gray-300">is the Champion!</p>

      {#if runnerUpName}
        <p class="text-lg text-gray-400">Runner-up: <span class="text-white font-bold">{runnerUpName}</span></p>
      {/if}

      <!-- Final match history -->
      {#if matchHistory.length > 0}
        <div class="bg-gray-800 rounded-xl p-6 max-w-lg mx-auto">
          <p class="text-xs text-gray-400 uppercase tracking-widest mb-3">All Matches</p>
          <div class="space-y-1">
            {#each matchHistory as m, i}
              <div class="flex items-center gap-2 text-sm">
                <span class="w-5 text-gray-500 font-mono">{i + 1}.</span>
                <span class="flex-1 text-white font-semibold">{m.winnerName}</span>
                <span class="text-green-400 font-mono">{m.winnerTaps}</span>
                <span class="text-gray-600">-</span>
                <span class="text-red-400 font-mono">{m.loserTaps}</span>
                <span class="flex-1 text-right text-gray-400">{m.loserName}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Final standings -->
      <div class="bg-gray-800 rounded-xl p-6 max-w-lg mx-auto">
        <p class="text-xs text-gray-400 uppercase tracking-widest mb-3">Final Standings</p>
        <div class="space-y-1">
          {#each sortedPlayers as p, i}
            <div class="flex items-center gap-3">
              <span class="w-6 text-center text-gray-500 font-mono text-sm">{i + 1}.</span>
              <span class="flex-1 truncate font-semibold {p.id === championId ? 'text-yellow-400' : 'text-white'}">
                {p.name}
                {#if p.id === championId}
                  <span class="text-yellow-400 text-xs ml-1">Champion</span>
                {/if}
              </span>
              <span class="font-mono text-lg font-bold text-white">{p.score}</span>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>
