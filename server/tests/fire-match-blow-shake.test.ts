import { describe, expect, it, vi } from "vitest";
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
