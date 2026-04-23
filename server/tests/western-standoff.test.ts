import { afterEach, describe, expect, it, vi } from "vitest";
import WesternStandoffGame from "../src/games/registry-44-western-standoff";
import {
  normalizeOrientation,
  shortestAngleDelta,
  validateShotPose,
  pickDeterministicWinner,
} from "../src/games/registry-44-western-standoff/westernStandoffLogic";
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
      selectedGame: "registry-44-western-standoff",
      hostSessionId: playerIds[0] ?? "",
      phaseStartedAt: 0,
      currentRound: 1,
      isPracticeRound: false,
      roundDurationSecs: 60,
      gameConfig: {
        roundCount: 1,
        timeLimitSecs: 60,
        practiceRoundEnabled: false,
        matchMode: "ffa",
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
    bracketRound: 1,
    isPractice: false,
    stage: "live",
    calibrations: new Map([
      ["p1", { alpha: 0, beta: 0, gamma: 0 }],
      ["p2", { alpha: 180, beta: 0, gamma: 0 }],
    ]),
    readyPlayerIds: new Set(["p1", "p2"]),
    drawAt: 1_000,
    ended: false,
    winnerId: "",
    loserId: "",
    shooterId: "",
    reactionMs: 0,
    resolutionReason: "",
    timeoutSeed: 123,
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("westernStandoffLogic", () => {
  it("normalizes alpha and rejects incomplete orientation payloads", () => {
    expect(normalizeOrientation({ alpha: -10, beta: 5, gamma: 90 })).toEqual({
      alpha: 350,
      beta: 5,
      gamma: 90,
    });

    expect(normalizeOrientation({ alpha: 0, beta: 0 })).toBeNull();
  });

  it("measures wraparound turns and validates the draw pose", () => {
    expect(shortestAngleDelta(350, 170)).toBe(180);

    expect(
      validateShotPose(
        { alpha: 350, beta: 0, gamma: 0 },
        { alpha: 170, beta: 20, gamma: 90 },
      ),
    ).toEqual({ valid: true, turnedAround: true, aimed: true });

    expect(
      validateShotPose(
        { alpha: 0, beta: 0, gamma: 0 },
        { alpha: 180, beta: 85, gamma: 20 },
      ),
    ).toEqual({ valid: false, turnedAround: true, aimed: false });
  });

  it("picks timeout winners deterministically", () => {
    expect(pickDeterministicWinner([], 10)).toBe("");
    expect(pickDeterministicWinner(["solo"], 10)).toBe("solo");

    const first = pickDeterministicWinner(["p1", "p2"], 99);
    const second = pickDeterministicWinner(["p1", "p2"], 99);

    expect(first).toBe(second);
    expect(["p1", "p2"]).toContain(first);
  });
});

describe("WesternStandoffGame shot handling", () => {
  it("rejects an early shot before draw even when orientation data is bad", () => {
    const room = createRoomStub();
    const game = new WesternStandoffGame(room) as any;
    const player = getClient(room, "p1");

    game.currentMatch = createMatch({ stage: "calibrating" });

    game.handleInput(player, { action: "standoff_shoot", alpha: Number.NaN, beta: 0, gamma: 0 });

    expect(player.send).toHaveBeenCalledWith(
      "standoff_invalid_shot",
      expect.objectContaining({ reason: "too_early" }),
    );
  });

  it("rejects invalid live shots after calibration and resolves valid ones", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T00:00:02.000Z"));

    const room = createRoomStub();
    const game = new WesternStandoffGame(room) as any;
    const player = getClient(room, "p1");

    game.currentMatch = createMatch({ drawAt: Date.now() - 250 });

    game.handleInput(player, {
      action: "standoff_shoot",
      alpha: 25,
      beta: 0,
      gamma: 90,
    });

    expect(player.send).toHaveBeenLastCalledWith(
      "standoff_invalid_shot",
      expect.objectContaining({ reason: "not_turned" }),
    );
    expect(game.currentMatch.ended).toBe(false);

    game.handleInput(player, {
      action: "standoff_shoot",
      alpha: 180,
      beta: 10,
      gamma: 90,
    });

    expect(game.currentMatch.ended).toBe(true);
    expect(game.currentMatch.winnerId).toBe("p1");
    expect(game.currentMatch.loserId).toBe("p2");
    expect(game.currentMatch.shooterId).toBe("p1");
    expect(game.currentMatch.reactionMs).toBe(250);

    const resultPayload = room.broadcast.mock.calls.find(
      ([type]: [string]) => type === "standoff_match_result",
    )?.[1];

    expect(resultPayload).toEqual(
      expect.objectContaining({
        winnerId: "p1",
        loserId: "p2",
        shooterId: "p1",
        reason: "shot",
      }),
    );
  });
});

describe("WesternStandoffGame reconnect + duel flow", () => {
  it("migrates sessionId keyed match state, pending scores, and bracket entries on reconnect", () => {
    const room = createRoomStub(["old-p1", "p2"]);
    room.state.bracket = buildBracket(["old-p1", "p2"], 13);
    room.state.bracket.rounds[0]?.heats[0]?.advancingIds.push("old-p1");

    const game = new WesternStandoffGame(room) as any;
    game.currentMatch = createMatch({
      player1Id: "old-p1",
      winnerId: "old-p1",
      shooterId: "old-p1",
      calibrations: new Map([
        ["old-p1", { alpha: 0, beta: 0, gamma: 0 }],
        ["p2", { alpha: 180, beta: 0, gamma: 0 }],
      ]),
      readyPlayerIds: new Set(["old-p1", "p2"]),
    });
    game.pendingScores = new Map([
      ["old-p1", 2],
      ["new-p1", 5],
    ]);

    game.onPlayerReconnected("old-p1", "new-p1", { sessionId: "new-p1" });

    expect(game.currentMatch.player1Id).toBe("new-p1");
    expect(game.currentMatch.winnerId).toBe("new-p1");
    expect(game.currentMatch.shooterId).toBe("new-p1");
    expect(game.currentMatch.calibrations.has("old-p1")).toBe(false);
    expect(game.currentMatch.calibrations.get("new-p1")).toEqual({ alpha: 0, beta: 0, gamma: 0 });
    expect(game.currentMatch.readyPlayerIds.has("old-p1")).toBe(false);
    expect(game.currentMatch.readyPlayerIds.has("new-p1")).toBe(true);

    expect(game.pendingScores.has("old-p1")).toBe(false);
    expect(game.pendingScores.get("new-p1")).toBe(7);

    const heat = room.state.bracket.rounds[0]?.heats[0];
    expect([...heat.playerIds]).toContain("new-p1");
    expect([...heat.playerIds]).not.toContain("old-p1");
    expect([...heat.advancingIds]).toContain("new-p1");
    expect([...heat.advancingIds]).not.toContain("old-p1");
  });

  it("runs a duel from preview through draw and resolves on a valid shot", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T00:00:00.000Z"));

    const room = createRoomStub();
    const game = new WesternStandoffGame(room) as any;
    const player1 = getClient(room, "p1");
    const player2 = getClient(room, "p2");
    game.bracketSeed = 77;

    const duelPromise = game._runDuel({
      matchId: "heat-7",
      player1Id: "p1",
      player2Id: "p2",
      player1Name: "Alex",
      player2Name: "Blair",
      bracketRound: 1,
      isPractice: false,
    });

    expect(room.broadcast).toHaveBeenCalledWith(
      "standoff_match_preview",
      expect.objectContaining({ matchId: "heat-7", player1Id: "p1", player2Id: "p2" }),
    );

    await vi.advanceTimersByTimeAsync(10_000);
    expect(game.currentMatch.stage).toBe("calibrating");

    game.handleInput(player1, { action: "standoff_calibrate_done", alpha: 0, beta: 0, gamma: 0 });
    game.handleInput(player2, {
      action: "standoff_calibrate_done",
      alpha: 180,
      beta: 0,
      gamma: 0,
    });
    await Promise.resolve();

    expect(player1.send).toHaveBeenCalledWith(
      "standoff_calibration_saved",
      expect.objectContaining({ readyCount: 1, totalCount: 2 }),
    );
    expect(player2.send).toHaveBeenCalledWith(
      "standoff_calibration_saved",
      expect.objectContaining({ readyCount: 2, totalCount: 2 }),
    );

    await vi.advanceTimersByTimeAsync(3_000);
    expect(game.currentMatch.stage).toBe("live");

    game.handleInput(player1, {
      action: "standoff_shoot",
      alpha: 180,
      beta: 15,
      gamma: 90,
    });

    const outcome = await duelPromise;

    expect(outcome).toEqual(
      expect.objectContaining({
        winnerId: "p1",
        loserId: "p2",
        shooterId: "p1",
        reason: "shot",
        isPractice: false,
      }),
    );

    expect(room.state.roundDurationSecs).toBe(12);
    expect(room.broadcast.mock.calls.map(([type]: [string]) => type)).toEqual(
      expect.arrayContaining([
        "standoff_match_preview",
        "standoff_calibrate_start",
        "standoff_ready",
        "standoff_paces_countdown",
        "standoff_draw",
        "standoff_match_result",
      ]),
    );
  });

  it("ignores stale live timeout timers after a duel resolves early", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T00:00:00.000Z"));

    const room = createRoomStub();
    const game = new WesternStandoffGame(room) as any;

    game.currentMatch = createMatch({ matchId: "m1", stage: "live", drawAt: Date.now() });
    const firstWait = game._waitForLiveResolution(12_000);

    await vi.advanceTimersByTimeAsync(1_000);
    game._resolveCurrentMatch({
      winnerId: "p1",
      loserId: "p2",
      shooterId: "p1",
      reactionMs: 1_000,
      reason: "shot",
    });
    await firstWait;

    game.currentMatch = createMatch({
      matchId: "m2",
      stage: "live",
      drawAt: Date.now(),
      ended: false,
      winnerId: "",
      loserId: "",
      shooterId: "",
      reactionMs: 0,
      resolutionReason: "",
      timeoutSeed: 456,
    });

    const secondWait = game._waitForLiveResolution(12_000);

    await vi.advanceTimersByTimeAsync(11_000);
    expect(game.currentMatch.ended).toBe(false);

    await vi.advanceTimersByTimeAsync(1_000);
    await secondWait;

    expect(game.currentMatch.ended).toBe(true);
    expect(game.currentMatch.resolutionReason).toBe("timeout");
  });

  it("teardown clears pending calibration/live waits without hanging", async () => {
    vi.useFakeTimers();

    const room = createRoomStub();
    const game = new WesternStandoffGame(room) as any;

    game.currentMatch = createMatch({ matchId: "m-cal", stage: "calibrating" });
    const calibrationWait = game._waitForCalibration(20_000);

    await vi.advanceTimersByTimeAsync(250);
    game.teardown();
    await calibrationWait;

    expect(game.currentMatch).toBeNull();
    expect(game.calibrationResolve).toBeNull();

    game.currentMatch = createMatch({ matchId: "m-live", stage: "live", drawAt: Date.now() });
    const liveWait = game._waitForLiveResolution(12_000);

    await vi.advanceTimersByTimeAsync(250);
    game.teardown();
    await liveWait;

    expect(game.currentMatch).toBeNull();
    expect(game.matchResolve).toBeNull();
  });
});
