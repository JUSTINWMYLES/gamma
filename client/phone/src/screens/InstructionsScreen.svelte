<script lang="ts">
  import type { Room } from "colyseus.js";
  export let room: Room;

  function confirm() {
    room.send("player_ready", {});
  }
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-6 p-6" data-testid="phone-instructions">
  <h2 class="text-2xl font-black text-indigo-400">Don't Get Caught!</h2>

  <ul class="space-y-3 text-gray-200 w-full max-w-xs">
    <li class="bg-gray-800 rounded-xl p-3">🕹️ Drag the joystick to move</li>
    <li class="bg-gray-800 rounded-xl p-3">🌿 Step on a bush or crate, then tap <strong>Hide</strong></li>
    <li class="bg-gray-800 rounded-xl p-3">🔦 Guard has a cone vision — stay out of it!</li>
    <li class="bg-gray-800 rounded-xl p-3">❌ Caught 3 times = eliminated</li>
  </ul>

  <button
    class="w-full max-w-xs py-4 rounded-xl text-lg font-bold bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition-all"
    on:click={confirm}
    data-testid="got-it-btn"
  >Got it!</button>
</div>
