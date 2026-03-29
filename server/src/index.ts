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
import { GammaRoom } from "./rooms/GammaRoom";

const PORT = Number(process.env.PORT ?? 2567);

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

  const httpServer = createServer(app);

  // ── Colyseus WebSocket layer ────────────────────────────────────────────────
  const gameServer = new Server({
    transport: new WebSocketTransport({
      server: httpServer,
      maxPayload: 4 * 1024 * 1024, // 4 MB – default 4 KB kills audio payloads
    }),
  });

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
