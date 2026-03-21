<script lang="ts">
  /**
   * TV game component for "Lowball Marketplace" (registry-25).
   *
   * Displays the shared-screen view:
   *   - Item listing (fake marketplace ad)
   *   - Bid countdown + anonymous bid progress
   *   - Dramatic reveal: bids shown one by one, then reserve revealed
   *   - Round results with rankings and scores
   *
   * Server messages listened:
   *   item_listing, bid_count_update, reveal_start,
   *   round_result, round_skipped
   */
  import { onMount, onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState } from "../../../../shared/types";

  export let room: Room;
  export let state: RoomState;

  // ── Sub-phase state ──────────────────────────────────────────────

  type SubPhase = "waiting" | "listing" | "reveal" | "results";
  let subPhase: SubPhase = "waiting";

  // ── Listing phase ────────────────────────────────────────────────

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
  let bidsIn = 0;
  let totalBidders = 0;

  // ── Reveal phase ─────────────────────────────────────────────────

  let revealReserve = 0;
  let revealBids: { playerId: string; playerName: string; amount: number }[] = [];
  let revealedCount = 0;
  let reserveRevealed = false;
  let revealInterval: ReturnType<typeof setInterval> | null = null;

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
  let resultItemName = "";

  // Round skipped
  let roundSkipped = false;
  let skipReason = "";

  // ── Image hint emoji map ─────────────────────────────────────────

  const IMAGE_EMOJI: Record<string, string> = {
    "toaster": "🍞", "cactus": "🌵", "guitar": "🎸", "box": "📦",
    "cloak": "🧥", "cart": "🛒", "gravel": "🪨", "gum": "🫧",
    "rock": "🪨", "shoe": "👟", "cloud": "☁️", "modem": "📠",
    "bubble-wrap": "💨", "sunscreen": "🧴", "time-machine": "⏰",
    "volcano": "🌋", "pasta": "🍝", "noodle": "🏊", "map": "🗺️",
    "earmuffs": "🐕",
  };

  // ── Helpers ──────────────────────────────────────────────────────

  function clearAllTimers() {
    if (biddingTimer) { clearInterval(biddingTimer); biddingTimer = null; }
    if (revealInterval) { clearInterval(revealInterval); revealInterval = null; }
  }

  function formatPrice(n: number): string {
    return "$" + n.toLocaleString();
  }

  // ── Message handlers ─────────────────────────────────────────────

  function onItemListing(data: {
    item: ItemInfo;
    askingPrice: number;
    durationMs: number;
    serverTimestamp: number;
  }) {
    subPhase = "listing";
    item = data.item;
    askingPrice = data.askingPrice;
    bidsIn = 0;
    totalBidders = 0;

    biddingEndTime = data.serverTimestamp + data.durationMs;
    biddingTimeLeft = Math.max(0, (biddingEndTime - Date.now()) / 1000);

    clearAllTimers();
    biddingTimer = setInterval(() => {
      biddingTimeLeft = Math.max(0, (biddingEndTime - Date.now()) / 1000);
    }, 100);
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

    item = data.item;
    askingPrice = data.askingPrice;
    revealReserve = data.reserve;
    revealBids = data.bids; // sorted lowest to highest from server
    revealedCount = 0;
    reserveRevealed = false;

    // Animate reveal: show one bid every 800ms, then reserve
    const totalSteps = revealBids.length + 1; // +1 for reserve
    let step = 0;
    revealInterval = setInterval(() => {
      step++;
      if (step <= revealBids.length) {
        revealedCount = step;
      } else {
        reserveRevealed = true;
        if (revealInterval) { clearInterval(revealInterval); revealInterval = null; }
      }
    }, 800);
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
    resultItemName = data.item.name;
  }

  function onRoundSkipped(data: { reason: string }) {
    roundSkipped = true;
    skipReason = data.reason;
  }

  // ── Lifecycle ────────────────────────────────────────────────────

  onMount(() => {
    room.onMessage("item_listing", onItemListing);
    room.onMessage("bid_count_update", onBidCountUpdate);
    room.onMessage("reveal_start", onRevealStart);
    room.onMessage("round_result", onRoundResult);
    room.onMessage("round_skipped", onRoundSkipped);
  });

  onDestroy(() => {
    clearAllTimers();
  });

  $: sortedPlayers = [...state.players.values()].sort((a, b) => b.score - a.score);
  $: itemEmoji = item ? (IMAGE_EMOJI[item.imageHint] ?? "🏷️") : "🏷️";
  $: acceptedRankings = rankings.filter((r) => r.accepted);
  $: rejectedRankings = rankings.filter((r) => !r.accepted);
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-8 p-10" data-testid="lowball-marketplace-tv">

  <!-- Round header -->
  <p class="text-sm text-gray-400 uppercase tracking-widest">
    Lowball Marketplace — Round {state.currentRound} of {state.gameConfig.roundCount}
  </p>

  {#if roundSkipped}
    <div class="text-center space-y-4">
      <h1 class="text-3xl font-black text-yellow-400">Round Skipped</h1>
      <p class="text-xl text-gray-300">{skipReason}</p>
    </div>

  {:else if subPhase === "waiting"}
    <div class="text-center space-y-4">
      <h1 class="text-4xl font-black text-emerald-400">Lowball Marketplace</h1>
      <p class="text-xl text-gray-300">Finding the next listing...</p>
    </div>

  {:else if subPhase === "listing"}
    <!-- Item listing — fake marketplace ad -->
    <div class="w-full max-w-3xl">
      <!-- Marketplace header bar -->
      <div class="bg-emerald-900/40 border-b border-emerald-700 rounded-t-2xl px-6 py-3 flex items-center gap-3">
        <span class="text-2xl">🏪</span>
        <span class="text-emerald-300 font-bold uppercase tracking-widest text-sm">Lowball Marketplace</span>
        <span class="ml-auto text-xs text-gray-500">Listed just now</span>
      </div>

      <!-- Item card -->
      <div class="bg-gray-800 border-x border-b border-gray-700 rounded-b-2xl p-8 space-y-6">
        <div class="flex gap-8 items-start">
          <!-- Image placeholder -->
          <div class="w-40 h-40 bg-gray-700 rounded-xl flex items-center justify-center flex-shrink-0 border border-gray-600">
            <span class="text-7xl">{itemEmoji}</span>
          </div>

          <!-- Item details -->
          <div class="flex-1 space-y-3">
            {#if item}
              <p class="text-xs text-emerald-400 uppercase tracking-widest">{item.category}</p>
              <h2 class="text-3xl font-black text-white">{item.name}</h2>
              <p class="text-lg text-gray-400">{item.description}</p>
            {/if}
          </div>

          <!-- Price -->
          <div class="text-right flex-shrink-0">
            <p class="text-xs text-gray-400 uppercase tracking-widest">Asking Price</p>
            <p class="text-4xl font-black text-emerald-400">{formatPrice(askingPrice)}</p>
            <p class="text-xs text-gray-500 mt-1">or best offer</p>
          </div>
        </div>

        <!-- Fake seller info -->
        <div class="border-t border-gray-700 pt-4 flex items-center gap-4">
          <div class="w-10 h-10 bg-gray-600 rounded-full flex items-center justify-center">
            <span class="text-lg">🤷</span>
          </div>
          <div>
            <p class="text-sm font-semibold text-gray-300">Definitely_Legit_Seller_42</p>
            <p class="text-xs text-gray-500">Member since yesterday &bull; 0 reviews</p>
          </div>
          <div class="ml-auto text-right">
            <p class="text-xs text-gray-500">Condition: <span class="text-yellow-400">It exists</span></p>
            <p class="text-xs text-gray-500">Shipping: <span class="text-gray-400">Your problem</span></p>
          </div>
        </div>
      </div>
    </div>

    <!-- Timer + bid progress -->
    <div class="text-center space-y-3">
      <p class="text-6xl font-mono font-black {biddingTimeLeft < 5 ? 'text-red-400 animate-pulse' : 'text-white'}">
        {Math.ceil(biddingTimeLeft)}
      </p>
      <p class="text-xl text-gray-300">Place your lowball offers on your phones!</p>

      <!-- Bid progress -->
      {#if totalBidders > 0}
        <div class="w-64 mx-auto">
          <div class="flex justify-between text-sm text-gray-400 mb-1">
            <span>Bids placed</span>
            <span>{bidsIn} / {totalBidders}</span>
          </div>
          <div class="h-3 bg-gray-700 rounded-full overflow-hidden">
            <div
              class="h-full bg-emerald-500 rounded-full transition-all"
              style="width:{(bidsIn / totalBidders) * 100}%"
            ></div>
          </div>
        </div>
      {/if}
    </div>

  {:else if subPhase === "reveal"}
    <!-- Dramatic reveal -->
    <div class="w-full max-w-3xl space-y-6">
      <div class="text-center">
        <h1 class="text-3xl font-black text-emerald-400">The Offers Are In!</h1>
        {#if item}
          <p class="text-lg text-gray-400 mt-2">
            <span class="text-2xl mr-2">{itemEmoji}</span>
            {item.name} — Asking {formatPrice(askingPrice)}
          </p>
        {/if}
      </div>

      <!-- Bids revealed one by one -->
      <div class="space-y-2 max-w-lg mx-auto">
        {#each revealBids as bid, i}
          {#if i < revealedCount}
            {@const isAboveReserve = bid.amount >= revealReserve}
            <div
              class="flex items-center gap-4 px-5 py-3 rounded-xl border transition-all
                {reserveRevealed
                  ? isAboveReserve
                    ? 'bg-emerald-900/30 border-emerald-600'
                    : 'bg-red-900/30 border-red-600'
                  : 'bg-gray-800 border-gray-700'}"
            >
              <span class="w-8 text-center text-gray-400 font-mono text-sm">{i + 1}.</span>
              <span class="flex-1 font-semibold text-white">{bid.playerName}</span>
              <span class="text-xl font-black {reserveRevealed
                ? isAboveReserve ? 'text-emerald-400' : 'text-red-400'
                : 'text-white'}">
                {formatPrice(bid.amount)}
              </span>
              {#if reserveRevealed}
                <span class="text-sm {isAboveReserve ? 'text-emerald-400' : 'text-red-400'}">
                  {isAboveReserve ? "ACCEPTED" : "REJECTED"}
                </span>
              {/if}
            </div>
          {/if}
        {/each}

        <!-- Still revealing... -->
        {#if revealedCount < revealBids.length}
          <div class="flex items-center justify-center py-3">
            <div class="flex gap-1">
              <div class="w-2 h-2 bg-emerald-400 rounded-full animate-bounce"></div>
              <div class="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style="animation-delay:0.15s"></div>
              <div class="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style="animation-delay:0.3s"></div>
            </div>
          </div>
        {/if}
      </div>

      <!-- Reserve reveal -->
      {#if reserveRevealed}
        <div class="text-center mt-4">
          <div class="inline-block bg-yellow-900/50 border-2 border-yellow-500 rounded-2xl px-8 py-4">
            <p class="text-xs text-yellow-400 uppercase tracking-widest mb-1">Seller's Reserve Price</p>
            <p class="text-4xl font-black text-yellow-200">{formatPrice(revealReserve)}</p>
            <p class="text-xs text-yellow-400 mt-1">Bids below this amount are REJECTED</p>
          </div>
        </div>
      {/if}
    </div>

  {:else if subPhase === "results"}
    <!-- Results -->
    <div class="w-full max-w-2xl space-y-6">
      <h1 class="text-3xl font-bold text-center text-emerald-400">Round Results</h1>

      <!-- Winner -->
      {#if acceptedRankings.length > 0}
        {@const winner = acceptedRankings[0]}
        <div class="text-center bg-emerald-900/30 border-2 border-emerald-500 rounded-2xl p-6 shadow-lg">
          <p class="text-sm text-emerald-400 uppercase tracking-widest mb-2">Best Deal</p>
          <p class="text-4xl font-black text-emerald-200">{winner.playerName}</p>
          <p class="text-lg text-emerald-400 mt-1">
            Snagged {resultItemName} for {formatPrice(winner.amount)}!
          </p>
          <p class="text-xs text-gray-400 mt-2">
            Reserve was {formatPrice(resultReserve)} — saved {formatPrice(askingPrice - winner.amount)} off asking!
          </p>
        </div>
      {/if}

      <!-- Rankings table -->
      <div class="bg-gray-800 rounded-xl p-4">
        <p class="text-xs text-gray-400 uppercase tracking-widest mb-3 text-center">All Bids</p>
        <div class="space-y-2">
          <!-- Accepted bids -->
          {#each acceptedRankings as entry}
            {@const isWinner = entry.rank === 1}
            <div class="flex items-center gap-3">
              <span class="w-6 text-center font-mono text-sm {isWinner ? 'text-emerald-400' : 'text-gray-400'}">
                #{entry.rank}
              </span>
              <span class="w-28 truncate font-semibold text-white">
                {entry.playerName}
                {#if isWinner}
                  <span class="text-emerald-400 text-xs ml-1">★</span>
                {/if}
              </span>
              <span class="text-emerald-400 font-mono font-bold">{formatPrice(entry.amount)}</span>
              <div class="flex-1"></div>
              <span class="text-sm font-mono {entry.pointsEarned > 0 ? 'text-green-400' : 'text-gray-500'}">
                +{entry.pointsEarned}
              </span>
            </div>
          {/each}

          <!-- Reserve line -->
          {#if rejectedRankings.length > 0}
            <div class="flex items-center gap-3 py-1">
              <div class="flex-1 border-t border-dashed border-yellow-600"></div>
              <span class="text-xs text-yellow-400 font-bold">RESERVE: {formatPrice(resultReserve)}</span>
              <div class="flex-1 border-t border-dashed border-yellow-600"></div>
            </div>
          {/if}

          <!-- Rejected bids -->
          {#each rejectedRankings as entry}
            <div class="flex items-center gap-3 opacity-50">
              <span class="w-6 text-center font-mono text-sm text-red-400">✕</span>
              <span class="w-28 truncate font-semibold text-gray-400">{entry.playerName}</span>
              <span class="text-red-400 font-mono">{formatPrice(entry.amount)}</span>
              <div class="flex-1"></div>
              <span class="text-sm font-mono text-gray-500">+0</span>
            </div>
          {/each}
        </div>
      </div>

      <!-- Overall standings -->
      <div class="bg-gray-800 rounded-xl p-4">
        <p class="text-xs text-gray-400 uppercase tracking-widest mb-3 text-center">Overall Standings</p>
        <div class="space-y-1">
          {#each sortedPlayers as p, i}
            <div class="flex items-center gap-3">
              <span class="w-6 text-center text-gray-500 font-mono text-sm">{i + 1}.</span>
              <span class="flex-1 truncate font-semibold text-white">{p.name}</span>
              <span class="font-mono text-lg font-bold text-white">{p.score}</span>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>
