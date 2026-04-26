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

export function parseIconDesign(raw: string | null | undefined): IconDesign | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<IconDesign>;
    return sanitizeIconDesign(parsed);
  } catch {
    return null;
  }
}

export function serializeIconDesign(design: IconDesign): string {
  return JSON.stringify(sanitizeIconDesign(design));
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
