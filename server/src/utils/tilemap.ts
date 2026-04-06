/**
 * server/src/utils/tilemap.ts
 *
 * Procedural tile map generator for registry-14 "Don't Get Caught".
 *
 * Tile legend
 * ───────────
 *   0  floor  — walkable, open space
 *   1  wall   — blocks movement (guards ignore walls)
 *
 * The map is generated fresh each game via generateMap().
 * Guards are supernatural — they move through walls.
 * Players cannot move through walls.
 *
 * Map layout algorithm
 * ────────────────────
 * 1. Fill with walls
 * 2. Carve a grid of rooms (variable size) with corridors connecting them
 * 3. Enforce a 1-tile wall border around the whole map
 * 4. Validate spawn + patrol positions are walkable
 */

import { TileMap, Vec2 } from "./los";
import { seededRng } from "./rng";

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

/**
 * Procedurally generate a tile map.
 *
 * @param seed  Random seed — same seed → same map.
 */
export function generateMap(seed: number): GeneratedMap {
  const rng = seededRng(seed);
  const tiles = new Array<number>(MAP_WIDTH * MAP_HEIGHT).fill(1); // all walls

  function set(col: number, row: number, tile: number) {
    if (col < 0 || row < 0 || col >= MAP_WIDTH || row >= MAP_HEIGHT) return;
    tiles[row * MAP_WIDTH + col] = tile;
  }

  function get(col: number, row: number): number {
    if (col < 0 || row < 0 || col >= MAP_WIDTH || row >= MAP_HEIGHT) return 1;
    return tiles[row * MAP_WIDTH + col];
  }

  // Carve rooms: 5-col × 4-row grid of rooms, each variable size
  // leaving 1-tile wall corridors between them
  const ROOM_COLS = 5;
  const ROOM_ROWS = 4;
  type Room = { x: number; y: number; w: number; h: number };
  const rooms: Room[] = [];

  // Available interior: cols 1..MAP_WIDTH-2, rows 1..MAP_HEIGHT-2
  const interiorW = MAP_WIDTH  - 2;
  const interiorH = MAP_HEIGHT - 2;
  const cellW = Math.floor(interiorW / ROOM_COLS);
  const cellH = Math.floor(interiorH / ROOM_ROWS);

  for (let ry = 0; ry < ROOM_ROWS; ry++) {
    for (let rx = 0; rx < ROOM_COLS; rx++) {
      const cellX = 1 + rx * cellW;
      const cellY = 1 + ry * cellH;

      // Room occupies most of its cell with a variable margin for walls/corridors
      const marginX = 1 + Math.floor(rng() * 2); // 1 or 2
      const marginY = 1 + Math.floor(rng() * 2); // 1 or 2
      const room: Room = {
        x: cellX + marginX,
        y: cellY + marginY,
        w: Math.max(2, cellW - marginX * 2),
        h: Math.max(2, cellH - marginY * 2),
      };
      rooms.push(room);

      // Carve room interior
      for (let row = room.y; row < room.y + room.h; row++) {
        for (let col = room.x; col < room.x + room.w; col++) {
          set(col, row, 0);
        }
      }
    }
  }

  // Carve horizontal corridors between adjacent rooms in the same row
  for (let ry = 0; ry < ROOM_ROWS; ry++) {
    for (let rx = 0; rx < ROOM_COLS - 1; rx++) {
      const left  = rooms[ry * ROOM_COLS + rx];
      const right = rooms[ry * ROOM_COLS + rx + 1];
      const midY  = Math.floor(left.y + left.h / 2);
      const startX = left.x + left.w;
      const endX   = right.x;
      for (let col = startX; col <= endX; col++) {
        set(col, midY, 0);
        set(col, midY - 1, 0); // 2-wide corridor
      }
    }
  }

  // Carve vertical corridors between adjacent rooms in the same column
  for (let ry = 0; ry < ROOM_ROWS - 1; ry++) {
    for (let rx = 0; rx < ROOM_COLS; rx++) {
      const top    = rooms[ry * ROOM_COLS + rx];
      const bottom = rooms[(ry + 1) * ROOM_COLS + rx];
      const midX   = Math.floor(top.x + top.w / 2);
      const startY = top.y + top.h;
      const endY   = bottom.y;
      for (let row = startY; row <= endY; row++) {
        set(midX, row, 0);
        set(midX + 1, row, 0); // 2-wide corridor
      }
    }
  }

  // Add extra random corridors between non-adjacent rooms for more interconnectivity.
  // This creates alternate routes and prevents the map from feeling too grid-like.
  const EXTRA_CORRIDORS = 3 + Math.floor(rng() * 3); // 3-5 extra connections
  for (let ec = 0; ec < EXTRA_CORRIDORS; ec++) {
    const aIdx = Math.floor(rng() * rooms.length);
    const bIdx = Math.floor(rng() * rooms.length);
    if (aIdx === bIdx) continue;
    const a = rooms[aIdx];
    const b = rooms[bIdx];
    const aCx = Math.floor(a.x + a.w / 2);
    const aCy = Math.floor(a.y + a.h / 2);
    const bCx = Math.floor(b.x + b.w / 2);
    const bCy = Math.floor(b.y + b.h / 2);

    // L-shaped corridor: go horizontal first, then vertical
    for (let col = Math.min(aCx, bCx); col <= Math.max(aCx, bCx); col++) {
      set(col, aCy, 0);
      if (aCy + 1 < MAP_HEIGHT - 1) set(col, aCy + 1, 0); // 2-wide
    }
    for (let row = Math.min(aCy, bCy); row <= Math.max(aCy, bCy); row++) {
      set(bCx, row, 0);
      if (bCx + 1 < MAP_WIDTH - 1) set(bCx + 1, row, 0); // 2-wide
    }
  }

  // Ensure border is all walls
  for (let col = 0; col < MAP_WIDTH; col++) {
    set(col, 0, 1);
    set(col, MAP_HEIGHT - 1, 1);
  }
  for (let row = 0; row < MAP_HEIGHT; row++) {
    set(0, row, 1);
    set(MAP_WIDTH - 1, row, 1);
  }

  // ── Spawn positions: one per room interior centre ─────────────────────────
  const spawnPositions: Vec2[] = rooms.map((r) => ({
    x: Math.floor(r.x + r.w / 2),
    y: Math.floor(r.y + r.h / 2),
  }));

  // ── Patrol path: spread across room centres for diverse guard coverage ──────
  // Pick evenly-spaced rooms for the patrol loop — corners, midpoints, and center
  const patrolIndices: number[] = [];
  // Four corners
  patrolIndices.push(0);                                          // top-left
  patrolIndices.push(ROOM_COLS - 1);                              // top-right
  patrolIndices.push(ROOM_COLS * ROOM_ROWS - 1);                  // bottom-right
  patrolIndices.push(ROOM_COLS * (ROOM_ROWS - 1));                // bottom-left
  // Mid-edge rooms
  patrolIndices.push(Math.floor(ROOM_COLS / 2));                  // top-center
  patrolIndices.push(ROOM_COLS * (ROOM_ROWS - 1) + Math.floor(ROOM_COLS / 2)); // bottom-center
  patrolIndices.push(Math.floor(ROOM_ROWS / 2) * ROOM_COLS);     // left-center
  patrolIndices.push(Math.floor(ROOM_ROWS / 2) * ROOM_COLS + ROOM_COLS - 1); // right-center
  // Center room
  patrolIndices.push(Math.floor(ROOM_ROWS / 2) * ROOM_COLS + Math.floor(ROOM_COLS / 2));

  const patrolPath: Vec2[] = [...new Set(patrolIndices)]
    .filter((i) => i < rooms.length)
    .map((i) => ({ x: Math.floor(rooms[i].x + rooms[i].w / 2), y: Math.floor(rooms[i].y + rooms[i].h / 2) }));

  // ── Guard start: centre of the map ────────────────────────────────────────
  const guardStart: Vec2 = { x: Math.floor(MAP_WIDTH / 2), y: Math.floor(MAP_HEIGHT / 2) };
  // Ensure guard start is walkable — if not, find nearest floor tile
  if (get(guardStart.x, guardStart.y) !== 0) {
    outer: for (let r = 1; r < 5; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (get(guardStart.x + dx, guardStart.y + dy) === 0) {
            guardStart.x += dx;
            guardStart.y += dy;
            break outer;
          }
        }
      }
    }
  }

  return { tiles, width: MAP_WIDTH, height: MAP_HEIGHT, spawnPositions, patrolPath, guardStart };
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
