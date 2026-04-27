import { describe, it, expect, beforeEach } from "vitest";
import {
  PATROL_PATH,
  SPAWN_POSITIONS,
  GUARD_START,
  GAME_MAP,
  isWalkable,
  isHidingSpot,
  MAP_WIDTH,
  MAP_HEIGHT,
  resetMap,
  refreshLegacyExports,
  generateMap,
  findPath,
} from "../src/utils/tilemap";
import { hasLineOfSight } from "../src/utils/los";

// Regenerate a fresh deterministic map before each suite
beforeEach(() => {
  resetMap(12345);
  refreshLegacyExports();
});

describe("tilemap walkability", () => {
  it("guard start is walkable", () => {
    expect(isWalkable(GUARD_START.x, GUARD_START.y)).toBe(true);
  });

  it("all patrol waypoints are walkable", () => {
    for (const wp of PATROL_PATH) {
      expect(isWalkable(wp.x, wp.y)).toBe(true);
    }
  });

  it("all spawn positions are walkable", () => {
    for (const sp of SPAWN_POSITIONS) {
      expect(isWalkable(sp.x, sp.y)).toBe(true);
    }
  });

  it("map boundary (row 0) is all walls", () => {
    for (let col = 0; col < MAP_WIDTH; col++) {
      expect(isWalkable(col, 0)).toBe(false);
    }
  });

  it("map boundary (row last) is all walls", () => {
    for (let col = 0; col < MAP_WIDTH; col++) {
      expect(isWalkable(col, MAP_HEIGHT - 1)).toBe(false);
    }
  });

  it("hiding spots are always false in the new no-hiding design", () => {
    // isHidingSpot should always return false — no hiding mechanic
    expect(isHidingSpot(5, 1)).toBe(false);
    expect(isHidingSpot(4, 4)).toBe(false);
    expect(isHidingSpot(1, 1)).toBe(false);
    expect(isHidingSpot(0, 0)).toBe(false);
  });
});

describe("guard patrol determinism", () => {
  it("patrol path has at least 4 waypoints", () => {
    expect(PATROL_PATH.length).toBeGreaterThanOrEqual(4);
  });

  it("guard patrol path indices cycle correctly", () => {
    for (let i = 0; i < 20; i++) {
      const idx = i % PATROL_PATH.length;
      expect(PATROL_PATH[idx]).toBeDefined();
    }
  });

  it("consecutive patrol waypoints are defined", () => {
    const wp0 = PATROL_PATH[0];
    const wp1 = PATROL_PATH[1];
    expect(wp0).toBeDefined();
    expect(wp1).toBeDefined();
  });
});

describe("game map integrity", () => {
  it("map tile array has correct size", () => {
    expect(GAME_MAP.tiles.length).toBe(MAP_WIDTH * MAP_HEIGHT);
  });

  it("wall tile ID set is not empty", () => {
    expect(GAME_MAP.wallTileIds.size).toBeGreaterThan(0);
  });

  it("map has same dimensions as MAP_WIDTH × MAP_HEIGHT", () => {
    expect(GAME_MAP.width).toBe(MAP_WIDTH);
    expect(GAME_MAP.height).toBe(MAP_HEIGHT);
  });
});

describe("fixed map generation", () => {
  it("same seed produces same map", () => {
    const m1 = generateMap(999);
    const m2 = generateMap(999);
    expect(m1.tiles).toEqual(m2.tiles);
  });

  it("different seeds still produce the same fixed map", () => {
    const m1 = generateMap(1);
    const m2 = generateMap(2);
    expect(m1.tiles).toEqual(m2.tiles);
  });

  it("generated map has correct dimensions", () => {
    const m = generateMap(42);
    expect(m.tiles.length).toBe(MAP_WIDTH * MAP_HEIGHT);
    expect(m.width).toBe(MAP_WIDTH);
    expect(m.height).toBe(MAP_HEIGHT);
  });

  it("generated map boundary is all walls", () => {
    const m = generateMap(42);
    for (let col = 0; col < MAP_WIDTH; col++) {
      expect(m.tiles[0 * MAP_WIDTH + col]).toBe(1); // top row
      expect(m.tiles[(MAP_HEIGHT - 1) * MAP_WIDTH + col]).toBe(1); // bottom row
    }
    for (let row = 0; row < MAP_HEIGHT; row++) {
      expect(m.tiles[row * MAP_WIDTH + 0]).toBe(1); // left col
      expect(m.tiles[row * MAP_WIDTH + (MAP_WIDTH - 1)]).toBe(1); // right col
    }
  });

  it("generated map has some floor tiles", () => {
    const m = generateMap(42);
    const floorCount = m.tiles.filter((t) => t === 0).length;
    expect(floorCount).toBeGreaterThan(MAP_WIDTH * MAP_HEIGHT * 0.2); // at least 20% floor
  });

  it("generated map spawn positions are walkable", () => {
    const m = generateMap(42);
    for (const sp of m.spawnPositions) {
      const tile = m.tiles[sp.y * MAP_WIDTH + sp.x];
      expect(tile).toBe(0);
    }
  });

  it("all consecutive patrol waypoints are connected by a valid path", () => {
    expect(PATROL_PATH.length).toBeGreaterThan(3);

    for (let i = 0; i < PATROL_PATH.length; i++) {
      const from = PATROL_PATH[i];
      const to = PATROL_PATH[(i + 1) % PATROL_PATH.length];
      const path = findPath(from.x + 0.5, from.y + 0.5, to.x + 0.5, to.y + 0.5, 400);
      expect(path).not.toBeNull();
    }
  });
});
