<script lang="ts">
  /**
   * Viewer Game screen — routes to the correct game component based on selectedGame.
   *
   * Registry-14 (Don't Get Caught): renders the procedural tile map, players,
   * and all guards using an HTML Canvas element for a 2-D top-down view.
   *
   * Registry-19 (Shave the Yak): delegates to ShaveYakTV component.
   *
   * Registry-20 (Odd One Out): delegates to OddOneOutTV component.
   */
  import { onMount, onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState } from "../../../../shared/types";
  import { TILE_SIZE_PX, TILE } from "../../../../shared/types";
  import OddOneOutTV from "../../games/viewer/OddOneOutTV.svelte";
  import ShaveYakTV from "../../games/viewer/ShaveYakTV.svelte";
  import AudioOverlayTV from "../../games/viewer/AudioOverlayTV.svelte";
  import LowballMarketplaceTV from "../../games/viewer/LowballMarketplaceTV.svelte";
  import FireMatchBlowShakeTV from "../../games/viewer/FireMatchBlowShakeTV.svelte";
  import HotPotatoTV from "../../games/viewer/HotPotatoTV.svelte";
  import TapSpeedTV from "../../games/viewer/TapSpeedTV.svelte";
  import SoundReplicationTV from "../../games/viewer/SoundReplicationTV.svelte";
  import EscapeMazeTV from "../../games/viewer/EscapeMazeTV.svelte";
  import PaintMatchTV from "../../games/viewer/PaintMatchTV.svelte";
  import GridTapColorsTV from "../../games/viewer/GridTapColorsTV.svelte";
  import WordBuildTV from "../../games/viewer/WordBuildTV.svelte";
  import TierRankingTV from "../../games/viewer/TierRankingTV.svelte";
  import PlayerIcon from "../../components/PlayerIcon.svelte";

  export let room: Room;
  export let state: RoomState;

  // ── Game routing ──────────────────────────────────────────────────
  $: isOddOneOut = state.selectedGame === "registry-20-odd-one-out";
  $: isShaveYak = state.selectedGame === "registry-19-shave-the-yak";
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

  const PLAYER_COLORS = [
    "#6366f1", "#ec4899", "#f59e0b", "#10b981",
    "#3b82f6", "#ef4444", "#8b5cf6", "#14b8a6",
  ];

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  let animFrame: number;

  let timeLeft = 0;
  let timerInterval: ReturnType<typeof setInterval>;

  onMount(() => {
    if (isOddOneOut || isShaveYak || isAudioOverlay || isLowball || isFireMatch || isHotPotato || isTapSpeed || isSoundReplication || isEscapeMaze || isPaintMatch || isGridTapColors || isWordBuild || isTierRanking) return; // delegated components handle their own setup
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

    const mapWidth  = state.mapWidth  || 36;
    const mapHeight = state.mapHeight || 24;
    const W = mapWidth  * TILE_SIZE_PX;
    const H = mapHeight * TILE_SIZE_PX;
    canvas.width  = W;
    canvas.height = H;

    // Parse tile data (cached — only re-parse when mapTiles changes)
    let tiles: number[] = [];
    if (state.mapTiles) {
      try { tiles = JSON.parse(state.mapTiles); } catch { /* ignore */ }
    }

    // ── Draw tiles ────────────────────────────────────────────────
    for (let row = 0; row < mapHeight; row++) {
      for (let col = 0; col < mapWidth; col++) {
        const tileId = tiles[row * mapWidth + col] ?? TILE.WALL;
        ctx.fillStyle = tileId === TILE.WALL ? "#374151" : "#1e1e2e";
        ctx.fillRect(col * TILE_SIZE_PX, row * TILE_SIZE_PX, TILE_SIZE_PX, TILE_SIZE_PX);

        ctx.strokeStyle = "rgba(255,255,255,0.03)";
        ctx.strokeRect(col * TILE_SIZE_PX, row * TILE_SIZE_PX, TILE_SIZE_PX, TILE_SIZE_PX);
      }
    }

    // ── Draw all guards ───────────────────────────────────────────
    const guards = [...(state.guards?.values() ?? [])];
    for (const g of guards) {
      // Guard positions already include +0.5 offset (center of tile),
      // so multiply directly — no extra half-tile offset needed.
      const gx = g.x * TILE_SIZE_PX;
      const gy = g.y * TILE_SIZE_PX;
      const range = 6 * TILE_SIZE_PX;
      const fov = Math.PI / 4;

      // Vision cone — clipped against walls via ray-marching
      const coneColor =
        g.guardMode === "chase"
          ? "rgba(239,68,68,0.18)"
          : g.guardMode === "alert"
          ? "rgba(245,158,11,0.14)"
          : "rgba(99,102,241,0.10)";

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(gx, gy);

      // Cast rays across the cone to clip against walls
      const RAY_STEPS = 40;
      const startAngle = g.facingAngle - fov;
      const endAngle = g.facingAngle + fov;
      for (let r = 0; r <= RAY_STEPS; r++) {
        const angle = startAngle + (endAngle - startAngle) * (r / RAY_STEPS);
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);

        // March along ray in small steps, stop at wall or max range
        let rayLen = range;
        const stepSize = TILE_SIZE_PX * 0.5;
        for (let d = stepSize; d <= range; d += stepSize) {
          const checkX = gx + cosA * d;
          const checkY = gy + sinA * d;
          const tCol = Math.floor(checkX / TILE_SIZE_PX);
          const tRow = Math.floor(checkY / TILE_SIZE_PX);
          const tileIdx = tRow * mapWidth + tCol;
          const tileId = tiles[tileIdx] ?? TILE.WALL;
          if (tileId === TILE.WALL || tCol < 0 || tRow < 0 || tCol >= mapWidth || tRow >= mapHeight) {
            rayLen = d;
            break;
          }
        }

        ctx.lineTo(gx + cosA * rayLen, gy + sinA * rayLen);
      }
      ctx.closePath();
      ctx.fillStyle = coneColor;
      ctx.fill();
      ctx.restore();

      // Guard body
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
      ctx.font = `bold ${Math.max(9, TILE_SIZE_PX * 0.26)}px monospace`;
      ctx.textAlign = "center";
      ctx.fillText(`G${Number(g.id) + 1}`, gx, gy - TILE_SIZE_PX * 0.55);
    }

    // ── Draw players ──────────────────────────────────────────────
    const players = [...state.players.values()];
    players.forEach((p, i) => {
      if (!p.isConnected && p.isEliminated) return;

      // Player positions already include +0.5 offset (center of tile),
      // so multiply directly — no extra half-tile offset needed.
      const px = p.x * TILE_SIZE_PX;
      const py = p.y * TILE_SIZE_PX;
      const color = PLAYER_COLORS[i % PLAYER_COLORS.length];

      ctx.save();
      if (p.isEliminated) ctx.globalAlpha = 0.3;

      // Detection ring
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
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Name label
      ctx.fillStyle = "white";
      ctx.font = `bold ${Math.max(8, TILE_SIZE_PX * 0.24)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(p.name.slice(0, 6), px, py - TILE_SIZE_PX * 0.48);

      ctx.restore();
    });
  }
</script>

{#if isWordBuild}
  <WordBuildTV {room} {state} />
{:else if isTierRanking}
  <TierRankingTV {room} {state} />
{:else if isGridTapColors}
  <GridTapColorsTV {room} {state} />
{:else if isPaintMatch}
  <PaintMatchTV {room} {state} />
{:else if isTapSpeed}
  <TapSpeedTV {room} {state} />
{:else if isSoundReplication}
  <SoundReplicationTV {room} {state} />
{:else if isEscapeMaze}
  <EscapeMazeTV {room} {state} />
{:else if isOddOneOut}
  <OddOneOutTV {room} {state} />
{:else if isAudioOverlay}
  <AudioOverlayTV {room} {state} />
{:else if isLowball}
  <LowballMarketplaceTV {room} {state} />
{:else if isFireMatch}
  <FireMatchBlowShakeTV {room} {state} />
{:else if isHotPotato}
  <HotPotatoTV {room} {state} />
{:else if isShaveYak}
  <ShaveYakTV {room} {state} />
{:else}
<div class="flex-1 flex" data-testid="game-screen">
  <!-- Canvas -->
  <div class="flex-1 flex items-center justify-center p-4 overflow-hidden">
    <canvas bind:this={canvas} class="rounded-xl shadow-2xl max-w-full max-h-full" />
  </div>

  <!-- HUD sidebar -->
  <div class="w-56 bg-gray-800 p-4 flex flex-col gap-4 flex-shrink-0">
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
            <PlayerIcon player={p} size={20} />
            <span class="flex-1 text-sm truncate">{p.name}</span>
            <span class="text-xs font-mono text-gray-300">{p.score}</span>
            {#if p.isEliminated}
              <span class="text-red-400 text-xs">✕</span>
            {/if}
          </li>
        {/each}
      </ul>
    </div>

    <!-- Guards status -->
    <div class="mt-auto">
      <p class="text-xs text-gray-400 uppercase tracking-widest mb-1">Guards</p>
      {#each [...(state.guards?.values() ?? [])] as g}
        <p class="text-sm font-semibold capitalize
          {g.guardMode === 'chase' ? 'text-red-400' :
           g.guardMode === 'alert' ? 'text-yellow-400' : 'text-green-400'}">
          G{Number(g.id) + 1}: {g.guardMode}
        </p>
      {/each}
    </div>
  </div>
</div>
{/if}
