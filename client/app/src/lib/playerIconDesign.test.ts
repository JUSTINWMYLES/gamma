import { describe, expect, it } from "vitest";
import { getIconStrokeRenderWidth } from "../../../shared/playerIconDesign";

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
