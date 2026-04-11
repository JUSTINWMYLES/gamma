<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { Room } from "colyseus.js";
  import type { PlayerState, RoomState } from "../../../../shared/types";

  export let room: Room;
  export let state: RoomState;
  export let me: PlayerState | undefined;

  type SubPhase =
    | "setup"
    | "waiting_admin"
    | "white_ready"
    | "player_announce"
    | "countdown"
    | "waiting"
    | "speed_tap"
    | "group_results"
    | "round_scores";

  interface GroupResult {
    playerId: string;
    playerName: string;
    completionTimeMs?: number;
    averageTapTimeMs?: number;
    fastestTapTimeMs?: number;
    tapCount?: number;
    completed?: boolean;
    timedOut?: boolean;
  }

  let subPhase: SubPhase = "setup";
  let displayNumber = 0;
  let myColor = "";
  let totalTaps = 10;
  let gridLayout = { cols: 2, rows: 1 };
  let isLit = false;
  let litColor = "";
  let myTapCount = 0;
  let lastTapTimeMs = 0;
  let activePlayerIds: string[] = [];
  let activePlayerNames: string[] = [];
  let isMyTurn = false;
  let announcePlayerNames: string[] = [];
  let announceCountdown = 10;
  let announceTimer: ReturnType<typeof setInterval> | null = null;
  let groupResults: GroupResult[] = [];
  let roundScores: Record<string, number> = {};
  let musicPlaying = false;

  $: isHost = me?.id === state.hostSessionId;
  $: tapProgressPct = totalTaps > 0 ? (myTapCount / totalTaps) * 100 : 0;

  function clearAnnounceTimer() {
    if (announceTimer) {
      clearInterval(announceTimer);
      announceTimer = null;
    }
  }

  function onSetup(data: {
    totalTaps: number;
    gridLayout?: { cols: number; rows: number };
  }) {
    totalTaps = data.totalTaps;
    if (data.gridLayout) gridLayout = data.gridLayout;
    subPhase = "setup";
  }

  function onPhoneAssignment(data: {
    displayNumber: number;
    color: string;
    gridLayout?: { cols: number; rows: number };
  }) {
    displayNumber = data.displayNumber;
    myColor = data.color;
    if (data.gridLayout) gridLayout = data.gridLayout;
    subPhase = "setup";
  }

  function onWaitingForAdmin() {
    subPhase = "waiting_admin";
  }

  function onRoundStart(data: { totalTaps: number }) {
    totalTaps = data.totalTaps;
    myTapCount = 0;
    lastTapTimeMs = 0;
    isLit = false;
    litColor = "";
    groupResults = [];
    subPhase = "white_ready";
  }

  function onPlayerAnnounce(data: {
    playerIds: string[];
    playerNames: string[];
    readyDurationMs: number;
    gridLayout?: { cols: number; rows: number };
  }) {
    announcePlayerNames = data.playerNames;
    isMyTurn = data.playerIds.includes(me?.id ?? "");
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
    activePlayerIds = data.playerIds;
    activePlayerNames = data.playerNames;
    isMyTurn = data.playerIds.includes(me?.id ?? "");
    myTapCount = 0;
    lastTapTimeMs = 0;
    isLit = false;
    litColor = "";
    clearAnnounceTimer();
    subPhase = isMyTurn ? "countdown" : "waiting";
  }

  function onPhoneLight(data: { color: string; lit: boolean }) {
    isLit = data.lit;
    litColor = data.color;
    if (data.lit) {
      subPhase = "speed_tap";
    } else if (isMyTurn) {
      subPhase = "waiting";
    }
  }

  function onTapConfirmed(data: {
    playerId: string;
    tapNumber: number;
    tapTimeMs: number;
    totalTaps: number;
  }) {
    if (data.playerId !== activePlayerIds[0]) return;
    totalTaps = data.totalTaps;
    lastTapTimeMs = data.tapTimeMs;
    if (me?.id === data.playerId) {
      myTapCount = data.tapNumber;
    }
  }

  function onPlayerComplete(data: { playerId: string }) {
    if (data.playerId === me?.id) {
      isLit = false;
      subPhase = "waiting";
    }
  }

  function onGroupResults(data: { results: GroupResult[] }) {
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

  function handlePhoneTap() {
    if (!isLit) return;
    room.send("game_input", {
      action: "tap",
      phoneIndex: displayNumber - 1,
    });
  }

  function handleAdminGridReady() {
    room.send("game_input", { action: "admin_grid_ready" });
  }

  onMount(() => {
    room.onMessage("grid_setup", onSetup);
    room.onMessage("grid_phone_assignment", onPhoneAssignment);
    room.onMessage("grid_round_start", onRoundStart);
    room.onMessage("grid_phone_light", onPhoneLight);
    room.onMessage("grid_tap_confirmed", onTapConfirmed);
    room.onMessage("grid_player_complete", onPlayerComplete);
    room.onMessage("grid_group_start", onGroupStart);
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

<div class="flex-1 flex flex-col items-center justify-center gap-4 p-4 select-none" data-testid="grid-tap-colors">
  {#if subPhase === "setup"}
    <div class="text-center space-y-4">
      <p class="text-xs text-gray-500 uppercase tracking-widest">Place this phone in the grid</p>
      <div
        class="mx-auto flex h-44 w-44 items-center justify-center rounded-3xl border-4 shadow-2xl"
        style="background: {myColor}22; border-color: {myColor}"
      >
        <p class="text-8xl font-black" style="color: {myColor}">{displayNumber || "?"}</p>
      </div>
      <p class="text-sm text-gray-400">
        Position <strong style="color: {myColor}">{displayNumber}</strong> in the {gridLayout.cols}x{gridLayout.rows} grid
      </p>
    </div>

  {:else if subPhase === "waiting_admin"}
    <div class="text-center space-y-4">
      <p class="text-sm text-gray-400">Phone placed in position <strong style="color: {myColor}">{displayNumber}</strong></p>
      {#if isHost}
        <button
          class="rounded-xl bg-cyan-500 px-8 py-3 text-lg font-bold text-white shadow-lg transition-colors hover:bg-cyan-400"
          on:click={handleAdminGridReady}
        >
          Phones Are Ready
        </button>
      {:else}
        <p class="text-sm text-gray-500 animate-pulse">Waiting for host to confirm...</p>
      {/if}
    </div>

  {:else if subPhase === "white_ready"}
    <div class="flex h-full w-full flex-1 items-center justify-center rounded-2xl bg-white">
      <p class="animate-pulse text-sm font-medium text-gray-800">Get Ready...</p>
    </div>

  {:else if subPhase === "player_announce"}
    <div class="text-center space-y-4">
      {#if isMyTurn}
        <p class="text-xs font-bold uppercase tracking-widest text-cyan-400">Your Turn Next</p>
        <p class="text-5xl font-black text-cyan-400">{announceCountdown}s</p>
        <p class="text-sm text-gray-400">Get in position at the grid</p>
      {:else}
        <p class="text-xs uppercase tracking-widest text-gray-500">Up Next</p>
        {#each announcePlayerNames as name}
          <p class="text-2xl font-black text-white">{name}</p>
        {/each}
        <p class="text-xl font-bold text-gray-400">{announceCountdown}s</p>
      {/if}
    </div>

  {:else if subPhase === "countdown"}
    <div class="text-center space-y-4">
      <p class="text-xs uppercase tracking-widest text-gray-500">Your turn</p>
      <p class="animate-pulse text-6xl font-black text-cyan-400">Stand By</p>
      <p class="text-sm text-gray-400">Wait for this phone to light up</p>
    </div>

  {:else if subPhase === "speed_tap" || subPhase === "waiting"}
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
      class="flex h-full w-full flex-1 flex-col items-center justify-center rounded-2xl transition-colors duration-100"
      style="background: {isLit ? litColor : 'transparent'}"
      on:touchstart|preventDefault={handlePhoneTap}
      on:mousedown={handlePhoneTap}
    >
      {#if isLit}
        <div class="pointer-events-none space-y-4 text-center">
          <div
            class="mx-auto flex h-32 w-32 items-center justify-center rounded-full animate-pulse"
            style="background: {litColor}; box-shadow: 0 0 60px {litColor}"
          >
            <p class="text-5xl font-black text-white">TAP!</p>
          </div>
          <div class="mx-auto w-48">
            <div class="h-2 overflow-hidden rounded-full bg-gray-700">
              <div class="h-full rounded-full bg-white transition-all duration-150" style="width: {tapProgressPct}%"></div>
            </div>
            <p class="mt-1 text-sm text-white">{myTapCount} / {totalTaps}</p>
          </div>
          {#if lastTapTimeMs > 0}
            <p class="text-xs text-white/80">{lastTapTimeMs}ms</p>
          {/if}
        </div>
      {:else}
        <div class="space-y-2 text-center">
          <p class="text-lg text-gray-400">{isMyTurn ? "Waiting for next light..." : "Watch the TV"}</p>
          {#if musicPlaying}
            <p class="text-xs text-gray-600">♪ Music playing...</p>
          {/if}
        </div>
      {/if}
    </div>

  {:else if subPhase === "group_results"}
    <div class="w-full max-w-sm space-y-4 text-center">
      <p class="text-xs uppercase tracking-widest text-gray-500">Turn Results</p>
      <ul class="space-y-2">
        {#each groupResults as result}
          <li class="rounded-lg bg-gray-800 px-4 py-3 text-left">
            <p class="text-sm font-medium text-white">{result.playerName}</p>
            <p class="text-xs text-gray-400">
              {#if result.completed}
                Overall {(Number(result.completionTimeMs) / 1000).toFixed(2)}s
              {:else}
                Timed out
              {/if}
            </p>
            <p class="text-xs text-gray-400">Avg {result.averageTapTimeMs ?? "-"}ms</p>
            <p class="text-xs text-gray-400">Fastest {result.fastestTapTimeMs ?? "-"}ms</p>
          </li>
        {/each}
      </ul>
    </div>

  {:else if subPhase === "round_scores"}
    <div class="w-full max-w-sm space-y-4 text-center">
      <p class="text-xs uppercase tracking-widest text-gray-500">Round Score</p>
      <div class="rounded-xl bg-gray-800 p-4">
        <p class="text-3xl font-black text-cyan-400">+{roundScores[me?.id ?? ""] ?? 0}</p>
        <p class="mt-1 text-sm text-gray-400">points this round</p>
      </div>
      <p class="text-sm text-gray-500">Total: {me?.score ?? 0}</p>
    </div>
  {/if}
</div>
