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
    isDetected: false,
    detectionMeter: 0,
    timesCaught: 0,
    micPermission: "granted",
    motionPermission: "granted",
  };
}

function createRoomStub(playerIds: string[] = ["p1", "p2"]) {
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
        gameMode: "individual",
      },
      players,
      mapTiles: "",
      mapWidth: 0,
      mapHeight: 0,
    },
    broadcast: vi.fn(),
    clients: playerIds.map((id) => ({ sessionId: id, send: vi.fn() })),
  } as any;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("EscapeMazeGame round timing", () => {
  it("does not let an earlier round timeout end the next round early", async () => {
    vi.useFakeTimers();
    const room = createRoomStub();
    const game = new EscapeMazeGame(room) as any;

    const firstRound = game.runRound(1);
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(10_000);
    game._endRound();
    await firstRound;

    let secondRoundResolved = false;
    const secondRound = game.runRound(2).then(() => {
      secondRoundResolved = true;
    });
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(49_000);
    expect(secondRoundResolved).toBe(false);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(secondRoundResolved).toBe(false);

    await vi.advanceTimersByTimeAsync(9_000);
    expect(secondRoundResolved).toBe(true);

    await secondRound;
  });
});
