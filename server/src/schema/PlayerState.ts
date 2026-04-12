/**
 * server/src/schema/PlayerState.ts
 *
 * Colyseus Schema for a single connected player.
 * Replicated to all clients on every change.
 */

import { Schema, type } from "@colyseus/schema";

export class PlayerState extends Schema {
  /** Colyseus session ID — stable across reconnects via the reconnect token. */
  @type("string") id: string = "";

  /** Display name chosen on the join screen. */
  @type("string") name: string = "";

  /** Cumulative score across all rounds. */
  @type("number") score: number = 0;

  /** Whether the player has tapped the "Ready" button in the lobby. */
  @type("boolean") isReady: boolean = false;

  /** True while the WebSocket session is open. */
  @type("boolean") isConnected: boolean = true;

  /** Epoch ms when the current disconnect window started. Zero while connected. */
  @type("number") disconnectedAt: number = 0;

  /** True once the player has been eliminated in the current game. */
  @type("boolean") isEliminated: boolean = false;

  /** Bracket seed — set at game start when matchMode is 1v1_bracket. */
  @type("number") bracketSeed: number = -1;

  /** Opponent session ID for the current 1v1 match. Empty string when FFA. */
  @type("string") currentMatchOpponentId: string = "";

  // ── Player customization (icon / avatar) ──────────────────────────────────
  /** Selected emoji for the player's icon circle. */
  @type("string") iconEmoji: string = "";

  /** Short text label for the player's icon (1-3 chars, e.g. initials). */
  @type("string") iconText: string = "";

  /** Background color for the player's icon circle (Tailwind-compatible hex). */
  @type("string") iconBgColor: string = "";

  /** Structured custom icon designer payload (JSON string). */
  @type("string") iconDesign: string = "";

  /** Microphone permission state captured in the lobby. */
  @type("string") micPermission: "unknown" | "granted" | "denied" = "unknown";

  /** Motion/orientation permission state captured in the lobby. */
  @type("string") motionPermission: "unknown" | "granted" | "denied" = "unknown";

  // ── registry-14 specific fields ───────────────────────────────────────────
  /** World-space X position (tile units). */
  @type("number") x: number = 0;
  /** World-space Y position (tile units). */
  @type("number") y: number = 0;
  /** True when any guard has LOS on this player. */
  @type("boolean") isDetected: boolean = false;
  /** Detection meter 0–100. Reaches 100 → caught. */
  @type("number") detectionMeter: number = 0;
  /** Number of times caught this round. */
  @type("number") timesCaught: number = 0;
}
