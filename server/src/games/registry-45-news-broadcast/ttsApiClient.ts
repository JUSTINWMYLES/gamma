import type { VoiceOption } from "./newsBroadcastLogic";

const DEFAULT_TTS_TIMEOUT_MS = 8_000;

interface TTSJobResponse {
  id: string;
  status: string;
  mimeType?: string;
  durationMs?: number;
  artifactKey?: string;
  voicePresetId?: string;
}

export type TTSArtifactFetchResult =
  | {
      ok: true;
      status: number;
      bytes: Buffer;
      contentType: string;
      cacheControl?: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

function ttsApiUrl(): string | null {
  const base = process.env.TTS_API_URL?.trim();
  return base ? base.replace(/\/$/, "") : null;
}

async function fetchResponse(path: string, init?: RequestInit): Promise<Response | null> {
  const base = ttsApiUrl();
  if (!base) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TTS_TIMEOUT_MS);
  try {
    const headers = new Headers(init?.headers);
    if (init?.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    return await fetch(`${base}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    console.warn(`[NewsBroadcast] TTS API ${path} request failed:`, error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  const res = await fetchResponse(path, init);
  if (!res) return null;
  if (!res.ok) {
    console.warn(`[NewsBroadcast] TTS API ${path} failed with status ${res.status}`);
    return null;
  }
  return await res.json() as T;
}

async function readErrorMessage(res: Response): Promise<string | null> {
  try {
    const contentType = res.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType.includes("application/json")) {
      const payload = await res.json() as { error?: unknown; message?: unknown };
      if (typeof payload.error === "string" && payload.error.trim()) return payload.error;
      if (typeof payload.message === "string" && payload.message.trim()) return payload.message;
      return null;
    }

    const text = (await res.text()).trim();
    return text ? text : null;
  } catch {
    return null;
  }
}

export async function fetchAvailableVoices(): Promise<VoiceOption[]> {
  const response = await fetchJson<{ voices?: VoiceOption[] }>("/tts/voices");
  return response?.voices ?? [];
}

export async function createTTSJob(payload: {
  roomId: string;
  roundId: string;
  playerId: string;
  locale: string;
  voicePresetId: string;
  text: string;
  priority: "blocker" | "next" | "background";
  estimatedSpeechMs: number;
}): Promise<TTSJobResponse | null> {
  return fetchJson<TTSJobResponse>("/tts/jobs", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getTTSJob(jobId: string): Promise<TTSJobResponse | null> {
  return fetchJson<TTSJobResponse>(`/tts/jobs/${encodeURIComponent(jobId)}`);
}

export async function updateTTSJobPriority(
  jobId: string,
  priority: "blocker" | "next" | "background",
): Promise<TTSJobResponse | null> {
  return fetchJson<TTSJobResponse>(`/tts/jobs/${encodeURIComponent(jobId)}/priority`, {
    method: "PATCH",
    body: JSON.stringify({ priority }),
  });
}

export async function deleteRoomArtifacts(roomId: string): Promise<void> {
  await fetchJson(`/tts/rooms/${encodeURIComponent(roomId)}/artifacts`, {
    method: "DELETE",
  });
}

export async function fetchTTSArtifact(jobId: string): Promise<TTSArtifactFetchResult | null> {
  const res = await fetchResponse(`/tts/jobs/${encodeURIComponent(jobId)}/artifact`);
  if (!res) return null;

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: (await readErrorMessage(res)) ?? `TTS artifact request failed with status ${res.status}`,
    };
  }

  return {
    ok: true,
    status: res.status,
    bytes: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get("content-type") ?? "audio/mpeg",
    cacheControl: res.headers.get("cache-control") ?? undefined,
  };
}

export function isTTSEnabled(): boolean {
  return Boolean(ttsApiUrl());
}
