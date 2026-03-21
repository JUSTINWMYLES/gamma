<script lang="ts">
  /**
   * Phone game component for "Lowball Marketplace" (registry-25).
   *
   * Sub-phases during `in_round`:
   *   waiting → bidding → bid_placed → reveal → results
   *
   * Server messages listened:
   *   item_listing, bid_confirmed, bid_count_update,
   *   reveal_start, round_result, round_skipped
   */
  import { onMount, onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState, PlayerState } from "../../../../shared/types";

  export let room: Room;
  export let state: RoomState;
  export let me: PlayerState | undefined;

  // ── Sub-phase state ──────────────────────────────────────────────

  type SubPhase = "waiting" | "bidding" | "bid_placed" | "reveal" | "results";
  let subPhase: SubPhase = "waiting";

  // ── Bidding phase ────────────────────────────────────────────────

  interface ItemInfo {
    name: string;
    description: string;
    category: string;
    imageHint: string;
  }

  let item: ItemInfo | null = null;
  let askingPrice = 0;
  let biddingTimeLeft = 0;
  let biddingEndTime = 0;
  let biddingTimer: ReturnType<typeof setInterval> | null = null;

  let bidAmount = 0;
  let bidConfirmed = false;
  let confirmedBidAmount = 0;
  let bidsIn = 0;
  let totalBidders = 0;

  // Bid input — slider value
  let sliderValue = 50; // percentage of asking price

  // ── Reveal phase ─────────────────────────────────────────────────

  let revealReserve = 0;
  let revealBids: { playerId: string; playerName: string; amount: number }[] = [];

  // ── Results ──────────────────────────────────────────────────────

  let rankings: {
    playerId: string;
    playerName: string;
    amount: number;
    accepted: boolean;
    rank: number;
    pointsEarned: number;
  }[] = [];
  let resultScores: Record<string, number> = {};
  let resultReserve = 0;

  // Round skipped
  let roundSkipped = false;
  let skipReason = "";

  // ── Helpers ──────────────────────────────────────────────────────

  function clearAllTimers() {
    if (biddingTimer) { clearInterval(biddingTimer); biddingTimer = null; }
  }

  function formatPrice(n: number): string {
    return "$" + n.toLocaleString();
  }

  function placeBid() {
    if (bidConfirmed || !item) return;
    const amount = Math.round((sliderValue / 100) * askingPrice);
    if (amount < 1) return;
    bidAmount = amount;
    room.send("game_input", { action: "place_bid", amount });
  }

  // ── Message handlers ─────────────────────────────────────────────

  function onItemListing(data: {
    item: ItemInfo;
    askingPrice: number;
    durationMs: number;
    serverTimestamp: number;
  }) {
    subPhase = "bidding";
    item = data.item;
    askingPrice = data.askingPrice;
    bidConfirmed = false;
    bidAmount = 0;
    sliderValue = 50;
    bidsIn = 0;

    biddingEndTime = data.serverTimestamp + data.durationMs;
    biddingTimeLeft = Math.max(0, (biddingEndTime - Date.now()) / 1000);

    clearAllTimers();
    biddingTimer = setInterval(() => {
      biddingTimeLeft = Math.max(0, (biddingEndTime - Date.now()) / 1000);
    }, 200);
  }

  function onBidConfirmed(data: { amount: number }) {
    bidConfirmed = true;
    confirmedBidAmount = data.amount;
    subPhase = "bid_placed";
  }

  function onBidCountUpdate(data: { bidsIn: number; totalBidders: number }) {
    bidsIn = data.bidsIn;
    totalBidders = data.totalBidders;
  }

  function onRevealStart(data: {
    item: ItemInfo;
    askingPrice: number;
    reserve: number;
    bids: { playerId: string; playerName: string; amount: number }[];
    serverTimestamp: number;
  }) {
    subPhase = "reveal";
    clearAllTimers();
    revealReserve = data.reserve;
    revealBids = data.bids;
  }

  function onRoundResult(data: {
    item: { name: string; category: string };
    reserve: number;
    rankings: typeof rankings;
    scores: Record<string, number>;
  }) {
    subPhase = "results";
    clearAllTimers();
    rankings = data.rankings;
    resultScores = data.scores;
    resultReserve = data.reserve;
  }

  function onRoundSkipped(data: { reason: string }) {
    roundSkipped = true;
    skipReason = data.reason;
  }

  // ── Lifecycle ────────────────────────────────────────────────────

  onMount(() => {
    room.onMessage("item_listing", onItemListing);
    room.onMessage("bid_confirmed", onBidConfirmed);
    room.onMessage("bid_count_update", onBidCountUpdate);
    room.onMessage("reveal_start", onRevealStart);
    room.onMessage("round_result", onRoundResult);
    room.onMessage("round_skipped", onRoundSkipped);
  });

  onDestroy(() => {
    clearAllTimers();
  });

  // Derived
  $: myScore = resultScores[me?.id ?? ""] ?? 0;
  $: myRanking = rankings.find((r) => r.playerId === me?.id);
  $: computedBidAmount = Math.round((sliderValue / 100) * askingPrice);
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-6 p-6" data-testid="lowball-marketplace">

  {#if roundSkipped}
    <div class="text-center space-y-3">
      <h2 class="text-xl font-black text-yellow-400">Round Skipped</h2>
      <p class="text-gray-300">{skipReason}</p>
    </div>

  {:else if subPhase === "waiting"}
    <div class="text-center space-y-3">
      <p class="text-gray-400">Browsing the marketplace...</p>
      <p class="text-xs text-gray-500">A new item listing is coming up</p>
    </div>

  {:else if subPhase === "bidding"}
    <!-- Bidding UI -->
    <div class="w-full max-w-sm space-y-5">
      {#if item}
        <!-- Item card -->
        <div class="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-2">
          <div class="flex justify-between items-start">
            <div>
              <p class="text-xs text-emerald-400 uppercase tracking-widest">{item.category}</p>
              <h3 class="text-lg font-black text-white mt-1">{item.name}</h3>
            </div>
            <p class="text-2xl font-black text-emerald-400">{formatPrice(askingPrice)}</p>
          </div>
          <p class="text-sm text-gray-400">{item.description}</p>
        </div>

        <!-- Timer -->
        <div class="text-center">
          <p class="text-3xl font-mono font-black {biddingTimeLeft < 5 ? 'text-red-400' : 'text-white'}">
            {Math.ceil(biddingTimeLeft)}s
          </p>
          <p class="text-xs text-gray-500 mt-1">
            {#if bidsIn > 0}
              {bidsIn}/{totalBidders} bids placed
            {:else}
              Make your lowball offer!
            {/if}
          </p>
        </div>

        <!-- Bid slider -->
        <div class="space-y-3">
          <div class="flex justify-between items-baseline">
            <p class="text-sm text-gray-400">Your offer:</p>
            <p class="text-2xl font-black text-white">{formatPrice(computedBidAmount)}</p>
          </div>

          <input
            type="range"
            min="5"
            max="95"
            step="1"
            bind:value={sliderValue}
            class="w-full h-3 bg-gray-700 rounded-full appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-7
              [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-emerald-500 [&::-webkit-slider-thumb]:border-2
              [&::-webkit-slider-thumb]:border-emerald-300 [&::-webkit-slider-thumb]:shadow-lg"
          />

          <div class="flex justify-between text-xs text-gray-500">
            <span>{formatPrice(Math.round(askingPrice * 0.05))}</span>
            <span class="text-emerald-500 font-bold">{sliderValue}% of asking</span>
            <span>{formatPrice(Math.round(askingPrice * 0.95))}</span>
          </div>
        </div>

        <!-- Submit bid -->
        <button
          class="w-full py-4 rounded-xl text-lg font-bold bg-emerald-600 text-white
            active:bg-emerald-500 transition-all active:scale-95"
          on:click={placeBid}
        >
          Offer {formatPrice(computedBidAmount)}
        </button>

        <p class="text-xs text-gray-500 text-center">
          Bid low... but not TOO low, or the seller will reject your offer!
        </p>
      {/if}
    </div>

  {:else if subPhase === "bid_placed"}
    <!-- Waiting after bid -->
    <div class="text-center space-y-4">
      <div class="bg-emerald-900 border border-emerald-600 rounded-xl p-4">
        <p class="text-emerald-200 font-bold">Bid Placed!</p>
        <p class="text-2xl font-black text-emerald-300 mt-2">{formatPrice(confirmedBidAmount)}</p>
      </div>
      <p class="text-gray-400">Waiting for other players...</p>
      {#if bidsIn > 0}
        <p class="text-sm text-gray-500">{bidsIn}/{totalBidders} bids in</p>
      {/if}
    </div>

  {:else if subPhase === "reveal"}
    <!-- Reveal — show bids and reserve on phone too -->
    <div class="w-full max-w-sm space-y-4 text-center">
      <h2 class="text-xl font-black text-emerald-400">The Bids Are In!</h2>
      <p class="text-sm text-gray-400">Watch the TV for the dramatic reveal...</p>

      {#if revealReserve > 0}
        <div class="bg-yellow-900/40 border border-yellow-600 rounded-xl p-3">
          <p class="text-xs text-yellow-400 uppercase tracking-widest">Seller's Minimum</p>
          <p class="text-xl font-black text-yellow-200">{formatPrice(revealReserve)}</p>
        </div>
      {/if}
    </div>

  {:else if subPhase === "results"}
    <!-- Results -->
    <div class="w-full max-w-sm space-y-4 text-center">
      <h2 class="text-xl font-black text-emerald-400">Round Results</h2>

      {#if myRanking}
        <div class="bg-gray-800 rounded-xl p-4">
          <p class="text-xs text-gray-400 uppercase tracking-widest mb-1">Your Bid</p>
          <p class="text-2xl font-black {myRanking.accepted ? 'text-emerald-400' : 'text-red-400'}">
            {formatPrice(myRanking.amount)}
          </p>
          <p class="text-sm mt-1 {myRanking.accepted ? 'text-emerald-300' : 'text-red-300'}">
            {myRanking.accepted
              ? myRanking.rank === 1 ? 'BEST DEAL! Winner!' : `Accepted - Rank #${myRanking.rank}`
              : 'REJECTED - Below reserve'}
          </p>
        </div>
      {/if}

      <div class="bg-gray-800 rounded-xl p-4">
        <p class="text-xs text-gray-400 uppercase tracking-widest mb-1">Points This Round</p>
        <p class="text-3xl font-black {myScore > 0 ? 'text-green-400' : 'text-gray-500'}">
          +{myScore}
        </p>
      </div>

      <div class="bg-gray-800/50 rounded-xl p-3">
        <p class="text-xs text-gray-500">
          Reserve was {formatPrice(resultReserve)}
        </p>
      </div>
    </div>
  {/if}
</div>
