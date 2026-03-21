/**
 * server/src/games/registry-14-dont-get-caught/index.ts
 *
 * "Don't Get Caught" — run from supernatural guards on a procedural map.
 *
 * Game Rules
 * ──────────
 * • Players spawn on a procedurally-generated tile map and move via joystick.
 * • Guards patrol waypoints; there is NO hiding mechanic — just run.
 * • Guards are supernatural: they ignore walls when moving (they can walk
 *   through walls), but LOS is still blocked by walls for detection purposes.
 * • Each round adds one more guard (round 1 = 1 guard, round 2 = 2, …, max 4).
 * • If a guard has LOS to a player, that player's detection meter fills.
 *   At 100 the player is caught: respawned and deducted from their catch budget.
 * • After CATCH_LIMIT catches the player is eliminated.
 * • Survivors score SURVIVAL_POINTS at round end.
 * • Guards have randomised patrol jitter: random angle deviation and occasional
 *   spontaneous direction-reversal to be less predictable.
 * • Player-player soft collision: players push each other apart instead of
 *   stacking on top of each other.
 * • Map is regenerated each game (seeded from Date.now()).
 *
 * Server Update Loop (20 Hz)
 * ──────────────────────────
 *   1. Move all guards (ignore walls, random jitter)
 *   2. For each player, run LOS check against each guard
 *   3. Update detection meters
 *   4. Handle catches / eliminations
 *   5. Apply player-player push-apart collision
 */

import { Client } from "@colyseus/core";
import { MapSchema } from "@colyseus/schema";
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

/** Detection meter increment per tick (20 Hz → ~1.25 s to full detection). */
const DETECTION_INCREMENT = 4;
const DETECTION_DECREMENT = 2;

const BASE_GUARD_SPEED = 2.0;       // tiles/s
const CHASE_SPEED_MULTIPLIER = 1.6;
const CATCH_LIMIT = 3;
const SURVIVAL_POINTS = 100;
const CAUGHT_PENALTY = 20;
const FOV_HALF_ANGLE = Math.PI / 3; // 60° each side
const GUARD_RANGE = 7;              // slightly larger than before
const ALERT_THRESHOLD = 30;

/** Max guards regardless of round number. */
const MAX_GUARDS = 4;

/** Probability (per tick) that a patrolling guard adds random angle jitter. */
const JITTER_PROBABILITY = 0.03;
/** Max random jitter to patrol angle (radians). */
const JITTER_ANGLE = Math.PI / 5;

/** Probability (per tick) that a patrolling guard reverses patrol direction. */
const REVERSE_PROBABILITY = 0.005;

/** Player collision push radius in tiles. */
const PLAYER_COLLISION_RADIUS = 0.55;

// ── Input message type ────────────────────────────────────────────────────────

interface InputMessage {
  action: "move";
  dx?: number;
  dy?: number;
}

// ── Guard runtime state (not in schema) ──────────────────────────────────────

interface GuardRuntime {
  id: string;
  /** Current jitter offset added to patrol direction. */
  angleJitter: number;
  /** +1 or -1 — patrol direction multiplier. */
  patrolDir: number;
  /** Random seed for this guard's jitter RNG. */
  jitterSeed: number;
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

  private guardSpeed: number = BASE_GUARD_SPEED;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private caughtThisRound = new Map<string, number>();
  private roundResolve: (() => void) | null = null;
  private currentRound = 0;
  private guardRuntimes: GuardRuntime[] = [];

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  protected override async onLoad(): Promise<void> {
    // Generate a fresh map for this game
    const seed = Date.now();
    resetMap(seed);
    refreshLegacyExports();

    // Broadcast tile data to clients
    this.room.state.mapTiles = JSON.stringify(getCurrentTiles());
    this.room.state.mapWidth  = MAP_WIDTH;
    this.room.state.mapHeight = MAP_HEIGHT;

    // Spawn players
    const spawnPositions = getSpawnPositions();
    const players = [...this.room.state.players.values()];
    players.forEach((p, i) => {
      const spawn = spawnPositions[i % spawnPositions.length];
      p.x = spawn.x;
      p.y = spawn.y;
      p.isDetected = false;
      p.detectionMeter = 0;
      p.timesCaught = 0;
      p.isEliminated = false;
      p.isReady = false;
    });

    // Clear guards
    this.room.state.guards.clear();
  }

  protected override async runRound(round: number): Promise<void> {
    this.currentRound = round;
    this.caughtThisRound.clear();

    // Reset per-round state
    for (const p of this.room.state.players.values()) {
      if (!p.isEliminated) {
        p.isDetected = false;
        p.detectionMeter = 0;
        p.timesCaught = 0;
      }
    }

    // Spawn guards (one extra per round, up to MAX_GUARDS)
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

    const totalPlayers = this.room.state.players.size;
    const caughtCount = [...this.caughtThisRound.values()].filter((n) => n > 0).length;
    if (caughtCount < totalPlayers / 2) {
      this.guardSpeed = Math.min(this.guardSpeed * 1.2, BASE_GUARD_SPEED * 2);
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

    const guardStart = getGuardStart();
    const patrolPath = getPatrolPath();

    for (let i = 0; i < count; i++) {
      const g = new GuardState();
      const key = String(i);
      g.id = key;
      // Offset starting positions along the patrol path so guards start spread out
      g.x = patrolPath[i % patrolPath.length]?.x ?? guardStart.x;
      g.y = patrolPath[i % patrolPath.length]?.y ?? guardStart.y;
      g.facingAngle = (i / count) * Math.PI * 2;
      g.patrolIndex = i % patrolPath.length;
      g.guardMode = "patrol";
      g.targetPlayerId = "";

      this.room.state.guards.set(key, g);
      this.guardRuntimes.push({
        id: key,
        angleJitter: 0,
        patrolDir: 1,
        jitterSeed: i * 31337 + this.currentRound * 997,
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

      if (guard.guardMode === "chase" && guard.targetPlayerId) {
        const target = this.room.state.players.get(guard.targetPlayerId);
        if (!target || target.isEliminated || !target.isConnected) {
          guard.guardMode = "patrol";
          guard.targetPlayerId = "";
        } else {
          // Guards ignore walls: move directly towards target
          this._moveTowardsIgnoreWalls(
            guard,
            target.x,
            target.y,
            this.guardSpeed * CHASE_SPEED_MULTIPLIER * dt,
          );
          continue;
        }
      }

      // Random jitter (simple LCG inline — no import needed)
      rt.jitterSeed = (Math.imul(1664525, rt.jitterSeed) + 1013904223) >>> 0;
      const rand = rt.jitterSeed / 0x100000000;

      if (rand < JITTER_PROBABILITY) {
        rt.jitterSeed = (Math.imul(1664525, rt.jitterSeed) + 1013904223) >>> 0;
        const jrand = rt.jitterSeed / 0x100000000;
        rt.angleJitter = (jrand - 0.5) * 2 * JITTER_ANGLE;
      }
      if (rand < REVERSE_PROBABILITY) {
        rt.patrolDir *= -1;
      }

      // Patrol mode: move towards current waypoint (ignoring walls)
      const waypointIdx = ((guard.patrolIndex * rt.patrolDir) % patrolPath.length + patrolPath.length) % patrolPath.length;
      const waypoint = patrolPath[waypointIdx % patrolPath.length];
      if (!waypoint) continue;

      // Apply jitter to target position (wander slightly off waypoint)
      const jitterDist = 1.5;
      const targetX = waypoint.x + Math.cos(rt.angleJitter) * jitterDist * rand;
      const targetY = waypoint.y + Math.sin(rt.angleJitter) * jitterDist * rand;

      const arrived = this._moveTowardsIgnoreWalls(
        guard,
        targetX,
        targetY,
        this.guardSpeed * dt,
      );
      if (arrived) {
        guard.patrolIndex = (guard.patrolIndex + rt.patrolDir + patrolPath.length) % patrolPath.length;
        rt.angleJitter = 0; // reset jitter on waypoint arrival
      }
    }
  }

  /**
   * Move an entity towards (targetX, targetY) at most `speed` tiles.
   * Guards pass through walls — no collision check here.
   * Returns true when arrived.
   */
  private _moveTowardsIgnoreWalls(
    entity: { x: number; y: number; facingAngle: number },
    targetX: number,
    targetY: number,
    speed: number,
  ): boolean {
    const dx = targetX - entity.x;
    const dy = targetY - entity.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.05) return true;

    entity.facingAngle = Math.atan2(dy, dx);

    if (dist <= speed) {
      entity.x = targetX;
      entity.y = targetY;
      return true;
    }

    entity.x += (dx / dist) * speed;
    entity.y += (dy / dist) * speed;
    return false;
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

          if (guard.guardMode === "patrol" && player.detectionMeter >= ALERT_THRESHOLD) {
            guard.guardMode = "alert";
          }
          if (player.detectionMeter >= 100 && guard.guardMode !== "chase") {
            guard.guardMode = "chase";
            guard.targetPlayerId = player.id;
          }
        }

        // Calm guard if its chase target has been cleared
        if (
          guard.guardMode === "chase" &&
          guard.targetPlayerId === player.id &&
          player.detectionMeter === 0
        ) {
          guard.guardMode = "patrol";
          guard.targetPlayerId = "";
        }
      }

      if (seenByAnyGuard) {
        player.isDetected = true;
        player.detectionMeter = Math.min(100, player.detectionMeter + DETECTION_INCREMENT);

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

  /**
   * Soft push-apart collision between players.
   * Players within PLAYER_COLLISION_RADIUS of each other are nudged apart.
   * This is applied after movement so it can override positions.
   */
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
          // Push apart by half the overlap each
          const overlap = PLAYER_COLLISION_RADIUS - dist;
          const nx = dx / dist;
          const ny = dy / dist;
          const halfPush = overlap * 0.5;

          const ax = a.x - nx * halfPush;
          const ay = a.y - ny * halfPush;
          const bx = b.x + nx * halfPush;
          const by = b.y + ny * halfPush;

          // Only apply push if the new position is walkable (or no change)
          if (isWalkable(Math.floor(ax), Math.floor(ay))) {
            a.x = ax;
            a.y = ay;
          }
          if (isWalkable(Math.floor(bx), Math.floor(by))) {
            b.x = bx;
            b.y = by;
          }
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

    // Respawn at furthest spawn from guards
    const spawnPositions = getSpawnPositions();
    const guards = [...this.room.state.guards.values()];
    const spawn = spawnPositions.reduce((best, sp) => {
      const minDistToGuard = guards.reduce((min, g) => {
        const d = Math.sqrt((g.x - sp.x) ** 2 + (g.y - sp.y) ** 2);
        return Math.min(min, d);
      }, Infinity);
      const bestMinDist = guards.reduce((min, g) => {
        const d = Math.sqrt((g.x - best.x) ** 2 + (g.y - best.y) ** 2);
        return Math.min(min, d);
      }, Infinity);
      return minDistToGuard > bestMinDist ? sp : best;
    }, spawnPositions[0]);

    player.x = spawn.x;
    player.y = spawn.y;

    // Reset all chasing guards that were targeting this player
    for (const guard of this.room.state.guards.values()) {
      if (guard.targetPlayerId === sessionId) {
        guard.guardMode = "patrol";
        guard.targetPlayerId = "";
      }
    }

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

    // Try full movement first, then slide along axes if blocked
    const nx = player.x + ndx * PLAYER_SPEED;
    const ny = player.y + ndy * PLAYER_SPEED;

    if (isWalkable(Math.floor(nx), Math.floor(ny))) {
      player.x = nx;
      player.y = ny;
    } else if (isWalkable(Math.floor(nx), Math.floor(player.y))) {
      // Slide horizontally
      player.x = nx;
    } else if (isWalkable(Math.floor(player.x), Math.floor(ny))) {
      // Slide vertically
      player.y = ny;
    }
    // Otherwise fully blocked — no movement
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
