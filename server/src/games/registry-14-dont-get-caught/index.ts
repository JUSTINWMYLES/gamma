/**
 * server/src/games/registry-14-dont-get-caught/index.ts
 *
 * "Don't Get Caught" — run from guards on a procedural map.
 *
 * Game Rules
 * ──────────
 * • Players spawn on a procedurally-generated tile map and move via joystick
 *   or device tilt.
 * • Guards patrol waypoints and respect walls (axis-sliding collision).
 * • Each round the map is regenerated and one extra guard appears
 *   (round 1 = 1 guard, round 2 = 2, …, max 4).
 * • If a guard has LOS to a player, that player's detection meter fills.
 *   Detection is faster when the player is near the centre of the guard's
 *   vision cone (direct line of sight boost).
 *   At 100 the player is caught: respawned and a catch is charged.
 * • After CATCH_LIMIT catches the player is eliminated.
 * • Survivors score SURVIVAL_POINTS at round end.
 *
 * Guard behaviour
 * ───────────────
 * • Smooth patrol: facing angle is lerped rather than snapped — no twitching.
 * • Wander offset drifts slowly so guards aren't perfectly predictable.
 * • Occasional direction reversal for unpredictability.
 * • Guards collide with walls (axis-sliding), same as players.
 * • On alert (detection meter >= ALERT_THRESHOLD): enters "alert" mode.
 * • On full detection (meter >= 100): enters "chase" mode.
 * • After player is caught: guard returns to patrol immediately.
 *
 * Player movement
 * ───────────────
 * • Sub-tile collision: checks four corners of the player bounding box.
 * • Player-player soft push-apart collision.
 *
 * Server Update Loop (20 Hz)
 * ──────────────────────────
 *   1. Move all guards (wall collision + smooth angle lerp)
 *   2. For each player, run LOS check against each guard
 *   3. Update detection meters (with direct LOS boost)
 *   4. Handle catches / eliminations
 *   5. Apply player-player push-apart collision
 */

import { Client } from "@colyseus/core";
import { BaseGame } from "../BaseGame";
import {
  GAME_MAP,
  getPatrolPath,
  getSpawnPositions,
  getGuardStart,
  resetMap,
  refreshLegacyExports,
  getCurrentTiles,
  isWalkable,
  MAP_WIDTH,
  MAP_HEIGHT,
} from "../../utils/tilemap";
import { canGuardSeeTarget } from "../../utils/los";
import { GuardState } from "../../schema/GuardState";

// ── Constants ─────────────────────────────────────────────────────────────────

const TICK_RATE_MS = 50;

/** Base detection meter increment per tick. */
const BASE_DETECTION_INCREMENT = 2;
/**
 * Proximity multiplier for detection rate.
 * At 0 distance, detection is 1 + this value = 3x faster.
 * At GUARD_RANGE, detection is 1 + 0 = 1x (base rate).
 */
const DETECTION_PROXIMITY_MULTIPLIER = 2;
const DETECTION_DECREMENT = 2;

const BASE_GUARD_SPEED = 1.8;       // tiles/s
const CHASE_SPEED_MULTIPLIER = 1.6;
const CATCH_LIMIT = 3;
const SURVIVAL_POINTS = 100;
const CAUGHT_PENALTY = 20;
const FOV_HALF_ANGLE = Math.PI / 4; // 45° each side = 90° total cone
const GUARD_RANGE = 6;
const ALERT_THRESHOLD = 30;

/** Direct LOS bonus: if angle to player is within this from center, detection is boosted. */
const DIRECT_LOS_HALF_ANGLE = Math.PI / 12; // 15° each side = 30° "direct" zone
const DIRECT_LOS_MULTIPLIER = 4; // 4x faster detection when dead center

/** Guard bounding-box half-size for wall collision (tiles). Slightly larger than players. */
const GUARD_HALF = 0.45;

/** Max guards regardless of round number. */
const MAX_GUARDS = 4;

/** Angle lerp rate (radians/tick) — controls how quickly guard turns. Higher = snappier. */
const ANGLE_LERP_RATE = 0.12;

/** Probability (per tick) that a patrolling guard reverses patrol direction. */
const REVERSE_PROBABILITY = 0.004;

/** Wander radius (tiles): how far off a waypoint the guard drifts. */
const WANDER_RADIUS = 2.0;

/** Player bounding-box half-size for wall collision (tiles). Should be < 0.5. */
const PLAYER_HALF = 0.3;

/** Player-player soft push radius (tiles). */
const PLAYER_COLLISION_RADIUS = 0.55;

/** Minimum tile distance required between guard spawn and nearest player spawn. */
const MIN_GUARD_PLAYER_DIST = 8;

/** Minimum tile distance required between any two guard spawns. */
const MIN_GUARD_GUARD_DIST = 7;

// ── Input message type ────────────────────────────────────────────────────────

interface InputMessage {
  action: "move";
  dx?: number;
  dy?: number;
}

// ── Guard runtime state (not in schema) ──────────────────────────────────────

interface GuardRuntime {
  id: string;
  /** +1 or -1 — patrol direction multiplier. */
  patrolDir: number;
  /** LCG seed for this guard's per-tick RNG. */
  rngSeed: number;
  /** Current lateral wander offset (tiles) applied to waypoint target. */
  wanderX: number;
  wanderY: number;
}

// ── Angle lerp helper ─────────────────────────────────────────────────────────

/** Lerp between two angles (radians) taking the shortest arc. */
function lerpAngle(current: number, target: number, t: number): number {
  let diff = target - current;
  while (diff > Math.PI)  diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * t;
}

// ── Game class ────────────────────────────────────────────────────────────────

export default class DontGetCaughtGame extends BaseGame {
  static override requiresTV = false;
  static override supportsBracket = false;
  static override defaultRoundCount = 3;
  static override minRounds = 1;
  static override maxRounds = 5;
  static override hasInstructionsPhase = true;
  static override instructionsDelivery = "broadcast" as const;

  static override activityLevel: "none" | "some" | "full" = "none";
  static override requiresSameRoom = false;
  static override requiresSecondaryDisplay = false;

  private guardSpeed: number = BASE_GUARD_SPEED;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private caughtThisRound = new Map<string, number>();
  private roundResolve: (() => void) | null = null;
  private currentRound = 0;
  private guardRuntimes: GuardRuntime[] = [];

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  protected override async onLoad(): Promise<void> {
    // Clear guards — map is regenerated per round in runRound()
    this.room.state.guards.clear();

    // Initialise player fields (positions assigned in runRound after map is ready)
    for (const p of this.room.state.players.values()) {
      p.isDetected = false;
      p.detectionMeter = 0;
      p.timesCaught = 0;
      p.isEliminated = false;
      p.isReady = false;
    }
  }

  protected override async runRound(round: number): Promise<void> {
    this.currentRound = round;
    this.caughtThisRound.clear();

    // Regenerate the map each round — different layout every time
    const seed = Date.now() + round * 1_000_003;
    resetMap(seed);
    refreshLegacyExports();

    // Broadcast new tile data to clients
    this.room.state.mapTiles  = JSON.stringify(getCurrentTiles());
    this.room.state.mapWidth  = MAP_WIDTH;
    this.room.state.mapHeight = MAP_HEIGHT;

    // Reset per-round player state and place them in the new map
    const spawnPositions = getSpawnPositions();
    const players = [...this.room.state.players.values()];
    players.forEach((p, i) => {
      if (!p.isEliminated) {
        p.isDetected = false;
        p.detectionMeter = 0;
        p.timesCaught = 0;
        const spawn = spawnPositions[i % spawnPositions.length];
        p.x = spawn.x + 0.5;
        p.y = spawn.y + 0.5;
      }
    });

    // Spawn guards spread across the map, away from players
    const guardCount = Math.min(round, MAX_GUARDS);
    this._spawnGuards(guardCount);

    const roundDurationMs = this.room.state.gameConfig.timeLimitSecs * 1000;

    await new Promise<void>((resolve) => {
      this.roundResolve = resolve;
      this.tickInterval = setInterval(() => this._tick(), TICK_RATE_MS);
      setTimeout(() => this._endRound(), roundDurationMs);
    });
  }

  protected override scoreRound(_round: number): void {
    for (const p of this.room.state.players.values()) {
      if (!p.isEliminated) {
        p.score += SURVIVAL_POINTS;
      }
      const caught = this.caughtThisRound.get(p.id) ?? 0;
      p.score = Math.max(0, p.score - caught * CAUGHT_PENALTY);
    }

    // Adaptive difficulty: speed up guards if the round was easy
    const totalPlayers = this.room.state.players.size;
    const caughtCount = [...this.caughtThisRound.values()].filter((n) => n > 0).length;
    if (caughtCount < totalPlayers / 2) {
      this.guardSpeed = Math.min(this.guardSpeed * 1.15, BASE_GUARD_SPEED * 2);
    } else {
      this.guardSpeed = Math.max(this.guardSpeed * 0.95, BASE_GUARD_SPEED);
    }
  }

  override handleInput(client: Client, data: unknown): void {
    if (this.room.state.phase !== "in_round") return;
    const player = this.room.state.players.get(client.sessionId);
    if (!player || player.isEliminated) return;

    const input = data as InputMessage;
    if (input.action === "move" && input.dx !== undefined && input.dy !== undefined) {
      this._handleMove(player.id, input.dx, input.dy);
    }
  }

  override teardown(): void {
    super.teardown();
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.room.state.guards.clear();
  }

  // ── Guard spawning ────────────────────────────────────────────────────────

  private _spawnGuards(count: number): void {
    this.room.state.guards.clear();
    this.guardRuntimes = [];

    const patrolPath = getPatrolPath();
    const spawnPositions = getSpawnPositions();

    /** Positions of guards already placed (for minimum spacing check). */
    const placedPositions: { x: number; y: number }[] = [];

    for (let i = 0; i < count; i++) {
      const g = new GuardState();
      const key = String(i);
      g.id = key;

      // Score every patrol waypoint: prefer far from player spawns AND far from placed guards.
      let bestIdx = i % patrolPath.length;
      let bestScore = -Infinity;

      for (let pi = 0; pi < patrolPath.length; pi++) {
        const wp = patrolPath[pi];

        // Minimum distance to any player spawn
        const minPlayerDist = spawnPositions.reduce((min, sp) => {
          const d = Math.sqrt((wp.x - sp.x) ** 2 + (wp.y - sp.y) ** 2);
          return Math.min(min, d);
        }, Infinity);

        if (minPlayerDist < MIN_GUARD_PLAYER_DIST) continue; // too close to a player spawn

        // Minimum distance to any already-placed guard
        const minGuardDist = placedPositions.reduce((min, gp) => {
          const d = Math.sqrt((wp.x - gp.x) ** 2 + (wp.y - gp.y) ** 2);
          return Math.min(min, d);
        }, Infinity);

        if (placedPositions.length > 0 && minGuardDist < MIN_GUARD_GUARD_DIST) continue; // too close to another guard

        // Score: maximise minimum distance to placed guards (primary) + player spawns (secondary)
        const score = (placedPositions.length > 0 ? minGuardDist : 0) + minPlayerDist * 0.5;
        if (score > bestScore) {
          bestScore = score;
          bestIdx = pi;
        }
      }

      const startWp = patrolPath[bestIdx];

      g.x = (startWp?.x ?? getGuardStart().x) + 0.5;
      g.y = (startWp?.y ?? getGuardStart().y) + 0.5;
      g.facingAngle = (i / count) * Math.PI * 2;
      g.patrolIndex = bestIdx;
      g.guardMode = "patrol";
      g.targetPlayerId = "";

      placedPositions.push({ x: g.x, y: g.y });

      this.room.state.guards.set(key, g);
      this.guardRuntimes.push({
        id: key,
        patrolDir: 1,
        rngSeed: i * 31337 + 997,
        wanderX: 0,
        wanderY: 0,
      });
    }
  }

  // ── Tick ──────────────────────────────────────────────────────────────────

  private _tick(): void {
    this._moveAllGuards();
    this._checkDetections();
    this._applyPlayerCollisions();
    this._checkRoundEnd();
  }

  // ── Guard movement ────────────────────────────────────────────────────────

  private _moveAllGuards(): void {
    const dt = TICK_RATE_MS / 1000;
    const patrolPath = getPatrolPath();

    for (let i = 0; i < this.guardRuntimes.length; i++) {
      const rt = this.guardRuntimes[i];
      const guard = this.room.state.guards.get(rt.id);
      if (!guard) continue;

      // Per-guard LCG random number
      rt.rngSeed = (Math.imul(1664525, rt.rngSeed) + 1013904223) >>> 0;
      const rand = rt.rngSeed / 0x100000000;

      // Chase mode: move directly towards target
      if (guard.guardMode === "chase" && guard.targetPlayerId) {
        const target = this.room.state.players.get(guard.targetPlayerId);
        if (!target || target.isEliminated || !target.isConnected) {
          guard.guardMode = "patrol";
          guard.targetPlayerId = "";
        } else {
          const result = this._moveTowardsSmooth(
            guard,
            target.x,
            target.y,
            this.guardSpeed * CHASE_SPEED_MULTIPLIER * dt,
          );
          // If guard is fully blocked by walls during chase, drop back to patrol
          // so it doesn't get permanently stuck against a wall.
          if (result.blocked) {
            guard.guardMode = "patrol";
            guard.targetPlayerId = "";
          }
          continue;
        }
      }

      // Occasionally reverse patrol direction
      if (rand < REVERSE_PROBABILITY) {
        rt.patrolDir *= -1;
      }

      // Occasionally update the wander offset (smooth drift, not per-tick jitter)
      if (rand < 0.02) {
        rt.rngSeed = (Math.imul(1664525, rt.rngSeed) + 1013904223) >>> 0;
        const r2 = rt.rngSeed / 0x100000000;
        rt.rngSeed = (Math.imul(1664525, rt.rngSeed) + 1013904223) >>> 0;
        const r3 = rt.rngSeed / 0x100000000;
        const candidateWX = (r2 - 0.5) * 2 * WANDER_RADIUS;
        const candidateWY = (r3 - 0.5) * 2 * WANDER_RADIUS;

        // Only accept wander offset if the resulting target is walkable.
        // This prevents guards from heading towards a point inside a wall,
        // which causes them to get stuck on wall edges.
        const waypointForCheck = patrolPath[
          ((guard.patrolIndex * rt.patrolDir) % patrolPath.length + patrolPath.length) %
          patrolPath.length
        ];
        if (waypointForCheck) {
          const testX = waypointForCheck.x + 0.5 + candidateWX;
          const testY = waypointForCheck.y + 0.5 + candidateWY;
          if (this._guardPositionWalkable(testX, testY)) {
            rt.wanderX = candidateWX;
            rt.wanderY = candidateWY;
          } else {
            // Reject bad wander — reset to zero so guard returns to waypoint center
            rt.wanderX = 0;
            rt.wanderY = 0;
          }
        }
      }

      // Patrol: move towards current waypoint + wander
      const waypointIdx =
        ((guard.patrolIndex * rt.patrolDir) % patrolPath.length + patrolPath.length) %
        patrolPath.length;
      const waypoint = patrolPath[waypointIdx % patrolPath.length];
      if (!waypoint) continue;

      let targetX = waypoint.x + 0.5 + rt.wanderX;
      let targetY = waypoint.y + 0.5 + rt.wanderY;

      // Final safety: if the wandered target is not walkable (e.g. map changed),
      // fall back to the raw waypoint center
      if (!this._guardPositionWalkable(targetX, targetY)) {
        targetX = waypoint.x + 0.5;
        targetY = waypoint.y + 0.5;
        rt.wanderX = 0;
        rt.wanderY = 0;
      }

      const moveResult = this._moveTowardsSmooth(guard, targetX, targetY, this.guardSpeed * dt);
      if (moveResult.arrived) {
        guard.patrolIndex =
          (guard.patrolIndex + rt.patrolDir + patrolPath.length) % patrolPath.length;
        rt.wanderX = 0;
        rt.wanderY = 0;
      } else if (moveResult.blocked) {
        // Guard is fully blocked patrolling — reset wander and advance to next waypoint
        rt.wanderX = 0;
        rt.wanderY = 0;
        guard.patrolIndex =
          (guard.patrolIndex + rt.patrolDir + patrolPath.length) % patrolPath.length;
      }
    }
  }

  /**
   * Move entity towards (targetX, targetY) at most `speed` tiles.
   * Guards respect wall collision with axis-sliding (same as players).
   * Facing angle is lerped — no snapping to prevent twitching.
   * Returns { arrived: true } when at destination, { blocked: true } when
   * fully blocked by walls (no axis could slide), or neither.
   */
  private _moveTowardsSmooth(
    entity: { x: number; y: number; facingAngle: number },
    targetX: number,
    targetY: number,
    speed: number,
  ): { arrived: boolean; blocked: boolean } {
    const dx = targetX - entity.x;
    const dy = targetY - entity.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.05) return { arrived: true, blocked: false };

    // Lerp facing angle toward travel direction — eliminates twitching
    const desiredAngle = Math.atan2(dy, dx);
    entity.facingAngle = lerpAngle(entity.facingAngle, desiredAngle, ANGLE_LERP_RATE);

    let moveX: number;
    let moveY: number;
    if (dist <= speed) {
      moveX = targetX;
      moveY = targetY;
    } else {
      moveX = entity.x + (dx / dist) * speed;
      moveY = entity.y + (dy / dist) * speed;
    }

    // Wall collision with axis-sliding (same approach as player movement)
    if (this._guardPositionWalkable(moveX, moveY)) {
      entity.x = moveX;
      entity.y = moveY;
    } else if (this._guardPositionWalkable(moveX, entity.y)) {
      entity.x = moveX;
    } else if (this._guardPositionWalkable(entity.x, moveY)) {
      entity.y = moveY;
    } else {
      // Fully blocked — no movement at all
      return { arrived: false, blocked: true };
    }

    return { arrived: dist <= speed, blocked: false };
  }

  /**
   * Returns true only if all 4 corners of the guard bounding box at (x, y)
   * are on walkable tiles.
   */
  private _guardPositionWalkable(x: number, y: number): boolean {
    const h = GUARD_HALF;
    return (
      isWalkable(Math.floor(x - h), Math.floor(y - h)) &&
      isWalkable(Math.floor(x + h), Math.floor(y - h)) &&
      isWalkable(Math.floor(x - h), Math.floor(y + h)) &&
      isWalkable(Math.floor(x + h), Math.floor(y + h))
    );
  }

  // ── Detection ─────────────────────────────────────────────────────────────

  private _checkDetections(): void {
    for (const player of this.room.state.players.values()) {
      if (!player.isConnected || player.isEliminated) continue;

      let seenByAnyGuard = false;

      for (const guard of this.room.state.guards.values()) {
        const visible = canGuardSeeTarget(
          { x: guard.x, y: guard.y },
          guard.facingAngle,
          { x: player.x, y: player.y },
          GAME_MAP,
          FOV_HALF_ANGLE,
          GUARD_RANGE,
        );

        if (visible) {
          seenByAnyGuard = true;

          // Detection rate increases with proximity
          const dx = guard.x - player.x;
          const dy = guard.y - player.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const proximity = Math.max(0, 1 - dist / GUARD_RANGE); // 1 at point blank, 0 at edge of range
          let increment =
            BASE_DETECTION_INCREMENT * (1 + proximity * DETECTION_PROXIMITY_MULTIPLIER);

          // Direct LOS boost: if player is near the center of the guard's vision cone,
          // detection is dramatically faster (they're staring right at you)
          const angleToPlayer = Math.atan2(player.y - guard.y, player.x - guard.x);
          let angleDiff = angleToPlayer - guard.facingAngle;
          while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
          while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
          if (Math.abs(angleDiff) < DIRECT_LOS_HALF_ANGLE) {
            increment *= DIRECT_LOS_MULTIPLIER;
          }

          player.detectionMeter = Math.min(100, player.detectionMeter + increment);

          if (guard.guardMode === "patrol" && player.detectionMeter >= ALERT_THRESHOLD) {
            guard.guardMode = "alert";
          }
          if (player.detectionMeter >= 100 && guard.guardMode !== "chase") {
            guard.guardMode = "chase";
            guard.targetPlayerId = player.id;
          }
        }
      }

      if (seenByAnyGuard) {
        player.isDetected = true;
        if (player.detectionMeter >= 100) {
          this._catchPlayer(player.id);
        }
      } else {
        player.isDetected = false;
        player.detectionMeter = Math.max(0, player.detectionMeter - DETECTION_DECREMENT);
      }
    }
  }

  // ── Player-player collision ───────────────────────────────────────────────

  private _applyPlayerCollisions(): void {
    const players = [...this.room.state.players.values()].filter(
      (p) => p.isConnected && !p.isEliminated,
    );

    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const a = players[i];
        const b = players[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < PLAYER_COLLISION_RADIUS && dist > 0.001) {
          const overlap = PLAYER_COLLISION_RADIUS - dist;
          const nx = dx / dist;
          const ny = dy / dist;
          const halfPush = overlap * 0.5;

          const ax = a.x - nx * halfPush;
          const ay = a.y - ny * halfPush;
          const bx = b.x + nx * halfPush;
          const by = b.y + ny * halfPush;

          if (this._positionWalkable(ax, ay)) { a.x = ax; a.y = ay; }
          if (this._positionWalkable(bx, by)) { b.x = bx; b.y = by; }
        }
      }
    }
  }

  // ── Catch handling ────────────────────────────────────────────────────────

  private _catchPlayer(sessionId: string): void {
    const player = this.room.state.players.get(sessionId);
    if (!player || player.isEliminated) return;

    player.timesCaught++;
    player.detectionMeter = 0;
    player.isDetected = false;

    const roundCatches = (this.caughtThisRound.get(sessionId) ?? 0) + 1;
    this.caughtThisRound.set(sessionId, roundCatches);

    // ALL guards that were chasing or on alert return to patrol immediately
    for (const guard of this.room.state.guards.values()) {
      if (guard.targetPlayerId === sessionId || guard.guardMode === "alert") {
        guard.guardMode = "patrol";
        guard.targetPlayerId = "";
      }
    }

    // Respawn at the spawn farthest from any guard
    const spawnPositions = getSpawnPositions();
    const guards = [...this.room.state.guards.values()];
    let bestSpawn = { x: spawnPositions[0].x, y: spawnPositions[0].y };
    let bestSpawnDist = 0;
    for (const sp of spawnPositions) {
      const minDistToGuard = guards.reduce((min, g) => {
        const d = Math.sqrt((g.x - sp.x) ** 2 + (g.y - sp.y) ** 2);
        return Math.min(min, d);
      }, Infinity);
      if (minDistToGuard > bestSpawnDist) {
        bestSpawnDist = minDistToGuard;
        bestSpawn = { x: sp.x, y: sp.y };
      }
    }

    player.x = bestSpawn.x + 0.5;
    player.y = bestSpawn.y + 0.5;

    if (player.timesCaught >= CATCH_LIMIT) {
      player.isEliminated = true;
      this.broadcast("player_eliminated", { playerId: sessionId, name: player.name });
    } else {
      this.broadcast("player_caught", {
        playerId: sessionId,
        name: player.name,
        timesCaught: player.timesCaught,
        catchesRemaining: CATCH_LIMIT - player.timesCaught,
      });
    }
  }

  // ── Move handling ─────────────────────────────────────────────────────────

  private _handleMove(sessionId: string, dx: number, dy: number): void {
    const player = this.room.state.players.get(sessionId);
    if (!player) return;

    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;
    const ndx = dx / len;
    const ndy = dy / len;

    const PLAYER_SPEED = 0.15; // tiles per input event (~20 events/s)

    const nx = player.x + ndx * PLAYER_SPEED;
    const ny = player.y + ndy * PLAYER_SPEED;

    // Bounding box collision — try full move, then axis-slide
    if (this._positionWalkable(nx, ny)) {
      player.x = nx;
      player.y = ny;
    } else if (this._positionWalkable(nx, player.y)) {
      player.x = nx;
    } else if (this._positionWalkable(player.x, ny)) {
      player.y = ny;
    }
    // Fully blocked — no movement applied
  }

  /**
   * Returns true only if all 4 corners of the player bounding box at (x, y)
   * are on walkable tiles. This prevents the player from clipping into walls
   * at sub-tile positions.
   */
  private _positionWalkable(x: number, y: number): boolean {
    const h = PLAYER_HALF;
    return (
      isWalkable(Math.floor(x - h), Math.floor(y - h)) &&
      isWalkable(Math.floor(x + h), Math.floor(y - h)) &&
      isWalkable(Math.floor(x - h), Math.floor(y + h)) &&
      isWalkable(Math.floor(x + h), Math.floor(y + h))
    );
  }

  // ── Round end ─────────────────────────────────────────────────────────────

  private _checkRoundEnd(): void {
    const active = [...this.room.state.players.values()].filter(
      (p) => p.isConnected && !p.isEliminated,
    );
    if (active.length === 0) {
      this._endRound();
    }
  }

  private _endRound(): void {
    if (!this.tickInterval) return;

    clearInterval(this.tickInterval);
    this.tickInterval = null;

    if (this.roundResolve) {
      this.roundResolve();
      this.roundResolve = null;
    }
  }
}
