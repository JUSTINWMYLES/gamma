<script lang="ts">
  import type { RoomState, PlayerState } from "../../../../shared/types";
  export let state: RoomState;
  export let me: PlayerState | undefined;

  $: sorted = [...state.players.values()].sort((a, b) => b.score - a.score);
  $: myScore = me?.score ?? 0;
  // Rank = number of players with a strictly higher score + 1 (handles ties correctly)
  $: rank = sorted.filter((p) => p.score > myScore).length + 1;
  $: allTied = sorted.length > 0 && sorted.every((p) => p.score === sorted[0].score);
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-6 p-6" data-testid="phone-scoreboard">
  <h2 class="text-3xl font-black text-indigo-400">Scoreboard</h2>
  <div class="text-center">
    {#if allTied}
      <p class="text-gray-400">Everyone's tied!</p>
      <p class="text-4xl font-black text-yellow-400">Tied</p>
    {:else}
      <p class="text-gray-400">You are ranked</p>
      <p class="text-6xl font-black">#{rank}</p>
    {/if}
    <p class="text-3xl font-mono text-indigo-300">{myScore} pts</p>
  </div>
</div>
