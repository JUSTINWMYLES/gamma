import { afterEach, describe, expect, it, vi } from "vitest";
import EscapeMazeGame from "../src/games/registry-04-escape-maze";

function createPlayer(id: string, name: string) {
  return {
    id,
    name,
    score: 0,
    isReady: false,
    isEliminated: false,
    isConnected: true,
    disconnectedAt: 0,
    x: 0,
    y: 0,
    micPermission: "granted",
    motionPermission: "granted",
  };
}

function createRoomStub(playerIds: string[] = ["p1", "p2"], gameMode: "individual" | "team" = "individual") {
  const players = new Map(
    playerIds.map((id, index) => [id, createPlayer(id, `Player ${index + 1}`)]),
  );

  return {
    state: {
      phase: "in_round",
      selectedGame: "registry-04-escape-maze",
      hostSessionId: playerIds[0] ?? "",
      phaseStartedAt: 0,
      currentRound: 1,
      isPracticeRound: false,
      roundDurationSecs: 60,
      gameConfig: {
        roundCount: 2,
        timeLimitSecs: 60,
        practiceRoundEnabled: false,
        matchMode: "ffa",
        gameMode,
      },
      players,
    },
    broadcast: vi.fn(),
    clients: playerIds.map((id) => ({ sessionId: id, send: vi.fn() })),
  } as any;
}

function getBroadcastPayload(room: ReturnType<typeof createRoomStub>, type: string) {
  return room.broadcast.mock.calls.find(([messageType]: [string]) => messageType === type)?.[1];
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("EscapeMazeGame round lifecycle", () => {
  it("resets round counters and ignores stale prior-round timeouts", async () => {
    vi.useFakeTimers();

    const room = createRoomStub();
    const game = new EscapeMazeGame(room) as any;
    game.mazeSeed = 4_242;

    const firstRound = game.runRound(1);
    await Promise.resolve();

    game._playerEscaped("p1");
    expect(game.finishCount).toBe(1);

    await vi.advanceTimersByTimeAsync(1_000);
    game._endRound();
    await firstRound;

    let secondRoundResolved = false;
    const secondRound = game.runRound(2).then(() => {
      secondRoundResolved = true;
    });
    await Promise.resolve();

    expect(game.finishCount).toBe(0);
    expect(game.playerPositions.get("p1")).toMatchObject({
      x: 1,
      y: 1,
      escaped: false,
      escapeOrder: 0,
    });
    expect(game.teams).toEqual([]);

    await vi.advanceTimersByTimeAsync(59_100);
    expect(secondRoundResolved).toBe(false);

    await vi.advanceTimersByTimeAsync(900);
    expect(secondRoundResolved).toBe(true);

    await secondRound;
  });

  it("uses seeded team shuffling instead of Math.random", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Math.random should not be used by EscapeMazeGame");
    });

    const playerIds = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];
    const roomA = createRoomStub(playerIds, "team");
    const roomB = createRoomStub(playerIds, "team");

    const gameA = new EscapeMazeGame(roomA) as any;
    gameA.gameMode = "team";
    gameA.mazeSeed = 9_001;

    const roundA = gameA.runRound(1);
    await Promise.resolve();
    const teamsA = getBroadcastPayload(roomA, "maze_teams");
    gameA._endRound();
    await roundA;

    const gameB = new EscapeMazeGame(roomB) as any;
    gameB.gameMode = "team";
    gameB.mazeSeed = 9_001;

    const roundB = gameB.runRound(1);
    await Promise.resolve();
    const teamsB = getBroadcastPayload(roomB, "maze_teams");
    gameB._endRound();
    await roundB;

    expect(teamsA).toBeDefined();
    expect(teamsA).toEqual(teamsB);
  });
});
