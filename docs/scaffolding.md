# Gamma — Project Scaffolding

---

## Directory Structure

```
gamma/
├── package.json
├── tsconfig.json
├── svelte.config.js
├── tailwind.config.cjs
├── postcss.config.cjs
│
├── server/                          # Colyseus game server (Node.js)
│   ├── index.ts                     # Server entry point — HTTP + WebSocket setup
│   ├── rooms/
│   │   └── GammaRoom.ts             # Main Colyseus room — handles all games
│   ├── schema/
│   │   ├── RoomState.ts             # Root Schema: phase, players, gameConfig
│   │   ├── PlayerState.ts           # Per-player Schema: name, score, ready, bracket
│   │   ├── GameConfig.ts            # Host-configurable options Schema
│   │   ├── BracketState.ts          # 1v1 bracket rounds and matches
│   │   └── TvState.ts               # TV-only Schema sub-object
│   ├── games/
│   │   ├── BaseGame.ts              # Abstract base class all games extend
│   │   ├── registry-01-photo-shape/
│   │   │   └── PhotoShapeGame.ts
│   │   ├── registry-03-tap-speed/
│   │   │   └── TapSpeedGame.ts
│   │   ├── registry-07-hot-potato/
│   │   │   └── HotPotatoGame.ts
│   │   ├── registry-12-dice-roll/
│   │   │   └── DiceRollGame.ts
│   │   ├── registry-13-last-to-get-instructions/
│   │   │   └── LastInstructionsGame.ts
│   │   └── registry-17-fire-match-blow-shake/
│   │       └── FireMatchGame.ts
│   └── utils/
│       ├── bracket.ts               # Random bracket draw, bye logic
│       ├── rng.ts                   # Seeded RNG for fair randomness
│       └── phases.ts                # Phase transition helpers
│
├── client/                          # Browser clients (Svelte + Tailwind CSS)
│   ├── tv/                          # TV display client
│   │   ├── index.html
│   │   ├── main.ts                  # Colyseus connect, role: "tv"
│   │   ├── screens/
│   │   │   ├── LobbyScreen.ts       # Room code display, player list, game picker
│   │   │   ├── InstructionsScreen.ts
│   │   │   ├── CountdownScreen.ts
│   │   │   ├── ScoreboardScreen.ts
│   │   │   └── GameOverScreen.ts
│   │   └── games/                   # Per-game TV views
│   │       ├── BaseGameView.ts
│   │       ├── TapSpeedView.ts
│   │       ├── HotPotatoView.ts
│   │       └── ...
│   │
│   ├── phone/                       # Phone controller client
│   │   ├── index.html
│   │   ├── join.html                # Entry: name + room code form
│   │   ├── main.ts                  # Colyseus connect, role: "player"
│   │   ├── screens/
│   │   │   ├── JoinScreen.ts        # Room code entry, name input
│   │   │   ├── LobbyScreen.ts       # Waiting room, ready button
│   │   │   ├── InstructionsScreen.ts
│   │   │   ├── CountdownScreen.ts
│   │   │   ├── RoundEndScreen.ts
│   │   │   ├── ScoreboardScreen.ts
│   │   │   └── SpectatorScreen.ts   # Shown to bracket losers / watchers
│   │   └── games/                   # Per-game phone input views
│   │       ├── BaseGameInput.ts
│   │       ├── TapSpeedInput.ts
│   │       ├── HotPotatoInput.ts
│   │       └── ...
│   │
│   └── shared/                      # Shared between TV and phone
│       ├── colyseusClient.ts        # Room connection factory
│       ├── types.ts                 # Shared TypeScript types (mirrors Schema)
│       └── sensors/
│           ├── gyroscope.ts
│           ├── accelerometer.ts
│           ├── microphone.ts
│           └── camera.ts
│
└── docs/
    ├── architecture.md
    ├── scaffolding.md               # This file
    ├── registry.md
    └── registry/
        ├── template.md
        └── registry-XX-*.md
```

---

## Key File Stubs

### `server/index.ts`

```ts
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { createServer } from "http";
import { GammaRoom } from "./rooms/GammaRoom";

const port = Number(process.env.PORT) || 2567;
const httpServer = createServer();

const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });

gameServer.define("gamma_room", GammaRoom);

httpServer.listen(port, () => {
  console.log(`Gamma server listening on ws://localhost:${port}`);
});
```

---

### `server/schema/RoomState.ts`

```ts
import { Schema, type, MapSchema } from "@colyseus/schema";
import { PlayerState } from "./PlayerState";
import { GameConfig } from "./GameConfig";
import { BracketState } from "./BracketState";
import { TvState } from "./TvState";

export type Phase =
  | "lobby"
  | "game_loading"
  | "instructions"
  | "countdown"
  | "in_round"
  | "round_end"
  | "scoreboard"
  | "game_over";

export class RoomState extends Schema {
  @type("string") phase: Phase = "lobby";
  @type("string") roomCode: string = "";
  @type("string") hostSessionId: string = "";
  @type("boolean") tvConnected: boolean = false;
  @type("string") selectedGame: string = "";
  @type("number") currentRound: number = 0;

  @type(GameConfig) gameConfig = new GameConfig();
  @type(BracketState) bracket = new BracketState();
  @type(TvState) tvState = new TvState();

  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}
```

---

### `server/schema/PlayerState.ts`

```ts
import { Schema, type } from "@colyseus/schema";

export class PlayerState extends Schema {
  @type("string") id: string = "";
  @type("string") name: string = "";
  @type("number") score: number = 0;
  @type("boolean") isReady: boolean = false;
  @type("boolean") isConnected: boolean = true;
  @type("boolean") isEliminated: boolean = false;
  @type("number") bracketSeed: number = -1;
  @type("string") currentMatchOpponentId: string = "";
}
```

---

### `server/schema/GameConfig.ts`

```ts
import { Schema, type } from "@colyseus/schema";

export type MatchMode = "ffa" | "1v1_bracket";

export class GameConfig extends Schema {
  @type("number") roundCount: number = 1;
  @type("number") timeLimitSecs: number = 30;
  @type("string") matchMode: MatchMode = "ffa";
}
```

---

### `server/schema/BracketState.ts`

```ts
import { Schema, type, ArraySchema } from "@colyseus/schema";

export class Match extends Schema {
  @type("string") id: string = "";
  @type("string") player1Id: string = "";
  @type("string") player2Id: string = "";
  @type("string") winnerId: string = "";
  @type("string") status: "pending" | "in_progress" | "complete" = "pending";
}

export class BracketRound extends Schema {
  @type([Match]) matches = new ArraySchema<Match>();
}

export class BracketState extends Schema {
  @type([BracketRound]) rounds = new ArraySchema<BracketRound>();
  @type("number") currentRound: number = 0;
}
```

---

### `server/rooms/GammaRoom.ts`

```ts
import { Room, Client } from "@colyseus/core";
import { RoomState } from "../schema/RoomState";
import { PlayerState } from "../schema/PlayerState";
import { BaseGame } from "../games/BaseGame";
import { generateRoomCode } from "../utils/rng";

export class GammaRoom extends Room<RoomState> {
  private game: BaseGame | null = null;

  onCreate(options: any) {
    this.setState(new RoomState());
    this.state.roomCode = generateRoomCode();

    this.onMessage("player_ready", (client, _) => this.handlePlayerReady(client));
    this.onMessage("select_game", (client, data) => this.handleSelectGame(client, data));
    this.onMessage("update_config", (client, data) => this.handleUpdateConfig(client, data));
    this.onMessage("start_game", (client, _) => this.handleStartGame(client));
    this.onMessage("game_input", (client, data) => this.game?.handleInput(client, data));
  }

  onJoin(client: Client, options: { role: "tv" | "player"; name?: string }) {
    if (options.role === "tv") {
      this.state.tvConnected = true;
      if (!this.state.hostSessionId) this.state.hostSessionId = client.sessionId;
      return;
    }

    const player = new PlayerState();
    player.id = client.sessionId;
    player.name = options.name ?? "Player";
    this.state.players.set(client.sessionId, player);

    if (!this.state.hostSessionId) this.state.hostSessionId = client.sessionId;
  }

  onLeave(client: Client, consented: boolean) {
    const player = this.state.players.get(client.sessionId);
    if (player) {
      player.isConnected = false;
      // Reconnect window: allow 30s before treating as permanent leave
      this.allowReconnection(client, 30);
    }
    if (client.sessionId === this.state.hostSessionId && !this.state.tvConnected) {
      // Reassign host to next connected player
      for (const [id, p] of this.state.players) {
        if (p.isConnected && id !== client.sessionId) {
          this.state.hostSessionId = id;
          break;
        }
      }
    }
  }

  onDispose() {
    this.game?.teardown();
  }

  private handleStartGame(client: Client) {
    if (client.sessionId !== this.state.hostSessionId) return;
    if (!this.state.selectedGame) return;

    const GameClass = require(`../games/${this.state.selectedGame}`).default;
    this.game = new GameClass(this);
    this.game!.start();
  }

  private handlePlayerReady(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) player.isReady = true;
  }

  private handleSelectGame(client: Client, data: { gameId: string }) {
    if (client.sessionId !== this.state.hostSessionId) return;
    this.state.selectedGame = data.gameId;
  }

  private handleUpdateConfig(client: Client, data: Partial<{ roundCount: number; timeLimitSecs: number; matchMode: string }>) {
    if (client.sessionId !== this.state.hostSessionId) return;
    if (data.roundCount !== undefined) this.state.gameConfig.roundCount = data.roundCount;
    if (data.timeLimitSecs !== undefined) this.state.gameConfig.timeLimitSecs = data.timeLimitSecs;
    if (data.matchMode !== undefined) this.state.gameConfig.matchMode = data.matchMode as any;
  }
}
```

---

### `server/games/BaseGame.ts`

```ts
import { Room, Client } from "@colyseus/core";
import { RoomState, Phase } from "../schema/RoomState";

export abstract class BaseGame {
  /** Set to true in subclass if the game cannot run without a TV client connected. */
  static requiresTV: boolean = false;

  /** Set to true in subclass if the game supports 1v1 bracket mode. */
  static supportsBracket: boolean = false;

  /** Default round count. Host can override in GameConfig. */
  static defaultRoundCount: number = 1;
  static minRounds: number = 1;
  static maxRounds: number = 10;

  protected room: Room<RoomState>;

  constructor(room: Room<RoomState>) {
    this.room = room;
  }

  /** Called once by GammaRoom when the host starts the game. */
  async start() {
    this.setPhase("game_loading");
    await this.onLoad();
    this.setPhase("instructions");
    await this.waitForAllReady();
    await this.runRounds();
    this.setPhase("game_over");
  }

  /** Override to preload assets, request sensors, etc. */
  protected async onLoad(): Promise<void> {}

  /** Override to run the core round logic. Called once per round. */
  protected abstract runRound(round: number): Promise<void>;

  /** Override to score the round after all inputs are collected. */
  protected abstract scoreRound(round: number): void;

  /** Override to handle per-player game input messages. */
  abstract handleInput(client: Client, data: any): void;

  /** Called when the room disposes. Override for cleanup. */
  teardown(): void {}

  protected async runRounds() {
    const total = this.room.state.gameConfig.roundCount;
    for (let r = 1; r <= total; r++) {
      this.room.state.currentRound = r;
      this.setPhase("countdown");
      await this.delay(3000);
      this.setPhase("in_round");
      await this.runRound(r);
      this.scoreRound(r);
      this.setPhase("round_end");
      await this.delay(4000);
    }
    this.setPhase("scoreboard");
    await this.delay(6000);
  }

  protected setPhase(phase: Phase) {
    this.room.state.phase = phase;
  }

  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /** Resolves when all connected, non-eliminated players mark ready. */
  protected waitForAllReady(): Promise<void> {
    return new Promise(resolve => {
      const check = () => {
        const active = [...this.room.state.players.values()].filter(p => p.isConnected && !p.isEliminated);
        if (active.every(p => p.isReady)) resolve();
      };
      // Poll — replace with event listener pattern as needed
      const interval = setInterval(() => {
        check();
        clearInterval(interval);
      }, 200);
    });
  }
}
```

---

### `server/utils/bracket.ts`

```ts
import { BracketRound, BracketState, Match } from "../schema/BracketState";
import { seededShuffle } from "./rng";

/**
 * Builds a single-elimination bracket from a list of player IDs.
 * Uses a seeded shuffle for fairness and auditability.
 */
export function buildBracket(playerIds: string[], seed: number): BracketState {
  const state = new BracketState();
  const shuffled = seededShuffle([...playerIds], seed);
  const round = new BracketRound();

  for (let i = 0; i < shuffled.length - 1; i += 2) {
    const match = new Match();
    match.id = `r1-m${i / 2}`;
    match.player1Id = shuffled[i];
    match.player2Id = shuffled[i + 1];
    match.status = "pending";
    round.matches.push(match);
  }

  // Bye for odd player
  if (shuffled.length % 2 !== 0) {
    const byeMatch = new Match();
    byeMatch.id = `r1-bye`;
    byeMatch.player1Id = shuffled[shuffled.length - 1];
    byeMatch.player2Id = "BYE";
    byeMatch.winnerId = shuffled[shuffled.length - 1];
    byeMatch.status = "complete";
    round.matches.push(byeMatch);
  }

  state.rounds.push(round);
  return state;
}

/**
 * Advances the bracket after the current round completes.
 * Collects winners, builds next round's matches.
 */
export function advanceBracket(state: BracketState, seed: number): void {
  const currentRound = state.rounds[state.currentRound];
  const winners = currentRound.matches.map(m => m.winnerId).filter(Boolean);

  if (winners.length <= 1) return; // tournament over

  const nextRound = new BracketRound();
  const shuffled = seededShuffle(winners, seed + state.currentRound);

  for (let i = 0; i < shuffled.length - 1; i += 2) {
    const match = new Match();
    match.id = `r${state.currentRound + 2}-m${i / 2}`;
    match.player1Id = shuffled[i];
    match.player2Id = shuffled[i + 1];
    match.status = "pending";
    nextRound.matches.push(match);
  }

  state.rounds.push(nextRound);
  state.currentRound++;
}
```

---

### `server/utils/rng.ts`

```ts
/**
 * Simple seeded LCG RNG — deterministic and auditable.
 * Not cryptographic. Used for bracket draws and dice rolls.
 */
export function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

export function seededShuffle<T>(arr: T[], seed: number): T[] {
  const rng = seededRng(seed);
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O, 1/I
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}
```

---

### `client/shared/colyseusClient.ts`

```ts
import * as Colyseus from "colyseus.js";

const WS_URL = import.meta.env.VITE_SERVER_URL ?? "ws://localhost:2567";

let client: Colyseus.Client | null = null;

export function getClient(): Colyseus.Client {
  if (!client) client = new Colyseus.Client(WS_URL);
  return client;
}

export async function joinAsTV(): Promise<Colyseus.Room> {
  return getClient().create("gamma_room", { role: "tv" });
}

export async function joinAsPlayer(roomCode: string, name: string): Promise<Colyseus.Room> {
  return getClient().joinById(roomCode, { role: "player", name });
}
```

---

### `client/phone/screens/JoinScreen.ts`

```ts
// Rendered at /join — entry point for all phone players

export function renderJoinScreen(container: HTMLElement) {
  container.innerHTML = `
    <div class="join-screen">
      <h1>gamma</h1>
      <input id="room-code" type="text" maxlength="4" placeholder="Room Code" autocapitalize="characters" />
      <input id="player-name" type="text" maxlength="20" placeholder="Your Name" />
      <button id="join-btn">Join Game</button>
      <p id="error-msg" class="hidden"></p>
    </div>
  `;

  document.getElementById("join-btn")!.addEventListener("click", async () => {
    const code = (document.getElementById("room-code") as HTMLInputElement).value.trim().toUpperCase();
    const name = (document.getElementById("player-name") as HTMLInputElement).value.trim();
    if (!code || !name) return;

    try {
      const { joinAsPlayer } = await import("../../shared/colyseusClient");
      const room = await joinAsPlayer(code, name);
      // Transition to lobby screen with room reference
      window.dispatchEvent(new CustomEvent("room-joined", { detail: room }));
    } catch (e) {
      const err = document.getElementById("error-msg")!;
      err.textContent = "Room not found. Check the code and try again.";
      err.classList.remove("hidden");
    }
  });
}
```

---

### `client/tv/screens/LobbyScreen.ts`

```ts
// TV lobby: shows room code, player list, game selector, start button

import type { Room } from "colyseus.js";
import type { RoomState } from "../../../server/schema/RoomState";

export function renderTVLobby(container: HTMLElement, room: Room) {
  const state = room.state as unknown as RoomState;

  function render() {
    const playerList = [...state.players.values()]
      .map(p => `<li class="${p.isReady ? "ready" : ""}">${p.name}</li>`)
      .join("");

    container.innerHTML = `
      <div class="tv-lobby">
        <div class="room-code">
          <span class="label">Join at gamma.app/join</span>
          <span class="code">${state.roomCode}</span>
        </div>
        <ul class="player-list">${playerList}</ul>
        <div class="game-picker">
          <!-- Game selection populated from registry -->
        </div>
        <div class="config-panel">
          <label>Rounds: <input id="round-count" type="number" min="1" max="10" value="${state.gameConfig.roundCount}" /></label>
          <label>Mode:
            <select id="match-mode">
              <option value="ffa" ${state.gameConfig.matchMode === "ffa" ? "selected" : ""}>Free for All</option>
              <option value="1v1_bracket" ${state.gameConfig.matchMode === "1v1_bracket" ? "selected" : ""}>1v1 Bracket</option>
            </select>
          </label>
        </div>
        <button id="start-btn" ${state.selectedGame ? "" : "disabled"}>Start Game</button>
      </div>
    `;

    document.getElementById("start-btn")?.addEventListener("click", () => {
      room.send("start_game", {});
    });

    document.getElementById("round-count")?.addEventListener("change", (e) => {
      room.send("update_config", { roundCount: Number((e.target as HTMLInputElement).value) });
    });

    document.getElementById("match-mode")?.addEventListener("change", (e) => {
      room.send("update_config", { matchMode: (e.target as HTMLSelectElement).value });
    });
  }

  room.state.listen("phase", render);
  room.state.players.onAdd(() => render());
  room.state.players.onChange(() => render());

  render();
}
```

---

### `client/phone/screens/InstructionsScreen.ts`

```ts
// Shown on phone during the "instructions" phase
// Mirrors the TV instruction content; player taps "Got it" to mark ready

import type { Room } from "colyseus.js";

export function renderInstructionsScreen(container: HTMLElement, room: Room, content: string) {
  container.innerHTML = `
    <div class="instructions-screen">
      <div class="instruction-content">${content}</div>
      <button id="ready-btn">Got it</button>
    </div>
  `;

  document.getElementById("ready-btn")!.addEventListener("click", () => {
    room.send("player_ready", {});
    (document.getElementById("ready-btn") as HTMLButtonElement).disabled = true;
    (document.getElementById("ready-btn") as HTMLButtonElement).textContent = "Waiting...";
  });
}
```

---

## Game Registry Spec Fields (additions to template)

All registry entries must now include the following fields. These are consumed by `GammaRoom` at game-load time to validate and configure the session.

```ts
// Required additions to every registry-XX-*.md spec:

requiresTV: boolean          // true = game cannot start without a TV client connected
supportsBracket: boolean     // true = game supports 1v1 bracket mode
defaultRoundCount: number    // default rounds when host doesn't override
minRounds: number
maxRounds: number
hasInstructionsPhase: boolean // true = server transitions through "instructions" before countdown
instructionsDelivery: "broadcast" | "staggered" | "private"
  // broadcast  = all players + TV receive instructions simultaneously
  // staggered  = instructions sent to players one-by-one with random delays (e.g. Last To Get Instructions)
  // private    = each player receives different instructions via client.send()
```

---

## Environment Variables

```
# server/.env
PORT=2567

# client/.env
VITE_SERVER_URL=ws://localhost:2567
```

---

## Scripts (`package.json`)

```json
{
  "scripts": {
    "dev:server": "ts-node server/index.ts",
    "dev:client": "vite client/",
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "build:client": "vite build client/",
    "build:server": "tsc -p tsconfig.server.json",
    "build": "npm run build:server && npm run build:client"
  }
}
```
