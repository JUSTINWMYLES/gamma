import { describe, expect, it } from "vitest";
import {
  MAX_ICON_DESIGN_SERIALIZED_LENGTH,
  createEmptyIconDesign,
  getIconStrokeRenderWidth,
  parseIconDesign,
  serializeIconDesign,
} from "../../../shared/playerIconDesign";

describe("getIconStrokeRenderWidth", () => {
  it("matches the editor stroke scale used by saved icon drawings", () => {
    expect(getIconStrokeRenderWidth(4)).toBe(1);
    expect(getIconStrokeRenderWidth(8)).toBe(2);
    expect(getIconStrokeRenderWidth(12)).toBe(3);
    expect(getIconStrokeRenderWidth(18)).toBe(4.5);
  });

  it("clamps extreme brush sizes to the supported render range", () => {
    expect(getIconStrokeRenderWidth(0)).toBe(0.5);
    expect(getIconStrokeRenderWidth(100)).toBe(6);
  });
});

describe("player icon serialization", () => {
  it("emits compact v2 JSON and parses it back", () => {
    const design = createEmptyIconDesign("#abcdef");
    design.strokes = [
      {
        color: "#112233",
        size: 8,
        points: [
          { x: 10, y: 20 },
          { x: 30, y: 40 },
        ],
      },
    ];
    design.stickers = [
      {
        emoji: "🔥",
        x: 12,
        y: 34,
        size: 30,
      },
    ];
    design.text = {
      value: "NEWS",
      color: "#445566",
      size: 24,
      x: 60,
      y: 70,
    };

    const serialized = serializeIconDesign(design);
    const compact = JSON.parse(serialized);
    const parsed = parseIconDesign(serialized);

    expect(compact).toMatchObject({
      v: 2,
      b: "#abcdef",
    });
    expect(compact.s).toHaveLength(1);
    expect(compact.k).toEqual([["🔥", 12, 34, 30]]);
    expect(compact.t).toEqual(["NEWS", "#445566", 24, 60, 70]);

    expect(parsed).toMatchObject({
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
  });

  it("keeps dense drawings under the serialized length limit", () => {
    const denseDesign = createEmptyIconDesign("#123456");
    denseDesign.strokes = [
      {
        color: "#ffffff",
        size: 8,
        points: Array.from({ length: 1_800 }, (_, index) => ({
          x: (index * 7) % 100,
          y: (index * 11) % 100,
        })),
      },
    ];

    const serialized = serializeIconDesign(denseDesign);
    const parsed = parseIconDesign(serialized);

    expect(serialized.length).toBeLessThanOrEqual(MAX_ICON_DESIGN_SERIALIZED_LENGTH);
    expect(parsed?.bgColor).toBe("#123456");
    expect(parsed?.strokes).toHaveLength(1);
    expect((parsed?.strokes[0]?.points.length ?? 0) > 1).toBe(true);
  });

  it("preserves single-point dot strokes through round-trip serialization", () => {
    const dotDesign = createEmptyIconDesign();
    dotDesign.strokes = [
      {
        color: "#ffffff",
        size: 10,
        points: [{ x: 50, y: 50 }],
      },
    ];

    const parsed = parseIconDesign(serializeIconDesign(dotDesign));

    expect(parsed?.strokes).toHaveLength(1);
    expect(parsed?.strokes[0]?.points).toEqual([{ x: 50, y: 50 }]);
  });

  it("remains backward-compatible with the legacy JSON icon format", () => {
    const legacyDesign = JSON.stringify({
      version: 1,
      bgColor: "#abcdef",
      strokes: [
        {
          color: "#000000",
          size: 6,
          points: [
            { x: 10, y: 20 },
            { x: 30, y: 40 },
          ],
        },
      ],
      stickers: [],
      text: null,
    });

    const parsed = parseIconDesign(legacyDesign);

    expect(parsed?.bgColor).toBe("#abcdef");
    expect(parsed?.strokes).toHaveLength(1);
    expect(parsed?.strokes[0]?.points).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
  });
});
