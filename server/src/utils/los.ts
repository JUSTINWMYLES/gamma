/**
 * server/src/utils/los.ts
 *
 * Line-of-sight (LOS) utilities for the guard in registry-14.
 *
 * Coordinate system
 * ─────────────────
 * All positions are in TILE units (integers or floats).
 * Origin (0,0) is top-left of the map.
 * X increases right, Y increases down.
 *
 * Algorithm
 * ─────────
 * The guard has a cone of vision defined by:
 *   - facingAngle  radians (0 = right, π/2 = down)
 *   - fovHalfAngle half-width of the cone (default π/3 = 60° total)
 *   - range        maximum sight distance in tiles
 *
 * A player is visible when ALL of the following are true:
 *   1. They are within `range` tiles of the guard.
 *   2. The angle to the player is within ±fovHalfAngle of facingAngle.
 *   3. No WALL tile blocks the straight line between guard and player
 *      (digital differential analyser ray cast through the tile grid).
 *
 * Wall tile IDs are passed in as a Set<number> for O(1) lookup.
 */

/** A position in tile coordinates. */
export interface Vec2 { x: number; y: number; }

/** A 2-D tile map represented as a flat array, row-major. */
export interface TileMap {
  width: number;
  height: number;
  /** Flat tile array, length = width * height. */
  tiles: number[];
  /** Set of tile IDs that block line-of-sight. */
  wallTileIds: Set<number>;
}

/**
 * Returns true when the tile at (col, row) blocks LOS.
 * Out-of-bounds tiles are treated as walls.
 */
export function isWall(map: TileMap, col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= map.width || row >= map.height) return true;
  return map.wallTileIds.has(map.tiles[row * map.width + col]);
}

/**
 * Grid-crossing DDA ray cast.
 * Returns true when the line from `from` to `to` is unobstructed by walls.
 *
 * Steps only to actual tile-boundary crossings so a ray passing through
 * the exact corner of a wall tile (diagonal case) does NOT count as blocked.
 */
export function hasLineOfSight(
  map: TileMap,
  from: Vec2,
  to: Vec2,
): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  if (dx === 0 && dy === 0) return true; // same position

  // Current tile
  let tileX = Math.floor(from.x);
  let tileY = Math.floor(from.y);

  const destTileX = Math.floor(to.x);
  const destTileY = Math.floor(to.y);

  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;

  // tMax: parametric distance (t in [0,1]) to next vertical/horizontal boundary
  // tDelta: parametric distance between consecutive boundaries
  const tDeltaX = stepX !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(1 / dy) : Infinity;

  let tMaxX = stepX > 0
    ? (Math.ceil(from.x) - from.x) * tDeltaX
    : stepX < 0
      ? (from.x - Math.floor(from.x)) * tDeltaX
      : Infinity;
  // If we're exactly on a boundary, skip to the next one
  if (tMaxX === 0) tMaxX = tDeltaX;

  let tMaxY = stepY > 0
    ? (Math.ceil(from.y) - from.y) * tDeltaY
    : stepY < 0
      ? (from.y - Math.floor(from.y)) * tDeltaY
      : Infinity;
  if (tMaxY === 0) tMaxY = tDeltaY;

  // Walk through tiles until we reach the destination tile
  while (tileX !== destTileX || tileY !== destTileY) {
    if (tMaxX < tMaxY) {
      // Crossing a vertical boundary — enter a new column
      tileX += stepX;
      tMaxX += tDeltaX;
      if (tileX === destTileX && tileY === destTileY) break;
      if (isWall(map, tileX, tileY)) return false;
    } else if (tMaxY < tMaxX) {
      // Crossing a horizontal boundary — enter a new row
      tileY += stepY;
      tMaxY += tDeltaY;
      if (tileX === destTileX && tileY === destTileY) break;
      if (isWall(map, tileX, tileY)) return false;
    } else {
      // Exact corner crossing — ray grazes the shared corner of 4 tiles.
      // Neither the diagonal tile nor the two orthogonal neighbours are
      // entered; just advance both axes without a wall check.
      tileX += stepX;
      tileY += stepY;
      tMaxX += tDeltaX;
      tMaxY += tDeltaY;
      if (tileX === destTileX && tileY === destTileY) break;
      // No wall check here — corner graze does not enter any tile.
    }
  }
  return true;
}

/**
 * Full guard vision check combining distance, cone angle, and LOS ray cast.
 *
 * @param guardPos      Guard position in tile units.
 * @param facingAngle   Guard's facing direction in radians.
 * @param fovHalfAngle  Half-width of the vision cone (radians). Default π/3.
 * @param range         Max sight distance in tiles. Default 6.
 * @param targetPos     Player's position in tile units.
 * @param map           The tile map for wall checks.
 * @returns true when the guard can see the target.
 */
export function canGuardSeeTarget(
  guardPos: Vec2,
  facingAngle: number,
  targetPos: Vec2,
  map: TileMap,
  fovHalfAngle: number = Math.PI / 3,
  range: number = 6,
): boolean {
  const dx = targetPos.x - guardPos.x;
  const dy = targetPos.y - guardPos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > range) return false;

  // Angle between guard facing and target direction
  const angleToTarget = Math.atan2(dy, dx);
  let angleDiff = angleToTarget - facingAngle;
  // Normalise to [-π, π]
  while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
  while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

  if (Math.abs(angleDiff) > fovHalfAngle) return false;

  return hasLineOfSight(map, guardPos, targetPos);
}
