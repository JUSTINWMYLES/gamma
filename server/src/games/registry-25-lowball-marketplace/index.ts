/**
 * server/src/games/registry-25-lowball-marketplace/index.ts
 *
 * "Lowball Marketplace" — a fake online marketplace bidding game.
 *
 * Game Rules
 * ──────────
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
 * Server messages:
 *   → "item_listing"     { item, askingPrice, category, imageHint, durationMs, serverTimestamp }
 *   → "bid_confirmed"    { amount }
 *   → "bid_count_update" { bidsIn, totalBidders }
 *   → "reveal_start"     { item, askingPrice, reserve, bids, serverTimestamp }
 *   → "round_result"     { item, reserve, rankings, scores }
 *   → "round_skipped"    { reason }
 *
 * Client messages:
 *   ← { action: "place_bid", amount: number }
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

  protected override async runRound(_round: number): Promise<void> {
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
    const results = this._computeResults();
    this.broadcast("round_result", results);
    await this.delay(RESULTS_DISPLAY_MS);
  }

  protected override scoreRound(_round: number): void {
    if (!this.roundData) return;
    const results = this._computeResults();
    for (const [playerId, points] of Object.entries(results.scores)) {
      const player = this.room.state.players.get(playerId);
      if (player) {
        player.score += points;
      }
    }
  }

  override handleInput(client: Client, data: unknown): void {
    const input = data as { action?: string; amount?: number };
    if (!input || !input.action) return;

    if (input.action === "place_bid") {
      this._handleBid(client, input.amount);
    }
  }

  override teardown(): void {
    super.teardown();
    this.roundData = null;
  }

  // ── Input handlers ────────────────────────────────────────────────────────

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

  // ── Helpers ───────────────────────────────────────────────────────────────

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

  private _computeResults(): {
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
}
