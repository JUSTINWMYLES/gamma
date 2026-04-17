/**
 * client/app/src/lib/permissions.ts
 *
 * Centralised permission & stream management for device capabilities
 * (microphone, motion/orientation sensors).
 *
 * ## Design
 *
 * The lobby asks for permissions once via `requestAllPermissions()`.
 * The microphone stream obtained during that consent flow is kept alive
 * so that game components can reuse it without triggering a second
 * browser permission prompt.
 *
 * Motion permissions on iOS Safari must be requested via
 * `DeviceMotionEvent.requestPermission()` from a user-gesture handler.
 * Unlike mic, this cannot be "stored" — it is session-scoped.  We keep
 * a flag so that components can check whether the current page session
 * already obtained the permission.
 */

// ── Microphone stream cache ──────────────────────────────────────────────────

let _cachedMicStream: MediaStream | null = null;

/**
 * Store a microphone MediaStream so game components can reuse it
 * without calling getUserMedia again (which may re-prompt on some browsers).
 */
export function cacheMicStream(stream: MediaStream): void {
  // If we already have a different cached stream, stop the old one.
  if (_cachedMicStream && _cachedMicStream !== stream) {
    _cachedMicStream.getTracks().forEach((t) => t.stop());
  }
  _cachedMicStream = stream;
}

/**
 * Return the cached mic stream, or `null` if none is available.
 * Callers should check that the stream's tracks are still active.
 */
export function getCachedMicStream(): MediaStream | null {
  if (!_cachedMicStream) return null;
  // Verify at least one audio track is still live
  const live = _cachedMicStream.getAudioTracks().some((t) => t.readyState === "live");
  if (!live) {
    _cachedMicStream = null;
    return null;
  }
  return _cachedMicStream;
}

/**
 * Stop and discard the cached mic stream.
 */
export function releaseMicStream(): void {
  if (_cachedMicStream) {
    _cachedMicStream.getTracks().forEach((t) => t.stop());
    _cachedMicStream = null;
  }
}

// ── Motion permission session tracking ──────────────────────────────────────

let _motionPermissionGrantedThisSession = false;

/**
 * Mark that the iOS motion/orientation `requestPermission()` was called
 * and returned "granted" in the current page session.
 */
export function markMotionPermissionGranted(): void {
  _motionPermissionGrantedThisSession = true;
}

/**
 * Whether `DeviceMotionEvent.requestPermission()` has been called and
 * returned "granted" during the current page session.
 *
 * On platforms where `requestPermission` does not exist (Android, desktop),
 * motion events fire without explicit permission — this function returns
 * `true` for convenience.
 */
export function isMotionPermissionGrantedThisSession(): boolean {
  if (_motionPermissionGrantedThisSession) return true;

  // On platforms that don't gate motion behind requestPermission, treat
  // it as implicitly granted.
  const motion = DeviceMotionEvent as unknown as {
    requestPermission?: () => Promise<string>;
  };
  return typeof motion.requestPermission !== "function";
}
