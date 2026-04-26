import type { NormalizedMediaEntry } from "./newsBroadcastLogic";

const KLIPY_API_BASE = "https://api.klipy.com/api/v1";
const KLIPY_PER_PAGE = 12;
const KLIPY_FETCH_TIMEOUT_MS = 5_000;

interface KlipyMediaVariant {
  url?: string;
}

interface KlipyFileSet {
  gif?: KlipyMediaVariant;
  webp?: KlipyMediaVariant;
  jpg?: KlipyMediaVariant;
  mp4?: KlipyMediaVariant;
  webm?: KlipyMediaVariant;
}

interface KlipyGifItem {
  id?: number;
  slug?: string;
  title?: string;
  width?: number;
  height?: number;
  duration?: number;
  file?: {
    sm?: KlipyFileSet;
    md?: KlipyFileSet;
    hd?: KlipyFileSet;
  };
}

interface KlipySearchResponse {
  result?: boolean;
  errors?: { message?: string[] };
  data?: {
    data?: KlipyGifItem[];
  };
}

function buildMediaEntry(item: KlipyGifItem): NormalizedMediaEntry | null {
  const previewUrl =
    item.file?.sm?.webp?.url ??
    item.file?.sm?.gif?.url ??
    item.file?.md?.webp?.url ??
    item.file?.md?.gif?.url ??
    item.file?.hd?.jpg?.url ??
    "";

  const playbackUrl =
    item.file?.md?.mp4?.url ??
    item.file?.md?.webm?.url ??
    item.file?.sm?.mp4?.url ??
    item.file?.sm?.webm?.url ??
    item.file?.sm?.gif?.url ??
    item.file?.md?.gif?.url ??
    "";

  const fallbackImageUrl =
    item.file?.hd?.jpg?.url ??
    item.file?.md?.jpg?.url ??
    item.file?.sm?.jpg?.url ??
    previewUrl;

  if (!previewUrl && !playbackUrl && !fallbackImageUrl) return null;

  const mimeType = playbackUrl.endsWith(".mp4")
    ? "video/mp4"
    : playbackUrl.endsWith(".webm")
    ? "video/webm"
    : playbackUrl.endsWith(".gif")
    ? "image/gif"
    : fallbackImageUrl.endsWith(".jpg") || fallbackImageUrl.endsWith(".jpeg")
    ? "image/jpeg"
    : "image/webp";

  const providerAssetId = String(item.id ?? item.slug ?? playbackUrl ?? previewUrl);
  return {
    provider: "klipy",
    providerAssetId,
    label: item.title?.trim() || "Media",
    previewUrl,
    playbackUrl,
    fallbackImageUrl,
    mimeType,
    width: item.width,
    height: item.height,
    durationMs: typeof item.duration === "number" ? Math.round(item.duration * 1000) : undefined,
  };
}

export async function fetchKlipyMedia(query: string): Promise<NormalizedMediaEntry[]> {
  const apiKey = process.env.KLIPY_API_KEY;
  if (!apiKey) {
    console.warn("[NewsBroadcast] KLIPY_API_KEY is not set — cannot search media");
    return [];
  }

  try {
    const url =
      `${KLIPY_API_BASE}/${encodeURIComponent(apiKey)}/gifs/search` +
      `?q=${encodeURIComponent(query)}` +
      `&per_page=${KLIPY_PER_PAGE}` +
      `&customer_id=gamma-game`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), KLIPY_FETCH_TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok || res.status === 204) return [];
    const text = await res.text();
    if (!text.trim()) return [];
    const json = JSON.parse(text) as KlipySearchResponse;
    if (json.result === false) return [];
    const items = json.data?.data;
    if (!items || !Array.isArray(items)) return [];

    return items.map(buildMediaEntry).filter((entry): entry is NormalizedMediaEntry => entry !== null);
  } catch (error) {
    console.warn(`[NewsBroadcast] Klipy media fetch failed for query ${query}:`, error);
    return [];
  }
}
