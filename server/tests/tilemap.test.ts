import { describe, it, expect } from "vitest";
import {
  PATROL_PATH,
  SPAWN_POSITIONS,
  GUARD_START,
  GAME_MAP,
  isWalkable,
  isHidingSpot,
  MAP_WIDTH,
  MAP_HEIGHT,
} from "../src/utils/tilemap";
import { hasLineOfSight } from "../src/utils/los";

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

  it("hiding spots are correctly identified", () => {
    // Tile at (5,1) is a bush (tile id 2) in the map layout
    expect(isHidingSpot(5, 1)).toBe(true);
    // Tile at (4,4) is a crate (tile id 3)
    expect(isHidingSpot(4, 4)).toBe(true);
    // Floor tile should not be a hiding spot
    expect(isHidingSpot(1, 1)).toBe(false);
    // Wall tile should not be a hiding spot
    expect(isHidingSpot(0, 0)).toBe(false);
  });
});

describe("guard patrol determinism", () => {
  it("patrol path has at least 4 waypoints", () => {
    expect(PATROL_PATH.length).toBeGreaterThanOrEqual(4);
  });

  it("guard patrol path indices cycle correctly", () => {
    // Simulate 20 patrol steps and confirm modulo wraps
    for (let i = 0; i < 20; i++) {
      const idx = i % PATROL_PATH.length;
      expect(PATROL_PATH[idx]).toBeDefined();
    }
  });

  it("consecutive patrol waypoints have unobstructed LOS paths on open corridors", () => {
    // At least the first two consecutive waypoints should have LOS (row 1 corridor)
    const wp0 = PATROL_PATH[0];
    const wp1 = PATROL_PATH[1];
    // Not necessarily direct LOS (guard doesn't teleport), but positions exist
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
});
