/**
 * server/src/config.ts
 *
 * Shared server configuration constants.
 * Centralizes values that are referenced by multiple modules
 * (GammaRoom, BaseGame, game plugins) to prevent drift.
 */

/** Maximum time (seconds) a disconnected player slot remains reclaimable. */
export const RECONNECT_GRACE_SECONDS = Number(process.env.RECONNECT_GRACE_SECONDS ?? 30);

/** Maximum time (ms) a disconnected player slot remains reclaimable. */
export const RECONNECT_GRACE_MS = RECONNECT_GRACE_SECONDS * 1000;

/** Time (seconds) after which a disconnected player no longer blocks waits
 * (voting, submissions, readiness checks). Shorter than RECONNECT_GRACE_SECONDS
 * so the room can progress while still retaining the player's slot. */
export const ACTIVE_WAIT_TOLERANCE_SECONDS = Number(process.env.ACTIVE_WAIT_TOLERANCE_SECONDS ?? 15);

/** Same as above, in milliseconds. */
export const ACTIVE_WAIT_TOLERANCE_MS = ACTIVE_WAIT_TOLERANCE_SECONDS * 1000;
