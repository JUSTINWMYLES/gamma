import { describe, expect, it } from "vitest";
import {
  buildAudioOverlayClipProxyPath,
  parseAudioOverlayObjectStoreConfig,
  sanitizeAudioOverlayClipId,
} from "../src/utils/audioOverlayObjectStore";

describe("Audio Overlay object store config", () => {
  it("returns null when the endpoint env is absent", () => {
    expect(parseAudioOverlayObjectStoreConfig({})).toBeNull();
  });

  it("parses explicit env overrides", () => {
    const config = parseAudioOverlayObjectStoreConfig({
      AUDIO_OVERLAY_OBJECT_STORE_ENDPOINT: "https://seaweedfs.gamma.svc.cluster.local:9443",
      AUDIO_OVERLAY_OBJECT_STORE_USE_SSL: "false",
      AUDIO_OVERLAY_OBJECT_STORE_ACCESS_KEY: "clip-user",
      AUDIO_OVERLAY_OBJECT_STORE_SECRET_KEY: "clip-secret",
      AUDIO_OVERLAY_OBJECT_STORE_BUCKET: "custom-clips",
      AUDIO_OVERLAY_OBJECT_STORE_PREFIX: "/audio-overlay/custom/",
    });

    expect(config).toEqual({
      endpoint: "seaweedfs.gamma.svc.cluster.local:9443",
      useSSL: true,
      accessKey: "clip-user",
      secretKey: "clip-secret",
      bucket: "custom-clips",
      prefix: "audio-overlay/custom",
    });
  });

  it("uses defaults for optional values", () => {
    const config = parseAudioOverlayObjectStoreConfig({
      AUDIO_OVERLAY_OBJECT_STORE_ENDPOINT: "object-store:8333",
    });

    expect(config).toEqual({
      endpoint: "object-store:8333",
      useSSL: false,
      accessKey: "gamma",
      secretKey: "gammalocal",
      bucket: "gamma-audio-overlay-clips",
      prefix: "audio-overlay-clips",
    });
  });
});

describe("Audio Overlay clip ids", () => {
  it("accepts valid generated ids", () => {
    expect(sanitizeAudioOverlayClipId("123e4567-e89b-12d3-a456-426614174000")).toBe(
      "123e4567-e89b-12d3-a456-426614174000",
    );
  });

  it("rejects invalid ids", () => {
    expect(sanitizeAudioOverlayClipId("../nope")).toBeNull();
    expect(sanitizeAudioOverlayClipId("")).toBeNull();
  });

  it("builds proxy paths", () => {
    expect(buildAudioOverlayClipProxyPath("clip-123")).toBe(
      "/api/audio-overlay/clips/clip-123",
    );
  });
});
