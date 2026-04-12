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

import { Room, Client, ServerError } from "@colyseus/core";
import { RoomState } from "../schema/RoomState";
import { PlayerState } from "../schema/PlayerState";
import { GameConfig } from "../schema/GameConfig";
import { BaseGame } from "../games/BaseGame";
import { loadGame } from "../games/gameLoader";
import { generateRoomCode } from "../utils/rng";
import { meter, tracer } from "../telemetry";
import { SpanStatusCode, type Span } from "@opentelemetry/api";
import { ArraySchema } from "@colyseus/schema";
import {
  sanitizePlayerName,
  playerNamesMatch,
} from "./playerNameUtils";

/** Options passed from clients at join time. */
interface JoinOptions {
  role: "view_screen" | "player";
  name?: string;
  /** Reconnect token issued on first join. Present on reconnect. */
  reconnectToken?: string;
}

const RECONNECT_GRACE_MS = Number(process.env.RECONNECT_GRACE_SECONDS ?? 60) * 1000;

function getDefaultGameMode(gameId: string): string {
  if (gameId === "registry-25-lowball-marketplace") return "classic";
  if (gameId === "registry-26-audio-overlay") return "randomized";
  if (gameId === "registry-04-escape-maze") return "individual";
  return "default";
}

export class GammaRoom extends Room<RoomState> {
  /** The active game plugin instance. Null in lobby. */
  private game: BaseGame | null = null;

  /** Session ID of the connected view screen (TV/projector). */
  private viewScreenSessionId: string | null = null;

  /** OTEL span tracking the entire game session (from start_game to game_over/dispose). */
  private gameSessionSpan: Span | null = null;

  // ── OTEL metrics ──────────────────────────────────────────────────────────
  private static roomsCreated = meter.createCounter("gamma.rooms.created", {
    description: "Total rooms created",
  });
  private static playersJoined = meter.createCounter("gamma.players.joined", {
    description: "Total player joins (including reconnects)",
  });
  private static viewScreensJoined = meter.createCounter("gamma.view_screens.joined", {
    description: "Total view screen joins",
  });
  private static gamesStarted = meter.createCounter("gamma.games.started", {
    description: "Total games started",
  });
  private static gamesCompleted = meter.createCounter("gamma.games.completed", {
    description: "Total games that ran to completion",
  });
  private static playerDisconnects = meter.createCounter("gamma.players.disconnected", {
    description: "Total player disconnections",
  });
  private static playerReconnects = meter.createCounter("gamma.players.reconnected", {
    description: "Total successful player reconnections",
  });
  private static activeRooms = meter.createUpDownCounter("gamma.rooms.active", {
    description: "Currently active rooms",
  });

  // ── Colyseus lifecycle ────────────────────────────────────────────────────

  onCreate(_options: unknown): void {
    this.setState(new RoomState());
    this.state.roomCode = generateRoomCode();
    this.state.gameConfig = new GameConfig();

    // Expose room in Colyseus lobby (visible via monitor endpoint)
    this.setMetadata({ roomCode: this.state.roomCode });

    this._registerMessages();

    GammaRoom.roomsCreated.add(1, { roomCode: this.state.roomCode });
    GammaRoom.activeRooms.add(1);

    console.log(`[GammaRoom] created — code=${this.state.roomCode} id=${this.roomId}`);
  }

  onJoin(client: Client, options: JoinOptions): void {
    if (options.role === "view_screen") {
      this._onViewScreenJoin(client);
      return;
    }
    this._onPlayerJoin(client, options);
  }

  onAuth(_client: Client, options: JoinOptions): boolean {
    if (options.role !== "player") return true;

    const incomingName = sanitizePlayerName(options.name);
    if (this._findConnectedPlayerByName(incomingName)) {
      throw new ServerError(4002, `The name "${incomingName}" is already taken in this lobby.`);
    }

    return true;
  }

  async onLeave(client: Client, consented: boolean): Promise<void> {
    const player = this.state.players.get(client.sessionId);
    if (player) {
      player.isConnected = false;
      player.disconnectedAt = consented ? 0 : Date.now();
      GammaRoom.playerDisconnects.add(1, {
        roomCode: this.state.roomCode,
        consented: String(consented),
      });
      console.log(`[GammaRoom] player disconnected — id=${client.sessionId} consented=${consented}`);

      if (!consented) {
        // Allow reconnect within grace window (default 60s)
        const graceSecs = Number(process.env.RECONNECT_GRACE_SECONDS ?? 60);
        try {
          await this.allowReconnection(client, graceSecs);
          player.isConnected = true;
          player.disconnectedAt = 0;
          GammaRoom.playerReconnects.add(1, { roomCode: this.state.roomCode });
          console.log(`[GammaRoom] player reconnected — id=${client.sessionId}`);
        } catch {
          console.log(`[GammaRoom] player reconnect timed out — id=${client.sessionId}`);
        }
      }
    }

    // If view screen disconnects, flip flag
    if (client.sessionId === this.viewScreenSessionId) {
      this.state.viewScreenConnected = false;
      this.viewScreenSessionId = null;
      console.log("[GammaRoom] view screen disconnected");
    }
  }

  onDispose(): void {
    if (this.game) {
      this.game.teardown();
      this.game = null;
    }
    // End any active game session span
    if (this.gameSessionSpan) {
      this.gameSessionSpan.setStatus({ code: SpanStatusCode.OK });
      this.gameSessionSpan.end();
      this.gameSessionSpan = null;
    }
    GammaRoom.activeRooms.add(-1);
    console.log(`[GammaRoom] disposed — code=${this.state.roomCode}`);
  }

  // ── Join helpers ──────────────────────────────────────────────────────────

  private _onViewScreenJoin(client: Client): void {
    this.state.viewScreenConnected = true;
    this.viewScreenSessionId = client.sessionId;
    // TV/view screens are display-only — they never become the host.
    // The room creator (phone player) retains all navigation privileges.
    GammaRoom.viewScreensJoined.add(1, { roomCode: this.state.roomCode });
    console.log(`[GammaRoom] view screen joined — sessionId=${client.sessionId}`);
  }

  private _onPlayerJoin(client: Client, options: JoinOptions): void {
    // Reconnect (same sessionId): reuse existing PlayerState slot.
    // This handles Colyseus's built-in allowReconnection() path.
    const existing = this.state.players.get(client.sessionId);
    if (existing) {
      existing.isConnected = true;
      existing.disconnectedAt = 0;
      return;
    }

    // ── Name-based reconnection ──────────────────────────────────────────────
    // When a player refreshes the page they get a new sessionId, so the
    // sessionId-based check above won't match.  If there's a disconnected
    // player with the same name, reclaim that slot — preserving score and
    // all game-specific state.
    const incomingName = sanitizePlayerName(options.name);
    const disconnected = this._findDisconnectedPlayerByName(incomingName);

    if (disconnected) {
      const oldId = disconnected.id;

      // Migrate the PlayerState to the new sessionId
      this.state.players.delete(oldId);
      disconnected.id = client.sessionId;
      disconnected.isConnected = true;
      disconnected.disconnectedAt = 0;
      this.state.players.set(client.sessionId, disconnected);

      // If the reconnecting player was the host, update hostSessionId
      if (this.state.hostSessionId === oldId) {
        this.state.hostSessionId = client.sessionId;
      }

      // Update any opponent references that point to the old sessionId
      // (e.g., 1v1 bracket matches in TapSpeed)
      for (const p of this.state.players.values()) {
        if (p.currentMatchOpponentId === oldId) {
          p.currentMatchOpponentId = client.sessionId;
        }
      }

      // Notify the active game plugin so it can update internal state
      if (this.game) {
        this.game.onPlayerReconnected?.(oldId, client.sessionId, client);
      }

      GammaRoom.playerReconnects.add(1, { roomCode: this.state.roomCode });
      console.log(
        `[GammaRoom] player reconnected by name — oldId=${oldId} newId=${client.sessionId} name=${incomingName}`,
      );
      return;
    }

    // ── Fresh join ───────────────────────────────────────────────────────────
    const player = new PlayerState();
    player.id = client.sessionId;
    player.name = incomingName;
    player.disconnectedAt = 0;
    this.state.players.set(client.sessionId, player);

    // First player becomes host if no TV
    if (!this.state.hostSessionId) {
      this.state.hostSessionId = client.sessionId;
    }

    GammaRoom.playersJoined.add(1, {
      roomCode: this.state.roomCode,
      playerName: player.name,
    });
    console.log(`[GammaRoom] player joined — id=${client.sessionId} name=${player.name}`);
  }

  /**
   * Find a disconnected player with the given name.
   * Returns the first match, or null if none found.
   */
  private _findDisconnectedPlayerByName(name: string): PlayerState | null {
    for (const player of this.state.players.values()) {
      if (!player.isConnected && this._isWithinReconnectGrace(player) && playerNamesMatch(player.name, name)) {
        return player;
      }
    }
    return null;
  }

  private _findConnectedPlayerByName(name: string): PlayerState | null {
    for (const player of this.state.players.values()) {
      if (player.isConnected && playerNamesMatch(player.name, name)) {
        return player;
      }
    }
    return null;
  }

  private _isWithinReconnectGrace(player: PlayerState): boolean {
    return player.disconnectedAt > 0 && Date.now() - player.disconnectedAt < RECONNECT_GRACE_MS;
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

    /** Player customizes their icon/avatar (allowed during lobby). */
    this.onMessage(
      "customize_player",
      (
        client,
        data: {
          iconEmoji?: string;
          iconText?: string;
          iconBgColor?: string;
          iconDesign?: string;
        },
      ) => {
        const p = this.state.players.get(client.sessionId);
        if (!p) return;
        // Only allow customization during lobby phase
        if (this.state.phase !== "lobby") return;

        // Validate and set emoji (max 4 chars to cover multi-codepoint emoji)
        if (typeof data.iconEmoji === "string") {
          p.iconEmoji = data.iconEmoji.slice(0, 4);
        }
        // Validate and set text (max 3 chars)
        if (typeof data.iconText === "string") {
          p.iconText = data.iconText.slice(0, 3);
        }
        // Validate and set bg color (must look like a hex color or preset name)
        if (typeof data.iconBgColor === "string" && data.iconBgColor.length <= 20) {
          p.iconBgColor = data.iconBgColor;
        }
        if (typeof data.iconDesign === "string") {
          p.iconDesign = data.iconDesign.slice(0, 20_000);
        }
      },
    );

    this.onMessage(
      "update_permissions",
      (
        client,
        data: Partial<{
          mic: "unknown" | "granted" | "denied";
          motion: "unknown" | "granted" | "denied";
        }>,
      ) => {
        const p = this.state.players.get(client.sessionId);
        if (!p) return;

        if (data.mic === "unknown" || data.mic === "granted" || data.mic === "denied") {
          p.micPermission = data.mic;
        }
        if (
          data.motion === "unknown" ||
          data.motion === "granted" ||
          data.motion === "denied"
        ) {
          p.motionPermission = data.motion;
        }
      },
    );

    /** Host kicks a player from the room (lobby only). */
    this.onMessage("kick_player", (client, data: { targetId: string }) => {
      if (!this._isHost(client)) return;
      if (this.state.phase !== "lobby") return;
      const targetId = data.targetId;
      if (!targetId || targetId === client.sessionId) return; // can't kick self

      // Remove from state
      this.state.players.delete(targetId);

      // Disconnect the client
      const targetClient = [...(this.clients as Iterable<Client>)].find(
        (c) => c.sessionId === targetId,
      );
      if (targetClient) {
        targetClient.send("kicked", { message: "You were removed from the room by the host." });
        targetClient.leave(4001); // custom close code for "kicked"
      }

      console.log(`[GammaRoom] host kicked player — target=${targetId}`);
    });

    /** Host selects a game from the list. TV / first player only. */
    this.onMessage("select_game", async (client, data: { gameId: string }) => {
      if (!this._isHost(client)) return;
      this.state.selectedGame = data.gameId;

      try {
        const GameClass = await loadGame(data.gameId);
        this.state.gameConfig.roundCount = GameClass.defaultRoundCount;
        if (typeof GameClass.defaultTimeLimitSecs === "number") {
          this.state.gameConfig.timeLimitSecs = GameClass.defaultTimeLimitSecs;
        }
      } catch (err) {
        console.error(`[GammaRoom] Failed to load game ${data.gameId} for defaults:`, err);
      }

      // Keep game-specific config sane when switching games.
      if (data.gameId === "registry-25-lowball-marketplace") {
        if (
          this.state.gameConfig.gameMode !== "classic" &&
          this.state.gameConfig.gameMode !== "funny_messages"
        ) {
          this.state.gameConfig.gameMode = getDefaultGameMode(data.gameId);
        }
      } else if (data.gameId === "registry-26-audio-overlay") {
        if (
          this.state.gameConfig.gameMode !== "randomized" &&
          this.state.gameConfig.gameMode !== "record_own"
        ) {
          this.state.gameConfig.gameMode = getDefaultGameMode(data.gameId);
        }
      } else if (data.gameId === "registry-04-escape-maze") {
        if (
          this.state.gameConfig.gameMode !== "individual" &&
          this.state.gameConfig.gameMode !== "team"
        ) {
          this.state.gameConfig.gameMode = getDefaultGameMode(data.gameId);
        }
      } else {
        this.state.gameConfig.gameMode = getDefaultGameMode(data.gameId);
      }
    });

    /** Host adjusts game config (round count, time limit, match mode). */
    this.onMessage(
      "update_config",
      (
        client,
        data: Partial<{
          roundCount: number;
          practiceRoundEnabled: boolean;
          timeLimitSecs: number;
          matchMode: string;
          gameMode: string;
        }>,
      ) => {
        if (!this._isHost(client)) return;
        if (data.roundCount !== undefined) {
          this.state.gameConfig.roundCount = Math.max(1, Math.min(data.roundCount, 10));
        }
        if (data.practiceRoundEnabled !== undefined) {
          this.state.gameConfig.practiceRoundEnabled = !!data.practiceRoundEnabled;
        }
        if (data.timeLimitSecs !== undefined) {
          this.state.gameConfig.timeLimitSecs = Math.max(10, Math.min(data.timeLimitSecs, 300));
        }
        if (data.matchMode === "ffa" || data.matchMode === "1v1_bracket") {
          this.state.gameConfig.matchMode = data.matchMode;
        }
        if (
          data.gameMode !== undefined &&
          (data.gameMode === "default" ||
            data.gameMode === "classic" ||
            data.gameMode === "funny_messages" ||
            data.gameMode === "randomized" ||
            data.gameMode === "record_own" ||
            data.gameMode === "individual" ||
            data.gameMode === "team")
        ) {
          this.state.gameConfig.gameMode = data.gameMode;
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

    /** Host presses Play Again — advances queue or resets to lobby. */
    this.onMessage("play_again", (client, _data) => {
      if (!this._isHost(client)) return;
      if (this.state.phase !== "game_over") return;
      this._advanceOrResetToLobby();
    });

    /**
     * Host sets the game queue (playlist).
     * Expects { queue: string[] } — array of game registry IDs.
     * Clears any prior queue/selection and sets queueIndex to 0.
     */
    this.onMessage("set_queue", (client, data: { queue: string[] }) => {
      if (!this._isHost(client)) return;
      if (this.state.phase !== "lobby") return;
      if (!Array.isArray(data.queue)) return;

      // Replace the queue
      this.state.gameQueue = new ArraySchema<string>(...data.queue);
      this.state.queueIndex = 0;

      // Auto-select the first game in the queue
      if (data.queue.length > 0) {
        this.state.selectedGame = data.queue[0];
      } else {
        this.state.selectedGame = "";
      }

      console.log(`[GammaRoom] queue set — ${data.queue.length} games, code=${this.state.roomCode}`);
    });

    /**
     * Host clears the queue and goes back to single-game selection.
     */
    this.onMessage("clear_queue", (client, _data) => {
      if (!this._isHost(client)) return;
      if (this.state.phase !== "lobby") return;
      this.state.gameQueue = new ArraySchema<string>();
      this.state.queueIndex = 0;
      this.state.selectedGame = "";
      console.log(`[GammaRoom] queue cleared — code=${this.state.roomCode}`);
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

    // Enforce all non-host players ready before starting.
    // The host (room creator) doesn't need to ready up — they press Start.
    const allPlayers = [...this.state.players.values()];
    const notReady = allPlayers.filter(
      (p) => p.isConnected && !p.isReady && p.id !== this.state.hostSessionId,
    );
    if (notReady.length > 0) {
      this.broadcast("error", {
        message: `Waiting for ${notReady.length} player${notReady.length > 1 ? "s" : ""} to ready up.`,
      });
      console.warn(`[GammaRoom] start_game blocked — ${notReady.length} players not ready`);
      return;
    }

    const GameClass = await loadGame(this.state.selectedGame);

    this.state.isPracticeRound = false;

    // Enforce view screen requirement
    if (GameClass.requiresTV && !this.state.viewScreenConnected) {
      this.broadcast("error", { message: "This game requires a view screen to be connected." });
      return;
    }

    // Reset all players' isReady so instructions phase waitForAllReady() works
    for (const p of this.state.players.values()) {
      p.isReady = false;
    }

    // ── OTEL: start game session span + counter ────────────────────
    const playerCount = this.state.players.size;
    GammaRoom.gamesStarted.add(1, {
      roomCode: this.state.roomCode,
      gameId: this.state.selectedGame,
      playerCount: playerCount,
    });

    this.gameSessionSpan = tracer.startSpan("game_session", {
      attributes: {
        "gamma.room_code": this.state.roomCode,
        "gamma.game_id": this.state.selectedGame,
        "gamma.player_count": playerCount,
        "gamma.round_count": this.state.gameConfig.roundCount,
        "gamma.time_limit_secs": this.state.gameConfig.timeLimitSecs,
      },
    });

    this.game = new GameClass(this);
    this.game.start()
      .then(() => {
        // Game completed successfully
        GammaRoom.gamesCompleted.add(1, {
          roomCode: this.state.roomCode,
          gameId: this.state.selectedGame,
        });
        if (this.gameSessionSpan) {
          this.gameSessionSpan.setStatus({ code: SpanStatusCode.OK });
          this.gameSessionSpan.end();
          this.gameSessionSpan = null;
        }
      })
      .catch((err) => {
        console.error("[GammaRoom] game error:", err);
        if (this.gameSessionSpan) {
          this.gameSessionSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: String(err),
          });
          this.gameSessionSpan.end();
          this.gameSessionSpan = null;
        }
      });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * After a game ends, either advance to the next game in the queue
   * or reset to lobby if the queue is empty/exhausted.
   */
  private _advanceOrResetToLobby(): void {
    const queue = this.state.gameQueue;
    const nextIdx = this.state.queueIndex + 1;

    if (queue.length > 0 && nextIdx < queue.length) {
      // Advance to next game in queue
      this.state.queueIndex = nextIdx;
      const nextGame = queue[nextIdx] ?? "";
      this.state.selectedGame = nextGame;

      // Reset player game state (keep scores for cumulative tracking)
      for (const p of this.state.players.values()) {
        p.isReady = false;
        p.isEliminated = false;
        p.x = 0;
        p.y = 0;
        p.isDetected = false;
        p.detectionMeter = 0;
        p.timesCaught = 0;
        p.bracketSeed = -1;
        p.currentMatchOpponentId = "";
      }

      // Reset round-level state
      this.state.currentRound = 0;
      this.state.isPracticeRound = false;
      this.state.phaseStartedAt = 0;
      this.state.roundDurationSecs = 60;
      this.state.mapTiles = "";
      this.state.mapWidth = 0;
      this.state.mapHeight = 0;
      this.state.guards.clear();

      // Tear down old game
      if (this.game) {
        this.game.teardown();
        this.game = null;
      }
      if (this.gameSessionSpan) {
        this.gameSessionSpan.setStatus({ code: SpanStatusCode.OK });
        this.gameSessionSpan.end();
        this.gameSessionSpan = null;
      }

      // Return to lobby briefly so host can confirm / adjust config
      this.state.phase = "lobby";
      console.log(`[GammaRoom] queue advance — next=${nextGame} (${nextIdx + 1}/${queue.length}), code=${this.state.roomCode}`);
    } else {
      // Queue exhausted or no queue — full reset to lobby
      this._resetToLobby();
    }
  }

  /** Reset the entire room back to lobby state so everyone can play again. */
  private _resetToLobby(): void {
    // Tear down active game
    if (this.game) {
      this.game.teardown();
      this.game = null;
    }

    // End active OTEL span
    if (this.gameSessionSpan) {
      this.gameSessionSpan.setStatus({ code: SpanStatusCode.OK });
      this.gameSessionSpan.end();
      this.gameSessionSpan = null;
    }

    // Reset all player states (keep name, id, connection — reset game state)
    for (const p of this.state.players.values()) {
      p.score = 0;
      p.isReady = false;
      p.isEliminated = false;
      p.x = 0;
      p.y = 0;
      p.isDetected = false;
      p.detectionMeter = 0;
      p.timesCaught = 0;
      p.bracketSeed = -1;
      p.currentMatchOpponentId = "";
    }

    // Reset room-level game state
    this.state.selectedGame = "";
    this.state.currentRound = 0;
    this.state.isPracticeRound = false;
    this.state.phaseStartedAt = 0;
    this.state.roundDurationSecs = 60;
    this.state.mapTiles = "";
    this.state.mapWidth = 0;
    this.state.mapHeight = 0;
    this.state.guards.clear();

    // Clear playlist queue
    this.state.gameQueue = new ArraySchema<string>();
    this.state.queueIndex = 0;

    // Return to lobby phase — setup is preserved so they skip the wizard
    this.state.phase = "lobby";

    console.log(`[GammaRoom] reset to lobby — code=${this.state.roomCode}`);
  }

  private _isHost(client: Client): boolean {
    return client.sessionId === this.state.hostSessionId;
  }
}
