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

function getBroadcastPayloads(room: ReturnType<typeof createRoomStub>, type: string) {
  return room.broadcast.mock.calls
    .filter(([messageType]: [string]) => messageType === type)
    .map(([, payload]: [string, unknown]) => payload);
}

function getLastBroadcastPayload(room: ReturnType<typeof createRoomStub>, type: string) {
  return getBroadcastPayloads(room, type).at(-1);
}

function countBroadcasts(room: ReturnType<typeof createRoomStub>, type: string) {
  return getBroadcastPayloads(room, type).length;
}

function getClient(room: ReturnType<typeof createRoomStub>, sessionId: string) {
  return room.clients.find((client: { sessionId: string }) => client.sessionId === sessionId);
}

function getFirstWalkableMove(game: any) {
  const path = game._findMazePath(game.startPos, game.exitPos) as Array<{ x: number; y: number }>;
  const next = path[1];

  if (!next) {
    throw new Error("Expected generated maze path to have a next step");
  }

  if (next.x > game.startPos.x) return { direction: "right", x: next.x, y: next.y };
  if (next.x < game.startPos.x) return { direction: "left", x: next.x, y: next.y };
  if (next.y > game.startPos.y) return { direction: "down", x: next.x, y: next.y };
  return { direction: "up", x: next.x, y: next.y };
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

describe("EscapeMazeGame position sync", () => {
  it("does not rebroadcast unchanged maze_positions on every 200ms idle sync tick", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-28T00:00:00.000Z"));

    const room = createRoomStub(["p1"]);
    const game = new EscapeMazeGame(room) as any;
    game.mazeSeed = 4_242;

    const roundPromise = game.runRound(1);
    await Promise.resolve();

    expect(countBroadcasts(room, "maze_positions")).toBe(1);

    await vi.advanceTimersByTimeAsync(800);

    expect(countBroadcasts(room, "maze_positions")).toBe(1);

    game._endRound();
    await roundPromise;
  });

  it("rebroadcasts unchanged maze_positions on the heartbeat", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-28T00:00:00.000Z"));

    const room = createRoomStub(["p1"]);
    const game = new EscapeMazeGame(room) as any;
    game.mazeSeed = 4_242;

    const roundPromise = game.runRound(1);
    await Promise.resolve();

    expect(countBroadcasts(room, "maze_positions")).toBe(1);

    await vi.advanceTimersByTimeAsync(1_000);

    expect(countBroadcasts(room, "maze_positions")).toBe(2);

    game._endRound();
    await roundPromise;
  });

  it("broadcasts updated positions on the next sync tick after a successful move", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-28T00:00:00.000Z"));

    const room = createRoomStub(["p1"]);
    const game = new EscapeMazeGame(room) as any;
    game.mazeSeed = 4_242;

    const roundPromise = game.runRound(1);
    await Promise.resolve();

    const client = getClient(room, "p1");
    const nextMove = getFirstWalkableMove(game);

    game.handleInput(client, {
      action: "move",
      direction: nextMove.direction,
    });

    expect(countBroadcasts(room, "maze_positions")).toBe(1);

    await vi.advanceTimersByTimeAsync(200);

    expect(countBroadcasts(room, "maze_positions")).toBe(2);
    expect(getLastBroadcastPayload(room, "maze_positions")).toEqual({
      positions: [expect.objectContaining({
        id: "p1",
        x: nextMove.x,
        y: nextMove.y,
        escaped: false,
      })],
    });

    game._endRound();
    await roundPromise;
  });

  it("forces a final maze_positions broadcast with escaped state before teardown", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-28T00:00:00.000Z"));

    const room = createRoomStub(["p1"]);
    const game = new EscapeMazeGame(room) as any;
    game.mazeSeed = 4_242;

    const roundPromise = game.runRound(1);
    await Promise.resolve();

    game._playerEscaped("p1");
    await roundPromise;

    expect(countBroadcasts(room, "maze_positions")).toBe(2);
    expect(getLastBroadcastPayload(room, "maze_positions")).toEqual({
      positions: [expect.objectContaining({
        id: "p1",
        escaped: true,
      })],
    });
  });

  it("forces a final maze_team_positions broadcast with escaped state before teardown", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-28T00:00:00.000Z"));

    const room = createRoomStub(["p1", "p2", "p3", "p4"], "team");
    const game = new EscapeMazeGame(room) as any;
    game.gameMode = "team";
    game.mazeSeed = 4_242;

    const roundPromise = game.runRound(1);
    await Promise.resolve();

    expect(countBroadcasts(room, "maze_team_positions")).toBe(1);

    game._teamEscaped(game.teams[0]);
    await roundPromise;

    expect(countBroadcasts(room, "maze_team_positions")).toBe(2);
    expect(getLastBroadcastPayload(room, "maze_team_positions")).toEqual({
      teams: [expect.objectContaining({
        teamId: 0,
        escaped: true,
      })],
    });
  });
});
