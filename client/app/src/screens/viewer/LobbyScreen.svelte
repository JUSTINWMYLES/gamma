<script lang="ts">
  /**
   * Viewer LobbyScreen — display-only lobby for TV/projector.
   *
   * The viewer joins an existing room and shows:
   *   - Room code (large, for players to join)
   *   - Player list
   *   - Setup progress & selected game (readonly card grid)
   *
   * All controls (setup wizard, game selection, start) are on the
   * host player's phone.
   */
  import type { Room } from "colyseus.js";
  import type { RoomState } from "../../../../shared/types";
  import { GAME_REGISTRY } from "../../../../shared/types";
  import PlayerIcon from "../../components/PlayerIcon.svelte";

  export let room: Room;
  export let state: RoomState;

  $: setupStep = state.setupStep ?? 0;
  $: setupDone = setupStep >= 4;
  $: selectedGameMeta = GAME_REGISTRY.find((g) => g.id === state.selectedGame);
  $: allPlayersReady = [...state.players.values()].every((p) => !p.isConnected || p.isReady);
  $: connectedPlayers = [...state.players.values()].filter((p) => p.isConnected);
  $: micReadyCount = connectedPlayers.filter((p) => p.micPermission === "granted").length;
  $: motionReadyCount = connectedPlayers.filter((p) => p.motionPermission === "granted").length;
  $: densePlayerList = state.players.size >= 13;
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-8 p-10">
  <!-- Room code — big and prominent for players to join -->
  <div class="text-center">
    <p class="text-8xl font-black tracking-widest font-mono text-indigo-400" data-testid="room-code">{state.roomCode}</p>
  </div>

  {#if !setupDone}
    <!-- Setup in progress — passive display -->
    <div class="text-center space-y-3">
      <p class="text-2xl font-bold text-gray-300 animate-pulse">Setting up...</p>
      <p class="text-gray-500">The host is configuring the session on their phone.</p>
      {#if setupStep === 1}
        <p class="text-gray-400">Choosing location mode...</p>
      {:else if setupStep === 2}
        <p class="text-gray-400">Choosing activity level...</p>
      {:else if setupStep === 3}
        <p class="text-gray-400">Choosing display setup...</p>
      {/if}
    </div>
  {:else}
    <div class="w-full max-w-5xl grid grid-cols-2 gap-8">
      <!-- Left: setup summary + player list -->
      <div class="space-y-4">
        <div class="flex gap-2 flex-wrap">
          <span class="px-3 py-1 bg-gray-800 rounded-full text-sm text-gray-300">
            {state.locationMode === "same" ? "Same room" : "Remote"}
          </span>
          <span class="px-3 py-1 bg-gray-800 rounded-full text-sm text-gray-300">
            {state.activityLevel === "none" ? "No movement" :
             state.activityLevel === "some" ? "Some movement" : "Full movement"}
          </span>
          <span class="px-3 py-1 bg-gray-800 rounded-full text-sm text-gray-300">
            {state.hasSecondaryDisplay ? "With TV" : "Phone only"}
          </span>
          <span class="px-3 py-1 bg-gray-800 rounded-full text-sm text-gray-300">
            Mic {micReadyCount}/{connectedPlayers.length}
          </span>
          <span class="px-3 py-1 bg-gray-800 rounded-full text-sm text-gray-300">
            Motion {motionReadyCount}/{connectedPlayers.length}
          </span>
        </div>
        <div>
          <h2 class="text-lg font-semibold text-gray-300 mb-3">Players ({state.players.size})</h2>
          <ul class={densePlayerList ? "grid grid-cols-2 gap-2" : "space-y-2"} data-testid="player-list">
            {#each [...state.players.values()] as player (player.id)}
              <li class={`flex items-center gap-2 bg-gray-800 rounded-lg ${densePlayerList ? "px-3 py-1.5" : "px-4 py-2"}`}>
                <PlayerIcon player={player} size={densePlayerList ? 26 : 32} />
                <span class={`flex-1 truncate ${densePlayerList ? "text-sm font-semibold" : "font-medium"}`}>{player.name}</span>
                {#if player.isReady}
                  <span class={`${densePlayerList ? "text-[11px]" : "text-sm"} text-green-400 font-semibold`}>READY</span>
                {:else}
                  <span class={`${densePlayerList ? "text-[11px]" : "text-sm"} text-gray-500`}>Waiting...</span>
                {/if}
              </li>
            {/each}
            {#if state.players.size === 0}
              <li class="text-gray-500 italic text-sm">No players yet. Ask them to enter the room code!</li>
            {/if}
          </ul>
        </div>
      </div>

      <!-- Right: game display -->
      <div class="space-y-4">
        {#if selectedGameMeta}
          <div class="bg-indigo-900/50 border border-indigo-600 rounded-xl p-6 text-center">
            <p class="text-xs text-indigo-400 uppercase tracking-widest mb-2">Selected Game</p>
            <p class="text-2xl font-bold text-white">{selectedGameMeta.label}</p>
            <p class="text-sm text-gray-300 mt-2">{selectedGameMeta.description}</p>
          </div>
          {#if allPlayersReady && state.players.size >= 1}
            <div class="text-center">
              <p class="text-green-400 text-lg font-bold animate-pulse">All players ready!</p>
              <p class="text-gray-400 text-sm">Waiting for host to start...</p>
            </div>
          {:else}
            <div class="text-center">
              <p class="text-gray-400">Waiting for players to ready up...</p>
            </div>
          {/if}
        {:else}
          <div class="bg-gray-900/70 border border-gray-800 rounded-xl p-6 text-center">
            <p class="text-sm font-semibold uppercase tracking-widest text-gray-400">Game Selection</p>
            <p class="mt-3 text-xl font-bold text-white">Host is picking a game</p>
            <p class="mt-2 text-sm text-gray-400">The game list is hidden on the TV so the lobby stays within the screen.</p>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
