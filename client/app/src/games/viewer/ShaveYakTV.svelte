<script lang="ts">
  /**
   * TV game component for "Shave the Yak" (registry-19).
   *
   * Displays a live dashboard showing every player's shaving progress:
   *   - Player name
   *   - Animated progress bar (shaved %)
   *   - Numeric shaved %
   *   - Current score
   *   - Combo indicator
   *
   * Listens to "shave_progress_all" broadcasts from the server (every 500ms).
   */
  import { onMount, onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState } from "../../../../shared/types";

  export let room: Room;
  export let state: RoomState;

  // ── Player progress data from server ─────────────────────────────
  interface PlayerProgress {
    playerId: string;
    playerName: string;
    shavedPercent: number;
    score: number;
    combo: number;
    comboMax: number;
  }

  let players: PlayerProgress[] = [];

  // ── Timer ─────────────────────────────────────────────────────────
  let timeLeft = 0;
  let timerInterval: ReturnType<typeof setInterval>;

  // ── Colors for each player column ────────────────────────────────
  const PLAYER_COLORS = [
    "#6366f1", "#ec4899", "#f59e0b", "#10b981",
    "#3b82f6", "#ef4444", "#8b5cf6", "#14b8a6",
  ];

  const PLAYER_BG_COLORS = [
    "rgba(99,102,241,0.15)", "rgba(236,72,153,0.15)", "rgba(245,158,11,0.15)", "rgba(16,185,129,0.15)",
    "rgba(59,130,246,0.15)", "rgba(239,68,68,0.15)", "rgba(139,92,246,0.15)", "rgba(20,184,166,0.15)",
  ];

  // ── Helpers ───────────────────────────────────────────────────────
  function comboColor(combo: number): string {
    if (combo >= 8) return "#f59e0b";
    if (combo >= 5) return "#a78bfa";
    if (combo >= 3) return "#6366f1";
    return "#94a3b8";
  }

  function rankLabel(pct: number): string {
    if (pct >= 90) return "S";
    if (pct >= 75) return "A";
    if (pct >= 60) return "B";
    if (pct >= 40) return "C";
    if (pct >= 20) return "D";
    return "F";
  }

  function rankColor(pct: number): string {
    if (pct >= 90) return "#f59e0b";
    if (pct >= 75) return "#10b981";
    if (pct >= 60) return "#6366f1";
    if (pct >= 40) return "#3b82f6";
    if (pct >= 20) return "#a78bfa";
    return "#94a3b8";
  }

  // ── Message handlers ──────────────────────────────────────────────
  function onProgressAll(data: { players: PlayerProgress[] }) {
    players = data.players.sort((a, b) => b.shavedPercent - a.shavedPercent);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────
  onMount(() => {
    room.onMessage("shave_progress_all", onProgressAll);

    timerInterval = setInterval(() => {
      const elapsed = (Date.now() - state.phaseStartedAt) / 1000;
      timeLeft = Math.max(0, state.roundDurationSecs - elapsed);
    }, 100);
  });

  onDestroy(() => {
    clearInterval(timerInterval);
  });

  $: urgentTimer = timeLeft < 6;
</script>

<div class="flex-1 flex flex-col gap-6 p-8 bg-gradient-to-b from-sky-950 via-sky-900 to-emerald-950" data-testid="shave-yak-tv">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-3xl font-black text-white">Shave the Yak</h1>
      <p class="text-sm text-sky-300">Round {state.currentRound} of {state.gameConfig.roundCount}</p>
    </div>

    <div class="text-right">
      <p
        class="text-5xl font-mono font-black transition-colors {urgentTimer ? 'text-red-400 animate-pulse' : 'text-white'}"
        data-testid="tv-yak-timer"
      >{Math.ceil(timeLeft)}</p>
      <p class="text-xs text-sky-400 uppercase tracking-widest">seconds</p>
    </div>
  </div>

  <!-- Player columns -->
  {#if players.length === 0}
    <div class="flex-1 flex items-center justify-center">
      <p class="text-xl text-sky-400 animate-pulse">Waiting for players to start shaving...</p>
    </div>
  {:else}
    <div class="flex-1 grid gap-4" style="grid-template-columns: repeat({Math.min(players.length, 8)}, 1fr);">
      {#each players as p, i}
        {@const color = PLAYER_COLORS[i % PLAYER_COLORS.length]}
        {@const bgColor = PLAYER_BG_COLORS[i % PLAYER_BG_COLORS.length]}
        <div
          class="flex flex-col items-center rounded-2xl p-4 transition-all"
          style="background:{bgColor}; border: 2px solid {color}33;"
        >
          <!-- Player name -->
          <p class="text-lg font-bold text-white truncate w-full text-center mb-3">{p.playerName}</p>

          <!-- Vertical progress bar -->
          <div class="flex-1 w-full flex flex-col items-center justify-end relative mb-3" style="min-height:180px;">
            <div class="w-full rounded-xl overflow-hidden bg-gray-800/60 relative" style="height:100%;">
              <!-- Fill from bottom -->
              <div
                class="absolute bottom-0 left-0 right-0 rounded-xl transition-all duration-500 ease-out"
                style="height:{p.shavedPercent}%; background: linear-gradient(to top, {color}, {color}88);"
              ></div>
              <!-- Percentage label in center of bar -->
              <div class="absolute inset-0 flex items-center justify-center">
                <span class="text-2xl font-black text-white drop-shadow-lg">
                  {p.shavedPercent.toFixed(0)}%
                </span>
              </div>
            </div>
          </div>

          <!-- Rank badge -->
          <div
            class="w-12 h-12 rounded-full flex items-center justify-center text-xl font-black mb-2"
            style="background:{rankColor(p.shavedPercent)}22; border: 2px solid {rankColor(p.shavedPercent)}; color:{rankColor(p.shavedPercent)};"
          >
            {rankLabel(p.shavedPercent)}
          </div>

          <!-- Score -->
          <p class="text-sm font-mono text-sky-200">{p.score} pts</p>

          <!-- Combo -->
          {#if p.combo > 0}
            <div
              class="mt-1 px-2 py-0.5 rounded-full text-xs font-black text-white animate-bounce"
              style="background:{comboColor(p.combo)};"
            >
              x{p.combo}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
