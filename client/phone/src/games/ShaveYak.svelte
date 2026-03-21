<script lang="ts">
  /**
   * client/phone/src/games/ShaveYak.svelte
   *
   * "Shave The Yak" phone game screen.
   *
   * A cartoonish SVG yak rendered on a canvas-sized div.
   * The player swipes across the yak to shave fur.
   * On-target swipes send hit data to the server; off-target swipes
   * make the yak wobble/slide, making it harder to shave.
   *
   * Visual effects:
   *   - SVG yak with layered fur clipPath that reveals a shaved body beneath
   *   - Particle puffs on each shave stroke
   *   - Progress ring around the yak
   *   - Combo counter badge
   *   - Yak nudges via CSS transform when the player misses
   */
  import { onMount, onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState, PlayerState } from "../../../shared/types";

  export let room: Room;
  export let state: RoomState;
  export let me: PlayerState | undefined;

  // ── Yak canvas virtual dimensions (must match server YAK_W / YAK_H) ──
  const YAK_W = 300;
  const YAK_H = 280;

  // ── Reactive state ────────────────────────────────────────────────────
  let shavedPercent = 0;
  let score = 0;
  let combo = 0;
  let comboMax = 0;
  let yakOffsetX = 0;
  let yakOffsetY = 0;
  let yakRotation = 0;
  let timeLeft = 0;

  // Particles for the shave FX
  interface Particle {
    id: number;
    x: number;
    y: number;
    age: number;
  }
  let particles: Particle[] = [];
  let nextParticleId = 0;

  // Swipe tracking
  let canvasEl: HTMLDivElement;
  let swiping = false;
  let lastPt: { x: number; y: number } | null = null;

  // ── Hit-test: is a point inside the yak ellipse? ──────────────────────
  // The yak body is modelled as an ellipse centred in the canvas.
  const YAK_CX = YAK_W / 2;
  const YAK_CY = YAK_H / 2 + 10; // shifted slightly down for the body
  const YAK_RX = 115;
  const YAK_RY = 100;

  function isOnYak(x: number, y: number): boolean {
    const dx = (x - YAK_CX) / YAK_RX;
    const dy = (y - YAK_CY) / YAK_RY;
    return dx * dx + dy * dy <= 1;
  }

  /** Convert a client touch/mouse point to yak-canvas coordinates. */
  function toCanvasCoords(clientX: number, clientY: number): { x: number; y: number } | null {
    if (!canvasEl) return null;
    const rect = canvasEl.getBoundingClientRect();
    const scaleX = YAK_W / rect.width;
    const scaleY = YAK_H / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  // ── Touch / pointer handlers ──────────────────────────────────────────
  function onPointerDown(e: TouchEvent | MouseEvent) {
    const pt = "touches" in e ? toCanvasCoords(e.touches[0].clientX, e.touches[0].clientY) : toCanvasCoords((e as MouseEvent).clientX, (e as MouseEvent).clientY);
    if (!pt) return;
    swiping = true;
    lastPt = pt;
  }

  function onPointerMove(e: TouchEvent | MouseEvent) {
    if (!swiping || !lastPt) return;
    const pt = "touches" in e ? toCanvasCoords(e.touches[0].clientX, e.touches[0].clientY) : toCanvasCoords((e as MouseEvent).clientX, (e as MouseEvent).clientY);
    if (!pt) return;

    const onTarget = isOnYak(lastPt.x, lastPt.y) && isOnYak(pt.x, pt.y);

    room.send("game_input", {
      action: "swipe",
      x1: lastPt.x,
      y1: lastPt.y,
      x2: pt.x,
      y2: pt.y,
      onTarget,
    });

    if (onTarget) {
      spawnParticles(pt.x, pt.y);
    }

    lastPt = pt;
  }

  function onPointerUp() {
    swiping = false;
    lastPt = null;
  }

  // ── Particles ─────────────────────────────────────────────────────────
  function spawnParticles(x: number, y: number) {
    for (let i = 0; i < 3; i++) {
      particles = [
        ...particles,
        {
          id: nextParticleId++,
          x: x + (Math.random() - 0.5) * 30,
          y: y + (Math.random() - 0.5) * 30,
          age: 0,
        },
      ];
    }
    // Cap particle count
    if (particles.length > 30) {
      particles = particles.slice(-30);
    }
  }

  // Age and remove old particles
  let particleInterval: ReturnType<typeof setInterval>;

  // ── Server messages ───────────────────────────────────────────────────
  function onShaveUpdate(data: {
    shavedPercent: number;
    score: number;
    combo: number;
    comboMax: number;
    yakOffsetX: number;
    yakOffsetY: number;
    yakRotation: number;
  }) {
    shavedPercent = data.shavedPercent;
    score = data.score;
    combo = data.combo;
    comboMax = data.comboMax;
    yakOffsetX = data.yakOffsetX;
    yakOffsetY = data.yakOffsetY;
    yakRotation = data.yakRotation;
  }

  function onYakNudge(data: {
    yakOffsetX: number;
    yakOffsetY: number;
    yakRotation: number;
  }) {
    yakOffsetX = data.yakOffsetX;
    yakOffsetY = data.yakOffsetY;
    yakRotation = data.yakRotation;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────
  let timerInterval: ReturnType<typeof setInterval>;

  onMount(() => {
    room.onMessage("shave_update", onShaveUpdate);
    room.onMessage("yak_nudge", onYakNudge);

    // Global pointer listeners so swipe continues outside the canvas
    document.addEventListener("touchmove", onGlobalTouchMove, { passive: false });
    document.addEventListener("mousemove", onGlobalMouseMove);
    document.addEventListener("touchend", onGlobalRelease);
    document.addEventListener("mouseup", onGlobalRelease);

    timerInterval = setInterval(() => {
      const elapsed = (Date.now() - state.phaseStartedAt) / 1000;
      timeLeft = Math.max(0, state.roundDurationSecs - elapsed);
    }, 100);

    particleInterval = setInterval(() => {
      particles = particles
        .map((p) => ({ ...p, age: p.age + 1 }))
        .filter((p) => p.age < 8);
    }, 60);
  });

  onDestroy(() => {
    document.removeEventListener("touchmove", onGlobalTouchMove);
    document.removeEventListener("mousemove", onGlobalMouseMove);
    document.removeEventListener("touchend", onGlobalRelease);
    document.removeEventListener("mouseup", onGlobalRelease);
    clearInterval(timerInterval);
    clearInterval(particleInterval);
  });

  function onGlobalTouchMove(e: TouchEvent) {
    if (swiping) {
      e.preventDefault(); // prevent scroll while swiping
      onPointerMove(e);
    }
  }
  function onGlobalMouseMove(e: MouseEvent) {
    if (swiping) onPointerMove(e);
  }
  function onGlobalRelease() {
    onPointerUp();
  }

  // ── Derived values ────────────────────────────────────────────────────
  $: progressDash = 2 * Math.PI * 54; // circumference of progress ring (r=54)
  $: progressOffset = progressDash - (shavedPercent / 100) * progressDash;
  $: yakTransform = `translate(${yakOffsetX * 0.3}px, ${yakOffsetY * 0.3}px) rotate(${yakRotation * 15}deg)`;
  $: comboColor = combo >= 8 ? "#f59e0b" : combo >= 5 ? "#a78bfa" : combo >= 3 ? "#6366f1" : "#94a3b8";
  $: urgentTimer = timeLeft < 6;

  // Fur opacity: goes from 1.0 (no shave) → 0.0 (fully shaved)
  $: furOpacity = Math.max(0, 1 - shavedPercent / 100);
</script>

<div class="flex-1 flex flex-col select-none overflow-hidden bg-gradient-to-b from-sky-900 via-sky-800 to-emerald-900" data-testid="shave-yak-game">
  <!-- ── Top HUD ──────────────────────────────────────────────────────── -->
  <div class="px-4 py-3 bg-black/40 flex items-center gap-3 z-10">
    <!-- Shaved % bar -->
    <div class="flex-1">
      <p class="text-xs text-sky-300 mb-1 font-bold tracking-wide">Shaved</p>
      <div class="h-3 bg-gray-700 rounded-full overflow-hidden">
        <div
          class="h-full rounded-full transition-all duration-200"
          style="width:{shavedPercent}%;
            background: linear-gradient(90deg, #6366f1, #a78bfa, #f59e0b);"
          data-testid="shave-progress"
        ></div>
      </div>
      <p class="text-xs text-sky-200 mt-0.5 font-mono">{shavedPercent.toFixed(1)}%</p>
    </div>

    <!-- Combo -->
    {#if combo > 0}
      <div
        class="px-2 py-1 rounded-lg text-xs font-black animate-bounce"
        style="background:{comboColor}; color:#fff;"
        data-testid="combo-badge"
      >
        x{combo}
      </div>
    {/if}

    <!-- Timer -->
    <div class="text-right">
      <p
        class="text-2xl font-mono font-black transition-colors {urgentTimer ? 'text-red-400 animate-pulse' : 'text-white'}"
        data-testid="yak-timer"
      >{Math.ceil(timeLeft)}</p>
    </div>
  </div>

  <!-- Score -->
  <div class="text-center py-1 bg-black/20">
    <span class="text-sm text-sky-300 font-mono font-bold">Score: {score}</span>
  </div>

  <!-- ── Yak canvas area ─────────────────────────────────────────────── -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    bind:this={canvasEl}
    class="flex-1 relative flex items-center justify-center touch-none"
    on:touchstart|preventDefault={onPointerDown}
    on:mousedown={onPointerDown}
  >
    <!-- Progress ring (behind yak) -->
    <svg class="absolute" width="140" height="140" viewBox="0 0 120 120" style="opacity:0.7; z-index:0;">
      <circle cx="60" cy="60" r="54" fill="none" stroke="#334155" stroke-width="6" />
      <circle
        cx="60" cy="60" r="54"
        fill="none"
        stroke="#6366f1"
        stroke-width="6"
        stroke-linecap="round"
        stroke-dasharray={progressDash}
        stroke-dashoffset={progressOffset}
        transform="rotate(-90 60 60)"
        class="transition-all duration-300"
      />
    </svg>

    <!-- Yak SVG container — transformed on nudge -->
    <div
      class="relative transition-transform duration-300 ease-out"
      style="transform:{yakTransform}; width:280px; height:260px; z-index:1;"
      data-testid="yak-body"
    >
      <svg viewBox="0 0 300 280" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <!-- ===== SHAVED BODY (always visible, pink skin) ===== -->
        <g id="yak-skin">
          <!-- Body -->
          <ellipse cx="150" cy="155" rx="105" ry="85" fill="#f9b4c2" stroke="#d97890" stroke-width="2" />
          <!-- Head -->
          <ellipse cx="150" cy="68" rx="52" ry="42" fill="#f9b4c2" stroke="#d97890" stroke-width="2" />
          <!-- Snout -->
          <ellipse cx="150" cy="90" rx="28" ry="18" fill="#fcd5de" stroke="#d97890" stroke-width="1.5" />
          <!-- Nostrils -->
          <ellipse cx="142" cy="92" rx="4" ry="3" fill="#d97890" />
          <ellipse cx="158" cy="92" rx="4" ry="3" fill="#d97890" />
          <!-- Mouth — dopey grin -->
          <path d="M135 100 Q150 114 165 100" fill="none" stroke="#d97890" stroke-width="2" stroke-linecap="round" />
          <!-- Tongue -->
          <ellipse cx="152" cy="107" rx="7" ry="5" fill="#ff8fab" />
          <!-- Eyes — big cartoon eyes -->
          <ellipse cx="132" cy="62" rx="12" ry="14" fill="white" stroke="#555" stroke-width="1.5" />
          <ellipse cx="168" cy="62" rx="12" ry="14" fill="white" stroke="#555" stroke-width="1.5" />
          <!-- Pupils — looking derpy -->
          <ellipse cx="135" cy="64" rx="6" ry="7" fill="#333" />
          <ellipse cx="165" cy="64" rx="6" ry="7" fill="#333" />
          <!-- Pupil highlights -->
          <circle cx="137" cy="61" r="2.5" fill="white" />
          <circle cx="167" cy="61" r="2.5" fill="white" />
          <!-- Eyebrows — worried/funny -->
          <path d="M120 48 Q132 40 144 50" fill="none" stroke="#6b4f3a" stroke-width="2.5" stroke-linecap="round" />
          <path d="M156 50 Q168 40 180 48" fill="none" stroke="#6b4f3a" stroke-width="2.5" stroke-linecap="round" />
          <!-- Horns -->
          <path d="M118 45 Q108 20 100 28" fill="none" stroke="#c9a96e" stroke-width="5" stroke-linecap="round" />
          <path d="M182 45 Q192 20 200 28" fill="none" stroke="#c9a96e" stroke-width="5" stroke-linecap="round" />
          <!-- Ears -->
          <ellipse cx="108" cy="55" rx="14" ry="8" fill="#f9b4c2" stroke="#d97890" stroke-width="1.5" transform="rotate(-20 108 55)" />
          <ellipse cx="192" cy="55" rx="14" ry="8" fill="#f9b4c2" stroke="#d97890" stroke-width="1.5" transform="rotate(20 192 55)" />
          <!-- Legs — stubby cartoon legs -->
          <rect x="80"  y="220" width="22" height="40" rx="10" fill="#f9b4c2" stroke="#d97890" stroke-width="1.5" />
          <rect x="120" y="225" width="22" height="38" rx="10" fill="#f9b4c2" stroke="#d97890" stroke-width="1.5" />
          <rect x="160" y="225" width="22" height="38" rx="10" fill="#f9b4c2" stroke="#d97890" stroke-width="1.5" />
          <rect x="198" y="220" width="22" height="40" rx="10" fill="#f9b4c2" stroke="#d97890" stroke-width="1.5" />
          <!-- Hooves -->
          <rect x="78"  y="254" width="26" height="10" rx="5" fill="#6b4f3a" />
          <rect x="118" y="257" width="26" height="10" rx="5" fill="#6b4f3a" />
          <rect x="158" y="257" width="26" height="10" rx="5" fill="#6b4f3a" />
          <rect x="196" y="254" width="26" height="10" rx="5" fill="#6b4f3a" />
          <!-- Tail -->
          <path d="M255 145 Q275 130 268 110" fill="none" stroke="#f9b4c2" stroke-width="5" stroke-linecap="round" />
          <circle cx="268" cy="108" r="6" fill="#f9b4c2" stroke="#d97890" stroke-width="1" />
        </g>

        <!-- ===== FUR LAYER (fades as shaved %) ===== -->
        <g id="yak-fur" style="opacity:{furOpacity}; transition: opacity 0.3s ease;">
          <!-- Body fur — big shaggy brown mass -->
          <ellipse cx="150" cy="150" rx="112" ry="92" fill="#7c5b3a" />
          <ellipse cx="150" cy="148" rx="106" ry="86" fill="#8b6914" />
          <!-- Shaggy fur texture lines -->
          <path d="M55 140 Q60 125 65 140 Q70 155 75 140 Q80 125 85 140" fill="none" stroke="#6b4f0a" stroke-width="2" opacity="0.6" />
          <path d="M85 170 Q90 155 95 170 Q100 185 105 170 Q110 155 115 170" fill="none" stroke="#6b4f0a" stroke-width="2" opacity="0.6" />
          <path d="M190 140 Q195 125 200 140 Q205 155 210 140 Q215 125 220 140" fill="none" stroke="#6b4f0a" stroke-width="2" opacity="0.6" />
          <path d="M130 180 Q135 165 140 180 Q145 195 150 180 Q155 165 160 180 Q165 195 170 180" fill="none" stroke="#6b4f0a" stroke-width="2" opacity="0.6" />
          <path d="M70 195 Q75 180 80 195 Q85 210 90 195" fill="none" stroke="#6b4f0a" stroke-width="2" opacity="0.5" />
          <path d="M200 190 Q205 175 210 190 Q215 205 220 190" fill="none" stroke="#6b4f0a" stroke-width="2" opacity="0.5" />
          <!-- Head tuft -->
          <ellipse cx="150" cy="55" rx="38" ry="30" fill="#7c5b3a" />
          <ellipse cx="150" cy="52" rx="34" ry="26" fill="#8b6914" />
          <!-- Extra shaggy bits hanging down -->
          <path d="M60 160 Q55 175 50 160" fill="#7c5b3a" stroke="none" />
          <path d="M240 160 Q245 175 250 160" fill="#7c5b3a" stroke="none" />
          <path d="M80 210 Q75 225 70 210" fill="#7c5b3a" stroke="none" />
          <path d="M220 210 Q225 225 230 210" fill="#7c5b3a" stroke="none" />
          <!-- Belly fur -->
          <ellipse cx="150" cy="200" rx="80" ry="35" fill="#6b4f0a" opacity="0.5" />
          <!-- Tail fur -->
          <path d="M250 140 Q272 126 265 105" fill="none" stroke="#8b6914" stroke-width="8" stroke-linecap="round" />
          <circle cx="265" cy="103" r="10" fill="#8b6914" />
        </g>

        <!-- ===== Eyes/face always on top of fur ===== -->
        <g id="yak-face-overlay">
          <!-- Re-draw eyes on top so they're always visible through fur -->
          <ellipse cx="132" cy="62" rx="13" ry="15" fill="white" stroke="#555" stroke-width="1.5" />
          <ellipse cx="168" cy="62" rx="13" ry="15" fill="white" stroke="#555" stroke-width="1.5" />
          <ellipse cx="135" cy="64" rx="6" ry="7" fill="#333" />
          <ellipse cx="165" cy="64" rx="6" ry="7" fill="#333" />
          <circle cx="137" cy="61" r="2.5" fill="white" />
          <circle cx="167" cy="61" r="2.5" fill="white" />
          <!-- Horns always visible -->
          <path d="M118 45 Q108 20 100 28" fill="none" stroke="#c9a96e" stroke-width="5" stroke-linecap="round" />
          <path d="M182 45 Q192 20 200 28" fill="none" stroke="#c9a96e" stroke-width="5" stroke-linecap="round" />
        </g>
      </svg>
    </div>

    <!-- ── Shave particles ─────────────────────────────────────────── -->
    {#each particles as p (p.id)}
      <div
        class="absolute pointer-events-none rounded-full"
        style="
          left: {(p.x / YAK_W) * 100}%;
          top: {(p.y / YAK_H) * 100}%;
          width: {8 - p.age}px;
          height: {8 - p.age}px;
          background: {p.age % 2 === 0 ? '#f5e6d3' : '#d4a76a'};
          opacity: {1 - p.age / 8};
          transform: translate(-50%, -50%) scale({1 + p.age * 0.3});
          transition: all 0.06s linear;
        "
      ></div>
    {/each}

    <!-- ── "Swipe here!" hint (fades after first swipe) ────────── -->
    {#if shavedPercent === 0 && timeLeft > 18}
      <div class="absolute bottom-8 left-0 right-0 text-center animate-bounce z-10">
        <span class="bg-black/60 text-white px-4 py-2 rounded-full text-sm font-bold">
          Swipe the yak to shave!
        </span>
      </div>
    {/if}
  </div>
</div>

<style>
  /* Prevent default touch behaviors on the game area */
  :global(body) {
    overscroll-behavior: none;
  }
</style>
