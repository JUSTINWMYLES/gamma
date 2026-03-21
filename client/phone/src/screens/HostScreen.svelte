<script lang="ts">
  /**
   * Phone host screen — name entry to create a new room.
   */
  import { createEventDispatcher } from "svelte";

  const dispatch = createEventDispatcher<{ host: { name: string }; back: void }>();

  let name = "";
  let submitting = false;
  let localError = "";

  async function handleHost() {
    localError = "";
    if (!name.trim()) {
      localError = "Enter your name.";
      return;
    }
    submitting = true;
    dispatch("host", { name: name.trim() });
  }
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-6 p-6" data-testid="host-screen">
  <h1 class="text-4xl font-black text-indigo-400">gamma</h1>
  <p class="text-gray-400 text-center">Create a room — share the code with friends.</p>

  <div class="w-full max-w-xs space-y-4">
    <input
      type="text"
      placeholder="Your Name"
      maxlength="20"
      autocomplete="off"
      bind:value={name}
      class="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-indigo-500"
      data-testid="host-name-input"
    />

    {#if localError}
      <p class="text-red-400 text-sm text-center">{localError}</p>
    {/if}

    <button
      class="w-full py-4 rounded-xl text-lg font-bold bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition-all
        {submitting ? 'opacity-50 pointer-events-none' : ''}"
      on:click={handleHost}
      data-testid="host-btn"
    >{submitting ? "Creating…" : "Create Room"}</button>

    <button
      class="w-full py-3 rounded-xl text-sm text-gray-500 hover:text-gray-300 transition-colors"
      on:click={() => dispatch("back")}
    >Back</button>
  </div>
</div>
