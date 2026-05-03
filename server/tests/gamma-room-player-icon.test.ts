import { describe, expect, it } from "vitest";
import { createEmptyIconDesign, serializeIconDesign } from "../../client/shared/playerIconDesign";
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
  it("accepts compact v2 icon JSON from the client and stores legacy sanitized JSON", () => {
    const { player, handlers, client } = createRoomHarness();
    const customizePlayer = handlers.get("customize_player");
    const compactDesign = createEmptyIconDesign("#abcdef");

    compactDesign.strokes = [
      {
        color: "#112233",
        size: 8,
        points: [
          { x: 10, y: 20 },
          { x: 30, y: 40 },
        ],
      },
    ];
    compactDesign.stickers = [
      {
        emoji: "🔥",
        x: 12,
        y: 34,
        size: 30,
      },
    ];
    compactDesign.text = {
      value: "NEWS",
      color: "#445566",
      size: 24,
      x: 60,
      y: 70,
    };

    expect(customizePlayer).toBeTypeOf("function");

    customizePlayer?.(client, {
      iconBgColor: "#abcdef",
      iconDesign: serializeIconDesign(compactDesign),
    });

    const saved = JSON.parse(player.iconDesign);

    expect(player.iconBgColor).toBe("#abcdef");
    expect(saved).toMatchObject({
      version: 1,
      bgColor: "#abcdef",
      strokes: [
        {
          color: "#112233",
          size: 8,
          points: [
            { x: 10, y: 20 },
            { x: 30, y: 40 },
          ],
        },
      ],
      stickers: [
        {
          emoji: "🔥",
          x: 12,
          y: 34,
          size: 30,
        },
      ],
      text: {
        value: "NEWS",
        color: "#445566",
        size: 24,
        x: 60,
        y: 70,
      },
    });
    expect(saved).not.toHaveProperty("v");
    expect(saved).not.toHaveProperty("b");
    expect(saved).not.toHaveProperty("s");
    expect(saved).not.toHaveProperty("k");
    expect(saved).not.toHaveProperty("t");
  });

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
