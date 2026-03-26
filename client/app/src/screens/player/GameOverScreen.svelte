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
  <p class="text-2xl font-mono">{me?.score ?? 0} pts</p>
  {#if isHost}
    <button class="mt-4 px-6 py-3 bg-indigo-600 rounded-xl font-bold active:scale-95 transition-all" on:click={playAgain}>Play Again</button>
  {:else}
    <p class="text-gray-500 text-sm mt-4">Waiting for host to start next game...</p>
  {/if}
</div>
