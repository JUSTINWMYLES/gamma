<script lang="ts">
  import type { RoomState, PlayerState } from "../../../shared/types";
  export let state: RoomState;
  export let sortedPlayers: PlayerState[];

  $: winner = sortedPlayers[0];
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-8 p-10" data-testid="game-over-screen">
  <h1 class="text-6xl font-black text-yellow-400">Game Over!</h1>

  {#if winner}
    <div class="text-center">
      <p class="text-2xl text-gray-300 mb-2">Winner</p>
      <p class="text-5xl font-black text-white">{winner.name}</p>
      <p class="text-3xl font-mono text-indigo-400 mt-2">{winner.score} pts</p>
    </div>
  {/if}

  <div class="w-full max-w-md space-y-2 mt-4">
    {#each sortedPlayers as p, i}
      <div class="flex items-center gap-4 bg-gray-800 rounded-xl px-6 py-3">
        <span class="text-2xl">{['🥇','🥈','🥉'][i] ?? `#${i+1}`}</span>
        <span class="flex-1 font-semibold">{p.name}</span>
        <span class="font-mono text-xl">{p.score}</span>
      </div>
    {/each}
  </div>

  <button
    class="mt-6 px-8 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-lg font-bold transition-colors"
    on:click={() => window.location.reload()}
  >Play Again</button>
</div>
