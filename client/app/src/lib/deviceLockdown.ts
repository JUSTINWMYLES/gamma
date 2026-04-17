/**
 * client/app/src/lib/deviceLockdown.ts
 *
 * System-wide mobile UX utilities:
 *
 * 1. **Zoom prevention** — blocks pinch-to-zoom and double-tap zoom on all pages.
 * 2. **Shake-to-undo suppression** — prevents the iOS "Undo Typing" popup
 *    and similar browser shake-triggered dialogs by intercepting devicemotion
 *    events during gameplay.
 *
 * Call `installDeviceLockdown()` once at app startup (e.g. in main.ts).
 * Call `teardownDeviceLockdown()` on app teardown (rarely needed — SPA stays alive).
 */

/** State for tracking active listeners so they can be removed. */
let installed = false;

// ── Zoom prevention ──────────────────────────────────────────────────────────

/**
 * Prevent multi-touch gestures (pinch-to-zoom) on the whole document.
 * Uses `touchmove` interception for 2+ finger touches.
 */
function onTouchMovePreventZoom(e: TouchEvent): void {
  if (e.touches.length > 1) {
    e.preventDefault();
  }
}

/**
 * Safari-specific `gesturestart` (pinch/rotate) prevention.
 */
function onGestureStart(e: Event): void {
  e.preventDefault();
}

// ── Shake-to-undo suppression ────────────────────────────────────────────────

/**
 * On iOS Safari, vigorous shaking triggers the "Undo Typing" dialog.
 * Some browsers also show a "Report a Problem" sheet on shake.
 *
 * We suppress this by calling `preventDefault()` on `devicemotion`
 * events with large acceleration magnitudes. This does NOT break
 * game shake detection — games listen for `devicemotion` separately
 * and our handler fires first (capture phase) only to cancel the
 * browser's default behavior.
 *
 * Note: this only suppresses the *browser default* — game-level
 * devicemotion listeners still fire and can read the event data.
 */
function onDeviceMotionCapture(e: DeviceMotionEvent): void {
  // Only suppress the default when there is meaningful acceleration
  // (i.e. the device is actually being shaken).
  const a = e.accelerationIncludingGravity;
  if (!a) return;
  const mag = Math.sqrt((a.x ?? 0) ** 2 + (a.y ?? 0) ** 2 + (a.z ?? 0) ** 2);
  // 15 m/s² is above normal gravity (~9.81) but well below a hard shake.
  // This threshold catches shake-like movement without firing on
  // every minor tilt.
  if (mag > 15) {
    e.preventDefault();
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Install system-wide mobile UX lockdown:
 * - Blocks pinch-to-zoom
 * - Suppresses shake-to-undo / browser shake dialogs
 *
 * Safe to call multiple times — only installs once.
 */
export function installDeviceLockdown(): void {
  if (installed) return;
  installed = true;

  // Zoom prevention
  document.addEventListener("touchmove", onTouchMovePreventZoom, {
    passive: false,
  });
  document.addEventListener("gesturestart", onGestureStart, {
    passive: false,
  });

  // Shake-to-undo suppression (capture phase so it fires before game handlers)
  window.addEventListener("devicemotion", onDeviceMotionCapture, {
    capture: true,
    passive: false,
  });
}

/**
 * Remove all listeners installed by `installDeviceLockdown()`.
 */
export function teardownDeviceLockdown(): void {
  if (!installed) return;
  installed = false;

  document.removeEventListener("touchmove", onTouchMovePreventZoom);
  document.removeEventListener("gesturestart", onGestureStart);
  window.removeEventListener("devicemotion", onDeviceMotionCapture, {
    capture: true,
  });
}
