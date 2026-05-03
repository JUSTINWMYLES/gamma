/**
 * client/app/src/lib/roomConnector.ts
 *
 * Manages session persistence, room wiring, and connection flows.
 * Extracted from App.svelte (M1).
 */
import type { Room } from "colyseus.js";
import type { RoomState } from "../../../shared/types";
import { joinRoom, createRoom, joinAsViewer } from "../../../shared/colyseusClient";

const SESSION_KEY = "gamma-session";

export interface SessionInfo {
  roomCode: string;
  name: string;
  role: "player" | "viewer";
}

export function saveSession(info: SessionInfo): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(info));
  } catch { /* quota exceeded or private browsing — non-critical */ }
}

export function loadSession(): SessionInfo | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionInfo;
  } catch { return null; }
}

export function clearSession(): void {
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
}

export function describeError(e: unknown): string {
  if (e instanceof Error) return e.message;

  if (typeof e === "object" && e !== null) {
    const maybeEvent = e as { type?: string; message?: unknown; constructor?: { name?: string } };
    const tag = Object.prototype.toString.call(e);
    if (maybeEvent.type === "error" || maybeEvent.type === "timeout" || maybeEvent.constructor?.name === "ProgressEvent" || tag === "[object ProgressEvent]") {
      return "Could not reach the game server. This browser may not support the required connection features, or the public server URL/WebSocket routing may be blocked.";
    }
    if (typeof maybeEvent.message === "string" && maybeEvent.message.length > 0) {
      return maybeEvent.message;
    }
  }

  return String(e);
}

/**
 * Wire a newly joined/created room to the app's state variables.
 * Returns a cleanup function that removes the Colyseus listeners.
 */
export function wireRoom(
  r: Room<RoomState>,
  callbacks: {
    onStateChange: (state: RoomState, phase: string) => void;
    onError: (error: string) => void;
    onLeave: (error: string) => void;
  },
): () => void {
  r.onStateChange((s) => {
    callbacks.onStateChange(s, s.phase);
  });

  r.onError((code: number, msg?: string) => {
    const error = `Server error ${code}: ${msg ?? "unknown"}`;
    callbacks.onError(error);
  });

  r.onLeave((code: number) => {
    if (code === 4001) {
      callbacks.onLeave("You were kicked from the room by the host.");
    } else {
      callbacks.onLeave("Disconnected from server.");
    }
  });

  return () => {
    r.removeAllListeners();
  };
}

export async function viewerJoinRoom(
  roomCode: string,
): Promise<Room<RoomState>> {
  return joinAsViewer(roomCode);
}

export async function onJoin(
  roomCode: string,
  name: string,
): Promise<Room<RoomState>> {
  return joinRoom(roomCode, name);
}

export async function onHost(
  name: string,
): Promise<Room<RoomState>> {
  return createRoom(name);
}
