<script lang="ts">
  /**
   * Phone in-game screen — routes to the correct game component
   * based on state.selectedGame.
   *
   * Currently supported:
   *   • registry-14-dont-get-caught  → inline joystick/tilt UI
   *   • registry-19-shave-the-yak    → ShaveYak component
   */
  import { onMount, onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState, PlayerState } from "../../../../shared/types";
  import ShaveYak from "../../games/player/ShaveYak.svelte";
  import OddOneOut from "../../games/player/OddOneOut.svelte";
  import AudioOverlay from "../../games/player/AudioOverlay.svelte";
  import LowballMarketplace from "../../games/player/LowballMarketplace.svelte";
  import FireMatchBlowShake from "../../games/player/FireMatchBlowShake.svelte";
  import HotPotato from "../../games/player/HotPotato.svelte";
  import TapSpeed from "../../games/player/TapSpeed.svelte";
  import SoundReplication from "../../games/player/SoundReplication.svelte";
  import EscapeMaze from "../../games/player/EscapeMaze.svelte";
  import PaintMatch from "../../games/player/PaintMatch.svelte";
  import GridTapColors from "../../games/player/GridTapColors.svelte";
  import WordBuild from "../../games/player/WordBuild.svelte";
  import TierRanking from "../../games/player/TierRanking.svelte";
  import MedicalStory from "../../games/player/MedicalStory.svelte";

  export let room: Room;
  export let state: RoomState;
  export let me: PlayerState | undefined;
  export let myId: string;

  type PermissionAwarePlayer = PlayerState & {
    motionPermission?: string;
  };

  $: permissionPlayer = me as PermissionAwarePlayer | undefined;
  $: tiltAllowed = permissionPlayer?.motionPermission === "granted";

  // ── Game routing ──────────────────────────────────────────────────
  $: isShaveYak = state.selectedGame === "registry-19-shave-the-yak";
  $: isOddOneOut = state.selectedGame === "registry-20-odd-one-out";
  $: isAudioOverlay = state.selectedGame === "registry-26-audio-overlay";
  $: isLowball = state.selectedGame === "registry-25-lowball-marketplace";
  $: isFireMatch = state.selectedGame === "registry-17-fire-match-blow-shake";
  $: isHotPotato = state.selectedGame === "registry-07-hot-potato";
  $: isTapSpeed = state.selectedGame === "registry-03-tap-speed";
  $: isSoundReplication = state.selectedGame === "registry-06-sound-replication";
  $: isEscapeMaze = state.selectedGame === "registry-04-escape-maze";
  $: isPaintMatch = state.selectedGame === "registry-40-paint-match";
  $: isGridTapColors = state.selectedGame === "registry-10-grid-tap-colors";
  $: isWordBuild = state.selectedGame === "registry-27-word-build";
  $: isTierRanking = state.selectedGame === "registry-11-tier-ranking";
  $: isMedicalStory = state.selectedGame === "registry-43-medical-story";

  // ═══════════════════════════════════════════════════════════════════
  // Everything below is the original registry-14 joystick/tilt UI.
  // Only mounted when isShaveYak is false.
  // ═══════════════════════════════════════════════════════════════════

  // Control mode — persisted in localStorage per device
  type ControlMode = "joystick" | "tilt";
  let controlMode: ControlMode = (localStorage.getItem("gamma_control_mode") as ControlMode) ?? "joystick";

  function setControlMode(m: ControlMode) {
    if (m === "tilt" && !tiltAllowed) {
      controlMode = "joystick";
      tiltError = "Enable motion in the lobby before using tilt controls.";
      stopTilt();
      localStorage.setItem("gamma_control_mode", "joystick");
      return;
    }

    controlMode = m;
    localStorage.setItem("gamma_control_mode", m);
    if (m === "tilt") {
      tiltNeedsPermission = false;
      tiltError = "";
      startTilt();
    } else {
      tiltError = "";
      stopTilt();
    }
  }

  // ── Joystick state ────────────────────────────────────────────────
  let joystickEl: HTMLDivElement;
  let knobEl: HTMLDivElement;

  let joystickActive = false;
  let origin = { x: 0, y: 0 };
  let dx = 0;
  let dy = 0;

  const RADIUS = 60;

  function startJoystick(e: TouchEvent | MouseEvent) {
    const touch = "touches" in e ? e.touches[0] : e;
    const rect = joystickEl.getBoundingClientRect();
    origin = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    joystickActive = true;
    moveJoystickRaw(touch as Touch);
  }

  function moveJoystickRaw(touch: Touch | MouseEvent) {
    if (!joystickActive) return;
    const t = touch as Touch;
    const rawDx = t.clientX - origin.x;
    const rawDy = t.clientY - origin.y;
    const dist = Math.sqrt(rawDx * rawDx + rawDy * rawDy);
    const clamped = Math.min(dist, RADIUS);
    dx = dist > 0 ? (rawDx / dist) * clamped : 0;
    dy = dist > 0 ? (rawDy / dist) * clamped : 0;
    if (knobEl) knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  function releaseJoystick() {
    joystickActive = false;
    dx = 0;
    dy = 0;
    if (knobEl) knobEl.style.transform = "translate(0,0)";
  }

  // ── Global pointer/touch event listeners ─────────────────────────
  function onGlobalTouchMove(e: TouchEvent) {
    if (!joystickActive) return;
    moveJoystickRaw(e.touches[0]);
  }
  function onGlobalMouseMove(e: MouseEvent) {
    if (!joystickActive) return;
    moveJoystickRaw(e);
  }
  function onGlobalRelease() {
    if (joystickActive) releaseJoystick();
  }

  // ── Tilt control ──────────────────────────────────────────────────
  let tiltEnabled = false;
  let tiltDx = 0;
  let tiltDy = 0;
  /** True when iOS requires a tap to grant DeviceOrientation permission. */
  let tiltNeedsPermission = false;
  let tiltError = "";

  /**
   * Check whether tilt requires an explicit user-gesture permission request
   * (iOS 13+). On Android/desktop, permission is implicit.
   */
  function startTilt() {
    if (!tiltAllowed) {
      tiltError = "Enable motion in the lobby before using tilt controls.";
      controlMode = "joystick";
      localStorage.setItem("gamma_control_mode", "joystick");
      return;
    }
    tiltEnabled = true;
    window.addEventListener("deviceorientation", onDeviceOrientation);
  }

  function stopTilt() {
    tiltEnabled = false;
    window.removeEventListener("deviceorientation", onDeviceOrientation);
    tiltDx = 0;
    tiltDy = 0;
  }

  function onDeviceOrientation(e: DeviceOrientationEvent) {
    if (!tiltEnabled) return;
    const gamma = e.gamma ?? 0;
    const beta  = e.beta  ?? 0;

    const DEAD = 5;
    const RANGE = 30;
    const gn = Math.max(-1, Math.min(1, (gamma - Math.sign(gamma) * DEAD) / RANGE));
    const bn = Math.max(-1, Math.min(1, ((beta - 45) - Math.sign(beta - 45) * DEAD) / RANGE));

    tiltDx = Math.abs(gamma) > DEAD ? gn : 0;
    tiltDy = Math.abs(beta - 45) > DEAD ? bn : 0;
  }

  // ── Send loop ─────────────────────────────────────────────────────
  let sendInterval: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    if (isShaveYak || isOddOneOut || isAudioOverlay || isLowball || isFireMatch || isHotPotato || isTapSpeed || isSoundReplication || isEscapeMaze || isPaintMatch || isGridTapColors || isWordBuild || isTierRanking || isMedicalStory) return; // These games handle their own listeners

    document.addEventListener("touchmove", onGlobalTouchMove, { passive: true });
    document.addEventListener("mousemove", onGlobalMouseMove);
    document.addEventListener("touchend", onGlobalRelease);
    document.addEventListener("mouseup", onGlobalRelease);

    sendInterval = setInterval(() => {
      if (controlMode === "joystick") {
        if (joystickActive && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
          room.send("game_input", { action: "move", dx: dx / RADIUS, dy: dy / RADIUS });
        }
      } else if (controlMode === "tilt") {
        if (Math.abs(tiltDx) > 0.05 || Math.abs(tiltDy) > 0.05) {
          room.send("game_input", { action: "move", dx: tiltDx, dy: tiltDy });
        }
      }
    }, 50);

    if (controlMode === "tilt") {
      if (!tiltAllowed) {
        tiltNeedsPermission = false;
        controlMode = "joystick";
        localStorage.setItem("gamma_control_mode", "joystick");
        tiltError = "Enable motion in the lobby before using tilt controls.";
      } else {
        startTilt();
      }
    }

    return () => {
      document.removeEventListener("touchmove", onGlobalTouchMove);
      document.removeEventListener("mousemove", onGlobalMouseMove);
      document.removeEventListener("touchend", onGlobalRelease);
      document.removeEventListener("mouseup", onGlobalRelease);
      if (sendInterval) clearInterval(sendInterval);
      stopTilt();
    };
  });

  onDestroy(() => {
    if (sendInterval) clearInterval(sendInterval);
    stopTilt();
    document.removeEventListener("touchmove", onGlobalTouchMove);
    document.removeEventListener("mousemove", onGlobalMouseMove);
    document.removeEventListener("touchend", onGlobalRelease);
    document.removeEventListener("mouseup", onGlobalRelease);
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

  $: isLastRound = state.currentRound >= state.gameConfig.roundCount;
</script>

{#if isMedicalStory}
  <!-- ── Registry-43: Medical Story ──────────────────────────────── -->
  <MedicalStory {room} {state} {me} />
{:else if isWordBuild}
  <!-- ── Registry-27: Word Build ─────────────────────────────────── -->
  <WordBuild {room} {state} {me} />
{:else if isTierRanking}
  <!-- ── Registry-11: S-Tier Ranking ───────────────────────────────── -->
  <TierRanking {room} {state} {me} />
{:else if isGridTapColors}
  <!-- ── Registry-10: Grid Tap Colors ────────────────────────────── -->
  <GridTapColors {room} {state} {me} />
{:else if isPaintMatch}
  <!-- ── Registry-40: Paint Match ────────────────────────────────── -->
  <PaintMatch {room} {state} {me} />
{:else if isTapSpeed}
  <!-- ── Registry-03: Tap Speed ──────────────────────────────────── -->
  <TapSpeed {room} {state} {me} />
{:else if isSoundReplication}
  <!-- ── Registry-06: Sound Replication ──────────────────────────── -->
  <SoundReplication {room} {state} {me} />
{:else if isEscapeMaze}
  <!-- ── Registry-04: Escape Maze ────────────────────────────────── -->
  <EscapeMaze {room} {state} {me} />
{:else if isOddOneOut}
  <!-- ── Registry-20: Odd One Out ──────────────────────────────────── -->
  <OddOneOut {room} {state} {me} />
{:else if isAudioOverlay}
  <!-- ── Registry-26: Audio Overlay ──────────────────────────────── -->
  <AudioOverlay {room} {state} {me} />
{:else if isLowball}
  <!-- ── Registry-25: Lowball Marketplace ─────────────────────────── -->
  <LowballMarketplace {room} {state} {me} />
{:else if isFireMatch}
  <!-- ── Registry-17: Fire Match Blow Shake ─────────────────────── -->
  <FireMatchBlowShake {room} {state} {me} />
{:else if isHotPotato}
  <!-- ── Registry-07: Hot Potato ─────────────────────────────────── -->
  <HotPotato {room} {state} {me} />
{:else if isShaveYak}
  <!-- ── Registry-19: Shave The Yak ──────────────────────────────── -->
  <ShaveYak {room} {state} {me} />
{:else}
  <!-- ── Registry-14: Don't Get Caught (default) ─────────────────── -->
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
        <!-- Catch counter (lives) -->
        <div class="flex gap-2">
          {#each Array(3) as _, i}
            <div
              class="w-8 h-8 rounded-full border-2 {i < (me?.timesCaught ?? 0) ? 'bg-red-500 border-red-500' : 'border-gray-600'}"
            ></div>
          {/each}
        </div>

        <!-- Control mode toggle -->
        <div class="flex gap-2 rounded-xl overflow-hidden border border-gray-700">
          <button
            class="px-4 py-2 text-sm font-bold transition-colors
              {controlMode === 'joystick' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400'}"
            on:click={() => setControlMode("joystick")}
          >Joystick</button>
          <button
            class="px-4 py-2 text-sm font-bold transition-colors
              {controlMode === 'tilt' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400'}"
            on:click={() => setControlMode("tilt")}
            disabled={!tiltAllowed}
          >Tilt</button>
        </div>

        {#if controlMode === "joystick"}
          <!-- Virtual joystick -->
          <div class="relative" style="width:150px;height:150px">
            <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
            <div
              bind:this={joystickEl}
              role="group"
              class="absolute inset-0 rounded-full bg-gray-800 border-2 border-gray-600"
              on:touchstart|preventDefault={(e) => startJoystick(e)}
              on:mousedown={(e) => startJoystick(e)}
            >
              <!-- Knob -->
              <div
                bind:this={knobEl}
                class="absolute top-1/2 left-1/2 w-16 h-16 -mt-8 -ml-8 rounded-full bg-indigo-500 border-2 border-indigo-300 shadow-lg transition-none pointer-events-none"
                data-testid="joystick-knob"
              ></div>
            </div>
          </div>
        {:else}
          <!-- Tilt indicator -->
          <div class="flex flex-col items-center gap-3">
            <div
              class="w-20 h-20 rounded-full border-4 flex items-center justify-center
                {tiltEnabled ? 'border-indigo-500 bg-indigo-900/30' : 'border-gray-700 bg-gray-900'}"
            >
              <span class="text-3xl">{tiltEnabled ? "" : ""}</span>
            </div>
            <p class="text-xs text-gray-500 text-center">
              {tiltAllowed
                ? (tiltEnabled ? 'Tilt your phone to move' : 'Starting tilt sensor...')
                : 'Motion was not enabled in the lobby'}
            </p>
            {#if tiltError}
              <p class="text-xs text-red-400 text-center max-w-xs">{tiltError}</p>
            {/if}
          </div>
        {/if}
      {:else}
        <p class="text-gray-400 text-center text-lg">You're out — watch the TV!</p>
      {/if}
    </div>
  </div>
{/if}
