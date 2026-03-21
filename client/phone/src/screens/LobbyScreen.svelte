<script lang="ts">
  import type { Room } from "colyseus.js";
  import type { RoomState, PlayerState } from "../../../shared/types";
  import { GAME_REGISTRY, getGameUnavailableReason } from "../../../shared/types";

  export let room: Room;
  export let state: RoomState;
  export let me: PlayerState | undefined;

  function ready() {
    room.send("player_ready", {});
  }

  function unready() {
    room.send("player_unready", {});
  }

  $: setupDone = (state.setupStep ?? 0) >= 4;
  $: selectedGameMeta = setupDone
    ? GAME_REGISTRY.find((g) => g.id === state.selectedGame)
    : null;

  const SETUP_STEP_LABELS: Record<number, string> = {
    1: "Host is choosing location…",
    2: "Host is choosing activity level…",
    3: "Host is choosing display setup…",
  };
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-6 p-6" data-testid="phone-lobby">
  {#if !setupDone}
    <!-- Setup in progress -->
    <h1 class="text-2xl font-black text-indigo-400 text-center">Setting up…</h1>
    <p class="text-gray-400 text-center">
      {SETUP_STEP_LABELS[state.setupStep ?? 1] ?? "Host is completing setup…"}
    </p>
    <div class="text-center">
      <p class="text-gray-400 text-sm">Room</p>
      <p class="text-4xl font-mono font-black tracking-widest text-white">{state.roomCode}</p>
    </div>
  {:else}
    <!-- Setup done — show lobby -->
    <h1 class="text-3xl font-black text-indigo-400">Waiting for host…</h1>

    <div class="text-center">
      <p class="text-gray-400 text-sm">Room</p>
      <p class="text-4xl font-mono font-black tracking-widest text-white">{state.roomCode}</p>
    </div>

    <!-- Setup summary -->
    <div class="flex gap-2 flex-wrap justify-center text-xs">
      <span class="px-2 py-1 bg-gray-800 rounded-full text-gray-400">
        {state.locationMode === "same" ? "🏠 Same room" : "🌍 Remote"}
      </span>
      <span class="px-2 py-1 bg-gray-800 rounded-full text-gray-400">
        {state.activityLevel === "none" ? "🛋️ No movement" :
         state.activityLevel === "some" ? "🚶 Some movement" : "🏃 Full movement"}
      </span>
    </div>

    <!-- Selected game -->
    {#if selectedGameMeta}
      <div class="bg-indigo-900 border border-indigo-600 rounded-xl p-4 w-full max-w-xs text-center">
        <p class="text-xs text-indigo-400 uppercase tracking-widest mb-1">Selected game</p>
        <p class="font-bold text-white">{selectedGameMeta.label}</p>
        <p class="text-xs text-gray-300 mt-1">{selectedGameMeta.description}</p>
      </div>
    {:else}
      <!-- Game list (read-only on phone) -->
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

    <button
      class="w-full max-w-xs py-4 rounded-xl text-lg font-bold transition-all active:scale-95
        {me?.isReady
          ? 'bg-green-700 text-green-200 hover:bg-red-800 hover:text-red-200'
          : 'bg-indigo-600 hover:bg-indigo-500 text-white'}"
      on:click={me?.isReady ? unready : ready}
      data-testid="ready-btn"
    >{me?.isReady ? 'Ready ✓ (tap to undo)' : 'Ready Up'}</button>
  {/if}
</div>
