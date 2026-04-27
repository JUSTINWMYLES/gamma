import type { PlayerState } from "./types";

export interface IconPoint {
  x: number;
  y: number;
}

export interface IconStroke {
  color: string;
  size: number;
  points: IconPoint[];
}

export interface IconSticker {
  emoji: string;
  x: number;
  y: number;
  size: number;
}

export interface IconTextOverlay {
  value: string;
  color: string;
  size: number;
  x: number;
  y: number;
}

export interface IconDesign {
  version: 1;
  bgColor: string;
  strokes: IconStroke[];
  stickers: IconSticker[];
  text: IconTextOverlay | null;
}

export const DEFAULT_ICON_BG = "#6366f1";
export const DEFAULT_BRUSH_COLOR = "#ffffff";
export const DEFAULT_TEXT_COLOR = "#ffffff";
export const DEFAULT_STICKER_SIZE = 24;
export const DEFAULT_TEXT_SIZE = 24;
export const MAX_ICON_STICKERS = 20;
export const ICON_VIEWBOX_SIZE = 100;
export const MAX_ICON_STROKES = 256;
export const MAX_POINTS_PER_STROKE = 2048;
export const MAX_ICON_DESIGN_SERIALIZED_LENGTH = 20_000;

const SERIALIZED_ICON_FORMAT_VERSION = 2;
const ICON_POINT_SCALE = 4;
const ICON_POINT_GRID_MAX = ICON_VIEWBOX_SIZE * ICON_POINT_SCALE;
const ICON_POINT_GRID_WIDTH = ICON_POINT_GRID_MAX + 1;

type CompactSerializedStroke = [color: string, size: number, points: string];
type CompactSerializedSticker = [emoji: string, x: number, y: number, size: number];
type CompactSerializedText = [value: string, color: string, size: number, x: number, y: number];

interface CompactSerializedIconDesign {
  v: 2;
  b: string;
  s: CompactSerializedStroke[];
  k?: CompactSerializedSticker[];
  t?: CompactSerializedText | null;
}

// Saved brush sizes were tuned against the editor preview's 100x100 SVG.
// Keep the same scale everywhere so previously drawn icons still match what
// players saw while drawing them.
export function getIconStrokeRenderWidth(strokeSize: number): number {
  return clamp(strokeSize, 2, 24) / 4;
}

export function createEmptyIconDesign(bgColor: string = DEFAULT_ICON_BG): IconDesign {
  return {
    version: 1,
    bgColor,
    strokes: [],
    stickers: [],
    text: null,
  };
}

export function iconDesignHasVisibleContent(design: IconDesign | null): boolean {
  return !!(
    design &&
    (design.strokes.length > 0 || design.stickers.length > 0 || design.text?.value.trim())
  );
}

export function cloneIconDesign(design: IconDesign | null | undefined): IconDesign {
  return sanitizeIconDesign(design);
}

export function parseIconDesign(raw: string | null | undefined): IconDesign | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isCompactSerializedIconDesign(parsed)) {
      return sanitizeIconDesign(expandCompactSerializedIconDesign(parsed));
    }

    return sanitizeIconDesign(parsed as Partial<IconDesign>);
  } catch {
    return null;
  }
}

export function serializeIconDesign(design: IconDesign): string {
  const fittedDesign = fitIconDesignForSerialization(sanitizeIconDesign(design));
  return serializeCompactIconDesign(fittedDesign);
}

export function designFromPlayer(player: Pick<PlayerState, "iconDesign" | "iconEmoji" | "iconText" | "iconBgColor"> | null | undefined): IconDesign {
  const explicitBgColor = typeof player?.iconBgColor === "string" && player.iconBgColor.length > 0 && player.iconBgColor.length <= 20
    ? player.iconBgColor
    : null;
  const fromSaved = parseIconDesign(player?.iconDesign);
  if (fromSaved) {
    return {
      ...fromSaved,
      bgColor: explicitBgColor ?? fromSaved.bgColor,
    };
  }

  const design = createEmptyIconDesign(explicitBgColor ?? DEFAULT_ICON_BG);
  if (player?.iconEmoji) {
    design.stickers.push({
      emoji: player.iconEmoji,
      x: 50,
      y: 52,
      size: 28,
    });
  }
  if (player?.iconText) {
    design.text = {
      value: player.iconText,
      color: DEFAULT_TEXT_COLOR,
      size: 24,
      x: 50,
      y: 58,
    };
  }
  return design;
}

function sanitizeIconDesign(input: Partial<IconDesign> | null | undefined): IconDesign {
  const design = createEmptyIconDesign(
    typeof input?.bgColor === "string" && input.bgColor.length <= 20
      ? input.bgColor
      : DEFAULT_ICON_BG,
  );

  if (Array.isArray(input?.strokes)) {
    design.strokes = input.strokes
      .map((stroke) => ({
        color: typeof stroke?.color === "string" && stroke.color.length <= 20
          ? stroke.color
          : DEFAULT_BRUSH_COLOR,
        size: clamp(stroke?.size ?? 6, 2, 24),
        points: Array.isArray(stroke?.points)
          ? stroke.points
              .map((point) => ({
                x: clamp(point?.x ?? 50, 0, 100),
                y: clamp(point?.y ?? 50, 0, 100),
              }))
              .slice(0, MAX_POINTS_PER_STROKE)
          : [],
      }))
      .filter((stroke) => stroke.points.length > 0)
      .slice(0, MAX_ICON_STROKES);
  }

  if (Array.isArray(input?.stickers)) {
    design.stickers = input.stickers
      .map((sticker) => ({
        emoji: typeof sticker?.emoji === "string" ? sticker.emoji.slice(0, 8) : "",
        x: clamp(sticker?.x ?? 50, 0, 100),
        y: clamp(sticker?.y ?? 50, 0, 100),
        size: clamp(sticker?.size ?? DEFAULT_STICKER_SIZE, 12, 48),
      }))
      .filter((sticker) => sticker.emoji.length > 0)
      .slice(0, MAX_ICON_STICKERS);
  }

  if (input?.text && typeof input.text.value === "string" && input.text.value.trim()) {
    design.text = {
      value: input.text.value.slice(0, 12),
      color: typeof input.text.color === "string" && input.text.color.length <= 20
        ? input.text.color
        : DEFAULT_TEXT_COLOR,
      size: clamp(input.text.size ?? DEFAULT_TEXT_SIZE, 12, 42),
      x: clamp(input.text.x ?? 50, 10, 90),
      y: clamp(input.text.y ?? 58, 10, 90),
    };
  }

  return design;
}

function isCompactSerializedIconDesign(value: unknown): value is Partial<CompactSerializedIconDesign> {
  return !!value && typeof value === "object" && !Array.isArray(value) && (
    "b" in value ||
    "s" in value ||
    "k" in value ||
    "t" in value ||
    ("v" in value && (value as { v?: unknown }).v === SERIALIZED_ICON_FORMAT_VERSION)
  );
}

function expandCompactSerializedIconDesign(input: Partial<CompactSerializedIconDesign>): Partial<IconDesign> {
  return {
    version: 1,
    bgColor: typeof input.b === "string" ? input.b : DEFAULT_ICON_BG,
    strokes: Array.isArray(input.s)
      ? input.s.map((stroke) => ({
          color: typeof stroke?.[0] === "string" ? stroke[0] : DEFAULT_BRUSH_COLOR,
          size: typeof stroke?.[1] === "number" ? stroke[1] : 6,
          points: decodeCompactStrokePoints(stroke?.[2]),
        }))
      : [],
    stickers: Array.isArray(input.k)
      ? input.k.map((sticker) => ({
          emoji: typeof sticker?.[0] === "string" ? sticker[0] : "",
          x: typeof sticker?.[1] === "number" ? sticker[1] : 50,
          y: typeof sticker?.[2] === "number" ? sticker[2] : 50,
          size: typeof sticker?.[3] === "number" ? sticker[3] : DEFAULT_STICKER_SIZE,
        }))
      : [],
    text: Array.isArray(input.t) && typeof input.t[0] === "string"
      ? {
          value: input.t[0],
          color: typeof input.t[1] === "string" ? input.t[1] : DEFAULT_TEXT_COLOR,
          size: typeof input.t[2] === "number" ? input.t[2] : DEFAULT_TEXT_SIZE,
          x: typeof input.t[3] === "number" ? input.t[3] : 50,
          y: typeof input.t[4] === "number" ? input.t[4] : 58,
        }
      : null,
  };
}

function fitIconDesignForSerialization(design: IconDesign): IconDesign {
  const normalizedDesign: IconDesign = {
    ...design,
    strokes: design.strokes.map((stroke) => ({
      ...stroke,
      points: normalizeStrokePoints(stroke.points),
    })),
  };

  let candidate = normalizedDesign;
  let serialized = serializeCompactIconDesign(candidate);
  if (serialized.length <= MAX_ICON_DESIGN_SERIALIZED_LENGTH) {
    return candidate;
  }

  for (const step of [2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512, 768, 1024, 1536, 2048]) {
    candidate = {
      ...normalizedDesign,
      strokes: normalizedDesign.strokes
        .map((stroke) => ({
          ...stroke,
          points: sampleStrokePoints(stroke.points, step),
        }))
        .filter((stroke) => stroke.points.length > 0),
    };

    serialized = serializeCompactIconDesign(candidate);
    if (serialized.length <= MAX_ICON_DESIGN_SERIALIZED_LENGTH) {
      return candidate;
    }
  }

  while (candidate.strokes.length > 0) {
    candidate = {
      ...candidate,
      strokes: candidate.strokes.slice(0, -1),
    };
    serialized = serializeCompactIconDesign(candidate);
    if (serialized.length <= MAX_ICON_DESIGN_SERIALIZED_LENGTH) {
      return candidate;
    }
  }

  return candidate;
}

function serializeCompactIconDesign(design: IconDesign): string {
  const compactDesign: CompactSerializedIconDesign = {
    v: SERIALIZED_ICON_FORMAT_VERSION,
    b: design.bgColor,
    s: design.strokes.map((stroke) => [
      stroke.color,
      stroke.size,
      encodeCompactStrokePoints(stroke.points),
    ]),
  };

  if (design.stickers.length > 0) {
    compactDesign.k = design.stickers.map((sticker) => [
      sticker.emoji,
      sticker.x,
      sticker.y,
      sticker.size,
    ]);
  }

  if (design.text?.value) {
    compactDesign.t = [
      design.text.value,
      design.text.color,
      design.text.size,
      design.text.x,
      design.text.y,
    ];
  }

  return JSON.stringify(compactDesign);
}

function normalizeStrokePoints(points: IconPoint[]): IconPoint[] {
  const normalized: IconPoint[] = [];

  for (const point of points) {
    const nextPoint = quantizePoint(point);
    const previousPoint = normalized[normalized.length - 1];
    if (previousPoint && previousPoint.x === nextPoint.x && previousPoint.y === nextPoint.y) {
      continue;
    }

    normalized.push(nextPoint);
  }

  return normalized.slice(0, MAX_POINTS_PER_STROKE);
}

function sampleStrokePoints(points: IconPoint[], step: number): IconPoint[] {
  if (points.length <= 2 || step <= 1) {
    return points;
  }

  const sampledPoints: IconPoint[] = [points[0]];
  for (let index = step; index < points.length - 1; index += step) {
    const point = points[index];
    const previousPoint = sampledPoints[sampledPoints.length - 1];
    if (previousPoint.x === point.x && previousPoint.y === point.y) {
      continue;
    }

    sampledPoints.push(point);
  }

  const lastPoint = points[points.length - 1];
  const previousPoint = sampledPoints[sampledPoints.length - 1];
  if (!previousPoint || previousPoint.x !== lastPoint.x || previousPoint.y !== lastPoint.y) {
    sampledPoints.push(lastPoint);
  }

  return sampledPoints.slice(0, MAX_POINTS_PER_STROKE);
}

function encodeCompactStrokePoints(points: IconPoint[]): string {
  return points
    .map((point) => {
      const x = clamp(Math.round(point.x * ICON_POINT_SCALE), 0, ICON_POINT_GRID_MAX);
      const y = clamp(Math.round(point.y * ICON_POINT_SCALE), 0, ICON_POINT_GRID_MAX);
      return (x * ICON_POINT_GRID_WIDTH + y).toString(36);
    })
    .join(".");
}

function decodeCompactStrokePoints(raw: unknown): IconPoint[] {
  if (typeof raw !== "string" || raw.length === 0) {
    return [];
  }

  const points: IconPoint[] = [];

  for (const encodedPoint of raw.split(".")) {
    if (!encodedPoint) continue;

    const compactValue = Number.parseInt(encodedPoint, 36);
    if (!Number.isFinite(compactValue) || compactValue < 0) {
      continue;
    }

    const x = Math.floor(compactValue / ICON_POINT_GRID_WIDTH);
    const y = compactValue % ICON_POINT_GRID_WIDTH;
    points.push({
      x: clamp(x / ICON_POINT_SCALE, 0, ICON_VIEWBOX_SIZE),
      y: clamp(y / ICON_POINT_SCALE, 0, ICON_VIEWBOX_SIZE),
    });
  }

  return points;
}

function quantizePoint(point: IconPoint): IconPoint {
  return {
    x: clamp(Math.round(point.x * ICON_POINT_SCALE) / ICON_POINT_SCALE, 0, ICON_VIEWBOX_SIZE),
    y: clamp(Math.round(point.y * ICON_POINT_SCALE) / ICON_POINT_SCALE, 0, ICON_VIEWBOX_SIZE),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
