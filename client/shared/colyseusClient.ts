/**
 * client/shared/colyseusClient.ts
 *
 * Shared Colyseus connection helpers used by both TV and phone clients.
 * The server URL is injected at build time via Vite define (__SERVER_URL__).
 */

import * as Colyseus from "colyseus.js";

// __SERVER_URL__ is replaced at build time by Vite
declare const __SERVER_URL__: string;
const SERVER_URL: string = typeof __SERVER_URL__ !== "undefined"
  ? __SERVER_URL__
  : (import.meta.env?.VITE_SERVER_URL ?? "ws://localhost:2567");

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
