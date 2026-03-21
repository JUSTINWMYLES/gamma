<script lang="ts">
  /**
   * TV 3-2-1 countdown screen.
   */
  import { onMount } from "svelte";
  import type { RoomState } from "../../../shared/types";

  export let state: RoomState;

  let count = 3;
  let interval: ReturnType<typeof setInterval>;

  onMount(() => {
    // Sync countdown from server phaseStartedAt
    const tick = () => {
      const elapsed = (Date.now() - state.phaseStartedAt) / 1000;
      count = Math.max(1, 3 - Math.floor(elapsed));
    };
    tick();
    interval = setInterval(tick, 200);
    return () => clearInterval(interval);
  });
</script>

<div
  class="flex-1 flex items-center justify-center"
  data-testid="countdown-screen"
>
  <p
    class="text-[12rem] font-black text-indigo-400 leading-none"
    style="text-shadow: 0 0 80px #6366f1;"
  >{count}</p>
</div>
