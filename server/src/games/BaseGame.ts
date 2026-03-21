/**
 * server/src/games/BaseGame.ts
 *
 * Abstract base class that every game plugin must extend.
 *
 * Plugin contract
 * ───────────────
 * Each game lives in its own directory:
 *   server/src/games/<registry-id>/
 *
 * The directory must export a default class that:
 *   • extends BaseGame
 *   • sets static metadata (requiresTV, defaultRoundCount, etc.)
 *   • implements runRound(), scoreRound(), and handleInput()
 *
 * The loader (gameLoader.ts) imports these classes dynamically by registry ID.
 *
 * Lifecycle (called by GammaRoom)
 * ────────────────────────────────
 *   start()           ← kicks off the full session
 *     onLoad()        ← override: preload assets, request sensors
 *     instructions()  ← optional phase before countdown
 *     runRounds()     ← loops through configured round count
 *       runRound(n)   ← override: per-round authoritative logic
 *       scoreRound(n) ← override: award points after round
 *   teardown()        ← override: cleanup timers/intervals
 */

import { Room, Client } from "@colyseus/core";
import { RoomState, Phase } from "../schema/RoomState";

export abstract class BaseGame {
  // ── Plugin metadata (set on subclass, not instances) ─────────────────────

  /** If true, the room blocks game start when no TV is connected. */
  static requiresTV: boolean = false;

  /** If true, this game supports the 1v1 bracket match mode. */
  static supportsBracket: boolean = false;

  /** Default round count. Host can override via GameConfig. */
  static defaultRoundCount: number = 1;
  static minRounds: number = 1;
  static maxRounds: number = 10;

  /** Whether to show the instructions phase before the first countdown. */
  static hasInstructionsPhase: boolean = false;

  /**
   * How instructions are delivered:
   *   "broadcast"  — all clients get them simultaneously
   *   "staggered"  — random delays per player
   *   "private"    — each player gets a different message
   */
  static instructionsDelivery: "broadcast" | "staggered" | "private" =
    "broadcast";

  // ── Instance ─────────────────────────────────────────────────────────────

  protected room: Room<RoomState>;

  /** All active per-round timers/intervals; cleared in teardown(). */
  private _timers: ReturnType<typeof setTimeout>[] = [];

  constructor(room: Room<RoomState>) {
    this.room = room;
  }

  // ── Public entry point ────────────────────────────────────────────────────

  /**
   * Called once by GammaRoom when the host presses Start.
   * Drives the full session lifecycle.
   */
  async start(): Promise<void> {
    this.setPhase("game_loading");
    await this.onLoad();

    const ctor = this.constructor as typeof BaseGame;
    if (ctor.hasInstructionsPhase) {
      this.setPhase("instructions");
      await this.waitForAllReady();
    }

    await this.runRounds();
    this.setPhase("game_over");
  }

  // ── Overridable hooks ─────────────────────────────────────────────────────

  /** Override to pre-load assets, request sensors, seed state, etc. */
  protected async onLoad(): Promise<void> {}

  /** Override with the per-round authoritative game logic. */
  protected abstract runRound(round: number): Promise<void>;

  /** Override to compute and apply scores after each round. */
  protected abstract scoreRound(round: number): void;

  /** Override to handle player input messages during a round. */
  abstract handleInput(client: Client, data: unknown): void;

  /** Override to clean up intervals/timeouts and release resources. */
  teardown(): void {
    for (const t of this._timers) clearTimeout(t);
    this._timers = [];
  }

  // ── Round loop ────────────────────────────────────────────────────────────

  protected async runRounds(): Promise<void> {
    const total = this.room.state.gameConfig.roundCount;

    for (let r = 1; r <= total; r++) {
      this.room.state.currentRound = r;
      this.room.state.roundDurationSecs = this.room.state.gameConfig.timeLimitSecs;

      this.setPhase("countdown");
      await this.delay(3000);

      this.setPhase("in_round");
      this.room.state.phaseStartedAt = Date.now();
      await this.runRound(r);

      this.scoreRound(r);
      this.setPhase("round_end");
      await this.delay(4000);
    }

    this.setPhase("scoreboard");
    await this.delay(6000);
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  protected setPhase(phase: Phase): void {
    this.room.state.phase = phase;
    this.room.state.phaseStartedAt = Date.now();
  }

  /**
   * Awaitable delay that also registers the timer for cleanup.
   */
  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      this._timers.push(t);
    });
  }

  /**
   * Resolves when every connected, non-eliminated player has isReady = true.
   * Includes a 30-second timeout to prevent indefinite stalling.
   */
  protected waitForAllReady(timeoutMs: number = 30_000): Promise<void> {
    return new Promise((resolve) => {
      const check = (): boolean => {
        const active = [...this.room.state.players.values()].filter(
          (p) => p.isConnected && !p.isEliminated,
        );
        return active.length > 0 && active.every((p) => p.isReady);
      };

      if (check()) { resolve(); return; }

      const interval = setInterval(() => {
        if (check()) {
          clearInterval(interval);
          resolve();
        }
      }, 200);

      const timeout = setTimeout(() => {
        clearInterval(interval);
        resolve();
      }, timeoutMs);

      this._timers.push(timeout);
    });
  }

  /** Broadcast a message to all connected clients. */
  protected broadcast(type: string, payload: unknown): void {
    this.room.broadcast(type, payload);
  }

  /** Send a private message to one client. */
  protected send(sessionId: string, type: string, payload: unknown): void {
    const client = [...(this.room.clients as Iterable<Client>)].find(
      (c) => c.sessionId === sessionId,
    );
    if (client) client.send(type, payload);
  }
}
