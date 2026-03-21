<script lang="ts">
  import type { Room } from "colyseus.js";
  import type { RoomState, PlayerState } from "../../../../shared/types";

  export let room: Room;
  export let state: RoomState;
  export let me: PlayerState | undefined;

  $: isOddOneOut = state.selectedGame === "registry-20-odd-one-out";
  $: isShaveYak = state.selectedGame === "registry-19-shave-the-yak";
  $: isEvilLaugh = state.selectedGame === "registry-26-evil-laugh-overlay";
  $: isLowball = state.selectedGame === "registry-25-lowball-marketplace";
  $: amReady = me?.isReady ?? false;

  function confirm() { room.send("player_ready", {}); }
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
  {:else if isShaveYak}
    <h2 class="text-2xl font-black text-indigo-400">Shave The Yak</h2>
    <ul class="space-y-3 text-gray-200 w-full max-w-xs">
      <li class="bg-gray-800 rounded-xl p-3">✋ Swipe across the yak to shave its fur</li>
      <li class="bg-gray-800 rounded-xl p-3">🎯 Stay on target — misses make the yak move!</li>
      <li class="bg-gray-800 rounded-xl p-3">🔥 Build combos for bonus points</li>
      <li class="bg-gray-800 rounded-xl p-3">⏱️ Shave as much as you can before time runs out</li>
    </ul>
  {:else if isEvilLaugh}
    <h2 class="text-2xl font-black text-indigo-400">Evil Laugh Overlay</h2>
    <ul class="space-y-3 text-gray-200 w-full max-w-xs">
      <li class="bg-gray-800 rounded-xl p-3">🎬 Browse and pick a GIF from the pool</li>
      <li class="bg-gray-800 rounded-xl p-3">🔀 Your GIF gets swapped — you'll dub someone else's pick</li>
      <li class="bg-gray-800 rounded-xl p-3">🎤 Record your best evil laugh over the GIF</li>
      <li class="bg-gray-800 rounded-xl p-3">🗳️ Watch all the dubs and vote for the funniest!</li>
    </ul>
  {:else if isLowball}
    <h2 class="text-2xl font-black text-indigo-400">Lowball Marketplace</h2>
    <ul class="space-y-3 text-gray-200 w-full max-w-xs">
      <li class="bg-gray-800 rounded-xl p-3">🛒 Browse ridiculous items in a fake marketplace</li>
      <li class="bg-gray-800 rounded-xl p-3">💰 Place lowball bids — go low, but not too low!</li>
      <li class="bg-gray-800 rounded-xl p-3">📝 Write funny messages to sellers</li>
      <li class="bg-gray-800 rounded-xl p-3">🗳️ Vote for the funniest bids and messages!</li>
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
  {#if amReady}
    <div class="w-full max-w-xs py-4 rounded-xl text-lg font-bold bg-green-700 text-green-200 text-center">Ready! Waiting for others...</div>
  {:else}
    <button class="w-full max-w-xs py-4 rounded-xl text-lg font-bold bg-indigo-600 active:bg-indigo-500 active:scale-95 transition-all" on:click={confirm} data-testid="got-it-btn">Got it!</button>
  {/if}
</div>
