/**
 * server/src/games/gameLoader.ts
 *
 * Dynamic game plugin loader.
 *
 * Resolves a registry ID like "registry-14-dont-get-caught" to the
 * corresponding game class under server/src/games/<id>/index.ts.
 *
 * The loader enforces the plugin interface at runtime so that
 * misconfigured games fail loudly at load time, not mid-session.
 *
 * Adding a new game
 * ─────────────────
 * 1. Create server/src/games/<registry-id>/index.ts
 * 2. Export a default class that extends BaseGame
 * 3. Set the static metadata fields (requiresTV, defaultRoundCount, etc.)
 * 4. Implement runRound(), scoreRound(), handleInput()
 * 5. The game is automatically available — no registration step needed
 *
 * See docs/onboarding.md for the full guide.
 */

import path from "path";
import { BaseGame } from "./BaseGame";
import { Room } from "@colyseus/core";
import { RoomState } from "../schema/RoomState";

/** All required static metadata fields every game plugin must declare. */
const REQUIRED_STATIC_FIELDS = [
  "requiresTV",
  "supportsBracket",
  "defaultRoundCount",
  "minRounds",
  "maxRounds",
  "hasInstructionsPhase",
  "instructionsDelivery",
] as const;

/** All required instance methods every game plugin must implement. */
const REQUIRED_METHODS = ["start", "runRound", "scoreRound", "handleInput", "teardown"] as const;

type GameConstructor = {
  new (room: Room<RoomState>): BaseGame;
  requiresTV: boolean;
  supportsBracket: boolean;
  defaultRoundCount: number;
  minRounds: number;
  maxRounds: number;
  hasInstructionsPhase: boolean;
  instructionsDelivery: string;
};

/** In-memory cache so repeated room creates don't re-require the module. */
const cache = new Map<string, GameConstructor>();

/**
 * Dynamically import and validate a game plugin by registry ID.
 * Throws if the module is missing or does not satisfy the plugin interface.
 */
export async function loadGame(gameId: string): Promise<GameConstructor> {
  if (cache.has(gameId)) return cache.get(gameId)!;

  const modulePath = path.resolve(__dirname, gameId, "index");

  let mod: { default?: unknown };
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mod = require(modulePath) as { default?: unknown };
  } catch (err) {
    throw new Error(`[gameLoader] Cannot find game plugin at "${modulePath}": ${String(err)}`);
  }

  const GameClass = mod.default as GameConstructor | undefined;
  if (!GameClass || typeof GameClass !== "function") {
    throw new Error(`[gameLoader] Game plugin "${gameId}" must export a default class.`);
  }

  // Validate static metadata
  for (const field of REQUIRED_STATIC_FIELDS) {
    if (!(field in GameClass)) {
      throw new Error(`[gameLoader] Game plugin "${gameId}" is missing static field: ${field}`);
    }
  }

  // Validate instance methods
  for (const method of REQUIRED_METHODS) {
    if (typeof GameClass.prototype[method] !== "function") {
      throw new Error(`[gameLoader] Game plugin "${gameId}" is missing method: ${method}`);
    }
  }

  cache.set(gameId, GameClass);
  return GameClass;
}
