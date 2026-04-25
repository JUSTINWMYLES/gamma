import { seededShuffle } from "../../utils/rng";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 12;

export const HEADLINE_SUBMISSION_DURATION_MS = 60_000;
export const ASSIGNMENT_REVEAL_DURATION_MS = 5_000;
export const BROADCAST_CREATION_DURATION_MS = 180_000;
export const BUFFERING_MAX_WAIT_MS = 45_000;
export const PRESENTATION_PREPARE_MS = 2_000;
export const PRESENTATION_END_HOLD_MS = 4_000;
export const PRESENTATION_EXTRA_WAIT_MS = 20_000;
export const VOTING_DURATION_MS = 30_000;
export const RESULTS_DISPLAY_MS = 8_000;

export const MIN_HEADLINE_LENGTH = 12;
export const MAX_HEADLINE_LENGTH = 90;
export const MAX_SCRIPT_LENGTH = 350;
export const MAX_SPOKEN_DURATION_MS = 20_000;

export const PARTICIPATION_POINTS = 25;
export const VOTE_RECEIVED_POINTS = 50;
export const WINNER_BONUS = 100;

export const DEFAULT_VOICE_PRESET_ID = "anchor_classic_a";

export const FALLBACK_VOICE_OPTIONS: VoiceOption[] = [
  {
    id: "anchor_classic_a",
    label: "Classic Anchor",
    tone: "Formal nightly news",
    source: "builtin",
    available: true,
  },
  {
    id: "anchor_classic_b",
    label: "Veteran Anchor",
    tone: "Older and steady",
    source: "builtin",
    available: true,
  },
  {
    id: "anchor_local_fast",
    label: "Local Reporter",
    tone: "Fast and energetic",
    source: "voice_pack",
    available: false,
    placeholder: true,
    availabilityReason: "Voice pack coming soon",
  },
];

export interface NormalizedMediaEntry {
  provider: string;
  providerAssetId: string;
  label: string;
  previewUrl: string;
  playbackUrl: string;
  fallbackImageUrl: string;
  mimeType: string;
  width?: number;
  height?: number;
  durationMs?: number;
}

export interface HeadlineSubmission {
  playerId: string;
  headline: string;
  submittedAt: number;
}

export interface BroadcastSubmission {
  playerId: string;
  playerName: string;
  assignedHeadline: string;
  script: string;
  spokenText: string;
  voicePresetId: string;
  voiceLabel: string;
  selectedMedia: NormalizedMediaEntry;
  estimatedSpeechMs: number;
  submittedAt: number;
  ttsJobId?: string;
  ttsStatus?: string;
  audioDurationMs?: number;
  audioMimeType?: string;
}

export interface BroadcastResult extends BroadcastSubmission {
  voteCount: number;
  isWinner: boolean;
}

export interface VoiceOption {
  id: string;
  label: string;
  tone: string;
  source?: string;
  available: boolean;
  placeholder?: boolean;
  availabilityReason?: string;
}

export const FALLBACK_MEDIA_ENTRY: NormalizedMediaEntry = {
  provider: "gamma_builtin",
  providerAssetId: "news-broadcast-default-frame",
  label: "Technical Difficulties",
  previewUrl: "/news-broadcast-default-frame.svg",
  playbackUrl: "",
  fallbackImageUrl: "/news-broadcast-default-frame.svg",
  mimeType: "image/svg+xml",
  width: 1280,
  height: 720,
};

const FALLBACK_HEADLINES = [
  "Town council baffled by mysterious fountain of orange juice",
  "Local raccoon elected employee of the month by mistake",
  "Meteorologist insists tiny umbrella saved entire neighborhood",
  "Mayor denies rumors of secret alpaca emergency task force",
  "Breaking: sandwich declared legally suspicious at county fair",
  "City zoo blames escaped penguins for commuter rail slowdown",
  "Witnesses report dramatic standoff between leaf blower and birthday cake",
  "Officials investigate why every traffic cone now points at Greg",
];

function normalizeText(value: string, maxLength: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function ensureSentence(text: string): string {
  if (!text) return text;
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

export function normalizeHeadline(value: string): string | null {
  const normalized = normalizeText(value, MAX_HEADLINE_LENGTH);
  if (normalized.length < MIN_HEADLINE_LENGTH) return null;
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  if (wordCount < 2) return null;
  return normalized;
}

export function normalizeScript(value: string): string | null {
  const normalized = normalizeText(value, MAX_SCRIPT_LENGTH);
  return normalized.length > 0 ? normalized : null;
}

export function normalizeSpokenText(value: string): string {
  const normalized = value
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
    .replace(/\s+/g, " ")
    .replace(/([!?.,])\1+/g, "$1")
    .trim();
  return ensureSentence(normalized);
}

export function buildSpokenText(headline: string, script: string): string {
  return normalizeSpokenText(`${ensureSentence(headline)} ${ensureSentence(script)}`);
}

export function estimateSpeechMs(text: string): number {
  const normalized = normalizeSpokenText(text);
  const words = normalized.split(/\s+/).filter(Boolean).length;
  const punctuationBonus = (normalized.match(/[,.!?]/g) ?? []).length * 120;
  return Math.max(3_000, Math.round(words * 380 + punctuationBonus + 900));
}

export function validateSpokenTextWithinBudget(text: string): boolean {
  return estimateSpeechMs(text) <= MAX_SPOKEN_DURATION_MS;
}

export function pickFallbackHeadline(index: number, seed: number): string {
  const shuffled = seededShuffle(FALLBACK_HEADLINES, seed);
  return shuffled[index % shuffled.length] ?? FALLBACK_HEADLINES[0];
}

export function buildFallbackScript(headline: string): string {
  const fallback = `${headline} Witnesses say the situation escalated quickly, and officials promise a full update after the commercial break.`;
  return normalizeText(fallback, MAX_SCRIPT_LENGTH);
}

export function trimTextToSpeechBudget(text: string): string {
  const words = normalizeSpokenText(text).split(/\s+/).filter(Boolean);
  let candidate = words.join(" ");
  while (words.length > 1 && estimateSpeechMs(candidate) > MAX_SPOKEN_DURATION_MS) {
    words.pop();
    candidate = words.join(" ");
  }
  return ensureSentence(candidate);
}

export function haveAllExpectedPlayersResponded(
  responded: Set<string>,
  expectedPlayerIds: string[],
): boolean {
  return expectedPlayerIds.every((playerId) => responded.has(playerId));
}

export function createHeadlineAssignments(playerIds: string[], seed: number): Map<string, string> {
  if (playerIds.length < 2) return new Map();
  const shuffled = seededShuffle([...playerIds], seed);
  const assignments = new Map<string, string>();
  for (let i = 0; i < shuffled.length; i++) {
    assignments.set(shuffled[i], shuffled[(i + 1) % shuffled.length]);
  }
  return assignments;
}

export function createPresentationOrder(playerIds: string[], seed: number): string[] {
  return seededShuffle([...playerIds], seed);
}

export function tallyBroadcastVotes(submissions: BroadcastSubmission[], votes: Map<string, string>): BroadcastResult[] {
  const counts = new Map<string, number>();
  for (const submission of submissions) {
    counts.set(submission.playerId, 0);
  }
  for (const targetId of votes.values()) {
    if (counts.has(targetId)) {
      counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
    }
  }
  const highestVoteCount = Math.max(0, ...counts.values());
  return submissions
    .map((submission) => ({
      ...submission,
      voteCount: counts.get(submission.playerId) ?? 0,
      isWinner: highestVoteCount > 0 && (counts.get(submission.playerId) ?? 0) === highestVoteCount,
    }))
    .sort((a, b) => {
      if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
      return a.submittedAt - b.submittedAt;
    });
}

export function computeRoundPoints(results: BroadcastResult[]): Map<string, number> {
  const scores = new Map<string, number>();
  for (const result of results) {
    let points = PARTICIPATION_POINTS + result.voteCount * VOTE_RECEIVED_POINTS;
    if (result.isWinner) points += WINNER_BONUS;
    scores.set(result.playerId, points);
  }
  return scores;
}

export function normalizeMediaEntry(value: unknown): NormalizedMediaEntry | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const provider = typeof raw.provider === "string" ? raw.provider.trim().slice(0, 40) : "";
  const providerAssetId = typeof raw.providerAssetId === "string" ? raw.providerAssetId.trim().slice(0, 100) : "";
  const label = typeof raw.label === "string" ? raw.label.trim().slice(0, 120) : "";
  const previewUrl = typeof raw.previewUrl === "string" ? raw.previewUrl.trim().slice(0, 500) : "";
  const playbackUrl = typeof raw.playbackUrl === "string" ? raw.playbackUrl.trim().slice(0, 500) : "";
  const fallbackImageUrl = typeof raw.fallbackImageUrl === "string" ? raw.fallbackImageUrl.trim().slice(0, 500) : "";
  const mimeType = typeof raw.mimeType === "string" ? raw.mimeType.trim().slice(0, 120) : "";

  if (!provider || !providerAssetId || !label) return null;
  if (!previewUrl && !playbackUrl && !fallbackImageUrl) return null;

  const width = typeof raw.width === "number" && Number.isFinite(raw.width) ? raw.width : undefined;
  const height = typeof raw.height === "number" && Number.isFinite(raw.height) ? raw.height : undefined;
  const durationMs = typeof raw.durationMs === "number" && Number.isFinite(raw.durationMs) ? raw.durationMs : undefined;

  return {
    provider,
    providerAssetId,
    label,
    previewUrl,
    playbackUrl,
    fallbackImageUrl,
    mimeType,
    width,
    height,
    durationMs,
  };
}

export function isAllowedMediaSelection(
  media: NormalizedMediaEntry,
  allowedMediaUrls: Set<string>,
): boolean {
  if (media.provider === FALLBACK_MEDIA_ENTRY.provider && media.providerAssetId === FALLBACK_MEDIA_ENTRY.providerAssetId) {
    return true;
  }
  return [media.previewUrl, media.playbackUrl, media.fallbackImageUrl]
    .filter(Boolean)
    .some((url) => allowedMediaUrls.has(url));
}

export function toPublicVoiceOption(value: unknown): VoiceOption | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const label = typeof raw.label === "string" ? raw.label.trim() : id;
  const tone = typeof raw.tone === "string" ? raw.tone.trim() : "";
  if (!id || !label) return null;
  return {
    id,
    label,
    tone,
    source: typeof raw.source === "string" ? raw.source : undefined,
    available: Boolean(raw.available),
    placeholder: Boolean(raw.placeholder),
    availabilityReason: typeof raw.availabilityReason === "string" ? raw.availabilityReason : undefined,
  };
}
