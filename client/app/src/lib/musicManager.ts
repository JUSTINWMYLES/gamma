/**
 * client/app/src/lib/musicManager.ts
 *
 * Manages viewer-only background music playback.
 * Extracted from App.svelte (M1).
 */
import { GAME_REGISTRY } from "../../../shared/types";
import type { Phase } from "../../../shared/types";

export type TrackId =
  | "cloud"
  | "discovery_hit"
  | "fart"
  | "newer_wave"
  | "zazie"
  | "pixelland"
  | "vivacity"
  | "le_grand_chase"
  | "thinking"
  | "entertainer"
  | "ouroboros"
  | "two_finger_johnny"
  | "pinball_spring_160"
  | "hyperfun"
  | "celebration";

interface TrackConfig {
  file: string;
  volume: number;
  attribution: string;
  loop?: boolean;
}

const TRACK_CONFIG: Record<TrackId, TrackConfig> = {
  cloud:          { file: "/cloud_dancer.mp3",    volume: 0.35, attribution: '"Cloud Dancer" — Kevin MacLeod (incompetech.com), CC BY 4.0' },
  discovery_hit:  { file: "/discovery_hit.mp3",   volume: 0.35, attribution: '"Discovery Hit" — Kevin MacLeod (incompetech.com), CC BY 4.0', loop: false },
  fart:           { file: "/farting_around.mp3",   volume: 0.42, attribution: '"Farting Around" — Kevin MacLeod (incompetech.com), CC BY 4.0' },
  newer_wave:     { file: "/newer_wave.mp3",       volume: 0.35, attribution: '"Newer Wave" — Kevin MacLeod (incompetech.com), CC BY 4.0' },
  zazie:          { file: "/zazie.mp3",            volume: 0.35, attribution: '"Zazie" — Kevin MacLeod (incompetech.com), CC BY 4.0' },
  pixelland:      { file: "/pixelland.mp3",        volume: 0.35, attribution: '"Pixelland" — Kevin MacLeod (incompetech.com), CC BY 4.0' },
  vivacity:       { file: "/vivacity.mp3",         volume: 0.35, attribution: '"Vivacity" — Kevin MacLeod (incompetech.com), CC BY 4.0' },
  le_grand_chase: { file: "/le_grand_chase.mp3",   volume: 0.35, attribution: '"Le Grand Chase" — Kevin MacLeod (incompetech.com), CC BY 4.0' },
  thinking:       { file: "/thinking_music.mp3",   volume: 0.35, attribution: '"Thinking Music" — Kevin MacLeod (incompetech.com), CC BY 4.0' },
  entertainer:    { file: "/the_entertainer.mp3",  volume: 0.34, attribution: '"The Entertainer" — Kevin MacLeod (incompetech.com), CC BY 4.0' },
  ouroboros:      { file: "/ouroboros.mp3",        volume: 0.36, attribution: '"Ouroboros" — Kevin MacLeod (incompetech.com), CC BY 4.0' },
  two_finger_johnny: { file: "/two_finger_johnny.mp3", volume: 0.35, attribution: '"Two Finger Johnny" — Kevin MacLeod (incompetech.com), CC BY 4.0' },
  pinball_spring_160: { file: "/pinball_spring_160.mp3", volume: 0.35, attribution: '"Pinball Spring 160" — Kevin MacLeod (incompetech.com), CC BY 4.0' },
  hyperfun:       { file: "/hyperfun.mp3",       volume: 0.35, attribution: '"Hyperfun" — Kevin MacLeod (incompetech.com), CC BY 4.0' },
  celebration:    { file: "/celebration.mp3",    volume: 0.35, attribution: '"Celebration" — Kevin MacLeod (incompetech.com), CC BY 4.0' },
};

/** Look up the music track for a game from the shared registry. */
function gameMusicTrack(gameId: string): TrackId | null {
  const meta = GAME_REGISTRY.find((g) => g.id === gameId);
  if (!meta || !meta.musicTrack) return null;
  return meta.musicTrack as TrackId;
}

/** Compute which track should be playing given current room state. */
export function desiredTrack(
  role: string,
  phase: Phase,
  selectedGame: string,
  viewerTrackOverride: TrackId | null | undefined,
): TrackId | null {
  if (role !== "viewer") return null;
  if (phase === "lobby") return "cloud";
  if (phase === "game_over") return "discovery_hit";
  if (selectedGame === "registry-43-medical-story") return "entertainer";
  if (selectedGame === "registry-26-audio-overlay") {
    if (phase === "instructions" || phase === "countdown") return "two_finger_johnny";
    if (phase === "in_round") {
      return viewerTrackOverride !== undefined ? viewerTrackOverride : "two_finger_johnny";
    }
    return null;
  }
  if (selectedGame === "registry-45-news-broadcast") {
    if (phase === "instructions" || phase === "countdown") return "celebration";
    if (phase === "in_round") {
      return viewerTrackOverride !== undefined ? viewerTrackOverride : "celebration";
    }
    return null;
  }
  if (phase === "in_round" || phase === "countdown" || phase === "instructions") {
    return gameMusicTrack(selectedGame);
  }
  return null;
}

/** Svelte-compatible music manager that wraps an HTMLAudioElement. */
export class MusicManager {
  private audio: HTMLAudioElement | null = null;
  private currentTrack: TrackId | null = null;
  private userHasInteracted = false;

  bind(audio: HTMLAudioElement | null): void {
    this.audio = audio;
    if (audio) {
      audio.preload = "auto";
      audio.loop = false;
      audio.setAttribute("playsinline", "");
      audio.setAttribute("webkit-playsinline", "true");
    }
  }

  onUserInteraction(): void {
    if (this.userHasInteracted) return;
    this.userHasInteracted = true;
    if (this.audio && !this.audio.paused) {
      this.audio.muted = false;
    }
  }

  async sync(
    role: string,
    phase: Phase,
    selectedGame: string,
    viewerTrackOverride: TrackId | null | undefined,
    connecting: boolean,
    error: string,
    statePresent: boolean,
  ): Promise<void> {
    if (!this.audio) return;
    if (role !== "viewer" || connecting || error || !statePresent) {
      this.pause();
      this.currentTrack = null;
      return;
    }

    const next = desiredTrack(role, phase, selectedGame, viewerTrackOverride);
    if (!next) {
      this.pause();
      this.audio.loop = false;
      this.audio.currentTime = 0;
      this.currentTrack = null;
      return;
    }

    const config = TRACK_CONFIG[next];
    const targetSrc = new URL(config.file, window.location.href).href;
    const sourceChanged = this.audio.src !== targetSrc;

    this.audio.loop = config.loop ?? true;
    this.audio.volume = config.volume;
    this.audio.muted = !this.userHasInteracted;

    if (sourceChanged) {
      this.audio.pause();
      this.audio.src = targetSrc;
      this.audio.load();
      this.audio.currentTime = 0;
    }

    if (!sourceChanged && next === this.currentTrack && !this.audio.paused) {
      return;
    }

    try {
      await this.audio.play();
      this.currentTrack = next;
    } catch {
      this.currentTrack = null;
    }
  }

  onMusicEnded(
    role: string,
    phase: Phase,
    selectedGame: string,
    viewerTrackOverride: TrackId | null | undefined,
  ): void {
    if (!this.audio) return;

    const next = desiredTrack(role, phase, selectedGame, viewerTrackOverride);
    if (!next || this.currentTrack !== next) return;

    const config = TRACK_CONFIG[next];
    if (config.loop === false) return;

    this.audio.currentTime = 0;
    this.audio.play().catch(() => {
      // Browser blocked replay — next state sync or user gesture will retry.
    });
  }

  pause(): void {
    if (this.audio) this.audio.pause();
  }

  cleanup(): void {
    this.pause();
    if (this.audio) {
      this.audio.src = "";
      this.audio.load();
    }
    this.currentTrack = null;
  }

  get currentTrackId(): TrackId | null {
    return this.currentTrack;
  }

  get attribution(): string {
    return this.currentTrack
      ? `Music: ${TRACK_CONFIG[this.currentTrack].attribution}`
      : "";
  }
}
