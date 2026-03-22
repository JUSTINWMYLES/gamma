<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState } from "../../../../shared/types";
  import CampfireCanvas from "../shared/CampfireCanvas.svelte";

  export let room: Room;
  export let state: RoomState;

  type FireStage = "strike" | "blow" | "shake" | "extinguish";
  type GamePhase = "waiting" | "active" | "stage_complete" | "round_success" | "round_done";

  let phase: GamePhase = "waiting";
  let currentStage: FireStage = "strike";
  let stageIndex = 0;
  let totalStages = 4;

  let target = 0;
  let current = 0;
  let fireLevel = 0;
  let invertedProgress = false;
  let timeLeft = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let endAt = 0;

  let standings: { playerId: string; playerName: string; contribution: number }[] = [];

  // Campfire intensity (same mapping as player component)
  const STAGE_INTENSITY: Record<FireStage, [number, number]> = {
    strike:     [0.0,  0.15],
    blow:       [0.15, 0.45],
    shake:      [0.45, 0.85],
    extinguish: [0.85, 0.0],
  };
  let fireIntensity = 0;

  $: {
    const [from, to] = STAGE_INTENSITY[currentStage] ?? [0, 0];
    const pct = target > 0
      ? invertedProgress
        ? 1 - fireLevel / target
        : current / target
      : 0;
    const clampedPct = Math.max(0, Math.min(1, pct));
    fireIntensity = from + (to - from) * clampedPct;
  }

  const STAGE_LABELS: Record<FireStage, string> = {
    strike: "Striking the Match",
    blow: "Blowing on the Fire",
    shake: "Fanning the Flames",
    extinguish: "Putting Out the Fire",
  };

  const STAGE_EMOJIS: Record<FireStage, string> = {
    strike: "🔥",
    blow: "💨",
    shake: "📳",
    extinguish: "🧯",
  };

  function startTimer(durationMs: number, serverTimestamp: number) {
    endAt = serverTimestamp + durationMs;
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      timeLeft = Math.max(0, (endAt - Date.now()) / 1000);
    }, 100);
  }

  function clearTimerInterval() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  const stageNames: FireStage[] = ["strike", "blow", "shake", "extinguish"];

  onMount(() => {
    room.onMessage("fire_round_start", () => {
      phase = "waiting";
      fireIntensity = 0;
    });

    room.onMessage("fire_stage_start", (d: {
      stage: FireStage;
      stageIndex: number;
      totalStages: number;
      target: number;
      durationMs: number;
      serverTimestamp: number;
      invertedProgress: boolean;
    }) => {
      phase = "active";
      currentStage = d.stage;
      stageIndex = d.stageIndex;
      totalStages = d.totalStages;
      target = d.target;
      current = 0;
      fireLevel = d.invertedProgress ? d.target : 0;
      invertedProgress = d.invertedProgress;
      standings = [];
      startTimer(d.durationMs, d.serverTimestamp);
    });

    room.onMessage("fire_stage_update", (d: {
      stage: FireStage;
      current: number;
      target: number;
      fireLevel: number;
      timeLeftMs: number;
      standings: { playerId: string; playerName: string; contribution: number }[];
      invertedProgress: boolean;
    }) => {
      current = d.current;
      target = d.target;
      fireLevel = d.fireLevel;
      invertedProgress = d.invertedProgress;
      timeLeft = Math.max(0, d.timeLeftMs / 1000);
      standings = [...d.standings].sort((a, b) => b.contribution - a.contribution);
    });

    room.onMessage("fire_stage_end", (d: { stage: FireStage; success: boolean }) => {
      phase = "stage_complete";
      clearTimerInterval();
    });

    room.onMessage("fire_round_success", () => {
      phase = "round_success";
      clearTimerInterval();
    });

    room.onMessage("fire_round_done", () => {
      phase = "round_done";
      clearTimerInterval();
    });
  });

  onDestroy(() => {
    clearTimerInterval();
  });

  $: percent = target > 0
    ? invertedProgress
      ? Math.min(100, (1 - fireLevel / target) * 100)
      : Math.min(100, (current / target) * 100)
    : 0;
</script>

<div class="flex-1 flex flex-col items-center justify-center p-10 gap-6">
  <h1 class="text-5xl font-black text-orange-400">Camp Fire</h1>

  <!-- Stage progress bar -->
  <div class="flex items-center gap-3">
    {#each stageNames as sn, i}
      <div class="flex items-center gap-2">
        <div
          class="w-5 h-5 rounded-full flex items-center justify-center text-xs transition-all
            {i < stageIndex ? 'bg-green-500 text-white' : i === stageIndex && phase === 'active' ? 'bg-orange-500 text-white animate-pulse' : 'bg-gray-700 text-gray-400'}"
        >
          {i < stageIndex ? '✓' : i + 1}
        </div>
        <span class="text-sm uppercase tracking-wider {i === stageIndex ? 'text-orange-300 font-bold' : 'text-gray-500'}">{sn}</span>
      </div>
      {#if i < stageNames.length - 1}
        <div class="w-8 h-0.5 {i < stageIndex ? 'bg-green-500' : 'bg-gray-700'}"></div>
      {/if}
    {/each}
  </div>

  <!-- Main content area: campfire + stats side by side -->
  <div class="flex items-center gap-10">
    <!-- Campfire -->
    <div class="flex-shrink-0">
      <CampfireCanvas intensity={fireIntensity} width={400} height={450} />
    </div>

    <!-- Stats panel -->
    <div class="flex flex-col gap-6 min-w-[300px]">
      {#if phase === "active"}
        <!-- Stage label -->
        <div class="text-center">
          <p class="text-3xl font-black text-yellow-300">
            {STAGE_EMOJIS[currentStage]} {STAGE_LABELS[currentStage]}
          </p>
        </div>

        <!-- Timer -->
        <p class="text-center text-7xl font-mono font-black {timeLeft < 5 ? 'text-red-400 animate-pulse' : 'text-white'}">
          {Math.ceil(timeLeft)}
        </p>

        <!-- Progress bar -->
        <div class="w-full bg-gray-800 border border-gray-700 rounded-2xl p-4">
          <div class="flex justify-between text-gray-300 mb-2 text-sm">
            <span>Progress</span>
            <span>{Math.round(percent)}%</span>
          </div>
          <div class="h-6 bg-gray-700 rounded-full overflow-hidden">
            <div
              class="h-full transition-all duration-150 rounded-full {invertedProgress ? 'bg-gradient-to-r from-red-500 via-orange-400 to-yellow-300' : 'bg-gradient-to-r from-orange-500 via-amber-400 to-yellow-300'}"
              style="width:{percent}%"
            ></div>
          </div>
        </div>

      {:else if phase === "stage_complete"}
        <p class="text-3xl font-black text-green-400 text-center">Stage Complete!</p>
        <p class="text-xl text-gray-400 text-center">Next stage starting...</p>

      {:else if phase === "round_success"}
        <p class="text-4xl font-black text-green-400 text-center">All Stages Cleared!</p>

      {:else if phase === "round_done"}
        <p class="text-4xl font-black text-red-400 text-center">Round Over!</p>

      {:else}
        <p class="text-2xl text-gray-400 text-center">Get ready...</p>
      {/if}

      <!-- Contributions leaderboard -->
      {#if standings.length > 0}
        <div class="w-full bg-gray-800 border border-gray-700 rounded-xl p-4">
          <p class="text-xs uppercase tracking-widest text-gray-400 mb-3">Contributions</p>
          <div class="space-y-2">
            {#each standings as s}
              <div class="flex items-center gap-3">
                <span class="flex-1 text-white font-semibold truncate">{s.playerName}</span>
                <span class="font-mono text-orange-300">{s.contribution}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>
