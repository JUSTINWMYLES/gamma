export interface InstructionSlide {
  heading: string;
  body: string;
  bgClass: string;
  headingColor: string;
  bodyColor: string;
  fontClass: string;
  icon: string;
  audioUrl?: string;
}

export interface InstructionSlideModes {
  default?: InstructionSlide[];
  [gameMode: string]: InstructionSlide[] | undefined;
}

interface InstructionSlideSet {
  gameId: string;
  modes: InstructionSlideModes;
}

export const SLIDE_DURATION_MS = 4_000;
export const SLIDE_TRANSITION_MS = 400;

const instructionModules = import.meta.glob(
  "../app/src/games/player/*.instructions.json",
  { eager: true, import: "default" },
) as Record<string, InstructionSlideSet>;

export const GAME_INSTRUCTIONS = Object.values(instructionModules).reduce<Record<string, InstructionSlideModes>>(
  (registry, instructionSet) => {
    registry[instructionSet.gameId] = instructionSet.modes;
    return registry;
  },
  {},
);

const FALLBACK_SLIDES: InstructionSlide[] = [
  {
    heading: "Get Ready!",
    body: "The game is about to begin.",
    bgClass: "bg-gradient-to-br from-indigo-900 via-purple-900 to-violet-900",
    headingColor: "text-indigo-300",
    bodyColor: "text-indigo-100",
    fontClass: "font-black",
    icon: "🎮",
  },
];

export function getInstructionSlides(gameId: string, gameMode: string = "default"): InstructionSlide[] {
  const instructionModes = GAME_INSTRUCTIONS[gameId];
  if (!instructionModes) return FALLBACK_SLIDES;

  if (gameMode && gameMode !== "default" && instructionModes[gameMode]) {
    return instructionModes[gameMode] ?? FALLBACK_SLIDES;
  }

  return instructionModes.default ?? FALLBACK_SLIDES;
}
