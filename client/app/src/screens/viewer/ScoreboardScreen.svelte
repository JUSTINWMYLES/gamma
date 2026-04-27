<script lang="ts">
  import type { RoomState, PlayerState } from "../../../../shared/types";
  import PlayerIcon from "../../components/PlayerIcon.svelte";
  export let state: RoomState;
  export let sortedPlayers: PlayerState[];

  // Compute display rank that handles ties (same score = same rank)
  function displayRank(index: number, players: PlayerState[]): string {
    if (index === 0) return ['🥇','🥈','🥉'][0];
    if (players[index].score === players[index - 1].score) {
      // same score as previous — find their rank
      let rank = index;
      while (rank > 0 && players[rank].score === players[rank - 1].score) rank--;
      return ['🥇','🥈','🥉'][rank] ?? `#${rank + 1}`;
    }
    return ['🥇','🥈','🥉'][index] ?? `#${index + 1}`;
  }

  $: allTied = sortedPlayers.length > 1 && sortedPlayers.every((p) => p.score === sortedPlayers[0].score);
  $: topFive = sortedPlayers.slice(0, 5);
  $: hiddenCount = Math.max(0, sortedPlayers.length - topFive.length);
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-8 p-10" data-testid="scoreboard-screen">
  <h2 class="text-5xl font-black text-indigo-400">Scoreboard</h2>
  {#if allTied}
    <p class="text-2xl text-yellow-400 font-bold">Everyone's tied at {sortedPlayers[0]?.score ?? 0}!</p>
  {/if}
  <div class="w-full max-w-lg space-y-3">
    {#each topFive as p, i}
      <div class="flex items-center gap-4 rounded-xl px-6 py-4 transition-all {i === 0 ? 'bg-indigo-700 scale-105 shadow-xl' : 'bg-gray-800'}">
        <span class="text-3xl">{displayRank(i, topFive)}</span>
        <PlayerIcon player={p} size={36} />
        <span class="flex-1 font-bold text-lg">{p.name}</span>
        <span class="font-mono text-2xl">{p.score}</span>
      </div>
    {/each}
  </div>
  {#if hiddenCount > 0}
    <p class="text-base text-gray-400">Showing the top 5 on TV — full standings stay on player phones.</p>
  {/if}
</div>
