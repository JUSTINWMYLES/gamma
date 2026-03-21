<script lang="ts">
  /**
   * client/app/src/App.svelte
   *
   * Unified root component for the Gamma client.
   *
   * Flow:
   *   1. RoleSelectScreen — user picks "Display" or "Player"
   *   2a. Viewer path: auto-creates room as view_screen, shows TV screens
   *   2b. Player path: Landing → Join/Host → room screens
   */
  import { onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import { hostRoom, joinRoom, createRoom } from "../../shared/colyseusClient";
  import type { RoomState, Phase, PlayerState } from "../../shared/types";

  // ── Role selection ────────────────────────────────────────────────
  import RoleSelectScreen from "./screens/RoleSelectScreen.svelte";

  // ── Viewer screens ────────────────────────────────────────────────
  import ViewerLobby from "./screens/viewer/LobbyScreen.svelte";
  import ViewerInstructions from "./screens/viewer/InstructionsScreen.svelte";
  import ViewerCountdown from "./screens/viewer/CountdownScreen.svelte";
  import ViewerGame from "./screens/viewer/GameScreen.svelte";
  import ViewerRoundEnd from "./screens/viewer/RoundEndScreen.svelte";
  import ViewerScoreboard from "./screens/viewer/ScoreboardScreen.svelte";
  import ViewerGameOver from "./screens/viewer/GameOverScreen.svelte";

  // ── Player screens ────────────────────────────────────────────────
  import LandingScreen from "./screens/player/LandingScreen.svelte";
  import HostScreen from "./screens/player/HostScreen.svelte";
  import JoinScreen from "./screens/player/JoinScreen.svelte";
  import PlayerLobby from "./screens/player/LobbyScreen.svelte";
  import PlayerInstructions from "./screens/player/InstructionsScreen.svelte";
  import PlayerCountdown from "./screens/player/CountdownScreen.svelte";
  import PlayerGame from "./screens/player/GameScreen.svelte";
  import PlayerRoundEnd from "./screens/player/RoundEndScreen.svelte";
  import PlayerScoreboard from "./screens/player/ScoreboardScreen.svelte";
  import PlayerGameOver from "./screens/player/GameOverScreen.svelte";

  // ── App state ─────────────────────────────────────────────────────

  type Role = "none" | "viewer" | "player";
  type PlayerView = "landing" | "join" | "host" | "room";

  let role: Role = "none";
  let playerView: PlayerView = "landing";

  let room: Room<RoomState> | null = null;
  let state: RoomState | null = null;
  let phase: Phase = "lobby";
  let myId: string = "";
  let error: string = "";
  let connecting = false;

  // ── Role selection handlers ───────────────────────────────────────

  async function selectViewer() {
    role = "viewer";
    connecting = true;
    try {
      const r = await hostRoom();
      wireRoom(r);
      connecting = false;
    } catch (e) {
      error = `Could not create room: ${String(e)}`;
      connecting = false;
    }
  }

  function selectPlayer() {
    role = "player";
    playerView = "landing";
  }

  // ── Room wiring (shared between viewer/player) ────────────────────

  function wireRoom(r: Room<RoomState>) {
    room = r;
    myId = r.sessionId;
    state = r.state;
    phase = state.phase;

    r.onStateChange((s) => {
      state = s;
      phase = s.phase;
    });

    r.onError((code: number, msg?: string) => {
      error = `Server error ${code}: ${msg ?? "unknown"}`;
    });

    r.onLeave((code: number) => {
      if (code === 4001) {
        error = "You were kicked from the room by the host.";
      } else {
        error = "Disconnected from server.";
      }
    });
  }

  // ── Player flow handlers ──────────────────────────────────────────

  async function onJoin(roomCode: string, name: string) {
    try {
      const r = await joinRoom(roomCode, name);
      wireRoom(r);
      playerView = "room";
    } catch (e) {
      error = String(e);
      throw e;
    }
  }

  async function onHost(name: string) {
    try {
      const r = await createRoom(name);
      wireRoom(r);
      playerView = "room";
    } catch (e) {
      error = String(e);
      playerView = "landing";
    }
  }

  function resetToRoleSelect() {
    room?.leave();
    room = null;
    state = null;
    phase = "lobby";
    myId = "";
    error = "";
    connecting = false;
    role = "none";
    playerView = "landing";
  }

  onDestroy(() => room?.leave());

  // ── Derived state ─────────────────────────────────────────────────

  $: me = state?.players?.get(myId) as PlayerState | undefined;
  $: typedRoom = room as Room<RoomState>;
  $: typedState = state as RoomState;
  $: sortedPlayers = state
    ? [...state.players.values()].sort((a, b) => b.score - a.score)
    : [];
</script>

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- Template                                                           -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<div class="min-h-screen flex flex-col bg-gray-950 text-white">

  <!-- ── Error overlay ─────────────────────────────────────────────── -->
  {#if error}
    <div class="flex-1 flex items-center justify-center p-6">
      <div class="text-center space-y-4">
        <p class="text-red-400 text-xl">{error}</p>
        <button
          class="px-6 py-2 bg-indigo-600 rounded-lg hover:bg-indigo-500"
          on:click={resetToRoleSelect}
        >Back to Start</button>
      </div>
    </div>

  <!-- ── Role selection ────────────────────────────────────────────── -->
  {:else if role === "none"}
    <RoleSelectScreen
      on:selectViewer={selectViewer}
      on:selectPlayer={selectPlayer}
    />

  <!-- ═══════════════════════════════════════════════════════════════ -->
  <!-- VIEWER PATH                                                     -->
  <!-- ═══════════════════════════════════════════════════════════════ -->
  {:else if role === "viewer"}
    {#if connecting}
      <div class="flex-1 flex items-center justify-center">
        <p class="text-2xl animate-pulse">Connecting to server...</p>
      </div>
    {:else if state}
      <!-- Back button (only in lobby) -->
      {#if phase === "lobby"}
        <div class="absolute top-4 left-4 z-50">
          <button
            class="text-sm text-gray-500 hover:text-gray-300 underline"
            on:click={resetToRoleSelect}
          >Change role</button>
        </div>
      {/if}

      {#if phase === "lobby"}
        <ViewerLobby room={typedRoom} state={typedState} />
      {:else if phase === "game_loading"}
        <div class="flex-1 flex items-center justify-center">
          <p class="text-3xl animate-pulse">Loading game...</p>
        </div>
      {:else if phase === "instructions"}
        <ViewerInstructions room={typedRoom} state={typedState} />
      {:else if phase === "countdown"}
        <ViewerCountdown state={typedState} />
      {:else if phase === "in_round"}
        <ViewerGame room={typedRoom} state={typedState} />
      {:else if phase === "round_end"}
        <ViewerRoundEnd state={typedState} {sortedPlayers} />
      {:else if phase === "scoreboard"}
        <ViewerScoreboard state={typedState} {sortedPlayers} />
      {:else if phase === "game_over"}
        <ViewerGameOver room={typedRoom} state={typedState} {sortedPlayers} />
      {/if}
    {/if}

  <!-- ═══════════════════════════════════════════════════════════════ -->
  <!-- PLAYER PATH                                                     -->
  <!-- ═══════════════════════════════════════════════════════════════ -->
  {:else if role === "player"}
    {#if playerView === "landing"}
      <LandingScreen
        on:join={() => { playerView = "join"; }}
        on:host={() => { playerView = "host"; }}
      />
      <!-- Back to role select from landing -->
      <div class="absolute top-4 left-4 z-50">
        <button
          class="text-sm text-gray-500 hover:text-gray-300 underline"
          on:click={resetToRoleSelect}
        >Change role</button>
      </div>

    {:else if playerView === "join"}
      <div class="flex flex-col flex-1">
        <JoinScreen
          {error}
          on:join={(e) => onJoin(e.detail.roomCode, e.detail.name)}
        />
        <button
          class="text-gray-500 text-sm text-center py-4 underline"
          on:click={() => { playerView = "landing"; error = ""; }}
        >Back</button>
      </div>

    {:else if playerView === "host"}
      <HostScreen
        on:host={(e) => onHost(e.detail.name)}
        on:back={() => { playerView = "landing"; }}
      />

    {:else if playerView === "room" && state && me}
      {#if phase === "lobby"}
        <PlayerLobby room={typedRoom} state={typedState} {me} />
      {:else if phase === "game_loading"}
        <div class="flex-1 flex items-center justify-center">
          <p class="text-xl animate-pulse">Loading...</p>
        </div>
      {:else if phase === "instructions"}
        <PlayerInstructions room={typedRoom} state={typedState} {me} />
      {:else if phase === "countdown"}
        <PlayerCountdown state={typedState} />
      {:else if phase === "in_round"}
        <PlayerGame room={typedRoom} state={typedState} {me} {myId} />
      {:else if phase === "round_end"}
        <PlayerRoundEnd state={typedState} {me} />
      {:else if phase === "scoreboard"}
        <PlayerScoreboard state={typedState} {me} />
      {:else if phase === "game_over"}
        <PlayerGameOver room={typedRoom} state={typedState} {me} />
      {/if}
    {/if}
  {/if}
</div>
