/**
 * Tests for client/app/src/lib/permissions.ts
 *
 * Verifies centralised permission & stream management:
 * - Mic stream caching and retrieval
 * - Motion permission session tracking
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import {
  cacheMicStream,
  getCachedMicStream,
  releaseMicStream,
  markMotionPermissionGranted,
  isMotionPermissionGrantedThisSession,
} from "./permissions";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Create a mock MediaStream with controllable track state. */
function mockStream(trackState: "live" | "ended" = "live"): MediaStream {
  const track = {
    readyState: trackState,
    stop: vi.fn(() => {
      track.readyState = "ended";
    }),
  };
  return {
    getAudioTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
}

// ── Mic stream cache ─────────────────────────────────────────────────────────

describe("mic stream cache", () => {
  beforeEach(() => {
    releaseMicStream();
  });

  it("returns null when no stream is cached", () => {
    expect(getCachedMicStream()).toBeNull();
  });

  it("returns the cached stream when tracks are live", () => {
    const s = mockStream("live");
    cacheMicStream(s);
    expect(getCachedMicStream()).toBe(s);
  });

  it("returns null and clears cache when tracks have ended", () => {
    const s = mockStream("ended");
    cacheMicStream(s);
    expect(getCachedMicStream()).toBeNull();
  });

  it("stops old stream when caching a new one", () => {
    const s1 = mockStream("live");
    const s2 = mockStream("live");
    cacheMicStream(s1);
    cacheMicStream(s2);
    expect(s1.getTracks()[0].stop).toHaveBeenCalled();
    expect(getCachedMicStream()).toBe(s2);
  });

  it("does not stop stream when re-caching the same one", () => {
    const s = mockStream("live");
    cacheMicStream(s);
    cacheMicStream(s);
    // stop should NOT have been called because same reference
    expect(s.getTracks()[0].stop).not.toHaveBeenCalled();
  });

  it("releaseMicStream stops tracks and clears cache", () => {
    const s = mockStream("live");
    cacheMicStream(s);
    releaseMicStream();
    expect(s.getTracks()[0].stop).toHaveBeenCalled();
    expect(getCachedMicStream()).toBeNull();
  });
});

// ── Motion permission session tracking ───────────────────────────────────────

describe("motion permission session tracking", () => {
  // NOTE: These tests run sequentially and share module-level state.
  // The `markMotionPermissionGranted` flag cannot be "unmarked" in the
  // current API (it's a one-way flag per page session), so we test in
  // the correct order.

  it("isMotionPermissionGrantedThisSession returns true on non-iOS (no requestPermission)", () => {
    // jsdom doesn't define DeviceMotionEvent.requestPermission, so this
    // simulates Android/desktop where motion is implicitly available.
    expect(isMotionPermissionGrantedThisSession()).toBe(true);
  });

  it("markMotionPermissionGranted sets the flag", () => {
    markMotionPermissionGranted();
    expect(isMotionPermissionGrantedThisSession()).toBe(true);
  });
});

describe("motion permission on iOS-like environment", () => {
  // Simulate iOS by adding requestPermission to DeviceMotionEvent
  const originalRequestPermission = (DeviceMotionEvent as any).requestPermission;

  beforeEach(() => {
    // Simulate iOS Safari
    (DeviceMotionEvent as any).requestPermission = vi.fn();
  });

  it("returns true when markMotionPermissionGranted was called", () => {
    // markMotionPermissionGranted was called in the previous describe block,
    // so the module-level flag is already set.
    expect(isMotionPermissionGrantedThisSession()).toBe(true);
  });

  // Clean up
  afterAll(() => {
    if (originalRequestPermission === undefined) {
      delete (DeviceMotionEvent as any).requestPermission;
    } else {
      (DeviceMotionEvent as any).requestPermission = originalRequestPermission;
    }
  });
});
