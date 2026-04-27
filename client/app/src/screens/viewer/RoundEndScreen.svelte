<script lang="ts">
  import type { RoomState, PlayerState } from "../../../../shared/types";
  import { getRoundLabel } from "../../../../shared/types";
  import PlayerIcon from "../../components/PlayerIcon.svelte";
  export let state: RoomState;
  export let sortedPlayers: PlayerState[];

  const TV_STANDINGS_LIMIT = 5;

  $: roundLabel = getRoundLabel(state);
  $: topPlayers = sortedPlayers.slice(0, TV_STANDINGS_LIMIT);
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-8 p-10" data-testid="round-end-screen">
  <h2 class="text-4xl font-black text-indigo-400">{roundLabel} Complete!</h2>
  <div class="w-full max-w-md space-y-2">
    {#each topPlayers as p, i}
      <div class="flex items-center gap-4 bg-gray-800 rounded-xl px-6 py-3">
        <span class="text-2xl font-black text-gray-500">#{i + 1}</span>
        <PlayerIcon player={p} size={32} />
        <span class="flex-1 font-semibold {p.isEliminated ? 'line-through text-gray-500' : ''}">{p.name}</span>
        <span class="font-mono text-xl text-indigo-300">{p.score}</span>
      </div>
    {/each}
  </div>
  {#if sortedPlayers.length > TV_STANDINGS_LIMIT}
    <p class="text-sm text-gray-500">Top 5 on TV — full standings are available on players' phones.</p>
  {/if}
  <p class="text-gray-400 animate-pulse">Next round starting soon...</p>
</div>
