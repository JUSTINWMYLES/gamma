<script lang="ts">
  import type { Room } from "colyseus.js";
  import type { RoomState, PlayerState } from "../../../shared/types";

  export let room: Room;
  export let state: RoomState;
  export let me: PlayerState | undefined;

  function ready() {
    room.send("player_ready", {});
  }
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-6 p-6" data-testid="phone-lobby">
  <h1 class="text-3xl font-black text-indigo-400">Waiting for host…</h1>

  <div class="text-center">
    <p class="text-gray-400 text-sm">Room</p>
    <p class="text-4xl font-mono font-black tracking-widest text-white">{state.roomCode}</p>
  </div>

  <div class="bg-gray-800 rounded-xl p-4 w-full max-w-xs">
    <p class="text-gray-400 text-sm mb-2 text-center">Players ({state.players.size})</p>
    <ul class="space-y-1">
      {#each [...state.players.values()] as p}
        <li class="flex items-center justify-between text-sm">
          <span class="{p.id === me?.id ? 'font-bold text-indigo-400' : 'text-gray-300'}">{p.name}{p.id === me?.id ? ' (you)' : ''}</span>
          {#if p.isReady}
            <span class="text-green-400 font-bold">✓</span>
          {/if}
        </li>
      {/each}
    </ul>
  </div>

  <button
    class="w-full max-w-xs py-4 rounded-xl text-lg font-bold transition-all active:scale-95
      {me?.isReady
        ? 'bg-green-700 text-green-200 cursor-default'
        : 'bg-indigo-600 hover:bg-indigo-500 text-white'}"
    on:click={ready}
    disabled={me?.isReady}
    data-testid="ready-btn"
  >{me?.isReady ? 'Ready ✓' : 'Ready Up'}</button>
</div>
