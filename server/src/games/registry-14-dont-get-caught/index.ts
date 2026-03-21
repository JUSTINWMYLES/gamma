/**
 * server/src/games/registry-14-dont-get-caught/index.ts
 *
 * "Don't Get Caught" — stealth game with a patrolling guard.
 *
 * Game Rules
 * ──────────
 * • Players spawn on the tile map and move using joystick inputs from phones.
 * • A guard patrols a fixed waypoint path.
 * • If the guard has line-of-sight (LOS) to a player who is NOT hiding,
 *   that player's detection meter fills.  At 100 they are "caught".
 * • Hiding (player pressed Hide while on a bush/crate tile) prevents detection.
 * • Players caught N times are eliminated.  Survivors score points.
 * • Adaptive AI: guard speed increases each round based on how many players
 *   evaded the previous round.
 *
 * Server Update Loop
 * ──────────────────
 * A setInterval ticks at TICK_RATE_MS (50ms = 20 Hz):
 *   1. Move guard towards next patrol waypoint (or chase target)
 *   2. For each connected non-eliminated player, run LOS check
 *   3. Update detection meters
 *   4. Broadcast nothing (Schema replication handles it)
 *
 * See docs/registry-14-design.md for algorithm details.
 */

import { Client } from "@colyseus/core";
import { BaseGame } from "../BaseGame";
import {
  GAME_MAP,
  PATROL_PATH,
  SPAWN_POSITIONS,
  GUARD_START,
  isWalkable,
  isHidingSpot,
} from "../../utils/tilemap";
import { canGuardSeeTarget } from "../../utils/los";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Server tick rate in milliseconds (20 Hz). */
const TICK_RATE_MS = 50;

/** Detection meter increment per tick when guard has LOS on a visible player. */
const DETECTION_INCREMENT = 4; // 100 / 4 = ~1.25s to full detection at 20Hz

/** Detection meter decrement per tick when guard does NOT have LOS. */
const DETECTION_DECREMENT = 2;

/** Guard patrol speed in tiles-per-second (normal difficulty). */
const BASE_GUARD_SPEED = 2.0;

/** Guard speed multiplier when chasing a detected player. */
const CHASE_SPEED_MULTIPLIER = 1.6;

/** How many times a player can be caught before elimination. */
const CATCH_LIMIT = 3;

/** Points awarded for surviving the round (not eliminated at round end). */
const SURVIVAL_POINTS = 100;

/** Points deducted each time a player is caught. */
const CAUGHT_PENALTY = 20;

/** FOV half-angle for guard vision (π/3 = 60° each side, 120° total). */
const FOV_HALF_ANGLE = Math.PI / 3;

/** Guard sight range in tiles. */
const GUARD_RANGE = 6;

/** Alert threshold: detection meter value that switches guard to "alert" mode. */
const ALERT_THRESHOLD = 30;

// ── Input message type ────────────────────────────────────────────────────────

interface InputMessage {
  /** "move" = directional input; "hide" = toggle hide state */
  action: "move" | "hide";
  /** For "move": normalised direction vector. Values in [-1, 1]. */
  dx?: number;
  dy?: number;
  /** For "hide": explicitly set desired state */
  hiding?: boolean;
}

// ── Game class ────────────────────────────────────────────────────────────────

export default class DontGetCaughtGame extends BaseGame {
  // ── Static metadata ───────────────────────────────────────────────────────
  static override requiresTV = false;
  static override supportsBracket = false;
  static override defaultRoundCount = 3;
  static override minRounds = 1;
  static override maxRounds = 5;
  static override hasInstructionsPhase = true;
  static override instructionsDelivery = "broadcast" as const;

  // ── Instance state ────────────────────────────────────────────────────────

  /** Current guard speed (tiles/s). Scales with adaptive difficulty. */
  private guardSpeed: number = BASE_GUARD_SPEED;

  /** Tick interval handle. */
  private tickInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Per-round counters used for adaptive difficulty.
   * Key = sessionId, value = number of times caught this round.
   */
  private caughtThisRound = new Map<string, number>();

  /** Resolves when the round ends (all players eliminated or timer fires). */
  private roundResolve: (() => void) | null = null;

  /** Track the current round number for scoring. */
  private currentRound = 0;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  protected override async onLoad(): Promise<void> {
    // Reset player positions and detection state
    const players = [...this.room.state.players.values()];
    players.forEach((p, i) => {
      const spawn = SPAWN_POSITIONS[i % SPAWN_POSITIONS.length];
      p.x = spawn.x;
      p.y = spawn.y;
      p.isHiding = false;
      p.isDetected = false;
      p.detectionMeter = 0;
      p.timesCaught = 0;
      p.isEliminated = false;
      p.isReady = false;
    });

    // Reset guard
    this.room.state.guard.x = GUARD_START.x;
    this.room.state.guard.y = GUARD_START.y;
    this.room.state.guard.facingAngle = 0;
    this.room.state.guard.patrolIndex = 0;
    this.room.state.guard.guardMode = "patrol";
    this.room.state.guard.targetPlayerId = "";
  }

  protected override async runRound(round: number): Promise<void> {
    this.currentRound = round;
    this.caughtThisRound.clear();

    // Reset per-round state for all alive players
    for (const p of this.room.state.players.values()) {
      if (!p.isEliminated) {
        p.isHiding = false;
        p.isDetected = false;
        p.detectionMeter = 0;
        p.timesCaught = 0;
      }
    }

    // Reset guard to start
    this.room.state.guard.x = GUARD_START.x;
    this.room.state.guard.y = GUARD_START.y;
    this.room.state.guard.patrolIndex = 0;
    this.room.state.guard.guardMode = "patrol";
    this.room.state.guard.targetPlayerId = "";

    const roundDurationMs = this.room.state.gameConfig.timeLimitSecs * 1000;

    // Start server tick loop
    await new Promise<void>((resolve) => {
      this.roundResolve = resolve;

      this.tickInterval = setInterval(() => this._tick(), TICK_RATE_MS);

      // Auto-end after time limit
      setTimeout(() => {
        this._endRound();
      }, roundDurationMs);
    });
  }

  protected override scoreRound(_round: number): void {
    for (const p of this.room.state.players.values()) {
      if (!p.isEliminated) {
        p.score += SURVIVAL_POINTS;
      }
      // Deduct for each catch
      const caught = this.caughtThisRound.get(p.id) ?? 0;
      p.score = Math.max(0, p.score - caught * CAUGHT_PENALTY);
    }

    // Adaptive difficulty: if fewer than half the players were caught, speed up
    const totalPlayers = this.room.state.players.size;
    const caughtCount = [...this.caughtThisRound.values()].filter((n) => n > 0).length;
    if (caughtCount < totalPlayers / 2) {
      this.guardSpeed = Math.min(this.guardSpeed * 1.2, BASE_GUARD_SPEED * 2);
    } else {
      // Ease off if most players are struggling
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

    if (input.action === "hide") {
      this._handleHide(player.id, input.hiding ?? !player.isHiding);
    }
  }

  override teardown(): void {
    super.teardown();
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  // ── Tick ──────────────────────────────────────────────────────────────────

  /**
   * Main 20 Hz server tick.
   * 1. Move guard
   * 2. Run LOS checks
   * 3. Update detection meters
   * 4. Handle catches
   */
  private _tick(): void {
    this._moveGuard();
    this._checkDetections();
    this._checkRoundEnd();
  }

  // ── Guard movement ────────────────────────────────────────────────────────

  private _moveGuard(): void {
    const guard = this.room.state.guard;
    const dt = TICK_RATE_MS / 1000; // seconds per tick

    if (guard.guardMode === "chase" && guard.targetPlayerId) {
      const target = this.room.state.players.get(guard.targetPlayerId);
      if (!target || target.isEliminated || !target.isConnected) {
        // Lost target — return to patrol
        guard.guardMode = "patrol";
        guard.targetPlayerId = "";
      } else {
        this._moveTowards(guard, target.x, target.y, this.guardSpeed * CHASE_SPEED_MULTIPLIER * dt);
        return;
      }
    }

    // Patrol mode: move towards current waypoint
    const waypoint = PATROL_PATH[guard.patrolIndex % PATROL_PATH.length];
    const arrived = this._moveTowards(guard, waypoint.x, waypoint.y, this.guardSpeed * dt);
    if (arrived) {
      guard.patrolIndex = (guard.patrolIndex + 1) % PATROL_PATH.length;
    }
  }

  /**
   * Move an entity towards (targetX, targetY) by at most `speed` tiles.
   * Updates facingAngle. Returns true when the entity has arrived.
   */
  private _moveTowards(
    entity: { x: number; y: number; facingAngle: number },
    targetX: number,
    targetY: number,
    speed: number,
  ): boolean {
    const dx = targetX - entity.x;
    const dy = targetY - entity.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.05) return true; // arrived

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
    const guard = this.room.state.guard;

    for (const player of this.room.state.players.values()) {
      if (!player.isConnected || player.isEliminated) continue;

      // Player is hiding in a valid spot — no detection possible
      if (player.isHiding && isHidingSpot(Math.floor(player.x), Math.floor(player.y))) {
        player.detectionMeter = Math.max(0, player.detectionMeter - DETECTION_DECREMENT);
        player.isDetected = false;
        continue;
      }

      const visible = canGuardSeeTarget(
        { x: guard.x, y: guard.y },
        guard.facingAngle,
        { x: player.x, y: player.y },
        GAME_MAP,
        FOV_HALF_ANGLE,
        GUARD_RANGE,
      );

      if (visible) {
        player.isDetected = true;
        player.detectionMeter = Math.min(100, player.detectionMeter + DETECTION_INCREMENT);

        // Switch guard to alert / chase on partial detection
        if (player.detectionMeter >= ALERT_THRESHOLD && guard.guardMode === "patrol") {
          guard.guardMode = "alert";
        }
        if (player.detectionMeter >= 100 && guard.guardMode !== "chase") {
          guard.guardMode = "chase";
          guard.targetPlayerId = player.id;
        }

        // Fully caught
        if (player.detectionMeter >= 100) {
          this._catchPlayer(player.id);
        }
      } else {
        player.isDetected = false;
        player.detectionMeter = Math.max(0, player.detectionMeter - DETECTION_DECREMENT);

        // Calm guard if no visible targets remain
        if (
          guard.targetPlayerId === player.id &&
          player.detectionMeter === 0
        ) {
          guard.guardMode = "patrol";
          guard.targetPlayerId = "";
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

    // Respawn at original spawn
    const players = [...this.room.state.players.keys()];
    const spawnIdx = players.indexOf(sessionId) % SPAWN_POSITIONS.length;
    const spawn = SPAWN_POSITIONS[spawnIdx];
    player.x = spawn.x;
    player.y = spawn.y;
    player.isHiding = false;

    // Reset guard to patrol after a catch
    this.room.state.guard.guardMode = "patrol";
    this.room.state.guard.targetPlayerId = "";

    // Eliminate after CATCH_LIMIT catches
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

    // Clamp direction to unit vector
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;
    const ndx = dx / len;
    const ndy = dy / len;

    const PLAYER_SPEED = 0.15; // tiles per input event (phone sends ~20 events/s)
    const nx = player.x + ndx * PLAYER_SPEED;
    const ny = player.y + ndy * PLAYER_SPEED;

    // Server-authoritative collision check
    if (isWalkable(Math.floor(nx), Math.floor(ny))) {
      player.x = nx;
      player.y = ny;
      // Moving cancels hiding
      player.isHiding = false;
    }
  }

  private _handleHide(sessionId: string, hiding: boolean): void {
    const player = this.room.state.players.get(sessionId);
    if (!player) return;

    // Can only hide on valid hiding spots
    if (hiding && !isHidingSpot(Math.floor(player.x), Math.floor(player.y))) return;

    player.isHiding = hiding;
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
    if (!this.tickInterval) return; // already ended

    clearInterval(this.tickInterval);
    this.tickInterval = null;

    if (this.roundResolve) {
      this.roundResolve();
      this.roundResolve = null;
    }
  }
}
