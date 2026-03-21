<script lang="ts">
  /**
   * TV Lobby screen.
   * Shows: room code (large), player list with ready states,
   * game selector, config controls, and Start button.
   */
  import type { Room } from "colyseus.js";
  import type { RoomState } from "../../../shared/types";

  export let room: Room;
  export let state: RoomState;

  const GAMES = [
    { id: "registry-14-dont-get-caught", label: "Don't Get Caught" },
  ];

  function selectGame(id: string) {
    room.send("select_game", { gameId: id });
  }

  function start() {
    room.send("start_game", {});
  }

  function updateConfig(patch: Record<string, unknown>) {
    room.send("update_config", patch);
  }
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-8 p-10">
  <!-- Room code -->
  <div class="text-center">
    <p class="text-gray-400 text-sm uppercase tracking-widest mb-1">Join at gamma.app/join</p>
    <p
      class="text-8xl font-black tracking-widest font-mono text-indigo-400"
      data-testid="room-code"
    >{state.roomCode}</p>
  </div>

  <div class="w-full max-w-4xl grid grid-cols-2 gap-8">
    <!-- Player list -->
    <div>
      <h2 class="text-lg font-semibold text-gray-300 mb-3">Players ({state.players.size})</h2>
      <ul class="space-y-2" data-testid="player-list">
        {#each [...state.players.values()] as player (player.id)}
          <li class="flex items-center gap-3 bg-gray-800 rounded-lg px-4 py-2">
            <span class="flex-1 font-medium">{player.name}</span>
            {#if player.isReady}
              <span class="text-green-400 text-sm font-semibold">READY</span>
            {:else}
              <span class="text-gray-500 text-sm">Waiting…</span>
            {/if}
          </li>
        {/each}
        {#if state.players.size === 0}
          <li class="text-gray-500 italic text-sm">No players yet. Ask them to scan the code!</li>
        {/if}
      </ul>
    </div>

    <!-- Game selection + config -->
    <div class="space-y-4">
      <div>
        <h2 class="text-lg font-semibold text-gray-300 mb-3">Select Game</h2>
        <div class="space-y-2">
          {#each GAMES as g}
            <button
              class="w-full text-left px-4 py-3 rounded-lg border transition-colors
                {state.selectedGame === g.id
                  ? 'border-indigo-500 bg-indigo-900 text-white'
                  : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-500'}"
              on:click={() => selectGame(g.id)}
            >{g.label}</button>
          {/each}
        </div>
      </div>

      <!-- Config -->
      <div class="bg-gray-800 rounded-lg p-4 space-y-3">
        <h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wide">Config</h3>
        <label class="flex items-center justify-between">
          <span class="text-gray-300">Rounds</span>
          <input
            type="number"
            min="1"
            max="5"
            value={state.gameConfig.roundCount}
            class="w-16 bg-gray-700 text-white text-center rounded px-2 py-1"
            on:change={(e) => updateConfig({ roundCount: Number(e.currentTarget.value) })}
          />
        </label>
        <label class="flex items-center justify-between">
          <span class="text-gray-300">Time Limit (s)</span>
          <input
            type="number"
            min="20"
            max="120"
            value={state.gameConfig.timeLimitSecs}
            class="w-16 bg-gray-700 text-white text-center rounded px-2 py-1"
            on:change={(e) => updateConfig({ timeLimitSecs: Number(e.currentTarget.value) })}
          />
        </label>
      </div>

      <button
        class="w-full py-4 rounded-xl text-xl font-bold transition-colors
          {state.selectedGame && state.players.size >= 1
            ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
            : 'bg-gray-700 text-gray-500 cursor-not-allowed'}"
        disabled={!state.selectedGame || state.players.size < 1}
        on:click={start}
        data-testid="start-btn"
      >Start Game →</button>
    </div>
  </div>
</div>
