/**
 * server/src/index.ts
 *
 * Entry point for the Gamma game server.
 * Sets up Express HTTP (health + static monitoring endpoint) and
 * attaches the Colyseus WebSocket transport on the same port.
 *
 * Port defaults to 2567 (standard Colyseus port).
 * Override with the PORT environment variable.
 */

import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GammaRoom } from "./rooms/GammaRoom";

const PORT = Number(process.env.PORT ?? 2567);

// ── HTTP layer ────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

/** Health probe used by Docker Compose and Kubernetes liveness checks. */
app.get("/health", (_req, res) => {
  res.json({ status: "ok", ts: Date.now() });
});

const httpServer = createServer(app);

// ── Colyseus WebSocket layer ──────────────────────────────────────────────────
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

/** Register all Colyseus rooms. Game plugins are loaded inside GammaRoom. */
gameServer.define("gamma_room", GammaRoom);

// ── Boot ─────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`[gamma] server listening on http://localhost:${PORT}`);
  console.log(`[gamma] WebSocket endpoint  ws://localhost:${PORT}`);
});

// Graceful shutdown on SIGTERM (Kubernetes pod termination)
process.on("SIGTERM", () => {
  gameServer.gracefullyShutdown();
});
