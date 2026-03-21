<script lang="ts">
  import type { Room } from "colyseus.js";
  import type { RoomState } from "../../../../shared/types";

  export let room: Room;
  export let state: RoomState;

  $: readyCount = [...state.players.values()].filter((p) => p.isReady).length;
  $: totalCount = state.players.size;
  $: isOddOneOut = state.selectedGame === "registry-20-odd-one-out";
  $: isShaveYak = state.selectedGame === "registry-19-shave-the-yak";
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-8 p-10" data-testid="instructions-screen">
  {#if isOddOneOut}
    <h1 class="text-5xl font-black text-indigo-400">Odd One Out</h1>
    <div class="max-w-2xl text-center space-y-4 text-gray-200 text-lg">
      <p>Can you spot who's different?</p>
      <ul class="text-left space-y-2 bg-gray-800 rounded-xl p-6">
        <li>📱 Each player gets a secret action on their phone</li>
        <li>👀 Watch each other during observation windows</li>
        <li>🗳️ Vote on who you think is the odd one out</li>
        <li>⚡ Vote fast for bonus points!</li>
        <li>🎭 If you're the odd one — try to blend in</li>
      </ul>
    </div>
  {:else if isShaveYak}
    <h1 class="text-5xl font-black text-indigo-400">Shave The Yak</h1>
    <div class="max-w-2xl text-center space-y-4 text-gray-200 text-lg">
      <p>Grab your razor and get shaving!</p>
      <ul class="text-left space-y-2 bg-gray-800 rounded-xl p-6">
        <li>✋ Swipe across the yak on your phone to shave fur</li>
        <li>🎯 Stay on target — missing makes the yak move!</li>
        <li>🔥 Build combos for bonus points</li>
        <li>⏱️ Shave as much as you can before time runs out</li>
      </ul>
    </div>
  {:else}
    <h1 class="text-5xl font-black text-indigo-400">Don't Get Caught</h1>
    <div class="max-w-2xl text-center space-y-4 text-gray-200 text-lg">
      <p>Guards patrol the map. <strong>Don't let them see you!</strong></p>
      <ul class="text-left space-y-2 bg-gray-800 rounded-xl p-6">
        <li>🕹️ Use the joystick on your phone to move your character</li>
        <li>🔦 Guards have a cone of vision — stay out of it</li>
        <li>❌ Get caught 3 times and you're eliminated</li>
        <li>⏱️ Survive until time runs out to score points</li>
      </ul>
    </div>
  {/if}

  <div class="flex items-center gap-4 text-gray-400">
    <div class="w-8 h-8 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin"></div>
    <p class="text-xl">
      Waiting for players to confirm...
      <span class="text-indigo-400 font-bold">{readyCount}/{totalCount}</span>
    </p>
  </div>
</div>
