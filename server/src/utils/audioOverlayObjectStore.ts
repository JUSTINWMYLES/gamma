import { randomUUID } from "node:crypto";
import { Client as MinioClient } from "minio";

const DEFAULT_BUCKET = "gamma-audio-overlay-clips";
const DEFAULT_PREFIX = "audio-overlay-clips";
const DEFAULT_CACHE_CONTROL = "private, max-age=300";
const CLIP_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,127})$/;

export interface AudioOverlayObjectStoreConfig {
  endpoint: string;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
  prefix: string;
}

export type AudioOverlayClipFetchResult =
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

interface ParsedEndpoint {
  endPoint: string;
  port: number;
  useSSL: boolean;
}

function readEnvString(env: NodeJS.ProcessEnv, name: string): string | null {
  const value = env[name]?.trim();
  return value ? value : null;
}

function parseBoolean(value: string | null, fallback: boolean): boolean {
  if (!value) return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}

function normalizePrefix(value: string | null): string {
  if (!value) return DEFAULT_PREFIX;
  return value.replace(/^\/+/, "").replace(/\/+$/, "") || DEFAULT_PREFIX;
}

function parseEndpoint(endpoint: string, useSSL: boolean): ParsedEndpoint | null {
  const candidate = endpoint.includes("://")
    ? endpoint
    : `${useSSL ? "https" : "http"}://${endpoint}`;

  try {
    const parsed = new URL(candidate);
    if (!parsed.hostname) return null;

    const resolvedUseSSL = parsed.protocol === "https:";
    const resolvedPort = parsed.port
      ? Number(parsed.port)
      : resolvedUseSSL
        ? 443
        : 80;

    if (!Number.isInteger(resolvedPort) || resolvedPort <= 0) {
      return null;
    }

    return {
      endPoint: parsed.hostname,
      port: resolvedPort,
      useSSL: resolvedUseSSL,
    };
  } catch {
    return null;
  }
}

function isKnownObjectStoreErrorCode(error: unknown, ...codes: string[]): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && codes.includes(code);
}

function metadataValue(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  if (!metadata) return undefined;

  const raw = metadata[key] ?? metadata[key.toLowerCase()] ?? metadata[key.toUpperCase()];
  if (typeof raw === "string" && raw.trim()) return raw;
  if (Array.isArray(raw)) {
    const first = raw.find((value) => typeof value === "string" && value.trim());
    return typeof first === "string" ? first : undefined;
  }
  return undefined;
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export function sanitizeAudioOverlayClipId(value: string): string | null {
  const trimmed = value.trim();
  return CLIP_ID_PATTERN.test(trimmed) ? trimmed : null;
}

export function buildAudioOverlayClipProxyPath(clipId: string): string {
  return `/api/audio-overlay/clips/${encodeURIComponent(clipId)}`;
}

export function parseAudioOverlayObjectStoreConfig(
  env: NodeJS.ProcessEnv = process.env,
): AudioOverlayObjectStoreConfig | null {
  const endpoint = readEnvString(env, "AUDIO_OVERLAY_OBJECT_STORE_ENDPOINT");
  if (!endpoint) return null;

  const useSSL = parseBoolean(
    readEnvString(env, "AUDIO_OVERLAY_OBJECT_STORE_USE_SSL"),
    false,
  );
  const parsedEndpoint = parseEndpoint(endpoint, useSSL);
  if (!parsedEndpoint) return null;

  return {
    endpoint: `${parsedEndpoint.endPoint}:${parsedEndpoint.port}`,
    useSSL: parsedEndpoint.useSSL,
    accessKey: readEnvString(env, "AUDIO_OVERLAY_OBJECT_STORE_ACCESS_KEY") ?? "gamma",
    secretKey: readEnvString(env, "AUDIO_OVERLAY_OBJECT_STORE_SECRET_KEY") ?? "gammalocal",
    bucket: readEnvString(env, "AUDIO_OVERLAY_OBJECT_STORE_BUCKET") ?? DEFAULT_BUCKET,
    prefix: normalizePrefix(readEnvString(env, "AUDIO_OVERLAY_OBJECT_STORE_PREFIX")),
  };
}

class AudioOverlayObjectStore {
  private readonly config = parseAudioOverlayObjectStoreConfig();
  private readonly endpoint = this.config
    ? parseEndpoint(this.config.endpoint, this.config.useSSL)
    : null;
  private readonly client = this.config && this.endpoint
    ? new MinioClient({
        endPoint: this.endpoint.endPoint,
        port: this.endpoint.port,
        useSSL: this.endpoint.useSSL,
        accessKey: this.config.accessKey,
        secretKey: this.config.secretKey,
      })
    : null;
  private bucketReadyPromise: Promise<void> | null = null;

  isEnabled(): boolean {
    return this.config !== null && this.endpoint !== null && this.client !== null;
  }

  private objectKey(clipId: string): string {
    const prefix = this.config?.prefix ?? DEFAULT_PREFIX;
    return `${prefix}/${clipId}.webm`;
  }

  private async ensureBucket(): Promise<void> {
    if (!this.client || !this.config) return;
    const client = this.client;
    const config = this.config;
    if (this.bucketReadyPromise) {
      await this.bucketReadyPromise;
      return;
    }

    this.bucketReadyPromise = (async () => {
      const exists = await client.bucketExists(config.bucket);
      if (exists) return;

      try {
        await client.makeBucket(config.bucket);
      } catch (error) {
        if (
          !isKnownObjectStoreErrorCode(
            error,
            "BucketAlreadyExists",
            "BucketAlreadyOwnedByYou",
          )
        ) {
          throw error;
        }
      }
    })().catch((error) => {
      this.bucketReadyPromise = null;
      throw error;
    });

    await this.bucketReadyPromise;
  }

  async storeClip(bytes: Buffer, contentType: string = "audio/webm"): Promise<{ clipId: string } | null> {
    if (!this.client || !this.config) return null;

    await this.ensureBucket();

    const clipId = randomUUID();
    await this.client.putObject(
      this.config.bucket,
      this.objectKey(clipId),
      bytes,
      bytes.byteLength,
      {
        "Content-Type": contentType,
        "Cache-Control": DEFAULT_CACHE_CONTROL,
      },
    );

    return { clipId };
  }

  async fetchClip(clipId: string): Promise<AudioOverlayClipFetchResult | null> {
    if (!this.client || !this.config) return null;

    try {
      const objectKey = this.objectKey(clipId);
      const stat = await this.client.statObject(this.config.bucket, objectKey);
      const stream = await this.client.getObject(this.config.bucket, objectKey);
      return {
        ok: true,
        status: 200,
        bytes: await streamToBuffer(stream),
        contentType: metadataValue(stat.metaData as Record<string, unknown> | undefined, "content-type") ?? "audio/webm",
        cacheControl: metadataValue(stat.metaData as Record<string, unknown> | undefined, "cache-control"),
      };
    } catch (error) {
      if (isKnownObjectStoreErrorCode(error, "NotFound", "NoSuchKey", "NoSuchBucket")) {
        return {
          ok: false,
          status: 404,
          error: "Audio clip not found",
        };
      }

      console.warn("[AudioOverlay] Object store fetch failed:", error);
      return {
        ok: false,
        status: 502,
        error: "Failed to reach audio clip storage",
      };
    }
  }

  async deleteClips(clipIds: string[]): Promise<void> {
    if (!this.client || !this.config || clipIds.length === 0) return;
    const client = this.client;
    const bucket = this.config.bucket;

    await Promise.all(
      [...new Set(clipIds)]
        .map((clipId) => sanitizeAudioOverlayClipId(clipId))
        .filter((clipId): clipId is string => Boolean(clipId))
        .map(async (clipId) => {
          try {
            await client.removeObject(bucket, this.objectKey(clipId));
          } catch (error) {
            if (isKnownObjectStoreErrorCode(error, "NotFound", "NoSuchKey", "NoSuchBucket")) {
              return;
            }

            console.warn(`[AudioOverlay] Failed to delete clip ${clipId}:`, error);
          }
        }),
    );
  }
}

const audioOverlayObjectStore = new AudioOverlayObjectStore();

export function isAudioOverlayObjectStoreEnabled(): boolean {
  return audioOverlayObjectStore.isEnabled();
}

export async function storeAudioOverlayClip(
  bytes: Buffer,
  contentType: string = "audio/webm",
): Promise<{ clipId: string } | null> {
  return audioOverlayObjectStore.storeClip(bytes, contentType);
}

export async function fetchAudioOverlayClip(
  clipId: string,
): Promise<AudioOverlayClipFetchResult | null> {
  return audioOverlayObjectStore.fetchClip(clipId);
}

export async function deleteAudioOverlayClips(clipIds: string[]): Promise<void> {
  await audioOverlayObjectStore.deleteClips(clipIds);
}
