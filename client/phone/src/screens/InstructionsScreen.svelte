<script lang="ts">
  import type { Room } from "colyseus.js";
  import type { RoomState } from "../../../shared/types";

  export let room: Room;
  export let state: RoomState;

  $: isOddOneOut = state.selectedGame === "registry-20-odd-one-out";

  function confirm() {
    room.send("player_ready", {});
  }
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-6 p-6" data-testid="phone-instructions">

  {#if isOddOneOut}
    <h2 class="text-2xl font-black text-indigo-400">Odd One Out</h2>

    <ul class="space-y-3 text-gray-200 w-full max-w-xs">
      <li class="bg-gray-800 rounded-xl p-3">📱 You'll get a secret action on your phone</li>
      <li class="bg-gray-800 rounded-xl p-3">👀 Watch others during 10-second windows</li>
      <li class="bg-gray-800 rounded-xl p-3">🗳️ Vote on who's the odd one out</li>
      <li class="bg-gray-800 rounded-xl p-3">⚡ Faster correct votes earn more points</li>
    </ul>
  {:else}
    <h2 class="text-2xl font-black text-indigo-400">Don't Get Caught!</h2>

    <ul class="space-y-3 text-gray-200 w-full max-w-xs">
      <li class="bg-gray-800 rounded-xl p-3">🕹️ Drag the joystick to move</li>
      <li class="bg-gray-800 rounded-xl p-3">🔦 Guards have a cone of vision — stay out of it!</li>
      <li class="bg-gray-800 rounded-xl p-3">❌ Caught 3 times = eliminated</li>
      <li class="bg-gray-800 rounded-xl p-3">⏱️ Survive until time runs out to score</li>
    </ul>
  {/if}

  <button
    class="w-full max-w-xs py-4 rounded-xl text-lg font-bold bg-indigo-600 active:bg-indigo-500 active:scale-95 transition-all"
    on:click={confirm}
    data-testid="got-it-btn"
  >Got it!</button>
</div>
