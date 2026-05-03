/**
 * server/src/utils/playerIconDesign.ts
 *
 * Server-side mirror of the shared player icon design serializer.
 *
 * GammaRoom should only persist validated, complete JSON for PlayerState.iconDesign.
 * Never truncate raw JSON strings in room state — invalid payloads are rejected.
 */

interface IconPoint {
  x: number;
  y: number;
}

interface IconStroke {
  color: string;
  size: number;
  points: IconPoint[];
}

interface IconSticker {
  emoji: string;
  x: number;
  y: number;
  size: number;
}

interface IconTextOverlay {
  value: string;
  color: string;
  size: number;
  x: number;
  y: number;
}

interface IconDesign {
  version: 1;
  bgColor: string;
  strokes: IconStroke[];
  stickers: IconSticker[];
  text: IconTextOverlay | null;
}

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

const DEFAULT_ICON_BG = "#6366f1";
const DEFAULT_BRUSH_COLOR = "#ffffff";
const DEFAULT_TEXT_COLOR = "#ffffff";
const DEFAULT_STICKER_SIZE = 24;
const DEFAULT_TEXT_SIZE = 24;
const MAX_ICON_STICKERS = 20;
const MAX_ICON_STROKES = 256;
const MAX_POINTS_PER_STROKE = 2048;
const SERIALIZED_ICON_FORMAT_VERSION = 2;
const ICON_VIEWBOX_SIZE = 100;
const ICON_POINT_SCALE = 4;
const ICON_POINT_GRID_MAX = ICON_VIEWBOX_SIZE * ICON_POINT_SCALE;
const ICON_POINT_GRID_WIDTH = ICON_POINT_GRID_MAX + 1;

/**
 * Accept detailed user-drawn icons, but keep replicated room state bounded.
 */
export const MAX_ICON_DESIGN_INPUT_LENGTH = 750_000;
export const MAX_ICON_DESIGN_STORED_LENGTH = 2_000_000;

export function sanitizeIconDesignForStorage(raw: string): string | null {
  if (raw.length === 0) return "";
  if (raw.length > MAX_ICON_DESIGN_INPUT_LENGTH) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    const sanitized = sanitizeIconDesign(
      isCompactSerializedIconDesign(parsed)
        ? expandCompactSerializedIconDesign(parsed)
        : parsed as Partial<IconDesign>,
    );
    const serialized = JSON.stringify(sanitized);
    return serialized.length <= MAX_ICON_DESIGN_STORED_LENGTH ? serialized : null;
  } catch {
    return null;
  }
}

function createEmptyIconDesign(bgColor: string = DEFAULT_ICON_BG): IconDesign {
  return {
    version: 1,
    bgColor,
    strokes: [],
    stickers: [],
    text: null,
  };
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
