<script lang="ts">
  import type { RoomState, PlayerState } from "../../../../shared/types";
  import PlayerIcon from "../../components/PlayerIcon.svelte";
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

  <div class="w-full max-w-sm space-y-2">
    {#each sorted as player, i}
      <div class="flex items-center gap-3 rounded-xl px-4 py-3 {player.id === me?.id ? 'bg-indigo-900/60 border border-indigo-500/60' : 'bg-gray-800'}">
        <span class="w-8 text-center text-lg font-black text-gray-500">#{i + 1}</span>
        <PlayerIcon player={player} size={30} />
        <div class="flex-1 min-w-0">
          <p class="font-semibold truncate {player.id === me?.id ? 'text-indigo-300' : 'text-white'}">{player.name}{player.id === me?.id ? ' (you)' : ''}</p>
        </div>
        <span class="font-mono text-xl text-indigo-300">{player.score}</span>
      </div>
    {/each}
  </div>
</div>
