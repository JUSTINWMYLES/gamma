<script lang="ts">
  /**
   * Phone game component for "Lowball Marketplace" (registry-25).
   *
   * Supports two modes:
   *   Mode 1 (Classic): bidding → reveal → results
   *   Mode 2 (Funny Messages): browse → pick → write → reveal → vote → results
   *
   * Server messages listened:
   *   Classic: item_listing, bid_confirmed, bid_count_update,
   *            reveal_start, round_result, round_skipped
   *   Funny:   fm_browse_start, fm_pick_confirmed, fm_pick_update,
   *            fm_write_start, fm_write_confirmed, fm_write_update,
   *            fm_reveal_entry, fm_reveal_done,
   *            fm_voting_start, fm_vote_confirmed, fm_vote_update,
   *            fm_result, round_skipped
   */
  import { onMount, onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState, PlayerState } from "../../../../shared/types";

  export let room: Room;
  export let state: RoomState;
  export let me: PlayerState | undefined;

  // ── Sub-phase state ──────────────────────────────────────────────

  type SubPhase =
    | "waiting"
    // Classic
    | "bidding" | "bid_placed" | "reveal" | "results"
    // Funny Messages
    | "fm_browsing" | "fm_picked" | "fm_writing" | "fm_written"
    | "fm_reveal" | "fm_voting" | "fm_results";

  let subPhase: SubPhase = "waiting";

  // ── Classic: Bidding phase ──────────────────────────────────────

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

  // ── Classic: Reveal phase ───────────────────────────────────────

  let revealReserve = 0;
  let revealBids: { playerId: string; playerName: string; amount: number }[] = [];

  // ── Classic: Results ────────────────────────────────────────────

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

  // ── Funny Messages state ────────────────────────────────────────

  interface FmItem {
    name: string;
    description: string;
    category: string;
    askingPrice: number;
    imageHint: string;
  }

  let fmItems: FmItem[] = [];
  let fmBrowseTimeLeft = 0;
  let fmBrowseEndTime = 0;
  let fmBrowseTimer: ReturnType<typeof setInterval> | null = null;
  let fmSelectedIndex: number | null = null;
  let fmDetailIndex: number | null = null;
  let fmPickConfirmed = false;
  let fmPicksIn = 0;
  let fmTotalPickers = 0;

  let fmWriteItem: FmItem | null = null;
  let fmWriteTimeLeft = 0;
  let fmWriteEndTime = 0;
  let fmWriteTimer: ReturnType<typeof setInterval> | null = null;
  let fmMessageText = "";
  let fmWriteConfirmed = false;
  let fmWrittenIn = 0;
  let fmTotalWriters = 0;

  let fmRevealPlayerName = "";
  let fmRevealItemName = "";
  let fmRevealMessage = "";

  let fmVotableEntries: { playerId: string; playerName: string }[] = [];
  let fmVotingTimeLeft = 0;
  let fmVotingEndTime = 0;
  let fmVotingTimer: ReturnType<typeof setInterval> | null = null;
  let fmMyVote: string | null = null;
  let fmVoteConfirmed = false;
  let fmVotesIn = 0;
  let fmTotalVoters = 0;

  let fmResults: {
    winner: string | null;
    scores: Record<string, number>;
    entries: { playerId: string; playerName: string; itemName: string; message: string; voteCount: number }[];
  } | null = null;

  // Round skipped
  let roundSkipped = false;
  let skipReason = "";

  // ── Helpers ──────────────────────────────────────────────────────

  function clearAllTimers() {
    if (biddingTimer) { clearInterval(biddingTimer); biddingTimer = null; }
    if (fmBrowseTimer) { clearInterval(fmBrowseTimer); fmBrowseTimer = null; }
    if (fmWriteTimer) { clearInterval(fmWriteTimer); fmWriteTimer = null; }
    if (fmVotingTimer) { clearInterval(fmVotingTimer); fmVotingTimer = null; }
  }

  function formatPrice(n: number): string {
    return "$" + n.toLocaleString();
  }

  // ── Classic actions ─────────────────────────────────────────────

  function placeBid() {
    if (bidConfirmed || !item) return;
    const amount = Math.round((sliderValue / 100) * askingPrice);
    if (amount < 1) return;
    bidAmount = amount;
    room.send("game_input", { action: "place_bid", amount });
  }

  // ── Funny Messages actions ──────────────────────────────────────

  function fmPickItem(index: number) {
    fmSelectedIndex = index;
  }

  function fmOpenListing(index: number) {
    fmDetailIndex = index;
    fmSelectedIndex = index;
  }

  function fmBackToGrid() {
    fmDetailIndex = null;
  }

  function fmConfirmPick() {
    if (fmSelectedIndex == null || fmPickConfirmed) return;
    room.send("game_input", { action: "fm_pick_item", itemIndex: fmSelectedIndex });
  }

  function fmSubmitMessage() {
    if (!fmMessageText.trim() || fmWriteConfirmed) return;
    room.send("game_input", { action: "fm_submit_message", message: fmMessageText.trim() });
  }

  function fmCastVote(targetId: string) {
    if (fmMyVote || fmVoteConfirmed) return;
    if (targetId === me?.id) return;
    fmMyVote = targetId;
    room.send("game_input", { action: "fm_vote", targetId });
  }

  // ── Classic message handlers ────────────────────────────────────

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

  // ── Funny Messages message handlers ─────────────────────────────

  function onFmBrowseStart(data: {
    items: FmItem[];
    durationMs: number;
    serverTimestamp: number;
  }) {
    subPhase = "fm_browsing";
    fmItems = data.items;
    fmSelectedIndex = null;
    fmDetailIndex = null;
    fmPickConfirmed = false;
    fmPicksIn = 0;

    fmBrowseEndTime = data.serverTimestamp + data.durationMs;
    fmBrowseTimeLeft = Math.max(0, (fmBrowseEndTime - Date.now()) / 1000);

    clearAllTimers();
    fmBrowseTimer = setInterval(() => {
      fmBrowseTimeLeft = Math.max(0, (fmBrowseEndTime - Date.now()) / 1000);
    }, 200);
  }

  function onFmPickConfirmed(_data: { itemIndex: number }) {
    fmPickConfirmed = true;
    subPhase = "fm_picked";
    if (fmBrowseTimer) { clearInterval(fmBrowseTimer); fmBrowseTimer = null; }
  }

  function onFmPickUpdate(data: { picksIn: number; totalPickers: number }) {
    fmPicksIn = data.picksIn;
    fmTotalPickers = data.totalPickers;
  }

  function onFmWriteStart(data: {
    item: FmItem;
    itemIndex: number;
    durationMs: number;
    serverTimestamp: number;
  }) {
    subPhase = "fm_writing";
    fmWriteItem = data.item;
    fmMessageText = "";
    fmWriteConfirmed = false;
    fmWrittenIn = 0;

    fmWriteEndTime = data.serverTimestamp + data.durationMs;
    fmWriteTimeLeft = Math.max(0, (fmWriteEndTime - Date.now()) / 1000);

    clearAllTimers();
    fmWriteTimer = setInterval(() => {
      fmWriteTimeLeft = Math.max(0, (fmWriteEndTime - Date.now()) / 1000);
    }, 200);
  }

  function onFmWriteConfirmed() {
    fmWriteConfirmed = true;
    subPhase = "fm_written";
    if (fmWriteTimer) { clearInterval(fmWriteTimer); fmWriteTimer = null; }
  }

  function onFmWriteUpdate(data: { writtenIn: number; totalWriters: number }) {
    fmWrittenIn = data.writtenIn;
    fmTotalWriters = data.totalWriters;
  }

  function onFmRevealEntry(data: {
    playerId: string;
    playerName: string;
    item: FmItem;
    message: string;
  }) {
    subPhase = "fm_reveal";
    fmRevealPlayerName = data.playerName;
    fmRevealItemName = data.item.name;
    fmRevealMessage = data.message;
  }

  function onFmRevealDone() {
    // Brief transition — voting_start will follow
  }

  function onFmVotingStart(data: {
    durationMs: number;
    serverTimestamp: number;
    entries: { playerId: string; playerName: string }[];
  }) {
    subPhase = "fm_voting";
    clearAllTimers();

    fmVotableEntries = data.entries.filter((e) => e.playerId !== me?.id);
    fmVotingEndTime = data.serverTimestamp + data.durationMs;
    fmVotingTimeLeft = Math.max(0, (fmVotingEndTime - Date.now()) / 1000);
    fmMyVote = null;
    fmVoteConfirmed = false;
    fmVotesIn = 0;
    fmTotalVoters = data.entries.length;

    fmVotingTimer = setInterval(() => {
      fmVotingTimeLeft = Math.max(0, (fmVotingEndTime - Date.now()) / 1000);
    }, 200);
  }

  function onFmVoteConfirmed() {
    fmVoteConfirmed = true;
  }

  function onFmVoteUpdate(data: { votesIn: number; totalVoters: number }) {
    fmVotesIn = data.votesIn;
    fmTotalVoters = data.totalVoters;
  }

  function onFmResult(data: typeof fmResults) {
    subPhase = "fm_results";
    fmResults = data;
    clearAllTimers();
  }

  function onRoundSkipped(data: { reason: string }) {
    roundSkipped = true;
    skipReason = data.reason;
  }

  // ── Lifecycle ────────────────────────────────────────────────────

  onMount(() => {
    // Classic listeners
    room.onMessage("item_listing", onItemListing);
    room.onMessage("bid_confirmed", onBidConfirmed);
    room.onMessage("bid_count_update", onBidCountUpdate);
    room.onMessage("reveal_start", onRevealStart);
    room.onMessage("round_result", onRoundResult);
    // Funny Messages listeners
    room.onMessage("fm_browse_start", onFmBrowseStart);
    room.onMessage("fm_pick_confirmed", onFmPickConfirmed);
    room.onMessage("fm_pick_update", onFmPickUpdate);
    room.onMessage("fm_write_start", onFmWriteStart);
    room.onMessage("fm_write_confirmed", onFmWriteConfirmed);
    room.onMessage("fm_write_update", onFmWriteUpdate);
    room.onMessage("fm_reveal_entry", onFmRevealEntry);
    room.onMessage("fm_reveal_done", onFmRevealDone);
    room.onMessage("fm_voting_start", onFmVotingStart);
    room.onMessage("fm_vote_confirmed", onFmVoteConfirmed);
    room.onMessage("fm_vote_update", onFmVoteUpdate);
    room.onMessage("fm_result", onFmResult);
    // Shared
    room.onMessage("round_skipped", onRoundSkipped);
  });

  onDestroy(() => {
    clearAllTimers();
  });

  // Derived — Classic
  $: myScore = resultScores[me?.id ?? ""] ?? 0;
  $: myRanking = rankings.find((r) => r.playerId === me?.id);
  $: computedBidAmount = Math.round((sliderValue / 100) * askingPrice);

  // Derived — Funny Messages
  $: fmMyScore = fmResults?.scores[me?.id ?? ""] ?? 0;
  $: fmMyEntry = fmResults?.entries.find((e) => e.playerId === me?.id);

  // Image hint emoji map for phone display
  const IMAGE_EMOJI: Record<string, string> = {
    "toaster": "🍞", "cactus": "🌵", "guitar": "🎸", "box": "📦",
    "cloak": "🧥", "cart": "🛒", "gravel": "🪨", "gum": "🫧",
    "rock": "🪨", "shoe": "👟", "cloud": "☁️", "modem": "📠",
    "bubble-wrap": "💨", "sunscreen": "🧴", "time-machine": "⏰",
    "volcano": "🌋", "pasta": "🍝", "noodle": "🏊", "map": "🗺️",
    "earmuffs": "🐕", "car": "🚗", "snowmobile": "🛷", "quad": "🏍️",
    "lift-kit": "🧰", "fridge": "🧊", "bench": "🏋️", "flashlight": "🔦",
    "boat": "🚤", "washer": "💦", "chair": "🪑", "toolbox": "🧰",
    "chainsaw": "🪚", "dirt-bike": "🏍️", "grill": "🔥", "camera": "📷",
    "tent": "⛺", "kayak": "🛶", "subwoofer": "🔊",
    // New items
    "anvil": "🔨", "trampoline": "🤸", "doorknob": "🚪", "shovel": "⛏️",
    "balloon": "🎈", "treadmill": "🏃", "compass": "🧭", "fog": "🌫️",
    "punchbowl": "🥣", "lantern": "🏮", "roomba": "🤖", "smoke": "💨",
    "typewriter": "⌨️", "parachute": "🪂", "clock": "🕰️", "hottub": "🛁",
    "piano": "🎹", "blanket": "🛏️", "telescope": "🔭", "bicycle": "🚲",
    "gnome": "🧙", "earplug": "🔇", "pebble": "🪨", "sidecar": "🏍️",
    "microwave": "📡", "ladder": "🪜", "gem": "💎", "accordion": "🪗",
    "fan": "🌀", "screw": "🔩", "canoe": "🛶", "cutout": "🧍",
    "drone": "🛸", "mat": "🧘", "aquarium": "🐠", "recliner": "🛋️",
    "phone": "☎️", "sundial": "☀️", "unicycle": "🎪", "wind": "🌬️",
    "fryer": "🍳", "level": "📏", "binoculars": "🔭", "puzzle": "🧩",
    "toilet": "🚽",
  };

  // Fake seller names for enriched detail views
  const SELLER_NAMES = [
    "Definitely_Legit_Seller_42", "xX_BargainKing_Xx", "GarageCleanout2026",
    "NotAScam_Promise", "TrustMe_Bro_Sales", "MyWifeSaidSellIt",
    "BasementTreasures99", "OneOwner_Honest", "NeedGoneTODAY",
    "PriceIsNegotiable_Maybe", "DownsizingDave", "Grandmas_Attic_Finds",
    "MovingSale_ASAP", "CashOnly_NoLowballs", "IKnowWhatIHave",
  ];

  // Fake conditions
  const CONDITIONS = [
    "Like New (Used Twice)", "Gently Loved", "It Exists", "Fair (Generous)",
    "Vintage (Old)", "Mint* (*in my opinion)", "Well-Worn Character",
    "Suspiciously Clean", "Battle-Tested", "Collector Grade (Self-Certified)",
    "Needs TLC", "Works On My End",
  ];

  // Fake locations
  const LOCATIONS = [
    "Parking lot behind Wendy's", "My cousin's garage", "Undisclosed location",
    "Corner of Elm & Regret", "Behind the old Kmart", "Curb pickup only",
    "Somewhere in the tri-state area", "GPS coordinates upon request",
    "The good part of town (trust me)", "Storage unit #???",
  ];

  // Fake shipping options
  const SHIPPING_OPTIONS = [
    "Your problem", "Will yeet from porch", "Local pickup, bring a truck",
    "I'll think about shipping", "Carrier pigeon available", "Free if you hurry",
    "Shipping = $500 (it's heavy)", "You figure it out", "Drone delivery (untested)",
  ];

  function fakeSellerName(hint: string): string {
    return SELLER_NAMES[Math.abs(hashCode(hint)) % SELLER_NAMES.length];
  }
  function fakeCondition(hint: string): string {
    return CONDITIONS[Math.abs(hashCode(hint + "c")) % CONDITIONS.length];
  }
  function fakeLocation(hint: string): string {
    return LOCATIONS[Math.abs(hashCode(hint + "l")) % LOCATIONS.length];
  }
  function fakeShipping(hint: string): string {
    return SHIPPING_OPTIONS[Math.abs(hashCode(hint + "s")) % SHIPPING_OPTIONS.length];
  }
  function fakeViews(hint: string): number {
    return 3 + (Math.abs(hashCode(hint + "v")) % 247);
  }
  function fakeSaves(hint: string): number {
    return Math.abs(hashCode(hint + "f")) % 18;
  }
  function fakeTimeAgo(hint: string): string {
    const mins = 1 + (Math.abs(hashCode(hint + "t")) % 180);
    if (mins < 60) return `${mins} min ago`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
  }
  function fakeRating(hint: string): string {
    const stars = 1 + (Math.abs(hashCode(hint + "r")) % 5);
    return "★".repeat(stars) + "☆".repeat(5 - stars);
  }
  function fakeReviewCount(hint: string): number {
    return Math.abs(hashCode(hint + "rc")) % 12;
  }

  function hashCode(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return h;
  }

  function emojiFor(hint: string): string {
    return IMAGE_EMOJI[hint] ?? "🏷️";
  }
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
      <p class="text-xs text-gray-500">A new listing is coming up</p>
    </div>

  <!-- ═══════════════════════════════════════════════════════════════ -->
  <!-- CLASSIC MODE PHASES                                           -->
  <!-- ═══════════════════════════════════════════════════════════════ -->

  {:else if subPhase === "bidding"}
    <div class="w-full max-w-sm space-y-5">
      {#if item}
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

  <!-- ═══════════════════════════════════════════════════════════════ -->
  <!-- FUNNY MESSAGES MODE PHASES                                    -->
  <!-- ═══════════════════════════════════════════════════════════════ -->

  {:else if subPhase === "fm_browsing"}
    <!-- Browse & pick an item -->
    <div class="w-full max-w-md space-y-4 overflow-y-auto max-h-[85vh]">
      <div class="text-center sticky top-0 bg-gray-900 pb-2 z-10">
        <h2 class="text-xl font-black text-emerald-400">Pick a Listing!</h2>
        <p class="text-sm text-gray-400 mt-1">
          {Math.ceil(fmBrowseTimeLeft)}s remaining
          {#if fmTotalPickers > 0}
            <span class="ml-1 text-gray-500">({fmPicksIn}/{fmTotalPickers} picked)</span>
          {/if}
        </p>
      </div>

      {#if fmDetailIndex == null}
        <div class="grid grid-cols-2 gap-3">
          {#each fmItems as fmItem, i}
            <button
              class="text-left rounded-xl border p-2 transition-all active:scale-[0.98]
                {fmSelectedIndex === i
                  ? 'border-emerald-500 bg-emerald-900/30'
                  : 'border-gray-700 bg-gray-800 active:border-emerald-500'}"
              on:click={() => fmOpenListing(i)}
            >
              <div class="h-24 rounded-lg bg-gray-700 border border-gray-600 flex items-center justify-center mb-2">
                <span class="text-4xl">{emojiFor(fmItem.imageHint)}</span>
              </div>
              <p class="text-sm font-bold text-white line-clamp-1">{fmItem.name}</p>
              <p class="text-xs text-emerald-400 font-bold mt-1">{formatPrice(fmItem.askingPrice)}</p>
            </button>
          {/each}
        </div>
      {:else}
        {@const listing = fmItems[fmDetailIndex]}
        {#if listing}
          <div class="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden space-y-0">
            <!-- Image hero -->
            <div class="h-44 bg-gray-700 border-b border-gray-600 flex items-center justify-center relative">
              <span class="text-7xl">{emojiFor(listing.imageHint)}</span>
              <span class="absolute top-2 right-2 bg-black/60 text-xs text-gray-300 px-2 py-0.5 rounded-full">
                {fakeViews(listing.imageHint)} views
              </span>
              <span class="absolute top-2 left-2 bg-emerald-700/80 text-xs text-emerald-200 px-2 py-0.5 rounded-full">
                {fakeTimeAgo(listing.imageHint)}
              </span>
            </div>

            <div class="p-4 space-y-3">
              <!-- Title + Price -->
              <div>
                <p class="text-xs text-emerald-400 uppercase tracking-widest">{listing.category}</p>
                <h3 class="text-xl font-black text-white mt-1">{listing.name}</h3>
                <p class="text-2xl font-black text-emerald-400 mt-1">{formatPrice(listing.askingPrice)}</p>
                <p class="text-xs text-gray-500 mt-0.5">or best offer &bull; {fakeSaves(listing.imageHint)} saves</p>
              </div>

              <!-- Description -->
              <p class="text-sm text-gray-400">{listing.description}</p>

              <!-- Details grid -->
              <div class="grid grid-cols-2 gap-2 text-xs">
                <div class="bg-gray-700/60 rounded-lg p-2">
                  <p class="text-gray-500 uppercase tracking-wider">Condition</p>
                  <p class="text-yellow-400 font-semibold mt-0.5">{fakeCondition(listing.imageHint)}</p>
                </div>
                <div class="bg-gray-700/60 rounded-lg p-2">
                  <p class="text-gray-500 uppercase tracking-wider">Shipping</p>
                  <p class="text-gray-300 font-semibold mt-0.5">{fakeShipping(listing.imageHint)}</p>
                </div>
                <div class="bg-gray-700/60 rounded-lg p-2 col-span-2">
                  <p class="text-gray-500 uppercase tracking-wider">Location</p>
                  <p class="text-gray-300 font-semibold mt-0.5">{fakeLocation(listing.imageHint)}</p>
                </div>
              </div>

              <!-- Seller info -->
              <div class="flex items-center gap-3 border-t border-gray-700 pt-3">
                <div class="w-9 h-9 bg-gray-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <span class="text-sm">🤷</span>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-semibold text-gray-300 truncate">{fakeSellerName(listing.imageHint)}</p>
                  <p class="text-xs text-gray-500">
                    {fakeRating(listing.imageHint)} ({fakeReviewCount(listing.imageHint)} reviews)
                  </p>
                </div>
              </div>

              <!-- Action buttons -->
              <div class="grid grid-cols-2 gap-2 pt-1">
                <button
                  class="py-3 rounded-lg bg-gray-700 text-gray-200 font-bold active:bg-gray-600"
                  on:click={fmBackToGrid}
                >Back to List</button>
                <button
                  class="py-3 rounded-lg font-bold transition-all active:scale-95
                    {fmPickConfirmed
                      ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                      : 'bg-emerald-600 text-white active:bg-emerald-500'}"
                  disabled={fmPickConfirmed}
                  on:click={fmConfirmPick}
                >Send Message</button>
              </div>
            </div>
          </div>
        {/if}
      {/if}
    </div>

  {:else if subPhase === "fm_picked"}
    <!-- Waiting for others to pick -->
    <div class="text-center space-y-4">
      <div class="bg-emerald-900 border border-emerald-600 rounded-xl p-4">
        <p class="text-emerald-200 font-bold text-lg">Item Picked!</p>
        <p class="text-emerald-400 text-sm mt-1">Waiting for other players...</p>
      </div>
      {#if fmSelectedIndex != null && fmItems[fmSelectedIndex]}
        <div class="bg-gray-800 rounded-xl p-3">
          <span class="text-2xl">{emojiFor(fmItems[fmSelectedIndex].imageHint)}</span>
          <p class="font-bold text-white mt-1">{fmItems[fmSelectedIndex].name}</p>
        </div>
      {/if}
      {#if fmTotalPickers > 0}
        <p class="text-sm text-gray-400">{fmPicksIn}/{fmTotalPickers} have picked</p>
      {/if}
    </div>

  {:else if subPhase === "fm_writing"}
    <!-- Write a message to the seller -->
    <div class="w-full max-w-sm space-y-4">
      <div class="text-center">
        <h2 class="text-xl font-black text-emerald-400">Write to the Seller!</h2>
        <p class="text-sm text-gray-400 mt-1">
          {Math.ceil(fmWriteTimeLeft)}s remaining
        </p>
      </div>

      {#if fmWriteItem}
        <div class="bg-gray-800 border border-gray-700 rounded-xl p-3 flex items-center gap-3">
          <span class="text-3xl">{emojiFor(fmWriteItem.imageHint)}</span>
          <div>
            <p class="font-bold text-white">{fmWriteItem.name}</p>
            <p class="text-xs text-emerald-400">{formatPrice(fmWriteItem.askingPrice)}</p>
          </div>
        </div>
      {/if}

      <textarea
        class="w-full h-28 bg-gray-800 border border-gray-600 rounded-xl p-3
          text-white placeholder-gray-500 resize-none focus:border-emerald-500 focus:outline-none"
        placeholder="Write your funniest message to the seller..."
        maxlength="200"
        bind:value={fmMessageText}
      ></textarea>

      <div class="flex justify-between items-center">
        <p class="text-xs text-gray-500">{fmMessageText.length}/200</p>
        {#if fmTotalWriters > 0}
          <p class="text-xs text-gray-500">{fmWrittenIn}/{fmTotalWriters} submitted</p>
        {/if}
      </div>

      <button
        class="w-full py-4 rounded-xl text-lg font-bold transition-all active:scale-95
          {fmMessageText.trim()
            ? 'bg-emerald-600 text-white active:bg-emerald-500'
            : 'bg-gray-700 text-gray-500 cursor-not-allowed'}"
        disabled={!fmMessageText.trim()}
        on:click={fmSubmitMessage}
      >Send Message</button>
    </div>

  {:else if subPhase === "fm_written"}
    <!-- Waiting for others to write -->
    <div class="text-center space-y-4">
      <div class="bg-emerald-900 border border-emerald-600 rounded-xl p-4">
        <p class="text-emerald-200 font-bold">Message Sent!</p>
        <p class="text-emerald-400 text-sm mt-1">Waiting for others...</p>
      </div>
      {#if fmTotalWriters > 0}
        <p class="text-sm text-gray-400">{fmWrittenIn}/{fmTotalWriters} submitted</p>
      {/if}
    </div>

  {:else if subPhase === "fm_reveal"}
    <!-- Watching messages on TV -->
    <div class="text-center space-y-4">
      <h2 class="text-xl font-black text-emerald-400">Message Reveal!</h2>
      {#if fmRevealPlayerName}
        <p class="text-lg text-gray-300">
          <span class="font-bold text-white">{fmRevealPlayerName}</span>
          wrote about <span class="text-emerald-400">{fmRevealItemName}</span>
        </p>
      {/if}
      <p class="text-gray-500 text-sm">Watch the TV!</p>
    </div>

  {:else if subPhase === "fm_voting"}
    <!-- Vote for funniest -->
    <div class="w-full max-w-sm space-y-4">
      <div class="text-center">
        <h2 class="text-xl font-black text-emerald-400">Vote for the Funniest!</h2>
        <p class="text-sm text-gray-400 mt-1">
          {Math.ceil(fmVotingTimeLeft)}s remaining
          {#if fmVotesIn > 0}
            <span class="ml-2 text-gray-500">({fmVotesIn}/{fmTotalVoters} voted)</span>
          {/if}
        </p>
      </div>

      {#if fmVoteConfirmed}
        <div class="bg-emerald-900 border border-emerald-600 rounded-xl p-4 text-center">
          <p class="text-emerald-200 font-bold">Vote submitted!</p>
          <p class="text-emerald-400 text-sm mt-1">Waiting for others...</p>
        </div>
      {:else}
        <div class="space-y-2">
          {#each fmVotableEntries as entry}
            <button
              class="w-full text-left px-4 py-3 rounded-lg border transition-colors active:scale-[0.98]
                {fmMyVote === entry.playerId
                  ? 'border-emerald-500 bg-emerald-900 text-white'
                  : 'border-gray-700 bg-gray-800 text-gray-300 active:border-emerald-500'}"
              on:click={() => fmCastVote(entry.playerId)}
              disabled={!!fmMyVote}
            >
              <p class="font-semibold">{entry.playerName}</p>
            </button>
          {/each}
        </div>
      {/if}
    </div>

  {:else if subPhase === "fm_results"}
    <!-- Funny Messages results -->
    <div class="w-full max-w-sm space-y-4 text-center">
      <h2 class="text-xl font-black text-emerald-400">Results</h2>

      {#if fmResults}
        {#if fmResults.winner}
          {@const winnerEntry = fmResults.entries.find((e) => e.playerId === fmResults?.winner)}
          <div class="bg-yellow-900/60 border border-yellow-500 rounded-xl p-4">
            <p class="text-xs text-yellow-400 uppercase tracking-widest mb-1">Funniest Message</p>
            <p class="text-2xl font-black text-yellow-200">{winnerEntry?.playerName ?? "???"}</p>
            <p class="text-sm text-yellow-400 mt-1">{winnerEntry?.voteCount ?? 0} votes</p>
          </div>
        {/if}

        <div class="bg-gray-800 rounded-xl p-4">
          <p class="text-xs text-gray-400 uppercase tracking-widest mb-1">Your Score</p>
          <p class="text-3xl font-black {fmMyScore > 0 ? 'text-green-400' : 'text-gray-500'}">
            +{fmMyScore}
          </p>
          {#if fmMyEntry}
            <p class="text-xs text-gray-500 mt-1">
              {fmMyEntry.voteCount} vote{fmMyEntry.voteCount !== 1 ? 's' : ''} received
            </p>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>
