<script lang="ts">
  import type { RoomState, PlayerState } from "../../../shared/types";
  export let state: RoomState;
  export let me: PlayerState | undefined;
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-6 p-6" data-testid="phone-round-end">
  <h2 class="text-3xl font-black text-indigo-400">Round {state.currentRound} End</h2>
  <div class="text-center">
    <p class="text-gray-400 text-sm">Your score</p>
    <p class="text-5xl font-black">{me?.score ?? 0}</p>
  </div>
  {#if me?.isEliminated}
    <p class="text-red-400 font-semibold">You were eliminated this round.</p>
  {:else}
    <p class="text-green-400 font-semibold">You survived! +100 pts</p>
  {/if}
</div>
