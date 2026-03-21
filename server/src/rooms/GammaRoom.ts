/**
 * server/src/rooms/GammaRoom.ts
 *
 * The single Colyseus room type used for all game sessions.
 *
 * Responsibilities
 * ────────────────
 * • Create and manage RoomState Schema
 * • Handle player/view-screen join and leave (including reconnect)
 * • Process lobby messages (select_game, update_config, start_game, player_ready)
 * • Dynamically load the selected game plugin at start time
 * • Route all in-game input messages to the active game plugin
 *
 * Security notes
 * ──────────────
 * • All game logic executes on the server; clients cannot modify state directly
 * • The host role is a flag (hostSessionId) — not elevated WebSocket permissions
 * • Phase transitions are server-authoritative; client messages only trigger
 *   them after server validation
 */

import { Room, Client } from "@colyseus/core";
import { RoomState } from "../schema/RoomState";
import { PlayerState } from "../schema/PlayerState";
import { GameConfig } from "../schema/GameConfig";
import { BaseGame } from "../games/BaseGame";
import { loadGame } from "../games/gameLoader";
import { generateRoomCode } from "../utils/rng";

/** Options passed from clients at join time. */
interface JoinOptions {
  role: "view_screen" | "player";
  name?: string;
  /** Reconnect token issued on first join. Present on reconnect. */
  reconnectToken?: string;
}

export class GammaRoom extends Room<RoomState> {
  /** The active game plugin instance. Null in lobby. */
  private game: BaseGame | null = null;

  // ── Colyseus lifecycle ────────────────────────────────────────────────────

  onCreate(_options: unknown): void {
    this.setState(new RoomState());
    this.state.roomCode = generateRoomCode();
    this.state.gameConfig = new GameConfig();

    // Expose room in Colyseus lobby (visible via monitor endpoint)
    this.setMetadata({ roomCode: this.state.roomCode });

    this._registerMessages();

    console.log(`[GammaRoom] created — code=${this.state.roomCode} id=${this.roomId}`);
  }

  onJoin(client: Client, options: JoinOptions): void {
    if (options.role === "view_screen") {
      this._onViewScreenJoin(client);
      return;
    }
    this._onPlayerJoin(client, options);
  }

  async onLeave(client: Client, consented: boolean): Promise<void> {
    const player = this.state.players.get(client.sessionId);
    if (player) {
      player.isConnected = false;
      console.log(`[GammaRoom] player disconnected — id=${client.sessionId} consented=${consented}`);

      if (!consented) {
        // Allow reconnect within grace window (default 30s)
        const graceSecs = Number(process.env.RECONNECT_GRACE_SECONDS ?? 30);
        try {
          await this.allowReconnection(client, graceSecs);
          player.isConnected = true;
          console.log(`[GammaRoom] player reconnected — id=${client.sessionId}`);
        } catch {
          console.log(`[GammaRoom] player reconnect timed out — id=${client.sessionId}`);
        }
      }
    }

    // If view screen disconnects, flip flag
    if (client.sessionId === this.state.hostSessionId && this.state.viewScreenConnected) {
      this.state.viewScreenConnected = false;
      console.log("[GammaRoom] view screen disconnected");
    }
  }

  onDispose(): void {
    if (this.game) {
      this.game.teardown();
      this.game = null;
    }
    console.log(`[GammaRoom] disposed — code=${this.state.roomCode}`);
  }

  // ── Join helpers ──────────────────────────────────────────────────────────

  private _onViewScreenJoin(client: Client): void {
    this.state.viewScreenConnected = true;
    if (!this.state.hostSessionId) {
      this.state.hostSessionId = client.sessionId;
    }
    console.log(`[GammaRoom] view screen joined — sessionId=${client.sessionId}`);
  }

  private _onPlayerJoin(client: Client, options: JoinOptions): void {
    // Reconnect: reuse existing PlayerState slot
    const existing = this.state.players.get(client.sessionId);
    if (existing) {
      existing.isConnected = true;
      return;
    }

    const player = new PlayerState();
    player.id = client.sessionId;
    player.name = (options.name ?? "Player").slice(0, 20);
    this.state.players.set(client.sessionId, player);

    // First player becomes host if no TV
    if (!this.state.hostSessionId) {
      this.state.hostSessionId = client.sessionId;
    }

    console.log(`[GammaRoom] player joined — id=${client.sessionId} name=${player.name}`);
  }

  // ── Message registration ──────────────────────────────────────────────────

  private _registerMessages(): void {
    /** Player taps "Ready" in lobby or instructions phase. */
    this.onMessage("player_ready", (client, _data) => {
      const p = this.state.players.get(client.sessionId);
      if (p) p.isReady = true;
    });

    /** Player cancels their ready state while still in lobby. */
    this.onMessage("player_unready", (client, _data) => {
      const p = this.state.players.get(client.sessionId);
      if (p && this.state.phase === "lobby") p.isReady = false;
    });

    /** Host selects a game from the list. TV / first player only. */
    this.onMessage("select_game", (client, data: { gameId: string }) => {
      if (!this._isHost(client)) return;
      this.state.selectedGame = data.gameId;
    });

    /** Host adjusts game config (round count, time limit, match mode). */
    this.onMessage(
      "update_config",
      (client, data: Partial<{ roundCount: number; timeLimitSecs: number; matchMode: string }>) => {
        if (!this._isHost(client)) return;
        if (data.roundCount !== undefined) {
          this.state.gameConfig.roundCount = Math.max(1, Math.min(data.roundCount, 10));
        }
        if (data.timeLimitSecs !== undefined) {
          this.state.gameConfig.timeLimitSecs = Math.max(10, Math.min(data.timeLimitSecs, 300));
        }
        if (data.matchMode === "ffa" || data.matchMode === "1v1_bracket") {
          this.state.gameConfig.matchMode = data.matchMode;
        }
      },
    );

    /** Host updates lobby setup criteria (location, activity, display). */
    this.onMessage(
      "update_setup",
      (client, data: Partial<{
        locationMode: string;
        activityLevel: string;
        hasSecondaryDisplay: boolean;
        setupStep: number;
      }>) => {
        if (!this._isHost(client)) return;
        if (data.locationMode === "same" || data.locationMode === "remote") {
          this.state.locationMode = data.locationMode;
        }
        if (data.activityLevel === "none" || data.activityLevel === "some" || data.activityLevel === "full") {
          this.state.activityLevel = data.activityLevel;
        }
        if (data.hasSecondaryDisplay !== undefined) {
          this.state.hasSecondaryDisplay = !!data.hasSecondaryDisplay;
        }
        if (data.setupStep !== undefined) {
          this.state.setupStep = Math.max(0, Math.min(data.setupStep, 4));
        }
      },
    );

    /** Host presses Start Game. */
    this.onMessage("start_game", (client, _data) => {
      if (!this._isHost(client)) return;
      this._startGame().catch((err) => {
        console.error("[GammaRoom] start_game error:", err);
      });
    });

    /**
     * In-game player input (movement, hide, etc.).
     * Routed to the active game plugin.
     */
    this.onMessage("game_input", (client, data: unknown) => {
      if (this.game) this.game.handleInput(client, data);
    });
  }

  // ── Game start ────────────────────────────────────────────────────────────

  private async _startGame(): Promise<void> {
    if (this.state.phase !== "lobby") {
      console.warn("[GammaRoom] start_game ignored — not in lobby phase");
      return;
    }
    if (!this.state.selectedGame) {
      console.warn("[GammaRoom] start_game ignored — no game selected");
      return;
    }

    const GameClass = await loadGame(this.state.selectedGame);

    // Enforce view screen requirement
    if (GameClass.requiresTV && !this.state.viewScreenConnected) {
      this.broadcast("error", { message: "This game requires a view screen to be connected." });
      return;
    }

    // Apply plugin defaults to config (host overrides take precedence)
    if (this.state.gameConfig.roundCount === 1 && GameClass.defaultRoundCount > 1) {
      this.state.gameConfig.roundCount = GameClass.defaultRoundCount;
    }

    this.game = new GameClass(this);
    this.game.start().catch((err) => {
      console.error("[GammaRoom] game error:", err);
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private _isHost(client: Client): boolean {
    return client.sessionId === this.state.hostSessionId;
  }
}
