import { describe, it, expect, beforeEach } from "vitest";
import { getAvailableGames, clearGameCache } from "../src/games/gameLoader";
import { BaseGame } from "../src/games/BaseGame";
import TapSpeedGame from "../src/games/registry-03-tap-speed";
import HotPotatoGame from "../src/games/registry-07-hot-potato";
import EscapeMazeGame from "../src/games/registry-04-escape-maze";
import DontGetCaughtGame from "../src/games/registry-14-dont-get-caught";
import ShaveYakGame from "../src/games/registry-19-shave-the-yak";
import OddOneOutGame from "../src/games/registry-20-odd-one-out";
import AudioOverlayGame from "../src/games/registry-26-audio-overlay";
import WordBuildGame from "../src/games/registry-27-word-build";
import WantedAdGame from "../src/games/registry-28-wanted-ad";
import GridTapColorsGame from "../src/games/registry-10-grid-tap-colors";
import TierRankingGame from "../src/games/registry-11-tier-ranking";
import FireMatchBlowShakeGame from "../src/games/registry-17-fire-match-blow-shake";
import LowballMarketplaceGame from "../src/games/registry-25-lowball-marketplace";
import PaintMatchGame from "../src/games/registry-40-paint-match";
import MedicalStoryGame from "../src/games/registry-43-medical-story";
import WesternStandoffGame from "../src/games/registry-44-western-standoff";
import NewsBroadcastGame from "../src/games/registry-45-news-broadcast";

const ALL_GAMES = [
  TapSpeedGame,
  HotPotatoGame,
  EscapeMazeGame,
  DontGetCaughtGame,
  ShaveYakGame,
  OddOneOutGame,
  AudioOverlayGame,
  WordBuildGame,
  WantedAdGame,
  GridTapColorsGame,
  TierRankingGame,
  FireMatchBlowShakeGame,
  LowballMarketplaceGame,
  PaintMatchGame,
  MedicalStoryGame,
  WesternStandoffGame,
  NewsBroadcastGame,
];

const REQUIRED_STATIC_FIELDS = [
  "requiresTV",
  "supportsBracket",
  "defaultRoundCount",
  "minRounds",
  "maxRounds",
  "hasInstructionsPhase",
  "instructionsDelivery",
] as const;

const REQUIRED_METHODS = ["start", "runRound", "scoreRound", "handleInput", "teardown"] as const;

describe("Game plugin auto-discovery", () => {
  beforeEach(() => {
    clearGameCache();
  });

  it("discovers all registered game plugin directories", () => {
    const available = getAvailableGames();
    expect(available.length).toBeGreaterThanOrEqual(ALL_GAMES.length);

    for (const gameId of available) {
      expect(gameId).toMatch(/^registry-\d{2}-[a-z0-9-]+$/);
    }
  });

  it("all game plugins extend BaseGame", () => {
    for (const GameClass of ALL_GAMES) {
      expect(GameClass.prototype).toBeInstanceOf(BaseGame);
    }
  });

  it("all game plugins declare required static metadata", () => {
    for (const GameClass of ALL_GAMES) {
      for (const field of REQUIRED_STATIC_FIELDS) {
        expect(field in GameClass).toBe(true);
      }
    }
  });

  it("all game plugins declare required instance methods", () => {
    for (const GameClass of ALL_GAMES) {
      for (const method of REQUIRED_METHODS) {
        expect(typeof GameClass.prototype[method]).toBe("function");
      }
    }
  });

  it("all game plugins have valid instructionsDelivery value", () => {
    for (const GameClass of ALL_GAMES) {
      const delivery = GameClass.instructionsDelivery;
      expect(["broadcast", "staggered", "private"]).toContain(delivery);
    }
  });

  it("all game plugins have valid activityLevel value", () => {
    for (const GameClass of ALL_GAMES) {
      const level = GameClass.activityLevel;
      expect(["none", "some", "full"]).toContain(level);
    }
  });

  it("all game plugins have sensible round constraints", () => {
    for (const GameClass of ALL_GAMES) {
      expect(GameClass.minRounds).toBeGreaterThanOrEqual(1);
      expect(GameClass.maxRounds).toBeGreaterThanOrEqual(GameClass.minRounds);
      expect(GameClass.defaultRoundCount).toBeGreaterThanOrEqual(GameClass.minRounds);
      expect(GameClass.defaultRoundCount).toBeLessThanOrEqual(GameClass.maxRounds);
    }
  });
});
