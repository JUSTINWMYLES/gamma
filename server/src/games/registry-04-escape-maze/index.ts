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
 * - When playerCount is divisible by 4 (4, 8, 12, 16, 20), team mode activates.
 * - Otherwise falls back to individual mode.
 * - Each team of 4 shares a single avatar on the maze.
 * - Each team member is assigned a direction: UP, DOWN, LEFT, RIGHT.
 * - Shaking the phone sends a movement impulse in the assigned direction.
 * - Teams race to get their shared avatar to the exit.
 *
 * Maze Generation
 * ───────────────
 * - Recursive backtracker (DFS) algorithm, seeded for determinism.
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

// ── Tile constants ────────────────────────────────────────────────────────────

const TILE_WALL = 0;
const TILE_PATH = 1;
const TILE_EXIT = 2;
const TILE_START = 3;

// ── Maze dimensions ───────────────────────────────────────────────────────────

/** Maze grid width (in cells — actual tile map is 2*W+1 wide). */
const MAZE_CELLS_W = 12;
/** Maze grid height (in cells — actual tile map is 2*H+1 tall). */
const MAZE_CELLS_H = 8;

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

// ── Game class ────────────────────────────────────────────────────────────────

export default class EscapeMazeGame extends BaseGame {
  static override requiresTV = false;
  static override supportsBracket = false;
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

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  protected override async onLoad(): Promise<void> {
    // Reset player state
    for (const p of this.room.state.players.values()) {
      p.score = 0;
      p.isReady = false;
      p.isEliminated = false;
    }

    this.mazeSeed = Date.now();

    // Determine game mode based on player count
    const playerCount = this._activePlayers().length;
    if (playerCount >= 4 && playerCount % 4 === 0) {
      this.gameMode = "team";
    } else {
      this.gameMode = "individual";
    }

    this.broadcast("maze_mode", {
      mode: this.gameMode,
      playerCount,
    });
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
    this.mazeTiles[this.startPos.y * MAP_W + this.startPos.x] = TILE_START;

    // Set exit position (bottom-right cell center)
    this.exitPos = { x: (w - 1) * 2 + 1, y: (h - 1) * 2 + 1 };
    this.mazeTiles[this.exitPos.y * MAP_W + this.exitPos.x] = TILE_EXIT;

    // Broadcast maze info
    this.broadcast("maze_generated", {
      width: MAP_W,
      height: MAP_H,
      startX: this.startPos.x,
      startY: this.startPos.y,
      exitX: this.exitPos.x,
      exitY: this.exitPos.y,
    });
  }

  /** Carve a cell in the tile map (set its center tile to PATH). */
  private _carveCell(cellX: number, cellY: number): void {
    const tileX = cellX * 2 + 1;
    const tileY = cellY * 2 + 1;
    this.mazeTiles[tileY * MAP_W + tileX] = TILE_PATH;
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
    if (tile === TILE_WALL) return;

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
    const players = this._activePlayers();
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
      (p) => p.isConnected && !p.isEliminated,
    );
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
