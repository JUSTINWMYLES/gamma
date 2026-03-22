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
const RESULTS_DISPLAY_MS = 6_000;

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

/** Time to browse items and pick one (ms). */
const FM_BROWSE_DURATION_MS = 25_000;
/** Time to write a message to the seller (ms). */
const FM_WRITE_DURATION_MS = 45_000;
/** Duration each message is shown on TV (ms). */
const FM_REVEAL_ENTRY_MS = 6_000;
/** Voting duration (ms). */
const FM_VOTING_DURATION_MS = 20_000;
/** Results display (ms). */
const FM_RESULTS_DISPLAY_MS = 8_000;
/** Number of items shown per round for selection. */
const FM_ITEMS_PER_ROUND = 16;

/** Points per vote received in funny messages mode. */
const FM_POINTS_PER_VOTE = 50;
/** Winner bonus for funny messages mode. */
const FM_WINNER_BONUS = 100;
/** Participation points for submitting a message. */
const FM_PARTICIPATION_POINTS = 25;

// ── Item catalogue ────────────────────────────────────────────────────────────

interface MarketItem {
  name: string;
  description: string;
  category: string;
  askingPrice: number;
  /** Reserve is a fraction of asking price (0.3–0.7). */
  reserveFraction: number;
  imageHint: string; // CSS class hint for client rendering
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
    const reserve = Math.round(item.askingPrice * item.reserveFraction);

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
    item: { name: string; category: string };
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
      return { item: { name: "", category: "" }, reserve: 0, rankings: [], scores: {} };
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
      item: { name: this.roundData.item.name, category: this.roundData.item.category },
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

    this.fmRoundData = {
      itemPool,
      picks: new Map(),
      entries: new Map(),
      votes: new Map(),
      votingResolve: null,
    };

    // Reset ready flags
    for (const p of this.room.state.players.values()) {
      p.isReady = false;
    }

    // ── Phase 1: Browse & Pick ──────────────────────────────────────────
    this.broadcast("fm_browse_start", {
      items: itemPool,
      durationMs: FM_BROWSE_DURATION_MS,
      serverTimestamp: Date.now(),
    });

    await this._waitForConditionOrTimeout(
      () => {
        const active = this._activePlayers();
        return active.every((p) => this.fmRoundData?.picks.has(p.id));
      },
      FM_BROWSE_DURATION_MS + 2000,
    );

    // Auto-assign random item to non-pickers
    for (const p of this._activePlayers()) {
      if (!this.fmRoundData.picks.has(p.id)) {
        this.fmRoundData.picks.set(
          p.id,
          Math.floor(Math.random() * itemPool.length),
        );
      }
    }

    // ── Phase 2: Write Message ──────────────────────────────────────────
    // Reset ready flags
    for (const p of this.room.state.players.values()) {
      p.isReady = false;
    }

    // Send each player their assigned item to write a message for
    for (const p of this._activePlayers()) {
      const itemIndex = this.fmRoundData.picks.get(p.id) ?? 0;
      const selectedItem = itemPool[itemIndex];
      this.send(p.id, "fm_write_start", {
        item: selectedItem,
        itemIndex,
        durationMs: FM_WRITE_DURATION_MS,
        serverTimestamp: Date.now(),
      });
    }
    // Also broadcast so TV knows writing phase started
    this.broadcast("fm_write_phase", {
      durationMs: FM_WRITE_DURATION_MS,
      serverTimestamp: Date.now(),
    });

    await this._waitForConditionOrTimeout(
      () => {
        const active = this._activePlayers();
        return active.every((p) => this.fmRoundData?.entries.has(p.id));
      },
      FM_WRITE_DURATION_MS + 2000,
    );

    // Auto-submit blank message for non-submitters
    for (const p of this._activePlayers()) {
      if (!this.fmRoundData.entries.has(p.id)) {
        const itemIndex = this.fmRoundData.picks.get(p.id) ?? 0;
        const selectedItem = itemPool[itemIndex];
        this.fmRoundData.entries.set(p.id, {
          playerId: p.id,
          playerName: p.name,
          itemIndex,
          item: selectedItem,
          message: "(no message submitted)",
        });
      }
    }

    // ── Phase 3: Reveal Messages ────────────────────────────────────────
    const entries = [...this.fmRoundData.entries.values()];
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

    // ── Phase 4: Voting ─────────────────────────────────────────────────
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

    // ── Phase 5: Results ────────────────────────────────────────────────
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

    this.fmRoundData.picks.set(client.sessionId, itemIndex);
    player.isReady = true;

    this.send(client.sessionId, "fm_pick_confirmed", { itemIndex });

    this.broadcast("fm_pick_update", {
      picksIn: this.fmRoundData.picks.size,
      totalPickers: this._activePlayers().length,
    });
  }

  private _handleFmMessage(client: Client, message?: string): void {
    if (!this.fmRoundData || !message) return;
    const player = this.room.state.players.get(client.sessionId);
    if (!player) return;

    // Already submitted
    if (this.fmRoundData.entries.has(client.sessionId)) return;

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
