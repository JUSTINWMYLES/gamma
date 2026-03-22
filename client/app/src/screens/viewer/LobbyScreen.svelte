<script lang="ts">
  import type { Room } from "colyseus.js";
  import type { RoomState } from "../../../../shared/types";
  import { GAME_REGISTRY, getGameUnavailableReason } from "../../../../shared/types";

  export let room: Room;
  export let state: RoomState;

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

  function kickPlayer(targetId: string) {
    room.send("kick_player", { targetId });
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

  $: setupStep = state.setupStep ?? 0;
  $: setupDone = setupStep >= 4;
  $: isHost = true;
  $: allPlayersReady = [...state.players.values()].every((p) => !p.isConnected || p.isReady);
  $: canStart = !!state.selectedGame && state.players.size >= 1 && allPlayersReady;

  import { onMount } from "svelte";
  onMount(() => {
    if ((state.setupStep ?? 0) === 0) {
      sendSetup({ setupStep: 1 });
    }
  });
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-8 p-10">
  <div class="text-center">
    <p class="text-gray-400 text-sm uppercase tracking-widest mb-1">Join at gamma.app/join</p>
    <p class="text-8xl font-black tracking-widest font-mono text-indigo-400" data-testid="room-code">{state.roomCode}</p>
  </div>

  {#if !setupDone}
    <div class="w-full max-w-3xl">
      {#if setupStep === 1}
        <h2 class="text-2xl font-bold text-center mb-6">Are you all in the same room?</h2>
        <div class="grid grid-cols-2 gap-6">
          <button class="flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-gray-700 bg-gray-800 hover:border-indigo-500 hover:bg-indigo-900 transition-colors" on:click={() => selectLocation("same")}>
            <span class="text-6xl">🏠</span>
            <span class="text-xl font-bold">Together</span>
            <span class="text-sm text-gray-400 text-center">Everyone in the same room</span>
          </button>
          <button class="flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-gray-700 bg-gray-800 hover:border-indigo-500 hover:bg-indigo-900 transition-colors" on:click={() => selectLocation("remote")}>
            <span class="text-6xl">🌍</span>
            <span class="text-xl font-bold">Remote</span>
            <span class="text-sm text-gray-400 text-center">Playing from different locations</span>
          </button>
        </div>
      {:else if setupStep === 2}
        <h2 class="text-2xl font-bold text-center mb-6">How active do you want to get?</h2>
        <div class="grid grid-cols-3 gap-6">
          <button class="flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-gray-700 bg-gray-800 hover:border-indigo-500 hover:bg-indigo-900 transition-colors" on:click={() => selectActivity("none")}>
            <span class="text-6xl">🛋️</span>
            <span class="text-xl font-bold">No movement</span>
            <span class="text-sm text-gray-400 text-center">Phone in hand, fully seated</span>
          </button>
          <button class="flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-gray-700 bg-gray-800 hover:border-indigo-500 hover:bg-indigo-900 transition-colors" on:click={() => selectActivity("some")}>
            <span class="text-6xl">🚶</span>
            <span class="text-xl font-bold">Some movement</span>
            <span class="text-sm text-gray-400 text-center">Standing up, light activity</span>
          </button>
          <button class="flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-gray-700 bg-gray-800 hover:border-indigo-500 hover:bg-indigo-900 transition-colors" on:click={() => selectActivity("full")}>
            <span class="text-6xl">🏃</span>
            <span class="text-xl font-bold">Full movement</span>
            <span class="text-sm text-gray-400 text-center">Active, physical games</span>
          </button>
        </div>
      {:else if setupStep === 3}
        {#if state.locationMode === "same"}
          <h2 class="text-2xl font-bold text-center mb-6">Using a central screen?</h2>
          <p class="text-gray-400 text-center mb-6">
            {state.viewScreenConnected ? "View screen connected!" : "Connect a TV or central screen for the best experience. Players control from their phones."}
          </p>
          <div class="grid grid-cols-2 gap-6">
            <button class="flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-gray-700 bg-gray-800 hover:border-indigo-500 hover:bg-indigo-900 transition-colors" on:click={() => selectDisplay(true)}>
              <span class="text-6xl">📺</span>
              <span class="text-xl font-bold">Yes, using TV</span>
              <span class="text-sm text-gray-400 text-center">Everyone watches a shared screen</span>
            </button>
            <button class="flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-gray-700 bg-gray-800 hover:border-indigo-500 hover:bg-indigo-900 transition-colors" on:click={() => selectDisplay(false)}>
              <span class="text-6xl">📱</span>
              <span class="text-xl font-bold">Phone only</span>
              <span class="text-sm text-gray-400 text-center">Everyone uses their own phone</span>
            </button>
          </div>
        {:else}
          <h2 class="text-2xl font-bold text-center mb-6">Using a secondary TV display?</h2>
          <div class="grid grid-cols-2 gap-6">
            <button class="flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-gray-700 bg-gray-800 hover:border-indigo-500 hover:bg-indigo-900 transition-colors" on:click={() => selectDisplay(true)}>
              <span class="text-6xl">🖥️</span>
              <span class="text-xl font-bold">Yes</span>
              <span class="text-sm text-gray-400 text-center">Each player at a TV or monitor</span>
            </button>
            <button class="flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-gray-700 bg-gray-800 hover:border-indigo-500 hover:bg-indigo-900 transition-colors" on:click={() => selectDisplay(false)}>
              <span class="text-6xl">📱</span>
              <span class="text-xl font-bold">No</span>
              <span class="text-sm text-gray-400 text-center">Phone only</span>
            </button>
          </div>
        {/if}
      {/if}
    </div>
  {:else}
    <div class="w-full max-w-5xl grid grid-cols-2 gap-8">
      <div class="space-y-4">
        <div class="flex gap-2 flex-wrap">
          <span class="px-3 py-1 bg-gray-800 rounded-full text-sm text-gray-300">{state.locationMode === "same" ? "🏠 Same room" : "🌍 Remote"}</span>
          <span class="px-3 py-1 bg-gray-800 rounded-full text-sm text-gray-300">{state.activityLevel === "none" ? "🛋️ No movement" : state.activityLevel === "some" ? "🚶 Some movement" : "🏃 Full movement"}</span>
          <span class="px-3 py-1 bg-gray-800 rounded-full text-sm text-gray-300">{state.hasSecondaryDisplay ? "📺 With TV" : "📱 Phone only"}</span>
          <button class="px-3 py-1 bg-gray-700 rounded-full text-xs text-gray-400 hover:text-white transition-colors" on:click={resetSetup}>Change setup</button>
        </div>
        <div>
          <h2 class="text-lg font-semibold text-gray-300 mb-3">Players ({state.players.size})</h2>
          <ul class="space-y-2" data-testid="player-list">
            {#each [...state.players.values()] as player (player.id)}
              <li class="flex items-center gap-3 bg-gray-800 rounded-lg px-4 py-2">
                <span class="flex-1 font-medium">{player.name}</span>
                {#if player.isReady}
                  <span class="text-green-400 text-sm font-semibold">READY</span>
                {:else}
                  <span class="text-gray-500 text-sm">Waiting...</span>
                {/if}
                <button
                  class="text-red-400 hover:text-red-300 text-xs font-bold px-2 py-1 rounded bg-gray-700 hover:bg-red-900 transition-colors"
                  on:click={() => kickPlayer(player.id)}
                  title="Kick {player.name}"
                >Kick</button>
              </li>
            {/each}
            {#if state.players.size === 0}
              <li class="text-gray-500 italic text-sm">No players yet. Ask them to scan the code!</li>
            {/if}
          </ul>
        </div>
      </div>
      <div class="space-y-4">
        <div>
          <h2 class="text-lg font-semibold text-gray-300 mb-3">Select Game</h2>
          <div class="space-y-2">
            {#each GAME_REGISTRY as g}
              {@const unavailableReason = getGameUnavailableReason(g, state)}
              <button
                class="w-full text-left px-4 py-3 rounded-lg border transition-colors relative group
                  {state.selectedGame === g.id ? 'border-indigo-500 bg-indigo-900 text-white' : unavailableReason ? 'border-gray-700 bg-gray-900 text-gray-500 cursor-not-allowed opacity-60' : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-500'}"
                on:click={() => !unavailableReason && selectGame(g.id)}
                disabled={!!unavailableReason}
              >
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <p class="font-semibold">{g.label}</p>
                    <p class="text-xs mt-0.5 {unavailableReason ? 'text-gray-600' : 'text-gray-400'}">{g.description}</p>
                  </div>
                  {#if unavailableReason}
                    <span class="text-xs bg-gray-800 border border-gray-600 rounded px-2 py-0.5 flex-shrink-0 text-gray-500 mt-0.5">{unavailableReason}</span>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        </div>
        {#if state.selectedGame}
          <div class="bg-gray-800 rounded-lg p-4 space-y-3">
            <h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wide">Config</h3>
            <label class="flex items-center justify-between">
              <span class="text-gray-300">Rounds</span>
              <input type="number" min="1" max="5" value={state.gameConfig.roundCount} class="w-16 bg-gray-700 text-white text-center rounded px-2 py-1" on:change={(e) => updateConfig({ roundCount: Number(e.currentTarget.value) })} />
            </label>
            <label class="flex items-center justify-between">
              <span class="text-gray-300">Time Limit (s)</span>
              <input type="number" min="10" max="120" value={state.gameConfig.timeLimitSecs} class="w-16 bg-gray-700 text-white text-center rounded px-2 py-1" on:change={(e) => updateConfig({ timeLimitSecs: Number(e.currentTarget.value) })} />
            </label>

            {#if state.selectedGame === "registry-25-lowball-marketplace"}
              <label class="flex items-center justify-between gap-3">
                <span class="text-gray-300">Mode</span>
                <select
                  class="bg-gray-700 text-white rounded px-2 py-1"
                  value={state.gameConfig.gameMode === "funny_messages" ? "funny_messages" : "classic"}
                  on:change={(e) => updateConfig({ gameMode: e.currentTarget.value })}
                >
                  <option value="classic">Classic Bidding</option>
                  <option value="funny_messages">Funny Messages</option>
                </select>
              </label>
            {/if}
          </div>
        {/if}
        <button
          class="w-full py-4 rounded-xl text-xl font-bold transition-colors {canStart ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}"
          disabled={!canStart}
          on:click={start}
          data-testid="start-btn"
        >{canStart ? 'Start Game' : !state.selectedGame ? 'Pick a game' : !allPlayersReady ? 'Waiting for players...' : 'Start Game'}</button>
      </div>
    </div>
  {/if}
</div>
