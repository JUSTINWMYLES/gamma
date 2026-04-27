<script lang="ts">
  /**
   * TV game component for "Escape A Maze" (registry-04).
   *
   * Renders the full maze on a canvas with player positions,
   * team indicators, escape animations, and a sidebar with timer/scores.
   *
   * Server messages listened:
   *   maze_mode, maze_generated, maze_teams, maze_positions,
   *   maze_team_positions, maze_player_escaped, maze_team_escaped, maze_timer
   */
  import { onMount, onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState } from "../../../../shared/types";
  import { getRoundProgressLabel } from "../../../../shared/types";
  import PlayerIcon from "../../components/PlayerIcon.svelte";

  export let room: Room;
  export let state: RoomState;

  // ── Constants ───────────────────────────────────────────────────

  const TILE_WALL = 0;
  const TILE_PATH = 1;
  const TILE_EXIT = 2;
  const TILE_START = 3;

  const PLAYER_COLORS = [
    "#6366f1", "#ec4899", "#f59e0b", "#10b981",
    "#3b82f6", "#ef4444", "#8b5cf6", "#14b8a6",
    "#f97316", "#06b6d4", "#a855f7", "#84cc16",
    "#e11d48", "#0ea5e9", "#d946ef", "#22c55e",
  ];

  const TEAM_COLORS = [
    "#6366f1", "#ec4899", "#f59e0b", "#10b981",
    "#3b82f6", "#ef4444", "#8b5cf6", "#14b8a6",
  ];

  // ── State ───────────────────────────────────────────────────────

  let gameMode: "individual" | "team" = "individual";
  let mazeWidth = 0;
  let mazeHeight = 0;
  let startX = 0;
  let startY = 0;
  let exitX = 0;
  let exitY = 0;
  let mazeTiles: number[] = [];

  // Individual mode
  let playerPositions: Array<{
    id: string;
    name: string;
    x: number;
    y: number;
    escaped: boolean;
  }> = [];

  // Team mode
  let teams: Array<{
    teamId: number;
    members: Array<{ id: string; name: string; direction: string }>;
  }> = [];
  let teamPositions: Array<{
    teamId: number;
    x: number;
    y: number;
    escaped: boolean;
  }> = [];

  // Escape events
  let escapeEvents: Array<{
    name: string;
    order: number;
    timeMs: number;
    isTeam: boolean;
  }> = [];

  // Timer
  let timeRemaining = 60000;
  let finishCount = 0;

  // Canvas
  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  let animFrame: number;

  // ── Message handlers ────────────────────────────────────────────

  onMount(() => {
    ctx = canvas.getContext("2d")!;
    animFrame = requestAnimationFrame(draw);

    room.onMessage("maze_mode", (msg) => {
      gameMode = msg.mode;
    });

    room.onMessage("maze_generated", (msg) => {
      mazeWidth = msg.width;
      mazeHeight = msg.height;
      startX = msg.startX;
      startY = msg.startY;
      exitX = msg.exitX;
      exitY = msg.exitY;
      escapeEvents = [];
      mazeTiles = Array.isArray(msg.tiles) ? msg.tiles : [];
    });

    room.onMessage("maze_teams", (msg) => {
      teams = msg.teams;
    });

    room.onMessage("maze_positions", (msg) => {
      playerPositions = msg.positions;
    });

    room.onMessage("maze_team_positions", (msg) => {
      teamPositions = msg.teams;
    });

    room.onMessage("maze_player_escaped", (msg) => {
      escapeEvents.push({
        name: msg.playerName,
        order: msg.order,
        timeMs: msg.timeMs,
        isTeam: false,
      });
      escapeEvents = escapeEvents;
    });

    room.onMessage("maze_team_escaped", (msg) => {
      escapeEvents.push({
        name: `Team ${msg.teamId + 1}`,
        order: msg.order,
        timeMs: msg.timeMs,
        isTeam: true,
      });
      escapeEvents = escapeEvents;
    });

    room.onMessage("maze_timer", (msg) => {
      timeRemaining = msg.timeRemaining;
      finishCount = msg.finishCount;
    });

    return () => {
      cancelAnimationFrame(animFrame);
    };
  });

  onDestroy(() => {
    cancelAnimationFrame(animFrame);
  });

  // ── Draw loop ───────────────────────────────────────────────────

  function draw() {
    animFrame = requestAnimationFrame(draw);
    if (!ctx || mazeWidth === 0) return;

    // Calculate tile size to fit the canvas
    const maxCanvasW = canvas.parentElement?.clientWidth ?? 800;
    const maxCanvasH = canvas.parentElement?.clientHeight ?? 600;
    const tileW = Math.floor(maxCanvasW / mazeWidth);
    const tileH = Math.floor(maxCanvasH / mazeHeight);
    const tileSize = Math.min(tileW, tileH, 32);

    const W = mazeWidth * tileSize;
    const H = mazeHeight * tileSize;
    canvas.width = W;
    canvas.height = H;

    // ── Draw tiles ──────────────────────────────────────────────

    for (let row = 0; row < mazeHeight; row++) {
      for (let col = 0; col < mazeWidth; col++) {
        const tile = mazeTiles[row * mazeWidth + col] ?? TILE_WALL;
        let fillColor = "#1a1a2e"; // wall

        if (tile === TILE_PATH) fillColor = "#24345f";
        else if (tile === TILE_START) fillColor = "#1a3a1a";
        else if (tile === TILE_EXIT) fillColor = "#3a1a1a";
        else fillColor = "#0f0f1a";

        ctx.fillStyle = fillColor;
        ctx.fillRect(col * tileSize, row * tileSize, tileSize, tileSize);

        // Grid lines
        if (tile !== TILE_WALL) {
          ctx.strokeStyle = "rgba(255,255,255,0.06)";
          ctx.strokeRect(col * tileSize, row * tileSize, tileSize, tileSize);
        }
      }
    }

    // ── Draw start marker ─────────────────────────────────────

    ctx.fillStyle = "rgba(34,197,94,0.3)";
    ctx.fillRect(startX * tileSize, startY * tileSize, tileSize, tileSize);
    ctx.fillStyle = "#22c55e";
    ctx.font = `bold ${Math.max(8, tileSize * 0.4)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("S", startX * tileSize + tileSize / 2, startY * tileSize + tileSize / 2);

    // ── Draw exit marker ──────────────────────────────────────

    const exitPulse = 0.5 + 0.5 * Math.sin(Date.now() / 300);
    ctx.fillStyle = `rgba(239,68,68,${0.2 + exitPulse * 0.3})`;
    ctx.fillRect(exitX * tileSize, exitY * tileSize, tileSize, tileSize);
    ctx.fillStyle = "#ef4444";
    ctx.font = `bold ${Math.max(8, tileSize * 0.4)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("EXIT", exitX * tileSize + tileSize / 2, exitY * tileSize + tileSize / 2);

    // ── Draw players (individual mode) ────────────────────────

    if (gameMode === "individual") {
      playerPositions.forEach((p, i) => {
        if (p.escaped) return; // Don't draw escaped players

        const px = p.x * tileSize + tileSize / 2;
        const py = p.y * tileSize + tileSize / 2;
        const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
        const radius = tileSize * 0.35;

        // Player circle
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Name
        ctx.fillStyle = "white";
        ctx.font = `bold ${Math.max(7, tileSize * 0.25)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(p.name.slice(0, 5), px, py - radius - 2);
      });
    }

    // ── Draw team avatars (team mode) ─────────────────────────

    if (gameMode === "team") {
      teamPositions.forEach((t) => {
        if (t.escaped) return;

        const px = t.x * tileSize + tileSize / 2;
        const py = t.y * tileSize + tileSize / 2;
        const color = TEAM_COLORS[t.teamId % TEAM_COLORS.length];
        const radius = tileSize * 0.4;

        // Team circle (slightly larger)
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = "white";
        ctx.lineWidth = 3;
        ctx.stroke();

        // Team label
        ctx.fillStyle = "white";
        ctx.font = `bold ${Math.max(8, tileSize * 0.35)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`T${t.teamId + 1}`, px, py);
      });
    }
  }

  // ── Derived values ──────────────────────────────────────────────

  $: timeLeftSecs = Math.ceil(timeRemaining / 1000);
</script>

<div class="flex-1 flex" data-testid="maze-tv">
  <!-- Canvas area -->
  <div class="flex-1 flex items-center justify-center p-4 overflow-hidden bg-gray-950">
    <canvas bind:this={canvas} class="rounded-xl shadow-2xl max-w-full max-h-full" />
  </div>

  <!-- Sidebar -->
  <div class="w-56 bg-gray-800 p-4 flex flex-col gap-4 flex-shrink-0">
    <!-- Timer -->
    <div class="text-center">
      <p class="text-xs text-gray-400 uppercase tracking-widest">Time</p>
      <p
        class="text-4xl font-black font-mono {timeLeftSecs < 10 ? 'text-red-400' : 'text-white'}"
      >{timeLeftSecs}</p>
      <p class="text-xs text-gray-400">
        {getRoundProgressLabel(state)}
      </p>
    </div>

    <!-- Mode badge -->
    <div class="text-center">
      <span class="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider
        {gameMode === 'team' ? 'bg-purple-900/60 text-purple-300' : 'bg-blue-900/60 text-blue-300'}">
        {gameMode === "team" ? "Team Mode" : "Individual"}
      </span>
    </div>

    <!-- Escape log -->
    <div>
      <p class="text-xs text-gray-400 uppercase tracking-widest mb-2">Escapes</p>
      {#if escapeEvents.length === 0}
        <p class="text-gray-600 text-xs italic">No one yet...</p>
      {:else}
        <ul class="space-y-1">
          {#each escapeEvents as evt}
            <li class="flex items-center gap-2 text-sm">
              <span class="w-5 text-center font-mono font-bold text-green-400">#{evt.order}</span>
              <span class="flex-1 truncate text-white">{evt.name}</span>
              <span class="text-xs text-gray-400 font-mono">{(evt.timeMs / 1000).toFixed(1)}s</span>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <!-- Player scores -->
    <div class="mt-auto">
      <p class="text-xs text-gray-400 uppercase tracking-widest mb-2">Scores</p>
      <ul class="space-y-1">
        {#each [...state.players.values()].sort((a, b) => b.score - a.score) as p, i}
          <li class="flex items-center gap-2 rounded px-2 py-1">
            <span
              class="w-3 h-3 rounded-full flex-shrink-0"
              style="background:{PLAYER_COLORS[i % PLAYER_COLORS.length]}"
            ></span>
            <PlayerIcon player={p} size={20} />
            <span class="flex-1 text-sm truncate text-white">{p.name}</span>
            <span class="text-xs font-mono text-gray-300">{p.score}</span>
          </li>
        {/each}
      </ul>
    </div>

    <!-- Team roster (team mode) -->
    {#if gameMode === "team" && teams.length > 0}
      <div>
        <p class="text-xs text-gray-400 uppercase tracking-widest mb-2">Teams</p>
        {#each teams as team}
          <div class="mb-2">
            <p class="text-xs font-bold" style="color:{TEAM_COLORS[team.teamId % TEAM_COLORS.length]}">
              Team {team.teamId + 1}
            </p>
            {#each team.members as m}
              <p class="text-xs text-gray-400 pl-2">
                {m.name} ({m.direction})
              </p>
            {/each}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
