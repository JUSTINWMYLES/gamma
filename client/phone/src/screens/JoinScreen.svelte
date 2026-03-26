<script lang="ts">
  /**
   * Phone join screen — room code entry + name.
   */
  import { createEventDispatcher } from "svelte";
  import GammaLogo from "../components/GammaLogo.svelte";

  export let error: string = "";

  const dispatch = createEventDispatcher<{ join: { roomCode: string; name: string } }>();

  let roomCode = "";
  let name = "";
  let submitting = false;
  let localError = "";

  async function handleJoin() {
    localError = "";
    if (!roomCode.trim() || roomCode.length !== 4) {
      localError = "Enter the 4-character room code from the TV.";
      return;
    }
    if (!name.trim()) {
      localError = "Enter your name.";
      return;
    }
    submitting = true;
    try {
      dispatch("join", { roomCode: roomCode.toUpperCase(), name: name.trim() });
    } catch {
      localError = "Could not join room. Check the code and try again.";
      submitting = false;
    }
  }
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-6 p-6" data-testid="join-screen">
  <div class="flex flex-col items-center gap-2">
    <GammaLogo size="64px" />
    <h1 class="text-3xl font-black tracking-tight text-indigo-400">GAMMA</h1>
  </div>

  <div class="w-full max-w-xs space-y-4">
    <input
      type="text"
      placeholder="Room Code"
      maxlength="4"
      autocomplete="off"
      autocapitalize="characters"
      bind:value={roomCode}
      class="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-center text-2xl font-mono tracking-widest uppercase focus:outline-none focus:border-indigo-500"
      data-testid="room-code-input"
    />

    <input
      type="text"
      placeholder="Your Name"
      maxlength="20"
      autocomplete="off"
      bind:value={name}
      class="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-indigo-500"
      data-testid="name-input"
    />

    {#if localError || error}
      <p class="text-red-400 text-sm text-center">{localError || error}</p>
    {/if}

    <button
      class="w-full py-4 rounded-xl text-lg font-bold bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition-all
        {submitting ? 'opacity-50 pointer-events-none' : ''}"
      on:click={handleJoin}
      data-testid="join-btn"
    >{submitting ? "Joining…" : "Join Game"}</button>
  </div>
</div>
