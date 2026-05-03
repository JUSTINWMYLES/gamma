/**
 * client/app/src/lib/deviceLockdown.ts
 *
 * System-wide mobile UX utilities:
 *
 * 1. **Zoom prevention** — blocks pinch-to-zoom and double-tap zoom on all pages.
 * 2. **Pull-to-refresh prevention** — blocks downward overscroll at the top of
 *    the page so mobile browsers do not refresh during gameplay.
 * 3. **Shake-to-undo suppression** — prevents the iOS "Undo Typing" popup
 *    and similar browser shake-triggered dialogs by intercepting devicemotion
 *    events during gameplay.
 * 4. **Screen wake lock** — keeps the display awake while the app is visible
 *    when the Screen Wake Lock API is available.
 *
 * Call `installDeviceLockdown()` once at app startup (e.g. in main.ts).
 * Call `teardownDeviceLockdown()` on app teardown (rarely needed — SPA stays alive).
 */

/** State for tracking active listeners so they can be removed. */
let installed = false;
let lastSingleTouchY: number | null = null;
let wakeLockSentinel: ScreenWakeLockSentinelLike | null = null;
let wakeLockRequestInFlight: Promise<void> | null = null;

/**
 * Minimum acceleration magnitude (m/s²) that triggers shake-to-undo
 * suppression. Above normal gravity (~9.81) but below a hard shake.
 */
const SHAKE_SUPPRESS_THRESHOLD = 15;

type ScreenWakeLockSentinelLike = EventTarget & {
  readonly released: boolean;
  release(): Promise<void>;
};

type NavigatorWakeLockLike = Navigator & {
  wakeLock?: {
    request(type: "screen"): Promise<ScreenWakeLockSentinelLike>;
  };
};

// ── Zoom prevention ──────────────────────────────────────────────────────────

/**
 * Track the starting Y position for single-touch gestures so pull-to-refresh
 * can be suppressed when the page is already at its top edge.
 */
function onTouchStart(e: TouchEvent): void {
  lastSingleTouchY = e.touches.length === 1
    ? (e.touches[0]?.clientY ?? null)
    : null;
}

/**
 * Prevent multi-touch gestures (pinch-to-zoom) and downward top-edge pulls
 * that would otherwise trigger browser pull-to-refresh.
 */
function onTouchMovePreventZoom(e: TouchEvent): void {
  if (e.touches.length > 1) {
    e.preventDefault();
    return;
  }

  if (e.touches.length !== 1) {
    return;
  }

  const currentTouchY = e.touches[0]?.clientY;
  if (typeof currentTouchY !== "number") {
    return;
  }

  const previousTouchY = lastSingleTouchY;
  lastSingleTouchY = currentTouchY;

  if (
    previousTouchY !== null &&
    currentTouchY > previousTouchY &&
    shouldPreventPullToRefresh(e.target)
  ) {
    e.preventDefault();
  }
}

function onTouchEnd(): void {
  lastSingleTouchY = null;
}

function shouldPreventPullToRefresh(target: EventTarget | null): boolean {
  const scrollableAncestor = findScrollableAncestor(target);
  if (scrollableAncestor) {
    return scrollableAncestor.scrollTop <= 0;
  }

  const scrollingElement = document.scrollingElement ?? document.documentElement;
  return scrollingElement.scrollTop <= 0;
}

function findScrollableAncestor(target: EventTarget | null): HTMLElement | null {
  let current = target instanceof Element ? target : null;

  while (current) {
    if (current instanceof HTMLElement && isVerticallyScrollable(current)) {
      return current;
    }
    current = current.parentElement;
  }

  return null;
}

function isVerticallyScrollable(element: HTMLElement): boolean {
  const { overflowY } = window.getComputedStyle(element);
  return ["auto", "scroll", "overlay"].includes(overflowY) && element.scrollHeight > element.clientHeight;
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
  if (mag > SHAKE_SUPPRESS_THRESHOLD) {
    e.preventDefault();
  }
}

// ── Screen wake lock ─────────────────────────────────────────────────────────

function getWakeLock(): NavigatorWakeLockLike["wakeLock"] | undefined {
  return (navigator as NavigatorWakeLockLike).wakeLock;
}

function detachWakeLockSentinel(): ScreenWakeLockSentinelLike | null {
  const sentinel = wakeLockSentinel;
  if (!sentinel) {
    return null;
  }

  sentinel.removeEventListener("release", onWakeLockRelease);
  wakeLockSentinel = null;
  return sentinel;
}

async function requestScreenWakeLock(): Promise<void> {
  if (!installed || document.visibilityState !== "visible") {
    return;
  }

  if (wakeLockSentinel?.released) {
    detachWakeLockSentinel();
  }

  if (wakeLockSentinel) {
    return;
  }

  const wakeLock = getWakeLock();
  if (!wakeLock) {
    return;
  }

  if (wakeLockRequestInFlight) {
    return wakeLockRequestInFlight;
  }

  wakeLockRequestInFlight = (async () => {
    try {
      const sentinel = await wakeLock.request("screen");

      if (!installed || document.visibilityState !== "visible") {
        try {
          await sentinel.release();
        } catch {
          // Ignore release failures when cleaning up after a late request.
        }
        return;
      }

      detachWakeLockSentinel();
      wakeLockSentinel = sentinel;
      wakeLockSentinel.addEventListener("release", onWakeLockRelease);
    } catch {
      // Gracefully degrade when unsupported, denied, or temporarily unavailable.
    } finally {
      wakeLockRequestInFlight = null;
    }
  })();

  return wakeLockRequestInFlight;
}

async function releaseScreenWakeLock(): Promise<void> {
  const sentinel = detachWakeLockSentinel();
  if (!sentinel || sentinel.released) {
    return;
  }

  try {
    await sentinel.release();
  } catch {
    // Ignore release failures during teardown/backgrounding.
  }
}

function onWakeLockRelease(): void {
  detachWakeLockSentinel();
}

function onVisibilityChange(): void {
  if (document.visibilityState === "visible") {
    void requestScreenWakeLock();
    return;
  }

  void releaseScreenWakeLock();
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Install system-wide mobile UX lockdown:
 * - Blocks pinch-to-zoom
 * - Blocks pull-to-refresh at the top edge
 * - Suppresses shake-to-undo / browser shake dialogs
 * - Requests a screen wake lock while the page is visible (when supported)
 *
 * Safe to call multiple times — only installs once.
 */
export function installDeviceLockdown(): void {
  if (installed) return;
  installed = true;
  lastSingleTouchY = null;

  // Zoom prevention
  document.addEventListener("touchstart", onTouchStart, {
    passive: true,
  });
  document.addEventListener("touchmove", onTouchMovePreventZoom, {
    passive: false,
  });
  document.addEventListener("touchend", onTouchEnd, {
    passive: true,
  });
  document.addEventListener("touchcancel", onTouchEnd, {
    passive: true,
  });
  document.addEventListener("gesturestart", onGestureStart, {
    passive: false,
  });
  document.addEventListener("visibilitychange", onVisibilityChange);

  // Shake-to-undo suppression (capture phase so it fires before game handlers)
  window.addEventListener("devicemotion", onDeviceMotionCapture, {
    capture: true,
    passive: false,
  });

  void requestScreenWakeLock();
}

/**
 * Remove all listeners installed by `installDeviceLockdown()`.
 */
export function teardownDeviceLockdown(): void {
  if (!installed) return;
  installed = false;
  lastSingleTouchY = null;

  document.removeEventListener("touchstart", onTouchStart);
  document.removeEventListener("touchmove", onTouchMovePreventZoom);
  document.removeEventListener("touchend", onTouchEnd);
  document.removeEventListener("touchcancel", onTouchEnd);
  document.removeEventListener("gesturestart", onGestureStart);
  document.removeEventListener("visibilitychange", onVisibilityChange);
  window.removeEventListener("devicemotion", onDeviceMotionCapture, {
    capture: true,
  });

  void releaseScreenWakeLock();
}
