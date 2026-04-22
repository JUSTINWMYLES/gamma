<script lang="ts">
  /**
   * TV Instructions screen — shown before the first countdown.
   * Displays themed slide-based instructions and waits for all
   * players to confirm "Got it" on their phones.
   */
  import type { Room } from "colyseus.js";
  import type { RoomState } from "../../../../shared/types";
  import { getInstructionSlides } from "../../../../shared/instructionSlides";
  import InstructionSlideshow from "../../components/InstructionSlideshow.svelte";

  export let room: Room;
  export let state: RoomState;

  $: slides = getInstructionSlides(state.selectedGame ?? "", state.gameConfig.gameMode ?? "default");
  $: readyCount = [...state.players.values()].filter((p) => p.isReady).length;
  $: totalCount = state.players.size;
</script>

<div data-testid="instructions-screen" class="contents">
<InstructionSlideshow
  {slides}
  mode="viewer"
  {readyCount}
  {totalCount}
  scale="large"
/>
</div>
