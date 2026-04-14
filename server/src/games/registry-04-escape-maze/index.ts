/**
 * server/src/games/registry-04-escape-maze/index.ts
 *
 * "Escape A Maze" — Two game modes:
 *
 * Mode 1 — Individual Navigation
 * ──────────────────────────────
 * - Each player controls their own avatar on a shared maze.
 * - Maze is shown on the TV; phones have a D-pad / swipe UI.
 * - Players race to reach the exit within the time limit.
 * - Scoring based on order of finishing + time taken.
 *
 * Mode 2 — Team Shake (4 players per team)
 * ─────────────────────────────────────────
 * - Hosts can explicitly choose individual or team mode.
 * - Team mode only runs when motion-ready players can form full teams of 4.
 * - Otherwise the game falls back to individual mode.
 * - Each team of 4 shares a single avatar on the maze.
 * - Each team member is assigned a direction: UP, DOWN, LEFT, RIGHT.
 * - Shaking the phone sends a movement impulse in the assigned direction.
 * - Teams race to get their shared avatar to the exit.
 *
 * Maze Generation
 * ───────────────
 * - Recursive backtracker (DFS) algorithm, seeded for determinism.
 * - After the perfect maze is generated, a fraction of interior walls
 *   are removed to create loops and multiple routes from start to exit.
 *   This makes the maze feel more complex and gives players strategic
 *   choices about which way to go (WALL_REMOVAL_RATIO controls density).
 * - Maze is stored as a flat array of tiles (0 = wall, 1 = path, 2 = exit).
 * - Serialized to RoomState.mapTiles as JSON string.
 * - Start is always top-left area; exit is always bottom-right area.
 *
 * Lifecycle
 * ─────────
 * Uses standard BaseGame round loop. Each round generates a new maze.
 * Mode selection happens in onLoad() based on player count.
 */

import { Client } from "@colyseus/core";
import { BaseGame } from "../BaseGame";
import { buildBracket, advanceBracket, resolveHeat } from "../../utils/bracket";
import { Heat } from "../../schema/BracketState";

// ── Tile constants ────────────────────────────────────────────────────────────

const TILE_WALL = 0;
const TILE_PATH = 1;
const TILE_EXIT = 2;
const TILE_START = 3;

// ── Maze dimensions ───────────────────────────────────────────────────────────

/** Maze grid width (in cells — actual tile map is 2*W+1 wide). */
const MAZE_CELLS_W = 14;
/** Maze grid height (in cells — actual tile map is 2*H+1 tall). */
const MAZE_CELLS_H = 10;

/**
 * Fraction of interior walls to remove after DFS generation (0–1).
 * This creates loops / multiple routes through the maze, making it
 * feel less linear. ~0.15 gives noticeable alternative paths without
 * making the maze trivially open.
 */
const WALL_REMOVAL_RATIO = 0.15;

/** Actual tile dimensions. */
const MAP_W = MAZE_CELLS_W * 2 + 1;
const MAP_H = MAZE_CELLS_H * 2 + 1;

// ── Timing ────────────────────────────────────────────────────────────────────

/** Round duration in seconds. */
const ROUND_DURATION_SECS = 60;

/** Minimum time between accepted moves from one player/team (ms). */
const MOVE_DEBOUNCE_MS = 100;

/** How often to broadcast positions (ms). */
const SYNC_TICK_MS = 200;

/** How often to check for shake input in team mode (ms). */
const SHAKE_TICK_MS = 150;

/** Minimum interval between accepted shakes (ms). */
const SHAKE_DEBOUNCE_MS = 300;

// ── Scoring ───────────────────────────────────────────────────────────────────

/** Points for finishing (decreasing by finish order). */
const FINISH_POINTS = [1000, 700, 500, 350, 250, 200, 150, 120, 100, 80, 60, 50, 40, 30, 20, 10];

/** Bonus per second remaining on the clock when you escape. */
const TIME_BONUS_PER_SEC = 5;

/** Participation points (didn't escape but played). */
const PARTICIPATION_POINTS = 25;

// ── Direction enum ────────────────────────────────────────────────────────────

type Direction = "up" | "down" | "left" | "right";

const DIR_OFFSETS: Record<Direction, { dx: number; dy: number }> = {
  up:    { dx: 0,  dy: -1 },
  down:  { dx: 0,  dy: 1 },
  left:  { dx: -1, dy: 0 },
  right: { dx: 1,  dy: 0 },
};

// ── Seeded RNG ────────────────────────────────────────────────────────────────

function seededRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return (s >>> 0) / 0xffffffff;
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlayerPos {
  x: number; // tile-space x
  y: number; // tile-space y
  escaped: boolean;
  escapeOrder: number;
  escapeTimeMs: number;
  lastMoveAt: number;
}

interface TeamState {
  teamId: number;
  memberIds: string[]; // 4 session IDs
  roles: Map<string, Direction>; // sessionId → assigned direction
  pos: PlayerPos;
  lastShakeAt: Map<string, number>; // per-member debounce
}

interface MazeInput {
  action: "move" | "shake";
  direction?: Direction;
}

interface TilePoint {
  x: number;
  y: number;
}

// ── Game class ────────────────────────────────────────────────────────────────

export default class EscapeMazeGame extends BaseGame {
  static override requiresTV = false;
  static override supportsBracket = true;
  static override defaultRoundCount = 2;
  static override minRounds = 1;
  static override maxRounds = 5;
  static override hasInstructionsPhase = true;
  static override instructionsDelivery = "broadcast" as const;

  static override activityLevel: "none" | "some" | "full" = "some";
  static override requiresSameRoom = false;
  static override requiresSecondaryDisplay = false;

  /** "individual" or "team" — determined by player count. */
  private gameMode: "individual" | "team" = "individual";

  /** Per-player positions (individual mode). Key = sessionId. */
  private playerPositions: Map<string, PlayerPos> = new Map();

  /** Team state (team mode). */
  private teams: TeamState[] = [];

  /** Current maze tile data. */
  private mazeTiles: number[] = [];

  /** Start position (tile space). */
  private startPos = { x: 1, y: 1 };

  /** Exit position (tile space). */
  private exitPos = { x: MAP_W - 2, y: MAP_H - 2 };

  /** Finish counter for scoring order. */
  private finishCount = 0;

  /** Round start timestamp. */
  private roundStartMs = 0;

  /** Position sync interval. */
  private syncInterval: ReturnType<typeof setInterval> | null = null;

  /** Round timer interval. */
  private timerInterval: ReturnType<typeof setInterval> | null = null;

  /** Resolve to end the round early (all escaped). */
  private roundResolve: (() => void) | null = null;

  /** Extra timers for cleanup. */
  private _extraTimers: ReturnType<typeof setTimeout>[] = [];

  /** Seed for maze generation. */
  private mazeSeed = 0;

  /** Seed for bracket randomization. */
  private bracketSeed = 0;

  private configuredMode(): "individual" | "team" {
    return this.room.state.gameConfig.gameMode === "team" ? "team" : "individual";
  }

  private _motionReadyPlayers() {
    return this._activePlayers().filter((p) => this.hasMotionPermission(p));
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  protected override async onLoad(): Promise<void> {
    // Reset player state
    for (const p of this.room.state.players.values()) {
      p.score = 0;
      p.isReady = false;
      p.isEliminated = false;
    }

    this.mazeSeed = Date.now();
    this.bracketSeed = Date.now();

    const isBracket = this.room.state.gameConfig.matchMode === "1v1_bracket";
    const desiredMode = this.configuredMode();

    // Bracket mode forces individual mode (no teams)
    if (isBracket) {
      this.gameMode = "individual";

      const playerIds = this._activePlayers().map((p) => p.id);
      const heatSize = playerIds.length <= 6 ? 2 : 3;
      const bracket = buildBracket(playerIds, this.bracketSeed, { heatSize, advanceCount: 1 });
      this.room.state.bracket = bracket;
    } else {
      const motionReadyCount = this._motionReadyPlayers().length;
      if (desiredMode === "team" && motionReadyCount >= 4 && motionReadyCount % 4 === 0) {
        this.gameMode = "team";
      } else {
        this.gameMode = "individual";
      }
    }

    this.broadcast("maze_mode", {
      mode: this.gameMode,
      playerCount: this._activePlayers().length,
      motionReadyCount: this._motionReadyPlayers().length,
    });
  }

  /**
   * Override runRounds for bracket mode.
   * Each bracket round plays a maze round; escape order determines heat ranking.
   * Bracket forces individual mode.
   */
  protected override async runRounds(): Promise<void> {
    if (this.room.state.gameConfig.matchMode !== "1v1_bracket") {
      return super.runRounds();
    }

    const bracket = this.room.state.bracket;

    if (this.hasPracticeRound()) {
      await this._runBracketPracticeRound();
    }

    this.broadcast("bracket_init", {
      totalPlayers: this._activePlayers().length,
      heatSize: bracket.heatSize,
    });

    let bracketRoundNum = 0;

    while (true) {
      const currentBracketRound = bracket.rounds[bracket.currentRound];
      if (!currentBracketRound) break;

      const pendingHeats = currentBracketRound.heats.filter(
        (h: Heat) => h.status !== "complete",
      );

      if (pendingHeats.length === 0) {
        const advancers: string[] = [];
        for (const h of currentBracketRound.heats) {
          for (const aid of h.advancingIds) {
            if (aid) advancers.push(aid);
          }
        }

        if (advancers.length <= 1) break;

        for (const p of this.room.state.players.values()) {
          if (!p.isEliminated && !advancers.includes(p.id)) {
            p.isEliminated = true;
          }
        }

        advanceBracket(bracket, this.bracketSeed);

        this.broadcast("bracket_round_advance", {
          newRound: bracket.currentRound + 1,
          remainingPlayers: advancers.length,
        });

        await this.delay(3000);
        continue;
      }

      bracketRoundNum++;
      this.room.state.currentRound = bracketRoundNum;

      this.broadcast("bracket_heat_round", {
        bracketRound: bracket.currentRound + 1,
        heats: ([...currentBracketRound.heats] as Heat[]).map((h) => ({
          id: h.id,
          playerIds: [...h.playerIds],
          status: h.status,
        })),
      });

      for (const h of pendingHeats) {
        h.status = "in_progress";
      }

      this.setPhase("countdown");
      await this.delay(3000);

      this.setPhase("in_round");
      this.room.state.phaseStartedAt = Date.now();
      await this.delay(500);

      await this.runRound(bracketRoundNum);
      this.scoreRound(bracketRoundNum);

      // Resolve heats: rank by escape order, then distance to exit for non-escapers
      for (const heat of pendingHeats) {
        const heatPlayerIds = [...heat.playerIds].filter((id): id is string => !!id);
        const ranked = this._rankPlayersForBracket(heatPlayerIds);

        if (ranked.length > 0) {
          const advanceCount = bracket.advanceCount;
          const advancing = ranked.slice(0, advanceCount).map((r) => r.playerId);
          resolveHeat(heat, advancing);
        } else {
          heat.status = "complete";
        }
      }

      this.setPhase("round_end");
      await this.delay(4000);
    }

    const finalRound = bracket.rounds[bracket.currentRound];
    if (finalRound) {
      const champion = finalRound.heats[0]?.advancingIds[0];
      if (champion) {
        const champPlayer = this.room.state.players.get(champion);
        this.broadcast("bracket_champion", {
          championId: champion,
          championName: champPlayer?.name ?? "Unknown",
        });
      }
    }

    this.room.state.isPracticeRound = false;
    this.setPhase("scoreboard");
    await this.delay(6000);
  }

  protected override async runRound(round: number): Promise<void> {
    this.finishCount = 0;
    this.roundStartMs = Date.now();

    // Generate a new maze for this round
    const roundSeed = this.mazeSeed + round * 7919;
    this._generateMaze(roundSeed);

    // Set map data on room state (for TV rendering)
    this.room.state.mapTiles = JSON.stringify(this.mazeTiles);
    this.room.state.mapWidth = MAP_W;
    this.room.state.mapHeight = MAP_H;
    this.room.state.roundDurationSecs = ROUND_DURATION_SECS;

    if (this.gameMode === "individual") {
      await this._runIndividualRound(round);
    } else {
      await this._runTeamRound(round);
    }

    // Clean up intervals
    this._clearIntervals();
  }

  protected override scoreRound(_round: number): void {
    if (this.gameMode === "individual") {
      this._scoreIndividual();
    } else {
      this._scoreTeam();
    }
  }

  private async _runBracketPracticeRound(): Promise<void> {
    this.room.state.currentRound = 0;
    this.room.state.isPracticeRound = true;

    this.setPhase("countdown");
    await this.delay(3000);

    this.setPhase("in_round");
    this.room.state.phaseStartedAt = Date.now();
    await this.delay(500);

    await this.runRound(1);

    this.setPhase("round_end");
    await this.delay(4000);

    this.room.state.isPracticeRound = false;
  }

  override handleInput(client: Client, data: unknown): void {
    const input = data as MazeInput;
    if (!input) return;

    if (this.gameMode === "individual" && input.action === "move") {
      this._handleIndividualMove(client.sessionId, input.direction);
    } else if (this.gameMode === "team" && input.action === "shake") {
      this._handleTeamShake(client.sessionId);
    }
  }

  override teardown(): void {
    super.teardown();
    this._clearIntervals();
    for (const t of this._extraTimers) clearTimeout(t);
    this._extraTimers = [];
    this.playerPositions.clear();
    this.teams = [];
    this.roundResolve = null;
  }

  // ── Maze generation ───────────────────────────────────────────────────────

  /**
   * Generate a maze using recursive backtracker (DFS) algorithm.
   * The maze grid is MAZE_CELLS_W x MAZE_CELLS_H cells.
   * Each cell maps to a 2x2 block in tile space plus walls between them,
   * giving a (2*W+1) x (2*H+1) tile map.
   */
  private _generateMaze(seed: number): void {
    const rng = seededRng(seed);
    const w = MAZE_CELLS_W;
    const h = MAZE_CELLS_H;
    const totalTiles = MAP_W * MAP_H;

    // Initialize all tiles as walls
    this.mazeTiles = new Array(totalTiles).fill(TILE_WALL);

    // visited[row][col] for the cell grid
    const visited: boolean[][] = Array.from({ length: h }, () =>
      new Array(w).fill(false),
    );

    // Stack-based DFS (non-recursive to avoid stack overflow)
    const stack: [number, number][] = [];
    const startCellX = 0;
    const startCellY = 0;

    visited[startCellY][startCellX] = true;
    this._carveCell(startCellX, startCellY);
    stack.push([startCellX, startCellY]);

    while (stack.length > 0) {
      const [cx, cy] = stack[stack.length - 1];

      // Get unvisited neighbors
      const neighbors: [number, number, number, number][] = []; // nx, ny, wallTileX, wallTileY
      // Up
      if (cy > 0 && !visited[cy - 1][cx]) {
        neighbors.push([cx, cy - 1, cx * 2 + 1, (cy - 1) * 2 + 2]);
      }
      // Down
      if (cy < h - 1 && !visited[cy + 1][cx]) {
        neighbors.push([cx, cy + 1, cx * 2 + 1, cy * 2 + 2]);
      }
      // Left
      if (cx > 0 && !visited[cy][cx - 1]) {
        neighbors.push([cx - 1, cy, (cx - 1) * 2 + 2, cy * 2 + 1]);
      }
      // Right
      if (cx < w - 1 && !visited[cy][cx + 1]) {
        neighbors.push([cx + 1, cy, cx * 2 + 2, cy * 2 + 1]);
      }

      if (neighbors.length > 0) {
        // Pick a random neighbor
        const idx = Math.floor(rng() * neighbors.length);
        const [nx, ny, wallX, wallY] = neighbors[idx];

        // Remove wall between current and neighbor
        this.mazeTiles[wallY * MAP_W + wallX] = TILE_PATH;

        // Mark neighbor as visited and carve it
        visited[ny][nx] = true;
        this._carveCell(nx, ny);
        stack.push([nx, ny]);
      } else {
        // Backtrack
        stack.pop();
      }
    }

    // Set start position (top-left cell center)
    this.startPos = { x: 1, y: 1 };

    // Set exit position (bottom-right cell center)
    this.exitPos = { x: (w - 1) * 2 + 1, y: (h - 1) * 2 + 1 };

    // ── Create loops by removing interior walls ──────────────────
    // A perfect DFS maze has exactly one path between any two cells.
    // Removing some interior walls creates loops / alternative routes,
    // making the maze feel more complex and giving players choices.
    const baselinePath = this._findMazePath(this.startPos, this.exitPos);
    this._removeExtraWalls(rng, w, h);
    this._ensureAlternateRoute(baselinePath, rng);

    this.mazeTiles[this.startPos.y * MAP_W + this.startPos.x] = TILE_START;
    this.mazeTiles[this.exitPos.y * MAP_W + this.exitPos.x] = TILE_EXIT;

    // Broadcast maze info
    this.broadcast("maze_generated", {
      width: MAP_W,
      height: MAP_H,
      startX: this.startPos.x,
      startY: this.startPos.y,
      exitX: this.exitPos.x,
      exitY: this.exitPos.y,
      tiles: [...this.mazeTiles],
    });
  }

  /** Carve a cell in the tile map (set its center tile to PATH). */
  private _carveCell(cellX: number, cellY: number): void {
    const tileX = cellX * 2 + 1;
    const tileY = cellY * 2 + 1;
    this.mazeTiles[tileY * MAP_W + tileX] = TILE_PATH;
  }

  /**
   * Remove a fraction of interior walls to create loops.
   *
   * We identify all interior wall tiles that sit between two path cells
   * (horizontally or vertically). These are candidate walls whose removal
   * creates an alternative route. We shuffle them and remove
   * WALL_REMOVAL_RATIO of them, converting them to TILE_PATH.
   */
  private _removeExtraWalls(rng: () => number, w: number, h: number): void {
    // Collect candidate walls: interior wall tiles between two carved cells.
    // In the tile map, cell centers are at odd coordinates (2*cx+1, 2*cy+1).
    // Walls between horizontally adjacent cells are at (2*cx+2, 2*cy+1).
    // Walls between vertically adjacent cells are at (2*cx+1, 2*cy+2).
    const candidates: number[] = []; // flat indices into mazeTiles

    // Horizontal walls: between cell (cx, cy) and (cx+1, cy)
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w - 1; cx++) {
        const wallTileX = cx * 2 + 2;
        const wallTileY = cy * 2 + 1;
        const idx = wallTileY * MAP_W + wallTileX;
        if (this.mazeTiles[idx] === TILE_WALL) {
          candidates.push(idx);
        }
      }
    }

    // Vertical walls: between cell (cx, cy) and (cx, cy+1)
    for (let cy = 0; cy < h - 1; cy++) {
      for (let cx = 0; cx < w; cx++) {
        const wallTileX = cx * 2 + 1;
        const wallTileY = cy * 2 + 2;
        const idx = wallTileY * MAP_W + wallTileX;
        if (this.mazeTiles[idx] === TILE_WALL) {
          candidates.push(idx);
        }
      }
    }

    // Fisher-Yates shuffle using the seeded RNG
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    // Remove a fraction of the candidate walls
    const removeCount = Math.floor(candidates.length * WALL_REMOVAL_RATIO);
    for (let i = 0; i < removeCount; i++) {
      this.mazeTiles[candidates[i]] = TILE_PATH;
    }
  }

  private _ensureAlternateRoute(path: TilePoint[], rng: () => number): void {
    if (path.length < 12) return;

    let bestPair: { from: TilePoint; to: TilePoint } | null = null;
    let bestScore = -Infinity;

    for (let i = 2; i < path.length - 6; i++) {
      for (let j = i + 6; j < path.length - 2; j++) {
        const from = path[i];
        const to = path[j];
        const manhattan = Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
        if (manhattan < 2 || manhattan > 8) continue;

        const score = (j - i) - manhattan;
        if (score > bestScore) {
          bestScore = score;
          bestPair = { from, to };
        }
      }
    }

    if (bestPair) {
      this._carveShortcut(bestPair.from, bestPair.to, rng);
      return;
    }

    const startIndex = Math.max(1, Math.floor(path.length * 0.2));
    const endIndex = Math.min(path.length - 2, Math.floor(path.length * 0.75));
    this._carveShortcut(path[startIndex], path[endIndex], rng);
  }

  private _carveShortcut(from: TilePoint, to: TilePoint, rng: () => number): void {
    const horizontalFirst = rng() >= 0.5;
    if (horizontalFirst) {
      this._carveLine(from.x, from.y, to.x, from.y);
      this._carveLine(to.x, from.y, to.x, to.y);
    } else {
      this._carveLine(from.x, from.y, from.x, to.y);
      this._carveLine(from.x, to.y, to.x, to.y);
    }
  }

  private _carveLine(fromX: number, fromY: number, toX: number, toY: number): void {
    const stepX = Math.sign(toX - fromX);
    const stepY = Math.sign(toY - fromY);
    let x = fromX;
    let y = fromY;

    this._setWalkableTile(x, y);
    while (x !== toX || y !== toY) {
      if (x !== toX) x += stepX;
      else if (y !== toY) y += stepY;
      this._setWalkableTile(x, y);
    }
  }

  private _setWalkableTile(x: number, y: number): void {
    if (x <= 0 || y <= 0 || x >= MAP_W - 1 || y >= MAP_H - 1) return;
    this.mazeTiles[y * MAP_W + x] = TILE_PATH;
  }

  private _findMazePath(start: TilePoint, goal: TilePoint): TilePoint[] {
    const queue: TilePoint[] = [start];
    const visited = new Set<string>([`${start.x},${start.y}`]);
    const parent = new Map<string, string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.x === goal.x && current.y === goal.y) {
        const path: TilePoint[] = [];
        let key = `${goal.x},${goal.y}`;
        while (key) {
          const [x, y] = key.split(",").map(Number);
          path.push({ x, y });
          key = parent.get(key) ?? "";
        }
        return path.reverse();
      }

      for (const { dx, dy } of Object.values(DIR_OFFSETS)) {
        const nx = current.x + dx;
        const ny = current.y + dy;
        if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
        if (this.mazeTiles[ny * MAP_W + nx] === TILE_WALL) continue;

        const key = `${nx},${ny}`;
        if (visited.has(key)) continue;
        visited.add(key);
        parent.set(key, `${current.x},${current.y}`);
        queue.push({ x: nx, y: ny });
      }
    }

    return [];
  }

  // ── Individual mode ───────────────────────────────────────────────────────

  private async _runIndividualRound(_round: number): Promise<void> {
    const players = this._activePlayers();

    // Initialize player positions at start
    this.playerPositions.clear();
    for (const p of players) {
      this.playerPositions.set(p.id, {
        x: this.startPos.x,
        y: this.startPos.y,
        escaped: false,
        escapeOrder: 0,
        escapeTimeMs: 0,
        lastMoveAt: 0,
      });

      // Update replicated player state
      p.x = this.startPos.x;
      p.y = this.startPos.y;
    }

    // Send each player their role info
    for (const p of players) {
      this.send(p.id, "maze_role", {
        mode: "individual",
        controlType: "dpad", // phone shows a D-pad
      });
    }

    // Broadcast initial positions
    this._broadcastPositions();

    // Start sync and timer intervals
    this.syncInterval = setInterval(() => this._broadcastPositions(), SYNC_TICK_MS);
    this.timerInterval = setInterval(() => this._timerTick(), 250);

    // Wait for round to end (all escaped or time runs out)
    await new Promise<void>((resolve) => {
      this.roundResolve = resolve;
      const timeout = setTimeout(() => {
        this._endRound();
      }, ROUND_DURATION_SECS * 1000);
      this._extraTimers.push(timeout);
    });
  }

  private _handleIndividualMove(sessionId: string, direction?: Direction): void {
    if (!direction || !DIR_OFFSETS[direction]) return;

    const pos = this.playerPositions.get(sessionId);
    if (!pos || pos.escaped) return;

    const now = Date.now();
    if (now - pos.lastMoveAt < MOVE_DEBOUNCE_MS) return;

    const { dx, dy } = DIR_OFFSETS[direction];
    const newX = pos.x + dx;
    const newY = pos.y + dy;

    // Bounds check
    if (newX < 0 || newX >= MAP_W || newY < 0 || newY >= MAP_H) return;

    // Wall check
    const tile = this.mazeTiles[newY * MAP_W + newX];
    if (tile === TILE_WALL) {
      this.send(sessionId, "maze_wall_bump", { direction });
      return;
    }

    // Apply movement
    pos.x = newX;
    pos.y = newY;
    pos.lastMoveAt = now;

    // Update replicated state
    const player = this.room.state.players.get(sessionId);
    if (player) {
      player.x = newX;
      player.y = newY;
    }

    // Send move confirmation
    this.send(sessionId, "maze_move_ok", { x: newX, y: newY });

    // Check for exit
    if (tile === TILE_EXIT) {
      this._playerEscaped(sessionId);
    }
  }

  private _playerEscaped(sessionId: string): void {
    const pos = this.playerPositions.get(sessionId);
    if (!pos || pos.escaped) return;

    this.finishCount++;
    pos.escaped = true;
    pos.escapeOrder = this.finishCount;
    pos.escapeTimeMs = Date.now() - this.roundStartMs;

    const player = this.room.state.players.get(sessionId);
    this.broadcast("maze_player_escaped", {
      playerId: sessionId,
      playerName: player?.name ?? "Unknown",
      order: this.finishCount,
      timeMs: pos.escapeTimeMs,
    });

    this.send(sessionId, "maze_you_escaped", {
      order: this.finishCount,
      timeMs: pos.escapeTimeMs,
    });

    // Check if all players have escaped
    const allEscaped = [...this.playerPositions.values()].every((p) => p.escaped);
    if (allEscaped) {
      this._endRound();
    }
  }

  private _scoreIndividual(): void {
    for (const [sessionId, pos] of this.playerPositions.entries()) {
      const player = this.room.state.players.get(sessionId);
      if (!player) continue;

      if (pos.escaped) {
        // Points by finish order
        const orderPoints = FINISH_POINTS[pos.escapeOrder - 1] ?? 10;
        // Time bonus
        const secsRemaining = Math.max(0, ROUND_DURATION_SECS - pos.escapeTimeMs / 1000);
        const timeBonus = Math.floor(secsRemaining * TIME_BONUS_PER_SEC);
        player.score += orderPoints + timeBonus;
      } else {
        // Participation points
        player.score += PARTICIPATION_POINTS;
      }
    }
  }

  // ── Team mode ─────────────────────────────────────────────────────────────

  private async _runTeamRound(_round: number): Promise<void> {
    const players = this._motionReadyPlayers();
    const teamCount = Math.floor(players.length / 4);

    // Shuffle players and split into teams of 4
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    this.teams = [];

    const directions: Direction[] = ["up", "down", "left", "right"];

    for (let t = 0; t < teamCount; t++) {
      const members = shuffled.slice(t * 4, t * 4 + 4);
      const roles = new Map<string, Direction>();
      const lastShakeAt = new Map<string, number>();

      members.forEach((m, i) => {
        roles.set(m.id, directions[i]);
        lastShakeAt.set(m.id, 0);
      });

      const team: TeamState = {
        teamId: t,
        memberIds: members.map((m) => m.id),
        roles,
        pos: {
          x: this.startPos.x,
          y: this.startPos.y,
          escaped: false,
          escapeOrder: 0,
          escapeTimeMs: 0,
          lastMoveAt: 0,
        },
        lastShakeAt,
      };

      this.teams.push(team);

      // Send each member their role
      for (const m of members) {
        this.send(m.id, "maze_role", {
          mode: "team",
          teamId: t,
          direction: roles.get(m.id),
          teamMembers: members.map((p) => ({
            id: p.id,
            name: p.name,
            direction: roles.get(p.id),
          })),
        });
      }
    }

    // Broadcast team setup
    this.broadcast("maze_teams", {
      teams: this.teams.map((t) => ({
        teamId: t.teamId,
        members: t.memberIds.map((id) => {
          const p = this.room.state.players.get(id);
          return {
            id,
            name: p?.name ?? "Unknown",
            direction: t.roles.get(id),
          };
        }),
      })),
    });

    // Broadcast initial positions
    this._broadcastTeamPositions();

    // Start sync interval
    this.syncInterval = setInterval(() => this._broadcastTeamPositions(), SYNC_TICK_MS);
    this.timerInterval = setInterval(() => this._timerTick(), 250);

    // Wait for round to end
    await new Promise<void>((resolve) => {
      this.roundResolve = resolve;
      const timeout = setTimeout(() => {
        this._endRound();
      }, ROUND_DURATION_SECS * 1000);
      this._extraTimers.push(timeout);
    });
  }

  private _handleTeamShake(sessionId: string): void {
    const player = this.room.state.players.get(sessionId);
    if (!this.hasMotionPermission(player)) return;

    // Find which team this player belongs to
    const team = this.teams.find((t) => t.memberIds.includes(sessionId));
    if (!team || team.pos.escaped) return;

    const now = Date.now();
    const lastShake = team.lastShakeAt.get(sessionId) ?? 0;
    if (now - lastShake < SHAKE_DEBOUNCE_MS) return;
    team.lastShakeAt.set(sessionId, now);

    // Get this player's assigned direction
    const direction = team.roles.get(sessionId);
    if (!direction) return;

    // Debounce team movement
    if (now - team.pos.lastMoveAt < MOVE_DEBOUNCE_MS) return;

    const { dx, dy } = DIR_OFFSETS[direction];
    const newX = team.pos.x + dx;
    const newY = team.pos.y + dy;

    // Bounds check
    if (newX < 0 || newX >= MAP_W || newY < 0 || newY >= MAP_H) return;

    // Wall check
    const tile = this.mazeTiles[newY * MAP_W + newX];
    if (tile === TILE_WALL) {
      // Send feedback: wall bump
      this.send(sessionId, "maze_wall_bump", { direction });
      return;
    }

    // Apply movement
    team.pos.x = newX;
    team.pos.y = newY;
    team.pos.lastMoveAt = now;

    // Broadcast to team
    for (const mid of team.memberIds) {
      this.send(mid, "maze_team_moved", {
        teamId: team.teamId,
        x: newX,
        y: newY,
        movedBy: sessionId,
        direction,
      });
    }

    // Check for exit
    if (tile === TILE_EXIT) {
      this._teamEscaped(team);
    }
  }

  private _teamEscaped(team: TeamState): void {
    if (team.pos.escaped) return;

    this.finishCount++;
    team.pos.escaped = true;
    team.pos.escapeOrder = this.finishCount;
    team.pos.escapeTimeMs = Date.now() - this.roundStartMs;

    const memberNames = team.memberIds.map((id) => {
      const p = this.room.state.players.get(id);
      return p?.name ?? "Unknown";
    });

    this.broadcast("maze_team_escaped", {
      teamId: team.teamId,
      memberNames,
      order: this.finishCount,
      timeMs: team.pos.escapeTimeMs,
    });

    // Notify each team member
    for (const mid of team.memberIds) {
      this.send(mid, "maze_you_escaped", {
        order: this.finishCount,
        timeMs: team.pos.escapeTimeMs,
      });
    }

    // Check if all teams escaped
    const allEscaped = this.teams.every((t) => t.pos.escaped);
    if (allEscaped) {
      this._endRound();
    }
  }

  private _scoreTeam(): void {
    for (const team of this.teams) {
      for (const memberId of team.memberIds) {
        const player = this.room.state.players.get(memberId);
        if (!player) continue;

        if (team.pos.escaped) {
          const orderPoints = FINISH_POINTS[team.pos.escapeOrder - 1] ?? 10;
          const secsRemaining = Math.max(0, ROUND_DURATION_SECS - team.pos.escapeTimeMs / 1000);
          const timeBonus = Math.floor(secsRemaining * TIME_BONUS_PER_SEC);
          player.score += orderPoints + timeBonus;
        } else {
          player.score += PARTICIPATION_POINTS;
        }
      }
    }
  }

  // ── Broadcasting ──────────────────────────────────────────────────────────

  private _broadcastPositions(): void {
    const positions: Array<{
      id: string;
      name: string;
      x: number;
      y: number;
      escaped: boolean;
    }> = [];

    for (const [sessionId, pos] of this.playerPositions.entries()) {
      const player = this.room.state.players.get(sessionId);
      positions.push({
        id: sessionId,
        name: player?.name ?? "Unknown",
        x: pos.x,
        y: pos.y,
        escaped: pos.escaped,
      });
    }

    this.broadcast("maze_positions", { positions });
  }

  private _broadcastTeamPositions(): void {
    const teams = this.teams.map((t) => ({
      teamId: t.teamId,
      x: t.pos.x,
      y: t.pos.y,
      escaped: t.pos.escaped,
    }));

    this.broadcast("maze_team_positions", { teams });
  }

  private _timerTick(): void {
    const elapsed = Date.now() - this.roundStartMs;
    const remaining = Math.max(0, ROUND_DURATION_SECS * 1000 - elapsed);

    this.broadcast("maze_timer", {
      timeRemaining: remaining,
      finishCount: this.finishCount,
    });
  }

  // ── Round end ─────────────────────────────────────────────────────────────

  private _endRound(): void {
    this._clearIntervals();
    if (this.roundResolve) {
      this.roundResolve();
      this.roundResolve = null;
    }
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  private _activePlayers() {
    return [...this.room.state.players.values()].filter(
      (p) => this.isPlayerActive(p),
    );
  }

  /**
   * Rank players within a heat by maze performance.
   * Escaped players rank first (by escape order), then non-escaped players
   * by distance to exit (closer = better rank).
   */
  private _rankPlayersForBracket(
    playerIds: string[],
  ): { playerId: string; rank: number }[] {
    const results = playerIds.map((pid) => {
      const pos = this.playerPositions.get(pid);
      const dx = (pos?.x ?? 0) - this.exitPos.x;
      const dy = (pos?.y ?? 0) - this.exitPos.y;
      return {
        playerId: pid,
        escaped: pos?.escaped ?? false,
        escapeOrder: pos?.escapeOrder ?? Infinity,
        distToExit: Math.sqrt(dx * dx + dy * dy),
      };
    });

    results.sort((a, b) => {
      // Escaped players first, by escape order
      if (a.escaped !== b.escaped) return a.escaped ? -1 : 1;
      if (a.escaped && b.escaped) return a.escapeOrder - b.escapeOrder;
      // Non-escaped: closer to exit is better
      return a.distToExit - b.distToExit;
    });

    return results.map((r, i) => ({ playerId: r.playerId, rank: i + 1 }));
  }

  private _clearIntervals(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }
}
