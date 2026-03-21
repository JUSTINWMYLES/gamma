<script lang="ts">
  import type { RoomState, PlayerState } from "../../../../shared/types";
  export let state: RoomState;
  export let sortedPlayers: PlayerState[];
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-8 p-10" data-testid="scoreboard-screen">
  <h2 class="text-5xl font-black text-indigo-400">Scoreboard</h2>
  <div class="w-full max-w-lg space-y-3">
    {#each sortedPlayers as p, i}
      <div class="flex items-center gap-4 rounded-xl px-6 py-4 transition-all {i === 0 ? 'bg-indigo-700 scale-105 shadow-xl' : 'bg-gray-800'}">
        <span class="text-3xl">{['🥇','🥈','🥉'][i] ?? `#${i+1}`}</span>
        <span class="flex-1 font-bold text-lg">{p.name}</span>
        <span class="font-mono text-2xl">{p.score}</span>
      </div>
    {/each}
  </div>
</div>
