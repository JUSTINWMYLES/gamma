<script lang="ts">
  import type { Room } from "colyseus.js";
  import type { RoomState, PlayerState } from "../../../shared/types";
  import { GAME_REGISTRY, getGameUnavailableReason } from "../../../shared/types";
  import { onMount } from "svelte";

  export let room: Room;
  export let state: RoomState;
  export let me: PlayerState | undefined;

  // ── Derived state ─────────────────────────────────────────────────────────

  $: isHost = me?.id === state.hostSessionId;
  $: setupStep = state.setupStep ?? 0;
  $: setupDone = setupStep >= 4;
  $: selectedGameMeta = setupDone
    ? GAME_REGISTRY.find((g) => g.id === state.selectedGame)
    : null;

  const SETUP_STEP_LABELS: Record<number, string> = {
    1: "Host is choosing location…",
    2: "Host is choosing activity level…",
    3: "Host is choosing display setup…",
  };

  // ── Actions ───────────────────────────────────────────────────────────────

  function ready() {
    room.send("player_ready", {});
  }

  function unready() {
    room.send("player_unready", {});
  }

  // Host setup actions
  function sendSetup(patch: Record<string, unknown>) {
    room.send("update_setup", patch);
  }

  function selectLocation(mode: "same" | "remote") {
    sendSetup({ locationMode: mode, setupStep: 2 });
  }

  function selectActivity(level: "none" | "some" | "full") {
    sendSetup({ activityLevel: level, setupStep: 3 });
  }

  function selectDisplay(has: boolean) {
    sendSetup({ hasSecondaryDisplay: has, setupStep: 4 });
  }

  function resetSetup() {
    sendSetup({ locationMode: "", activityLevel: "", hasSecondaryDisplay: false, setupStep: 1 });
  }

  function selectGame(id: string) {
    room.send("select_game", { gameId: id });
  }

  function start() {
    room.send("start_game", {});
  }

  function updateConfig(patch: Record<string, unknown>) {
    room.send("update_config", patch);
  }

  // Start setup on first render if host and not yet started
  onMount(() => {
    if (isHost && setupStep === 0) {
      sendSetup({ setupStep: 1 });
    }
  });
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-6 p-6" data-testid="phone-lobby">

  <!-- ── Room code (always visible) ──────────────────────────────── -->
  <div class="text-center">
    <p class="text-gray-400 text-sm">Room</p>
    <p class="text-4xl font-mono font-black tracking-widest text-white">{state.roomCode}</p>
  </div>

  {#if !setupDone}
    <!-- ── Setup in progress ─────────────────────────────────────── -->
    {#if isHost}
      <!-- Host: interactive setup wizard -->
      <div class="w-full max-w-sm">
        {#if setupStep === 1}
          <h2 class="text-xl font-bold text-center mb-4 text-indigo-400">Are you all in the same room?</h2>
          <div class="grid grid-cols-2 gap-4">
            <button
              class="flex flex-col items-center gap-2 p-6 rounded-xl border-2 border-gray-700 bg-gray-800 hover:border-indigo-500 active:bg-indigo-900 transition-colors"
              on:click={() => selectLocation("same")}
            >
              <span class="text-4xl">🏠</span>
              <span class="font-bold">Together</span>
              <span class="text-xs text-gray-400">Same room</span>
            </button>
            <button
              class="flex flex-col items-center gap-2 p-6 rounded-xl border-2 border-gray-700 bg-gray-800 hover:border-indigo-500 active:bg-indigo-900 transition-colors"
              on:click={() => selectLocation("remote")}
            >
              <span class="text-4xl">🌍</span>
              <span class="font-bold">Remote</span>
              <span class="text-xs text-gray-400">Different locations</span>
            </button>
          </div>

        {:else if setupStep === 2}
          <h2 class="text-xl font-bold text-center mb-4 text-indigo-400">How active?</h2>
          <div class="grid grid-cols-3 gap-3">
            <button
              class="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-gray-700 bg-gray-800 hover:border-indigo-500 active:bg-indigo-900 transition-colors"
              on:click={() => selectActivity("none")}
            >
              <span class="text-3xl">🛋️</span>
              <span class="text-sm font-bold">None</span>
            </button>
            <button
              class="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-gray-700 bg-gray-800 hover:border-indigo-500 active:bg-indigo-900 transition-colors"
              on:click={() => selectActivity("some")}
            >
              <span class="text-3xl">🚶</span>
              <span class="text-sm font-bold">Some</span>
            </button>
            <button
              class="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-gray-700 bg-gray-800 hover:border-indigo-500 active:bg-indigo-900 transition-colors"
              on:click={() => selectActivity("full")}
            >
              <span class="text-3xl">🏃</span>
              <span class="text-sm font-bold">Full</span>
            </button>
          </div>

        {:else if setupStep === 3}
          <h2 class="text-xl font-bold text-center mb-4 text-indigo-400">Using a shared screen?</h2>
          <div class="grid grid-cols-2 gap-4">
            <button
              class="flex flex-col items-center gap-2 p-6 rounded-xl border-2 border-gray-700 bg-gray-800 hover:border-indigo-500 active:bg-indigo-900 transition-colors"
              on:click={() => selectDisplay(true)}
            >
              <span class="text-4xl">📺</span>
              <span class="font-bold">Yes</span>
            </button>
            <button
              class="flex flex-col items-center gap-2 p-6 rounded-xl border-2 border-gray-700 bg-gray-800 hover:border-indigo-500 active:bg-indigo-900 transition-colors"
              on:click={() => selectDisplay(false)}
            >
              <span class="text-4xl">📱</span>
              <span class="font-bold">Phone only</span>
            </button>
          </div>
        {/if}
      </div>
    {:else}
      <!-- Non-host: passive waiting -->
      <h1 class="text-2xl font-black text-indigo-400 text-center">Setting up…</h1>
      <p class="text-gray-400 text-center">
        {SETUP_STEP_LABELS[state.setupStep ?? 1] ?? "Host is completing setup…"}
      </p>
    {/if}

  {:else}
    <!-- ── Setup done — lobby ────────────────────────────────────── -->
    {#if isHost}
      <h1 class="text-2xl font-black text-indigo-400">Pick a game</h1>
    {:else}
      <h1 class="text-2xl font-black text-indigo-400">Waiting for host…</h1>
    {/if}

    <!-- Setup summary -->
    <div class="flex gap-2 flex-wrap justify-center text-xs">
      <span class="px-2 py-1 bg-gray-800 rounded-full text-gray-400">
        {state.locationMode === "same" ? "🏠 Same room" : "🌍 Remote"}
      </span>
      <span class="px-2 py-1 bg-gray-800 rounded-full text-gray-400">
        {state.activityLevel === "none" ? "🛋️ No movement" :
         state.activityLevel === "some" ? "🚶 Some movement" : "🏃 Full movement"}
      </span>
      {#if isHost}
        <button
          class="px-2 py-1 bg-gray-700 rounded-full text-xs text-gray-400 active:text-white transition-colors"
          on:click={resetSetup}
        >Change</button>
      {/if}
    </div>

    <!-- Game selection / display -->
    {#if isHost}
      <!-- Host: interactive game picker -->
      <div class="w-full max-w-xs space-y-2">
        {#each GAME_REGISTRY as g}
          {@const unavailableReason = getGameUnavailableReason(g, state)}
          <button
            class="w-full text-left px-4 py-3 rounded-lg border transition-colors
              {state.selectedGame === g.id
                ? 'border-indigo-500 bg-indigo-900 text-white'
                : unavailableReason
                  ? 'border-gray-700 bg-gray-900 text-gray-500 opacity-60'
                  : 'border-gray-700 bg-gray-800 text-gray-300 active:border-gray-500'}"
            on:click={() => !unavailableReason && selectGame(g.id)}
            disabled={!!unavailableReason}
          >
            <p class="font-semibold text-sm">{g.label}</p>
            <p class="text-xs mt-0.5 {unavailableReason ? 'text-gray-600' : 'text-gray-400'}">{g.description}</p>
            {#if unavailableReason}
              <p class="text-xs text-gray-600 mt-1">{unavailableReason}</p>
            {/if}
          </button>
        {/each}
      </div>

      <!-- Config -->
      {#if state.selectedGame}
        <div class="bg-gray-800 rounded-xl p-4 w-full max-w-xs space-y-3">
          <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Config</h3>
          <label class="flex items-center justify-between">
            <span class="text-sm text-gray-300">Rounds</span>
            <input
              type="number"
              min="1"
              max="5"
              value={state.gameConfig.roundCount}
              class="w-14 bg-gray-700 text-white text-center rounded px-2 py-1 text-sm"
              on:change={(e) => updateConfig({ roundCount: Number(e.currentTarget.value) })}
            />
          </label>
          <label class="flex items-center justify-between">
            <span class="text-sm text-gray-300">Time Limit (s)</span>
            <input
              type="number"
              min="10"
              max="120"
              value={state.gameConfig.timeLimitSecs}
              class="w-14 bg-gray-700 text-white text-center rounded px-2 py-1 text-sm"
              on:change={(e) => updateConfig({ timeLimitSecs: Number(e.currentTarget.value) })}
            />
          </label>
        </div>
      {/if}
    {:else}
      <!-- Non-host: read-only game info -->
      {#if selectedGameMeta}
        <div class="bg-indigo-900 border border-indigo-600 rounded-xl p-4 w-full max-w-xs text-center">
          <p class="text-xs text-indigo-400 uppercase tracking-widest mb-1">Selected game</p>
          <p class="font-bold text-white">{selectedGameMeta.label}</p>
          <p class="text-xs text-gray-300 mt-1">{selectedGameMeta.description}</p>
        </div>
      {:else}
        <div class="w-full max-w-xs space-y-2">
          <p class="text-gray-400 text-sm text-center">Host is picking a game…</p>
          {#each GAME_REGISTRY as g}
            {@const unavailable = getGameUnavailableReason(g, state)}
            <div
              class="px-4 py-3 rounded-lg border
                {unavailable
                  ? 'border-gray-700 bg-gray-900 opacity-50'
                  : 'border-gray-700 bg-gray-800'}"
            >
              <p class="font-semibold text-sm {unavailable ? 'text-gray-500' : 'text-gray-200'}">{g.label}</p>
              {#if unavailable}
                <p class="text-xs text-gray-600 mt-0.5">{unavailable}</p>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    {/if}

    <!-- Player list -->
    <div class="bg-gray-800 rounded-xl p-4 w-full max-w-xs">
      <p class="text-gray-400 text-sm mb-2 text-center">Players ({state.players.size})</p>
      <ul class="space-y-1">
        {#each [...state.players.values()] as p}
          <li class="flex items-center justify-between text-sm">
            <span class="{p.id === me?.id ? 'font-bold text-indigo-400' : 'text-gray-300'}">{p.name}{p.id === me?.id ? ' (you)' : ''}</span>
            {#if p.isReady}
              <span class="text-green-400 font-bold">✓</span>
            {/if}
          </li>
        {/each}
      </ul>
    </div>

    <!-- Host: start button. Non-host: ready button. -->
    {#if isHost}
      <button
        class="w-full max-w-xs py-4 rounded-xl text-lg font-bold transition-all active:scale-95
          {state.selectedGame && state.players.size >= 1
            ? 'bg-indigo-600 active:bg-indigo-500 text-white'
            : 'bg-gray-700 text-gray-500'}"
        disabled={!state.selectedGame || state.players.size < 1}
        on:click={start}
        data-testid="start-btn"
      >Start Game</button>
    {:else}
      <button
        class="w-full max-w-xs py-4 rounded-xl text-lg font-bold transition-all active:scale-95
          {me?.isReady
            ? 'bg-green-700 text-green-200 active:bg-red-800 active:text-red-200'
            : 'bg-indigo-600 active:bg-indigo-500 text-white'}"
        on:click={me?.isReady ? unready : ready}
        data-testid="ready-btn"
      >{me?.isReady ? 'Ready ✓ (tap to undo)' : 'Ready Up'}</button>
    {/if}
  {/if}
</div>
