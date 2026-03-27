<script lang="ts">
  /**
   * Paint Match — TV / Viewer component.
   *
   * Displays the target colour prominently, a countdown timer,
   * a submission progress bar, and the round results with rankings.
   *
   * Listens for:
   *   "color_target"   — { roundId, targetRGB: [r,g,b] }
   *   "submit_count"   — { submitted, total }
   *   "round_results"  — { roundId, targetRGB, rankings: [...] }
   */
  import { onMount, onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState } from "../../../../shared/types";

  export let room: Room;
  export let state: RoomState;

  // ── State ──────────────────────────────────────────────────────
  let targetRGB: [number, number, number] | null = null;
  let submitCount = 0;
  let totalPlayers = 0;
  let showResults = false;
  let rankings: Array<{
    playerId: string;
    mixRGB: [number, number, number];
    distance: number;
    score: number;
    rank: number;
  }> = [];

  // ── Timer ──────────────────────────────────────────────────────
  let timeLeft = 0;
  let timerInterval: ReturnType<typeof setInterval>;

  function getPlayerName(playerId: string): string {
    const player = state.players.get(playerId);
    return player?.name ?? playerId.slice(0, 6);
  }

  onMount(() => {
    timerInterval = setInterval(() => {
      const elapsed = (Date.now() - state.phaseStartedAt) / 1000;
      timeLeft = Math.max(0, state.roundDurationSecs - elapsed);
    }, 200);

    room.onMessage("color_target", (msg: { roundId: number; targetRGB: [number, number, number] }) => {
      targetRGB = msg.targetRGB;
      showResults = false;
      rankings = [];
      submitCount = 0;
    });

    room.onMessage("submit_count", (msg: { submitted: number; total: number }) => {
      submitCount = msg.submitted;
      totalPlayers = msg.total;
    });

    room.onMessage("round_results", (msg: {
      roundId: number;
      targetRGB: [number, number, number];
      rankings: typeof rankings;
    }) => {
      rankings = msg.rankings;
      showResults = true;
    });

    return () => {
      clearInterval(timerInterval);
    };
  });

  onDestroy(() => {
    clearInterval(timerInterval);
  });
</script>

<div class="flex-1 flex flex-col bg-gray-950" data-testid="paint-match-tv">
  {#if showResults && rankings.length > 0}
    <!-- ── Results reveal ───────────────────────────────────────── -->
    <div class="flex-1 flex flex-col items-center justify-center gap-8 p-8">
      <!-- Target colour reference -->
      <div class="text-center">
        <p class="text-sm text-gray-400 uppercase tracking-widest mb-2">Target Colour</p>
        <div
          class="w-32 h-32 rounded-2xl border-4 border-amber-500 mx-auto shadow-2xl"
          style="background:rgb({targetRGB?.[0] ?? 0},{targetRGB?.[1] ?? 0},{targetRGB?.[2] ?? 0})"
        ></div>
      </div>

      <p class="text-2xl font-black text-white">Round {state.currentRound} Results</p>

      <!-- Rankings grid -->
      <div class="flex flex-wrap justify-center gap-4 max-w-4xl">
        {#each rankings as result}
          <div
            class="flex flex-col items-center gap-2 p-4 rounded-xl bg-gray-900 border
              {result.rank === 1 ? 'border-amber-500 ring-2 ring-amber-500/30' :
               result.rank === 2 ? 'border-gray-500' :
               result.rank === 3 ? 'border-amber-800' : 'border-gray-700'}"
            style="min-width: 140px"
          >
            <!-- Rank badge -->
            <span
              class="text-2xl font-black
                {result.rank === 1 ? 'text-amber-400' :
                 result.rank === 2 ? 'text-gray-300' :
                 result.rank === 3 ? 'text-amber-700' : 'text-gray-500'}"
            >
              #{result.rank}
            </span>

            <!-- Player name -->
            <p class="text-sm font-bold text-white truncate max-w-[120px]">
              {getPlayerName(result.playerId)}
            </p>

            <!-- Colour swatch -->
            <div
              class="w-16 h-16 rounded-lg border-2 border-gray-600"
              style="background:rgb({result.mixRGB[0]},{result.mixRGB[1]},{result.mixRGB[2]})"
            ></div>

            <!-- Score & distance -->
            <p class="text-xl font-black text-amber-400">+{result.score}</p>
            <p class="text-xs text-gray-500">distance: {Math.round(result.distance * 10) / 10}</p>
          </div>
        {/each}
      </div>
    </div>

  {:else if targetRGB}
    <!-- ── Target colour display ────────────────────────────────── -->
    <div class="flex-1 flex flex-col items-center justify-center gap-6 p-8">
      <p class="text-sm text-gray-400 uppercase tracking-widest">Match This Colour</p>

      <!-- Giant target swatch -->
      <div
        class="w-80 h-80 rounded-3xl border-4 border-white/20 shadow-2xl transition-colors"
        style="background:rgb({targetRGB[0]},{targetRGB[1]},{targetRGB[2]})"
        data-testid="tv-target-swatch"
      ></div>

      <!-- RGB value -->
      <p class="text-sm font-mono text-gray-500">
        RGB({targetRGB[0]}, {targetRGB[1]}, {targetRGB[2]})
      </p>

      <!-- Timer -->
      <p
        class="text-6xl font-black font-mono {timeLeft < 10 ? 'text-red-400' : 'text-white'}"
        data-testid="tv-timer"
      >{Math.ceil(timeLeft)}</p>

      <!-- Submit progress -->
      <div class="flex items-center gap-3">
        <div class="w-48 h-3 bg-gray-800 rounded-full overflow-hidden">
          <div
            class="h-full bg-green-500 rounded-full transition-all"
            style="width:{totalPlayers > 0 ? (submitCount / totalPlayers) * 100 : 0}%"
          ></div>
        </div>
        <span class="text-sm text-gray-400">{submitCount}/{totalPlayers} submitted</span>
      </div>

      <p class="text-xs text-gray-500">Round {state.currentRound} of {state.gameConfig.roundCount}</p>
    </div>

  {:else}
    <!-- ── Waiting ──────────────────────────────────────────────── -->
    <div class="flex-1 flex items-center justify-center">
      <p class="text-2xl text-gray-500 animate-pulse">Preparing colours...</p>
    </div>
  {/if}
</div>
