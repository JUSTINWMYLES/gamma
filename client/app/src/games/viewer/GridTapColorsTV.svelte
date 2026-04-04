<script lang="ts">
  /**
   * TV viewer component for "Grid Tap Colors" (registry-10).
   *
   * Shows the phone grid layout in real-time, active player progress,
   * color sequences (Mode 2), and group/round results.
   *
   * Server messages listened:
   *   grid_setup, grid_round_start, grid_group_start,
   *   grid_phone_state, grid_tap_progress, grid_player_complete,
   *   grid_group_results, grid_round_scores,
   *   grid_sequence_show, grid_sequence_memorize,
   *   grid_sequence_input_start, grid_sequence_tap_progress,
   *   grid_player_sequence_complete, grid_music
   */
  import { onMount, onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState } from "../../../../shared/types";

  export let room: Room;
  export let state: RoomState;

  // ── Sub-phase state ──────────────────────────────────────────────

  type SubPhase =
    | "setup"
    | "waiting"
    | "playing"
    | "showing_sequence"
    | "memorize"
    | "sequence_input"
    | "group_results"
    | "round_scores";

  let subPhase: SubPhase = "setup";

  // ── Setup ──────────────────────────────────────────────────────

  interface PhoneDisplay {
    phoneId: string;
    displayNumber: number;
    color: string;
    groupIndex: number;
    lit: boolean;
    litColor: string;
  }

  let phones: PhoneDisplay[] = [];
  let concurrentPlayers = 1;
  let gameMode: "speed_tap" | "color_sequence" = "speed_tap";
  let totalTaps = 10;

  // ── Active group ────────────────────────────────────────────────

  let activePlayerIds: string[] = [];
  let activePlayerNames: string[] = [];
  let currentRound = 0;
  let currentGroupIndex = 0;

  // ── Player progress (Mode 1) ────────────────────────────────────

  interface PlayerProgress {
    playerId: string;
    playerName: string;
    tapCount: number;
    totalTaps: number;
    lastTapTimeMs: number;
    completed: boolean;
    completionTimeMs: number;
  }

  let playerProgressMap: Map<string, PlayerProgress> = new Map();

  // ── Color sequence (Mode 2) ─────────────────────────────────────

  interface SequenceStep {
    phoneIndex: number;
    color: string;
  }

  let sequenceSteps: SequenceStep[] = [];
  let currentSequenceIndex = -1;
  let sequenceDisplayInterval: ReturnType<typeof setInterval> | null = null;

  // ── Sequence player progress (Mode 2) ───────────────────────────

  interface SequencePlayerProgress {
    playerId: string;
    playerName: string;
    tapCount: number;
    totalSteps: number;
    completed: boolean;
    errors: number;
  }

  let sequencePlayerMap: Map<string, SequencePlayerProgress> = new Map();

  // ── Results ─────────────────────────────────────────────────────

  let groupResults: Array<{
    playerId: string;
    playerName: string;
    [key: string]: unknown;
  }> = [];
  let roundScores: Record<string, number> = {};

  // ── Music placeholder ───────────────────────────────────────────
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
    phones = data.phoneAssignments.map((a) => ({
      ...a,
      lit: false,
      litColor: a.color,
    }));
    concurrentPlayers = data.concurrentPlayers;
    gameMode = data.gameMode === "color_sequence" ? "color_sequence" : "speed_tap";
    totalTaps = data.totalTaps;
    subPhase = "setup";
  }

  function onRoundStart(data: {
    round: number;
    gameMode: string;
    totalTaps: number;
  }) {
    currentRound = data.round;
    gameMode = data.gameMode === "color_sequence" ? "color_sequence" : "speed_tap";
    totalTaps = data.totalTaps;
    playerProgressMap.clear();
    sequencePlayerMap.clear();
    // Reset all phone lights
    for (const phone of phones) {
      phone.lit = false;
    }
    subPhase = "waiting";
  }

  function onGroupStart(data: {
    round: number;
    groupIndex: number;
    playerIds: string[];
    playerNames: string[];
  }) {
    currentGroupIndex = data.groupIndex;
    activePlayerIds = data.playerIds;
    activePlayerNames = data.playerNames;
    playerProgressMap.clear();
    sequencePlayerMap.clear();

    // Initialize progress for each player
    for (let i = 0; i < data.playerIds.length; i++) {
      if (gameMode === "speed_tap") {
        playerProgressMap.set(data.playerIds[i], {
          playerId: data.playerIds[i],
          playerName: data.playerNames[i],
          tapCount: 0,
          totalTaps,
          lastTapTimeMs: 0,
          completed: false,
          completionTimeMs: 0,
        });
      } else {
        sequencePlayerMap.set(data.playerIds[i], {
          playerId: data.playerIds[i],
          playerName: data.playerNames[i],
          tapCount: 0,
          totalSteps: 0,
          completed: false,
          errors: 0,
        });
      }
    }
    // Re-assign to trigger Svelte reactivity (Maps are not natively reactive)
    playerProgressMap = playerProgressMap;
    sequencePlayerMap = sequencePlayerMap;
    subPhase = "playing";
  }

  function onPhoneState(data: {
    playerId: string;
    phoneIndex: number;
    color: string;
    lit: boolean;
  }) {
    if (data.phoneIndex >= 0 && data.phoneIndex < phones.length) {
      phones[data.phoneIndex].lit = data.lit;
      phones[data.phoneIndex].litColor = data.color;
      phones = phones; // trigger reactivity
    }
  }

  function onTapProgress(data: {
    playerId: string;
    playerName: string;
    tapNumber: number;
    totalTaps: number;
    tapTimeMs: number;
  }) {
    const existing = playerProgressMap.get(data.playerId);
    if (existing) {
      existing.tapCount = data.tapNumber;
      existing.totalTaps = data.totalTaps;
      existing.lastTapTimeMs = data.tapTimeMs;
      playerProgressMap = playerProgressMap; // trigger reactivity
    }
  }

  function onPlayerComplete(data: {
    playerId: string;
    playerName: string;
    completionTimeMs: number;
  }) {
    const existing = playerProgressMap.get(data.playerId);
    if (existing) {
      existing.completed = true;
      existing.completionTimeMs = data.completionTimeMs;
      playerProgressMap = playerProgressMap;
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

  function onSequenceShow(data: {
    round: number;
    groupIndex: number;
    sequence: SequenceStep[];
    displayTimePerStepMs: number;
  }) {
    sequenceSteps = data.sequence;
    currentSequenceIndex = -1;
    subPhase = "showing_sequence";

    // Animate sequence display
    let idx = 0;
    if (sequenceDisplayInterval) clearInterval(sequenceDisplayInterval);
    sequenceDisplayInterval = setInterval(() => {
      if (idx >= sequenceSteps.length) {
        if (sequenceDisplayInterval) {
          clearInterval(sequenceDisplayInterval);
          sequenceDisplayInterval = null;
        }
        currentSequenceIndex = -1;
        return;
      }
      currentSequenceIndex = idx;
      idx++;
    }, data.displayTimePerStepMs);
  }

  function onSequenceMemorize(_data: {
    round: number;
    groupIndex: number;
    bufferMs: number;
  }) {
    subPhase = "memorize";
    currentSequenceIndex = -1;
  }

  function onSequenceInputStart(data: {
    playerIds: string[];
    sequenceLength: number;
    timeoutMs: number;
  }) {
    subPhase = "sequence_input";
    for (const pid of data.playerIds) {
      const existing = sequencePlayerMap.get(pid);
      if (existing) {
        existing.totalSteps = data.sequenceLength;
      }
    }
    sequencePlayerMap = sequencePlayerMap;
  }

  function onSequenceTapProgress(data: {
    playerId: string;
    playerName: string;
    tapCount: number;
    totalSteps: number;
  }) {
    const existing = sequencePlayerMap.get(data.playerId);
    if (existing) {
      existing.tapCount = data.tapCount;
      existing.totalSteps = data.totalSteps;
      sequencePlayerMap = sequencePlayerMap;
    }
  }

  function onPlayerSequenceComplete(data: {
    playerId: string;
    playerName: string;
    errors: number;
    totalSteps: number;
  }) {
    const existing = sequencePlayerMap.get(data.playerId);
    if (existing) {
      existing.completed = true;
      existing.errors = data.errors;
      sequencePlayerMap = sequencePlayerMap;
    }
  }

  function onMusic(data: { action: string; track: string }) {
    musicPlaying = data.action === "play";
  }

  // ── Lifecycle ───────────────────────────────────────────────────

  onMount(() => {
    room.onMessage("grid_setup", onSetup);
    room.onMessage("grid_round_start", onRoundStart);
    room.onMessage("grid_group_start", onGroupStart);
    room.onMessage("grid_phone_state", onPhoneState);
    room.onMessage("grid_tap_progress", onTapProgress);
    room.onMessage("grid_player_complete", onPlayerComplete);
    room.onMessage("grid_group_results", onGroupResults);
    room.onMessage("grid_round_scores", onRoundScores);
    room.onMessage("grid_sequence_show", onSequenceShow);
    room.onMessage("grid_sequence_memorize", onSequenceMemorize);
    room.onMessage("grid_sequence_input_start", onSequenceInputStart);
    room.onMessage("grid_sequence_tap_progress", onSequenceTapProgress);
    room.onMessage("grid_player_sequence_complete", onPlayerSequenceComplete);
    room.onMessage("grid_music", onMusic);
  });

  onDestroy(() => {
    if (sequenceDisplayInterval) clearInterval(sequenceDisplayInterval);
  });

  // ── Derived ─────────────────────────────────────────────────────

  $: gridCols = phones.length <= 4 ? 2 : phones.length <= 9 ? 3 : 4;
  $: progressEntries = [...playerProgressMap.values()];
  $: sequenceProgressEntries = [...sequencePlayerMap.values()];
  $: sortedPlayers = [...state.players.values()].sort((a, b) => b.score - a.score);
</script>

<div class="flex-1 flex flex-col bg-gray-950 text-white p-6" data-testid="grid-tap-colors-tv">

  <!-- Header -->
  <div class="flex justify-between items-center mb-4">
    <div>
      <h1 class="text-2xl font-black text-cyan-400">Grid Tap Colors</h1>
      <p class="text-sm text-gray-500">
        {gameMode === "speed_tap" ? "Mode: Speed Tap" : "Mode: Color Sequence"}
        {#if currentRound > 0}
          — Round {currentRound}
        {/if}
      </p>
    </div>
    {#if musicPlaying}
      <span class="text-xs text-gray-600">♪ Music</span>
    {/if}
  </div>

  <div class="flex-1 flex gap-6">
    <!-- Left: Phone Grid Visualization -->
    <div class="flex-1 flex items-center justify-center">
      {#if subPhase === "setup"}
        <div class="text-center space-y-6">
          <h2 class="text-3xl font-black text-white">Place Your Phones</h2>
          <p class="text-gray-400">Each phone is showing a number — place them in the grid</p>
          <div
            class="grid gap-3 mx-auto"
            style="grid-template-columns: repeat({gridCols}, minmax(0, 1fr)); max-width: {gridCols * 100}px"
          >
            {#each phones as phone}
              <div
                class="aspect-[3/4] rounded-xl border-2 flex flex-col items-center justify-center gap-1"
                style="border-color: {phone.color}; background: {phone.color}15"
              >
                <span class="text-3xl font-black" style="color: {phone.color}">{phone.displayNumber}</span>
                {#if concurrentPlayers > 1}
                  <span class="text-xs px-2 py-0.5 rounded-full" style="background: {phone.color}33; color: {phone.color}">
                    G{phone.groupIndex + 1}
                  </span>
                {/if}
              </div>
            {/each}
          </div>
        </div>

      {:else if subPhase === "showing_sequence"}
        <!-- Mode 2: Showing the color sequence on TV -->
        <div class="text-center space-y-6 w-full">
          <h2 class="text-2xl font-bold text-yellow-400">Memorize This Sequence!</h2>
          <div class="flex gap-3 justify-center flex-wrap">
            {#each sequenceSteps as step, i}
              <div
                class="w-16 h-16 rounded-xl flex items-center justify-center transition-all duration-200 border-2"
                style="
                  background: {i === currentSequenceIndex ? step.color : step.color + '20'};
                  border-color: {step.color};
                  transform: {i === currentSequenceIndex ? 'scale(1.2)' : 'scale(1)'};
                  opacity: {i <= currentSequenceIndex ? 1 : 0.3};
                "
              >
                <span class="text-white font-black text-lg">{i + 1}</span>
              </div>
            {/each}
          </div>
          <!-- Also show the grid with active phone highlighted -->
          <div
            class="grid gap-2 mx-auto mt-4"
            style="grid-template-columns: repeat({gridCols}, minmax(0, 1fr)); max-width: {gridCols * 80}px"
          >
            {#each phones as phone, pi}
              <div
                class="aspect-square rounded-lg border flex items-center justify-center transition-all duration-200"
                style="
                  border-color: {phone.color};
                  background: {currentSequenceIndex >= 0 && sequenceSteps[currentSequenceIndex]?.phoneIndex === pi
                    ? phone.color
                    : phone.color + '15'};
                "
              >
                <span class="text-sm font-bold" style="color: {phone.color}">{phone.displayNumber}</span>
              </div>
            {/each}
          </div>
        </div>

      {:else if subPhase === "memorize"}
        <div class="text-center space-y-4">
          <h2 class="text-3xl font-black text-yellow-400 animate-pulse">Memorize!</h2>
          <p class="text-gray-400">Sequence is about to start — remember the order!</p>
          <div class="flex gap-3 justify-center flex-wrap">
            {#each sequenceSteps as step, i}
              <div
                class="w-14 h-14 rounded-xl flex items-center justify-center border-2"
                style="background: {step.color}30; border-color: {step.color}"
              >
                <span class="text-white font-black">{i + 1}</span>
              </div>
            {/each}
          </div>
        </div>

      {:else}
        <!-- Active phone grid -->
        <div
          class="grid gap-3 mx-auto"
          style="grid-template-columns: repeat({gridCols}, minmax(0, 1fr)); max-width: {gridCols * 90}px"
        >
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
              <span
                class="text-2xl font-black transition-colors duration-150"
                style="color: {phone.lit ? 'white' : phone.color}"
              >{phone.displayNumber}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Right: Player progress & scores sidebar -->
    <div class="w-64 flex-shrink-0 flex flex-col gap-4">

      <!-- Active players -->
      {#if subPhase === "playing" || subPhase === "sequence_input"}
        <div>
          <p class="text-xs text-gray-500 uppercase tracking-widest mb-2">
            {concurrentPlayers > 1 ? `Group ${currentGroupIndex + 1}` : "Now Playing"}
          </p>

          {#if gameMode === "speed_tap"}
            {#each progressEntries as p}
              <div class="bg-gray-800 rounded-lg p-3 mb-2">
                <div class="flex justify-between items-center mb-1">
                  <span class="text-sm font-bold text-white">{p.playerName}</span>
                  <span class="text-xs text-gray-400">
                    {p.tapCount}/{p.totalTaps}
                  </span>
                </div>
                <div class="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all duration-150 bg-cyan-500"
                    style="width: {p.totalTaps > 0 ? (p.tapCount / p.totalTaps) * 100 : 0}%"
                  ></div>
                </div>
                {#if p.lastTapTimeMs > 0}
                  <p class="text-xs text-gray-500 mt-1">{p.lastTapTimeMs}ms</p>
                {/if}
                {#if p.completed}
                  <p class="text-xs text-green-400 font-bold mt-1">
                    ✓ {(p.completionTimeMs / 1000).toFixed(1)}s
                  </p>
                {/if}
              </div>
            {/each}
          {:else}
            {#each sequenceProgressEntries as p}
              <div class="bg-gray-800 rounded-lg p-3 mb-2">
                <div class="flex justify-between items-center mb-1">
                  <span class="text-sm font-bold text-white">{p.playerName}</span>
                  <span class="text-xs text-gray-400">
                    {p.tapCount}/{p.totalSteps}
                  </span>
                </div>
                <div class="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all duration-150 bg-purple-500"
                    style="width: {p.totalSteps > 0 ? (p.tapCount / p.totalSteps) * 100 : 0}%"
                  ></div>
                </div>
                {#if p.completed}
                  <p class="text-xs {p.errors === 0 ? 'text-green-400' : 'text-yellow-400'} font-bold mt-1">
                    {p.errors === 0 ? "✓ Perfect!" : `${p.errors} errors`}
                  </p>
                {/if}
              </div>
            {/each}
          {/if}
        </div>
      {/if}

      <!-- Group results -->
      {#if subPhase === "group_results"}
        <div>
          <p class="text-xs text-gray-500 uppercase tracking-widest mb-2">Results</p>
          {#each groupResults as result}
            <div class="bg-gray-800 rounded-lg p-3 mb-2">
              <span class="text-sm font-bold text-white">{result.playerName}</span>
              <span class="text-xs text-gray-400 ml-2">
                {#if result.completionTimeMs !== undefined}
                  {(Number(result.completionTimeMs) / 1000).toFixed(1)}s
                {/if}
                {#if result.errors !== undefined}
                  · {result.errors} errors
                {/if}
              </span>
            </div>
          {/each}
        </div>
      {/if}

      <!-- Round scores -->
      {#if subPhase === "round_scores"}
        <div>
          <p class="text-xs text-gray-500 uppercase tracking-widest mb-2">Round Scores</p>
          {#each sortedPlayers as p}
            <div class="flex justify-between items-center bg-gray-800 rounded-lg px-3 py-2 mb-1">
              <span class="text-sm text-white">{p.name}</span>
              <div class="text-right">
                {#if roundScores[p.id] !== undefined}
                  <span class="text-xs text-cyan-400 font-bold">+{roundScores[p.id]}</span>
                {/if}
                <span class="text-xs text-gray-400 ml-2">{p.score}</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}

      <!-- Overall scoreboard (always visible) -->
      <div class="mt-auto">
        <p class="text-xs text-gray-500 uppercase tracking-widest mb-2">Leaderboard</p>
        {#each sortedPlayers.slice(0, 8) as p, i}
          <div class="flex items-center gap-2 px-2 py-1">
            <span class="text-xs text-gray-500 font-mono w-4">{i + 1}.</span>
            <span class="flex-1 text-sm text-gray-300 truncate">{p.name}</span>
            <span class="text-xs font-mono text-gray-400">{p.score}</span>
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>
