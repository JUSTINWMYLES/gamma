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
  import GameCardGrid from "../../components/GameCardGrid.svelte";
  import GameDetailView from "../../components/GameDetailView.svelte";
  import PlayerIcon from "../../components/PlayerIcon.svelte";

  export let room: Room;
  export let state: RoomState;

  $: setupStep = state.setupStep ?? 0;
  $: setupDone = setupStep >= 4;
  $: selectedGameMeta = GAME_REGISTRY.find((g) => g.id === state.selectedGame);
  $: allPlayersReady = [...state.players.values()].every((p) => !p.isConnected || p.isReady);
  $: hasQueue = (state.gameQueue?.length ?? 0) > 0;

  // ── Game detail overlay ─────────────────────────────────────────────────
  let detailGameId: string | null = null;
  $: detailGame = detailGameId ? GAME_REGISTRY.find((g) => g.id === detailGameId) ?? null : null;

  const DETAIL_THEMES: Record<string, { accent: string; bg: string }> = {
    "registry-03-tap-speed": { accent: "#ff6020", bg: "radial-gradient(ellipse at 50% 100%, #3d0e00, #0d0200)" },
    "registry-04-escape-maze": { accent: "#70e870", bg: "radial-gradient(ellipse at 50% 60%, #0a200a, #040a03)" },
    "registry-06-sound-replication": { accent: "#d080ff", bg: "radial-gradient(ellipse at 50% 50%, #1a0030, #06000e)" },
    "registry-07-hot-potato": { accent: "#ff9050", bg: "radial-gradient(ellipse at 50% 80%, #3d0a00, #0d0302)" },
    "registry-14-dont-get-caught": { accent: "#c8c8c8", bg: "#050505" },
    "registry-17-fire-match-blow-shake": { accent: "#f0c040", bg: "linear-gradient(180deg, #1e1500, #0e0a00)" },
    "registry-19-shave-the-yak": { accent: "#40f0a0", bg: "radial-gradient(ellipse at 50% 80%, #001e10, #000a06)" },
    "registry-20-odd-one-out": { accent: "#f060a0", bg: "radial-gradient(ellipse at 50% 50%, #200010, #08000a)" },
    "registry-25-lowball-marketplace": { accent: "#f0c040", bg: "linear-gradient(180deg, #1e1500, #0e0a00)" },
    "registry-26-audio-overlay": { accent: "#80a8ff", bg: "#020408" },
  };

  function openDetail(gameId: string) {
    detailGameId = gameId;
  }

  function closeDetail() {
    detailGameId = null;
  }
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-8 p-10">
  <!-- ── Game detail overlay ──────────────────────────────────── -->
  {#if detailGame}
    {@const dTheme = DETAIL_THEMES[detailGame.id] ?? { accent: "#818cf8", bg: "#050505" }}
    <GameDetailView
      game={detailGame}
      accent={dTheme.accent}
      artBg={dTheme.bg}
      isHost={false}
      isSelected={state.selectedGame === detailGame.id}
      on:back={closeDetail}
    />
  {/if}
  <!-- Room code — big and prominent for players to join -->
  <div class="text-center">
    <p class="text-gray-400 text-sm uppercase tracking-widest mb-1">Join at gamma.app/join</p>
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
        </div>
        <div>
          <h2 class="text-lg font-semibold text-gray-300 mb-3">Players ({state.players.size})</h2>
          <ul class="space-y-2" data-testid="player-list">
            {#each [...state.players.values()] as player (player.id)}
              <li class="flex items-center gap-3 bg-gray-800 rounded-lg px-4 py-2">
                <PlayerIcon player={player} size={32} />
                <span class="flex-1 font-medium">{player.name}</span>
                {#if player.isReady}
                  <span class="text-green-400 text-sm font-semibold">READY</span>
                {:else}
                  <span class="text-gray-500 text-sm">Waiting...</span>
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
          {#if hasQueue}
            <div class="bg-gray-800/60 rounded-lg p-4 space-y-1.5">
              <p class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Playlist ({state.queueIndex + 1} / {state.gameQueue?.length ?? 0})
              </p>
              {#each (state.gameQueue ?? []) as gameId, i}
                {@const meta = GAME_REGISTRY.find((g) => g.id === gameId)}
                <div class="flex items-center gap-2 text-sm
                  {i === (state.queueIndex ?? 0) ? 'text-indigo-400 font-bold' : i < (state.queueIndex ?? 0) ? 'text-gray-600 line-through' : 'text-gray-500'}">
                  <span class="w-6 text-right font-mono">{i + 1}.</span>
                  <span>{meta?.label ?? gameId}</span>
                </div>
              {/each}
            </div>
          {/if}
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
          <!-- No game selected yet — show readonly card grid so TV audience can see options -->
          <p class="text-gray-400 text-center text-sm mb-2">Host is picking a game...</p>
          <GameCardGrid {state} readonly={true} on:detail={(e) => openDetail(e.detail.gameId)} />
        {/if}
      </div>
    </div>
  {/if}
</div>
