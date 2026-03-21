<script lang="ts">
  import type { RoomState, PlayerState } from "../../../shared/types";
  export let state: RoomState;
  export let sortedPlayers: PlayerState[];
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-8 p-10" data-testid="round-end-screen">
  <h2 class="text-4xl font-black text-indigo-400">Round {state.currentRound} Complete!</h2>
  <div class="w-full max-w-md space-y-2">
    {#each sortedPlayers as p, i}
      <div class="flex items-center gap-4 bg-gray-800 rounded-xl px-6 py-3">
        <span class="text-2xl font-black text-gray-500">#{i + 1}</span>
        <span class="flex-1 font-semibold {p.isEliminated ? 'line-through text-gray-500' : ''}">{p.name}</span>
        <span class="font-mono text-xl text-indigo-300">{p.score}</span>
      </div>
    {/each}
  </div>
  <p class="text-gray-400 animate-pulse">Next round starting soon…</p>
</div>
