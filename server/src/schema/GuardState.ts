/**
 * server/src/schema/GuardState.ts
 *
 * Schema for a single AI guard in registry-14.
 * Replicated to all clients so both TV and phones can render all guards.
 * Multiple guards are stored in RoomState.guards (MapSchema keyed by index string).
 */

import { Schema, type } from "@colyseus/schema";

export class GuardState extends Schema {
  /** Unique string key for this guard (matches the MapSchema key). */
  @type("string") id: string = "";
  /** World-space X position (tile units). */
  @type("number") x: number = 0;
  /** World-space Y position (tile units). */
  @type("number") y: number = 0;
  /** Direction the guard is facing in radians. 0 = right. */
  @type("number") facingAngle: number = 0;
  /** Index into the patrol path array. */
  @type("number") patrolIndex: number = 0;
  /** "patrol" | "alert" | "chase" */
  @type("string") guardMode: string = "patrol";
  /** Session ID of the player being chased (empty when patrolling). */
  @type("string") targetPlayerId: string = "";
}
