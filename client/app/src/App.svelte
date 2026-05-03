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
   *
   * Extracted modules (M1):
   *   - lib/roomConnector.ts: session persistence, room wiring, connection flows
   *   - lib/musicManager.ts: viewer background music management
   */
  import { onMount, onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState, Phase, PlayerState } from "../../shared/types";

  // ── Extracted modules ─────────────────────────────────────────────
  import {
    saveSession,
    loadSession,
    clearSession,
    describeError,
    wireRoom,
    viewerJoinRoom as doViewerJoin,
    onJoin as doJoin,
    onHost as doHost,
  } from "./lib/roomConnector";
  import { MusicManager, type TrackId } from "./lib/musicManager";

  // ── Shared components ─────────────────────────────────────────────
  import FloatingBackground from "./components/FloatingBackground.svelte";
  import ThemeToggle from "./components/ThemeToggle.svelte";
  import { isDark } from "./stores/theme";

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
  type ViewerView = "join_code" | "room";

  let role: Role = "none";
  let playerView: PlayerView = "landing";
  let viewerView: ViewerView = "join_code";

  let room: Room<RoomState> | null = null;
  let state: RoomState | null = null;
  let phase: Phase = "lobby";
  let myId: string = "";
  let error: string = "";
  let joinError: string = "";
  let connecting = false;
  let leavingVoluntarily = false;
  let showLeaveConfirm = false;
  let viewerTrackOverride: TrackId | null | undefined = undefined;

  // ── Music manager ─────────────────────────────────────────────────
  const music = new MusicManager();
  let musicAudio: HTMLAudioElement | null = null;

  function onViewerMusicTrackChange(event: CustomEvent<{ trackId: TrackId | null }>) {
    viewerTrackOverride = event.detail.trackId;
  }

  // ── Role selection handlers ───────────────────────────────────────

  function selectViewer() {
    role = "viewer";
    viewerView = "join_code";
  }

  async function viewerJoinRoom(roomCode: string) {
    leavingVoluntarily = false;
    connecting = true;
    error = "";
    try {
      const r = await doViewerJoin(roomCode);
      cleanupRoomListeners = wireRoom(r, {
        onStateChange: (s, p) => { state = s; phase = p as Phase; },
        onError: (err) => { error = err; setTimeout(() => { if (error) resetToRoleSelect(); }, 4000); },
        onLeave: (err) => { if (leavingVoluntarily) return; error = err; setTimeout(() => { if (error) resetToRoleSelect(); }, 4000); },
      });
      room = r;
      myId = r.sessionId;
      state = r.state;
      phase = state.phase;
      viewerView = "room";
      connecting = false;
      saveSession({ roomCode: roomCode.toUpperCase(), name: "", role: "viewer" });
    } catch (e) {
      error = `Could not join room: ${describeError(e)}`;
      connecting = false;
    }
  }

  function selectPlayer() {
    role = "player";
    playerView = "landing";
  }

  // ── Player flow handlers ──────────────────────────────────────────

  async function onJoin(roomCode: string, name: string) {
    leavingVoluntarily = false;
    joinError = "";
    try {
      const r = await doJoin(roomCode, name);
      cleanupRoomListeners = wireRoom(r, {
        onStateChange: (s, p) => { state = s; phase = p as Phase; },
        onError: (err) => { error = err; setTimeout(() => { if (error) resetToRoleSelect(); }, 4000); },
        onLeave: (err) => { if (leavingVoluntarily) return; error = err; setTimeout(() => { if (error) resetToRoleSelect(); }, 4000); },
      });
      room = r;
      myId = r.sessionId;
      state = r.state;
      phase = state.phase;
      playerView = "room";
      saveSession({ roomCode: roomCode.toUpperCase(), name, role: "player" });
    } catch (e) {
      const message = describeError(e);
      if (playerView === "join") {
        joinError = message;
        return;
      }
      error = message;
      throw e;
    }
  }

  async function onHost(name: string) {
    leavingVoluntarily = false;
    try {
      const r = await doHost(name);
      cleanupRoomListeners = wireRoom(r, {
        onStateChange: (s, p) => { state = s; phase = p as Phase; },
        onError: (err) => { error = err; setTimeout(() => { if (error) resetToRoleSelect(); }, 4000); },
        onLeave: (err) => { if (leavingVoluntarily) return; error = err; setTimeout(() => { if (error) resetToRoleSelect(); }, 4000); },
      });
      room = r;
      myId = r.sessionId;
      state = r.state;
      phase = state.phase;
      playerView = "room";
      joinError = "";
      const roomCode = r.state?.roomCode ?? "";
      if (roomCode) {
        saveSession({ roomCode, name, role: "player" });
      }
    } catch (e) {
      error = describeError(e);
      playerView = "landing";
    }
  }

  let cleanupRoomListeners: (() => void) | null = null;

  function resetToRoleSelect() {
    leavingVoluntarily = true;
    cleanupRoomListeners?.();
    cleanupRoomListeners = null;
    room?.leave();
    room = null;
    state = null;
    phase = "lobby";
    myId = "";
    error = "";
    connecting = false;
    role = "none";
    playerView = "landing";
    viewerView = "join_code";
    showLeaveConfirm = false;
    joinError = "";
    clearSession();
    music.pause();
    music.cleanup();
    viewerTrackOverride = null;
  }

  function endGameToLobby() {
    if (!room) return;
    room.send("end_game_to_lobby", {});
    showLeaveConfirm = false;
  }

  onMount(() => {
    music.bind(musicAudio);

    window.addEventListener("pointerdown", music.onUserInteraction.bind(music));
    window.addEventListener("keydown", music.onUserInteraction.bind(music));
    window.addEventListener("touchstart", music.onUserInteraction.bind(music), { passive: true });

    const saved = loadSession();
    if (saved) {
      if (saved.role === "player" && saved.roomCode && saved.name) {
        role = "player";
        connecting = true;
        onJoin(saved.roomCode, saved.name)
          .then(() => { connecting = false; })
          .catch(() => {
            clearSession();
            connecting = false;
            error = "";
            playerView = "landing";
          });
      } else if (saved.role === "viewer" && saved.roomCode) {
        role = "viewer";
        viewerJoinRoom(saved.roomCode);
      }
    }
  });

  onDestroy(() => {
    window.removeEventListener("pointerdown", music.onUserInteraction.bind(music));
    window.removeEventListener("keydown", music.onUserInteraction.bind(music));
    window.removeEventListener("touchstart", music.onUserInteraction.bind(music));
    music.cleanup();
    leavingVoluntarily = true;
    cleanupRoomListeners?.();
    room?.leave();
  });

  // ── Derived state ─────────────────────────────────────────────────

  $: me = state?.players?.get(myId) as PlayerState | undefined;
  $: typedRoom = room as Room<RoomState>;
  $: typedState = state as RoomState;
  $: sortedPlayers = state
    ? [...state.players.values()].sort((a, b) => b.score - a.score)
    : [];
  $: isPlayerHost = role === "player" && !!me && me.id === state?.hostSessionId;
  $: showHostEndToLobby = isPlayerHost && phase !== "lobby";
  $: themeTogglePositionClass = room && role === "viewer" && viewerView === "room" ? "right-14" : "right-3";
  $: leaveButtonPositionClass = role === "viewer" ? "right-3" : "left-3";
  $: viewerChromeInsetClass = "";

  $: if (state?.selectedGame !== "registry-26-audio-overlay" && viewerTrackOverride !== undefined) {
    viewerTrackOverride = undefined;
  }

  // Keep viewer music in sync with room phase + selected game.
  $: if (role === "viewer" && !connecting && !error && state) {
    phase;
    viewerTrackOverride;
    void music.sync(role, phase, state.selectedGame, viewerTrackOverride, connecting, error, !!state);
  } else {
    music.pause();
  }

  $: activeTrackAttribution = music.attribution;

  // Viewer room mode: lock to viewport height to prevent TV scrolling
  $: appRootClass = role === "viewer" && viewerView === "room" && state && !error
    ? "h-screen overflow-hidden flex flex-col bg-gray-950 text-white"
    : "min-h-screen flex flex-col bg-gray-950 text-white";

  // Show floating background on pre-game screens only (not during active games)
  const gamePhases: Phase[] = ["instructions", "countdown", "in_round", "round_end", "scoreboard", "game_over", "game_loading"];
  $: showBackground = !gamePhases.includes(phase);

</script>

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- Template                                                           -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<div data-testid="app-root" class={appRootClass}>

  <audio bind:this={musicAudio} preload="auto" on:ended={() => music.onMusicEnded(role, phase, state?.selectedGame ?? "", viewerTrackOverride)} />

  {#if showBackground}
    <FloatingBackground dark={$isDark} />
  {/if}

  <!-- Theme toggle — visible in lobby/pre-game phases -->
  {#if showBackground}
    <div class={`fixed top-3 ${themeTogglePositionClass} z-50`}>
      <ThemeToggle />
    </div>
  {/if}

  <!-- ── Leave Room button (visible when connected to a room) ──── -->
  {#if room && state && !error}
    <button
      class={`fixed top-3 ${leaveButtonPositionClass} z-50 w-9 h-9 flex items-center justify-center rounded-lg bg-gray-800/80 border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700 active:bg-red-900 transition-colors`}
      title="Leave room"
      on:click={() => (showLeaveConfirm = true)}
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h5a1 1 0 100-2H4V5h4a1 1 0 100-2H3z" clip-rule="evenodd"/>
        <path fill-rule="evenodd" d="M13.293 9.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L14.586 14H7a1 1 0 110-2h7.586l-1.293-1.293a1 1 0 010-1.414z" clip-rule="evenodd"/>
      </svg>
    </button>
  {/if}

  {#if role === "viewer" && state && !error && viewerView === "room"}
    <div class="fixed top-3 left-3 z-50 rounded-lg bg-black/60 border border-indigo-400/80 px-3 py-1.5 text-left backdrop-blur-sm">
      <p class="text-[10px] uppercase tracking-[0.2em] text-indigo-300">Room</p>
      <p class="font-mono text-base font-black tracking-[0.25em] text-yellow-300" data-testid="persistent-room-code">{state.roomCode}</p>
    </div>
  {/if}

  <!-- ── Leave confirmation dialog ─────────────────────────────── -->
  {#if showLeaveConfirm}
    <div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60"
         on:click|self={() => (showLeaveConfirm = false)}>
      <div class="bg-gray-900 border border-gray-700 rounded-2xl p-6 mx-6 max-w-xs w-full text-center space-y-4 shadow-2xl">
        <h3 class="text-lg font-bold text-white">Leave room?</h3>
        <p class="text-sm text-gray-400">
          {#if showHostEndToLobby}
            You can leave by yourself, or end the current game and send everyone in this room back to the lobby.
          {:else}
            You'll be disconnected and sent back to the start screen.
          {/if}
        </p>
        <div class={`grid gap-3 ${showHostEndToLobby ? 'grid-cols-1' : 'grid-cols-2'}`}>
          <button
            class="py-3 rounded-xl text-sm font-semibold bg-gray-700 text-gray-300 active:bg-gray-600 transition-colors"
            on:click={() => (showLeaveConfirm = false)}
          >Cancel</button>
          {#if showHostEndToLobby}
            <button
              class="py-3 rounded-xl text-sm font-semibold bg-amber-600 text-white active:bg-amber-500 transition-colors"
              on:click={endGameToLobby}
            >End Game for Everyone</button>
          {/if}
          <button
            class="py-3 rounded-xl text-sm font-semibold bg-red-600 text-white active:bg-red-500 transition-colors"
            on:click={() => { showLeaveConfirm = false; resetToRoleSelect(); }}
          >Leave</button>
        </div>
      </div>
    </div>
  {/if}

  <!-- ── Error overlay ─────────────────────────────────────────────── -->
  {#if error}
    <div class="flex-1 flex items-center justify-center p-6">
      <div class="text-center space-y-4">
        <p class="text-red-400 text-xl">{error}</p>
        <p class="text-gray-500 text-sm">Returning to start...</p>
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
    {#if viewerView === "join_code" && !state}
      <div class="flex-1 flex flex-col items-center justify-center gap-6 p-8">
        <h2 class="text-2xl font-bold text-gray-200">Join a Room as Display</h2>
        <p class="text-gray-400 text-sm text-center max-w-md">Enter the room code shown on the host's device. A player must create the room first.</p>
        {#if connecting}
          <p class="text-xl animate-pulse text-indigo-400">Connecting...</p>
        {:else}
          <form
            class="flex flex-col items-center gap-4"
            on:submit|preventDefault={(e) => {
              const form = e.currentTarget;
              const input = form.querySelector('input');
              if (input && input.value.trim()) viewerJoinRoom(input.value.trim());
            }}
          >
            <input
              type="text"
              placeholder="ROOM CODE"
              maxlength="4"
              class="text-center text-4xl font-mono tracking-[0.3em] w-56 bg-gray-800 border-2 border-gray-600 rounded-xl px-4 py-3 text-white uppercase focus:border-indigo-500 focus:outline-none"
              autofocus
            />
            <button
              type="submit"
              class="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-lg font-bold transition-colors"
            >Join as Display</button>
          </form>
        {/if}
        <button
          class="text-sm text-gray-500 hover:text-gray-300 underline mt-4"
          on:click={resetToRoleSelect}
        >Back</button>
      </div>
    {:else if connecting}
      <div class="flex-1 flex items-center justify-center">
        <p class="text-2xl animate-pulse">Connecting to server...</p>
      </div>
    {:else if state}
      <div class={`flex-1 min-h-0 flex flex-col ${viewerChromeInsetClass}`}>
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
          <ViewerGame room={typedRoom} state={typedState} on:musictrackchange={onViewerMusicTrackChange} />
        {:else if phase === "round_end"}
          <ViewerRoundEnd state={typedState} {sortedPlayers} />
        {:else if phase === "scoreboard"}
          <ViewerScoreboard state={typedState} {sortedPlayers} />
        {:else if phase === "game_over"}
          <ViewerGameOver room={typedRoom} state={typedState} {sortedPlayers} />
        {/if}
      </div>
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
      <div class="absolute top-4 left-4 z-50">
        <button
          class="text-sm text-gray-500 hover:text-gray-300 underline"
          on:click={resetToRoleSelect}
        >Change role</button>
      </div>

    {:else if playerView === "join"}
      <div class="flex flex-col flex-1">
        <JoinScreen
          error={joinError}
          on:join={(e) => onJoin(e.detail.roomCode, e.detail.name)}
        />
        <button
          class="text-gray-500 text-sm text-center py-4 underline"
          on:click={() => { playerView = "landing"; error = ""; joinError = ""; }}
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

  {#if role === "viewer"}
    {#if activeTrackAttribution && (phase === "lobby" || phase === "game_over" || phase === "scoreboard")}
      <div class="px-3 py-2 text-[11px] text-gray-300/90 bg-black/30 border-t border-white/10">
        {activeTrackAttribution} • https://creativecommons.org/licenses/by/4.0/ • Full credit: ATTRIBUTIONS.md
      </div>
    {:else if phase === "lobby" && room && state}
      <div class="px-3 py-2 text-[11px] text-gray-500 bg-black/20 border-t border-white/10 text-center">
        Music: Kevin MacLeod (incompetech.com) — Licensed under CC BY 4.0
      </div>
    {/if}
  {/if}
</div>
