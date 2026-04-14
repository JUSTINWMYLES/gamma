import { describe, expect, it } from "vitest";
import { BaseGame } from "../src/games/BaseGame";

class TestGame extends BaseGame {
  events: string[] = [];

  protected override delay(): Promise<void> {
    return Promise.resolve();
  }

  protected override async onLoad(): Promise<void> {
    this.events.push("load");
  }

  protected override async runRound(): Promise<void> {
    this.events.push("round-start");
    this.teardown();
    this.events.push(`cancelled:${this.isCancelled()}`);
  }

  protected override scoreRound(): void {
    this.events.push("score");
  }

  handleInput(): void {}
}

function createRoomStub() {
  return {
    state: {
      phase: "lobby",
      selectedGame: "registry-26-audio-overlay",
      phaseStartedAt: 0,
      currentRound: 0,
      isPracticeRound: false,
      roundDurationSecs: 60,
      gameConfig: {
        roundCount: 1,
        timeLimitSecs: 60,
        practiceRoundEnabled: false,
      },
      players: new Map(),
    },
    broadcast: () => {},
    clients: [],
  } as any;
}

describe("BaseGame cancellation", () => {
  it("does not score or advance phases after teardown during a round", async () => {
    const room = createRoomStub();
    const game = new TestGame(room);

    await game.start();

    expect(game.events).toEqual(["load", "round-start", "cancelled:true"]);
    expect(room.state.phase).toBe("in_round");
  });
});
