/**
 * client/app/src/games/player/registry.ts
 *
 * Component registry for player (phone) game screens.
 * Replaces the if/else chain in GameScreen.svelte (M2).
 *
 * Add a new entry here when creating a new game component — no changes
 * needed in GameScreen.svelte.
 */
import type { SvelteComponent } from "svelte";
import type { Room } from "colyseus.js";
import type { RoomState, PlayerState } from "../../../../shared/types";

import ShaveYak from "./ShaveYak.svelte";
import OddOneOut from "./OddOneOut.svelte";
import AudioOverlay from "./AudioOverlay.svelte";
import LowballMarketplace from "./LowballMarketplace.svelte";
import FireMatchBlowShake from "./FireMatchBlowShake.svelte";
import HotPotato from "./HotPotato.svelte";
import TapSpeed from "./TapSpeed.svelte";
import SoundReplication from "./SoundReplication.svelte";
import EscapeMaze from "./EscapeMaze.svelte";
import PaintMatch from "./PaintMatch.svelte";
import GridTapColors from "./GridTapColors.svelte";
import WordBuild from "./WordBuild.svelte";
import TierRanking from "./TierRanking.svelte";
import MedicalStory from "./MedicalStory.svelte";
import WantedAd from "./WantedAd.svelte";
import WesternStandoff from "./WesternStandoff.svelte";
import NewsBroadcast from "./NewsBroadcast.svelte";

interface GameComponentProps {
  room: Room;
  state: RoomState;
  me: PlayerState | undefined;
}

export type GameComponent = typeof SvelteComponent<GameComponentProps>;

interface GameEntry {
  component: GameComponent;
}

const REGISTRY: Record<string, GameEntry> = {
  "registry-19-shave-the-yak":        { component: ShaveYak },
  "registry-20-odd-one-out":          { component: OddOneOut },
  "registry-26-audio-overlay":        { component: AudioOverlay },
  "registry-25-lowball-marketplace":  { component: LowballMarketplace },
  "registry-17-fire-match-blow-shake": { component: FireMatchBlowShake },
  "registry-07-hot-potato":           { component: HotPotato },
  "registry-03-tap-speed":            { component: TapSpeed },
  "registry-06-sound-replication":    { component: SoundReplication },
  "registry-04-escape-maze":          { component: EscapeMaze },
  "registry-40-paint-match":          { component: PaintMatch },
  "registry-10-grid-tap-colors":      { component: GridTapColors },
  "registry-27-word-build":           { component: WordBuild },
  "registry-11-tier-ranking":         { component: TierRanking },
  "registry-43-medical-story":        { component: MedicalStory },
  "registry-28-wanted-ad":            { component: WantedAd },
  "registry-44-western-standoff":     { component: WesternStandoff },
  "registry-45-news-broadcast":       { component: NewsBroadcast },
};

export function getPlayerGameComponent(gameId: string): GameComponent | null {
  return REGISTRY[gameId]?.component ?? null;
}

export function hasPlayerGameComponent(gameId: string): boolean {
  return gameId in REGISTRY;
}
