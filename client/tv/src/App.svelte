<script lang="ts">
  /**
   * client/tv/src/App.svelte
   *
   * Root view-screen app. Manages Colyseus room connection and
   * routes to the correct screen based on room phase.
   */
  import { onMount, onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import { hostRoom } from "../../shared/colyseusClient";
  import type { RoomState, Phase } from "../../shared/types";

  import LobbyScreen from "./screens/LobbyScreen.svelte";
  import InstructionsScreen from "./screens/InstructionsScreen.svelte";
  import CountdownScreen from "./screens/CountdownScreen.svelte";
  import GameScreen from "./screens/GameScreen.svelte";
  import RoundEndScreen from "./screens/RoundEndScreen.svelte";
  import ScoreboardScreen from "./screens/ScoreboardScreen.svelte";
  import GameOverScreen from "./screens/GameOverScreen.svelte";

  let room: Room<RoomState> | null = null;
  let connectedRoom: Room<RoomState> | null = null;
  let state: RoomState | null = null;
  let phase: Phase = "lobby";
  let error: string = "";
  let connecting = true;

  // TV-only background music tracks (served from /audio via Vite publicDir)
  let cloudDancerTrack: HTMLAudioElement | null = null;
  let fartingAroundTrack: HTMLAudioElement | null = null;
  let currentTrack: "cloud" | "fart" | null = null;
  let audioBlocked = false;

  function pauseAllTracks() {
    if (cloudDancerTrack) cloudDancerTrack.pause();
    if (fartingAroundTrack) fartingAroundTrack.pause();
  }

  function desiredTrack(): "cloud" | "fart" | null {
    if (!state) return null;
    if (phase === "in_round" && state.selectedGame === "registry-19-shave-the-yak") {
      return "fart";
    }
    if (phase === "lobby") {
      return "cloud";
    }
    return null;
  }

  async function syncTrackPlayback() {
    if (!cloudDancerTrack || !fartingAroundTrack) return;

    const next = desiredTrack();
    if (!next) {
      pauseAllTracks();
      currentTrack = null;
      return;
    }

    if (next === currentTrack) return;

    pauseAllTracks();

    const target = next === "cloud" ? cloudDancerTrack : fartingAroundTrack;
    target.currentTime = 0;
    try {
      await target.play();
      currentTrack = next;
      audioBlocked = false;
    } catch {
      // Browser autoplay policy may require user interaction.
      currentTrack = null;
      audioBlocked = true;
    }
  }

  function onUserInteraction() {
    if (!audioBlocked) return;
    void syncTrackPlayback();
  }

  function enableSound() {
    void syncTrackPlayback();
  }

  onMount(async () => {
    cloudDancerTrack = new Audio("/cloud_dancer.mp3");
    cloudDancerTrack.loop = true;
    cloudDancerTrack.volume = 0.35;

    fartingAroundTrack = new Audio("/farting_around.mp3");
    fartingAroundTrack.loop = true;
    fartingAroundTrack.volume = 0.42;

    // Retry playback on the first user interactions after autoplay blocking.
    window.addEventListener("pointerdown", onUserInteraction);
    window.addEventListener("keydown", onUserInteraction);
    window.addEventListener("touchstart", onUserInteraction, { passive: true });

    try {
      room = await hostRoom();
      connectedRoom = room;
      state = room.state;
      phase = state.phase;

      room.onStateChange((newState) => {
        state = newState;
        phase = state.phase;
      });

      room.onError((code, msg) => {
        error = `Server error ${code}: ${msg}`;
      });

      room.onLeave(() => {
        error = "Disconnected from server.";
      });

      connecting = false;
    } catch (e) {
      error = `Could not create room: ${String(e)}`;
      connecting = false;
    }
  });

  onDestroy(() => {
    window.removeEventListener("pointerdown", onUserInteraction);
    window.removeEventListener("keydown", onUserInteraction);
    window.removeEventListener("touchstart", onUserInteraction);
    pauseAllTracks();
    room?.leave();
  });

  // Derived: sorted player array for scoreboard
  $: sortedPlayers = state
    ? [...state.players.values()].sort((a, b) => b.score - a.score)
    : [];

  // Keep TV music in sync with room phase + selected game.
  $: if (!connecting && !error && state) {
    void syncTrackPlayback();
  } else {
    pauseAllTracks();
    currentTrack = null;
  }

  // Short in-app attribution (full details in ATTRIBUTIONS.md)
  $: activeTrackAttribution =
    currentTrack === "cloud"
      ? 'Music: "Cloud Dancer" — Kevin MacLeod (incompetech.com), CC BY 4.0'
      : currentTrack === "fart"
        ? 'Music: "Farting Around" — Kevin MacLeod (incompetech.com), CC BY 4.0'
        : "";
</script>

<div class="min-h-screen bg-gray-900 text-white flex flex-col" data-testid="view-screen-app">
  {#if connecting}
    <div class="flex-1 flex items-center justify-center">
      <p class="text-2xl animate-pulse">Connecting to server…</p>
    </div>
  {:else if error}
    <div class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <p class="text-red-400 text-xl mb-4">{error}</p>
        <button
          class="px-6 py-2 bg-indigo-600 rounded hover:bg-indigo-500"
          on:click={() => window.location.reload()}
        >Reload</button>
      </div>
    </div>
  {:else if state && connectedRoom}
    {#if phase === "lobby"}
      <LobbyScreen room={connectedRoom} {state} />
    {:else if phase === "game_loading"}
      <div class="flex-1 flex items-center justify-center">
        <p class="text-3xl animate-pulse">Loading game…</p>
      </div>
    {:else if phase === "instructions"}
      <InstructionsScreen room={connectedRoom} {state} />
    {:else if phase === "countdown"}
      <CountdownScreen {state} />
    {:else if phase === "in_round"}
      <GameScreen room={connectedRoom} {state} />
    {:else if phase === "round_end"}
      <RoundEndScreen {state} {sortedPlayers} />
    {:else if phase === "scoreboard"}
      <ScoreboardScreen {state} {sortedPlayers} />
    {:else if phase === "game_over"}
      <GameOverScreen {state} {sortedPlayers} />
    {/if}
  {/if}

  {#if activeTrackAttribution}
    <div class="px-3 py-2 text-[11px] text-gray-300/90 bg-black/30 border-t border-white/10">
      {activeTrackAttribution} • https://creativecommons.org/licenses/by/4.0/ • Full credit: ATTRIBUTIONS.md
    </div>
  {/if}

  {#if audioBlocked}
    <div class="fixed bottom-14 right-4 z-50">
      <button
        class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold shadow-lg"
        on:click={enableSound}
      >Enable sound</button>
    </div>
  {/if}
</div>
