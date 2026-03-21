/**
 * server/src/utils/tilemap.ts
 *
 * Default tile map for registry-14 "Don't Get Caught".
 *
 * Tile legend
 * ───────────
 *   0  floor  — walkable, no cover
 *   1  wall   — blocks movement and LOS
 *   2  bush   — walkable, provides hiding cover
 *   3  crate  — walkable, provides hiding cover
 *
 * The map is 16 × 10 tiles.  Players can move on tiles 0, 2, 3.
 * The guard patrols between defined waypoints.
 * Hiding spots (tiles 2 and 3) make isHiding=true effective — a player
 * on a hiding tile who has tapped Hide will not trigger detection.
 */

import { TileMap, Vec2 } from "./los";

// prettier-ignore
const RAW_TILES: number[] = [
  // Row 0
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  // Row 1
  1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1,
  // Row 2
  1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1,
  // Row 3
  1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1,
  // Row 4
  1, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 1,
  // Row 5
  1, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 1,
  // Row 6
  1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1,
  // Row 7
  1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1,
  // Row 8
  1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1,
  // Row 9
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
];

export const MAP_WIDTH = 16;
export const MAP_HEIGHT = 10;

/** Tile IDs that block LOS and movement. */
export const WALL_TILE_IDS = new Set<number>([1]);

/** Tile IDs that allow the player to hide (bushes and crates). */
export const HIDE_TILE_IDS = new Set<number>([2, 3]);

/** The authoritative TileMap object used by the server. */
export const GAME_MAP: TileMap = {
  width: MAP_WIDTH,
  height: MAP_HEIGHT,
  tiles: RAW_TILES,
  wallTileIds: WALL_TILE_IDS,
};

/** Guard patrol waypoints (tile centres). */
export const PATROL_PATH: Vec2[] = [
  { x: 1,  y: 1 },
  { x: 7,  y: 1 },
  { x: 14, y: 1 },
  { x: 14, y: 8 },
  { x: 7,  y: 8 },
  { x: 1,  y: 8 },
];

/** Player spawn positions (one per possible player slot, tile centres). */
export const SPAWN_POSITIONS: Vec2[] = [
  { x: 3,  y: 4 },
  { x: 5,  y: 4 },
  { x: 9,  y: 4 },
  { x: 11, y: 4 },
  { x: 3,  y: 5 },
  { x: 5,  y: 5 },
  { x: 9,  y: 5 },
  { x: 11, y: 5 },
];

/** Guard starting position. */
export const GUARD_START: Vec2 = { x: 7, y: 1 };

/**
 * Returns true when the tile at (col, row) is walkable by a player.
 */
export function isWalkable(col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= MAP_WIDTH || row >= MAP_HEIGHT) return false;
  const tileId = RAW_TILES[row * MAP_WIDTH + col];
  return !WALL_TILE_IDS.has(tileId);
}

/**
 * Returns true when the player on tile (col, row) is on a hiding spot.
 */
export function isHidingSpot(col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= MAP_WIDTH || row >= MAP_HEIGHT) return false;
  return HIDE_TILE_IDS.has(RAW_TILES[row * MAP_WIDTH + col]);
}
