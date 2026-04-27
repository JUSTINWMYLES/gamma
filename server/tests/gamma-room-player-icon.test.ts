import { describe, expect, it } from "vitest";
import { GammaRoom } from "../src/rooms/GammaRoom";

function createRoomHarness() {
  const handlers = new Map<string, (client: { sessionId: string }, data: any) => void>();
  const player = {
    id: "p1",
    name: "Player 1",
    iconEmoji: "",
    iconText: "",
    iconBgColor: "",
    iconDesign: "",
    isConnected: true,
  };

  const room = Object.create(GammaRoom.prototype) as any;
  room.state = {
    phase: "lobby",
    players: new Map([[player.id, player]]),
  };
  room.onMessage = (type: string, handler: (client: { sessionId: string }, data: any) => void) => {
    handlers.set(type, handler);
  };

  room._registerMessages();

  return {
    player,
    handlers,
    client: { sessionId: player.id },
  };
}

function createLargeDesignJson(pointCount: number): string {
  return JSON.stringify({
    version: 1,
    bgColor: "#123456",
    strokes: [
      {
        color: "#ffffff",
        size: 8,
        points: Array.from({ length: pointCount }, (_, index) => ({
          x: index % 100,
          y: (index * 7) % 100,
        })),
      },
    ],
    stickers: [],
    text: null,
  });
}

describe("GammaRoom player icon customization", () => {
  it("stores large valid icon JSON without truncating it into invalid JSON", () => {
    const { player, handlers, client } = createRoomHarness();
    const customizePlayer = handlers.get("customize_player");
    const largeDesign = createLargeDesignJson(2_100);

    expect(customizePlayer).toBeTypeOf("function");
    expect(largeDesign.length).toBeGreaterThan(20_000);

    customizePlayer?.(client, {
      iconBgColor: "#abcdef",
      iconDesign: largeDesign,
    });

    expect(player.iconBgColor).toBe("#abcdef");
    expect(player.iconDesign.length).toBeGreaterThan(20_000);

    const saved = JSON.parse(player.iconDesign);
    expect(saved.bgColor).toBe("#123456");
    expect(saved.strokes).toHaveLength(1);
    expect(saved.strokes[0]?.points).toHaveLength(2_048);
  });

  it("leaves the previous saved icon intact when new icon JSON is invalid", () => {
    const { player, handlers, client } = createRoomHarness();
    const customizePlayer = handlers.get("customize_player");
    const previousDesign = JSON.stringify({
      version: 1,
      bgColor: "#222222",
      strokes: [],
      stickers: [],
      text: null,
    });

    player.iconDesign = previousDesign;

    customizePlayer?.(client, {
      iconDesign: '{"version":1,"bgColor":"#bad"',
    });

    expect(player.iconDesign).toBe(previousDesign);
    expect(() => JSON.parse(player.iconDesign)).not.toThrow();
  });
});
