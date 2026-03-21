<script lang="ts">
  /**
   * client/phone/src/App.svelte
   *
   * Root phone app component.
   * Manages connection state and routes to the appropriate screen.
   *
   * Flow:
   *   landing → join (enter code) OR host (create room) → lobby → game
   */
  import { onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import { joinRoom, createRoom } from "../../shared/colyseusClient";
  import type { RoomState, Phase, PlayerState } from "../../shared/types";

  import LandingScreen from "./screens/LandingScreen.svelte";
  import HostScreen from "./screens/HostScreen.svelte";
  import JoinScreen from "./screens/JoinScreen.svelte";
  import LobbyScreen from "./screens/LobbyScreen.svelte";
  import InstructionsScreen from "./screens/InstructionsScreen.svelte";
  import CountdownScreen from "./screens/CountdownScreen.svelte";
  import GameScreen from "./screens/GameScreen.svelte";
  import RoundEndScreen from "./screens/RoundEndScreen.svelte";
  import ScoreboardScreen from "./screens/ScoreboardScreen.svelte";
  import GameOverScreen from "./screens/GameOverScreen.svelte";

  type AppView = "landing" | "join" | "host" | "room";

  let view: AppView = "landing";
  let room: Room | null = null;
  let state: RoomState | null = null;
  let phase: Phase = "lobby";
  let myId: string = "";
  let error: string = "";

  function wireRoom(r: Room) {
    room = r;
    myId = r.sessionId;
    state = r.state as unknown as RoomState;
    phase = (state as RoomState).phase;
    view = "room";

    r.onStateChange((s) => {
      state = s as unknown as RoomState;
      phase = (state as RoomState).phase;
    });

    r.onError((code: number, msg?: string) => {
      error = `Error ${code}: ${msg ?? "unknown"}`;
    });

    r.onLeave(() => {
      error = "Disconnected.";
    });
  }

  async function onJoin(roomCode: string, name: string) {
    try {
      const r = await joinRoom(roomCode, name);
      wireRoom(r);
    } catch (e) {
      error = String(e);
      throw e;
    }
  }

  async function onHost(name: string) {
    try {
      const r = await createRoom(name);
      wireRoom(r);
    } catch (e) {
      error = String(e);
      view = "landing";
    }
  }

  onDestroy(() => room?.leave());

  $: me = state?.players?.get(myId) as PlayerState | undefined;
  $: typedRoom = room as Room;
  $: typedState = state as RoomState;
</script>

<div class="min-h-screen flex flex-col bg-gray-950 text-white" data-testid="phone-app">
  {#if error}
    <div class="flex-1 flex items-center justify-center p-6">
      <div class="text-center space-y-4">
        <p class="text-red-400">{error}</p>
        <button
          class="px-6 py-2 bg-indigo-600 rounded-lg"
          on:click={() => { error = ""; room = null; state = null; view = "landing"; }}
        >Try Again</button>
      </div>
    </div>
  {:else if view === "landing"}
    <LandingScreen
      on:join={() => { view = "join"; }}
      on:host={() => { view = "host"; }}
    />
  {:else if view === "join"}
    <div class="flex flex-col flex-1">
      <JoinScreen
        {error}
        on:join={(e) => onJoin(e.detail.roomCode, e.detail.name)}
      />
      <button
        class="text-gray-500 text-sm text-center py-4 underline"
        on:click={() => { view = "landing"; error = ""; }}
      >Back</button>
    </div>
  {:else if view === "host"}
    <HostScreen
      on:host={(e) => onHost(e.detail.name)}
      on:back={() => { view = "landing"; }}
    />
  {:else if view === "room" && state}
    {#if phase === "lobby"}
      <LobbyScreen room={typedRoom} state={typedState} {me} />
    {:else if phase === "game_loading"}
      <div class="flex-1 flex items-center justify-center">
        <p class="text-xl animate-pulse">Loading…</p>
      </div>
    {:else if phase === "instructions"}
      <InstructionsScreen room={typedRoom} />
    {:else if phase === "countdown"}
      <CountdownScreen state={typedState} />
    {:else if phase === "in_round"}
      <GameScreen room={typedRoom} state={typedState} {me} {myId} />
    {:else if phase === "round_end"}
      <RoundEndScreen state={typedState} {me} />
    {:else if phase === "scoreboard"}
      <ScoreboardScreen state={typedState} {me} />
    {:else if phase === "game_over"}
      <GameOverScreen state={typedState} {me} />
    {/if}
  {/if}
</div>
