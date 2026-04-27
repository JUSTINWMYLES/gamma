<script lang="ts">
  import type { Room } from "colyseus.js";
  import type { RoomState, PlayerState } from "../../../../shared/types";
  import PlayerIcon from "../../components/PlayerIcon.svelte";
  export let room: Room;
  export let state: RoomState;
  export let me: PlayerState | undefined;

  $: sortedPlayers = [...state.players.values()].sort((a, b) => b.score - a.score);
  $: winner = sortedPlayers[0];
  $: allTied = sortedPlayers.length > 1 && sortedPlayers.every((p) => p.score === sortedPlayers[0].score);
  $: isWinner = !allTied && winner?.id === me?.id;
  $: isHost = me?.id === state.hostSessionId;
  $: myRank = sortedPlayers.findIndex((player) => player.id === me?.id) + 1;

  function playAgain() {
    room.send("play_again", {});
  }
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-6 overflow-y-auto p-6 pb-24" data-testid="phone-game-over">
  {#if allTied}
    <p class="text-6xl">🤝</p>
    <h1 class="text-3xl font-black text-yellow-400">It's a Tie!</h1>
  {:else if isWinner}
    <p class="text-6xl">🏆</p>
    <h1 class="text-3xl font-black text-yellow-400">You Win!</h1>
  {:else}
    <h1 class="text-3xl font-black text-gray-300">Game Over</h1>
    <p class="text-gray-400 flex items-center gap-2 justify-center">Winner: {#if winner}<PlayerIcon player={winner} size={28} />{/if}<strong class="text-white">{winner?.name ?? "?"}</strong></p>
  {/if}
  <p class="text-2xl font-mono">{me?.score ?? 0} pts</p>
  {#if isHost}
    <button class="mt-4 px-6 py-3 bg-indigo-600 rounded-xl font-bold active:scale-95 transition-all" on:click={playAgain}>Play Again</button>
  {:else}
    <p class="text-gray-500 text-sm mt-4">Waiting for host to start next game...</p>
  {/if}

  <div class="w-full max-w-sm space-y-2">
    <p class="text-center text-xs font-semibold uppercase tracking-widest text-gray-500">Final Standings</p>
    {#each sortedPlayers as player, i}
      <div class="flex items-center gap-3 rounded-xl px-4 py-3 {player.id === me?.id ? 'border border-indigo-500/60 bg-indigo-900/60' : 'bg-gray-800'}">
        <span class="w-8 text-center text-lg font-black text-gray-500">#{i + 1}</span>
        <PlayerIcon player={player} size={30} />
        <div class="min-w-0 flex-1">
          <p class="truncate font-semibold {player.id === me?.id ? 'text-indigo-300' : 'text-white'}">{player.name}{player.id === me?.id ? ' (you)' : ''}</p>
        </div>
        <span class="font-mono text-lg text-indigo-300">{player.score}</span>
      </div>
    {/each}
  </div>

  {#if myRank > 0}
    <p class="text-sm text-gray-500">You finished #{myRank}.</p>
  {/if}
</div>
