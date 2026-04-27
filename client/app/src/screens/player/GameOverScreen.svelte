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
  $: myRank = sortedPlayers.filter((player) => player.score > (me?.score ?? 0)).length + 1;

  function playAgain() {
    room.send("play_again", {});
  }
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-6 p-6" data-testid="phone-game-over">
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
  <div class="text-center">
    <p class="text-2xl font-mono">{me?.score ?? 0} pts</p>
    <p class="text-sm text-gray-400">Rank #{myRank}</p>
  </div>

  <div class="w-full max-w-sm space-y-2 max-h-[40vh] overflow-y-auto rounded-2xl bg-gray-900/50 p-3">
    <p class="px-1 text-xs uppercase tracking-widest text-gray-500">Full standings</p>
    {#each sortedPlayers as player, i}
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

  {#if isHost}
    <button class="mt-4 px-6 py-3 bg-indigo-600 rounded-xl font-bold active:scale-95 transition-all" on:click={playAgain}>Play Again</button>
  {:else}
    <p class="text-gray-500 text-sm mt-4">Waiting for host to start next game...</p>
  {/if}
</div>
