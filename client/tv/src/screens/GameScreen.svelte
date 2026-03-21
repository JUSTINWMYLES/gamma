<script lang="ts">
  /**
   * TV Game screen — renders the tile map, players, and guard.
   * Uses an HTML Canvas element for the 2-D top-down view.
   *
   * Coordinate system: tile units (0,0) = top-left.
   * Each tile is TILE_SIZE_PX pixels.
   */
  import { onMount, onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState } from "../../../shared/types";
  import { TILE_SIZE_PX, MAP_WIDTH, MAP_HEIGHT, TILE } from "../../../shared/types";

  export let room: Room;
  export let state: RoomState;

  // Raw tile data (mirrored from server tilemap — same layout)
  // prettier-ignore
  const TILES: number[] = [
    1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
    1,0,0,0,0,2,0,0,0,0,2,0,0,0,0,1,
    1,0,1,1,0,0,0,1,1,0,0,0,1,1,0,1,
    1,0,1,0,0,0,0,0,0,0,0,0,0,1,0,1,
    1,0,0,0,3,0,0,0,0,0,0,3,0,0,0,1,
    1,0,0,0,3,0,0,0,0,0,0,3,0,0,0,1,
    1,0,1,0,0,0,0,0,0,0,0,0,0,1,0,1,
    1,0,1,1,0,0,0,1,1,0,0,0,1,1,0,1,
    1,0,0,0,0,2,0,0,0,0,2,0,0,0,0,1,
    1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
  ];

  const TILE_COLORS: Record<number, string> = {
    [TILE.FLOOR]: "#1e1e2e",
    [TILE.WALL]:  "#374151",
    [TILE.BUSH]:  "#14532d",
    [TILE.CRATE]: "#78350f",
  };

  const PLAYER_COLORS = [
    "#6366f1", "#ec4899", "#f59e0b", "#10b981",
    "#3b82f6", "#ef4444", "#8b5cf6", "#14b8a6",
  ];

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  let animFrame: number;

  // Timer
  let timeLeft = 0;
  let timerInterval: ReturnType<typeof setInterval>;

  onMount(() => {
    ctx = canvas.getContext("2d")!;
    animFrame = requestAnimationFrame(draw);

    timerInterval = setInterval(() => {
      const elapsed = (Date.now() - state.phaseStartedAt) / 1000;
      timeLeft = Math.max(0, state.roundDurationSecs - elapsed);
    }, 200);

    return () => {
      cancelAnimationFrame(animFrame);
      clearInterval(timerInterval);
    };
  });

  onDestroy(() => {
    cancelAnimationFrame(animFrame);
    clearInterval(timerInterval);
  });

  function draw() {
    animFrame = requestAnimationFrame(draw);
    if (!ctx) return;

    const W = MAP_WIDTH * TILE_SIZE_PX;
    const H = MAP_HEIGHT * TILE_SIZE_PX;
    canvas.width = W;
    canvas.height = H;

    // ── Draw tiles ────────────────────────────────────────────────
    for (let row = 0; row < MAP_HEIGHT; row++) {
      for (let col = 0; col < MAP_WIDTH; col++) {
        const tileId = TILES[row * MAP_WIDTH + col];
        ctx.fillStyle = TILE_COLORS[tileId] ?? "#000";
        ctx.fillRect(col * TILE_SIZE_PX, row * TILE_SIZE_PX, TILE_SIZE_PX, TILE_SIZE_PX);

        // Tile border
        ctx.strokeStyle = "rgba(255,255,255,0.03)";
        ctx.strokeRect(col * TILE_SIZE_PX, row * TILE_SIZE_PX, TILE_SIZE_PX, TILE_SIZE_PX);
      }
    }

    // ── Draw guard vision cone ────────────────────────────────────
    const g = state.guard;
    if (g) {
      const gx = g.x * TILE_SIZE_PX + TILE_SIZE_PX / 2;
      const gy = g.y * TILE_SIZE_PX + TILE_SIZE_PX / 2;
      const range = 6 * TILE_SIZE_PX;
      const fov = Math.PI / 3;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.arc(gx, gy, range, g.facingAngle - fov, g.facingAngle + fov);
      ctx.closePath();
      ctx.fillStyle =
        g.guardMode === "chase"
          ? "rgba(239,68,68,0.15)"
          : g.guardMode === "alert"
          ? "rgba(245,158,11,0.12)"
          : "rgba(99,102,241,0.10)";
      ctx.fill();
      ctx.restore();

      // Guard sprite (circle)
      ctx.beginPath();
      ctx.arc(gx, gy, TILE_SIZE_PX * 0.38, 0, Math.PI * 2);
      ctx.fillStyle =
        g.guardMode === "chase" ? "#ef4444" : g.guardMode === "alert" ? "#f59e0b" : "#6366f1";
      ctx.fill();
      // Direction indicator
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(
        gx + Math.cos(g.facingAngle) * TILE_SIZE_PX * 0.5,
        gy + Math.sin(g.facingAngle) * TILE_SIZE_PX * 0.5,
      );
      ctx.strokeStyle = "white";
      ctx.lineWidth = 3;
      ctx.stroke();

      // Guard label
      ctx.fillStyle = "white";
      ctx.font = "bold 11px monospace";
      ctx.textAlign = "center";
      ctx.fillText("GUARD", gx, gy - TILE_SIZE_PX * 0.55);
    }

    // ── Draw players ──────────────────────────────────────────────
    const players = [...state.players.values()];
    players.forEach((p, i) => {
      if (!p.isConnected && p.isEliminated) return;

      const px = p.x * TILE_SIZE_PX + TILE_SIZE_PX / 2;
      const py = p.y * TILE_SIZE_PX + TILE_SIZE_PX / 2;
      const color = PLAYER_COLORS[i % PLAYER_COLORS.length];

      ctx.save();
      if (p.isEliminated) {
        ctx.globalAlpha = 0.3;
      }

      // Detection indicator ring
      if (p.isDetected && !p.isEliminated) {
        ctx.beginPath();
        ctx.arc(px, py, TILE_SIZE_PX * 0.48, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(239,68,68,${p.detectionMeter / 100})`;
        ctx.lineWidth = 4;
        ctx.stroke();
      }

      // Player circle
      ctx.beginPath();
      ctx.arc(px, py, TILE_SIZE_PX * 0.32, 0, Math.PI * 2);
      ctx.fillStyle = p.isHiding ? "#4b5563" : color;
      ctx.fill();
      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Name label
      ctx.fillStyle = "white";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(p.name.slice(0, 6), px, py - TILE_SIZE_PX * 0.48);

      // Hiding icon
      if (p.isHiding) {
        ctx.font = "14px serif";
        ctx.fillText("🌿", px, py + TILE_SIZE_PX * 0.6);
      }

      ctx.restore();
    });
  }
</script>

<div class="flex-1 flex" data-testid="game-screen">
  <!-- Canvas -->
  <div class="flex-1 flex items-center justify-center p-4">
    <canvas bind:this={canvas} class="rounded-xl shadow-2xl max-w-full max-h-full" />
  </div>

  <!-- HUD sidebar -->
  <div class="w-56 bg-gray-800 p-4 flex flex-col gap-4">
    <!-- Timer -->
    <div class="text-center">
      <p class="text-xs text-gray-400 uppercase tracking-widest">Time</p>
      <p
        class="text-4xl font-black font-mono {timeLeft < 10 ? 'text-red-400' : 'text-white'}"
        data-testid="timer"
      >{Math.ceil(timeLeft)}</p>
      <p class="text-xs text-gray-400">Round {state.currentRound} of {state.gameConfig.roundCount}</p>
    </div>

    <!-- Player scores -->
    <div>
      <p class="text-xs text-gray-400 uppercase tracking-widest mb-2">Players</p>
      <ul class="space-y-1">
        {#each [...state.players.values()].sort((a, b) => b.score - a.score) as p, i}
          <li
            class="flex items-center gap-2 rounded px-2 py-1
              {p.isEliminated ? 'opacity-40' : ''}"
          >
            <span
              class="w-3 h-3 rounded-full flex-shrink-0"
              style="background:{['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#8b5cf6','#14b8a6'][i % 8]}"
            ></span>
            <span class="flex-1 text-sm truncate">{p.name}</span>
            <span class="text-xs font-mono text-gray-300">{p.score}</span>
            {#if p.isEliminated}
              <span class="text-red-400 text-xs">✕</span>
            {/if}
          </li>
        {/each}
      </ul>
    </div>

    <!-- Guard status -->
    <div class="mt-auto">
      <p class="text-xs text-gray-400 uppercase tracking-widest mb-1">Guard</p>
      <p class="text-sm font-semibold capitalize
        {state.guard.guardMode === 'chase' ? 'text-red-400' :
         state.guard.guardMode === 'alert' ? 'text-yellow-400' : 'text-green-400'}">
        {state.guard.guardMode}
      </p>
    </div>
  </div>
</div>
