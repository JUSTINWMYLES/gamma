<script lang="ts">
  /**
   * client/phone/src/App.svelte
   *
   * Root phone app component.
   * Manages connection state and routes to the appropriate screen.
   */
  import { onMount, onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import { joinRoom } from "../../shared/colyseusClient";
  import type { RoomState, Phase, PlayerState } from "../../shared/types";

  import JoinScreen from "./screens/JoinScreen.svelte";
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
  let myId: string = "";
  let error: string = "";

  async function onJoin(roomCode: string, name: string) {
    try {
      room = await joinRoom(roomCode, name);
      myId = room.sessionId;
      state = room.state as unknown as RoomState;
      phase = state.phase;

      room.onStateChange((s) => {
        state = s as unknown as RoomState;
        phase = state.phase;
      });

      room.onError((code, msg) => {
        error = `Error ${code}: ${msg}`;
      });

      room.onLeave(() => {
        error = "Disconnected.";
      });
    } catch (e) {
      error = String(e);
      throw e;
    }
  }

  onDestroy(() => room?.leave());

  $: me = state?.players?.get(myId) as PlayerState | undefined;
</script>

<div class="min-h-screen flex flex-col bg-gray-950 text-white" data-testid="phone-app">
  {#if error}
    <div class="flex-1 flex items-center justify-center p-6">
      <div class="text-center space-y-4">
        <p class="text-red-400">{error}</p>
        <button
          class="px-6 py-2 bg-indigo-600 rounded-lg"
          on:click={() => { error = ""; room = null; state = null; }}
        >Try Again</button>
      </div>
    </div>
  {:else if !room}
    <JoinScreen on:join={(e) => onJoin(e.detail.roomCode, e.detail.name)} {error} />
  {:else if state}
    {#if phase === "lobby"}
      <LobbyScreen {room} {state} {me} />
    {:else if phase === "game_loading"}
      <div class="flex-1 flex items-center justify-center">
        <p class="text-xl animate-pulse">Loading…</p>
      </div>
    {:else if phase === "instructions"}
      <InstructionsScreen {room} />
    {:else if phase === "countdown"}
      <CountdownScreen {state} />
    {:else if phase === "in_round"}
      <GameScreen {room} {state} {me} {myId} />
    {:else if phase === "round_end"}
      <RoundEndScreen {state} {me} />
    {:else if phase === "scoreboard"}
      <ScoreboardScreen {state} {me} />
    {:else if phase === "game_over"}
      <GameOverScreen {state} {me} />
    {/if}
  {/if}
</div>
