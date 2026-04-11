<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState } from "../../../../shared/types";

  export let room: Room;
  export let state: RoomState;

  type SubPhase =
    | "setup"
    | "waiting_admin"
    | "waiting"
    | "player_announce"
    | "playing"
    | "group_results"
    | "round_scores";

  interface PhoneDisplay {
    phoneId: string;
    displayNumber: number;
    color: string;
    groupIndex: number;
    lit: boolean;
    litColor: string;
  }

  interface PlayerProgress {
    playerId: string;
    playerName: string;
    tapCount: number;
    totalTaps: number;
    lastTapTimeMs: number;
    completed: boolean;
    completionTimeMs?: number;
    averageTapTimeMs?: number;
    fastestTapTimeMs?: number;
    timedOut?: boolean;
  }

  let subPhase: SubPhase = "setup";
  let phones: PhoneDisplay[] = [];
  let totalTaps = 10;
  let gridLayout = { cols: 2, rows: 1 };
  let currentRound = 0;
  let currentTurnIndex = 0;
  let announcePlayerNames: string[] = [];
  let announceCountdown = 10;
  let announceTimer: ReturnType<typeof setInterval> | null = null;
  let activePlayerIds: string[] = [];
  let activePlayerNames: string[] = [];
  let playerProgressMap = new Map<string, PlayerProgress>();
  let groupResults: PlayerProgress[] = [];
  let roundScores: Record<string, number> = {};
  let musicPlaying = false;

  $: gridCols = gridLayout.cols;
  $: progressEntries = [...playerProgressMap.values()];
  $: sortedPlayers = [...state.players.values()].sort((a, b) => b.score - a.score);

  function clearAnnounceTimer() {
    if (announceTimer) {
      clearInterval(announceTimer);
      announceTimer = null;
    }
  }

  function onSetup(data: {
    phoneAssignments: Array<{
      phoneId: string;
      displayNumber: number;
      color: string;
      groupIndex: number;
    }>;
    totalTaps: number;
    gridLayout?: { cols: number; rows: number };
  }) {
    phones = data.phoneAssignments.map((assignment) => ({
      ...assignment,
      lit: false,
      litColor: assignment.color,
    }));
    totalTaps = data.totalTaps;
    if (data.gridLayout) gridLayout = data.gridLayout;
    subPhase = "setup";
  }

  function onWaitingForAdmin() {
    subPhase = "waiting_admin";
  }

  function onRoundStart(data: { round: number; totalTaps: number }) {
    currentRound = data.round;
    totalTaps = data.totalTaps;
    groupResults = [];
    playerProgressMap = new Map();
    phones = phones.map((phone) => ({ ...phone, lit: false, litColor: phone.color }));
    subPhase = "waiting";
  }

  function onPlayerAnnounce(data: {
    groupIndex: number;
    playerNames: string[];
    readyDurationMs: number;
    gridLayout?: { cols: number; rows: number };
  }) {
    announcePlayerNames = data.playerNames;
    currentTurnIndex = data.groupIndex;
    if (data.gridLayout) gridLayout = data.gridLayout;
    announceCountdown = Math.ceil(data.readyDurationMs / 1000);
    clearAnnounceTimer();
    announceTimer = setInterval(() => {
      announceCountdown = Math.max(0, announceCountdown - 1);
      if (announceCountdown <= 0) {
        clearAnnounceTimer();
      }
    }, 1000);
    subPhase = "player_announce";
  }

  function onGroupStart(data: { playerIds: string[]; playerNames: string[] }) {
    clearAnnounceTimer();
    activePlayerIds = data.playerIds;
    activePlayerNames = data.playerNames;
    playerProgressMap = new Map(
      data.playerIds.map((playerId, index) => [
        playerId,
        {
          playerId,
          playerName: data.playerNames[index],
          tapCount: 0,
          totalTaps,
          lastTapTimeMs: 0,
          completed: false,
        },
      ]),
    );
    subPhase = "playing";
  }

  function onPhoneState(data: { phoneIndex: number; color: string; lit: boolean }) {
    if (data.phoneIndex < 0 || data.phoneIndex >= phones.length) return;
    phones = phones.map((phone, index) => index === data.phoneIndex
      ? { ...phone, lit: data.lit, litColor: data.color }
      : { ...phone, lit: false, litColor: phone.color });
  }

  function onTapProgress(data: {
    playerId: string;
    playerName: string;
    tapNumber: number;
    totalTaps: number;
    tapTimeMs: number;
  }) {
    const existing = playerProgressMap.get(data.playerId);
    if (!existing) return;
    playerProgressMap = new Map(playerProgressMap).set(data.playerId, {
      ...existing,
      playerName: data.playerName,
      tapCount: data.tapNumber,
      totalTaps: data.totalTaps,
      lastTapTimeMs: data.tapTimeMs,
    });
  }

  function onPlayerComplete(data: {
    playerId: string;
    playerName: string;
    completionTimeMs: number;
    averageTapTimeMs?: number;
    fastestTapTimeMs?: number;
    timedOut?: boolean;
  }) {
    const existing = playerProgressMap.get(data.playerId);
    if (!existing) return;
    playerProgressMap = new Map(playerProgressMap).set(data.playerId, {
      ...existing,
      playerName: data.playerName,
      completed: true,
      completionTimeMs: data.completionTimeMs,
      averageTapTimeMs: data.averageTapTimeMs,
      fastestTapTimeMs: data.fastestTapTimeMs,
      timedOut: data.timedOut,
    });
  }

  function onGroupResults(data: { results: PlayerProgress[] }) {
    groupResults = data.results;
    subPhase = "group_results";
  }

  function onRoundScores(data: { scores: Record<string, number> }) {
    roundScores = data.scores;
    subPhase = "round_scores";
  }

  function onMusic(data: { action: string }) {
    musicPlaying = data.action === "play";
  }

  onMount(() => {
    room.onMessage("grid_setup", onSetup);
    room.onMessage("grid_round_start", onRoundStart);
    room.onMessage("grid_group_start", onGroupStart);
    room.onMessage("grid_phone_state", onPhoneState);
    room.onMessage("grid_tap_progress", onTapProgress);
    room.onMessage("grid_player_complete", onPlayerComplete);
    room.onMessage("grid_group_results", onGroupResults);
    room.onMessage("grid_round_scores", onRoundScores);
    room.onMessage("grid_music", onMusic);
    room.onMessage("grid_player_announce", onPlayerAnnounce);
    room.onMessage("grid_waiting_for_admin", onWaitingForAdmin);
  });

  onDestroy(() => {
    clearAnnounceTimer();
  });
</script>

<div class="flex flex-1 flex-col bg-gray-950 p-6 text-white" data-testid="grid-tap-colors-tv">
  <div class="mb-4 flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-black text-cyan-400">Grid Tap Colors</h1>
      <p class="text-sm text-gray-500">Sequential speed round{currentRound > 0 ? ` • Round ${currentRound}` : ""}</p>
    </div>
    {#if musicPlaying}
      <span class="text-xs text-gray-600">♪ Ouroboros</span>
    {/if}
  </div>

  <div class="flex flex-1 gap-6">
    <div class="flex flex-1 items-center justify-center">
      {#if subPhase === "setup" || subPhase === "waiting_admin"}
        <div class="space-y-6 text-center">
          <h2 class="text-3xl font-black text-white">Arrange Phones in This Grid</h2>
          <p class="text-gray-400">{gridLayout.cols} x {gridLayout.rows} grid</p>
          <div class="mx-auto grid gap-3" style="grid-template-columns: repeat({gridCols}, minmax(0, 1fr)); max-width: {gridCols * 110}px">
            {#each phones as phone}
              <div class="aspect-[3/4] rounded-xl border-2" style="border-color: {phone.color}; background: {phone.color}15">
                <div class="flex h-full flex-col items-center justify-center gap-1">
                  <span class="text-3xl font-black" style="color: {phone.color}">{phone.displayNumber}</span>
                </div>
              </div>
            {/each}
          </div>
          {#if subPhase === "waiting_admin"}
            <p class="animate-pulse text-sm text-cyan-400">Waiting for host to confirm phone placement...</p>
          {/if}
        </div>

      {:else if subPhase === "player_announce"}
        <div class="space-y-6 text-center">
          <p class="text-xs uppercase tracking-widest text-gray-500">Up Next</p>
          {#each announcePlayerNames as name}
            <div class="rounded-2xl border-2 border-cyan-500/40 bg-cyan-500/20 px-8 py-3 text-3xl font-black text-cyan-400">{name}</div>
          {/each}
          <p class="text-6xl font-black text-white">{announceCountdown}</p>
          <p class="text-gray-400">Get in position at the grid</p>
        </div>

      {:else}
        <div class="mx-auto grid gap-3" style="grid-template-columns: repeat({gridCols}, minmax(0, 1fr)); max-width: {gridCols * 90}px">
          {#each phones as phone}
            <div
              class="aspect-square rounded-xl border-2 flex items-center justify-center transition-all duration-150"
              style="
                border-color: {phone.color};
                background: {phone.lit ? phone.litColor : phone.color + '10'};
                box-shadow: {phone.lit ? `0 0 20px ${phone.litColor}66` : 'none'};
                transform: {phone.lit ? 'scale(1.05)' : 'scale(1)'};
              "
            >
              <span class="text-2xl font-black" style="color: {phone.lit ? 'white' : phone.color}">{phone.displayNumber}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <div class="flex w-72 flex-shrink-0 flex-col gap-4">
      {#if subPhase === "playing"}
        <div>
          <p class="mb-2 text-xs uppercase tracking-widest text-gray-500">Now Playing</p>
          {#each progressEntries as progress}
            <div class="mb-2 rounded-lg bg-gray-800 p-3">
              <div class="mb-1 flex items-center justify-between">
                <span class="text-sm font-bold text-white">{progress.playerName}</span>
                <span class="text-xs text-gray-400">{progress.tapCount}/{progress.totalTaps}</span>
              </div>
              <div class="h-2 overflow-hidden rounded-full bg-gray-700">
                <div class="h-full rounded-full bg-cyan-500 transition-all duration-150" style="width: {progress.totalTaps > 0 ? (progress.tapCount / progress.totalTaps) * 100 : 0}%"></div>
              </div>
              {#if progress.lastTapTimeMs > 0}
                <p class="mt-1 text-xs text-gray-500">Last press: {progress.lastTapTimeMs}ms</p>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      {#if subPhase === "group_results"}
        <div>
          <p class="mb-2 text-xs uppercase tracking-widest text-gray-500">Turn Results</p>
          {#each groupResults as result}
            <div class="mb-2 rounded-lg bg-gray-800 p-3">
              <p class="text-sm font-bold text-white">{result.playerName}</p>
              <p class="text-xs text-gray-400">Overall: {result.completed ? `${(Number(result.completionTimeMs) / 1000).toFixed(2)}s` : "Timed out"}</p>
              <p class="text-xs text-gray-400">Average press: {result.averageTapTimeMs ?? "-"}ms</p>
              <p class="text-xs text-gray-400">Fastest press: {result.fastestTapTimeMs ?? "-"}ms</p>
            </div>
          {/each}
        </div>
      {/if}

      {#if subPhase === "round_scores"}
        <div>
          <p class="mb-2 text-xs uppercase tracking-widest text-gray-500">Round Scores</p>
          {#each sortedPlayers as player}
            <div class="mb-1 flex items-center justify-between rounded-lg bg-gray-800 px-3 py-2">
              <span class="text-sm text-white">{player.name}</span>
              <div class="text-right">
                {#if roundScores[player.id] !== undefined}
                  <span class="text-xs font-bold text-cyan-400">+{roundScores[player.id]}</span>
                {/if}
                <span class="ml-2 text-xs text-gray-400">{player.score}</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}

      <div class="mt-auto">
        <p class="mb-2 text-xs uppercase tracking-widest text-gray-500">Leaderboard</p>
        {#each sortedPlayers.slice(0, 8) as player, index}
          <div class="flex items-center gap-2 px-2 py-1">
            <span class="w-4 font-mono text-xs text-gray-500">{index + 1}.</span>
            <span class="flex-1 truncate text-sm text-gray-300">{player.name}</span>
            <span class="font-mono text-xs text-gray-400">{player.score}</span>
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>
