<script lang="ts">
  import type { RoomState, PlayerState } from "../../../shared/types";
  export let state: RoomState;
  export let me: PlayerState | undefined;

  $: rank = [...state.players.values()]
    .sort((a, b) => b.score - a.score)
    .findIndex((p) => p.id === me?.id) + 1;
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-6 p-6" data-testid="phone-scoreboard">
  <h2 class="text-3xl font-black text-indigo-400">Scoreboard</h2>
  <div class="text-center">
    <p class="text-gray-400">You are ranked</p>
    <p class="text-6xl font-black">#{ rank }</p>
    <p class="text-3xl font-mono text-indigo-300">{me?.score ?? 0} pts</p>
  </div>
</div>
