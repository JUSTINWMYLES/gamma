<script lang="ts">
  import type { Room } from "colyseus.js";
  import type { RoomState } from "../../../shared/types";
  import { getInstructionSlides } from "../../../shared/instructionSlides";
  import InstructionSlideshow from "../components/InstructionSlideshow.svelte";

  export let room: Room;
  export let state: RoomState;

  $: slides = getInstructionSlides(state.selectedGame ?? "");

  function confirm() { room.send("player_ready", {}); }
</script>

<InstructionSlideshow
  {slides}
  mode="player"
  on:confirm={confirm}
/>
