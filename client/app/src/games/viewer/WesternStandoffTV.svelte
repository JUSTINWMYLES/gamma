<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState } from "../../../../shared/types";
  import PlayerIcon from "../../components/PlayerIcon.svelte";

  export let room: Room;
  export let state: RoomState;

  type SubPhase = "waiting" | "preview" | "calibrating" | "countdown" | "draw" | "result" | "champion";

  let subPhase: SubPhase = "waiting";
  let player1Id = "";
  let player2Id = "";
  let player1Name = "";
  let player2Name = "";
  let bracketRound = 0;
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

  let countdownInterval: ReturnType<typeof setInterval> | null = null;
  let timerInterval: ReturnType<typeof setInterval> | null = null;
  let drawEndsAt = 0;
  let music: HTMLAudioElement | null = null;

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

  function handlePreview(data: {
    player1Id: string;
    player1Name: string;
    player2Id: string;
    player2Name: string;
    bracketRound: number;
  }) {
    subPhase = "preview";
    player1Id = data.player1Id;
    player2Id = data.player2Id;
    player1Name = data.player1Name;
    player2Name = data.player2Name;
    bracketRound = data.bracketRound;
    resultWinnerId = "";
    resultWinnerName = "";
    resultLoserName = "";
    resultReason = "";
    reactionMs = 0;
    lastWinnerName = "";
  }

  function handleCalibrating() {
    subPhase = "calibrating";
    readyCount = 0;
    totalCount = 2;
  }

  function handleReady(data: { readyCount: number; totalCount: number }) {
    readyCount = data.readyCount;
    totalCount = data.totalCount;
  }

  function handleCountdown(data: { seconds: number }) {
    subPhase = "countdown";
    countdownValue = data.seconds;
    clearCountdown();
    countdownInterval = setInterval(() => {
      countdownValue = Math.max(0, countdownValue - 1);
      if (countdownValue <= 0) clearCountdown();
    }, 1000);
  }

  function handleDraw(data: { timeoutMs: number }) {
    subPhase = "draw";
    drawEndsAt = Date.now() + data.timeoutMs;
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
    clearTimer();
    subPhase = "result";
    resultWinnerId = data.winnerId;
    resultWinnerName = data.winnerName;
    resultLoserName = data.loserName;
    resultReason = data.reason;
    reactionMs = data.reactionMs;
    lastWinnerName = data.winnerName;
  }

  function handleChampion(data: {
    championId: string;
    championName: string;
    runnerUpName: string;
  }) {
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

    room.onMessage("standoff_match_preview", handlePreview);
    room.onMessage("standoff_calibrate_start", handleCalibrating);
    room.onMessage("standoff_ready", handleReady);
    room.onMessage("standoff_paces_countdown", handleCountdown);
    room.onMessage("standoff_draw", handleDraw);
    room.onMessage("standoff_match_result", handleResult);
    room.onMessage("standoff_tournament_complete", handleChampion);
  });

  onDestroy(() => {
    clearCountdown();
    clearTimer();
    syncMusic(false);
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
    </div>
    <div class="rounded-2xl border border-amber-500/20 bg-black/30 px-5 py-3 text-right">
      <p class="text-xs uppercase tracking-widest text-amber-300">Round</p>
      <p class="text-3xl font-black text-white">{bracketRound || "—"}</p>
    </div>
  </div>

  {#if subPhase === "waiting"}
    <div class="flex flex-1 items-center justify-center text-center">
      <div class="space-y-4">
        <h2 class="text-5xl font-black text-amber-300">Awaiting Duelists</h2>
        <p class="text-xl text-amber-100/80">Phones load the standoff while the bracket prepares the next duel.</p>
      </div>
    </div>

  {:else if subPhase === "preview" || subPhase === "calibrating" || subPhase === "countdown" || subPhase === "draw" || subPhase === "result"}
    <div class="grid flex-1 grid-cols-[1fr_auto_1fr] items-center gap-10">
      <div class="rounded-[2rem] border border-cyan-400/20 bg-black/30 p-8 text-center shadow-2xl">
        {#if player1}
          <div class="mb-4 flex justify-center"><PlayerIcon player={player1} size={72} /></div>
        {/if}
        <p class="text-4xl font-black text-cyan-300">{player1Name}</p>
      </div>

      <div class="text-center">
        {#if subPhase === "preview"}
          <p class="text-sm uppercase tracking-[0.4em] text-amber-300">Up Next</p>
          <p class="mt-4 text-7xl font-black text-white">VS</p>
          <p class="mt-4 text-xl text-amber-100/75">Stand back-to-back</p>
        {:else if subPhase === "calibrating"}
          <p class="text-sm uppercase tracking-[0.4em] text-amber-300">Calibrating</p>
          <p class="mt-4 text-7xl font-black text-white">{readyCount}/{totalCount}</p>
          <p class="mt-4 text-xl text-amber-100/75">Lock your facing direction</p>
        {:else if subPhase === "countdown"}
          <p class="text-sm uppercase tracking-[0.4em] text-amber-300">Take Three Paces</p>
          <p class="mt-4 text-8xl font-black text-white">{countdownValue > 0 ? countdownValue : "DRAW"}</p>
        {:else if subPhase === "draw"}
          <p class="text-sm uppercase tracking-[0.4em] text-red-300">Draw!</p>
          <p class="mt-4 text-8xl font-black {timeRemaining < 2 ? 'text-red-400' : 'text-white'}">{Math.ceil(timeRemaining)}</p>
          <p class="mt-4 text-xl text-amber-100/75">Turn, aim, fire</p>
        {:else if subPhase === "result"}
          <p class="text-sm uppercase tracking-[0.4em] text-green-300">Winner</p>
          <p class="mt-4 text-5xl font-black text-white">{resultWinnerName}</p>
          {#if reactionMs > 0}
            <p class="mt-4 text-xl text-amber-100">Reaction {(reactionMs / 1000).toFixed(2)}s</p>
          {/if}
          <p class="mt-4 text-sm uppercase tracking-widest text-amber-300">{resultReason}</p>
        {/if}
      </div>

      <div class="rounded-[2rem] border border-orange-400/20 bg-black/30 p-8 text-center shadow-2xl">
        {#if player2}
          <div class="mb-4 flex justify-center"><PlayerIcon player={player2} size={72} /></div>
        {/if}
        <p class="text-4xl font-black text-orange-300">{player2Name}</p>
      </div>
    </div>

    {#if subPhase === "result"}
      <div class="mt-6 text-center text-lg text-amber-100/80">{resultLoserName} is out of this duel.</div>
    {/if}

  {:else if subPhase === "champion"}
    <div class="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <p class="text-sm uppercase tracking-[0.5em] text-yellow-300">Champion</p>
      <h2 class="text-7xl font-black text-yellow-200">{championName}</h2>
      {#if runnerUpName}
        <p class="text-2xl text-amber-100/80">Runner-up: {runnerUpName}</p>
      {/if}
      <div class="mt-6 w-full max-w-xl rounded-[2rem] border border-amber-500/20 bg-black/35 p-6">
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
      <div class="rounded-3xl border border-amber-500/15 bg-black/25 p-5">
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

      <div class="rounded-3xl border border-amber-500/15 bg-black/25 p-5">
        <p class="mb-3 text-xs uppercase tracking-widest text-amber-300">Town bulletin</p>
        <div class="space-y-3 text-left text-amber-100/85">
          <p><span class="font-black text-white">Arena:</span> Face away, take three paces, then turn on the draw.</p>
          <p><span class="font-black text-white">Shot rules:</span> Only fully turned, landscape draw poses count.</p>
          {#if lastWinnerName}
            <p><span class="font-black text-white">Last duel:</span> {lastWinnerName} won the draw.</p>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>
