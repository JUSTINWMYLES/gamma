<script lang="ts">
  /**
   * Phone in-game screen for registry-14.
   *
   * Controls:
   *   • Virtual joystick (touch drag from centre) → sends "move" messages
   *
   * There is NO hiding mechanic — just run from the guards.
   * Detection meter shows danger level.
   */
  import { onMount, onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState, PlayerState } from "../../../shared/types";

  export let room: Room;
  export let state: RoomState;
  export let me: PlayerState | undefined;
  export let myId: string;

  // ── Joystick state ────────────────────────────────────────────────
  let joystickEl: HTMLDivElement;
  let knobEl: HTMLDivElement;

  let joystickActive = false;
  let origin = { x: 0, y: 0 };
  let dx = 0;
  let dy = 0;

  const RADIUS = 60;
  let sendInterval: ReturnType<typeof setInterval> | null = null;

  function startJoystick(e: TouchEvent | MouseEvent) {
    const touch = "touches" in e ? e.touches[0] : e;
    const rect = joystickEl.getBoundingClientRect();
    origin = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    joystickActive = true;
    moveJoystick(touch as Touch);
  }

  function moveJoystick(touch: Touch | MouseEvent | EventTarget) {
    if (!joystickActive) return;
    const t = touch as Touch;
    const rawDx = t.clientX - origin.x;
    const rawDy = t.clientY - origin.y;
    const dist = Math.sqrt(rawDx * rawDx + rawDy * rawDy);
    const clamped = Math.min(dist, RADIUS);
    dx = dist > 0 ? (rawDx / dist) * clamped : 0;
    dy = dist > 0 ? (rawDy / dist) * clamped : 0;

    if (knobEl) {
      knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
    }
  }

  function releaseJoystick() {
    joystickActive = false;
    dx = 0;
    dy = 0;
    if (knobEl) knobEl.style.transform = "translate(0,0)";
  }

  onMount(() => {
    sendInterval = setInterval(() => {
      if (joystickActive && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        room.send("game_input", {
          action: "move",
          dx: dx / RADIUS,
          dy: dy / RADIUS,
        });
      }
    }, 50);

    return () => {
      if (sendInterval) clearInterval(sendInterval);
    };
  });

  onDestroy(() => {
    if (sendInterval) clearInterval(sendInterval);
  });

  // Time remaining
  let timeLeft = 0;
  let timerInterval: ReturnType<typeof setInterval>;
  onMount(() => {
    timerInterval = setInterval(() => {
      const elapsed = (Date.now() - state.phaseStartedAt) / 1000;
      timeLeft = Math.max(0, state.roundDurationSecs - elapsed);
    }, 200);
    return () => clearInterval(timerInterval);
  });
</script>

<div class="flex-1 flex flex-col select-none" data-testid="phone-game">
  <!-- Top HUD -->
  <div class="px-4 py-3 bg-gray-900 flex items-center gap-3">
    <!-- Detection meter -->
    <div class="flex-1">
      <p class="text-xs text-gray-400 mb-1">Detection</p>
      <div class="h-3 bg-gray-700 rounded-full overflow-hidden">
        <div
          class="h-full rounded-full transition-all"
          style="width:{me?.detectionMeter ?? 0}%;
            background:{
              (me?.detectionMeter ?? 0) > 70 ? '#ef4444' :
              (me?.detectionMeter ?? 0) > 40 ? '#f59e0b' : '#6366f1'
            }"
          data-testid="detection-meter"
        ></div>
      </div>
    </div>

    <!-- Timer -->
    <div class="text-right">
      <p class="text-2xl font-mono font-black {timeLeft < 10 ? 'text-red-400' : 'text-white'}"
        data-testid="phone-timer">{Math.ceil(timeLeft)}</p>
    </div>
  </div>

  <!-- Status banner -->
  {#if me?.isEliminated}
    <div class="bg-red-900 text-center py-2 text-sm font-bold text-red-200">
      You've been caught too many times. Watch the TV!
    </div>
  {:else if me?.isDetected}
    <div class="bg-yellow-900 text-center py-2 text-sm font-bold text-yellow-200 animate-pulse">
      A guard can see you — RUN!
    </div>
  {/if}

  <!-- Game controls -->
  <div class="flex-1 flex flex-col items-center justify-center gap-6 p-6">
    {#if !me?.isEliminated}
      <!-- Catch counter -->
      <div class="flex gap-2">
        {#each Array(3) as _, i}
          <div
            class="w-8 h-8 rounded-full border-2 {i < (me?.timesCaught ?? 0) ? 'bg-red-500 border-red-500' : 'border-gray-600'}"
          ></div>
        {/each}
      </div>

      <!-- Virtual joystick -->
      <div class="relative" style="width:150px;height:150px">
        <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
        <div
          bind:this={joystickEl}
          role="group"
          class="absolute inset-0 rounded-full bg-gray-800 border-2 border-gray-600"
          on:touchstart|preventDefault={(e) => startJoystick(e)}
          on:touchmove|preventDefault={(e) => moveJoystick(e.touches[0])}
          on:touchend|preventDefault={releaseJoystick}
          on:mousedown={(e) => startJoystick(e)}
          on:mousemove={(e) => { if (joystickActive) moveJoystick(e); }}
          on:mouseup={releaseJoystick}
          on:mouseleave={releaseJoystick}
        >
          <!-- Knob -->
          <div
            bind:this={knobEl}
            class="absolute top-1/2 left-1/2 w-16 h-16 -mt-8 -ml-8 rounded-full bg-indigo-500 border-2 border-indigo-300 shadow-lg transition-none"
            data-testid="joystick-knob"
          ></div>
        </div>
      </div>
    {:else}
      <p class="text-gray-400 text-center text-lg">You're out — watch the TV!</p>
    {/if}
  </div>
</div>
