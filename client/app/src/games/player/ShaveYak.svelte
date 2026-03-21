<script lang="ts">
  /**
   * client/app/src/games/player/ShaveYak.svelte
   *
   * "Shave The Yak" phone game screen.
   *
   * Visual approach:
   *   1. SVG skin layer (always visible) — bottom
   *   2. Fur canvas (starts opaque, erased along swipe paths) — middle
   *   3. SVG face/eyes overlay — top
   *   4. Particle puffs on each shave stroke
   *
   * The fur canvas uses a 2D context. On mount, an offscreen fur image is
   * drawn. As the player swipes on-target, circles along the swipe line are
   * erased with globalCompositeOperation = "destination-out", revealing the
   * pink skin SVG underneath.
   *
   * 3D effect: the yak container uses CSS perspective + rotateX/rotateY
   * based on the yak rotation value from the server nudge system.
   */
  import { onMount, onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState, PlayerState } from "../../../../shared/types";

  export let room: Room;
  export let state: RoomState;
  export let me: PlayerState | undefined;

  // ── Yak canvas virtual dimensions (must match server YAK_W / YAK_H) ──
  const YAK_W = 300;
  const YAK_H = 280;

  // Shave brush radius — matches server SHAVE_RADIUS
  const SHAVE_RADIUS = 8;

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

  // Fur canvas for per-swipe hair removal
  let furCanvas: HTMLCanvasElement;
  let furCtx: CanvasRenderingContext2D | null = null;

  // ── Hit-test: is a point inside the yak ellipse? ──────────────────────
  const YAK_CX = YAK_W / 2;
  const YAK_CY = YAK_H / 2 + 10;
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

  // ── Fur canvas initialization ─────────────────────────────────────────
  // Build a fur-colored ellipse image on the canvas. When we swipe, we
  // erase circles along the path using "destination-out" compositing.

  function initFurCanvas() {
    if (!furCanvas) return;
    furCanvas.width = YAK_W;
    furCanvas.height = YAK_H;
    furCtx = furCanvas.getContext("2d");
    if (!furCtx) return;

    // Draw the fur silhouette — main body ellipse
    furCtx.fillStyle = "#8b6914";
    furCtx.beginPath();
    furCtx.ellipse(150, 150, 112, 92, 0, 0, Math.PI * 2);
    furCtx.fill();

    // Darker ring for depth
    furCtx.fillStyle = "#7c5b3a";
    furCtx.beginPath();
    furCtx.ellipse(150, 148, 106, 86, 0, 0, Math.PI * 2);
    furCtx.fill();

    // Head tuft
    furCtx.fillStyle = "#7c5b3a";
    furCtx.beginPath();
    furCtx.ellipse(150, 55, 38, 30, 0, 0, Math.PI * 2);
    furCtx.fill();
    furCtx.fillStyle = "#8b6914";
    furCtx.beginPath();
    furCtx.ellipse(150, 52, 34, 26, 0, 0, Math.PI * 2);
    furCtx.fill();

    // Belly fur
    furCtx.fillStyle = "rgba(107, 79, 10, 0.5)";
    furCtx.beginPath();
    furCtx.ellipse(150, 200, 80, 35, 0, 0, Math.PI * 2);
    furCtx.fill();

    // Shaggy texture lines
    furCtx.strokeStyle = "#6b4f0a";
    furCtx.lineWidth = 2;
    furCtx.globalAlpha = 0.6;
    drawWavyLine(furCtx, 55, 140, 85, 140, 15);
    drawWavyLine(furCtx, 85, 170, 115, 170, 15);
    drawWavyLine(furCtx, 190, 140, 220, 140, 15);
    drawWavyLine(furCtx, 130, 180, 170, 180, 15);
    furCtx.globalAlpha = 0.5;
    drawWavyLine(furCtx, 70, 195, 90, 195, 15);
    drawWavyLine(furCtx, 200, 190, 220, 190, 15);
    furCtx.globalAlpha = 1.0;

    // Tail fur
    furCtx.strokeStyle = "#8b6914";
    furCtx.lineWidth = 8;
    furCtx.lineCap = "round";
    furCtx.beginPath();
    furCtx.moveTo(250, 140);
    furCtx.quadraticCurveTo(272, 126, 265, 105);
    furCtx.stroke();
    furCtx.fillStyle = "#8b6914";
    furCtx.beginPath();
    furCtx.arc(265, 103, 10, 0, Math.PI * 2);
    furCtx.fill();

    // Shaggy edge bits
    furCtx.fillStyle = "#7c5b3a";
    drawDrip(furCtx, 60, 160, 55, 175, 50, 160);
    drawDrip(furCtx, 240, 160, 245, 175, 250, 160);
    drawDrip(furCtx, 80, 210, 75, 225, 70, 210);
    drawDrip(furCtx, 220, 210, 225, 225, 230, 210);
  }

  /** Draw a wavy line for fur texture. */
  function drawWavyLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, amp: number) {
    const steps = 4;
    const dx = (x2 - x1) / steps;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    for (let i = 1; i <= steps; i++) {
      const cx = x1 + dx * (i - 0.5);
      const cy = y1 + (i % 2 === 1 ? -amp : amp);
      const ex = x1 + dx * i;
      ctx.quadraticCurveTo(cx, cy, ex, y1);
    }
    ctx.stroke();
  }

  /** Draw a drip/shaggy bit. */
  function drawDrip(ctx: CanvasRenderingContext2D, x1: number, y1: number, cx: number, cy: number, x2: number, y2: number) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(cx, cy, x2, y2);
    ctx.fill();
  }

  /** Erase a circular region along a swipe line on the fur canvas. */
  function eraseSwipeLine(x1: number, y1: number, x2: number, y2: number) {
    if (!furCtx) return;
    furCtx.save();
    furCtx.globalCompositeOperation = "destination-out";
    furCtx.fillStyle = "rgba(0,0,0,1)";

    // Draw circles along the line at intervals smaller than the radius
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(1, Math.ceil(dist / (SHAVE_RADIUS * 0.5)));

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = x1 + dx * t;
      const py = y1 + dy * t;
      furCtx.beginPath();
      furCtx.arc(px, py, SHAVE_RADIUS, 0, Math.PI * 2);
      furCtx.fill();
    }

    furCtx.restore();
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
      // Erase fur on the canvas along the swipe path
      eraseSwipeLine(lastPt.x, lastPt.y, pt.x, pt.y);
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
    if (particles.length > 30) {
      particles = particles.slice(-30);
    }
  }

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
    initFurCanvas();

    room.onMessage("shave_update", onShaveUpdate);
    room.onMessage("yak_nudge", onYakNudge);

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
      e.preventDefault();
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
  $: progressDash = 2 * Math.PI * 54;
  $: progressOffset = progressDash - (shavedPercent / 100) * progressDash;
  // 3D perspective transform: translate for nudge + rotateY/rotateX for 3D tilt
  $: yakTransform = `perspective(600px) translate(${yakOffsetX * 0.3}px, ${yakOffsetY * 0.3}px) rotateY(${yakRotation * 25}deg) rotateX(${-yakOffsetY * 0.15}deg)`;
  $: comboColor = combo >= 8 ? "#f59e0b" : combo >= 5 ? "#a78bfa" : combo >= 3 ? "#6366f1" : "#94a3b8";
  $: urgentTimer = timeLeft < 6;
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

    <!-- Yak container — 3D perspective transform on nudge/miss -->
    <div
      class="relative transition-transform duration-300 ease-out"
      style="transform:{yakTransform}; width:280px; height:260px; z-index:1; transform-style: preserve-3d;"
      data-testid="yak-body"
    >
      <!-- Layer 1: Skin SVG (always visible underneath) -->
      <svg class="absolute inset-0" viewBox="0 0 300 280" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
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
          <!-- Mouth -->
          <path d="M135 100 Q150 114 165 100" fill="none" stroke="#d97890" stroke-width="2" stroke-linecap="round" />
          <!-- Tongue -->
          <ellipse cx="152" cy="107" rx="7" ry="5" fill="#ff8fab" />
          <!-- Eyes -->
          <ellipse cx="132" cy="62" rx="12" ry="14" fill="white" stroke="#555" stroke-width="1.5" />
          <ellipse cx="168" cy="62" rx="12" ry="14" fill="white" stroke="#555" stroke-width="1.5" />
          <ellipse cx="135" cy="64" rx="6" ry="7" fill="#333" />
          <ellipse cx="165" cy="64" rx="6" ry="7" fill="#333" />
          <circle cx="137" cy="61" r="2.5" fill="white" />
          <circle cx="167" cy="61" r="2.5" fill="white" />
          <!-- Eyebrows -->
          <path d="M120 48 Q132 40 144 50" fill="none" stroke="#6b4f3a" stroke-width="2.5" stroke-linecap="round" />
          <path d="M156 50 Q168 40 180 48" fill="none" stroke="#6b4f3a" stroke-width="2.5" stroke-linecap="round" />
          <!-- Horns -->
          <path d="M118 45 Q108 20 100 28" fill="none" stroke="#c9a96e" stroke-width="5" stroke-linecap="round" />
          <path d="M182 45 Q192 20 200 28" fill="none" stroke="#c9a96e" stroke-width="5" stroke-linecap="round" />
          <!-- Ears -->
          <ellipse cx="108" cy="55" rx="14" ry="8" fill="#f9b4c2" stroke="#d97890" stroke-width="1.5" transform="rotate(-20 108 55)" />
          <ellipse cx="192" cy="55" rx="14" ry="8" fill="#f9b4c2" stroke="#d97890" stroke-width="1.5" transform="rotate(20 192 55)" />
          <!-- Legs -->
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
      </svg>

      <!-- Layer 2: Fur canvas (erased on swipe — reveals skin below) -->
      <canvas
        bind:this={furCanvas}
        class="absolute inset-0 w-full h-full pointer-events-none"
        style="z-index:1;"
      ></canvas>

      <!-- Layer 3: Face overlay SVG (eyes/horns always visible on top) -->
      <svg class="absolute inset-0 pointer-events-none" viewBox="0 0 300 280" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="z-index:2;">
        <g id="yak-face-overlay">
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

    <!-- ── "Swipe here!" hint ──────────────────────────────────────── -->
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
  :global(body) {
    overscroll-behavior: none;
  }
</style>
