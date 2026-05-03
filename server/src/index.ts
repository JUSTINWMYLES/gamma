/**
 * server/src/index.ts
 *
 * Entry point for the Gamma game server.
 * Sets up Express HTTP (health + static monitoring endpoint) and
 * attaches the Colyseus WebSocket transport on the same port.
 *
 * OpenTelemetry is initialised before any other server setup so that
 * all spans/metrics are captured from the start.
 *
 * Port defaults to 2567 (standard Colyseus port).
 * Override with the PORT environment variable.
 */

// Load .env file before anything else reads process.env
import "dotenv/config";

import { initTelemetry } from "./telemetry";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { RedisPresence } from "@colyseus/redis-presence";
import { RedisDriver } from "@colyseus/redis-driver";
import { GammaRoom } from "./rooms/GammaRoom";
import { fetchTTSArtifact, isTTSEnabled } from "./games/registry-45-news-broadcast/ttsApiClient";
import {
  fetchAudioOverlayClip,
  isAudioOverlayObjectStoreEnabled,
  sanitizeAudioOverlayClipId,
} from "./utils/audioOverlayObjectStore";

const PORT = Number(process.env.PORT ?? 2567);
const TTS_JOB_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,127})$/;

function sanitizeTTSJobId(value: string): string | null {
  const trimmed = value.trim();
  return TTS_JOB_ID_PATTERN.test(trimmed) ? trimmed : null;
}

async function main() {
  // Initialise OpenTelemetry before setting up the server
  await initTelemetry();

  // ── HTTP layer ──────────────────────────────────────────────────────────────
  const app = express();
  app.use(cors());
  app.use(express.json());

  /** Health probe used by Docker Compose and Kubernetes liveness checks. */
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", ts: Date.now() });
  });

  const handleAudioOverlayClipProxy: express.RequestHandler = async (req, res) => {
    const clipId = sanitizeAudioOverlayClipId(req.params.clipId ?? "");
    if (!clipId) {
      res.status(400).json({ error: "invalid clipId" });
      return;
    }

    if (!isAudioOverlayObjectStoreEnabled()) {
      res.status(404).json({ error: "Audio Overlay object store is not enabled" });
      return;
    }

    const clip = await fetchAudioOverlayClip(clipId);
    if (!clip) {
      res.status(502).json({ error: "Failed to reach audio clip storage" });
      return;
    }

    if (!clip.ok) {
      res.status(clip.status).json({ error: clip.error });
      return;
    }

    res.setHeader("Content-Type", clip.contentType);
    res.setHeader("Content-Length", clip.bytes.byteLength.toString());
    res.setHeader("Cache-Control", clip.cacheControl ?? "private, max-age=300");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.status(200).send(clip.bytes);
  };

  const handleTTSAudioProxy: express.RequestHandler = async (req, res) => {
    const jobId = sanitizeTTSJobId(req.params.jobId ?? "");
    if (!jobId) {
      res.status(400).json({ error: "invalid jobId" });
      return;
    }

    if (!isTTSEnabled()) {
      res.status(503).json({ error: "TTS is not enabled" });
      return;
    }

    const artifact = await fetchTTSArtifact(jobId);
    if (!artifact) {
      res.status(502).json({ error: "Failed to reach TTS artifact service" });
      return;
    }

    if (!artifact.ok) {
      res.status(artifact.status).json({ error: artifact.error });
      return;
    }

    res.setHeader("Content-Type", artifact.contentType);
    res.setHeader("Content-Length", artifact.bytes.byteLength.toString());
    res.setHeader("Cache-Control", artifact.cacheControl ?? "private, max-age=30");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.status(200).send(artifact.bytes);
  };

  app.get([
    "/api/audio-overlay/clips/:clipId",
    "/ws/api/audio-overlay/clips/:clipId",
  ], handleAudioOverlayClipProxy);
  app.get(["/api/tts/audio/:jobId", "/ws/api/tts/audio/:jobId"], handleTTSAudioProxy);

  const httpServer = createServer(app);

  // ── Colyseus WebSocket layer ────────────────────────────────────────────────
  const stateBackend = process.env.STATE_BACKEND ?? "memory";
  const redisURL = process.env.REDIS_URL;

  const serverOpts: ConstructorParameters<typeof Server>[0] = {
    transport: new WebSocketTransport({
      server: httpServer,
      maxPayload: 4 * 1024 * 1024, // 4 MB – accommodates large game state payloads
    }),
  };

  if (stateBackend === "redis" && redisURL) {
    console.log(`[gamma] using Redis backend: ${redisURL}`);
    serverOpts.presence = new RedisPresence(redisURL);
    serverOpts.driver = new RedisDriver(redisURL);
  } else {
    console.log("[gamma] using in-memory backend (no Redis)");
  }

  const gameServer = new Server(serverOpts);

  /** Register all Colyseus rooms. Game plugins are loaded inside GammaRoom. */
  gameServer.define("gamma_room", GammaRoom);

  // ── Boot ───────────────────────────────────────────────────────────────────
  httpServer.listen(PORT, () => {
    console.log(`[gamma] server listening on http://localhost:${PORT}`);
    console.log(`[gamma] WebSocket endpoint  ws://localhost:${PORT}`);
    console.log(`[gamma] KLIPY_API_KEY: ${process.env.KLIPY_API_KEY ? "configured" : "NOT SET — GIF search will not work"}`);
  });

  // Graceful shutdown on SIGTERM (Kubernetes pod termination)
  process.on("SIGTERM", () => {
    gameServer.gracefullyShutdown();
  });
}

main().catch((err) => {
  console.error("[gamma] fatal startup error:", err);
  process.exit(1);
});
