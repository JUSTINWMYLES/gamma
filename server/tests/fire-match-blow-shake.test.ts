import { afterEach, describe, expect, it, vi } from "vitest";
import FireMatchBlowShakeGame from "../src/games/registry-17-fire-match-blow-shake";

function createPlayer(id: string, name: string) {
  return {
    id,
    name,
    score: 0,
    isReady: false,
    isEliminated: false,
    isConnected: true,
    disconnectedAt: 0,
    micPermission: "granted",
    motionPermission: "granted",
  };
}

function createRoomStub(playerIds: string[] = ["p1", "p2", "p3", "p4", "p5"]) {
  const players = new Map(
    playerIds.map((id, index) => [id, createPlayer(id, `Player ${index + 1}`)]),
  );

  return {
    state: {
      phase: "in_round",
      selectedGame: "registry-17-fire-match-blow-shake",
      hostSessionId: playerIds[0] ?? "",
      phaseStartedAt: 0,
      currentRound: 1,
      isPracticeRound: false,
      roundDurationSecs: 60,
      gameConfig: {
        roundCount: 3,
        timeLimitSecs: 60,
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

function setPlayerProgress(
  game: any,
  sessionId: string,
  overrides: Partial<{
    stageIndex: number;
    current: number;
    target: number;
    totalContribution: number;
    finished: boolean;
    finishedAt: number;
  }> = {},
) {
  game.playerProgress.set(sessionId, {
    stageIndex: 0,
    current: 0,
    target: 12,
    totalContribution: 0,
    finished: false,
    finishedAt: 0,
    ...overrides,
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("FireMatchBlowShakeGame scoring", () => {
  it("does not award effort bonus when all players finish", () => {
    const room = createRoomStub();
    const game = new FireMatchBlowShakeGame(room) as any;

    game.roundResults.set(1, {
      playerResults: [
        { playerId: "p1", finished: true, stagesCompleted: 4, totalContribution: 12, finishedAt: 1_000 },
        { playerId: "p2", finished: true, stagesCompleted: 4, totalContribution: 200, finishedAt: 1_500 },
        { playerId: "p3", finished: true, stagesCompleted: 4, totalContribution: 90, finishedAt: 2_000 },
        { playerId: "p4", finished: true, stagesCompleted: 4, totalContribution: 65, finishedAt: 2_500 },
        { playerId: "p5", finished: true, stagesCompleted: 4, totalContribution: 40, finishedAt: 3_000 },
      ],
    });

    game.scoreRound(1);

    expect(room.state.players.get("p1")?.score).toBe(175);
    expect(room.state.players.get("p2")?.score).toBe(160);
    expect(room.state.players.get("p3")?.score).toBe(145);
    expect(room.state.players.get("p4")?.score).toBe(130);
    expect(room.state.players.get("p5")?.score).toBe(115);
  });

  it("still uses total contribution only as a ranking tiebreaker", () => {
    const room = createRoomStub(["p1", "p2", "p3"]);
    const game = new FireMatchBlowShakeGame(room) as any;

    game.roundResults.set(1, {
      playerResults: [
        { playerId: "p1", finished: false, stagesCompleted: 3, totalContribution: 50, finishedAt: Infinity },
        { playerId: "p2", finished: false, stagesCompleted: 3, totalContribution: 10, finishedAt: Infinity },
        { playerId: "p3", finished: false, stagesCompleted: 2, totalContribution: 999, finishedAt: Infinity },
      ],
    });

    game.scoreRound(1);

    expect(room.state.players.get("p1")?.score).toBe(105);
    expect(room.state.players.get("p2")?.score).toBe(90);
    expect(room.state.players.get("p3")?.score).toBe(55);
  });
});

describe("FireMatchBlowShakeGame input gating", () => {
  it("tracks active players without mic or motion permission so strike taps register", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T00:00:00.000Z"));

    const room = createRoomStub(["p1"]);
    const player = room.state.players.get("p1");
    const client = getClient(room, "p1");
    const game = new FireMatchBlowShakeGame(room) as any;

    player.micPermission = "denied";
    player.motionPermission = "denied";
    room.state.gameConfig.timeLimitSecs = 1;

    const roundPromise = game.runRound(1);

    expect(game.playerProgress.has("p1")).toBe(true);
    expect(room.broadcast).toHaveBeenCalledWith(
      "fire_round_start",
      expect.objectContaining({
        players: [expect.objectContaining({ playerId: "p1", stage: "strike" })],
      }),
    );

    game.handleInput(client, { action: "fire_strike" });

    expect(game.playerProgress.get("p1")).toMatchObject({
      stageIndex: 0,
      current: 1,
      totalContribution: 1,
      finished: false,
    });

    await vi.runAllTimersAsync();
    await roundPromise;
  });

  it("allows extinguish taps without mic or motion permission", () => {
    const room = createRoomStub(["p1"]);
    const player = room.state.players.get("p1");
    const client = getClient(room, "p1");
    const game = new FireMatchBlowShakeGame(room) as any;

    player.micPermission = "denied";
    player.motionPermission = "denied";

    setPlayerProgress(game, "p1", {
      stageIndex: 3,
      target: 30,
    });

    game.handleInput(client, { action: "fire_tap" });

    expect(game.playerProgress.get("p1")).toMatchObject({
      stageIndex: 3,
      current: 1,
      totalContribution: 1,
      finished: false,
    });
  });

  it("keeps blow and shake inputs gated by stage permissions", () => {
    const room = createRoomStub(["p1"]);
    const player = room.state.players.get("p1");
    const client = getClient(room, "p1");
    const game = new FireMatchBlowShakeGame(room) as any;

    player.micPermission = "denied";
    player.motionPermission = "granted";
    setPlayerProgress(game, "p1", { stageIndex: 1, target: 18 });

    game.handleInput(client, { action: "fire_blow", amplitude: 3 });

    expect(game.playerProgress.get("p1")).toMatchObject({
      stageIndex: 1,
      current: 0,
      totalContribution: 0,
      finished: false,
    });

    player.micPermission = "granted";
    player.motionPermission = "denied";
    setPlayerProgress(game, "p1", { stageIndex: 2, target: 50 });

    game.handleInput(client, { action: "fire_shake", magnitude: 3 });

    expect(game.playerProgress.get("p1")).toMatchObject({
      stageIndex: 2,
      current: 0,
      totalContribution: 0,
      finished: false,
    });
  });
});

describe("FireMatchBlowShakeGame update broadcasts", () => {
  it("marks updates dirty when progress changes", () => {
    const room = createRoomStub(["p1"]);
    const client = getClient(room, "p1");
    const game = new FireMatchBlowShakeGame(room) as any;

    setPlayerProgress(game, "p1", { stageIndex: 0, target: 12 });
    game.updateDirty = false;

    game.handleInput(client, { action: "fire_strike" });

    expect(game.updateDirty).toBe(true);
  });

  it("skips unchanged fire_update broadcasts until heartbeat", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T00:00:00.000Z"));

    const room = createRoomStub(["p1"]);
    const game = new FireMatchBlowShakeGame(room) as any;

    setPlayerProgress(game, "p1", { stageIndex: 0, current: 0, target: 12, totalContribution: 0 });
    game.roundEndAt = Date.now() + 5_000;
    game.updateDirty = false;
    game.lastUpdateBroadcastAt = Date.now();

    game._broadcastUpdate();
    expect(room.broadcast).not.toHaveBeenCalled();

    vi.advanceTimersByTime(999);
    game._broadcastUpdate();
    expect(room.broadcast).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    game._broadcastUpdate();
    expect(room.broadcast).toHaveBeenCalledWith(
      "fire_update",
      expect.objectContaining({
        players: [expect.objectContaining({ playerId: "p1", stage: "strike" })],
      }),
    );
  });

  it("forces a final fire_update broadcast when the round ends", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T00:00:00.000Z"));

    const room = createRoomStub(["p1"]);
    const game = new FireMatchBlowShakeGame(room) as any;

    setPlayerProgress(game, "p1", {
      stageIndex: 1,
      current: 5,
      target: 18,
      totalContribution: 5,
      finished: false,
    });
    game.roundEndAt = Date.now() + 5_000;
    game.updateDirty = false;
    game.lastUpdateBroadcastAt = Date.now();
    game.roundResolve = vi.fn();

    game._endRound(1, false);

    expect(room.broadcast).toHaveBeenCalledWith(
      "fire_update",
      expect.objectContaining({
        players: [expect.objectContaining({ playerId: "p1", stage: "blow" })],
      }),
    );
    expect(room.broadcast).toHaveBeenCalledWith(
      "fire_round_end",
      expect.objectContaining({
        allFinished: false,
        playerResults: [expect.objectContaining({ playerId: "p1", stagesCompleted: 1 })],
      }),
    );
  });
});
