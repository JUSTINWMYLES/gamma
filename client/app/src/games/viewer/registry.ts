/**
 * client/app/src/games/viewer/registry.ts
 *
 * Component registry for viewer (TV) game screens.
 * Replaces the if/else chain in GameScreen.svelte (M2).
 *
 * Add a new entry here when creating a new game TV component — no changes
 * needed in GameScreen.svelte.
 */
import type { SvelteComponent } from "svelte";
import type { Room } from "colyseus.js";
import type { RoomState } from "../../../../shared/types";

import OddOneOutTV from "./OddOneOutTV.svelte";
import ShaveYakTV from "./ShaveYakTV.svelte";
import AudioOverlayTV from "./AudioOverlayTV.svelte";
import LowballMarketplaceTV from "./LowballMarketplaceTV.svelte";
import FireMatchBlowShakeTV from "./FireMatchBlowShakeTV.svelte";
import HotPotatoTV from "./HotPotatoTV.svelte";
import TapSpeedTV from "./TapSpeedTV.svelte";
import SoundReplicationTV from "./SoundReplicationTV.svelte";
import EscapeMazeTV from "./EscapeMazeTV.svelte";
import PaintMatchTV from "./PaintMatchTV.svelte";
import GridTapColorsTV from "./GridTapColorsTV.svelte";
import WordBuildTV from "./WordBuildTV.svelte";
import TierRankingTV from "./TierRankingTV.svelte";
import MedicalStoryTV from "./MedicalStoryTV.svelte";
import WantedAdTV from "./WantedAdTV.svelte";
import WesternStandoffTV from "./WesternStandoffTV.svelte";
import NewsBroadcastTV from "./NewsBroadcastTV.svelte";

interface ViewerGameComponentProps {
  room: Room;
  state: RoomState;
}

export type ViewerGameComponent = typeof SvelteComponent<ViewerGameComponentProps>;

interface ViewerGameEntry {
  component: ViewerGameComponent;
}

const REGISTRY: Record<string, ViewerGameEntry> = {
  "registry-20-odd-one-out":          { component: OddOneOutTV },
  "registry-19-shave-the-yak":        { component: ShaveYakTV },
  "registry-26-audio-overlay":        { component: AudioOverlayTV },
  "registry-25-lowball-marketplace":  { component: LowballMarketplaceTV },
  "registry-17-fire-match-blow-shake": { component: FireMatchBlowShakeTV },
  "registry-07-hot-potato":           { component: HotPotatoTV },
  "registry-03-tap-speed":            { component: TapSpeedTV },
  "registry-06-sound-replication":    { component: SoundReplicationTV },
  "registry-04-escape-maze":          { component: EscapeMazeTV },
  "registry-40-paint-match":          { component: PaintMatchTV },
  "registry-10-grid-tap-colors":      { component: GridTapColorsTV },
  "registry-27-word-build":           { component: WordBuildTV },
  "registry-11-tier-ranking":         { component: TierRankingTV },
  "registry-43-medical-story":        { component: MedicalStoryTV },
  "registry-28-wanted-ad":            { component: WantedAdTV },
  "registry-44-western-standoff":     { component: WesternStandoffTV },
  "registry-45-news-broadcast":       { component: NewsBroadcastTV },
};

export function getViewerGameComponent(gameId: string): ViewerGameComponent | null {
  return REGISTRY[gameId]?.component ?? null;
}

export function hasViewerGameComponent(gameId: string): boolean {
  return gameId in REGISTRY;
}
