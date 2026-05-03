import { afterEach, describe, expect, it, vi } from "vitest";
import TapSpeedGame from "../src/games/registry-03-tap-speed";
import { buildBracket } from "../src/utils/bracket";

function createPlayer(id: string, name: string) {
  return {
    id,
    name,
    score: 0,
    isReady: false,
    isEliminated: false,
    isConnected: true,
    disconnectedAt: 0,
    currentMatchOpponentId: "",
    micPermission: "granted",
    motionPermission: "granted",
  };
}

function createRoomStub(playerIds: string[] = ["p1", "p2"]) {
  const names = ["Alex", "Blair", "Casey", "Drew"];
  const players = new Map(
    playerIds.map((id, index) => [id, createPlayer(id, names[index] ?? id)]),
  );

  return {
    state: {
      phase: "in_round",
      selectedGame: "registry-03-tap-speed",
      hostSessionId: playerIds[0] ?? "",
      phaseStartedAt: 0,
      currentRound: 1,
      isPracticeRound: false,
      roundDurationSecs: 60,
      gameConfig: {
        roundCount: 1,
        timeLimitSecs: 60,
        practiceRoundEnabled: false,
        matchMode: "1v1_bracket",
      },
      players,
      bracket: buildBracket(playerIds, 7),
    },
    broadcast: vi.fn(),
    clients: playerIds.map((id) => ({ sessionId: id, send: vi.fn() })),
  } as any;
}

function getClient(room: ReturnType<typeof createRoomStub>, sessionId: string) {
  return room.clients.find((client: { sessionId: string }) => client.sessionId === sessionId);
}

function createMatch(overrides: Record<string, unknown> = {}) {
  return {
    matchId: "heat-1",
    player1Id: "p1",
    player2Id: "p2",
    player1Taps: 0,
    player2Taps: 0,
    player1LastTapAt: 0,
    player2LastTapAt: 0,
    durationMs: 8_000,
    startedAt: Date.now() - 1_000,
    ended: false,
    player1DisconnectedAt: 0,
    player2DisconnectedAt: 0,
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("TapSpeedGame websocket cadence", () => {
  it("coalesces live tap-count broadcasts while keeping private confirmations immediate", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T00:00:00.000Z"));

    const room = createRoomStub();
    const game = new TapSpeedGame(room) as any;
    const player1 = getClient(room, "p1");
    const player2 = getClient(room, "p2");

    game.currentMatch = createMatch();

    game.handleInput(player1, { action: "tap" });
    vi.advanceTimersByTime(60);
    game.handleInput(player2, { action: "tap" });
    vi.advanceTimersByTime(60);
    game.handleInput(player1, { action: "tap" });

    expect(player1.send).toHaveBeenNthCalledWith(1, "tap_confirmed", { tapCount: 1 });
    expect(player1.send).toHaveBeenNthCalledWith(2, "tap_confirmed", { tapCount: 2 });
    expect(player2.send).toHaveBeenNthCalledWith(1, "tap_confirmed", { tapCount: 1 });
    expect(room.broadcast).not.toHaveBeenCalledWith("tap_counts", expect.anything());

    game._flushLiveCountBroadcast();

    expect(room.broadcast).toHaveBeenCalledTimes(1);
    expect(room.broadcast).toHaveBeenCalledWith("tap_counts", {
      matchId: "heat-1",
      player1Id: "p1",
      player1Taps: 2,
      player2Id: "p2",
      player2Taps: 1,
    });

    game._flushLiveCountBroadcast();
    expect(room.broadcast).toHaveBeenCalledTimes(1);
  });

  it("still ends disconnected matches without broadcasting timer ticks", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T00:02:00.000Z"));

    const room = createRoomStub();
    const game = new TapSpeedGame(room) as any;

    room.state.players.get("p1").isConnected = false;
    game.currentMatch = createMatch({
      player1DisconnectedAt: Date.now() - 61_000,
      durationMs: 20_000,
      startedAt: Date.now(),
    });

    game._matchTimerTick();

    expect(room.broadcast.mock.calls.map(([type]: [string]) => type)).not.toContain("tap_timer");
    expect(room.broadcast).toHaveBeenCalledWith("tap_match_end", {
      matchId: "heat-1",
      player1Id: "p1",
      player1Taps: 0,
      player2Id: "p2",
      player2Taps: 0,
    });
    expect(game.currentMatch.ended).toBe(true);
  });

  it("re-sends active match state to a reconnecting player", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T00:03:00.000Z"));

    const room = createRoomStub(["old-p1", "p2"]);
    const migratedPlayer = room.state.players.get("old-p1");
    room.state.players.delete("old-p1");
    migratedPlayer.id = "new-p1";
    room.state.players.set("new-p1", migratedPlayer);
    room.state.currentRound = 2;
    room.clients = [
      { sessionId: "new-p1", send: vi.fn() },
      { sessionId: "p2", send: vi.fn() },
    ];

    const game = new TapSpeedGame(room) as any;
    game.currentMatch = createMatch({
      player1Id: "old-p1",
      player1Taps: 4,
      player2Taps: 3,
      durationMs: 9_000,
      startedAt: Date.now() - 1_500,
    });
    game.pendingScores = new Map([
      ["old-p1", 10],
      ["new-p1", 2],
    ]);

    game.onPlayerReconnected("old-p1", "new-p1", { sessionId: "new-p1" });

    const reconnectedClient = getClient(room, "new-p1");
    expect(game.currentMatch.player1Id).toBe("new-p1");
    expect(game.pendingScores.has("old-p1")).toBe(false);
    expect(game.pendingScores.get("new-p1")).toBe(12);
    expect(reconnectedClient.send.mock.calls.map(([type]: [string]) => type)).toEqual([
      "tap_match_start",
      "tap_go",
      "tap_confirmed",
      "tap_counts",
    ]);
    expect(reconnectedClient.send).toHaveBeenNthCalledWith(2, "tap_go", {
      durationMs: 9_000,
      endsAt: game.currentMatch.startedAt + game.currentMatch.durationMs,
    });
    expect(reconnectedClient.send).toHaveBeenNthCalledWith(4, "tap_counts", {
      matchId: "heat-1",
      player1Id: "new-p1",
      player1Taps: 4,
      player2Id: "p2",
      player2Taps: 3,
    });
  });
});
