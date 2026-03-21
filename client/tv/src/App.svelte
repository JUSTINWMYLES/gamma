<script lang="ts">
  /**
   * client/tv/src/App.svelte
   *
   * Root TV app component.  Manages Colyseus room connection and
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

  let room: Room | null = null;
  let state: RoomState | null = null;
  let phase: Phase = "lobby";
  let error: string = "";
  let connecting = true;

  onMount(async () => {
    try {
      room = await hostRoom();
      state = room.state as unknown as RoomState;
      phase = state.phase;

      room.onStateChange((newState) => {
        state = newState as unknown as RoomState;
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
    room?.leave();
  });

  // Derived: sorted player array for scoreboard
  $: sortedPlayers = state
    ? [...state.players.values()].sort((a, b) => b.score - a.score)
    : [];
</script>

<div class="min-h-screen bg-gray-900 text-white flex flex-col" data-testid="tv-app">
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
  {:else if state}
    {#if phase === "lobby"}
      <LobbyScreen {room} {state} />
    {:else if phase === "game_loading"}
      <div class="flex-1 flex items-center justify-center">
        <p class="text-3xl animate-pulse">Loading game…</p>
      </div>
    {:else if phase === "instructions"}
      <InstructionsScreen {room} {state} />
    {:else if phase === "countdown"}
      <CountdownScreen {state} />
    {:else if phase === "in_round"}
      <GameScreen {room} {state} />
    {:else if phase === "round_end"}
      <RoundEndScreen {state} {sortedPlayers} />
    {:else if phase === "scoreboard"}
      <ScoreboardScreen {state} {sortedPlayers} />
    {:else if phase === "game_over"}
      <GameOverScreen {state} {sortedPlayers} />
    {/if}
  {/if}
</div>
