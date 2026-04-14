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
  import { onMount, onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import { hostRoom, joinRoom, createRoom, joinAsViewer } from "../../shared/colyseusClient";
  import type { RoomState, Phase, PlayerState } from "../../shared/types";

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

  // ── Session persistence for reconnection on page refresh ──────────
  const SESSION_KEY = "gamma-session";

  interface SessionInfo {
    roomCode: string;
    name: string;
    role: "player" | "viewer";
  }

  function saveSession(info: SessionInfo) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(info));
    } catch { /* quota exceeded or private browsing — non-critical */ }
  }

  function loadSession(): SessionInfo | null {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as SessionInfo;
    } catch { return null; }
  }

  function clearSession() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  }

  // ── Viewer-only background music ──────────────────────────────────

  type TrackId =
    | "cloud"
    | "fart"
    | "zazie"
    | "pixelland"
    | "vivacity"
    | "le_grand_chase"
    | "thinking"
    | "entertainer"
    | "ouroboros"
    | "two_finger_johnny"
    | "pinball_spring_160";

  const TRACK_CONFIG: Record<TrackId, { file: string; volume: number; attribution: string }> = {
    cloud:          { file: "/cloud_dancer.mp3",    volume: 0.35, attribution: '"Cloud Dancer" — Kevin MacLeod (incompetech.com), CC BY 4.0' },
    fart:           { file: "/farting_around.mp3",   volume: 0.42, attribution: '"Farting Around" — Kevin MacLeod (incompetech.com), CC BY 4.0' },
    zazie:          { file: "/zazie.mp3",            volume: 0.35, attribution: '"Zazie" — Kevin MacLeod (incompetech.com), CC BY 4.0' },
    pixelland:      { file: "/pixelland.mp3",        volume: 0.35, attribution: '"Pixelland" — Kevin MacLeod (incompetech.com), CC BY 4.0' },
    vivacity:       { file: "/vivacity.mp3",         volume: 0.35, attribution: '"Vivacity" — Kevin MacLeod (incompetech.com), CC BY 4.0' },
    le_grand_chase: { file: "/le_grand_chase.mp3",   volume: 0.35, attribution: '"Le Grand Chase" — Kevin MacLeod (incompetech.com), CC BY 4.0' },
    thinking:       { file: "/thinking_music.mp3",   volume: 0.35, attribution: '"Thinking Music" — Kevin MacLeod (incompetech.com), CC BY 4.0' },
    entertainer:    { file: "/the_entertainer.mp3",  volume: 0.34, attribution: '"The Entertainer" — Kevin MacLeod (incompetech.com), CC BY 4.0' },
    ouroboros:      { file: "/ouroboros.mp3",        volume: 0.36, attribution: '"Ouroboros" — Kevin MacLeod (incompetech.com), CC BY 4.0' },
    two_finger_johnny: { file: "/two_finger_johnny.mp3", volume: 0.35, attribution: '"Two Finger Johnny" — Kevin MacLeod (incompetech.com), CC BY 4.0' },
    pinball_spring_160: { file: "/pinball_spring_160.mp3", volume: 0.35, attribution: '"Pinball Spring 160" — Kevin MacLeod (incompetech.com), CC BY 4.0' },
  };

  let musicAudio: HTMLAudioElement | null = null;
  let currentTrack: TrackId | null = null;
  let userHasInteracted = false;
  let viewerTrackOverride: TrackId | null = null;

  function pauseAllTracks() {
    if (musicAudio) {
      musicAudio.pause();
    }
  }

  /** Game-to-track mapping for in_round phase. */
  const GAME_TRACK_MAP: Record<string, TrackId> = {
    "registry-03-tap-speed":             "pinball_spring_160",
    "registry-19-shave-the-yak":        "fart",
    "registry-25-lowball-marketplace":   "zazie",
    "registry-04-escape-maze":           "pixelland",
    "registry-17-fire-match-blow-shake": "vivacity",
    "registry-14-dont-get-caught":       "le_grand_chase",
    "registry-20-odd-one-out":           "thinking",
    "registry-40-paint-match":           "thinking",
    "registry-10-grid-tap-colors":       "ouroboros",
  };

  function desiredTrack(): TrackId | null {
    if (role !== "viewer" || !state) return null;
    if (phase === "lobby") {
      return "cloud";
    }
    if (
      state.selectedGame === "registry-43-medical-story" &&
      phase !== "game_loading"
    ) {
      return "entertainer";
    }
    if (state.selectedGame === "registry-26-audio-overlay") {
      if (phase === "instructions") {
        return "two_finger_johnny";
      }
      return phase === "in_round" ? viewerTrackOverride : null;
    }
    // Play game-specific music during in_round (and countdown/instructions for smoother transitions)
    if (phase === "in_round" || phase === "countdown" || phase === "instructions") {
      return GAME_TRACK_MAP[state.selectedGame] ?? null;
    }
    return null;
  }

  function onViewerMusicTrackChange(event: CustomEvent<{ trackId: TrackId | null }>) {
    viewerTrackOverride = event.detail.trackId;
  }

  async function syncTrackPlayback() {
    if (!musicAudio) return;

    const next = desiredTrack();
    if (!next) {
      pauseAllTracks();
      if (musicAudio) musicAudio.currentTime = 0;
      currentTrack = null;
      return;
    }

    const config = TRACK_CONFIG[next];
    const targetSrc = new URL(config.file, window.location.href).href;
    const sourceChanged = musicAudio.src !== targetSrc;

    musicAudio.loop = false;
    musicAudio.volume = config.volume;
    // Start muted if the user hasn't interacted yet — browsers allow muted autoplay.
    // Once the user has interacted, play unmuted.
    musicAudio.muted = !userHasInteracted;

    if (sourceChanged) {
      musicAudio.pause();
      musicAudio.src = targetSrc;
      musicAudio.load();
      musicAudio.currentTime = 0;
    }

    if (!sourceChanged && next === currentTrack && !musicAudio.paused) {
      return;
    }

    try {
      await musicAudio.play();
      currentTrack = next;
    } catch {
      // Extremely rare edge case — browser still blocked even muted play.
      currentTrack = null;
    }
  }

  function onMusicEnded() {
    if (!musicAudio) return;

    const next = desiredTrack();
    if (!next || currentTrack !== next) return;

    musicAudio.currentTime = 0;
    musicAudio.play().catch(() => {
      // If the browser blocks replay, the next state sync/user gesture will retry.
    });
  }

  function onUserInteraction() {
    if (userHasInteracted) return;
    userHasInteracted = true;
    // Unmute the already-playing audio now that we have a user gesture
    if (musicAudio && !musicAudio.paused) {
      musicAudio.muted = false;
    }
  }

  function describeError(e: unknown): string {
    if (e instanceof Error) return e.message;

    if (typeof e === "object" && e !== null) {
      const maybeEvent = e as { type?: string; message?: unknown; constructor?: { name?: string } };
      const tag = Object.prototype.toString.call(e);
      if (maybeEvent.type === "error" || maybeEvent.type === "timeout" || maybeEvent.constructor?.name === "ProgressEvent" || tag === "[object ProgressEvent]") {
        return "Could not reach the game server. This browser may not support the required connection features, or the public server URL/WebSocket routing may be blocked.";
      }
      if (typeof maybeEvent.message === "string" && maybeEvent.message.length > 0) {
        return maybeEvent.message;
      }
    }

    return String(e);
  }

  // ── Role selection handlers ───────────────────────────────────────

  async function selectViewer() {
    role = "viewer";
    viewerView = "join_code";
  }

  async function viewerJoinRoom(roomCode: string) {
    leavingVoluntarily = false;
    connecting = true;
    error = "";
    try {
      const r = await joinAsViewer(roomCode);
      wireRoom(r);
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
      // Serious errors: auto-return to start after a brief delay
      setTimeout(() => {
        if (error) resetToRoleSelect();
      }, 4000);
    });

    r.onLeave((code: number) => {
      if (leavingVoluntarily) return;
      if (code === 4001) {
        error = "You were kicked from the room by the host.";
      } else {
        error = "Disconnected from server.";
      }
      // Auto-return to start after showing the message
      setTimeout(() => {
        if (error) resetToRoleSelect();
      }, 4000);
    });
  }

  // ── Player flow handlers ──────────────────────────────────────────

  async function onJoin(roomCode: string, name: string) {
    leavingVoluntarily = false;
    joinError = "";
    try {
      const r = await joinRoom(roomCode, name);
      wireRoom(r);
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
      const r = await createRoom(name);
      wireRoom(r);
      playerView = "room";
      joinError = "";
      // Room code is in the state — save it for reconnection
      const roomCode = r.state?.roomCode ?? "";
      if (roomCode) {
        saveSession({ roomCode, name, role: "player" });
      }
    } catch (e) {
      error = describeError(e);
      playerView = "landing";
    }
  }

  function resetToRoleSelect() {
    leavingVoluntarily = true;
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
    pauseAllTracks();
    currentTrack = null;
    viewerTrackOverride = null;
  }

  function endGameToLobby() {
    if (!room) return;
    room.send("end_game_to_lobby", {});
    showLeaveConfirm = false;
  }

  onMount(() => {
    if (musicAudio) {
      musicAudio.preload = "auto";
      musicAudio.loop = false;
      musicAudio.setAttribute("playsinline", "");
      musicAudio.setAttribute("webkit-playsinline", "true");
    }

    window.addEventListener("pointerdown", onUserInteraction);
    window.addEventListener("keydown", onUserInteraction);
    window.addEventListener("touchstart", onUserInteraction, { passive: true });

    // ── Auto-reconnect on page refresh ────────────────────────────────
    // If we have a saved session (from before refresh), attempt to rejoin
    // the same room with the same name so the server can match us to our
    // disconnected PlayerState and restore our score/state.
    const saved = loadSession();
    if (saved) {
      if (saved.role === "player" && saved.roomCode && saved.name) {
        role = "player";
        connecting = true;
        onJoin(saved.roomCode, saved.name)
          .then(() => { connecting = false; })
          .catch(() => {
            // Room gone or server restarted — clear stale session and show landing
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
    window.removeEventListener("pointerdown", onUserInteraction);
    window.removeEventListener("keydown", onUserInteraction);
    window.removeEventListener("touchstart", onUserInteraction);
    pauseAllTracks();
    if (musicAudio) {
      musicAudio.src = "";
      musicAudio.load();
    }
    leavingVoluntarily = true;
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
  $: viewerChromeInsetClass = "";  // Room code overlay is fixed-position; no padding needed

  $: if (state?.selectedGame !== "registry-26-audio-overlay" && viewerTrackOverride !== null) {
    viewerTrackOverride = null;
  }

  // Keep viewer music in sync with room phase + selected game.
  $: if (role === "viewer" && !connecting && !error && state) {
    phase;
    viewerTrackOverride;
    void syncTrackPlayback();
  } else {
    pauseAllTracks();
    currentTrack = null;
  }

  $: activeTrackAttribution = currentTrack
    ? `Music: ${TRACK_CONFIG[currentTrack].attribution}`
    : "";

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

  <audio bind:this={musicAudio} preload="auto" on:ended={onMusicEnded} />

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
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 -translate-y-[2px]" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h5a1 1 0 100-2H4V5h4a1 1 0 100-2H3z" clip-rule="evenodd"/>
        <path fill-rule="evenodd" d="M13.293 9.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L14.586 14H7a1 1 0 110-2h7.586l-1.293-1.293a1 1 0 010-1.414z" clip-rule="evenodd"/>
      </svg>
    </button>
  {/if}

  {#if role === "viewer" && state && !error && viewerView === "room"}
    <div class="fixed top-3 left-3 z-50 rounded-lg bg-black/45 border border-white/10 px-3 py-1.5 text-left backdrop-blur-sm">
      <p class="text-[10px] uppercase tracking-[0.2em] text-gray-400">Room</p>
      <p class="font-mono text-base font-black tracking-[0.25em] text-white" data-testid="persistent-room-code">{state.roomCode}</p>
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
      <!-- Viewer: enter room code to join existing room -->
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
    {#if activeTrackAttribution}
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
