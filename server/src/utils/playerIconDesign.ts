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

const DEFAULT_ICON_BG = "#6366f1";
const DEFAULT_BRUSH_COLOR = "#ffffff";
const DEFAULT_TEXT_COLOR = "#ffffff";
const DEFAULT_STICKER_SIZE = 24;
const DEFAULT_TEXT_SIZE = 24;
const MAX_ICON_STICKERS = 20;
const MAX_ICON_STROKES = 256;
const MAX_POINTS_PER_STROKE = 2048;

/**
 * Accept detailed user-drawn icons, but keep replicated room state bounded.
 */
export const MAX_ICON_DESIGN_INPUT_LENGTH = 750_000;
export const MAX_ICON_DESIGN_STORED_LENGTH = 2_000_000;

export function sanitizeIconDesignForStorage(raw: string): string | null {
  if (raw.length === 0) return "";
  if (raw.length > MAX_ICON_DESIGN_INPUT_LENGTH) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<IconDesign>;
    const sanitized = sanitizeIconDesign(parsed);
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
