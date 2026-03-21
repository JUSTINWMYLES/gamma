<script lang="ts">
  import type { RoomState, PlayerState } from "../../../shared/types";
  export let state: RoomState;
  export let me: PlayerState | undefined;

  $: sortedPlayers = [...state.players.values()].sort((a, b) => b.score - a.score);
  $: winner = sortedPlayers[0];
  $: isWinner = winner?.id === me?.id;
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-6 p-6" data-testid="phone-game-over">
  {#if isWinner}
    <p class="text-6xl">🏆</p>
    <h1 class="text-3xl font-black text-yellow-400">You Win!</h1>
  {:else}
    <h1 class="text-3xl font-black text-gray-300">Game Over</h1>
    <p class="text-gray-400">Winner: <strong class="text-white">{winner?.name ?? "?"}</strong></p>
  {/if}
  <p class="text-2xl font-mono">{me?.score ?? 0} pts</p>

  <button
    class="mt-4 px-6 py-3 bg-indigo-600 rounded-xl font-bold active:scale-95 transition-all"
    on:click={() => window.location.reload()}
  >Play Again</button>
</div>
