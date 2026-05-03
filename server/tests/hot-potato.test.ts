import { afterEach, describe, expect, it, vi } from "vitest";
import HotPotatoGame from "../src/games/registry-07-hot-potato";

function createPlayer(id: string, name: string) {
  return {
    id,
    name,
    score: 0,
    isReady: false,
    isEliminated: false,
    isConnected: true,
    disconnectedAt: 0,
  };
}

function createRoomStub(playerIds: string[] = ["p1", "p2", "p3"]) {
  const names = ["Alex", "Blair", "Casey"];
  const players = new Map(
    playerIds.map((id, index) => [id, createPlayer(id, names[index] ?? id)]),
  );

  return {
    state: {
      phase: "in_round",
      selectedGame: "registry-07-hot-potato",
      hostSessionId: playerIds[0] ?? "",
      phaseStartedAt: 0,
      currentRound: 1,
      isPracticeRound: false,
      roundDurationSecs: 20,
      gameConfig: {
        roundCount: 5,
        timeLimitSecs: 20,
        practiceRoundEnabled: false,
        matchMode: "ffa",
      },
      players,
    },
    broadcast: vi.fn(),
    clients: playerIds.map((id) => ({ sessionId: id, send: vi.fn() })),
  } as any;
}

function getClient(room: ReturnType<typeof createRoomStub>, sessionId: string) {
  return room.clients.find((client: { sessionId: string }) => client.sessionId === sessionId);
}

function createRound(overrides: Record<string, unknown> = {}) {
  return {
    potatoDeviceId: "p1",
    holderId: "p2",
    targetId: "p3",
    timerEndsAt: Date.now() + 5_000,
    exploded: false,
    passCount: 4,
    passCounts: new Map<string, number>(),
    votes: new Map<string, string>(),
    votingOpen: false,
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("HotPotatoGame timer cadence", () => {
  it("explodes on expiry without broadcasting redundant timer ticks", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T00:00:00.000Z"));

    const room = createRoomStub();
    const game = new HotPotatoGame(room) as any;
    const potatoClient = getClient(room, "p1");
    const resolve = vi.fn();

    game.round = createRound({ timerEndsAt: Date.now() - 1 });
    game.roundResolve = resolve;

    game._timerTick();

    expect(room.broadcast.mock.calls.map(([type]: [string]) => type)).not.toContain("potato_timer");
    expect(potatoClient.send).toHaveBeenCalledWith("potato_play_sound", {});
    expect(room.broadcast).toHaveBeenCalledWith("potato_exploded", {
      holderId: "p2",
      holderName: "Blair",
      targetId: "p3",
      targetName: "Casey",
      passCount: 4,
    });
    expect(resolve).toHaveBeenCalledOnce();
  });

  it("still explodes immediately when the potato device disconnects", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T00:01:00.000Z"));

    const room = createRoomStub();
    const game = new HotPotatoGame(room) as any;

    room.state.players.get("p1").isConnected = false;
    game.round = createRound({ timerEndsAt: Date.now() + 10_000 });

    game._timerTick();

    expect(room.broadcast.mock.calls.map(([type]: [string]) => type)).not.toContain("potato_timer");
    expect(room.broadcast).toHaveBeenCalledWith("potato_exploded", expect.objectContaining({
      holderId: "p2",
      targetId: "p3",
      passCount: 4,
    }));
  });
});
