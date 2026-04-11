/**
 * client/shared/colyseusClient.ts
 *
 * Shared Colyseus connection helpers used by both TV and phone clients.
 *
 * Server URL resolution (in priority order):
 *   1. Build-time define: __SERVER_URL__ (set via VITE_SERVER_URL env var at build time)
 *   2. Runtime env var:   import.meta.env.VITE_SERVER_URL
 *   3. Auto-derived:      ws(s)://<same-host-as-page>:2567
 *
 * The auto-derive strategy (3) means that when a phone opens the page via the
 * host machine's LAN IP (e.g. http://192.168.1.5:5174), the server URL is
 * automatically resolved to ws://192.168.1.5:2567 — no manual config needed.
 *
 * IMPORTANT: vite.config.ts only injects __SERVER_URL__ when VITE_SERVER_URL
 * is explicitly set, so in dev mode the auto-derive always runs.
 */

import * as Colyseus from "colyseus.js";

const ROOM_CONNECT_TIMEOUT_MS = 8000;

// __SERVER_URL__ is replaced at build time by Vite only when VITE_SERVER_URL is set.
declare const __SERVER_URL__: string | undefined;

declare global {
  interface Window {
    __GAMMA_CONFIG__?: {
      serverUrl?: string;
    };
  }
}

function isBrowserReachableServerUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
      return false;
    }

    // Browsers outside the cluster cannot resolve Kubernetes service DNS names.
    if (hostname.endsWith(".svc") || hostname.includes(".svc.")) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function resolveServerUrl(): string {
  // 0. Runtime config injected by the container at deployment time.
  if (typeof window !== "undefined") {
    const runtimeServerUrl = window.__GAMMA_CONFIG__?.serverUrl;
    if (runtimeServerUrl && isBrowserReachableServerUrl(runtimeServerUrl)) {
      return runtimeServerUrl;
    }
  }

  // 1. Build-time override (only set when VITE_SERVER_URL env var is present at build)
  if (typeof __SERVER_URL__ !== "undefined" && __SERVER_URL__ && isBrowserReachableServerUrl(__SERVER_URL__)) {
    return __SERVER_URL__;
  }

  // 2. Explicit runtime env var
  if (import.meta.env?.VITE_SERVER_URL && isBrowserReachableServerUrl(import.meta.env.VITE_SERVER_URL as string)) {
    return import.meta.env.VITE_SERVER_URL as string;
  }

  // 3. Auto-derive from page origin so LAN/dev and public ingress both work.
  //    In Kubernetes, the ingress exposes the Colyseus server under /ws.
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const isDefaultPort =
      (window.location.protocol === "https:" && window.location.port === "443") ||
      (window.location.protocol === "http:" && window.location.port === "80") ||
      window.location.port === "";
    const originPort = isDefaultPort ? "" : `:${window.location.port}`;
    const isViteDevPort = window.location.port === "5173" || window.location.port === "5174";

    if (isViteDevPort) {
      return `${protocol}://${window.location.hostname}:2567`;
    }

    return `${protocol}://${window.location.hostname}${originPort}/ws`;
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

async function withConnectionTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("Timed out connecting to the room. Check server ingress and WebSocket routing."));
        }, ROOM_CONNECT_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Create a new room as a view screen (TV, laptop browser, projector).
 * The view screen becomes the host/admin and drives the setup wizard.
 * Returns the Colyseus Room instance.
 *
 * @deprecated TVs should no longer create rooms. Use joinAsViewer() instead.
 */
export async function hostRoom(): Promise<Colyseus.Room> {
  return withConnectionTimeout(getClient().create("gamma_room", { role: "view_screen" }));
}

/**
 * Join an existing room as a view screen (TV, laptop, projector).
 * The TV joins as a display-only participant — it cannot create rooms.
 *
 * @param roomCode  4-char room code created by a player host
 */
export async function joinAsViewer(roomCode: string): Promise<Colyseus.Room> {
  const client = getClient();
  const available = await client.getAvailableRooms("gamma_room");
  const match = available.find(
    (r) => (r.metadata as { roomCode?: string })?.roomCode === roomCode.toUpperCase(),
  );
  if (!match) throw new Error(`Room "${roomCode}" not found`);
  return withConnectionTimeout(client.joinById(match.roomId, { role: "view_screen" }));
}

/**
 * Create a new room as a player (no view screen required).
 * The creating player becomes the host/admin and drives the setup wizard
 * from their device.
 *
 * @param name  Player display name (max 20 chars)
 */
export async function createRoom(name: string): Promise<Colyseus.Room> {
  return withConnectionTimeout(getClient().create("gamma_room", { role: "player", name }));
}

/**
 * Join an existing room as a player.
 *
 * @param roomCode  4-char room code shown on the view screen or host device
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
  return withConnectionTimeout(client.joinById(match.roomId, { role: "player", name }));
}
