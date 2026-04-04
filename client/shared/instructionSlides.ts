/**
 * client/shared/instructionSlides.ts
 *
 * Themed slide-based instruction data for all 10 games.
 * Each game gets 3-5 slides with varied visual styles:
 * different background gradients, text colors, fonts, and icons.
 *
 * Used by InstructionSlideshow.svelte in both player and viewer screens.
 */

export interface InstructionSlide {
  /** Large heading text */
  heading: string;
  /** Body text — 1-2 short sentences */
  body: string;
  /** Tailwind background classes (gradient or solid) */
  bgClass: string;
  /** Tailwind text color for heading */
  headingColor: string;
  /** Tailwind text color for body */
  bodyColor: string;
  /** Tailwind font class for heading (e.g. "font-mono", "font-serif") */
  fontClass: string;
  /** Large display emoji or icon */
  icon: string;
  /** Placeholder for future narration audio URL */
  audioUrl?: string;
}

/**
 * Auto-advance timing per slide (ms).
 * Final slide stays until user confirms.
 */
export const SLIDE_DURATION_MS = 4_000;

/**
 * Transition duration for crossfade between slides (ms).
 */
export const SLIDE_TRANSITION_MS = 400;

// ── Game instruction slides ─────────────────────────────────────────────────

export const GAME_INSTRUCTIONS: Record<string, InstructionSlide[]> = {
  "registry-20-odd-one-out": [
    {
      heading: "Odd One Out",
      body: "Can you spot who's different?",
      bgClass: "bg-gradient-to-br from-violet-900 via-purple-900 to-indigo-900",
      headingColor: "text-violet-300",
      bodyColor: "text-violet-200",
      fontClass: "font-black",
      icon: "🎭",
    },
    {
      heading: "Secret Roles",
      body: "Everyone gets a secret action on their phone. One player gets a DIFFERENT action.",
      bgClass: "bg-gradient-to-br from-slate-900 via-gray-900 to-zinc-900",
      headingColor: "text-amber-400",
      bodyColor: "text-gray-200",
      fontClass: "font-bold",
      icon: "📱",
    },
    {
      heading: "Observe!",
      body: "Watch each other closely during 10-second observation windows. Look for the odd one out!",
      bgClass: "bg-gradient-to-br from-cyan-900 via-teal-900 to-emerald-900",
      headingColor: "text-cyan-300",
      bodyColor: "text-teal-100",
      fontClass: "font-bold",
      icon: "👀",
    },
    {
      heading: "Vote Fast!",
      body: "Vote on who you think is the odd one out. Faster correct votes earn more points!",
      bgClass: "bg-gradient-to-br from-rose-900 via-red-900 to-orange-900",
      headingColor: "text-rose-300",
      bodyColor: "text-rose-100",
      fontClass: "font-black",
      icon: "⚡",
    },
  ],

  "registry-19-shave-the-yak": [
    {
      heading: "Shave The Yak",
      body: "Grab your razor and get shaving!",
      bgClass: "bg-gradient-to-br from-amber-900 via-yellow-900 to-orange-900",
      headingColor: "text-amber-300",
      bodyColor: "text-amber-100",
      fontClass: "font-black",
      icon: "✂️",
    },
    {
      heading: "Swipe to Shave",
      body: "Swipe across the yak on your phone to remove its fur. Stay on target!",
      bgClass: "bg-gradient-to-br from-green-900 via-emerald-900 to-teal-900",
      headingColor: "text-green-300",
      bodyColor: "text-green-100",
      fontClass: "font-bold",
      icon: "✋",
    },
    {
      heading: "Build Combos",
      body: "Consecutive good swipes build your combo multiplier. Missing makes the yak move!",
      bgClass: "bg-gradient-to-br from-orange-900 via-red-900 to-rose-900",
      headingColor: "text-orange-300",
      bodyColor: "text-orange-100",
      fontClass: "font-black",
      icon: "🔥",
    },
    {
      heading: "Beat the Clock",
      body: "Shave as much fur as you can before time runs out. Most fur removed wins!",
      bgClass: "bg-gradient-to-br from-blue-900 via-indigo-900 to-violet-900",
      headingColor: "text-blue-300",
      bodyColor: "text-blue-100",
      fontClass: "font-bold",
      icon: "⏱️",
    },
  ],

  "registry-40-paint-match": [
    {
      heading: "Paint Match",
      body: "Can you mix the perfect colour?",
      bgClass: "bg-gradient-to-br from-rose-900 via-pink-900 to-fuchsia-900",
      headingColor: "text-rose-300",
      bodyColor: "text-rose-100",
      fontClass: "font-black",
      icon: "\u{1F3A8}",
    },
    {
      heading: "Five Paints",
      body: "You have red, yellow, blue, white, and black paint buckets. Adjust the sliders to mix your colour!",
      bgClass: "bg-gradient-to-br from-amber-900 via-orange-900 to-red-900",
      headingColor: "text-amber-300",
      bodyColor: "text-amber-100",
      fontClass: "font-bold",
      icon: "\u{1FAA3}",
    },
    {
      heading: "Match the Target",
      body: "The mystery colour is on the TV. Blend your paints to get as close as possible!",
      bgClass: "bg-gradient-to-br from-cyan-900 via-teal-900 to-emerald-900",
      headingColor: "text-cyan-300",
      bodyColor: "text-cyan-100",
      fontClass: "font-bold",
      icon: "\u{1F4FA}",
    },
    {
      heading: "Submit & Score",
      body: "Lock in your mix before time runs out. Closest colour match wins the most points!",
      bgClass: "bg-gradient-to-br from-violet-900 via-purple-900 to-indigo-900",
      headingColor: "text-violet-300",
      bodyColor: "text-violet-100",
      fontClass: "font-black",
      icon: "\u{1F3C6}",
    },
  ],

  "registry-26-audio-overlay": [
    {
      heading: "Audio Overlay",
      body: "Pick a GIF, dub audio over it, and make everyone laugh!",
      bgClass: "bg-gradient-to-br from-fuchsia-900 via-pink-900 to-rose-900",
      headingColor: "text-fuchsia-300",
      bodyColor: "text-pink-100",
      fontClass: "font-black",
      icon: "🎬",
    },
    {
      heading: "Pick a Category",
      body: "One player chooses the vibe: animals, evil laughs, vehicles, and more!",
      bgClass: "bg-gradient-to-br from-purple-900 via-violet-900 to-indigo-900",
      headingColor: "text-purple-300",
      bodyColor: "text-purple-100",
      fontClass: "font-bold",
      icon: "🎯",
    },
    {
      heading: "Choose a GIF",
      body: "Browse the pool and pick a GIF that fits the category. Choose wisely!",
      bgClass: "bg-gradient-to-br from-teal-900 via-cyan-900 to-blue-900",
      headingColor: "text-teal-300",
      bodyColor: "text-teal-100",
      fontClass: "font-bold",
      icon: "🔀",
    },
    {
      heading: "Record Your Dub",
      body: "Your GIF gets swapped! Record audio over someone else's pick.",
      bgClass: "bg-gradient-to-br from-red-900 via-rose-900 to-pink-900",
      headingColor: "text-red-300",
      bodyColor: "text-red-100",
      fontClass: "font-black",
      icon: "🎤",
    },
    {
      heading: "Vote for the Best!",
      body: "Watch all the dubs on the big screen, then vote for the funniest one!",
      bgClass: "bg-gradient-to-br from-yellow-900 via-amber-900 to-orange-900",
      headingColor: "text-yellow-300",
      bodyColor: "text-yellow-100",
      fontClass: "font-bold",
      icon: "🗳️",
    },
  ],

  "registry-25-lowball-marketplace": [
    {
      heading: "Lowball Marketplace",
      body: "Welcome to the world's most ridiculous marketplace!",
      bgClass: "bg-gradient-to-br from-emerald-900 via-green-900 to-teal-900",
      headingColor: "text-emerald-300",
      bodyColor: "text-emerald-100",
      fontClass: "font-black",
      icon: "🛒",
    },
    {
      heading: "Browse & Bid",
      body: "Absurd items appear with asking prices. Place your lowball bid -- go low, but not too low!",
      bgClass: "bg-gradient-to-br from-blue-900 via-indigo-900 to-violet-900",
      headingColor: "text-blue-300",
      bodyColor: "text-blue-100",
      fontClass: "font-bold",
      icon: "💰",
    },
    {
      heading: "Read the Clues",
      body: "Each item has characteristics like condition, brand, and demand. Use them to guess the reserve price!",
      bgClass: "bg-gradient-to-br from-amber-900 via-yellow-900 to-orange-900",
      headingColor: "text-amber-300",
      bodyColor: "text-amber-100",
      fontClass: "font-bold",
      icon: "🔍",
    },
    {
      heading: "Write Messages",
      body: "In funny messages mode, write the most hilarious offer message to the seller!",
      bgClass: "bg-gradient-to-br from-pink-900 via-rose-900 to-red-900",
      headingColor: "text-pink-300",
      bodyColor: "text-pink-100",
      fontClass: "font-black",
      icon: "📝",
    },
    {
      heading: "Vote!",
      body: "Vote for the funniest bids and messages. Best lowballers win!",
      bgClass: "bg-gradient-to-br from-violet-900 via-purple-900 to-fuchsia-900",
      headingColor: "text-violet-300",
      bodyColor: "text-violet-100",
      fontClass: "font-bold",
      icon: "🗳️",
    },
  ],

  "registry-17-fire-match-blow-shake": [
    {
      heading: "Camp Fire",
      body: "Work together to build the ultimate bonfire!",
      bgClass: "bg-gradient-to-br from-orange-900 via-red-900 to-yellow-900",
      headingColor: "text-orange-300",
      bodyColor: "text-orange-100",
      fontClass: "font-black",
      icon: "🔥",
    },
    {
      heading: "Strike the Match",
      body: "Tap rapidly on your phone to strike the match and light the fire!",
      bgClass: "bg-gradient-to-br from-red-950 via-red-900 to-orange-900",
      headingColor: "text-red-300",
      bodyColor: "text-red-100",
      fontClass: "font-bold",
      icon: "🪵",
    },
    {
      heading: "Blow & Shake",
      body: "Blow into your mic to grow the flame! Shake your phone to fan it bigger!",
      bgClass: "bg-gradient-to-br from-amber-900 via-orange-900 to-yellow-900",
      headingColor: "text-amber-300",
      bodyColor: "text-amber-100",
      fontClass: "font-bold",
      icon: "💨",
    },
    {
      heading: "Extinguish!",
      body: "When it's time, tap rapidly to put out the fire. Team effort gets bonus points!",
      bgClass: "bg-gradient-to-br from-blue-900 via-cyan-900 to-teal-900",
      headingColor: "text-blue-300",
      bodyColor: "text-blue-100",
      fontClass: "font-black",
      icon: "🧯",
    },
  ],

  "registry-07-hot-potato": [
    {
      heading: "Hot Potato",
      body: "Don't get caught holding the potato when it blows!",
      bgClass: "bg-gradient-to-br from-red-900 via-orange-900 to-yellow-900",
      headingColor: "text-red-300",
      bodyColor: "text-red-100",
      fontClass: "font-black",
      icon: "🥔",
    },
    {
      heading: "Pass It!",
      body: "One phone is the potato. Your screen shows who to pass it to -- hand them the phone!",
      bgClass: "bg-gradient-to-br from-orange-900 via-amber-900 to-yellow-900",
      headingColor: "text-orange-300",
      bodyColor: "text-orange-100",
      fontClass: "font-bold",
      icon: "📲",
    },
    {
      heading: "Accept It!",
      body: "When the potato is passed to you, tap Accept on the phone. Don't delay!",
      bgClass: "bg-gradient-to-br from-yellow-900 via-lime-900 to-green-900",
      headingColor: "text-yellow-300",
      bodyColor: "text-yellow-100",
      fontClass: "font-bold",
      icon: "👆",
    },
    {
      heading: "BOOM!",
      body: "When the timer hits zero -- the holder explodes! Timer gets shorter each round!",
      bgClass: "bg-gradient-to-br from-red-950 via-rose-900 to-red-900",
      headingColor: "text-red-400",
      bodyColor: "text-red-100",
      fontClass: "font-black",
      icon: "💥",
    },
    {
      heading: "Vote on Delays",
      body: "After the boom, vote on who you think unfairly delayed. Slow accepters get penalized!",
      bgClass: "bg-gradient-to-br from-violet-900 via-purple-900 to-indigo-900",
      headingColor: "text-violet-300",
      bodyColor: "text-violet-100",
      fontClass: "font-bold",
      icon: "🗳️",
    },
  ],

  "registry-03-tap-speed": [
    {
      heading: "Tap Speed",
      body: "A lightning-fast tapping tournament!",
      bgClass: "bg-gradient-to-br from-yellow-900 via-amber-900 to-orange-900",
      headingColor: "text-yellow-300",
      bodyColor: "text-yellow-100",
      fontClass: "font-black",
      icon: "⚡",
    },
    {
      heading: "Bracket Matches",
      body: "You're in a single-elimination bracket. Win your match to advance!",
      bgClass: "bg-gradient-to-br from-blue-900 via-indigo-900 to-violet-900",
      headingColor: "text-blue-300",
      bodyColor: "text-blue-100",
      fontClass: "font-bold",
      icon: "🏆",
    },
    {
      heading: "Tap Tap Tap!",
      body: "Each match: tap the button as fast as you can. More taps in the time limit = you win!",
      bgClass: "bg-gradient-to-br from-green-900 via-emerald-900 to-teal-900",
      headingColor: "text-green-300",
      bodyColor: "text-green-100",
      fontClass: "font-black",
      icon: "📱",
    },
    {
      heading: "Last One Standing",
      body: "Winners advance through the bracket until only one player remains. Be the champion!",
      bgClass: "bg-gradient-to-br from-rose-900 via-red-900 to-orange-900",
      headingColor: "text-rose-300",
      bodyColor: "text-rose-100",
      fontClass: "font-bold",
      icon: "👑",
    },
  ],

  "registry-04-escape-maze": [
    {
      heading: "Escape Maze",
      body: "Navigate the maze and find your way out!",
      bgClass: "bg-gradient-to-br from-slate-900 via-gray-900 to-zinc-900",
      headingColor: "text-sky-300",
      bodyColor: "text-sky-100",
      fontClass: "font-black",
      icon: "🗺️",
    },
    {
      heading: "Use the Controls",
      body: "Swipe or use the joystick on your phone to move through the maze.",
      bgClass: "bg-gradient-to-br from-indigo-900 via-blue-900 to-cyan-900",
      headingColor: "text-indigo-300",
      bodyColor: "text-indigo-100",
      fontClass: "font-bold",
      icon: "🕹️",
    },
    {
      heading: "Race to the Exit",
      body: "Find and reach the exit before other players. Faster times earn more points!",
      bgClass: "bg-gradient-to-br from-green-900 via-emerald-900 to-lime-900",
      headingColor: "text-green-300",
      bodyColor: "text-green-100",
      fontClass: "font-bold",
      icon: "🏁",
    },
    {
      heading: "New Maze Each Round",
      body: "Every round generates a fresh maze. Memorization won't help -- stay sharp!",
      bgClass: "bg-gradient-to-br from-purple-900 via-violet-900 to-fuchsia-900",
      headingColor: "text-purple-300",
      bodyColor: "text-purple-100",
      fontClass: "font-black",
      icon: "🔄",
    },
  ],

  "registry-06-sound-replication": [
    {
      heading: "Sound Replication",
      body: "Listen. Replicate. Match.",
      bgClass: "bg-gradient-to-br from-purple-900 via-violet-900 to-indigo-900",
      headingColor: "text-purple-300",
      bodyColor: "text-purple-100",
      fontClass: "font-black",
      icon: "🔊",
    },
    {
      heading: "Listen Up!",
      body: "A target sound plays on the TV. Listen closely -- you'll need to replicate it!",
      bgClass: "bg-gradient-to-br from-cyan-900 via-teal-900 to-blue-900",
      headingColor: "text-cyan-300",
      bodyColor: "text-cyan-100",
      fontClass: "font-bold",
      icon: "👂",
    },
    {
      heading: "Your Turn to Record",
      body: "When it's your turn, record your best imitation using your phone's mic.",
      bgClass: "bg-gradient-to-br from-red-900 via-rose-900 to-pink-900",
      headingColor: "text-red-300",
      bodyColor: "text-red-100",
      fontClass: "font-bold",
      icon: "🎤",
    },
    {
      heading: "Get Scored!",
      body: "Your recording is analyzed for similarity. Closer match = more points. Best imitator wins!",
      bgClass: "bg-gradient-to-br from-emerald-900 via-green-900 to-teal-900",
      headingColor: "text-emerald-300",
      bodyColor: "text-emerald-100",
      fontClass: "font-black",
      icon: "📊",
    },
  ],

  "registry-14-dont-get-caught": [
    {
      heading: "Don't Get Caught",
      body: "Stealth is your only weapon!",
      bgClass: "bg-gradient-to-br from-gray-950 via-slate-900 to-zinc-900",
      headingColor: "text-red-400",
      bodyColor: "text-gray-200",
      fontClass: "font-black",
      icon: "🕵️",
    },
    {
      heading: "Move Carefully",
      body: "Use the joystick on your phone to move your character around the map.",
      bgClass: "bg-gradient-to-br from-indigo-900 via-blue-900 to-sky-900",
      headingColor: "text-indigo-300",
      bodyColor: "text-indigo-100",
      fontClass: "font-bold",
      icon: "🕹️",
    },
    {
      heading: "Avoid the Guards",
      body: "Guards patrol with a cone of vision. Stay out of their sight or you'll be caught!",
      bgClass: "bg-gradient-to-br from-yellow-900 via-amber-900 to-orange-900",
      headingColor: "text-yellow-300",
      bodyColor: "text-yellow-100",
      fontClass: "font-bold",
      icon: "🔦",
    },
    {
      heading: "3 Strikes = Out!",
      body: "Get caught 3 times and you're eliminated. Survive until time runs out to score big!",
      bgClass: "bg-gradient-to-br from-red-950 via-red-900 to-rose-900",
      headingColor: "text-red-300",
      bodyColor: "text-red-100",
      fontClass: "font-black",
      icon: "❌",
    },
  ],

  "registry-27-word-build": [
    {
      heading: "Word Build",
      body: "Arrange your phones to spell the hidden word!",
      bgClass: "bg-gradient-to-br from-cyan-900 via-blue-900 to-indigo-900",
      headingColor: "text-cyan-300",
      bodyColor: "text-cyan-100",
      fontClass: "font-black",
      icon: "🔤",
    },
    {
      heading: "Teams!",
      body: "You'll be split into two teams. Each phone shows part of the word.",
      bgClass: "bg-gradient-to-br from-amber-900 via-orange-900 to-red-900",
      headingColor: "text-amber-300",
      bodyColor: "text-amber-100",
      fontClass: "font-bold",
      icon: "👥",
    },
    {
      heading: "Arrange & Build",
      body: "Physically place your phones in order to spell the word. Only move YOUR phone!",
      bgClass: "bg-gradient-to-br from-green-900 via-emerald-900 to-teal-900",
      headingColor: "text-green-300",
      bodyColor: "text-green-100",
      fontClass: "font-bold",
      icon: "📱",
    },
    {
      heading: "Lock It In!",
      body: "One teammate has the Done button. Press it when your team has the word!",
      bgClass: "bg-gradient-to-br from-violet-900 via-purple-900 to-fuchsia-900",
      headingColor: "text-violet-300",
      bodyColor: "text-violet-100",
      fontClass: "font-black",
      icon: "✅",
    },
    {
      heading: "Fastest Wins!",
      body: "The first team to correctly spell the word wins the round. 60 seconds on the clock!",
      bgClass: "bg-gradient-to-br from-rose-900 via-red-900 to-orange-900",
      headingColor: "text-rose-300",
      bodyColor: "text-rose-100",
      fontClass: "font-bold",
      icon: "⏱️",
    },
  ],

  "registry-10-grid-tap-colors": [
    {
      heading: "Grid Tap Colors",
      body: "Lay your phones on the ground to form a grid — then race to tap!",
      bgClass: "bg-gradient-to-br from-cyan-900 via-blue-900 to-indigo-900",
      headingColor: "text-cyan-300",
      bodyColor: "text-cyan-100",
      fontClass: "font-black",
      icon: "📱",
    },
    {
      heading: "Set Up the Grid",
      body: "Each phone shows a number. Place them face-up in order following the pattern shown on TV.",
      bgClass: "bg-gradient-to-br from-slate-900 via-gray-900 to-zinc-900",
      headingColor: "text-amber-400",
      bodyColor: "text-gray-200",
      fontClass: "font-bold",
      icon: "🔢",
    },
    {
      heading: "Speed Tap Mode",
      body: "One phone lights up with a color — race to tap it! The next phone lights up instantly. You have 20 seconds!",
      bgClass: "bg-gradient-to-br from-red-900 via-orange-900 to-amber-900",
      headingColor: "text-orange-300",
      bodyColor: "text-orange-100",
      fontClass: "font-black",
      icon: "⚡",
    },
    {
      heading: "Take Turns",
      body: "Each player gets announced on screen with 10 seconds to get in position. Watch for your name!",
      bgClass: "bg-gradient-to-br from-emerald-900 via-green-900 to-teal-900",
      headingColor: "text-emerald-300",
      bodyColor: "text-emerald-100",
      fontClass: "font-bold",
      icon: "👆",
    },
    {
      heading: "Ready?",
      body: "The host will confirm once all phones are placed. Then the tapping begins!",
      bgClass: "bg-gradient-to-br from-violet-900 via-purple-900 to-fuchsia-900",
      headingColor: "text-violet-300",
      bodyColor: "text-violet-100",
      fontClass: "font-black",
      icon: "🏁",
    },
  ],
};

/**
 * Get instruction slides for a game. Falls back to a generic "Get Ready!" slide.
 */
export function getInstructionSlides(gameId: string): InstructionSlide[] {
  return GAME_INSTRUCTIONS[gameId] ?? [
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
}
