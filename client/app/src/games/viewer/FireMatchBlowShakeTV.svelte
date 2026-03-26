<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState } from "../../../../shared/types";
  import CampfireCanvas from "../shared/CampfireCanvas.svelte";

  export let room: Room;
  export let state: RoomState;

  type FireStage = "strike" | "blow" | "shake" | "extinguish";
  type GamePhase = "waiting" | "active" | "round_end";

  let phase: GamePhase = "waiting";
  let totalStages = 4;

  // Timer
  let timeLeft = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let endAt = 0;

  // Per-player states from server updates.
  interface PlayerDisplay {
    playerId: string;
    playerName: string;
    stageIndex: number;
    stage: FireStage | null;
    current: number;
    target: number;
    totalContribution: number;
    finished: boolean;
  }
  let players: PlayerDisplay[] = [];

  // Round-end results.
  interface RoundResult {
    playerId: string;
    playerName: string;
    finished: boolean;
    stagesCompleted: number;
    totalContribution: number;
  }
  let roundResults: RoundResult[] = [];
  let allFinished = false;

  // Per-player campfire intensity calculation
  const STAGE_INTENSITY: Record<FireStage, [number, number]> = {
    strike:     [0.0,  0.25],
    blow:       [0.25, 0.60],
    shake:      [0.60, 1.0],
    extinguish: [1.0,  0.0],
  };

  /** Compute fire intensity for a single player. */
  function playerIntensity(p: PlayerDisplay): number {
    if (p.finished) return 0;
    if (!p.stage) return 0;
    const [from, to] = STAGE_INTENSITY[p.stage] ?? [0, 0];
    const pct = p.target > 0 ? Math.min(1, p.current / p.target) : 0;
    return from + (to - from) * pct;
  }

  // Canvas size adapts to number of players
  $: campfireSize = players.length <= 2 ? 280 : players.length <= 4 ? 200 : 160;

  const STAGE_LABELS: Record<FireStage, string> = {
    strike: "Strike",
    blow: "Blow",
    shake: "Shake",
    extinguish: "Extinguish",
  };

  const STAGE_EMOJIS: Record<FireStage, string> = {
    strike: "🔥",
    blow: "💨",
    shake: "📳",
    extinguish: "🧯",
  };

  function startTimer(totalDurationMs: number, serverTimestamp: number) {
    endAt = serverTimestamp + totalDurationMs;
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
    room.onMessage("fire_round_start", (d: {
      totalStages: number;
      totalDurationMs: number;
      serverTimestamp: number;
      players: { playerId: string; playerName: string; stageIndex: number; stage: string; current: number; target: number; finished: boolean }[];
    }) => {
      phase = "active";
      totalStages = d.totalStages;
      roundResults = [];
      allFinished = false;

      players = d.players.map((p) => ({
        playerId: p.playerId,
        playerName: p.playerName,
        stageIndex: p.stageIndex,
        stage: p.stage as FireStage,
        current: p.current,
        target: p.target,
        totalContribution: 0,
        finished: p.finished,
      }));

      startTimer(d.totalDurationMs, d.serverTimestamp);
    });

    room.onMessage("fire_update", (d: {
      timeLeftMs: number;
      players: { playerId: string; playerName: string; stageIndex: number; stage: string | null; current: number; target: number; totalContribution: number; finished: boolean }[];
    }) => {
      timeLeft = Math.max(0, d.timeLeftMs / 1000);
      players = d.players.map((p) => ({
        playerId: p.playerId,
        playerName: p.playerName,
        stageIndex: p.stageIndex,
        stage: p.stage as FireStage | null,
        current: p.current,
        target: p.target,
        totalContribution: p.totalContribution,
        finished: p.finished,
      }));
    });

    room.onMessage("fire_round_end", (d: {
      allFinished: boolean;
      playerResults: { playerId: string; playerName: string; finished: boolean; stagesCompleted: number; totalContribution: number }[];
    }) => {
      phase = "round_end";
      allFinished = d.allFinished;
      roundResults = d.playerResults.sort((a, b) => {
        if (a.finished !== b.finished) return a.finished ? -1 : 1;
        return b.stagesCompleted - a.stagesCompleted || b.totalContribution - a.totalContribution;
      });
      clearTimerInterval();
    });
  });

  onDestroy(() => {
    clearTimerInterval();
  });
</script>

<div class="flex-1 flex flex-col items-center justify-center p-8 gap-6">
  <h1 class="text-5xl font-black text-orange-400">Camp Fire</h1>

  {#if phase === "active"}
    <!-- Timer -->
    <p class="text-7xl font-mono font-black {timeLeft < 10 ? 'text-red-400 animate-pulse' : 'text-white'}">
      {Math.ceil(timeLeft)}
    </p>

    <!-- Individual campfires for each player -->
    <div class="flex flex-wrap items-start justify-center gap-6 w-full max-w-6xl">
      {#each players as p}
        <div class="flex flex-col items-center gap-2 {p.finished ? 'opacity-60' : ''}">
          <!-- Player campfire -->
          <CampfireCanvas intensity={playerIntensity(p)} width={campfireSize} height={Math.round(campfireSize * 1.15)} />

          <!-- Player name + status -->
          <div class="text-center">
            <p class="font-bold text-white text-sm truncate max-w-[180px]">{p.playerName}</p>
            {#if p.finished}
              <p class="text-green-400 text-xs font-bold uppercase">Done!</p>
            {:else if p.stage}
              <p class="text-orange-300 text-xs">
                {STAGE_EMOJIS[p.stage]} {STAGE_LABELS[p.stage]}
              </p>
            {/if}
          </div>

          <!-- Stage dots -->
          <div class="flex items-center gap-1">
            {#each stageNames as sn, i}
              <div class="w-2.5 h-2.5 rounded-full transition-all
                {i < p.stageIndex ? 'bg-green-400' :
                 i === p.stageIndex && !p.finished ? 'bg-orange-400 animate-pulse' :
                 p.finished ? 'bg-green-400' : 'bg-gray-600'}"></div>
              {#if i < stageNames.length - 1}
                <div class="w-2 h-px {i < p.stageIndex ? 'bg-green-400' : 'bg-gray-700'}"></div>
              {/if}
            {/each}
          </div>

          <!-- Progress bar -->
          {#if !p.finished && p.target > 0}
            {@const pct = Math.min(100, (p.current / p.target) * 100)}
            <div class="w-full max-w-[180px] h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                class="h-full transition-all duration-150 rounded-full bg-gradient-to-r from-orange-500 to-yellow-400"
                style="width:{pct}%"
              ></div>
            </div>
          {:else if p.finished}
            <div class="w-full max-w-[180px] h-2 bg-green-500/30 rounded-full overflow-hidden">
              <div class="h-full bg-green-400 rounded-full" style="width:100%"></div>
            </div>
          {/if}

          <p class="text-[10px] text-gray-500">Effort: {p.totalContribution}</p>
        </div>
      {/each}
    </div>

  {:else if phase === "round_end"}
    <!-- Round results -->
    <div class="flex items-center gap-10 w-full max-w-5xl">
      <div class="flex-shrink-0">
        <CampfireCanvas intensity={allFinished ? 0 : 0.3} width={300} height={350} />
      </div>

      <div class="flex-1 space-y-4">
        <h2 class="text-3xl font-black {allFinished ? 'text-green-400' : 'text-red-400'} text-center">
          {allFinished ? 'Everyone finished!' : "Time's up!"}
        </h2>

        <div class="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-3">
          <p class="text-xs uppercase tracking-widest text-gray-400 mb-3">Results</p>
          {#each roundResults as r, rank}
            <div class="flex items-center gap-3">
              <span class="w-6 text-right font-mono text-gray-500 text-sm">{rank + 1}.</span>
              <span class="flex-1 font-semibold {r.finished ? 'text-green-300' : 'text-gray-300'} truncate">{r.playerName}</span>
              <span class="text-xs text-gray-400">{r.stagesCompleted}/{totalStages} stages</span>
              {#if r.finished}
                <span class="text-green-400 text-xs font-bold">DONE</span>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    </div>

  {:else}
    <p class="text-2xl text-gray-400">Get ready...</p>
    <CampfireCanvas intensity={0} width={350} height={400} />
  {/if}
</div>
