<script lang="ts">
  /**
   * Phone game component for "Grid Tap Colors" (registry-10).
   *
   * Two game modes:
   *   Mode 1 (Speed Tap): Phone lights up → tap ASAP → next phone lights.
   *   Mode 2 (Color Sequence): Watch TV, then tap phones in memorized order.
   *
   * Server messages listened:
   *   grid_setup, grid_phone_assignment, grid_round_start,
   *   grid_phone_light, grid_tap_confirmed, grid_tap_progress,
   *   grid_player_complete, grid_group_start, grid_group_results,
   *   grid_round_scores, grid_sequence_input_start,
   *   grid_sequence_tap_confirmed, grid_phone_color_hint,
   *   grid_sequence_memorize, grid_player_sequence_complete,
   *   grid_music, grid_player_announce, grid_waiting_for_admin
   */
  import { onMount, onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState, PlayerState } from "../../../../shared/types";

  export let room: Room;
  export let state: RoomState;
  export let me: PlayerState | undefined;

  // ── Sub-phase state ──────────────────────────────────────────────

  type SubPhase =
    | "setup"           // Showing phone placement number
    | "waiting_admin"   // Waiting for host to confirm placement
    | "waiting"         // Waiting for turn
    | "player_announce" // Showing who is going next
    | "countdown"       // Group about to start
    | "white_ready"     // All phones white before tapping
    | "speed_tap"       // Mode 1: tapping
    | "color_input"     // Mode 2: entering sequence
    | "group_results"   // Showing results for the group
    | "round_scores";   // Showing round scores

  let subPhase: SubPhase = "setup";

  // ── Setup info ──────────────────────────────────────────────────

  let displayNumber = 0;
  let myColor = "";
  let myGroupIndex = 0;
  let totalGroups = 1;
  let gameMode: "speed_tap" | "color_sequence" = "speed_tap";
  let totalTaps = 10;

  // ── Grid layout ────────────────────────────────────────────────
  let gridLayout = { cols: 2, rows: 1 };

  // ── Phone state (is this phone lit?) ────────────────────────────

  let isLit = false;
  let litColor = "";

  // ── Speed Tap state ─────────────────────────────────────────────

  let myTapCount = 0;
  let lastTapTimeMs = 0;

  // ── Color Sequence state ────────────────────────────────────────

  let sequenceLength = 0;
  let mySequenceTapCount = 0;
  let sequenceSubmitted = false;

  // ── Group/round results ─────────────────────────────────────────

  let groupResults: Array<{
    playerId: string;
    playerName: string;
    [key: string]: unknown;
  }> = [];
  let roundScores: Record<string, number> = {};

  // ── Active group info ───────────────────────────────────────────

  let activeGroupPlayerIds: string[] = [];
  let activeGroupPlayerNames: string[] = [];
  let isMyTurn = false;

  // ── Player announce ─────────────────────────────────────────────
  let announcePlayerNames: string[] = [];
  let announceCountdown = 10;
  let announceTimer: ReturnType<typeof setInterval> | null = null;

  // ── Music ───────────────────────────────────────────────────────
  let musicPlaying = false;

  // ── Admin state ─────────────────────────────────────────────────
  $: isHost = me?.id === state.hostSessionId;

  // ── Message handlers ────────────────────────────────────────────

  function onSetup(data: {
    phoneAssignments: Array<{
      phoneId: string;
      displayNumber: number;
      color: string;
      groupIndex: number;
    }>;
    concurrentPlayers: number;
    gameMode: string;
    totalTaps: number;
    musicTrack: string;
    gridLayout?: { cols: number; rows: number };
  }) {
    gameMode = data.gameMode === "color_sequence" ? "color_sequence" : "speed_tap";
    totalTaps = data.totalTaps;
    if (data.gridLayout) gridLayout = data.gridLayout;
    subPhase = "setup";
  }

  function onPhoneAssignment(data: {
    displayNumber: number;
    color: string;
    groupIndex: number;
    totalGroups: number;
    gridLayout?: { cols: number; rows: number };
  }) {
    displayNumber = data.displayNumber;
    myColor = data.color;
    myGroupIndex = data.groupIndex;
    totalGroups = data.totalGroups;
    if (data.gridLayout) gridLayout = data.gridLayout;
    subPhase = "setup";
  }

  function onWaitingForAdmin() {
    subPhase = "waiting_admin";
  }

  function onRoundStart(data: {
    round: number;
    gameMode: string;
    totalTaps: number;
  }) {
    gameMode = data.gameMode === "color_sequence" ? "color_sequence" : "speed_tap";
    totalTaps = data.totalTaps;
    myTapCount = 0;
    mySequenceTapCount = 0;
    sequenceSubmitted = false;
    isLit = false;
    // All phones go white when round starts
    subPhase = "white_ready";
  }

  function onPlayerAnnounce(data: {
    round: number;
    groupIndex: number;
    totalGroups: number;
    playerIds: string[];
    playerNames: string[];
    readyDurationMs: number;
    gridLayout?: { cols: number; rows: number };
    concurrentPlayers: number;
  }) {
    announcePlayerNames = data.playerNames;
    isMyTurn = data.playerIds.includes(me?.id ?? "");
    if (data.gridLayout) gridLayout = data.gridLayout;

    // Start countdown timer
    announceCountdown = Math.ceil(data.readyDurationMs / 1000);
    if (announceTimer) clearInterval(announceTimer);
    announceTimer = setInterval(() => {
      announceCountdown--;
      if (announceCountdown <= 0) {
        if (announceTimer) clearInterval(announceTimer);
        announceTimer = null;
      }
    }, 1000);

    subPhase = "player_announce";
  }

  function onGroupStart(data: {
    round: number;
    groupIndex: number;
    playerIds: string[];
    playerNames: string[];
  }) {
    activeGroupPlayerIds = data.playerIds;
    activeGroupPlayerNames = data.playerNames;
    isMyTurn = data.playerIds.includes(me?.id ?? "");
    if (announceTimer) { clearInterval(announceTimer); announceTimer = null; }
    if (isMyTurn) {
      subPhase = "countdown";
      myTapCount = 0;
      mySequenceTapCount = 0;
      sequenceSubmitted = false;
    } else {
      subPhase = "waiting";
    }
  }

  function onPhoneLight(data: {
    playerId: string;
    phoneIndex: number;
    color: string;
    lit: boolean;
  }) {
    isLit = data.lit;
    litColor = data.color;

    if (data.lit && isMyTurn && gameMode === "speed_tap") {
      subPhase = "speed_tap";
    }
  }

  function onTapConfirmed(data: {
    playerId: string;
    tapNumber: number;
    tapTimeMs: number;
    totalTaps: number;
  }) {
    myTapCount = data.tapNumber;
    lastTapTimeMs = data.tapTimeMs;
    totalTaps = data.totalTaps;
  }

  function onPlayerComplete(_data: {
    playerId: string;
    playerName: string;
    completionTimeMs: number;
  }) {
    if (_data.playerId === me?.id) {
      subPhase = "waiting";
      isLit = false;
    }
  }

  function onGroupResults(data: {
    round: number;
    groupIndex: number;
    results: Array<{
      playerId: string;
      playerName: string;
      [key: string]: unknown;
    }>;
  }) {
    groupResults = data.results;
    subPhase = "group_results";
  }

  function onRoundScores(data: {
    round: number;
    scores: Record<string, number>;
  }) {
    roundScores = data.scores;
    subPhase = "round_scores";
  }

  // Mode 2 handlers

  function onSequenceInputStart(data: {
    playerIds: string[];
    sequenceLength: number;
    timeoutMs: number;
  }) {
    sequenceLength = data.sequenceLength;
    mySequenceTapCount = 0;
    sequenceSubmitted = false;
    if (data.playerIds.includes(me?.id ?? "")) {
      subPhase = "color_input";
    }
  }

  function onSequenceTapConfirmed(data: {
    tapIndex: number;
    phoneIndex: number;
    totalSteps: number;
  }) {
    mySequenceTapCount = data.tapIndex + 1;
    sequenceLength = data.totalSteps;
  }

  function onPlayerSequenceComplete(_data: {
    playerId: string;
    playerName: string;
    errors: number;
    totalSteps: number;
  }) {
    if (_data.playerId === me?.id) {
      sequenceSubmitted = true;
      subPhase = "waiting";
    }
  }

  function onMusic(data: { action: string; track: string }) {
    musicPlaying = data.action === "play";
  }

  // ── Actions ─────────────────────────────────────────────────────

  function handlePhoneTap() {
    if (gameMode === "speed_tap" && isLit) {
      room.send("game_input", {
        action: "tap",
        phoneIndex: displayNumber - 1,
      });
    } else if (gameMode === "color_sequence" && subPhase === "color_input") {
      room.send("game_input", {
        action: "tap",
        phoneIndex: displayNumber - 1,
      });
    }
  }

  function handleAdminGridReady() {
    room.send("game_input", {
      action: "admin_grid_ready",
    });
  }

  // ── Lifecycle ───────────────────────────────────────────────────

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
    room.onMessage("grid_sequence_input_start", onSequenceInputStart);
    room.onMessage("grid_sequence_tap_confirmed", onSequenceTapConfirmed);
    // grid_phone_color_hint is handled visually via myColor — no extra action needed
    room.onMessage("grid_phone_color_hint", () => {});
    room.onMessage("grid_player_sequence_complete", onPlayerSequenceComplete);
    room.onMessage("grid_music", onMusic);
    room.onMessage("grid_player_announce", onPlayerAnnounce);
    room.onMessage("grid_waiting_for_admin", onWaitingForAdmin);
  });

  onDestroy(() => {
    if (announceTimer) clearInterval(announceTimer);
  });

  // ── Derived ─────────────────────────────────────────────────────

  $: tapProgressPct = totalTaps > 0 ? (myTapCount / totalTaps) * 100 : 0;
  $: sequenceProgressPct = sequenceLength > 0 ? (mySequenceTapCount / sequenceLength) * 100 : 0;
  $: groupLabel = totalGroups > 1 ? `Group ${myGroupIndex + 1}` : "";
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-4 p-4 select-none" data-testid="grid-tap-colors">

  {#if subPhase === "setup"}
    <!-- Phone placement screen — shows large number so user knows where to place -->
    <div class="text-center space-y-4">
      <p class="text-xs text-gray-500 uppercase tracking-widest">Place this phone in the grid</p>
      <div
        class="w-44 h-44 rounded-3xl flex items-center justify-center shadow-2xl border-4"
        style="background: {myColor}22; border-color: {myColor}"
      >
        <p class="text-8xl font-black" style="color: {myColor}">
          {displayNumber || "?"}
        </p>
      </div>
      {#if totalGroups > 1}
        <div
          class="inline-block px-4 py-1 rounded-full text-sm font-bold"
          style="background: {myColor}33; color: {myColor}"
        >
          {groupLabel}
        </div>
      {/if}
      <p class="text-gray-400 text-sm">
        Position <strong style="color: {myColor}">{displayNumber}</strong> in the {gridLayout.cols}×{gridLayout.rows} grid
      </p>
      <p class="text-xs text-gray-600">
        {gameMode === "speed_tap" ? "⚡ Speed Tap Mode" : "🎨 Color Sequence Mode"}
      </p>
      <p class="text-xs text-gray-500 mt-2">
        Look at the TV for the grid layout
      </p>
    </div>

  {:else if subPhase === "waiting_admin"}
    <!-- Waiting for admin to confirm grid placement -->
    <div class="text-center space-y-4">
      <div
        class="w-32 h-32 rounded-3xl flex items-center justify-center shadow-lg border-4 mx-auto"
        style="background: {myColor}22; border-color: {myColor}"
      >
        <p class="text-6xl font-black" style="color: {myColor}">
          {displayNumber || "?"}
        </p>
      </div>
      <p class="text-gray-400 text-sm">Phone placed in position <strong style="color: {myColor}">{displayNumber}</strong></p>
      {#if isHost}
        <div class="space-y-3 mt-4">
          <p class="text-sm text-cyan-400 font-semibold">All phones in position?</p>
          <button
            class="px-8 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-white font-bold text-lg transition-colors shadow-lg"
            on:click={handleAdminGridReady}
          >
            Phones Are Ready ✓
          </button>
        </div>
      {:else}
        <p class="text-gray-500 text-sm animate-pulse">Waiting for host to confirm...</p>
      {/if}
    </div>

  {:else if subPhase === "white_ready"}
    <!-- All phones go white when round starts -->
    <div class="w-full h-full flex-1 flex flex-col items-center justify-center bg-white rounded-2xl">
      <p class="text-gray-800 text-sm font-medium animate-pulse">Get Ready...</p>
    </div>

  {:else if subPhase === "waiting"}
    <div class="text-center space-y-3">
      <p class="text-lg text-gray-400">Waiting...</p>
      {#if isMyTurn}
        <p class="text-sm text-gray-500">Get ready for your turn!</p>
      {:else}
        <p class="text-sm text-gray-500">Watch the TV for live action</p>
      {/if}
      {#if musicPlaying}
        <p class="text-xs text-gray-600">♪ Music playing...</p>
      {/if}
    </div>

  {:else if subPhase === "player_announce"}
    <!-- Showing who is going next with countdown -->
    <div class="text-center space-y-4">
      {#if isMyTurn}
        <p class="text-xs text-cyan-400 uppercase tracking-widest font-bold">Your Turn Next!</p>
        <p class="text-5xl font-black text-cyan-400">{announceCountdown}s</p>
        <p class="text-gray-400 text-sm">Get in position at the grid</p>
      {:else}
        <p class="text-xs text-gray-500 uppercase tracking-widest">Up Next</p>
        <div class="flex flex-col gap-2 items-center">
          {#each announcePlayerNames as name}
            <span class="px-4 py-2 rounded-full bg-gray-800 text-lg font-bold text-white">{name}</span>
          {/each}
        </div>
        <p class="text-2xl font-bold text-gray-400">{announceCountdown}s</p>
      {/if}
    </div>

  {:else if subPhase === "countdown"}
    <div class="text-center space-y-4">
      <p class="text-xs text-gray-500 uppercase tracking-widest">Your turn!</p>
      <p class="text-6xl font-black text-cyan-400 animate-pulse">Get Ready</p>
      {#if totalGroups > 1}
        <div class="flex gap-2 justify-center flex-wrap">
          {#each activeGroupPlayerNames as name}
            <span class="px-3 py-1 rounded-full bg-gray-800 text-sm text-gray-300">{name}</span>
          {/each}
        </div>
      {/if}
    </div>

  {:else if subPhase === "speed_tap"}
    <!-- Mode 1: Speed Tap - phone screen is the tap target -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
      class="w-full h-full flex-1 flex flex-col items-center justify-center rounded-2xl transition-colors duration-100"
      style="background: {isLit ? litColor : 'transparent'}"
      on:touchstart|preventDefault={handlePhoneTap}
      on:mousedown={handlePhoneTap}
    >
      {#if isLit}
        <div class="text-center space-y-4 pointer-events-none">
          <!-- Pulsing ring -->
          <div
            class="w-32 h-32 rounded-full mx-auto flex items-center justify-center animate-pulse"
            style="background: {litColor}; box-shadow: 0 0 60px {litColor}"
          >
            <p class="text-5xl font-black text-white">TAP!</p>
          </div>
          <!-- Progress -->
          <div class="w-48 mx-auto">
            <div class="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                class="h-full rounded-full transition-all duration-150"
                style="width: {tapProgressPct}%; background: white"
              ></div>
            </div>
            <p class="text-sm text-white mt-1">{myTapCount} / {totalTaps}</p>
          </div>
          {#if lastTapTimeMs > 0}
            <p class="text-xs text-white opacity-70">{lastTapTimeMs}ms</p>
          {/if}
        </div>
      {:else}
        <p class="text-gray-500 text-lg pointer-events-none">Waiting for next light...</p>
      {/if}
    </div>

  {:else if subPhase === "color_input"}
    <!-- Mode 2: Color Sequence - tap this phone to add it to the sequence -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
      class="w-full h-full flex-1 flex flex-col items-center justify-center gap-4 rounded-2xl"
      style="background: {myColor}15"
      on:touchstart|preventDefault={handlePhoneTap}
      on:mousedown={handlePhoneTap}
    >
      <div class="text-center space-y-4 pointer-events-none">
        <p class="text-xs text-gray-500 uppercase tracking-widest">Tap in sequence order</p>
        <div
          class="w-28 h-28 rounded-full mx-auto flex items-center justify-center border-4"
          style="background: {myColor}30; border-color: {myColor}"
        >
          <p class="text-4xl font-black" style="color: {myColor}">{displayNumber}</p>
        </div>
        <!-- Progress -->
        <div class="w-48 mx-auto">
          <div class="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-150 bg-cyan-500"
              style="width: {sequenceProgressPct}%"
            ></div>
          </div>
          <p class="text-sm text-gray-400 mt-1">{mySequenceTapCount} / {sequenceLength}</p>
        </div>
      </div>
    </div>

  {:else if subPhase === "group_results"}
    <div class="text-center space-y-4 w-full max-w-sm">
      <p class="text-xs text-gray-500 uppercase tracking-widest">Results</p>
      <ul class="space-y-2">
        {#each groupResults as result}
          <li class="flex justify-between items-center bg-gray-800 rounded-lg px-4 py-2">
            <span class="text-sm text-white font-medium">{result.playerName}</span>
            <span class="text-sm text-gray-400">
              {#if result.completionTimeMs !== undefined}
                {(Number(result.completionTimeMs) / 1000).toFixed(1)}s
              {:else if result.errors !== undefined}
                {result.errors} errors
              {/if}
            </span>
          </li>
        {/each}
      </ul>
    </div>

  {:else if subPhase === "round_scores"}
    <div class="text-center space-y-4 w-full max-w-sm">
      <p class="text-xs text-gray-500 uppercase tracking-widest">Round Scores</p>
      <div class="bg-gray-800 rounded-xl p-4">
        <p class="text-3xl font-black text-cyan-400">
          +{roundScores[me?.id ?? ""] ?? 0}
        </p>
        <p class="text-sm text-gray-400 mt-1">points this round</p>
      </div>
      <p class="text-sm text-gray-500">Total: {me?.score ?? 0}</p>
    </div>
  {/if}
</div>
