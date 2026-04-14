<script lang="ts">
  import type { RoomState, PlayerState } from "../../../../shared/types";
  import { getRoundLabel } from "../../../../shared/types";
  export let state: RoomState;
  export let me: PlayerState | undefined;

  $: isLastRound = !state.isPracticeRound && state.currentRound >= state.gameConfig.roundCount;
  $: game = state.selectedGame;
  $: roundLabel = getRoundLabel(state);

  /** Game-aware round end message for the player */
  function getRoundMessage(g: string, eliminated: boolean): string {
    if (eliminated) {
      if (g.includes("dont-get-caught")) return "You were caught!";
      if (g.includes("odd-one-out")) return "You were voted out!";
      return "Eliminated this round.";
    }
    if (g.includes("dont-get-caught")) return "You evaded the guards!";
    if (g.includes("shave-the-yak")) return "Nice shaving!";
    if (g.includes("odd-one-out")) return "You survived the vote!";
    if (g.includes("audio-overlay")) return "Round complete!";
    if (g.includes("lowball")) return "Bids are in!";
    return "Round complete!";
  }
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-6 p-6" data-testid="phone-round-end">
  <h2 class="text-3xl font-black text-indigo-400">{roundLabel} End</h2>
  <div class="text-center">
    <p class="text-gray-400 text-sm">Your score</p>
    <p class="text-5xl font-black">{me?.score ?? 0}</p>
  </div>
  {#if me?.isEliminated}
    <p class="text-red-400 font-semibold">{getRoundMessage(game, true)}</p>
  {:else}
    <p class="text-green-400 font-semibold">{getRoundMessage(game, false)}</p>
  {/if}
  {#if isLastRound}
    <p class="text-yellow-400 font-bold text-lg">That's the last round — game over!</p>
  {:else if state.isPracticeRound}
    <p class="text-gray-400 text-sm">Scored rounds start next.</p>
  {:else}
    <p class="text-gray-400 text-sm">Get ready for round {state.currentRound + 1}...</p>
  {/if}
</div>
