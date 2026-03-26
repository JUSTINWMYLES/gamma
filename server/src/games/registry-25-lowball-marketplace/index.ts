/**
 * server/src/games/registry-25-lowball-marketplace/index.ts
 *
 * "Lowball Marketplace" — a fake online marketplace game with two modes.
 *
 * Mode 1: Classic Bidding (gameMode = "default" or "classic")
 * ───────────────────────────────────────────────────────────
 * • Each round, a ridiculous item is listed at an inflated "asking price".
 * • The seller has a hidden "minimum acceptable price" (the reserve).
 * • Players submit lowball offers trying to get the best deal.
 * • Strategy: bid BELOW the asking price, but stay ABOVE the reserve.
 *   - If your bid is below the reserve, the seller rejects it (0 points).
 *   - Among accepted bids, the LOWEST bid wins (best deal).
 *   - Ties broken by who submitted first.
 * • Points:
 *   - 0 if bid < reserve (rejected)
 *   - 25 participation (for any accepted bid)
 *   - Winner (lowest accepted bid): 100 bonus
 *   - 2nd place: 50 bonus
 *   - 3rd place: 25 bonus
 *   - Bonus for "close shave": extra 25 if accepted bid is within 10% of reserve
 *
 * Mode 2: Funny Messages (gameMode = "funny_messages")
 * ─────────────────────────────────────────────────────
 * • Each round, a batch of items are shown as a marketplace grid.
 * • Each player picks 1 item and writes a funny "message to seller".
 * • All messages are shown on TV one by one.
 * • Everyone votes for the funniest message (can't vote for self).
 * • Points: 50 per vote received, 100 bonus for winner, 25 participation.
 *
 * Server messages (Classic):
 *   → "item_listing"     { item, askingPrice, category, imageHint, durationMs, serverTimestamp }
 *   → "bid_confirmed"    { amount }
 *   → "bid_count_update" { bidsIn, totalBidders }
 *   → "reveal_start"     { item, askingPrice, reserve, bids, serverTimestamp }
 *   → "round_result"     { item, reserve, rankings, scores }
 *   → "round_skipped"    { reason }
 *
 * Server messages (Funny Messages):
 *   → "fm_browse_start"    { items: FmItem[], durationMs, serverTimestamp }
 *   → "fm_pick_confirmed"  { itemIndex }
 *   → "fm_pick_update"     { picksIn, totalPickers }
 *   → "fm_write_start"     { item: FmItem, durationMs, serverTimestamp }
 *   → "fm_write_confirmed" {}
 *   → "fm_write_update"    { writtenIn, totalWriters }
 *   → "fm_reveal_entry"    { playerName, item: FmItem, message }
 *   → "fm_reveal_done"     {}
 *   → "fm_voting_start"    { entries: { playerId, playerName }[], durationMs, serverTimestamp }
 *   → "fm_vote_confirmed"  { targetId }
 *   → "fm_vote_update"     { votesIn, totalVoters }
 *   → "fm_result"          { winner, scores, entries: { playerId, playerName, itemName, message, voteCount }[] }
 *   → "round_skipped"      { reason }
 *
 * Client messages (Classic):
 *   ← { action: "place_bid", amount: number }
 *
 * Client messages (Funny Messages):
 *   ← { action: "fm_pick_item", itemIndex: number }
 *   ← { action: "fm_submit_message", message: string }
 *   ← { action: "fm_vote", targetId: string }
 */

import { Client } from "@colyseus/core";
import { BaseGame } from "../BaseGame";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Time to place a bid (ms). */
const BIDDING_DURATION_MS = 20_000;
/** Time to show the reveal animation (ms). */
const REVEAL_DURATION_MS = 8_000;
/** Time to show results (ms). */
const RESULTS_DISPLAY_MS = 15_000;

/** Points for submitting an accepted bid. */
const PARTICIPATION_POINTS = 25;
/** Bonus for winner (best accepted lowball). */
const WINNER_BONUS = 100;
/** 2nd place bonus. */
const SECOND_BONUS = 50;
/** 3rd place bonus. */
const THIRD_BONUS = 25;
/** Extra bonus for bids within 10% of the reserve. */
const CLOSE_SHAVE_BONUS = 25;

// ── Funny Messages constants ──────────────────────────────────────────────────

/**
 * Combined browse + write time (ms).
 * Players share one timer for both browsing and writing.
 * Once a player picks, they immediately proceed to writing.
 */
const FM_BROWSE_WRITE_DURATION_MS = 60_000;
/** Duration each message is shown on TV (ms). */
const FM_REVEAL_ENTRY_MS = 6_000;
/** Voting duration (ms). */
const FM_VOTING_DURATION_MS = 20_000;
/** Results display (ms). */
const FM_RESULTS_DISPLAY_MS = 15_000;
/** Number of items shown per round for selection. */
const FM_ITEMS_PER_ROUND = 16;

/** Points per vote received in funny messages mode. */
const FM_POINTS_PER_VOTE = 50;
/** Winner bonus for funny messages mode. */
const FM_WINNER_BONUS = 100;
/** Participation points for submitting a message. */
const FM_PARTICIPATION_POINTS = 25;

// ── Item catalogue ────────────────────────────────────────────────────────────

interface ItemCharacteristic {
  /** Display label, e.g. "Condition", "Brand", "Rarity". */
  label: string;
  /** Display value, e.g. "Mint", "Generic", "Common". */
  value: string;
  /** Multiplier applied to base price (e.g. 0.6 = 40% discount, 1.3 = 30% premium). */
  priceMultiplier: number;
}

interface MarketItem {
  name: string;
  description: string;
  category: string;
  askingPrice: number;
  /** @deprecated Use characteristics instead. Kept for backward compat with old items. */
  reserveFraction: number;
  /** Characteristics that influence the reserve price. Players see these to reason about value. */
  characteristics?: ItemCharacteristic[];
  imageHint: string; // CSS class hint for client rendering
}

// ── Characteristic pools for dynamic generation ──────────────────────────────

const CONDITION_VALUES: { value: string; multiplier: number }[] = [
  { value: "Mint / Sealed", multiplier: 1.4 },
  { value: "Excellent", multiplier: 1.2 },
  { value: "Good", multiplier: 1.0 },
  { value: "Fair — Some Wear", multiplier: 0.75 },
  { value: "Rough — Cosmetic Damage", multiplier: 0.55 },
  { value: "For Parts Only", multiplier: 0.3 },
];

const BRAND_VALUES: { value: string; multiplier: number }[] = [
  { value: "Premium Brand", multiplier: 1.35 },
  { value: "Name Brand", multiplier: 1.1 },
  { value: "Generic / Off-Brand", multiplier: 0.8 },
  { value: "Unbranded / Homemade", multiplier: 0.6 },
  { value: "Knockoff", multiplier: 0.45 },
];

const DEMAND_VALUES: { value: string; multiplier: number }[] = [
  { value: "Trending — High Demand", multiplier: 1.3 },
  { value: "Steady Demand", multiplier: 1.0 },
  { value: "Niche Interest", multiplier: 0.8 },
  { value: "Nobody Wants This", multiplier: 0.55 },
];

const AGE_VALUES: { value: string; multiplier: number }[] = [
  { value: "Brand New", multiplier: 1.25 },
  { value: "Like New (< 1 year)", multiplier: 1.1 },
  { value: "1-3 Years Old", multiplier: 0.9 },
  { value: "Vintage (5-20 years)", multiplier: 0.85 },
  { value: "Antique (20+ years)", multiplier: 1.15 },
];

const EXTRAS_VALUES: { value: string; multiplier: number }[] = [
  { value: "Comes With Accessories", multiplier: 1.15 },
  { value: "Original Box & Manual", multiplier: 1.1 },
  { value: "No Extras", multiplier: 0.95 },
  { value: "Missing Parts", multiplier: 0.7 },
];

const ALL_POOLS = [
  { label: "Condition", values: CONDITION_VALUES },
  { label: "Brand", values: BRAND_VALUES },
  { label: "Demand", values: DEMAND_VALUES },
  { label: "Age", values: AGE_VALUES },
  { label: "Extras", values: EXTRAS_VALUES },
];

/**
 * Generate plausible characteristics from a target reserve fraction.
 * Picks 2-3 characteristics whose combined multiplier product approximates
 * the target reserveFraction. Uses seeded randomization based on item name.
 */
function generateCharacteristics(item: MarketItem): ItemCharacteristic[] {
  // Simple hash of item name for deterministic but varied selection
  let hash = 0;
  for (let i = 0; i < item.name.length; i++) {
    hash = ((hash << 5) - hash + item.name.charCodeAt(i)) | 0;
  }
  const seeded = (n: number) => Math.abs((hash * (n + 1) * 2654435761) >>> 0) / 4294967296;

  const targetFraction = item.reserveFraction;
  const numTraits = targetFraction < 0.35 || targetFraction > 0.6 ? 3 : 2;

  // Shuffle pools deterministically and pick first N
  const poolOrder = ALL_POOLS.map((p, i) => ({ pool: p, sortKey: seeded(i) }))
    .sort((a, b) => a.sortKey - b.sortKey);
  const selectedPools = poolOrder.slice(0, numTraits);

  // For each selected pool, find the value whose multiplier, combined with others,
  // gets closest to the target fraction
  const characteristics: ItemCharacteristic[] = [];
  let remainingTarget = targetFraction;

  for (let p = 0; p < selectedPools.length; p++) {
    const pool = selectedPools[p].pool;
    const isLast = p === selectedPools.length - 1;

    if (isLast) {
      // Find the value closest to remaining target
      let best = pool.values[0];
      let bestDist = Math.abs(best.multiplier - remainingTarget);
      for (const v of pool.values) {
        const dist = Math.abs(v.multiplier - remainingTarget);
        if (dist < bestDist) {
          best = v;
          bestDist = dist;
        }
      }
      characteristics.push({ label: pool.label, value: best.value, priceMultiplier: best.multiplier });
    } else {
      // Pick a value that doesn't push too far from target
      // Target for this trait: nth root of remaining target
      const nthRoot = Math.pow(remainingTarget, 1 / (selectedPools.length - p));
      let best = pool.values[0];
      let bestDist = Math.abs(best.multiplier - nthRoot);
      for (const v of pool.values) {
        const dist = Math.abs(v.multiplier - nthRoot);
        if (dist < bestDist) {
          best = v;
          bestDist = dist;
        }
      }
      characteristics.push({ label: pool.label, value: best.value, priceMultiplier: best.multiplier });
      remainingTarget = remainingTarget / best.multiplier;
    }
  }

  return characteristics;
}

/**
 * Compute the reserve price for an item.
 * If the item has explicit characteristics, the reserve = askingPrice * product(multipliers).
 * Otherwise, falls back to askingPrice * reserveFraction.
 */
function computeReserve(item: MarketItem): number {
  if (item.characteristics && item.characteristics.length > 0) {
    const multiplier = item.characteristics.reduce((acc, c) => acc * c.priceMultiplier, 1);
    return Math.round(item.askingPrice * multiplier);
  }
  return Math.round(item.askingPrice * item.reserveFraction);
}

/**
 * Get the characteristics for an item (explicit or generated).
 */
function getCharacteristics(item: MarketItem): ItemCharacteristic[] {
  if (item.characteristics && item.characteristics.length > 0) {
    return item.characteristics;
  }
  return generateCharacteristics(item);
}

/**
 * Curated list of fake marketplace items. All items are family-friendly
 * and intentionally absurd to be humorous.
 */
const ITEM_CATALOGUE: MarketItem[] = [
  {
    name: "Slightly Haunted Toaster",
    description: "Makes toast AND mysterious tapping sounds. Previous owner moved out suddenly.",
    category: "Appliances",
    askingPrice: 450,
    reserveFraction: 0.4,
    imageHint: "toaster",
  },
  {
    name: "Emotional Support Cactus",
    description: "Great listener. Has been through a lot. Comes with tiny sunglasses.",
    category: "Plants & Garden",
    askingPrice: 85,
    reserveFraction: 0.35,
    imageHint: "cactus",
  },
  {
    name: "Vintage Air Guitar (1987)",
    description: "Classic model. Played by a roadie who almost met a guy who knew Slash.",
    category: "Musical Instruments",
    askingPrice: 2500,
    reserveFraction: 0.5,
    imageHint: "guitar",
  },
  {
    name: "Mystery Box (DO NOT OPEN)",
    description: "Found in attic. Shakes occasionally. Probably fine.",
    category: "Collectibles",
    askingPrice: 999,
    reserveFraction: 0.3,
    imageHint: "box",
  },
  {
    name: "Used Invisibility Cloak",
    description: "Works perfectly — at least I think it's still here. FIRM on price.",
    category: "Clothing & Accessories",
    askingPrice: 5000,
    reserveFraction: 0.6,
    imageHint: "cloak",
  },
  {
    name: "Self-Driving Shopping Cart",
    description: "Always pulls to the left. Has a mind of its own. Literally.",
    category: "Vehicles",
    askingPrice: 1200,
    reserveFraction: 0.45,
    imageHint: "cart",
  },
  {
    name: "Artisanal Gravel (Organic)",
    description: "Hand-picked from a very specific part of my driveway. Gluten-free.",
    category: "Home & Garden",
    askingPrice: 175,
    reserveFraction: 0.5,
    imageHint: "gravel",
  },
  {
    name: "Pre-Chewed Gum Collection",
    description: "50 pieces. Various flavors. Sorted by color. A true connoisseur's lot.",
    category: "Collectibles",
    askingPrice: 300,
    reserveFraction: 0.35,
    imageHint: "gum",
  },
  {
    name: "WiFi-Enabled Rock",
    description: "It's a rock. With WiFi. Password is 'rocksolid123'. Range: 2 feet.",
    category: "Electronics",
    askingPrice: 799,
    reserveFraction: 0.4,
    imageHint: "rock",
  },
  {
    name: "Left Shoe (Just One)",
    description: "Size 11. The right one is listed separately. Bundle discount available.",
    category: "Clothing & Accessories",
    askingPrice: 60,
    reserveFraction: 0.5,
    imageHint: "shoe",
  },
  {
    name: "Certified Pre-Owned Cloud",
    description: "Cumulus model. Slight drizzle issue. No warranty. Delivery not included.",
    category: "Outdoor",
    askingPrice: 10000,
    reserveFraction: 0.55,
    imageHint: "cloud",
  },
  {
    name: "Antique Dial-Up Modem",
    description: "Authentic 56k experience. Free AOL trial CD included. Makes great sounds.",
    category: "Electronics",
    askingPrice: 350,
    reserveFraction: 0.4,
    imageHint: "modem",
  },
  {
    name: "Professional Bubble Wrap (Popped)",
    description: "All bubbles pre-popped for your convenience. Great for... packing?",
    category: "Office Supplies",
    askingPrice: 50,
    reserveFraction: 0.3,
    imageHint: "bubble-wrap",
  },
  {
    name: "Glow-in-the-Dark Sunscreen",
    description: "SPF 5000. Defeats the purpose but looks amazing at raves.",
    category: "Health & Beauty",
    askingPrice: 220,
    reserveFraction: 0.45,
    imageHint: "sunscreen",
  },
  {
    name: "Time Machine (Parts Only)",
    description: "Missing flux capacitor. Some assembly required. Sold as-is, when-is.",
    category: "Vehicles",
    askingPrice: 8800,
    reserveFraction: 0.5,
    imageHint: "time-machine",
  },
  {
    name: "Pet-Friendly Volcano Model",
    description: "1:200 scale. Erupts on Tuesdays. Cat seems to enjoy it.",
    category: "Toys & Games",
    askingPrice: 650,
    reserveFraction: 0.4,
    imageHint: "volcano",
  },
  {
    name: "Unlimited Pasta Pass (Expired)",
    description: "Expired 2019 but still smells faintly of breadsticks. Sentimental value.",
    category: "Food & Dining",
    askingPrice: 500,
    reserveFraction: 0.35,
    imageHint: "pasta",
  },
  {
    name: "Training Sword (Pool Noodle)",
    description: "Battle-tested at 47 backyard duels. Undefeated champion's weapon.",
    category: "Sporting Goods",
    askingPrice: 95,
    reserveFraction: 0.5,
    imageHint: "noodle",
  },
  {
    name: "Map to Buried Treasure",
    description: "X marks the spot. Treasure not guaranteed. Map is definitely real paper.",
    category: "Collectibles",
    askingPrice: 3000,
    reserveFraction: 0.45,
    imageHint: "map",
  },
  {
    name: "Noise-Cancelling Earmuffs for Dogs",
    description: "Because your dog deserves peace too. One size fits most breeds.",
    category: "Pet Supplies",
    askingPrice: 280,
    reserveFraction: 0.5,
    imageHint: "earmuffs",
  },
  {
    name: "1998 Project Drift Missile",
    description: "Starts on the third prayer. Includes zip ties and unmatched rims.",
    category: "Cars & Trucks",
    askingPrice: 6400,
    reserveFraction: 0.45,
    imageHint: "car",
  },
  {
    name: "Snowmobile (Mostly Winterized)",
    description: "Fast, loud, and occasionally points itself at trees.",
    category: "ATV / Snowmobile",
    askingPrice: 5200,
    reserveFraction: 0.5,
    imageHint: "snowmobile",
  },
  {
    name: "Mud-Covered Quad",
    description: "Never washed to preserve authenticity and horsepower.",
    category: "ATV / Quad",
    askingPrice: 4300,
    reserveFraction: 0.5,
    imageHint: "quad",
  },
  {
    name: "Lift Kit (No Truck Included)",
    description: "For when your suspension needs to see over your ego.",
    category: "Auto Parts",
    askingPrice: 1600,
    reserveFraction: 0.4,
    imageHint: "lift-kit",
  },
  {
    name: "Garage Fridge (Beer-Patina Edition)",
    description: "Runs cold and has exactly one shelf that still believes in itself.",
    category: "Appliances",
    askingPrice: 420,
    reserveFraction: 0.35,
    imageHint: "fridge",
  },
  {
    name: "Weight Bench + Broken Dreams",
    description: "Bench is solid. Motivation sold separately.",
    category: "Fitness",
    askingPrice: 350,
    reserveFraction: 0.45,
    imageHint: "bench",
  },
  {
    name: "Tactical Flashlight (Blinds Satellites)",
    description: "Three brightness modes: bright, brighter, and legal issues.",
    category: "Outdoors",
    askingPrice: 180,
    reserveFraction: 0.4,
    imageHint: "flashlight",
  },
  {
    name: "Bass Boat (Trailer Included, Fish Not Included)",
    description: "Seats three dads and one cooler full of ambition.",
    category: "Boats",
    askingPrice: 9800,
    reserveFraction: 0.55,
    imageHint: "boat",
  },
  {
    name: "Pressure Washer (Neighborhood Menace)",
    description: "Powerful enough to erase your driveway and your memories.",
    category: "Tools",
    askingPrice: 700,
    reserveFraction: 0.45,
    imageHint: "washer",
  },
  {
    name: "Gaming Chair With Racing Stripes",
    description: "Adds +15% cornering speed in all first-person shooters.",
    category: "Gaming",
    askingPrice: 260,
    reserveFraction: 0.4,
    imageHint: "chair",
  },
  {
    name: "Mystery Toolbox",
    description: "Every drawer is a side quest. Includes 37 identical sockets.",
    category: "Tools",
    askingPrice: 500,
    reserveFraction: 0.4,
    imageHint: "toolbox",
  },
  {
    name: "Chainsaw (Starts Eventually)",
    description: "Great for wood, vibes, and startling the cul-de-sac.",
    category: "Outdoor Power",
    askingPrice: 390,
    reserveFraction: 0.45,
    imageHint: "chainsaw",
  },
  {
    name: "Collector's Mini Dirt Bike",
    description: "Tiny bike, huge confidence. Excellent for driveway chaos.",
    category: "Motorcycles",
    askingPrice: 2100,
    reserveFraction: 0.5,
    imageHint: "dirt-bike",
  },
  {
    name: "Smoker Grill (Brisket Veteran)",
    description: "Has fed a fantasy football league for seven seasons.",
    category: "Outdoor Cooking",
    askingPrice: 850,
    reserveFraction: 0.5,
    imageHint: "grill",
  },
  {
    name: "GoPro From 2014",
    description: "Captured every bad idea in glorious 720p.",
    category: "Electronics",
    askingPrice: 140,
    reserveFraction: 0.35,
    imageHint: "camera",
  },
  {
    name: "Truck Bed Tent",
    description: "Camping for people who miss tailgates when they sleep.",
    category: "Camping",
    askingPrice: 220,
    reserveFraction: 0.4,
    imageHint: "tent",
  },
  {
    name: "Fishing Kayak (Stealth Mode)",
    description: "Low profile. High chance of buying more gear afterward.",
    category: "Fishing",
    askingPrice: 780,
    reserveFraction: 0.45,
    imageHint: "kayak",
  },
  {
    name: "Vintage Subwoofer Box",
    description: "Turns every traffic light into a seismic event.",
    category: "Car Audio",
    askingPrice: 480,
    reserveFraction: 0.45,
    imageHint: "subwoofer",
  },
  {
    name: "Emotional Support Anvil",
    description: "Heavy but reassuring. Therapist says it's fine.",
    category: "Wellness",
    askingPrice: 275,
    reserveFraction: 0.45,
    imageHint: "anvil",
  },
  {
    name: "Pre-Owned Trampoline (No Bounce)",
    description: "Springs are decorative. Great for standing on sadly.",
    category: "Sporting Goods",
    askingPrice: 180,
    reserveFraction: 0.35,
    imageHint: "trampoline",
  },
  {
    name: "Artisanal Doorknob Collection",
    description: "47 doorknobs. No doors. That's your problem.",
    category: "Collectibles",
    askingPrice: 625,
    reserveFraction: 0.5,
    imageHint: "doorknob",
  },
  {
    name: "Bluetooth Shovel",
    description: "Pairs with your phone. Does not help with digging.",
    category: "Tools",
    askingPrice: 349,
    reserveFraction: 0.4,
    imageHint: "shovel",
  },
  {
    name: "Inflatable Bookshelf",
    description: "Holds up to 3 paperbacks before achieving liftoff.",
    category: "Home & Garden",
    askingPrice: 89,
    reserveFraction: 0.55,
    imageHint: "balloon",
  },
  {
    name: "Haunted Treadmill",
    description: "Runs by itself at 3 AM. Great cardio if you can catch it.",
    category: "Fitness",
    askingPrice: 1200,
    reserveFraction: 0.35,
    imageHint: "treadmill",
  },
  {
    name: "Map to Nowhere",
    description: "Extremely detailed. Leads to a Denny's parking lot.",
    category: "Outdoor",
    askingPrice: 45,
    reserveFraction: 0.6,
    imageHint: "compass",
  },
  {
    name: "Secondhand Fog Machine",
    description: "Makes any room feel like a middle school dance.",
    category: "Electronics",
    askingPrice: 150,
    reserveFraction: 0.5,
    imageHint: "fog",
  },
  {
    name: "Uranium Glass Punch Bowl",
    description: "Glows under blacklight. Probably fine. Probably.",
    category: "Collectibles",
    askingPrice: 3200,
    reserveFraction: 0.45,
    imageHint: "punchbowl",
  },
  {
    name: "Solar-Powered Flashlight (Indoor Use Only)",
    description: "Works great outside, which defeats the purpose.",
    category: "Tools",
    askingPrice: 65,
    reserveFraction: 0.4,
    imageHint: "lantern",
  },
  {
    name: "Taxidermied Roomba",
    description: "It lived a full life vacuuming under couches. Now it's art.",
    category: "Home & Garden",
    askingPrice: 525,
    reserveFraction: 0.5,
    imageHint: "roomba",
  },
  {
    name: "Left-Handed Smoke Shifter",
    description: "Essential camping gear. Ask any Eagle Scout.",
    category: "Outdoor",
    askingPrice: 40,
    reserveFraction: 0.7,
    imageHint: "smoke",
  },
  {
    name: "Vintage Typewriter (Caps Lock Only)",
    description: "EVERYTHING YOU WRITE SOUNDS VERY URGENT.",
    category: "Office",
    askingPrice: 890,
    reserveFraction: 0.4,
    imageHint: "typewriter",
  },
  {
    name: "Slightly Used Parachute",
    description: "Only opened once. Seller moving slowly but alive.",
    category: "Sporting Goods",
    askingPrice: 500,
    reserveFraction: 0.3,
    imageHint: "parachute",
  },
  {
    name: "Grandfather Clock (Judges You)",
    description: "Ticks disapprovingly. Bongs at inconvenient moments.",
    category: "Home & Garden",
    askingPrice: 4500,
    reserveFraction: 0.35,
    imageHint: "clock",
  },
  {
    name: "Discount Hot Tub (No Heat)",
    description: "It's a tub. Bring your own hot.",
    category: "Home & Garden",
    askingPrice: 2800,
    reserveFraction: 0.3,
    imageHint: "hottub",
  },
  {
    name: "Suspiciously Cheap Grand Piano",
    description: "Plays beautifully. Do NOT look inside.",
    category: "Musical Instruments",
    askingPrice: 8500,
    reserveFraction: 0.35,
    imageHint: "piano",
  },
  {
    name: "Weighted Blanket of Existential Dread",
    description: "40 lbs. Like a hug from the void. Machine washable.",
    category: "Home & Garden",
    askingPrice: 199,
    reserveFraction: 0.55,
    imageHint: "blanket",
  },
  {
    name: "Telescope (Points Down)",
    description: "Perfect for looking at ants in incredible detail.",
    category: "Electronics",
    askingPrice: 375,
    reserveFraction: 0.45,
    imageHint: "telescope",
  },
  {
    name: "Exercise Bike to Nowhere",
    description: "0 miles traveled in 6 years. Excellent clothes hanger.",
    category: "Fitness",
    askingPrice: 950,
    reserveFraction: 0.3,
    imageHint: "bicycle",
  },
  {
    name: "Sentient Lawn Gnome",
    description: "Eyes follow you. Neighbors report hearing whistling.",
    category: "Home & Garden",
    askingPrice: 120,
    reserveFraction: 0.6,
    imageHint: "gnome",
  },
  {
    name: "Noise-Canceling Earplugs (Too Effective)",
    description: "Missed 4 fire alarms and a divorce. Selling for safety.",
    category: "Electronics",
    askingPrice: 55,
    reserveFraction: 0.5,
    imageHint: "earplug",
  },
  {
    name: "Artisan Gravel (Organic)",
    description: "Hand-selected pebbles. Each one has a name.",
    category: "Home & Garden",
    askingPrice: 250,
    reserveFraction: 0.65,
    imageHint: "pebble",
  },
  {
    name: "Motorcycle Sidecar (No Motorcycle)",
    description: "Great for sitting in your driveway looking wistful.",
    category: "Vehicles",
    askingPrice: 1400,
    reserveFraction: 0.4,
    imageHint: "sidecar",
  },
  {
    name: "Reverse Microwave",
    description: "Makes hot food cold in seconds. AKA a mini fridge with branding.",
    category: "Appliances",
    askingPrice: 425,
    reserveFraction: 0.5,
    imageHint: "microwave",
  },
  {
    name: "Decorative Ladder (Structural Anxiety)",
    description: "Leans against the wall. Cannot be climbed. Very Pinterest.",
    category: "Home & Garden",
    askingPrice: 175,
    reserveFraction: 0.55,
    imageHint: "ladder",
  },
  {
    name: "Pet Rock 2.0",
    description: "Now with USB-C charging. Still does nothing.",
    category: "Electronics",
    askingPrice: 99,
    reserveFraction: 0.6,
    imageHint: "gem",
  },
  {
    name: "Accordion (Haunted, B-Flat Only)",
    description: "Plays itself on windy nights. Neighbors hate this listing.",
    category: "Musical Instruments",
    askingPrice: 650,
    reserveFraction: 0.4,
    imageHint: "accordion",
  },
  {
    name: "Industrial Ceiling Fan",
    description: "Rated for warehouses. You have an apartment. I believe in you.",
    category: "Home & Garden",
    askingPrice: 2200,
    reserveFraction: 0.35,
    imageHint: "fan",
  },
  {
    name: "Mystery Jar of Screws",
    description: "At least 300 screws. None of them match anything.",
    category: "Tools",
    askingPrice: 25,
    reserveFraction: 0.7,
    imageHint: "screw",
  },
  {
    name: "Canoe with Screen Door Bottom",
    description: "Sinks beautifully. Great conversation piece on land.",
    category: "Outdoor",
    askingPrice: 600,
    reserveFraction: 0.35,
    imageHint: "canoe",
  },
  {
    name: "Life-Size Cardboard Celebrity",
    description: "Won't say who. You'll know when you see it. No returns.",
    category: "Collectibles",
    askingPrice: 75,
    reserveFraction: 0.5,
    imageHint: "cutout",
  },
  {
    name: "Drone (Afraid of Heights)",
    description: "Hovers at 18 inches max. Great for filming shoes.",
    category: "Electronics",
    askingPrice: 1800,
    reserveFraction: 0.35,
    imageHint: "drone",
  },
  {
    name: "Cast Iron Yoga Mat",
    description: "Indestructible. Weighs 60 lbs. Namaste.",
    category: "Fitness",
    askingPrice: 340,
    reserveFraction: 0.45,
    imageHint: "mat",
  },
  {
    name: "Aquarium (Fish Sold Separately, Forever)",
    description: "We will never sell you fish. Just the tank. Accept it.",
    category: "Pets",
    askingPrice: 475,
    reserveFraction: 0.5,
    imageHint: "aquarium",
  },
  {
    name: "Recliner That Won't Recline",
    description: "Stuck at 90 degrees. Promotes excellent posture and regret.",
    category: "Furniture",
    askingPrice: 320,
    reserveFraction: 0.4,
    imageHint: "recliner",
  },
  {
    name: "Vintage Rotary Phone (No Dial Tone)",
    description: "Perfect for slamming down dramatically after arguments.",
    category: "Collectibles",
    askingPrice: 185,
    reserveFraction: 0.55,
    imageHint: "phone",
  },
  {
    name: "Portable Sundial",
    description: "Accurate twice a day. Requires sun, patience, and low standards.",
    category: "Outdoor",
    askingPrice: 60,
    reserveFraction: 0.65,
    imageHint: "sundial",
  },
  {
    name: "Electric Unicycle (Square Wheel Edition)",
    description: "Limited run prototype. The bumps are a feature.",
    category: "Vehicles",
    askingPrice: 3400,
    reserveFraction: 0.3,
    imageHint: "unicycle",
  },
  {
    name: "Bag of Wind",
    description: "Collected from the top of a very tall hill. Non-refundable.",
    category: "Outdoor",
    askingPrice: 30,
    reserveFraction: 0.7,
    imageHint: "wind",
  },
  {
    name: "Deep Fryer (Lightly Cursed)",
    description: "Everything comes out perfect but shaped like a pentagon.",
    category: "Appliances",
    askingPrice: 225,
    reserveFraction: 0.5,
    imageHint: "fryer",
  },
  {
    name: "Professional Bubble Level (Always Slightly Off)",
    description: "Every shelf you hang will have character.",
    category: "Tools",
    askingPrice: 35,
    reserveFraction: 0.6,
    imageHint: "level",
  },
  {
    name: "Binoculars (One Lens Missing)",
    description: "Monocular? No. Broken binoculars. Know the difference.",
    category: "Outdoor",
    askingPrice: 110,
    reserveFraction: 0.45,
    imageHint: "binoculars",
  },
  {
    name: "15,000-Piece Jigsaw Puzzle (14,997 Pieces)",
    description: "Three pieces missing. Which three? That's the real puzzle.",
    category: "Games & Toys",
    askingPrice: 85,
    reserveFraction: 0.55,
    imageHint: "puzzle",
  },
  {
    name: "Smart Toilet Seat (Too Smart)",
    description: "Gives unsolicited health advice. Knows your schedule.",
    category: "Home & Garden",
    askingPrice: 15000,
    reserveFraction: 0.3,
    imageHint: "toilet",
  },

  // ── Batch 2: 100 additional items ────────────────────────────────

  {
    name: "Roomba With Attitude",
    description: "Cleans when it feels like it. Judges your floor plan.",
    category: "Appliances",
    askingPrice: 680,
    reserveFraction: 0.45,
    imageHint: "roomba2",
  },
  {
    name: "Cursed Waffle Iron",
    description: "All waffles come out shaped like Abraham Lincoln. Every. Single. One.",
    category: "Appliances",
    askingPrice: 195,
    reserveFraction: 0.5,
    imageHint: "waffle",
  },
  {
    name: "Broken Compass (Points to Taco Bell)",
    description: "Not north. Not south. Just Taco Bell. Every time.",
    category: "Outdoor",
    askingPrice: 40,
    reserveFraction: 0.65,
    imageHint: "compass2",
  },
  {
    name: "Trampoline (Assembly Required, Instructions Lost)",
    description: "750 bolts, 40 springs, zero guidance. Godspeed.",
    category: "Sporting Goods",
    askingPrice: 380,
    reserveFraction: 0.35,
    imageHint: "trampoline2",
  },
  {
    name: "Inflatable Hot Tub (Deflatable Trust Issues)",
    description: "Holds water for approximately 45 minutes. Then surprise.",
    category: "Home & Garden",
    askingPrice: 1500,
    reserveFraction: 0.3,
    imageHint: "pool",
  },
  {
    name: "Projector (720p, 72 Lumens)",
    description: "Best viewed in a cave. With your eyes closed. Actually just imagine a movie.",
    category: "Electronics",
    askingPrice: 550,
    reserveFraction: 0.35,
    imageHint: "projector",
  },
  {
    name: "Vintage Flip Phone (T9 Legend)",
    description: "Texts take 4 minutes each. Builds character and finger strength.",
    category: "Electronics",
    askingPrice: 75,
    reserveFraction: 0.6,
    imageHint: "flip-phone",
  },
  {
    name: "Decorative Sword (Butter Knife Sharp)",
    description: "Mall ninja starter kit. Terrifies nobody.",
    category: "Collectibles",
    askingPrice: 320,
    reserveFraction: 0.4,
    imageHint: "sword",
  },
  {
    name: "Skateboard (One Wheel Missing)",
    description: "Three wheels. Infinite style. Hospital not included.",
    category: "Sporting Goods",
    askingPrice: 95,
    reserveFraction: 0.45,
    imageHint: "skateboard",
  },
  {
    name: "Desktop Globe (Flat Earth Edition)",
    description: "It's a disc. On a stand. For the discerning geography denier.",
    category: "Collectibles",
    askingPrice: 420,
    reserveFraction: 0.4,
    imageHint: "globe",
  },
  {
    name: "Camping Hammock (Weight Limit: 80 lbs)",
    description: "Perfect for children, cats, or your delusions about your weight.",
    category: "Outdoor",
    askingPrice: 55,
    reserveFraction: 0.55,
    imageHint: "hammock",
  },
  {
    name: "Air Purifier (Adds Personality to Air)",
    description: "Doesn't purify. Just makes your air smell like cedar and ambition.",
    category: "Appliances",
    askingPrice: 300,
    reserveFraction: 0.5,
    imageHint: "purifier",
  },
  {
    name: "Magnetic Spice Rack (Spices Launch at 3 AM)",
    description: "Magnets weaken over time. Cumin becomes a projectile. You've been warned.",
    category: "Home & Garden",
    askingPrice: 65,
    reserveFraction: 0.6,
    imageHint: "spice-rack",
  },
  {
    name: "Karaoke Machine (One Song Only)",
    description: "It only plays 'My Heart Will Go On.' Permanently. No off switch.",
    category: "Electronics",
    askingPrice: 250,
    reserveFraction: 0.4,
    imageHint: "karaoke",
  },
  {
    name: "Mannequin Head (Uncomfortably Realistic)",
    description: "Excellent for wig display or traumatizing houseguests.",
    category: "Collectibles",
    askingPrice: 110,
    reserveFraction: 0.5,
    imageHint: "mannequin",
  },
  {
    name: "Bread Maker (Makes Everything Except Bread)",
    description: "Hockey pucks, doorstops, regret. Never bread.",
    category: "Appliances",
    askingPrice: 175,
    reserveFraction: 0.45,
    imageHint: "bread",
  },
  {
    name: "VHS Rewinder (Dolphin-Shaped)",
    description: "Be kind, rewind. With style. And a cetacean.",
    category: "Electronics",
    askingPrice: 45,
    reserveFraction: 0.7,
    imageHint: "vhs",
  },
  {
    name: "Giant Beanbag Chair (Impossible to Exit)",
    description: "You will sit down once. You will never get up. This is your life now.",
    category: "Furniture",
    askingPrice: 400,
    reserveFraction: 0.4,
    imageHint: "beanbag",
  },
  {
    name: "Lava Lamp (Lava Not Included)",
    description: "It's just a lamp. The lava is aspirational.",
    category: "Home & Garden",
    askingPrice: 55,
    reserveFraction: 0.6,
    imageHint: "lava-lamp",
  },
  {
    name: "Megaphone (Permanently Set to Max)",
    description: "NO VOLUME CONTROL. GREAT FOR LIBRARIES.",
    category: "Electronics",
    askingPrice: 130,
    reserveFraction: 0.45,
    imageHint: "megaphone",
  },
  {
    name: "Portable Generator (Louder Than a Jet Engine)",
    description: "Powers one lightbulb. Wakes entire neighborhood.",
    category: "Tools",
    askingPrice: 2200,
    reserveFraction: 0.35,
    imageHint: "generator",
  },
  {
    name: "Tandem Bicycle (Seats Face Opposite Ways)",
    description: "Requires cooperation, trust, and accepting you'll go nowhere.",
    category: "Sporting Goods",
    askingPrice: 850,
    reserveFraction: 0.4,
    imageHint: "tandem",
  },
  {
    name: "Dehydrated Water (Just Add Water)",
    description: "Revolutionary. Empty jar included.",
    category: "Food & Dining",
    askingPrice: 15,
    reserveFraction: 0.7,
    imageHint: "water-bottle",
  },
  {
    name: "Rubber Duck Army (500 Count)",
    description: "They watch. They wait. Perfect for bathtubs or psychological warfare.",
    category: "Toys & Games",
    askingPrice: 200,
    reserveFraction: 0.55,
    imageHint: "rubber-duck",
  },
  {
    name: "Alarm Clock That Runs Away",
    description: "You have to chase it to turn it off. Cardio AND punctuality.",
    category: "Electronics",
    askingPrice: 90,
    reserveFraction: 0.5,
    imageHint: "alarm",
  },
  {
    name: "Cast Iron Skillet (Seasoned With Secrets)",
    description: "Grandma's recipe is literally baked in. We think it's beef stew.",
    category: "Home & Garden",
    askingPrice: 225,
    reserveFraction: 0.55,
    imageHint: "skillet",
  },
  {
    name: "Standing Desk (Can't Sit Back Down)",
    description: "Motorized lift broke. Welcome to standing. Forever.",
    category: "Furniture",
    askingPrice: 950,
    reserveFraction: 0.3,
    imageHint: "desk",
  },
  {
    name: "Pet Hamster Wheel (Human-Sized)",
    description: "5 ft diameter. For when the gym is too mainstream.",
    category: "Fitness",
    askingPrice: 1800,
    reserveFraction: 0.35,
    imageHint: "hamster-wheel",
  },
  {
    name: "Bluetooth Speaker (Stuck on Maximum Bass)",
    description: "Every song sounds like an earthquake at a nightclub.",
    category: "Electronics",
    askingPrice: 180,
    reserveFraction: 0.45,
    imageHint: "speaker",
  },
  {
    name: "Antique Butter Churn",
    description: "Makes butter in only 4 hours. Or buy it for $3. Your call.",
    category: "Collectibles",
    askingPrice: 475,
    reserveFraction: 0.45,
    imageHint: "churn",
  },
  {
    name: "Garden Hose (50% Kink)",
    description: "Water goes everywhere except where you point it.",
    category: "Home & Garden",
    askingPrice: 35,
    reserveFraction: 0.6,
    imageHint: "hose",
  },
  {
    name: "Espresso Machine (Makes Anxiety)",
    description: "12 bars of pressure. 12 bars of existential dread.",
    category: "Appliances",
    askingPrice: 1400,
    reserveFraction: 0.4,
    imageHint: "espresso",
  },
  {
    name: "Disco Ball (Doesn't Stop Spinning)",
    description: "Plugged it in 2019. Still going. Send help or a DJ.",
    category: "Home & Garden",
    askingPrice: 125,
    reserveFraction: 0.55,
    imageHint: "disco",
  },
  {
    name: "Metal Detector (Only Finds Disappointment)",
    description: "Beeps for bottle caps exclusively. 47 so far.",
    category: "Outdoor",
    askingPrice: 600,
    reserveFraction: 0.35,
    imageHint: "detector",
  },
  {
    name: "Treadmill Desk (Now With Bruises)",
    description: "Work and walk. Fall and email your boss from the floor.",
    category: "Fitness",
    askingPrice: 1100,
    reserveFraction: 0.35,
    imageHint: "treadmill-desk",
  },
  {
    name: "Vintage Lunchbox (Still Smells Like 1994)",
    description: "Power Rangers thermos included. Mayo stain is permanent.",
    category: "Collectibles",
    askingPrice: 85,
    reserveFraction: 0.55,
    imageHint: "lunchbox",
  },
  {
    name: "3D Printer (Only Prints Cubes)",
    description: "We've tried everything. It only makes cubes. Lovely cubes though.",
    category: "Electronics",
    askingPrice: 900,
    reserveFraction: 0.35,
    imageHint: "printer",
  },
  {
    name: "Pogo Stick (Spring-Loaded to the Moon)",
    description: "First bounce goes 8 feet. No one has attempted a second.",
    category: "Sporting Goods",
    askingPrice: 150,
    reserveFraction: 0.45,
    imageHint: "pogo",
  },
  {
    name: "Crystal Ball (Shows Only Traffic Reports)",
    description: "Foresaw 12 fender benders. Zero lottery numbers.",
    category: "Collectibles",
    askingPrice: 750,
    reserveFraction: 0.4,
    imageHint: "crystal",
  },
  {
    name: "Instant Pot (Judges Your Recipes)",
    description: "Display reads 'Really?' every time you add cheese.",
    category: "Appliances",
    askingPrice: 160,
    reserveFraction: 0.55,
    imageHint: "instant-pot",
  },
  {
    name: "Antique Sewing Machine (Possessed by a Seamstress)",
    description: "Sews by itself at midnight. Only makes doilies.",
    category: "Collectibles",
    askingPrice: 1200,
    reserveFraction: 0.4,
    imageHint: "sewing",
  },
  {
    name: "Electric Scooter (Top Speed: Walking)",
    description: "Slower than your legs but 10x louder.",
    category: "Vehicles",
    askingPrice: 450,
    reserveFraction: 0.35,
    imageHint: "scooter",
  },
  {
    name: "Fidget Spinner Collection (2017 Peak Investment)",
    description: "437 spinners. Worth millions someday. Probably. Maybe.",
    category: "Collectibles",
    askingPrice: 2000,
    reserveFraction: 0.3,
    imageHint: "spinner",
  },
  {
    name: "Snow Globe (Wrong City Inside)",
    description: "Says Paris. That's clearly a Walmart. Still shakes nicely.",
    category: "Collectibles",
    askingPrice: 30,
    reserveFraction: 0.65,
    imageHint: "snowglobe",
  },
  {
    name: "Baby Monitor (Picks Up Radio Stations)",
    description: "Great for monitoring babies. Also plays classic rock at 2 AM.",
    category: "Electronics",
    askingPrice: 120,
    reserveFraction: 0.45,
    imageHint: "monitor",
  },
  {
    name: "Pool Table (Slightly Downhill)",
    description: "All balls roll to one corner. Speed round every game.",
    category: "Games & Toys",
    askingPrice: 3500,
    reserveFraction: 0.35,
    imageHint: "pool-table",
  },
  {
    name: "Solar Panel (Works at Night*)",
    description: "*It doesn't. Marketing was aspirational. Day use only.",
    category: "Electronics",
    askingPrice: 800,
    reserveFraction: 0.4,
    imageHint: "solar",
  },
  {
    name: "Singing Fish (Won't Stop)",
    description: "Take My Breath Away, 24/7. Batteries are welded in.",
    category: "Home & Garden",
    askingPrice: 45,
    reserveFraction: 0.6,
    imageHint: "fish",
  },
  {
    name: "Velvet Painting (Dogs Playing Poker)",
    description: "The bulldog is bluffing. I've watched for years.",
    category: "Art",
    askingPrice: 350,
    reserveFraction: 0.5,
    imageHint: "painting",
  },
  {
    name: "Fog Horn (For Indoor Use)",
    description: "Clear a room in 0.3 seconds. Thanksgiving tested.",
    category: "Outdoor",
    askingPrice: 95,
    reserveFraction: 0.55,
    imageHint: "foghorn",
  },
  {
    name: "Portable Air Conditioner (Heats Room Instead)",
    description: "The exhaust hose is a suggestion. Your room is now a sauna.",
    category: "Appliances",
    askingPrice: 550,
    reserveFraction: 0.35,
    imageHint: "ac-unit",
  },
  {
    name: "Turntable (Plays Everything Backwards)",
    description: "Vinyl purists hate this one trick. Satanic messages may vary.",
    category: "Electronics",
    askingPrice: 425,
    reserveFraction: 0.4,
    imageHint: "turntable",
  },
  {
    name: "Electric Blanket (One Temperature: Inferno)",
    description: "Setting 1 is broil. There is no setting 2.",
    category: "Home & Garden",
    askingPrice: 80,
    reserveFraction: 0.55,
    imageHint: "e-blanket",
  },
  {
    name: "Skateboard Ramp (Ambition-Sized)",
    description: "12 feet tall. You are 5'8\". This will end well.",
    category: "Sporting Goods",
    askingPrice: 600,
    reserveFraction: 0.4,
    imageHint: "ramp",
  },
  {
    name: "Taxidermied Pigeon",
    description: "Majestic. Unsettling. Conversation-starting. All three at once.",
    category: "Collectibles",
    askingPrice: 275,
    reserveFraction: 0.45,
    imageHint: "pigeon",
  },
  {
    name: "Robot Vacuum (Goes Rogue)",
    description: "Escaped twice. Found at neighbor's house both times.",
    category: "Appliances",
    askingPrice: 500,
    reserveFraction: 0.4,
    imageHint: "vacuum",
  },
  {
    name: "Neon Sign (Says 'OPEN' — For Your Bedroom)",
    description: "Business is booming. Or your spouse is confused.",
    category: "Home & Garden",
    askingPrice: 150,
    reserveFraction: 0.55,
    imageHint: "neon",
  },
  {
    name: "Punching Bag (Punches Back)",
    description: "Spring-loaded counterweight. Not a defect. A feature.",
    category: "Fitness",
    askingPrice: 280,
    reserveFraction: 0.45,
    imageHint: "punching-bag",
  },
  {
    name: "Watering Can (Leaks From Every Surface)",
    description: "Innovative 360-degree watering technology. Patent pending.",
    category: "Home & Garden",
    askingPrice: 20,
    reserveFraction: 0.7,
    imageHint: "watering-can",
  },
  {
    name: "Bidet Attachment (Pressure Washer Mode)",
    description: "One setting. That setting is 'orbital launch.'",
    category: "Home & Garden",
    askingPrice: 340,
    reserveFraction: 0.4,
    imageHint: "bidet",
  },
  {
    name: "Bean Bag Toss Set (Bags Filled With Actual Beans)",
    description: "Sprouting has begun. This is now a garden game. Literally.",
    category: "Games & Toys",
    askingPrice: 65,
    reserveFraction: 0.55,
    imageHint: "cornhole",
  },
  {
    name: "Vintage Toaster Oven (Cooks Unevenly on Purpose)",
    description: "One side golden, one side frozen. Chaos in every bite.",
    category: "Appliances",
    askingPrice: 110,
    reserveFraction: 0.5,
    imageHint: "toaster-oven",
  },
  {
    name: "Walkie-Talkies (Same Channel as Airport)",
    description: "Accidentally guided two planes last Tuesday.",
    category: "Electronics",
    askingPrice: 55,
    reserveFraction: 0.55,
    imageHint: "walkie",
  },
  {
    name: "Electric Fireplace (Alarmingly Realistic)",
    description: "Neighbors called 911 twice. Firefighters gave it 5 stars.",
    category: "Home & Garden",
    askingPrice: 700,
    reserveFraction: 0.45,
    imageHint: "fireplace",
  },
  {
    name: "Selfie Stick (10 Feet Long)",
    description: "For when you need to be in the photo from across the street.",
    category: "Electronics",
    askingPrice: 40,
    reserveFraction: 0.6,
    imageHint: "selfie-stick",
  },
  {
    name: "Inflatable Dinosaur Costume",
    description: "Perfect for job interviews, grocery runs, and first dates.",
    category: "Clothing & Accessories",
    askingPrice: 75,
    reserveFraction: 0.6,
    imageHint: "dino",
  },
  {
    name: "Miniature Horse Saddle (No Miniature Horse)",
    description: "Fits large dogs. They won't cooperate, but it fits.",
    category: "Pet Supplies",
    askingPrice: 190,
    reserveFraction: 0.45,
    imageHint: "saddle",
  },
  {
    name: "Leaf Blower (Hurricane Setting)",
    description: "Moved leaves, lawn chairs, and a small child.",
    category: "Outdoor Power",
    askingPrice: 350,
    reserveFraction: 0.45,
    imageHint: "leaf-blower",
  },
  {
    name: "Grow Light (Neighbors Are Suspicious)",
    description: "For tomatoes. JUST tomatoes. Stop asking.",
    category: "Home & Garden",
    askingPrice: 275,
    reserveFraction: 0.5,
    imageHint: "grow-light",
  },
  {
    name: "Parking Meter (Functional, Stolen? No.)",
    description: "Found it. In a field. Accepts quarters. Ask no questions.",
    category: "Collectibles",
    askingPrice: 500,
    reserveFraction: 0.35,
    imageHint: "meter",
  },
  {
    name: "Typewriter Keyboard for Computer",
    description: "Clack clack clack. Coworkers will love you. Or not.",
    category: "Electronics",
    askingPrice: 220,
    reserveFraction: 0.5,
    imageHint: "keyboard",
  },
  {
    name: "Lawn Mower (Self-Propelled Into the Hedge)",
    description: "Goes forward aggressively. Steering is optional.",
    category: "Outdoor Power",
    askingPrice: 450,
    reserveFraction: 0.4,
    imageHint: "mower",
  },
  {
    name: "Night Vision Goggles (Everything Is Green)",
    description: "See in the dark! But only in one color. And it's green.",
    category: "Electronics",
    askingPrice: 1200,
    reserveFraction: 0.35,
    imageHint: "goggles",
  },
  {
    name: "Rocking Chair (Rocks Aggressively)",
    description: "Goes 0 to 60 in one lean. Seatbelt recommended.",
    category: "Furniture",
    askingPrice: 450,
    reserveFraction: 0.4,
    imageHint: "rocking-chair",
  },
  {
    name: "Talking Bathroom Scale",
    description: "Announces your weight. Out loud. In kilograms. Judgmentally.",
    category: "Health & Beauty",
    askingPrice: 65,
    reserveFraction: 0.55,
    imageHint: "scale",
  },
  {
    name: "Ceiling-Mounted Disco Toilet",
    description: "For the person who has everything. And questionable taste.",
    category: "Home & Garden",
    askingPrice: 4500,
    reserveFraction: 0.3,
    imageHint: "disco-toilet",
  },
  {
    name: "Hedge Trimmer (Artistic Mode)",
    description: "Can't do straight lines. Excels at abstract topiary.",
    category: "Outdoor Power",
    askingPrice: 200,
    reserveFraction: 0.45,
    imageHint: "trimmer",
  },
  {
    name: "Portable Pizza Oven (Melts Everything Nearby)",
    description: "900 degrees. Pizza in 60 seconds. Countertop in 90.",
    category: "Outdoor Cooking",
    askingPrice: 600,
    reserveFraction: 0.45,
    imageHint: "pizza-oven",
  },
  {
    name: "Electric Guitar (No Amp, No Strings)",
    description: "Air guitar with extra steps. Imagine the solos.",
    category: "Musical Instruments",
    askingPrice: 350,
    reserveFraction: 0.35,
    imageHint: "e-guitar",
  },
  {
    name: "Massage Chair (Aggressive Setting Only)",
    description: "Relaxation through violence. Your chiropractor will hear about this.",
    category: "Furniture",
    askingPrice: 2800,
    reserveFraction: 0.3,
    imageHint: "massage-chair",
  },
  {
    name: "Wireless Doorbell (Random Schedule)",
    description: "Rings when nobody is there. Ghosts? Or bad wiring? Yes.",
    category: "Home & Garden",
    askingPrice: 45,
    reserveFraction: 0.6,
    imageHint: "doorbell",
  },
  {
    name: "RC Car (Faster Than Your Actual Car)",
    description: "Clocked at 87 mph. The cat is still processing.",
    category: "Toys & Games",
    askingPrice: 380,
    reserveFraction: 0.45,
    imageHint: "rc-car",
  },
  {
    name: "Ice Cream Maker (Makes Soup)",
    description: "Temperature control is a journey, not a destination.",
    category: "Appliances",
    askingPrice: 130,
    reserveFraction: 0.45,
    imageHint: "ice-cream",
  },
  {
    name: "Bonsai Tree (Overgrown, Now Regular Tree)",
    description: "Neglected for 3 years. It adapted. Bring a truck.",
    category: "Plants & Garden",
    askingPrice: 90,
    reserveFraction: 0.55,
    imageHint: "bonsai",
  },
  {
    name: "Life-Size Chess Set (Missing the Queen)",
    description: "Drama at the chess club. Don't ask about the queen.",
    category: "Games & Toys",
    askingPrice: 5000,
    reserveFraction: 0.3,
    imageHint: "chess",
  },
  {
    name: "Smart Fridge (Orders Food Without Permission)",
    description: "Bought 47 yogurts last Tuesday. Credit card is crying.",
    category: "Appliances",
    askingPrice: 3200,
    reserveFraction: 0.35,
    imageHint: "smart-fridge",
  },
  {
    name: "Fire Pit (Previously a Washing Machine)",
    description: "Upcycled. Industrial chic. Smells faintly of detergent.",
    category: "Outdoor",
    askingPrice: 200,
    reserveFraction: 0.5,
    imageHint: "fire-pit",
  },
  {
    name: "Skateboard Helmet (Sticker Collection Included)",
    description: "87 stickers. Zero crashes. The stickers did their job.",
    category: "Sporting Goods",
    askingPrice: 55,
    reserveFraction: 0.55,
    imageHint: "helmet",
  },
  {
    name: "Vintage Popcorn Machine",
    description: "Movie theater smell. Movie theater butter stains. Movie theater regret.",
    category: "Appliances",
    askingPrice: 425,
    reserveFraction: 0.45,
    imageHint: "popcorn",
  },
  {
    name: "Electric Kettle (Screams Instead of Whistles)",
    description: "You'll know when it's ready. So will the whole block.",
    category: "Appliances",
    askingPrice: 40,
    reserveFraction: 0.6,
    imageHint: "kettle",
  },
  {
    name: "Mini Fridge (Louder Than a Motorcycle)",
    description: "Keeps drinks cold and roommates awake.",
    category: "Appliances",
    askingPrice: 175,
    reserveFraction: 0.45,
    imageHint: "mini-fridge",
  },
  {
    name: "Ping Pong Table (Warped Like a Half-Pipe)",
    description: "Advanced difficulty mode. Balls do tricks by themselves.",
    category: "Sporting Goods",
    askingPrice: 650,
    reserveFraction: 0.35,
    imageHint: "ping-pong",
  },
  {
    name: "Dashboard Hula Dancer (Haunted Edition)",
    description: "Dances when the car is off. In the garage. At night.",
    category: "Collectibles",
    askingPrice: 25,
    reserveFraction: 0.7,
    imageHint: "hula",
  },
  {
    name: "Foot Massager (Tickle Mode Only)",
    description: "Relaxation was the goal. Uncontrollable laughter was the result.",
    category: "Health & Beauty",
    askingPrice: 140,
    reserveFraction: 0.5,
    imageHint: "foot-massager",
  },
  {
    name: "WiFi Extender (Makes WiFi Worse)",
    description: "Now you have two networks. Both are terrible.",
    category: "Electronics",
    askingPrice: 90,
    reserveFraction: 0.45,
    imageHint: "wifi",
  },
  {
    name: "Vintage Rotary Pay Phone",
    description: "Accepts quarters. Calls nowhere. Great bathroom decor.",
    category: "Collectibles",
    askingPrice: 325,
    reserveFraction: 0.45,
    imageHint: "pay-phone",
  },
  {
    name: "Tiki Torch Set (Sets Ambiance and Occasionally Fences)",
    description: "Mood lighting with a side of property damage.",
    category: "Outdoor",
    askingPrice: 60,
    reserveFraction: 0.6,
    imageHint: "tiki",
  },
  {
    name: "Personal Submarine (Bathtub-Sized)",
    description: "Submerges 6 inches. Captain's hat not included.",
    category: "Vehicles",
    askingPrice: 12000,
    reserveFraction: 0.25,
    imageHint: "submarine",
  },
  {
    name: "Mechanical Bull (Apartment-Friendly)",
    description: "Only goes up to speed 2. Downstairs neighbor says that's enough.",
    category: "Games & Toys",
    askingPrice: 4200,
    reserveFraction: 0.3,
    imageHint: "bull",
  },
  {
    name: "Rain Barrel (Mosquito Condo)",
    description: "Collects water and breeds an entire ecosystem.",
    category: "Home & Garden",
    askingPrice: 80,
    reserveFraction: 0.55,
    imageHint: "barrel",
  },
  {
    name: "Electric Pencil Sharpener (Industrial Strength)",
    description: "Sharpens pencils to a molecular point. Also eats fingers.",
    category: "Office",
    askingPrice: 55,
    reserveFraction: 0.55,
    imageHint: "sharpener",
  },
  {
    name: "Grandfather Clock Parts (Some Assembly Required)",
    description: "Two bags of gears, one pendulum, zero instructions.",
    category: "Home & Garden",
    askingPrice: 900,
    reserveFraction: 0.3,
    imageHint: "gears",
  },
  {
    name: "Camping Stove (One Burner, Maximum Drama)",
    description: "Flames shoot 3 feet. Eyebrows sold separately.",
    category: "Camping",
    askingPrice: 95,
    reserveFraction: 0.5,
    imageHint: "camp-stove",
  },
  {
    name: "Exercise Ball (Slowly Deflating)",
    description: "Starts as a ball, ends as a pancake. Mid-meeting surprise.",
    category: "Fitness",
    askingPrice: 30,
    reserveFraction: 0.65,
    imageHint: "exercise-ball",
  },
];

// ── Per-round tracking ────────────────────────────────────────────────────────

interface BidEntry {
  playerId: string;
  playerName: string;
  amount: number;
  timestamp: number;
}

interface RoundData {
  item: MarketItem;
  reserve: number;
  bids: Map<string, BidEntry>;
  biddingStartedAt: number;
}

// ── Funny Messages per-round tracking ─────────────────────────────────────────

interface FmItem {
  name: string;
  description: string;
  category: string;
  askingPrice: number;
  imageHint: string;
}

interface FmEntry {
  playerId: string;
  playerName: string;
  itemIndex: number;
  item: FmItem;
  message: string;
}

interface FmRoundData {
  /** Items available for this round's selection. */
  itemPool: FmItem[];
  /** Which item each player picked (playerId → itemIndex). */
  picks: Map<string, number>;
  /** Submitted messages per player. */
  entries: Map<string, FmEntry>;
  /** Votes: voterId → targetId. */
  votes: Map<string, string>;
  /** Resolve function to unblock voting wait. */
  votingResolve: (() => void) | null;
  /** Timestamp when the combined browse+write phase started. */
  browseWriteStartedAt: number;
}

// ── Game class ────────────────────────────────────────────────────────────────

export default class LowballMarketplaceGame extends BaseGame {
  static override requiresTV = false;
  static override supportsBracket = false;
  static override defaultRoundCount = 5;
  static override minRounds = 3;
  static override maxRounds = 10;
  static override hasInstructionsPhase = true;
  static override instructionsDelivery = "broadcast" as const;

  static override activityLevel: "none" | "some" | "full" = "none";
  static override requiresSameRoom = false;
  static override requiresSecondaryDisplay = false;

  private roundData: RoundData | null = null;
  private fmRoundData: FmRoundData | null = null;
  /** Items already used this session to avoid repeats. */
  private usedItemIndices: Set<number> = new Set();

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  protected override async onLoad(): Promise<void> {
    for (const p of this.room.state.players.values()) {
      p.score = 0;
      p.isReady = false;
      p.isEliminated = false;
    }
  }

  private _isFunnyMessagesMode(): boolean {
    return this.room.state.gameConfig.gameMode === "funny_messages";
  }

  protected override async runRound(round: number): Promise<void> {
    if (this._isFunnyMessagesMode()) {
      await this._runFunnyMessagesRound(round);
    } else {
      await this._runClassicRound(round);
    }
  }

  protected override scoreRound(round: number): void {
    if (this._isFunnyMessagesMode()) {
      this._scoreFunnyMessagesRound();
    } else {
      this._scoreClassicRound();
    }
  }

  override handleInput(client: Client, data: unknown): void {
    const input = data as {
      action?: string;
      amount?: number;
      itemIndex?: number;
      message?: string;
      targetId?: string;
    };
    if (!input || !input.action) return;

    switch (input.action) {
      case "place_bid":
        this._handleBid(client, input.amount);
        break;
      case "fm_pick_item":
        this._handleFmPick(client, input.itemIndex);
        break;
      case "fm_submit_message":
        this._handleFmMessage(client, input.message);
        break;
      case "fm_vote":
        this._handleFmVote(client, input.targetId);
        break;
    }
  }

  override teardown(): void {
    super.teardown();
    this.roundData = null;
    if (this.fmRoundData?.votingResolve) {
      this.fmRoundData.votingResolve();
    }
    this.fmRoundData = null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODE 1: CLASSIC BIDDING
  // ═══════════════════════════════════════════════════════════════════════════

  private async _runClassicRound(_round: number): Promise<void> {
    const players = this._activePlayers();
    if (players.length < 2) {
      this.broadcast("round_skipped", { reason: "Need at least 2 players" });
      return;
    }

    // Pick a random unused item
    const item = this._pickItem();
    const characteristics = getCharacteristics(item);
    const reserve = computeReserve(item);

    this.roundData = {
      item,
      reserve,
      bids: new Map(),
      biddingStartedAt: Date.now(),
    };

    // Reset ready flags
    for (const p of this.room.state.players.values()) {
      p.isReady = false;
    }

    // Phase 1: Show listing + accept bids
    this.broadcast("item_listing", {
      item: {
        name: item.name,
        description: item.description,
        category: item.category,
        imageHint: item.imageHint,
      },
      askingPrice: item.askingPrice,
      characteristics: characteristics.map((c) => ({
        label: c.label,
        value: c.value,
        // Don't send the raw multiplier — players must reason about it
      })),
      durationMs: BIDDING_DURATION_MS,
      serverTimestamp: Date.now(),
    });

    // Wait for all bids or timeout
    await this._waitForAllBidsOrTimeout(BIDDING_DURATION_MS + 2000);

    // Phase 2: Reveal — show bids sorted, then reveal reserve
    const bids = [...this.roundData.bids.values()].sort((a, b) => {
      if (a.amount !== b.amount) return a.amount - b.amount; // lowest first
      return a.timestamp - b.timestamp; // earlier first for ties
    });

    this.broadcast("reveal_start", {
      item: {
        name: item.name,
        description: item.description,
        category: item.category,
        imageHint: item.imageHint,
      },
      askingPrice: item.askingPrice,
      reserve,
      bids: bids.map((b) => ({
        playerId: b.playerId,
        playerName: b.playerName,
        amount: b.amount,
      })),
      serverTimestamp: Date.now(),
    });

    await this.delay(REVEAL_DURATION_MS);

    // Phase 3: Results
    const results = this._computeClassicResults();
    this.broadcast("round_result", results);
    await this.delay(RESULTS_DISPLAY_MS);
  }

  private _scoreClassicRound(): void {
    if (!this.roundData) return;
    const results = this._computeClassicResults();
    for (const [playerId, points] of Object.entries(results.scores)) {
      const player = this.room.state.players.get(playerId);
      if (player) {
        player.score += points;
      }
    }
  }

  // ── Classic input handlers ────────────────────────────────────────────────

  private _handleBid(client: Client, amount?: number): void {
    if (!this.roundData || amount == null) return;
    const player = this.room.state.players.get(client.sessionId);
    if (!player) return;

    // Already bid
    if (this.roundData.bids.has(client.sessionId)) return;

    // Bid must be positive and not exceed asking price
    const bid = Math.round(amount);
    if (bid < 1 || bid > this.roundData.item.askingPrice) return;

    this.roundData.bids.set(client.sessionId, {
      playerId: client.sessionId,
      playerName: player.name,
      amount: bid,
      timestamp: Date.now(),
    });
    player.isReady = true;

    this.send(client.sessionId, "bid_confirmed", { amount: bid });

    this.broadcast("bid_count_update", {
      bidsIn: this.roundData.bids.size,
      totalBidders: this._activePlayers().length,
    });
  }

  // ── Classic helpers ───────────────────────────────────────────────────────

  private async _waitForAllBidsOrTimeout(timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const check = setInterval(() => {
        const active = this._activePlayers();
        const allBid = active.every((p) => this.roundData?.bids.has(p.id));
        if (allBid) {
          clearInterval(check);
          resolve();
        }
      }, 300);
      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, timeoutMs);
    });
  }

  private _computeClassicResults(): {
    item: { name: string; category: string; description: string; askingPrice: number; imageHint: string };
    reserve: number;
    rankings: {
      playerId: string;
      playerName: string;
      amount: number;
      accepted: boolean;
      rank: number;
      pointsEarned: number;
    }[];
    scores: Record<string, number>;
  } {
    if (!this.roundData) {
      return { item: { name: "", category: "", description: "", askingPrice: 0, imageHint: "" }, reserve: 0, rankings: [], scores: {} };
    }

    const reserve = this.roundData.reserve;

    // Sort bids: lowest first, ties broken by timestamp
    const sortedBids = [...this.roundData.bids.values()].sort((a, b) => {
      if (a.amount !== b.amount) return a.amount - b.amount;
      return a.timestamp - b.timestamp;
    });

    // Separate accepted (>= reserve) and rejected (< reserve)
    const accepted = sortedBids.filter((b) => b.amount >= reserve);
    const rejected = sortedBids.filter((b) => b.amount < reserve);

    const scores: Record<string, number> = {};
    const rankings: {
      playerId: string;
      playerName: string;
      amount: number;
      accepted: boolean;
      rank: number;
      pointsEarned: number;
    }[] = [];

    // Score accepted bids
    accepted.forEach((bid, i) => {
      let points = PARTICIPATION_POINTS;
      if (i === 0) points += WINNER_BONUS;
      else if (i === 1) points += SECOND_BONUS;
      else if (i === 2) points += THIRD_BONUS;

      // Close shave bonus: within 10% of reserve
      const threshold = reserve * 1.1;
      if (bid.amount <= threshold) {
        points += CLOSE_SHAVE_BONUS;
      }

      scores[bid.playerId] = points;
      rankings.push({
        playerId: bid.playerId,
        playerName: bid.playerName,
        amount: bid.amount,
        accepted: true,
        rank: i + 1,
        pointsEarned: points,
      });
    });

    // Rejected bids get 0
    rejected.forEach((bid) => {
      scores[bid.playerId] = 0;
      rankings.push({
        playerId: bid.playerId,
        playerName: bid.playerName,
        amount: bid.amount,
        accepted: false,
        rank: 0,
        pointsEarned: 0,
      });
    });

    // Non-bidders get 0
    for (const p of this._activePlayers()) {
      if (!(p.id in scores)) {
        scores[p.id] = 0;
      }
    }

    return {
      item: {
        name: this.roundData.item.name,
        category: this.roundData.item.category,
        description: this.roundData.item.description,
        askingPrice: this.roundData.item.askingPrice,
        imageHint: this.roundData.item.imageHint,
      },
      reserve,
      rankings,
      scores,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODE 2: FUNNY MESSAGES
  // ═══════════════════════════════════════════════════════════════════════════

  private async _runFunnyMessagesRound(_round: number): Promise<void> {
    const players = this._activePlayers();
    if (players.length < 2) {
      this.broadcast("round_skipped", { reason: "Need at least 2 players" });
      return;
    }

    // Pick items for this round
    const itemPool: FmItem[] = [];
    for (let i = 0; i < FM_ITEMS_PER_ROUND; i++) {
      const mi = this._pickItem();
      itemPool.push({
        name: mi.name,
        description: mi.description,
        category: mi.category,
        askingPrice: mi.askingPrice,
        imageHint: mi.imageHint,
      });
    }

    const browseWriteStartedAt = Date.now();

    this.fmRoundData = {
      itemPool,
      picks: new Map(),
      entries: new Map(),
      votes: new Map(),
      votingResolve: null,
      browseWriteStartedAt,
    };

    // Reset ready flags
    for (const p of this.room.state.players.values()) {
      p.isReady = false;
    }

    // ── Combined Browse & Write Phase ───────────────────────────
    // One shared timer for both browsing and writing.
    // When a player picks an item, they immediately receive fm_write_start
    // and can start writing while others are still browsing.

    this.broadcast("fm_browse_start", {
      items: itemPool,
      durationMs: FM_BROWSE_WRITE_DURATION_MS,
      serverTimestamp: browseWriteStartedAt,
    });

    // Wait for all messages to be submitted OR timeout
    await this._waitForConditionOrTimeout(
      () => {
        const active = this._activePlayers();
        return active.every((p) => this.fmRoundData?.entries.has(p.id));
      },
      FM_BROWSE_WRITE_DURATION_MS + 2000,
    );

    // Auto-assign random item + blank message for non-submitters
    const rd = this.fmRoundData;
    if (!rd) return;

    for (const p of this._activePlayers()) {
      if (!rd.picks.has(p.id)) {
        rd.picks.set(p.id, Math.floor(Math.random() * itemPool.length));
      }
      if (!rd.entries.has(p.id)) {
        const itemIndex = rd.picks.get(p.id) ?? 0;
        const selectedItem = itemPool[itemIndex];
        rd.entries.set(p.id, {
          playerId: p.id,
          playerName: p.name,
          itemIndex,
          item: selectedItem,
          message: "(no message submitted)",
        });
      }
    }

    // ── Phase 3: Reveal Messages ────────────────────────────────────
    const entries = [...rd.entries.values()];
    // Shuffle reveal order
    for (let i = entries.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [entries[i], entries[j]] = [entries[j], entries[i]];
    }

    for (const entry of entries) {
      this.broadcast("fm_reveal_entry", {
        playerId: entry.playerId,
        playerName: entry.playerName,
        item: entry.item,
        message: entry.message,
      });
      await this.delay(FM_REVEAL_ENTRY_MS);
    }
    this.broadcast("fm_reveal_done", {});

    // ── Phase 4: Voting ─────────────────────────────────────────────
    if (entries.length >= 2) {
      this.broadcast("fm_voting_start", {
        durationMs: FM_VOTING_DURATION_MS,
        serverTimestamp: Date.now(),
        entries: entries.map((e) => ({
          playerId: e.playerId,
          playerName: e.playerName,
        })),
      });

      await this._waitForConditionOrTimeout(
        () => {
          const active = this._activePlayers();
          return active.every((p) => this.fmRoundData?.votes.has(p.id));
        },
        FM_VOTING_DURATION_MS + 2000,
      );
    }

    // ── Phase 5: Results ────────────────────────────────────────────
    const results = this._computeFmResults();
    this.broadcast("fm_result", results);
    await this.delay(FM_RESULTS_DISPLAY_MS);
  }

  private _scoreFunnyMessagesRound(): void {
    if (!this.fmRoundData) return;
    const results = this._computeFmResults();
    for (const [playerId, points] of Object.entries(results.scores)) {
      const player = this.room.state.players.get(playerId);
      if (player) {
        player.score += points;
      }
    }
  }

  // ── FM input handlers ─────────────────────────────────────────────────────

  private _handleFmPick(client: Client, itemIndex?: number): void {
    if (!this.fmRoundData || itemIndex == null) return;
    const player = this.room.state.players.get(client.sessionId);
    if (!player) return;

    if (itemIndex < 0 || itemIndex >= this.fmRoundData.itemPool.length) return;

    // Already submitted a message — can't re-pick
    if (this.fmRoundData.entries.has(client.sessionId)) return;

    // Allow re-picking (overwrite previous pick)
    this.fmRoundData.picks.set(client.sessionId, itemIndex);

    const selectedItem = this.fmRoundData.itemPool[itemIndex];
    const elapsed = Date.now() - this.fmRoundData.browseWriteStartedAt;
    const remainingMs = Math.max(0, FM_BROWSE_WRITE_DURATION_MS - elapsed);

    this.send(client.sessionId, "fm_pick_confirmed", { itemIndex });

    // Immediately send write start to this player with remaining time
    this.send(client.sessionId, "fm_write_start", {
      item: selectedItem,
      itemIndex,
      durationMs: remainingMs,
      serverTimestamp: Date.now(),
    });

    this.broadcast("fm_pick_update", {
      picksIn: this.fmRoundData.picks.size,
      totalPickers: this._activePlayers().length,
    });

    // Broadcast player status for TV dashboard
    this.broadcast("fm_player_status", {
      playerId: client.sessionId,
      playerName: player.name,
      status: "writing",
    });
  }

  private _handleFmMessage(client: Client, message?: string): void {
    if (!this.fmRoundData || !message) return;
    const player = this.room.state.players.get(client.sessionId);
    if (!player) return;

    // Already submitted
    if (this.fmRoundData.entries.has(client.sessionId)) return;

    // Must have picked first
    if (!this.fmRoundData.picks.has(client.sessionId)) return;

    // Trim and cap length
    const trimmed = message.trim().slice(0, 200);
    if (!trimmed) return;

    const itemIndex = this.fmRoundData.picks.get(client.sessionId) ?? 0;
    const selectedItem = this.fmRoundData.itemPool[itemIndex];

    this.fmRoundData.entries.set(client.sessionId, {
      playerId: client.sessionId,
      playerName: player.name,
      itemIndex,
      item: selectedItem,
      message: trimmed,
    });

    this.send(client.sessionId, "fm_write_confirmed", {});

    this.broadcast("fm_write_update", {
      writtenIn: this.fmRoundData.entries.size,
      totalWriters: this._activePlayers().length,
    });

    // Broadcast player status for TV dashboard
    this.broadcast("fm_player_status", {
      playerId: client.sessionId,
      playerName: player.name,
      status: "submitted",
    });
  }

  private _handleFmVote(client: Client, targetId?: string): void {
    if (!this.fmRoundData || !targetId) return;
    if (targetId === client.sessionId) return; // can't vote for self
    if (this.fmRoundData.votes.has(client.sessionId)) return; // already voted
    if (!this.fmRoundData.entries.has(targetId)) return; // target must exist

    this.fmRoundData.votes.set(client.sessionId, targetId);
    this.send(client.sessionId, "fm_vote_confirmed", { targetId });

    this.broadcast("fm_vote_update", {
      votesIn: this.fmRoundData.votes.size,
      totalVoters: this._activePlayers().length,
    });
  }

  // ── FM scoring ────────────────────────────────────────────────────────────

  private _computeFmResults(): {
    winner: string | null;
    scores: Record<string, number>;
    entries: {
      playerId: string;
      playerName: string;
      itemName: string;
      itemDescription: string;
      itemCategory: string;
      message: string;
      voteCount: number;
    }[];
  } {
    if (!this.fmRoundData) {
      return { winner: null, scores: {}, entries: [] };
    }

    const voteCounts = new Map<string, number>();
    for (const targetId of this.fmRoundData.votes.values()) {
      voteCounts.set(targetId, (voteCounts.get(targetId) ?? 0) + 1);
    }

    const scores: Record<string, number> = {};
    let maxVotes = 0;
    let winner: string | null = null;

    const entries = [...this.fmRoundData.entries.values()].map((e) => {
      const vc = voteCounts.get(e.playerId) ?? 0;
      scores[e.playerId] = FM_PARTICIPATION_POINTS + vc * FM_POINTS_PER_VOTE;
      if (vc > maxVotes) {
        maxVotes = vc;
        winner = e.playerId;
      }
      return {
        playerId: e.playerId,
        playerName: e.playerName,
        itemName: e.item.name,
        itemDescription: e.item.description,
        itemCategory: e.item.category,
        message: e.message,
        voteCount: vc,
      };
    });

    // Winner bonus
    if (winner && maxVotes > 0) {
      scores[winner] += FM_WINNER_BONUS;
    }

    // Non-submitters get 0
    for (const p of this._activePlayers()) {
      if (!(p.id in scores)) {
        scores[p.id] = 0;
      }
    }

    return { winner, scores, entries };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SHARED HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private _activePlayers() {
    return [...this.room.state.players.values()].filter(
      (p) => p.isConnected && !p.isEliminated,
    );
  }

  private _pickItem(): MarketItem {
    const available = ITEM_CATALOGUE.map((item, i) => ({ item, i })).filter(
      ({ i }) => !this.usedItemIndices.has(i),
    );

    // If we've used all items, reset
    if (available.length === 0) {
      this.usedItemIndices.clear();
      return this._pickItem();
    }

    const pick = available[Math.floor(Math.random() * available.length)];
    this.usedItemIndices.add(pick.i);
    return pick.item;
  }

  private async _waitForConditionOrTimeout(
    condition: () => boolean,
    timeoutMs: number,
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      if (condition()) { resolve(); return; }
      const check = setInterval(() => {
        if (condition()) {
          clearInterval(check);
          resolve();
        }
      }, 300);
      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, timeoutMs);
    });
  }
}
