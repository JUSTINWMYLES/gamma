/**
 * Tests for client/app/src/lib/deviceLockdown.ts
 *
 * Verifies system-wide mobile UX lockdown:
 * - Pinch-to-zoom prevention (multi-touch + gesturestart)
 * - Shake-to-undo suppression (devicemotion capture-phase handler)
 * - Idempotent install/teardown
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { installDeviceLockdown, teardownDeviceLockdown } from "./deviceLockdown";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fireTouchMove(touchCount: number): { prevented: boolean } {
  const evt = new TouchEvent("touchmove", {
    cancelable: true,
    touches: Array.from({ length: touchCount }, (_, i) => ({
      identifier: i,
      clientX: 0,
      clientY: 0,
      pageX: 0,
      pageY: 0,
      screenX: 0,
      screenY: 0,
      radiusX: 0,
      radiusY: 0,
      rotationAngle: 0,
      force: 0,
      target: document.body,
    })) as unknown as Touch[],
  });
  document.dispatchEvent(evt);
  return { prevented: evt.defaultPrevented };
}

function fireGestureStart(): { prevented: boolean } {
  const evt = new Event("gesturestart", { cancelable: true });
  document.dispatchEvent(evt);
  return { prevented: evt.defaultPrevented };
}

function fireDeviceMotion(magnitude: number): { prevented: boolean } {
  // DeviceMotionEvent may not be fully implemented in jsdom, so we
  // dispatch a generic Event on the window and rely on our handler
  // checking accelerationIncludingGravity. We need to construct a
  // real-ish DeviceMotionEvent.
  const evt = new Event("devicemotion", { cancelable: true }) as DeviceMotionEvent;
  // Patch acceleration data onto the event.
  Object.defineProperty(evt, "accelerationIncludingGravity", {
    value: { x: magnitude, y: 0, z: 0 },
  });
  window.dispatchEvent(evt);
  return { prevented: evt.defaultPrevented };
}

// ── Test suite ───────────────────────────────────────────────────────────────

describe("deviceLockdown", () => {
  beforeEach(() => {
    teardownDeviceLockdown();
  });

  afterEach(() => {
    teardownDeviceLockdown();
  });

  // ── Install / teardown ───────────────────────────────────────────

  it("should be idempotent — installing twice does not double-register", () => {
    installDeviceLockdown();
    installDeviceLockdown(); // second call should be no-op
    const { prevented } = fireGestureStart();
    expect(prevented).toBe(true);
  });

  it("should remove all listeners on teardown", () => {
    installDeviceLockdown();
    teardownDeviceLockdown();
    const { prevented } = fireGestureStart();
    expect(prevented).toBe(false);
  });

  // ── Zoom prevention ──────────────────────────────────────────────

  it("should prevent multi-touch touchmove (pinch zoom)", () => {
    installDeviceLockdown();
    const { prevented } = fireTouchMove(2);
    expect(prevented).toBe(true);
  });

  it("should NOT prevent single-touch touchmove (normal scroll)", () => {
    installDeviceLockdown();
    const { prevented } = fireTouchMove(1);
    expect(prevented).toBe(false);
  });

  it("should prevent gesturestart events", () => {
    installDeviceLockdown();
    const { prevented } = fireGestureStart();
    expect(prevented).toBe(true);
  });

  // ── Shake-to-undo suppression ────────────────────────────────────

  it("should prevent devicemotion default when acceleration exceeds threshold", () => {
    installDeviceLockdown();
    // 20 m/s² > 15 threshold
    const { prevented } = fireDeviceMotion(20);
    expect(prevented).toBe(true);
  });

  it("should NOT prevent devicemotion default for low acceleration", () => {
    installDeviceLockdown();
    // 5 m/s² < 15 threshold
    const { prevented } = fireDeviceMotion(5);
    expect(prevented).toBe(false);
  });

  it("should NOT prevent devicemotion default when not installed", () => {
    // Don't install
    const { prevented } = fireDeviceMotion(20);
    expect(prevented).toBe(false);
  });
});
