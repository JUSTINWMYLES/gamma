/**
 * server/src/utils/tilemap.ts
 *
 * Fixed tile map definition for registry-14 "Don't Get Caught".
 *
 * Tile legend
 * ───────────
 *   0  floor  — walkable, open space
 *   1  wall   — blocks movement (guards ignore walls)
 *
 * The map layout is fixed so guard patrol/navigation can be deterministic.
 * Players cannot move through walls.
 */

import { TileMap, Vec2 } from "./los";

// ── Dimensions ────────────────────────────────────────────────────────────────

export const MAP_WIDTH  = 36;
export const MAP_HEIGHT = 24;

/** Tile IDs that block movement (players cannot enter). */
export const WALL_TILE_IDS = new Set<number>([1]);

/** No hiding spots in the new design — guards are relentless. */
export const HIDE_TILE_IDS = new Set<number>();

// ── Map generation ────────────────────────────────────────────────────────────

export interface GeneratedMap {
  tiles: number[];
  width: number;
  height: number;
  spawnPositions: Vec2[];
  patrolPath: Vec2[];
  guardStart: Vec2;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const FIXED_OBSTACLES: Rect[] = [
  { x: 4, y: 3, w: 4, h: 4 },
  { x: 13, y: 4, w: 5, h: 4 },
  { x: 23, y: 3, w: 4, h: 4 },
  { x: 30, y: 5, w: 3, h: 4 },
  { x: 7, y: 10, w: 5, h: 4 },
  { x: 17, y: 9, w: 4, h: 5 },
  { x: 25, y: 11, w: 5, h: 4 },
  { x: 4, y: 17, w: 4, h: 4 },
  { x: 14, y: 17, w: 5, h: 4 },
  { x: 24, y: 17, w: 4, h: 4 },
  { x: 30, y: 16, w: 3, h: 4 },
];

const FIXED_SPAWN_POSITIONS: Vec2[] = [
  { x: 2, y: 2 },
  { x: 10, y: 2 },
  { x: 20, y: 2 },
  { x: 28, y: 2 },
  { x: 33, y: 3 },
  { x: 2, y: 9 },
  { x: 14, y: 9 },
  { x: 22, y: 9 },
  { x: 33, y: 10 },
  { x: 2, y: 15 },
  { x: 13, y: 15 },
  { x: 22, y: 15 },
  { x: 33, y: 15 },
  { x: 10, y: 21 },
  { x: 20, y: 21 },
  { x: 28, y: 21 },
];

const FIXED_PATROL_PATH: Vec2[] = [
  { x: 2, y: 2 },
  { x: 10, y: 2 },
  { x: 20, y: 2 },
  { x: 28, y: 2 },
  { x: 33, y: 3 },
  { x: 33, y: 9 },
  { x: 30, y: 10 },
  { x: 22, y: 9 },
  { x: 14, y: 9 },
  { x: 9, y: 9 },
  { x: 2, y: 9 },
  { x: 2, y: 15 },
  { x: 10, y: 15 },
  { x: 15, y: 15 },
  { x: 22, y: 15 },
  { x: 30, y: 15 },
  { x: 33, y: 15 },
  { x: 33, y: 21 },
  { x: 28, y: 21 },
  { x: 20, y: 21 },
  { x: 10, y: 21 },
  { x: 2, y: 21 },
];

const FIXED_GUARD_START: Vec2 = { x: 18, y: 15 };

function buildFixedMapTiles(): number[] {
  const tiles = new Array<number>(MAP_WIDTH * MAP_HEIGHT).fill(0);

  const set = (col: number, row: number, tile: number) => {
    if (col < 0 || row < 0 || col >= MAP_WIDTH || row >= MAP_HEIGHT) return;
    tiles[row * MAP_WIDTH + col] = tile;
  };

  for (let col = 0; col < MAP_WIDTH; col++) {
    set(col, 0, 1);
    set(col, MAP_HEIGHT - 1, 1);
  }
  for (let row = 0; row < MAP_HEIGHT; row++) {
    set(0, row, 1);
    set(MAP_WIDTH - 1, row, 1);
  }

  for (const obstacle of FIXED_OBSTACLES) {
    for (let row = obstacle.y; row < obstacle.y + obstacle.h; row++) {
      for (let col = obstacle.x; col < obstacle.x + obstacle.w; col++) {
        set(col, row, 1);
      }
    }
  }

  return tiles;
}

function isTileWalkableIn(tiles: number[], col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= MAP_WIDTH || row >= MAP_HEIGHT) return false;
  return !WALL_TILE_IDS.has(tiles[row * MAP_WIDTH + col]);
}

/**
 * Build the fixed game map.
 *
 * The seed is accepted for API compatibility but ignored because the map is static.
 */
export function generateMap(_seed: number): GeneratedMap {
  const tiles = buildFixedMapTiles();

  for (const spawn of FIXED_SPAWN_POSITIONS) {
    if (!isTileWalkableIn(tiles, spawn.x, spawn.y)) {
      throw new Error(`Invalid fixed spawn position at (${spawn.x}, ${spawn.y})`);
    }
  }

  for (const waypoint of FIXED_PATROL_PATH) {
    if (!isTileWalkableIn(tiles, waypoint.x, waypoint.y)) {
      throw new Error(`Invalid fixed patrol waypoint at (${waypoint.x}, ${waypoint.y})`);
    }
  }

  if (!isTileWalkableIn(tiles, FIXED_GUARD_START.x, FIXED_GUARD_START.y)) {
    throw new Error(`Invalid fixed guard start at (${FIXED_GUARD_START.x}, ${FIXED_GUARD_START.y})`);
  }

  return {
    tiles,
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    spawnPositions: FIXED_SPAWN_POSITIONS.map((pos) => ({ ...pos })),
    patrolPath: FIXED_PATROL_PATH.map((pos) => ({ ...pos })),
    guardStart: { ...FIXED_GUARD_START },
  };
}

// ── Static exports (built from a fixed seed for determinism in tests) ─────────

/** The map generated for this game session. Re-seeded on each round start. */
let _currentMap: GeneratedMap = generateMap(42);

/** Regenerate the game map with a new seed. Called at the start of each game. */
export function resetMap(seed: number): void {
  _currentMap = generateMap(seed);
}

export const GAME_MAP: TileMap = {
  // Lazy proxy — reads from _currentMap at call time
  get width()  { return _currentMap.width; },
  get height() { return _currentMap.height; },
  get tiles()  { return _currentMap.tiles; },
  wallTileIds: WALL_TILE_IDS,
};

export function getPatrolPath(): Vec2[]    { return _currentMap.patrolPath; }
export function getSpawnPositions(): Vec2[] { return _currentMap.spawnPositions; }
export function getGuardStart(): Vec2       { return { ..._currentMap.guardStart }; }
export function getCurrentTiles(): number[] { return _currentMap.tiles; }

// Keep legacy named exports pointing at the live map for backward compat
export let PATROL_PATH: Vec2[] = _currentMap.patrolPath;
export let SPAWN_POSITIONS: Vec2[] = _currentMap.spawnPositions;
export let GUARD_START: Vec2 = _currentMap.guardStart;

/** Re-reads the live map and refreshes the legacy exports. Called after resetMap(). */
export function refreshLegacyExports(): void {
  PATROL_PATH = _currentMap.patrolPath;
  SPAWN_POSITIONS = _currentMap.spawnPositions;
  GUARD_START = { ..._currentMap.guardStart };
}

/**
 * Returns true when the tile at (col, row) is walkable by a player.
 */
export function isWalkable(col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= MAP_WIDTH || row >= MAP_HEIGHT) return false;
  return !WALL_TILE_IDS.has(_currentMap.tiles[row * MAP_WIDTH + col]);
}

/**
 * Returns true when the player on tile (col, row) is on a hiding spot.
 * In the new design there are no hiding spots, so always false.
 */
export function isHidingSpot(_col: number, _row: number): boolean {
  return false;
}

// ── BFS pathfinding for guard AI ─────────────────────────────────────────────

/**
 * BFS path from tile (sx, sy) to tile (gx, gy) on the current map.
 * Returns an array of tile-centre positions [{x, y}, ...] from start to goal
 * (excluding the start tile), or null if unreachable.
 *
 * This is used for guard pathfinding so they can route around walls instead of
 * getting stuck when axis-sliding fails.
 */
export function findPath(
  sx: number, sy: number,
  gx: number, gy: number,
  maxSteps: number = 200,
): Vec2[] | null {
  // Convert to tile coordinates
  const startCol = Math.floor(sx);
  const startRow = Math.floor(sy);
  const goalCol  = Math.floor(gx);
  const goalRow  = Math.floor(gy);

  if (startCol === goalCol && startRow === goalRow) return [];

  if (!isWalkable(goalCol, goalRow)) return null;

  const w = _currentMap.width;
  const h = _currentMap.height;

  // BFS
  const visited = new Uint8Array(w * h);
  const parentIdx = new Int32Array(w * h).fill(-1);
  const queue: number[] = [];

  const startKey = startRow * w + startCol;
  const goalKey  = goalRow  * w + goalCol;
  visited[startKey] = 1;
  queue.push(startKey);

  const dirs = [
    [0, -1], [0, 1], [-1, 0], [1, 0], // 4-directional
  ];

  let found = false;
  let steps = 0;
  let queueHead = 0;

  while (queueHead < queue.length && steps < maxSteps) {
    const current = queue[queueHead++];
    steps++;
    const cr = Math.floor(current / w);
    const cc = current % w;

    for (const [dc, dr] of dirs) {
      const nc = cc + dc;
      const nr = cr + dr;
      if (nc < 0 || nr < 0 || nc >= w || nr >= h) continue;
      const nk = nr * w + nc;
      if (visited[nk]) continue;
      if (!isWalkable(nc, nr)) continue;

      visited[nk] = 1;
      parentIdx[nk] = current;

      if (nk === goalKey) {
        found = true;
        break;
      }
      queue.push(nk);
    }
    if (found) break;
  }

  if (!found) return null;

  // Reconstruct path
  const path: Vec2[] = [];
  let cur = goalKey;
  while (cur !== startKey && cur !== -1) {
    const r = Math.floor(cur / w);
    const c = cur % w;
    path.push({ x: c + 0.5, y: r + 0.5 }); // tile centres
    cur = parentIdx[cur];
  }
  path.reverse();
  return path;
}
