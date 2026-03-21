<script lang="ts">
  /**
   * TV Instructions screen — shown before the first countdown.
   * Waits for all players to confirm "Got it" on their phones.
   */
  import type { Room } from "colyseus.js";
  import type { RoomState } from "../../../shared/types";

  export let room: Room;
  export let state: RoomState;

  $: readyCount = [...state.players.values()].filter((p) => p.isReady).length;
  $: totalCount = state.players.size;
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-8 p-10" data-testid="instructions-screen">
  <h1 class="text-5xl font-black text-indigo-400">Don't Get Caught</h1>

  <div class="max-w-2xl text-center space-y-4 text-gray-200 text-lg">
    <p>A guard patrols the map. <strong>Don't let it see you!</strong></p>
    <ul class="text-left space-y-2 bg-gray-800 rounded-xl p-6">
      <li>🕹️ Use the joystick on your phone to move your character</li>
      <li>🌿 Walk onto a bush or crate and tap <strong>Hide</strong> to take cover</li>
      <li>🔦 The guard has a cone of vision — stay out of it</li>
      <li>❌ Get caught {3} times and you're eliminated</li>
      <li>⏱️ Survive until time runs out to score points</li>
    </ul>
  </div>

  <div class="flex items-center gap-4 text-gray-400">
    <div class="w-8 h-8 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin"></div>
    <p class="text-xl">
      Waiting for players to confirm…
      <span class="text-indigo-400 font-bold">{readyCount}/{totalCount}</span>
    </p>
  </div>
</div>
