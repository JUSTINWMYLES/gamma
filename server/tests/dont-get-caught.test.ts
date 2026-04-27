import { afterEach, describe, expect, it, vi } from "vitest";
import DontGetCaughtGame from "../src/games/registry-14-dont-get-caught";
import { seededRng } from "../src/utils/rng";

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
      selectedGame: "registry-14-dont-get-caught",
      hostSessionId: playerIds[0] ?? "",
      phaseStartedAt: 0,
      currentRound: 1,
      isPracticeRound: false,
      roundDurationSecs: 1,
      gameConfig: {
        roundCount: 2,
        timeLimitSecs: 1,
        practiceRoundEnabled: false,
        matchMode: "ffa",
      },
      players,
      guards: new Map(),
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

describe("DontGetCaughtGame round timing", () => {
  it("does not let a stale timeout from a prior round end the next round early", async () => {
    vi.useFakeTimers();
    const room = createRoomStub();
    const game = new DontGetCaughtGame(room) as any;

    game._tick = vi.fn();

    const firstRound = game.runRound(1);
    await Promise.resolve();

    game._endRound();
    await firstRound;

    room.state.gameConfig.timeLimitSecs = 5;

    let secondRoundResolved = false;
    const secondRound = game.runRound(2).then(() => {
      secondRoundResolved = true;
    });
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(1_100);
    expect(secondRoundResolved).toBe(false);

    await vi.advanceTimersByTimeAsync(3_800);
    expect(secondRoundResolved).toBe(false);

    await vi.advanceTimersByTimeAsync(200);
    expect(secondRoundResolved).toBe(true);

    await secondRound;
  });

  it("spawns guards with more divergent patrol routes at the faster baseline speed", () => {
    const room = createRoomStub(["p1"]);
    const game = new DontGetCaughtGame(room) as any;

    game.guardPatrolSeed = 2_468;
    game.guardDecisionRng = seededRng(2_468);
    game._spawnGuards(6);

    const runtimes = game.guardRuntimes;
    const guards = [...room.state.guards.values()];

    expect(guards).toHaveLength(6);
    expect(game.guardSpeed).toBeCloseTo(3.168, 6);
    expect(runtimes.map((rt: { patrolDir: number }) => rt.patrolDir)).toContain(1);
    expect(runtimes.map((rt: { patrolDir: number }) => rt.patrolDir)).toContain(-1);
    expect(new Set(runtimes.map((rt: { patrolStride: number }) => rt.patrolStride)).size).toBeGreaterThan(1);
    expect(new Set(guards.map((guard: { patrolIndex: number }) => guard.patrolIndex)).size).toBeGreaterThan(4);
    expect(new Set(guards.map((guard: { x: number; y: number }) => `${guard.x},${guard.y}`)).size).toBeGreaterThan(4);
  });
});
