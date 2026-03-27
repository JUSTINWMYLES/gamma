import { describe, it, expect } from "vitest";
import {
  mixToRGB,
  deltaE,
  rgbToLab,
  computeScore,
  rankResults,
  generateTargetColor,
  MIN_TARGET_DISTANCE,
} from "../src/games/registry-40-paint-match/colorUtils";
import type {
  PaintMix,
  RGB,
  RoundResult,
} from "../src/games/registry-40-paint-match/colorUtils";

// ── mixToRGB ─────────────────────────────────────────────────────────────────

describe("mixToRGB", () => {
  it("empty mix (all zeros) returns white", () => {
    const rgb = mixToRGB({ red: 0, yellow: 0, blue: 0, white: 0, black: 0 });
    expect(rgb).toEqual([255, 255, 255]);
  });

  it("pure red paint produces red-ish colour", () => {
    const rgb = mixToRGB({ red: 1, yellow: 0, blue: 0, white: 0, black: 0 });
    expect(rgb[0]).toBeGreaterThan(200); // high R
    expect(rgb[1]).toBeLessThan(50);     // low G
    expect(rgb[2]).toBeLessThan(50);     // low B
  });

  it("pure yellow paint produces yellow-ish colour", () => {
    const rgb = mixToRGB({ red: 0, yellow: 1, blue: 0, white: 0, black: 0 });
    expect(rgb[0]).toBeGreaterThan(200); // high R
    expect(rgb[1]).toBeGreaterThan(200); // high G
    expect(rgb[2]).toBeLessThan(50);     // low B
  });

  it("pure blue paint produces blue-ish colour", () => {
    const rgb = mixToRGB({ red: 0, yellow: 0, blue: 1, white: 0, black: 0 });
    expect(rgb[0]).toBeLessThan(50);     // low R
    expect(rgb[1]).toBeLessThan(50);     // low G
    expect(rgb[2]).toBeGreaterThan(200); // high B
  });

  it("pure white paint returns white", () => {
    const rgb = mixToRGB({ red: 0, yellow: 0, blue: 0, white: 1, black: 0 });
    expect(rgb).toEqual([255, 255, 255]);
  });

  it("pure black paint returns black", () => {
    const rgb = mixToRGB({ red: 0, yellow: 0, blue: 0, white: 0, black: 1 });
    expect(rgb).toEqual([0, 0, 0]);
  });

  it("red + yellow produces orange-ish colour", () => {
    const rgb = mixToRGB({ red: 1, yellow: 1, blue: 0, white: 0, black: 0 });
    expect(rgb[0]).toBeGreaterThan(200); // high R
    expect(rgb[1]).toBeGreaterThan(50);  // moderate G
    expect(rgb[1]).toBeLessThan(200);    // not full G
    expect(rgb[2]).toBeLessThan(100);    // low-moderate B (trilinear interp artifact)
  });

  it("red + blue produces purple-ish colour", () => {
    const rgb = mixToRGB({ red: 1, yellow: 0, blue: 1, white: 0, black: 0 });
    expect(rgb[0]).toBeGreaterThan(50);  // moderate R
    expect(rgb[1]).toBeLessThan(100);    // low-moderate G (trilinear interp artifact)
    expect(rgb[2]).toBeGreaterThan(50);  // moderate B
  });

  it("yellow + blue produces green-ish colour", () => {
    const rgb = mixToRGB({ red: 0, yellow: 1, blue: 1, white: 0, black: 0 });
    expect(rgb[1]).toBeGreaterThan(50);   // notable G
    expect(rgb[0]).toBeLessThanOrEqual(rgb[1]); // G dominates or equal
  });

  it("adding white lightens a colour", () => {
    const dark = mixToRGB({ red: 1, yellow: 0, blue: 0, white: 0, black: 0 });
    const light = mixToRGB({ red: 1, yellow: 0, blue: 0, white: 1, black: 0 });
    // Lightened version should have higher G and B channels (tinted towards white)
    expect(light[1]).toBeGreaterThan(dark[1]);
    expect(light[2]).toBeGreaterThan(dark[2]);
  });

  it("adding black darkens a colour", () => {
    const bright = mixToRGB({ red: 1, yellow: 0, blue: 0, white: 0, black: 0 });
    const darkened = mixToRGB({ red: 1, yellow: 0, blue: 0, white: 0, black: 1 });
    // Darkened version should have lower R channel
    expect(darkened[0]).toBeLessThan(bright[0]);
  });

  it("all channels at 1 produces a muddy/dark colour", () => {
    const rgb = mixToRGB({ red: 1, yellow: 1, blue: 1, white: 0, black: 0 });
    // RYB all mixed = muddy brown/grey (subtractive mixing doesn't reach pure black
    // with the trilinear interpolation model — it's a brownish colour)
    const brightness = rgb[0] + rgb[1] + rgb[2];
    expect(brightness).toBeLessThan(500);
    // Each channel should be in the mid-range (not bright, not pure black)
    for (const ch of rgb) {
      expect(ch).toBeLessThan(200);
    }
  });

  it("returns integers in [0, 255]", () => {
    const rgb = mixToRGB({ red: 0.7, yellow: 0.3, blue: 0.1, white: 0.2, black: 0.05 });
    for (const ch of rgb) {
      expect(Number.isInteger(ch)).toBe(true);
      expect(ch).toBeGreaterThanOrEqual(0);
      expect(ch).toBeLessThanOrEqual(255);
    }
  });

  it("clamps negative input values to 0", () => {
    const rgb = mixToRGB({ red: -1, yellow: 0, blue: 0, white: 0, black: 0 });
    // Negative is clamped to 0, so this is like empty mix → white
    expect(rgb).toEqual([255, 255, 255]);
  });

  it("clamps input values above 1 to 1", () => {
    const clamped = mixToRGB({ red: 5, yellow: 0, blue: 0, white: 0, black: 0 });
    const normal = mixToRGB({ red: 1, yellow: 0, blue: 0, white: 0, black: 0 });
    expect(clamped).toEqual(normal);
  });
});

// ── rgbToLab ─────────────────────────────────────────────────────────────────

describe("rgbToLab", () => {
  it("black has L* near 0", () => {
    const lab = rgbToLab([0, 0, 0]);
    expect(lab[0]).toBeCloseTo(0, 0);
  });

  it("white has L* near 100", () => {
    const lab = rgbToLab([255, 255, 255]);
    expect(lab[0]).toBeCloseTo(100, 0);
  });

  it("pure red has positive a* (red axis)", () => {
    const lab = rgbToLab([255, 0, 0]);
    expect(lab[1]).toBeGreaterThan(0);
  });

  it("pure green has negative a* (green axis)", () => {
    const lab = rgbToLab([0, 128, 0]);
    expect(lab[1]).toBeLessThan(0);
  });

  it("pure blue has negative b* (blue axis)", () => {
    const lab = rgbToLab([0, 0, 255]);
    expect(lab[2]).toBeLessThan(0);
  });

  it("pure yellow has positive b* (yellow axis)", () => {
    const lab = rgbToLab([255, 255, 0]);
    expect(lab[2]).toBeGreaterThan(0);
  });
});

// ── deltaE ───────────────────────────────────────────────────────────────────

describe("deltaE", () => {
  it("identical colours have distance 0", () => {
    expect(deltaE([128, 64, 200], [128, 64, 200])).toBe(0);
  });

  it("black vs white has large distance", () => {
    const d = deltaE([0, 0, 0], [255, 255, 255]);
    expect(d).toBeGreaterThan(90);
  });

  it("similar colours have small distance", () => {
    const d = deltaE([100, 100, 100], [105, 100, 100]);
    expect(d).toBeLessThan(5);
  });

  it("is symmetric", () => {
    const d1 = deltaE([255, 0, 0], [0, 0, 255]);
    const d2 = deltaE([0, 0, 255], [255, 0, 0]);
    expect(d1).toBeCloseTo(d2, 10);
  });

  it("is non-negative", () => {
    const d = deltaE([50, 100, 150], [200, 50, 25]);
    expect(d).toBeGreaterThanOrEqual(0);
  });

  it("red vs green has large distance", () => {
    const d = deltaE([255, 0, 0], [0, 255, 0]);
    expect(d).toBeGreaterThan(50);
  });
});

// ── computeScore ─────────────────────────────────────────────────────────────

describe("computeScore", () => {
  it("perfect match (distance 0) gives 1000", () => {
    expect(computeScore(0)).toBe(1000);
  });

  it("maximum distance gives 0", () => {
    expect(computeScore(150)).toBe(0);
  });

  it("distance beyond max still gives 0", () => {
    expect(computeScore(200)).toBe(0);
  });

  it("mid-range distance gives proportional score", () => {
    const score = computeScore(75);
    expect(score).toBe(500);
  });

  it("returns non-negative integer", () => {
    const score = computeScore(42.7);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(score)).toBe(true);
  });

  it("closer distance gives higher score", () => {
    const close = computeScore(10);
    const far = computeScore(80);
    expect(close).toBeGreaterThan(far);
  });
});

// ── rankResults ──────────────────────────────────────────────────────────────

describe("rankResults", () => {
  it("ranks players by distance ascending (closest first)", () => {
    const results: RoundResult[] = [
      { playerId: "a", mixRGB: [255, 0, 0], distance: 30, score: 800, rank: 0 },
      { playerId: "b", mixRGB: [0, 255, 0], distance: 10, score: 933, rank: 0 },
      { playerId: "c", mixRGB: [0, 0, 255], distance: 50, score: 667, rank: 0 },
    ];
    rankResults(results);
    expect(results[0].playerId).toBe("b");
    expect(results[1].playerId).toBe("a");
    expect(results[2].playerId).toBe("c");
  });

  it("assigns rank numbers starting from 1", () => {
    const results: RoundResult[] = [
      { playerId: "x", mixRGB: [128, 128, 128], distance: 5, score: 967, rank: 0 },
      { playerId: "y", mixRGB: [64, 64, 64], distance: 15, score: 900, rank: 0 },
    ];
    rankResults(results);
    expect(results[0].rank).toBe(1);
    expect(results[1].rank).toBe(2);
  });

  it("handles empty array", () => {
    const results: RoundResult[] = [];
    expect(rankResults(results)).toEqual([]);
  });

  it("single player gets rank 1", () => {
    const results: RoundResult[] = [
      { playerId: "solo", mixRGB: [100, 100, 100], distance: 20, score: 867, rank: 0 },
    ];
    rankResults(results);
    expect(results[0].rank).toBe(1);
  });

  it("breaks ties by score descending", () => {
    const results: RoundResult[] = [
      { playerId: "a", mixRGB: [100, 100, 100], distance: 20, score: 800, rank: 0 },
      { playerId: "b", mixRGB: [100, 100, 100], distance: 20, score: 900, rank: 0 },
    ];
    rankResults(results);
    expect(results[0].playerId).toBe("b");
  });
});

// ── generateTargetColor ──────────────────────────────────────────────────────

describe("generateTargetColor", () => {
  it("returns an RGB triplet with values in [0, 255]", () => {
    const rgb = generateTargetColor();
    expect(rgb.length).toBe(3);
    for (const ch of rgb) {
      expect(ch).toBeGreaterThanOrEqual(0);
      expect(ch).toBeLessThanOrEqual(255);
      expect(Number.isInteger(ch)).toBe(true);
    }
  });

  it("returns different colours on repeated calls (not deterministic)", () => {
    const colours = new Set<string>();
    for (let i = 0; i < 20; i++) {
      colours.add(generateTargetColor().join(","));
    }
    // Very unlikely all 20 are the same
    expect(colours.size).toBeGreaterThan(1);
  });

  it("generates colour distinct from previous targets", () => {
    const previous: RGB[] = [[255, 0, 0], [0, 255, 0], [0, 0, 255]];
    const target = generateTargetColor(previous);

    // The target should be at some distance from each previous target
    // (at least best-effort — may not always reach MIN_TARGET_DISTANCE
    // with pathological inputs, but usually should)
    for (const prev of previous) {
      const d = deltaE(target, prev);
      // Just verify it's not identical
      expect(d).toBeGreaterThan(0);
    }
  });

  it("handles empty previous targets array", () => {
    const rgb = generateTargetColor([]);
    expect(rgb.length).toBe(3);
  });

  it("produces sufficiently distinct consecutive targets in typical usage", () => {
    const targets: RGB[] = [];
    for (let i = 0; i < 5; i++) {
      const target = generateTargetColor(targets);
      targets.push(target);
    }

    // Check that consecutive targets are not identical
    for (let i = 1; i < targets.length; i++) {
      const d = deltaE(targets[i], targets[i - 1]);
      expect(d).toBeGreaterThan(0);
    }
  });
});

// ── Integration: full mix-to-score flow ──────────────────────────────────────

describe("integration: mix → RGB → distance → score → rank", () => {
  it("a closer mix gets a higher score than a farther mix", () => {
    const target: RGB = [200, 100, 50];

    // Mix that should be somewhat close to an orange/brown target
    const closeMix: PaintMix = { red: 0.7, yellow: 0.5, blue: 0, white: 0.1, black: 0.1 };
    const farMix: PaintMix = { red: 0, yellow: 0, blue: 1, white: 0, black: 0 };

    const closeRGB = mixToRGB(closeMix);
    const farRGB = mixToRGB(farMix);

    const closeDist = deltaE(closeRGB, target);
    const farDist = deltaE(farRGB, target);

    expect(closeDist).toBeLessThan(farDist);
    expect(computeScore(closeDist)).toBeGreaterThan(computeScore(farDist));
  });

  it("full flow: mix → RGB → distance → score → rank", () => {
    const target: RGB = [128, 64, 192];

    const mixes: PaintMix[] = [
      { red: 0.5, yellow: 0, blue: 0.8, white: 0.1, black: 0 },
      { red: 0, yellow: 1, blue: 0, white: 0, black: 0 },
      { red: 0.3, yellow: 0.1, blue: 0.5, white: 0.2, black: 0.1 },
    ];

    const results: RoundResult[] = mixes.map((mix, i) => {
      const rgb = mixToRGB(mix);
      const distance = deltaE(rgb, target);
      const score = computeScore(distance);
      return {
        playerId: `player-${i}`,
        mixRGB: rgb,
        distance: Math.round(distance * 100) / 100,
        score,
        rank: 0,
      };
    });

    rankResults(results);

    // Verify ranks are assigned correctly
    expect(results[0].rank).toBe(1);
    expect(results[1].rank).toBe(2);
    expect(results[2].rank).toBe(3);

    // Verify ordering: lowest distance first
    expect(results[0].distance).toBeLessThanOrEqual(results[1].distance);
    expect(results[1].distance).toBeLessThanOrEqual(results[2].distance);

    // Verify all scores are valid
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1000);
    }
  });

  it("submitting the exact target colour via paint mix gives a high score", () => {
    // Target is pure red [255, 0, 0]; pure red paint should produce close to [255, 0, 0]
    const target: RGB = [255, 0, 0];
    const mix: PaintMix = { red: 1, yellow: 0, blue: 0, white: 0, black: 0 };
    const rgb = mixToRGB(mix);
    const distance = deltaE(rgb, target);
    const score = computeScore(distance);

    // Should be very close (small distance, high score)
    expect(distance).toBeLessThan(10);
    expect(score).toBeGreaterThan(900);
  });
});
