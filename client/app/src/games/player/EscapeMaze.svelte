<script lang="ts">
  /**
   * Phone game component for "Escape A Maze" (registry-04).
   *
   * Two modes:
   * - Individual: D-pad / swipe controls to navigate the maze
   * - Team: shake phone to move in your assigned direction
   *
   * Server messages listened:
   *   maze_mode, maze_role, maze_generated, maze_move_ok, maze_wall_bump,
   *   maze_team_moved, maze_you_escaped, maze_player_escaped,
   *   maze_team_escaped, maze_positions, maze_team_positions, maze_timer
   */
  import { onMount, onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState, PlayerState } from "../../../../shared/types";
  import { isMotionPermissionGrantedThisSession } from "../../lib/permissions";

  export let room: Room;
  export let state: RoomState;
  export let me: PlayerState | undefined;

  type PermissionAwarePlayer = PlayerState & {
    motionPermission?: string;
  };

  $: permissionPlayer = me as PermissionAwarePlayer | undefined;
  $: motionGranted = permissionPlayer?.motionPermission === "granted";

  // ── Sub-phase state ──────────────────────────────────────────────

  type SubPhase =
    | "waiting"
    | "instructions"
    | "playing"
    | "escaped"
    | "time_up";

  let subPhase: SubPhase = "waiting";

  // ── Mode state ──────────────────────────────────────────────────

  let gameMode: "individual" | "team" = "individual";
  let controlType: "dpad" | "shake" = "dpad";

  // ── Team state ──────────────────────────────────────────────────

  let teamId = -1;
  let myDirection: string = "";
  let teamMembers: Array<{ id: string; name: string; direction: string }> = [];

  // ── Position / movement ─────────────────────────────────────────

  let myX = 1;
  let myY = 1;
  let escaped = false;
  let escapeOrder = 0;
  let escapeTimeMs = 0;
  let wallBumpFeedback = false;
  let wallBumpTimeout: ReturnType<typeof setTimeout> | null = null;

  // ── Timer ───────────────────────────────────────────────────────

  let timeRemaining = 60000;
  let finishCount = 0;

  // ── Shake detection ─────────────────────────────────────────────

  let shakeListening = false;
  let lastAccelMagnitude = 0;
  const SHAKE_THRESHOLD = 15; // m/s^2 above gravity
  let motionBlockedMsg = "";

  // ── Maze info ───────────────────────────────────────────────────

  let mazeWidth = 0;
  let mazeHeight = 0;
  let exitX = 0;
  let exitY = 0;

  // ── Message handlers ────────────────────────────────────────────

  const handlers: Array<{ type: string; fn: (msg: any) => void }> = [];

  function listen(type: string, fn: (msg: any) => void) {
    room.onMessage(type, fn);
    handlers.push({ type, fn });
  }

  onMount(() => {
    listen("maze_mode", (msg) => {
      gameMode = msg.mode;
      if (msg.mode !== "team") {
        motionBlockedMsg = "";
      }
    });

    listen("maze_role", (msg) => {
      if (msg.mode === "team") {
        gameMode = "team";
        controlType = "shake";
        teamId = msg.teamId;
        myDirection = msg.direction;
        teamMembers = msg.teamMembers;
        if (motionGranted) {
          motionBlockedMsg = "";
          startShakeDetection();
        } else {
          motionBlockedMsg = "Enable motion in the lobby to use shake controls.";
        }
      } else {
        gameMode = "individual";
        controlType = "dpad";
      }
      subPhase = "playing";
    });

    listen("maze_generated", (msg) => {
      mazeWidth = msg.width;
      mazeHeight = msg.height;
      exitX = msg.exitX;
      exitY = msg.exitY;
      myX = msg.startX;
      myY = msg.startY;
      escaped = false;
      escapeOrder = 0;
      escapeTimeMs = 0;
      subPhase = "playing";
    });

    listen("maze_move_ok", (msg) => {
      myX = msg.x;
      myY = msg.y;
    });

    listen("maze_wall_bump", (_msg) => {
      wallBumpFeedback = true;
      if (wallBumpTimeout) clearTimeout(wallBumpTimeout);
      wallBumpTimeout = setTimeout(() => {
        wallBumpFeedback = false;
      }, 200);
    });

    listen("maze_team_moved", (msg) => {
      myX = msg.x;
      myY = msg.y;
    });

    listen("maze_you_escaped", (msg) => {
      escaped = true;
      escapeOrder = msg.order;
      escapeTimeMs = msg.timeMs;
      subPhase = "escaped";
      stopShakeDetection();
    });

    listen("maze_timer", (msg) => {
      timeRemaining = msg.timeRemaining;
      finishCount = msg.finishCount;

      if (timeRemaining <= 0 && !escaped) {
        subPhase = "time_up";
        stopShakeDetection();
      }
    });
  });

  onDestroy(() => {
    stopShakeDetection();
    if (wallBumpTimeout) clearTimeout(wallBumpTimeout);
  });

  // ── D-pad movement (individual mode) ────────────────────────────

  function sendMove(direction: string) {
    if (escaped || subPhase !== "playing") return;
    room.send("game_input", { action: "move", direction });
  }

  /**
   * Determine direction from a tap/click position relative to an element.
   * Divides the element into 4 triangular zones using the diagonals.
   */
  function directionFromPoint(el: HTMLElement, clientX: number, clientY: number): string {
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    // Normalize so the aspect ratio doesn't bias toward left/right on wide screens.
    const ndx = dx / (rect.width / 2);
    const ndy = dy / (rect.height / 2);
    if (Math.abs(ndx) > Math.abs(ndy)) {
      return ndx > 0 ? "right" : "left";
    }
    return ndy > 0 ? "down" : "up";
  }

  function handleTapZone(e: TouchEvent) {
    const touch = e.touches[0];
    if (!touch) return;
    const dir = directionFromPoint(e.currentTarget as HTMLElement, touch.clientX, touch.clientY);
    sendMove(dir);
  }

  function handleClickZone(e: MouseEvent) {
    const dir = directionFromPoint(e.currentTarget as HTMLElement, e.clientX, e.clientY);
    sendMove(dir);
  }

  function handleKeydown(e: KeyboardEvent) {
    const keyMap: Record<string, string> = {
      ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
      w: "up", s: "down", a: "left", d: "right",
    };
    const dir = keyMap[e.key];
    if (dir) {
      e.preventDefault();
      sendMove(dir);
    }
  }

  // ── Shake detection (team mode) ─────────────────────────────────

  function startShakeDetection() {
    if (shakeListening || !motionGranted) return;
    if (!isMotionPermissionGrantedThisSession()) {
      motionBlockedMsg = "Motion permission expired. Return to the lobby and re-enable permissions.";
      return;
    }
    shakeListening = true;
    window.addEventListener("devicemotion", onDeviceMotion);
  }

  function stopShakeDetection() {
    if (!shakeListening) return;
    shakeListening = false;
    window.removeEventListener("devicemotion", onDeviceMotion);
  }

  function onDeviceMotion(e: DeviceMotionEvent) {
    if (!shakeListening || escaped) return;

    const accel = e.accelerationIncludingGravity;
    if (!accel) return;

    const x = accel.x ?? 0;
    const y = accel.y ?? 0;
    const z = accel.z ?? 0;
    const magnitude = Math.sqrt(x * x + y * y + z * z);

    // Detect a sharp acceleration spike
    if (magnitude > SHAKE_THRESHOLD && magnitude - lastAccelMagnitude > SHAKE_THRESHOLD * 0.5) {
      room.send("game_input", { action: "shake" });
    }

    lastAccelMagnitude = magnitude;
  }

  // ── Derived values ──────────────────────────────────────────────

  $: timeLeftSecs = Math.ceil(timeRemaining / 1000);
  $: directionLabel = myDirection ? myDirection.charAt(0).toUpperCase() + myDirection.slice(1) : "";
  $: directionEmoji = myDirection === "up" ? "^" : myDirection === "down" ? "v" : myDirection === "left" ? "<" : myDirection === "right" ? ">" : "";
</script>

{#if subPhase === "waiting"}
  <!-- Waiting for maze generation -->
  <div class="flex-1 flex flex-col items-center justify-center p-6">
    <div class="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
    <p class="text-gray-400 text-lg">Generating maze...</p>
  </div>

{:else if subPhase === "escaped"}
  <!-- Escaped! -->
  <div class="flex-1 flex flex-col items-center justify-center p-6 bg-gradient-to-b from-green-900/30 to-gray-900">
    <div class="text-6xl mb-4">&#x1f3c6;</div>
    <h2 class="text-3xl font-black text-green-400 mb-2">ESCAPED!</h2>
    <p class="text-gray-300 text-lg">
      #{escapeOrder} finish &mdash; {(escapeTimeMs / 1000).toFixed(1)}s
    </p>
    <p class="text-gray-500 text-sm mt-4">Waiting for others...</p>
  </div>

{:else if subPhase === "time_up"}
  <!-- Time's up -->
  <div class="flex-1 flex flex-col items-center justify-center p-6">
    <div class="text-5xl mb-4">&#x23F0;</div>
    <h2 class="text-2xl font-black text-red-400 mb-2">TIME'S UP</h2>
    <p class="text-gray-400">You didn't escape this time.</p>
  </div>

{:else if subPhase === "playing" && gameMode === "individual"}
  <!-- Individual mode: D-pad controls -->
  <div class="flex-1 flex flex-col select-none" data-testid="maze-individual">
    <!-- Top HUD -->
    <div class="px-4 py-3 bg-gray-900/80 flex items-center gap-3">
      <div class="flex-1">
        <p class="text-xs text-gray-400">Escaped</p>
        <p class="text-sm font-bold text-green-400">{finishCount}</p>
      </div>
      <div class="text-right">
        <p class="text-2xl font-mono font-black {timeLeftSecs < 10 ? 'text-red-400' : 'text-white'}">{timeLeftSecs}</p>
      </div>
    </div>

    {#if wallBumpFeedback}
      <div class="bg-red-900/50 text-center py-1 text-xs text-red-300 font-bold animate-pulse">
        Wall!
      </div>
    {/if}

    <!-- Full-screen tap zones (tap side of screen to move in that direction) -->
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div
      class="flex-1 relative"
      style="touch-action:manipulation"
      role="button"
      tabindex="0"
      on:touchstart|preventDefault={handleTapZone}
      on:click={handleClickZone}
      on:keydown={handleKeydown}
    >
      <!-- Visual direction hints (subtle arrows at edges) -->
      <div class="absolute top-3 left-1/2 -translate-x-1/2 text-gray-600 text-xl pointer-events-none select-none">&#x25B2;</div>
      <div class="absolute bottom-3 left-1/2 -translate-x-1/2 text-gray-600 text-xl pointer-events-none select-none">&#x25BC;</div>
      <div class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-xl pointer-events-none select-none">&#x25C0;</div>
      <div class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 text-xl pointer-events-none select-none">&#x25B6;</div>

      <!-- Center tap indicator -->
      <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-gray-800/60 border border-gray-700 flex items-center justify-center pointer-events-none">
        <span class="text-xs text-gray-500">+</span>
      </div>
    </div>
  </div>

{:else if subPhase === "playing" && gameMode === "team"}
  <!-- Team mode: shake controls -->
  <div class="flex-1 flex flex-col select-none" data-testid="maze-team">
    <!-- Top HUD -->
    <div class="px-4 py-3 bg-gray-900/80 flex items-center gap-3">
      <div class="flex-1">
        <p class="text-xs text-gray-400">Team {teamId + 1}</p>
      </div>
      <div class="text-right">
        <p class="text-2xl font-mono font-black {timeLeftSecs < 10 ? 'text-red-400' : 'text-white'}">{timeLeftSecs}</p>
      </div>
    </div>

    {#if wallBumpFeedback}
      <div class="bg-red-900/50 text-center py-1 text-xs text-red-300 font-bold animate-pulse">
        Wall! Can't go {myDirection}
      </div>
    {/if}

    <!-- Direction role display -->
    <div class="flex-1 flex flex-col items-center justify-center gap-6 p-6">
      <!-- Big direction indicator -->
      <div class="w-32 h-32 rounded-full bg-indigo-600/30 border-4 border-indigo-500 flex items-center justify-center">
        <span class="text-5xl font-black text-indigo-300">{directionEmoji}</span>
      </div>

      <div class="text-center">
        <h2 class="text-2xl font-black text-white mb-1">You move {directionLabel}</h2>
        <p class="text-gray-400 text-sm">
          {motionGranted ? 'Shake your phone to move!' : 'Motion was not enabled in the lobby.'}
        </p>
      </div>

      {#if motionBlockedMsg}
        <div class="w-full max-w-xs rounded-xl border border-red-700 bg-red-950/60 px-4 py-3 text-center text-sm text-red-200">
          {motionBlockedMsg}
        </div>
      {/if}

      <!-- Manual shake button (fallback / desktop) -->
      <button
        class="px-8 py-4 rounded-2xl text-lg shadow-lg transition-transform
          {motionGranted
            ? 'bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-400 text-white font-bold active:scale-95'
            : 'bg-gray-800 text-gray-500 cursor-not-allowed font-semibold'}"
        style="touch-action:manipulation"
        on:touchstart|preventDefault={() => room.send("game_input", { action: "shake" })}
        on:click={() => room.send("game_input", { action: "shake" })}
        disabled={!motionGranted}
      >
        SHAKE ({directionLabel})
      </button>

      <!-- Team roster -->
      <div class="w-full max-w-xs bg-gray-800/60 rounded-xl p-3">
        <p class="text-xs text-gray-400 uppercase tracking-widest mb-2">Your Team</p>
        {#each teamMembers as member}
          <div class="flex items-center gap-2 py-1 {member.id === me?.id ? 'text-indigo-400 font-bold' : 'text-gray-300'}">
            <span class="w-6 text-center font-mono">
              {member.direction === "up" ? "^" : member.direction === "down" ? "v" : member.direction === "left" ? "<" : ">"}
            </span>
            <span class="text-sm">{member.name}</span>
            <span class="text-xs text-gray-500 ml-auto">{member.direction}</span>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}
