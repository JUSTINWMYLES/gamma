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
   *   grid_sequence_memorize, grid_player_sequence_complete, grid_music
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
    | "waiting"         // Waiting for turn
    | "countdown"       // Group about to start
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

  // ── Phone state (is this phone lit?) ────────────────────────────

  let isLit = false;
  let litColor = "";
  let litForPlayerId = "";

  // ── Speed Tap state ─────────────────────────────────────────────

  let myTapCount = 0;
  let lastTapTimeMs = 0;

  // ── Color Sequence state ────────────────────────────────────────

  let sequenceLength = 0;
  let mySequenceTapCount = 0;
  let sequenceTimeoutMs = 30000;
  let colorHint = "";
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

  // ── Music ───────────────────────────────────────────────────────
  // Placeholder — no actual audio loaded yet
  let musicPlaying = false;

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
  }) {
    gameMode = data.gameMode === "color_sequence" ? "color_sequence" : "speed_tap";
    totalTaps = data.totalTaps;
    subPhase = "setup";
  }

  function onPhoneAssignment(data: {
    displayNumber: number;
    color: string;
    groupIndex: number;
    totalGroups: number;
  }) {
    displayNumber = data.displayNumber;
    myColor = data.color;
    myGroupIndex = data.groupIndex;
    totalGroups = data.totalGroups;
    subPhase = "setup";
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
    subPhase = "waiting";
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
    if (isMyTurn) {
      subPhase = "countdown";
      myTapCount = 0;
      mySequenceTapCount = 0;
      sequenceSubmitted = false;
    }
  }

  function onPhoneLight(data: {
    playerId: string;
    phoneIndex: number;
    color: string;
    lit: boolean;
  }) {
    // Only react if we're in speed tap mode and this phone (me) is being lit
    isLit = data.lit;
    litColor = data.color;
    litForPlayerId = data.playerId;

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
    // This player finished their speed tap run
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
    sequenceTimeoutMs = data.timeoutMs;
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

  function onPhoneColorHint(data: {
    color: string;
    displayNumber: number;
  }) {
    colorHint = data.color;
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
    // TODO: Play actual game music when a track is selected
  }

  // ── Actions ─────────────────────────────────────────────────────

  function handlePhoneTap() {
    if (gameMode === "speed_tap" && isLit) {
      // Find my phone index from display number
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
    room.onMessage("grid_phone_color_hint", onPhoneColorHint);
    room.onMessage("grid_player_sequence_complete", onPlayerSequenceComplete);
    room.onMessage("grid_music", onMusic);
  });

  onDestroy(() => {
    // Cleanup handled by Colyseus
  });

  // ── Derived ─────────────────────────────────────────────────────

  $: tapProgressPct = totalTaps > 0 ? (myTapCount / totalTaps) * 100 : 0;
  $: sequenceProgressPct = sequenceLength > 0 ? (mySequenceTapCount / sequenceLength) * 100 : 0;
  $: groupLabel = totalGroups > 1 ? `Group ${myGroupIndex + 1}` : "";
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-4 p-4 select-none" data-testid="grid-tap-colors">

  {#if subPhase === "setup"}
    <!-- Phone placement screen -->
    <div class="text-center space-y-4">
      <p class="text-xs text-gray-500 uppercase tracking-widest">Place this phone</p>
      <div
        class="w-40 h-40 rounded-3xl flex items-center justify-center shadow-2xl border-4"
        style="background: {myColor}22; border-color: {myColor}"
      >
        <p class="text-7xl font-black" style="color: {myColor}">
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
        Place this phone face-up in position <strong>{displayNumber}</strong>
      </p>
      <p class="text-xs text-gray-600">
        {gameMode === "speed_tap" ? "Mode: Speed Tap" : "Mode: Color Sequence"}
      </p>
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
      style="background: {isLit ? litColor + '40' : 'transparent'}"
      on:touchstart|preventDefault={handlePhoneTap}
      on:mousedown={handlePhoneTap}
    >
      {#if isLit}
        <div class="text-center space-y-4 pointer-events-none">
          <!-- Pulsing ring -->
          <div
            class="w-32 h-32 rounded-full mx-auto flex items-center justify-center animate-pulse"
            style="background: {litColor}; box-shadow: 0 0 40px {litColor}88"
          >
            <p class="text-5xl font-black text-white">TAP!</p>
          </div>
          <!-- Progress -->
          <div class="w-48 mx-auto">
            <div class="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                class="h-full rounded-full transition-all duration-150"
                style="width: {tapProgressPct}%; background: {litColor}"
              ></div>
            </div>
            <p class="text-sm text-gray-400 mt-1">{myTapCount} / {totalTaps}</p>
          </div>
          {#if lastTapTimeMs > 0}
            <p class="text-xs text-gray-500">{lastTapTimeMs}ms</p>
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
