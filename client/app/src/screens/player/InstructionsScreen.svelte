<script lang="ts">
  import type { Room } from "colyseus.js";
  import type { RoomState, PlayerState } from "../../../../shared/types";
  import { getInstructionSlides } from "../../../../shared/instructionSlides";
  import InstructionSlideshow from "../../components/InstructionSlideshow.svelte";

  export let room: Room;
  export let state: RoomState;
  export let me: PlayerState | undefined;

  $: slides = getInstructionSlides(state.selectedGame ?? "");
  $: amReady = me?.isReady ?? false;

  function confirm() { room.send("player_ready", {}); }
</script>

<div data-testid="phone-instructions" class="contents">
<InstructionSlideshow
  {slides}
  mode="player"
  isReady={amReady}
  on:confirm={confirm}
/>
</div>
