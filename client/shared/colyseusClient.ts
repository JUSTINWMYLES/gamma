/**
 * client/shared/colyseusClient.ts
 *
 * Shared Colyseus connection helpers used by both TV and phone clients.
 *
 * Server URL resolution (in priority order):
 *   1. Build-time define: __SERVER_URL__ (set via Vite `define` in vite.config.ts)
 *   2. Runtime env var:   import.meta.env.VITE_SERVER_URL
 *   3. Auto-derived:      ws(s)://<same-host-as-page>:2567
 *
 * The auto-derive strategy (3) means that when a phone opens the page via the
 * host machine's LAN IP (e.g. http://192.168.1.5:5174), the server URL is
 * automatically resolved to ws://192.168.1.5:2567 — no manual config needed.
 */

import * as Colyseus from "colyseus.js";

// __SERVER_URL__ is replaced at build time by Vite
declare const __SERVER_URL__: string;

function resolveServerUrl(): string {
  // 1. Build-time override (production builds can bake in the server URL)
  if (typeof __SERVER_URL__ !== "undefined" && __SERVER_URL__) {
    return __SERVER_URL__;
  }

  // 2. Explicit runtime env var
  if (import.meta.env?.VITE_SERVER_URL) {
    return import.meta.env.VITE_SERVER_URL as string;
  }

  // 3. Auto-derive from page origin so cross-device LAN access works out of the box.
  //    The Vite dev servers (ports 5173/5174) are served from the same host as
  //    the Colyseus server (port 2567).  Using the page's hostname keeps this
  //    working whether the user opens via localhost, 127.0.0.1, or a LAN IP.
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${window.location.hostname}:2567`;
  }

  // Fallback for SSR / test environments
  return "ws://localhost:2567";
}

const SERVER_URL: string = resolveServerUrl();

let _client: Colyseus.Client | null = null;

export function getClient(): Colyseus.Client {
  if (!_client) _client = new Colyseus.Client(SERVER_URL);
  return _client;
}

/**
 * Create a new room as the TV display.
 * Returns the Colyseus Room instance.
 */
export async function hostRoom(): Promise<Colyseus.Room> {
  return getClient().create("gamma_room", { role: "tv" });
}

/**
 * Join an existing room as a player.
 *
 * @param roomCode  4-char room code shown on the TV
 * @param name      Player display name (max 20 chars)
 */
export async function joinRoom(roomCode: string, name: string): Promise<Colyseus.Room> {
  // Colyseus rooms are identified by their Colyseus room ID.
  // We use filterBy metadata to find the room with a matching code.
  const client = getClient();
  const available = await client.getAvailableRooms("gamma_room");
  const match = available.find(
    (r) => (r.metadata as { roomCode?: string })?.roomCode === roomCode.toUpperCase(),
  );
  if (!match) throw new Error(`Room "${roomCode}" not found`);
  return client.joinById(match.roomId, { role: "player", name });
}
