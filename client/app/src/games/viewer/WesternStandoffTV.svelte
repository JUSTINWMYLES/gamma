<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState } from "../../../../shared/types";
  import PlayerIcon from "../../components/PlayerIcon.svelte";

  export let room: Room;
  export let state: RoomState;

  type SubPhase = "waiting" | "preview" | "calibrating" | "countdown" | "draw" | "result" | "between_rounds" | "skipped" | "champion";

  interface Unsubscribe {
    (): void;
  }

  let subPhase: SubPhase = "waiting";
  let player1Id = "";
  let player2Id = "";
  let player1Name = "";
  let player2Name = "";
  let bracketRound = 0;
  let totalPlayers = 0;
  let totalRounds = 0;
  let remainingPlayers = 0;
  let readyCount = 0;
  let totalCount = 2;
  let countdownValue = 0;
  let timeRemaining = 0;
  let championId = "";
  let championName = "";
  let runnerUpName = "";
  let resultWinnerId = "";
  let resultWinnerName = "";
  let resultLoserName = "";
  let resultReason = "";
  let reactionMs = 0;
  let lastWinnerName = "";
  let isPractice = false;
  let skipReason = "";
  let interRoundMessage = "";

  let countdownInterval: ReturnType<typeof setInterval> | null = null;
  let timerInterval: ReturnType<typeof setInterval> | null = null;
  let drawEndsAt = 0;
  let music: HTMLAudioElement | null = null;
  let unsubs: Unsubscribe[] = [];

  function clearCountdown() {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  }

  function clearTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function syncMusic(shouldPlay: boolean) {
    if (!music) return;
    if (shouldPlay) {
      music.play().catch(() => {});
    } else {
      music.pause();
      music.currentTime = 0;
    }
  }

  function clearAllTimers() {
    clearCountdown();
    clearTimer();
  }

  function handleBracketInit(data: { totalPlayers: number; totalRounds: number }) {
    clearAllTimers();
    subPhase = "waiting";
    totalPlayers = data.totalPlayers;
    totalRounds = data.totalRounds;
    remainingPlayers = data.totalPlayers;
    bracketRound = 0;
    isPractice = false;
    skipReason = "";
    interRoundMessage = "";
  }

  function handlePreview(data: {
    player1Id: string;
    player1Name: string;
    player2Id: string;
    player2Name: string;
    bracketRound: number;
    isPractice: boolean;
  }) {
    clearAllTimers();
    subPhase = "preview";
    player1Id = data.player1Id;
    player2Id = data.player2Id;
    player1Name = data.player1Name;
    player2Name = data.player2Name;
    bracketRound = data.bracketRound;
    isPractice = data.isPractice;
    skipReason = "";
    interRoundMessage = "";
    resultWinnerId = "";
    resultWinnerName = "";
    resultLoserName = "";
    resultReason = "";
    reactionMs = 0;
    lastWinnerName = "";
  }

  function handleCalibrating() {
    clearAllTimers();
    subPhase = "calibrating";
    readyCount = 0;
    totalCount = 2;
  }

  function handleReady(data: { readyCount: number; totalCount: number }) {
    readyCount = data.readyCount;
    totalCount = data.totalCount;
  }

  function handleCountdown(data: { seconds: number }) {
    clearTimer();
    subPhase = "countdown";
    countdownValue = data.seconds;
    clearCountdown();
    countdownInterval = setInterval(() => {
      countdownValue = Math.max(0, countdownValue - 1);
      if (countdownValue <= 0) clearCountdown();
    }, 1000);
  }

  function handleDraw(data: { timeoutMs: number }) {
    clearCountdown();
    subPhase = "draw";
    drawEndsAt = Date.now() + data.timeoutMs;
    timeRemaining = data.timeoutMs / 1000;
    clearTimer();
    timerInterval = setInterval(() => {
      const remaining = Math.max(0, drawEndsAt - Date.now());
      timeRemaining = remaining / 1000;
      if (remaining <= 0) clearTimer();
    }, 50);
  }

  function handleResult(data: {
    winnerId: string;
    winnerName: string;
    loserName: string;
    reason: string;
    reactionMs: number;
  }) {
    clearCountdown();
    clearTimer();
    subPhase = "result";
    resultWinnerId = data.winnerId;
    resultWinnerName = data.winnerName;
    resultLoserName = data.loserName;
    resultReason = data.reason;
    reactionMs = data.reactionMs;
    lastWinnerName = data.winnerName;
  }

  function handleRoundAdvance(data: { newRound: number; remainingPlayers: number }) {
    clearAllTimers();
    subPhase = "between_rounds";
    bracketRound = data.newRound;
    remainingPlayers = data.remainingPlayers;
    isPractice = false;
    skipReason = "";
    interRoundMessage = `Round ${data.newRound} is forming. ${data.remainingPlayers} duelists remain in contention.`;
  }

  function handleRoundSkipped(data: { reason: string }) {
    clearAllTimers();
    subPhase = "skipped";
    skipReason = data.reason;
    interRoundMessage = "";
    isPractice = false;
  }

  function handleChampion(data: {
    championId: string;
    championName: string;
    runnerUpName: string;
  }) {
    clearAllTimers();
    clearTimer();
    subPhase = "champion";
    championId = data.championId;
    championName = data.championName;
    runnerUpName = data.runnerUpName;
  }

  onMount(() => {
    music = new Audio("/le_grand_chase.mp3");
    music.loop = true;
    music.volume = 0.22;

    unsubs = [
      room.onMessage("standoff_bracket_init", handleBracketInit),
      room.onMessage("standoff_match_preview", handlePreview),
      room.onMessage("standoff_calibrate_start", handleCalibrating),
      room.onMessage("standoff_ready", handleReady),
      room.onMessage("standoff_paces_countdown", handleCountdown),
      room.onMessage("standoff_draw", handleDraw),
      room.onMessage("standoff_match_result", handleResult),
      room.onMessage("standoff_bracket_round_advance", handleRoundAdvance),
      room.onMessage("standoff_tournament_complete", handleChampion),
      room.onMessage("round_skipped", handleRoundSkipped),
    ];
  });

  onDestroy(() => {
    clearAllTimers();
    syncMusic(false);
    for (const unsub of unsubs) unsub();
    unsubs = [];
    music = null;
  });

  $: sortedPlayers = [...state.players.values()].sort((a, b) => b.score - a.score);
  $: player1 = state.players.get(player1Id);
  $: player2 = state.players.get(player2Id);
  $: syncMusic(subPhase === "preview" || subPhase === "calibrating" || subPhase === "countdown" || subPhase === "draw");
</script>

<div class="flex flex-1 flex-col bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.18),transparent_35%),linear-gradient(180deg,#1c0f07_0%,#09090b_100%)] p-10 text-white" data-testid="western-standoff-tv">
  <div class="mb-8 flex items-start justify-between">
    <div>
      <p class="text-sm uppercase tracking-[0.4em] text-amber-300">Western Standoff</p>
      <h1 class="mt-2 text-5xl font-black text-white">Bracket Showdown</h1>
      {#if totalPlayers > 0}
        <p class="mt-3 text-base font-medium text-amber-50/95">{totalPlayers} duelists • {Math.max(1, totalRounds)} rounds • TV follows the full bracket live</p>
      {/if}
    </div>
    <div class="grid gap-3 text-right">
      <div class="rounded-2xl border border-amber-400/25 bg-black/45 px-5 py-3">
        <p class="text-xs uppercase tracking-widest text-amber-200">Stage</p>
        <p class="text-2xl font-black text-white">{isPractice ? "Practice" : bracketRound || "Waiting"}</p>
      </div>
      {#if remainingPlayers > 0 && !isPractice}
        <div class="rounded-2xl border border-white/10 bg-black/35 px-5 py-3">
          <p class="text-xs uppercase tracking-widest text-amber-200">Still standing</p>
          <p class="text-2xl font-black text-white">{remainingPlayers}</p>
        </div>
      {/if}
    </div>
  </div>

  {#if subPhase === "waiting"}
    <div class="flex flex-1 items-center justify-center text-center">
      <div class="space-y-4 rounded-[2.5rem] border border-amber-400/30 bg-black/45 px-12 py-10 shadow-2xl">
        <h2 class="text-5xl font-black text-amber-300">Awaiting Duelists</h2>
        <p class="text-xl text-amber-50/95">Phones load the standoff while the bracket prepares the next duel.</p>
        {#if totalPlayers > 0}
          <p class="text-base text-amber-100/90">The showdown is ready for {totalPlayers} players across {Math.max(1, totalRounds)} rounds.</p>
        {/if}
      </div>
    </div>

  {:else if subPhase === "preview" || subPhase === "calibrating" || subPhase === "countdown" || subPhase === "draw" || subPhase === "result"}
    <div class="grid flex-1 grid-cols-[1fr_auto_1fr] items-center gap-10">
      <div class="rounded-[2rem] border border-cyan-300/30 bg-black/45 p-8 text-center shadow-2xl">
        {#if player1}
          <div class="mb-4 flex justify-center"><PlayerIcon player={player1} size={72} /></div>
        {/if}
        <p class="text-4xl font-black text-cyan-200">{player1Name}</p>
      </div>

      <div class="text-center">
        {#if subPhase === "preview"}
          <p class="text-sm uppercase tracking-[0.4em] text-amber-200">{isPractice ? "Practice Duel" : "Up Next"}</p>
          <p class="mt-4 text-7xl font-black text-white">VS</p>
          <p class="mt-4 text-xl text-amber-50/95">Stand back-to-back and get set.</p>
        {:else if subPhase === "calibrating"}
          <p class="text-sm uppercase tracking-[0.4em] text-amber-200">Calibrating</p>
          <p class="mt-4 text-7xl font-black text-white">{readyCount}/{totalCount}</p>
          <p class="mt-4 text-xl text-amber-50/95">Lock your facing direction</p>
        {:else if subPhase === "countdown"}
          <p class="text-sm uppercase tracking-[0.4em] text-amber-200">Take Three Paces</p>
          <p class="mt-4 text-8xl font-black text-white">{countdownValue > 0 ? countdownValue : "DRAW"}</p>
        {:else if subPhase === "draw"}
          <p class="text-sm uppercase tracking-[0.4em] text-red-300">Draw!</p>
          <p class="mt-4 text-8xl font-black {timeRemaining < 2 ? 'text-red-400' : 'text-white'}">{Math.ceil(timeRemaining)}</p>
          <p class="mt-4 text-xl text-amber-50/95">Turn, aim, fire</p>
        {:else if subPhase === "result"}
          <p class="text-sm uppercase tracking-[0.4em] text-green-300">Winner</p>
          <p class="mt-4 text-5xl font-black text-white">{resultWinnerName}</p>
          {#if reactionMs > 0}
            <p class="mt-4 text-xl text-amber-100">Reaction {(reactionMs / 1000).toFixed(2)}s</p>
          {/if}
          <p class="mt-4 text-sm uppercase tracking-widest text-amber-300">{resultReason}</p>
        {/if}
      </div>

      <div class="rounded-[2rem] border border-orange-300/30 bg-black/45 p-8 text-center shadow-2xl">
        {#if player2}
          <div class="mb-4 flex justify-center"><PlayerIcon player={player2} size={72} /></div>
        {/if}
        <p class="text-4xl font-black text-orange-200">{player2Name}</p>
      </div>
    </div>

    {#if subPhase === "result"}
      <div class="mt-6 text-center text-lg text-amber-50/95">{resultLoserName} is out of this duel.</div>
    {/if}

  {:else if subPhase === "between_rounds"}
    <div class="flex flex-1 items-center justify-center text-center">
      <div class="max-w-4xl space-y-6 rounded-[2.5rem] border border-amber-400/30 bg-black/50 px-12 py-10 shadow-2xl">
        <p class="text-sm uppercase tracking-[0.45em] text-amber-200">Intermission</p>
        <h2 class="text-6xl font-black text-white">Round {bracketRound}</h2>
        <p class="text-2xl text-amber-50/95">{interRoundMessage}</p>
        {#if lastWinnerName}
          <div class="inline-flex rounded-full border border-green-400/30 bg-green-500/15 px-5 py-2 text-base font-semibold text-green-100">
            Last duel winner: {lastWinnerName}
          </div>
        {/if}
      </div>
    </div>

  {:else if subPhase === "skipped"}
    <div class="flex flex-1 items-center justify-center text-center">
      <div class="max-w-4xl space-y-6 rounded-[2.5rem] border border-amber-300/35 bg-black/55 px-12 py-10 shadow-2xl">
        <p class="text-sm uppercase tracking-[0.45em] text-amber-200">Town Notice</p>
        <h2 class="text-6xl font-black text-amber-100">Round Skipped</h2>
        <p class="text-2xl text-amber-50/95">{skipReason}</p>
      </div>
    </div>

  {:else if subPhase === "champion"}
    <div class="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <p class="text-sm uppercase tracking-[0.5em] text-yellow-300">Champion</p>
      <h2 class="text-7xl font-black text-yellow-200">{championName}</h2>
      {#if runnerUpName}
        <p class="text-2xl text-amber-50/95">Runner-up: {runnerUpName}</p>
      {/if}
      <div class="mt-6 w-full max-w-xl rounded-[2rem] border border-amber-500/25 bg-black/45 p-6">
        <p class="mb-4 text-xs uppercase tracking-widest text-amber-300">Final standings</p>
        <div class="space-y-3">
          {#each sortedPlayers as player, index}
            <div class="flex items-center gap-4 rounded-2xl bg-white/5 px-4 py-3">
              <span class="w-8 text-center font-mono text-sm text-amber-200">{index + 1}.</span>
              <PlayerIcon player={player} size={28} />
              <span class="flex-1 truncate text-left text-lg {player.id === championId ? 'font-black text-yellow-200' : 'text-white'}">{player.name}</span>
              <span class="font-mono text-lg text-amber-100">{player.score}</span>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  {#if subPhase !== "champion"}
    <div class="mt-8 grid grid-cols-2 gap-6">
      <div class="rounded-3xl border border-amber-500/20 bg-black/35 p-5">
        <p class="mb-3 text-xs uppercase tracking-widest text-amber-300">Leaderboard</p>
        <div class="space-y-2">
          {#each sortedPlayers.slice(0, 6) as player, index}
            <div class="flex items-center gap-3 rounded-2xl bg-white/5 px-3 py-2">
              <span class="w-6 text-center font-mono text-xs text-amber-200">{index + 1}.</span>
              <PlayerIcon player={player} size={24} />
              <span class="flex-1 truncate text-sm text-white">{player.name}</span>
              <span class="font-mono text-sm text-amber-100">{player.score}</span>
            </div>
          {/each}
        </div>
      </div>

      <div class="rounded-3xl border border-amber-500/20 bg-black/35 p-5">
        <p class="mb-3 text-xs uppercase tracking-widest text-amber-300">Town bulletin</p>
        <div class="space-y-3 text-left text-amber-50/95">
          <p><span class="font-black text-white">Arena:</span> Face away, take three paces, then turn on the draw.</p>
          <p><span class="font-black text-white">Shot rules:</span> Only fully turned, landscape draw poses count.</p>
          {#if subPhase === "between_rounds" && interRoundMessage}
            <p><span class="font-black text-white">Bracket:</span> {interRoundMessage}</p>
          {/if}
          {#if subPhase === "skipped" && skipReason}
            <p><span class="font-black text-white">Notice:</span> {skipReason}</p>
          {/if}
          {#if lastWinnerName}
            <p><span class="font-black text-white">Last duel:</span> {lastWinnerName} won the draw.</p>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>
