<script lang="ts">
  import { onMount } from "svelte";
  import type { RoomState } from "../../../../shared/types";
  export let state: RoomState;

  let count = 3;
  onMount(() => {
    const interval = setInterval(() => {
      const elapsed = (Date.now() - state.phaseStartedAt) / 1000;
      count = Math.max(1, 3 - Math.floor(elapsed));
    }, 200);
    return () => clearInterval(interval);
  });
</script>

<div class="flex-1 flex items-center justify-center" data-testid="phone-countdown">
  <p class="text-[8rem] font-black text-indigo-400">{count}</p>
</div>
