<script lang="ts">
  /**
   * TV game component for "Lowball Marketplace" (registry-25).
   *
   * Displays the shared-screen view for two modes:
   *
   * Mode 1 (Classic):
   *   - Item listing (fake marketplace ad)
   *   - Bid countdown + anonymous bid progress
   *   - Dramatic reveal: bids shown one by one, then reserve revealed
   *   - Round results with rankings and scores
   *
   * Mode 2 (Funny Messages):
   *   - Browse grid: items available for players to pick
   *   - Write phase: "Players are writing messages..." with progress
   *   - Reveal: each message shown dramatically with item card
   *   - Voting: show candidates + progress
   *   - Results: messages with vote counts, winner, overall standings
   *
   * Server messages listened:
   *   Classic: item_listing, bid_count_update, reveal_start,
   *            round_result, round_skipped
   *   Funny:   fm_browse_start, fm_pick_update, fm_write_phase,
   *            fm_write_update, fm_reveal_entry, fm_reveal_done,
   *            fm_voting_start, fm_vote_update, fm_result, round_skipped
   */
  import { onMount, onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState } from "../../../../shared/types";
  import { getRoundProgressLabel } from "../../../../shared/types";
  import PlayerIcon from "../../components/PlayerIcon.svelte";

  export let room: Room;
  export let state: RoomState;

  // ── Sub-phase state ──────────────────────────────────────────────

  type SubPhase =
    | "waiting"
    // Classic
    | "listing" | "reveal" | "results"
    // Funny Messages
    | "fm_browsing" | "fm_reveal" | "fm_voting" | "fm_results";

  let subPhase: SubPhase = "waiting";

  // ── Classic: Listing phase ──────────────────────────────────────

  interface ItemInfo {
    name: string;
    description: string;
    category: string;
    imageHint: string;
  }

  let item: ItemInfo | null = null;
  let askingPrice = 0;
  let characteristics: { label: string; value: string }[] = [];
  let biddingTimeLeft = 0;
  let biddingEndTime = 0;
  let biddingTimer: ReturnType<typeof setInterval> | null = null;
  let bidsIn = 0;
  let totalBidders = 0;

  // ── Classic: Reveal phase ───────────────────────────────────────

  let revealReserve = 0;
  let revealBids: { playerId: string; playerName: string; amount: number }[] = [];
  let revealedCount = 0;
  let reserveRevealed = false;
  let revealInterval: ReturnType<typeof setInterval> | null = null;

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
  let resultItemName = "";
  let resultItemDescription = "";
  let resultItemCategory = "";
  let resultItemAskingPrice = 0;
  let resultItemImageHint = "";

  // ── Funny Messages state ────────────────────────────────────────

  interface FmItem {
    name: string;
    description: string;
    category: string;
    askingPrice: number;
    imageHint: string;
  }

  // Browse phase
  let fmItems: FmItem[] = [];
  let fmBrowseTimeLeft = 0;
  let fmBrowseEndTime = 0;
  let fmBrowseTimer: ReturnType<typeof setInterval> | null = null;
  let fmPicksIn = 0;
  let fmTotalPickers = 0;

  // Write phase (combined with browse — same shared timer)
  let fmWrittenIn = 0;
  let fmTotalWriters = 0;

  // Player status dashboard
  interface FmPlayerStatus {
    playerId: string;
    playerName: string;
    status: "browsing" | "writing" | "submitted";
  }
  let fmPlayerStatuses: Map<string, FmPlayerStatus> = new Map();

  // Disco clap sound effect
  let discoClap: HTMLAudioElement | null = null;

  // Reveal phase — structured reveal with animation steps
  let fmRevealPlayerName = "";
  let fmRevealItem: FmItem | null = null;
  let fmRevealMessage = "";
  let fmRevealHistory: { playerName: string; item: FmItem; message: string }[] = [];
  /** Animation step for current reveal: 0=intro, 1=listing, 2=message */
  let fmRevealStep = 0;
  let fmRevealStepTimer: ReturnType<typeof setTimeout> | null = null;

  // Voting phase
  let fmVotingEntries: { playerId: string; playerName: string; item: FmItem; message: string }[] = [];
  let fmVotingTimeLeft = 0;
  let fmVotingEndTime = 0;
  let fmVotingTimer: ReturnType<typeof setInterval> | null = null;
  let fmVotesIn = 0;
  let fmTotalVoters = 0;

  // Results
  let fmResults: {
    winner: string | null;
    scores: Record<string, number>;
    entries: { playerId: string; playerName: string; itemName: string; itemDescription?: string; itemCategory?: string; message: string; voteCount: number }[];
  } | null = null;

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
    // Batch 2
    "roomba2": "🤖", "waffle": "🧇", "compass2": "🧭", "trampoline2": "🤸",
    "pool": "🏊", "projector": "📽️", "flip-phone": "📱", "sword": "🗡️",
    "skateboard": "🛹", "globe": "🌍", "hammock": "🏖️", "purifier": "💨",
    "spice-rack": "🧂", "karaoke": "🎤", "mannequin": "👤", "bread": "🍞",
    "vhs": "📼", "beanbag": "🛋️", "lava-lamp": "🫧", "megaphone": "📢",
    "generator": "⚡", "tandem": "🚲", "water-bottle": "💧", "rubber-duck": "🦆",
    "alarm": "⏰", "skillet": "🍳", "desk": "🖥️", "hamster-wheel": "🐹",
    "speaker": "🔊", "churn": "🧈", "hose": "🚿", "espresso": "☕",
    "disco": "🪩", "detector": "🔍", "treadmill-desk": "🏃", "lunchbox": "🥪",
    "printer": "🖨️", "pogo": "🦘", "crystal": "🔮", "instant-pot": "🍲",
    "sewing": "🧵", "scooter": "🛴", "spinner": "🌀", "snowglobe": "🏔️",
    "monitor": "👶", "pool-table": "🎱", "solar": "☀️", "fish": "🐟",
    "painting": "🎨", "foghorn": "📯", "ac-unit": "❄️", "turntable": "🎵",
    "e-blanket": "🔥", "ramp": "📐", "pigeon": "🐦", "vacuum": "🧹",
    "neon": "💡", "punching-bag": "🥊", "watering-can": "🚿", "bidet": "💦",
    "cornhole": "🫘", "toaster-oven": "🍞", "walkie": "📻", "fireplace": "🔥",
    "selfie-stick": "🤳", "dino": "🦖", "saddle": "🐴", "leaf-blower": "🍃",
    "grow-light": "🌱", "meter": "🅿️", "keyboard": "⌨️", "mower": "🌿",
    "goggles": "🥽", "rocking-chair": "🪑", "scale": "⚖️", "disco-toilet": "🪩",
    "trimmer": "✂️", "pizza-oven": "🍕", "e-guitar": "🎸", "massage-chair": "💆",
    "doorbell": "🔔", "rc-car": "🏎️", "ice-cream": "🍦", "bonsai": "🌳",
    "chess": "♟️", "smart-fridge": "🧊", "fire-pit": "🔥", "helmet": "⛑️",
    "popcorn": "🍿", "kettle": "🫖", "mini-fridge": "🧊", "ping-pong": "🏓",
    "hula": "💃", "foot-massager": "🦶", "wifi": "📶", "pay-phone": "☎️",
    "tiki": "🗿", "submarine": "🚢", "bull": "🐂", "barrel": "🛢️",
    "sharpener": "✏️", "gears": "⚙️", "camp-stove": "🏕️", "exercise-ball": "⚽",
  };

  function emojiFor(hint: string): string {
    return IMAGE_EMOJI[hint] ?? "🏷️";
  }

  // ── Helpers ──────────────────────────────────────────────────────

  function clearAllTimers() {
    if (biddingTimer) { clearInterval(biddingTimer); biddingTimer = null; }
    if (revealInterval) { clearInterval(revealInterval); revealInterval = null; }
    if (fmBrowseTimer) { clearInterval(fmBrowseTimer); fmBrowseTimer = null; }
    if (fmVotingTimer) { clearInterval(fmVotingTimer); fmVotingTimer = null; }
    if (fmRevealStepTimer) { clearTimeout(fmRevealStepTimer); fmRevealStepTimer = null; }
  }

  function formatPrice(n: number): string {
    return "$" + n.toLocaleString();
  }

  // ── Classic message handlers ─────────────────────────────────────

  function onItemListing(data: {
    item: ItemInfo;
    askingPrice: number;
    characteristics?: { label: string; value: string }[];
    durationMs: number;
    serverTimestamp: number;
  }) {
    subPhase = "listing";
    item = data.item;
    askingPrice = data.askingPrice;
    characteristics = data.characteristics ?? [];
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
    item: { name: string; category: string; description?: string; askingPrice?: number; imageHint?: string };
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
    resultItemDescription = data.item.description ?? "";
    resultItemCategory = data.item.category;
    resultItemAskingPrice = data.item.askingPrice ?? 0;
    resultItemImageHint = data.item.imageHint ?? "";
  }

  // ── Funny Messages message handlers ──────────────────────────────

  function onFmBrowseStart(data: {
    items: FmItem[];
    durationMs: number;
    serverTimestamp: number;
  }) {
    subPhase = "fm_browsing";
    fmItems = data.items;
    fmPicksIn = 0;
    fmTotalPickers = 0;
    fmWrittenIn = 0;
    fmTotalWriters = 0;
    fmRevealHistory = [];

    // Initialize all players as "browsing"
    fmPlayerStatuses = new Map();
    for (const p of state.players.values()) {
      if (p.isConnected && !p.isEliminated) {
        fmPlayerStatuses.set(p.id, {
          playerId: p.id,
          playerName: p.name,
          status: "browsing",
        });
      }
    }
    fmPlayerStatuses = fmPlayerStatuses; // trigger reactivity

    fmBrowseEndTime = data.serverTimestamp + data.durationMs;
    fmBrowseTimeLeft = Math.max(0, (fmBrowseEndTime - Date.now()) / 1000);

    clearAllTimers();
    fmBrowseTimer = setInterval(() => {
      fmBrowseTimeLeft = Math.max(0, (fmBrowseEndTime - Date.now()) / 1000);
    }, 100);
  }

  function onFmPickUpdate(data: { picksIn: number; totalPickers: number }) {
    fmPicksIn = data.picksIn;
    fmTotalPickers = data.totalPickers;
  }

  function onFmPlayerStatus(data: { playerId: string; playerName: string; status: string }) {
    const existing = fmPlayerStatuses.get(data.playerId);
    if (existing) {
      existing.status = data.status as FmPlayerStatus["status"];
    } else {
      fmPlayerStatuses.set(data.playerId, {
        playerId: data.playerId,
        playerName: data.playerName,
        status: data.status as FmPlayerStatus["status"],
      });
    }
    fmPlayerStatuses = fmPlayerStatuses; // trigger reactivity

    // Play disco_clap when a player submits
    if (data.status === "submitted" && discoClap) {
      discoClap.currentTime = 0;
      discoClap.play().catch(() => {});
    }
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
    if (fmBrowseTimer) { clearInterval(fmBrowseTimer); fmBrowseTimer = null; }
    if (fmRevealStepTimer) { clearTimeout(fmRevealStepTimer); fmRevealStepTimer = null; }

    fmRevealPlayerName = data.playerName;
    fmRevealItem = data.item;
    fmRevealMessage = data.message;
    fmRevealHistory = [...fmRevealHistory, {
      playerName: data.playerName,
      item: data.item,
      message: data.message,
    }];

    // Show the ad immediately, then reveal the message after 5 seconds.
    fmRevealStep = 1;
    fmRevealStepTimer = setTimeout(() => {
      fmRevealStep = 2;
      fmRevealStepTimer = null;
    }, 5000);
  }

  function onFmRevealDone() {
    // Brief transition — voting_start will follow immediately
  }

  function onFmVotingStart(data: {
    durationMs: number;
    serverTimestamp: number;
    totalVoters: number;
    entries: { playerId: string; playerName: string; item: FmItem; message: string }[];
  }) {
    subPhase = "fm_voting";
    clearAllTimers();
    fmVotingEntries = data.entries;
    fmVotesIn = 0;
    fmTotalVoters = data.totalVoters;

    fmVotingEndTime = data.serverTimestamp + data.durationMs;
    fmVotingTimeLeft = Math.max(0, (fmVotingEndTime - Date.now()) / 1000);

    fmVotingTimer = setInterval(() => {
      fmVotingTimeLeft = Math.max(0, (fmVotingEndTime - Date.now()) / 1000);
    }, 100);
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
    // Initialize disco clap sound effect
    discoClap = new Audio("/audio/disco_clap.wav");
    discoClap.volume = 0.6;

    // Classic listeners
    room.onMessage("item_listing", onItemListing);
    room.onMessage("bid_count_update", onBidCountUpdate);
    room.onMessage("reveal_start", onRevealStart);
    room.onMessage("round_result", onRoundResult);
    // Funny Messages listeners
    room.onMessage("fm_browse_start", onFmBrowseStart);
    room.onMessage("fm_pick_update", onFmPickUpdate);
    room.onMessage("fm_player_status", onFmPlayerStatus);
    room.onMessage("fm_write_update", onFmWriteUpdate);
    room.onMessage("fm_reveal_entry", onFmRevealEntry);
    room.onMessage("fm_reveal_done", onFmRevealDone);
    room.onMessage("fm_voting_start", onFmVotingStart);
    room.onMessage("fm_vote_update", onFmVoteUpdate);
    room.onMessage("fm_result", onFmResult);
    // Shared
    room.onMessage("round_skipped", onRoundSkipped);
  });

  onDestroy(() => {
    clearAllTimers();
  });

  // ── Derived values ──────────────────────────────────────────────

  $: sortedPlayers = [...state.players.values()].sort((a, b) => b.score - a.score);
  $: itemEmoji = item ? (IMAGE_EMOJI[item.imageHint] ?? "🏷️") : "🏷️";
  $: acceptedRankings = rankings.filter((r) => r.accepted);
  $: rejectedRankings = rankings.filter((r) => !r.accepted);
  $: fmSortedEntries = fmResults
    ? [...fmResults.entries].sort((a, b) => b.voteCount - a.voteCount)
    : [];
  $: fmWinnerEntry = fmResults
    ? fmResults.entries.find((e) => e.playerId === fmResults?.winner)
    : null;
  $: fmStatusList = [...fmPlayerStatuses.values()];
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-8 p-10" data-testid="lowball-marketplace-tv">

  <!-- Round header -->
  <p class="text-sm text-gray-400 uppercase tracking-widest">
    Lowball Marketplace — {getRoundProgressLabel(state)}
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

  <!-- ═══════════════════════════════════════════════════════════════ -->
  <!-- CLASSIC MODE PHASES                                           -->
  <!-- ═══════════════════════════════════════════════════════════════ -->

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
              {#if characteristics.length > 0}
                <div class="flex flex-wrap gap-2 mt-1">
                  {#each characteristics as c}
                    <span class="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-700/80 border border-gray-600 rounded-full text-sm">
                      <span class="text-gray-400">{c.label}:</span>
                      <span class="font-semibold text-white">{c.value}</span>
                    </span>
                  {/each}
                </div>
              {/if}
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
            {#if characteristics.length > 0}
              {#each characteristics.slice(0, 2) as c}
                <p class="text-xs text-gray-500">{c.label}: <span class="text-yellow-400">{c.value}</span></p>
              {/each}
            {:else}
              <p class="text-xs text-gray-500">Condition: <span class="text-yellow-400">It exists</span></p>
              <p class="text-xs text-gray-500">Shipping: <span class="text-gray-400">Your problem</span></p>
            {/if}
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
    <!-- Classic Results -->
    <div class="w-full max-w-2xl space-y-6">
      <h1 class="text-3xl font-bold text-center text-emerald-400">Round Results</h1>

      <!-- Item details card -->
      {#if resultItemName}
        <div class="bg-gray-800/60 border border-gray-700 rounded-xl p-4 flex items-center gap-4">
          <div class="w-16 h-16 bg-gray-700 border border-gray-600 rounded-lg flex items-center justify-center shrink-0">
            <span class="text-4xl">{emojiFor(resultItemImageHint)}</span>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-lg font-black text-white">{resultItemName}</p>
            {#if resultItemDescription}
              <p class="text-sm text-gray-300 line-clamp-2">{resultItemDescription}</p>
            {/if}
            <div class="flex items-center gap-4 mt-1 text-xs text-gray-400">
              {#if resultItemCategory}<span class="text-emerald-400">{resultItemCategory}</span>{/if}
              {#if resultItemAskingPrice}<span>Asking: <span class="text-white font-bold">{formatPrice(resultItemAskingPrice)}</span></span>{/if}
              <span>Reserve: <span class="text-yellow-400 font-bold">{formatPrice(resultReserve)}</span></span>
            </div>
          </div>
        </div>
      {/if}

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
              <PlayerIcon player={p} size={24} />
              <span class="flex-1 truncate font-semibold text-white">{p.name}</span>
              <span class="font-mono text-lg font-bold text-white">{p.score}</span>
            </div>
          {/each}
        </div>
      </div>
    </div>

  <!-- ═══════════════════════════════════════════════════════════════ -->
  <!-- FUNNY MESSAGES MODE PHASES                                    -->
  <!-- ═══════════════════════════════════════════════════════════════ -->

  {:else if subPhase === "fm_browsing"}
    <!-- Combined Browse & Write phase — dashboard + item grid -->
    <div class="w-full max-w-5xl space-y-4">
      <div class="text-center">
        <h1 class="text-3xl font-black text-emerald-400">Pick a Listing & Write a Message!</h1>
        <p class="text-lg text-gray-400 mt-2">Browse, pick an item, and send a funny message to the seller</p>
      </div>

      <div class="flex gap-6">
        <!-- Item grid (left / main area) -->
        <div class="flex-1 max-h-[50vh] overflow-y-auto rounded-xl pr-1">
          <div class="grid grid-cols-4 gap-3">
            {#each fmItems as fmItem}
              <div class="bg-gray-800 border border-gray-700 rounded-xl p-3 space-y-1">
                <div class="flex items-center gap-2">
                  <span class="text-2xl">{emojiFor(fmItem.imageHint)}</span>
                  <div class="flex-1 min-w-0">
                    <p class="font-bold text-white text-sm truncate">{fmItem.name}</p>
                    <p class="text-xs text-emerald-400 font-bold">{formatPrice(fmItem.askingPrice)}</p>
                  </div>
                </div>
                <p class="text-xs text-gray-500 line-clamp-1">{fmItem.description}</p>
                <p class="text-xs text-gray-600">{fmItem.category}</p>
              </div>
            {/each}
          </div>
        </div>

        <!-- Player dashboard (right sidebar) -->
        <div class="w-64 flex-shrink-0 space-y-3">
          <p class="text-xs text-gray-400 uppercase tracking-widest text-center">Player Status</p>
          <div class="space-y-2">
            {#each fmStatusList as ps}
              <div class="bg-gray-800 border rounded-lg px-3 py-2 flex items-center gap-2
                {ps.status === 'submitted'
                  ? 'border-emerald-600'
                  : ps.status === 'writing'
                    ? 'border-yellow-600'
                    : 'border-gray-700'}">
                <div class="w-2 h-2 rounded-full flex-shrink-0
                  {ps.status === 'submitted'
                    ? 'bg-emerald-400'
                    : ps.status === 'writing'
                      ? 'bg-yellow-400 animate-pulse'
                      : 'bg-gray-500'}"></div>
                {#if state.players.get(ps.playerId)}
                  <PlayerIcon player={state.players.get(ps.playerId)} size={22} />
                {/if}
                <span class="flex-1 text-sm font-semibold text-white truncate">{ps.playerName}</span>
                <span class="text-xs flex-shrink-0
                  {ps.status === 'submitted'
                    ? 'text-emerald-400'
                    : ps.status === 'writing'
                      ? 'text-yellow-400'
                      : 'text-gray-500'}">
                  {ps.status === 'submitted' ? 'Done' : ps.status === 'writing' ? 'Writing...' : 'Browsing'}
                </span>
              </div>
            {/each}
          </div>

          {#if fmTotalWriters > 0}
            <div class="pt-2">
              <div class="flex justify-between text-xs text-gray-400 mb-1">
                <span>Submitted</span>
                <span>{fmWrittenIn} / {fmTotalWriters}</span>
              </div>
              <div class="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  class="h-full bg-emerald-500 rounded-full transition-all"
                  style="width:{(fmWrittenIn / fmTotalWriters) * 100}%"
                ></div>
              </div>
            </div>
          {/if}
        </div>
      </div>

      <!-- Timer -->
      <div class="text-center">
        <p class="text-5xl font-mono font-black {fmBrowseTimeLeft < 5 ? 'text-red-400 animate-pulse' : 'text-white'}">
          {Math.ceil(fmBrowseTimeLeft)}
        </p>
      </div>
    </div>

  {:else if subPhase === "fm_reveal"}
    <!-- Structured Reveal — animated step-by-step -->
    <div class="w-full max-w-3xl space-y-6">
      <div class="text-center">
        <p class="text-sm text-gray-500 uppercase tracking-widest">Message {fmRevealHistory.length}</p>
      </div>

      <!-- Step 0: "Player X commented on..." intro -->
      {#if fmRevealStep >= 0}
        <div class="text-center animate-fade-in">
          <p class="text-2xl text-gray-300">
            <span class="font-black text-white text-3xl">{fmRevealPlayerName}</span>
            <span class="text-gray-400 ml-2">commented on...</span>
          </p>
        </div>
      {/if}

      {#if fmRevealItem && fmRevealStep >= 1}
        <!-- Step 1: Full listing card slides in -->
        <div class="bg-gray-800 border-2 border-emerald-600 rounded-2xl overflow-hidden animate-slide-up max-w-2xl mx-auto">
          <!-- Item hero -->
          <div class="flex gap-6 p-6 items-center">
            <div class="w-28 h-28 bg-gray-700 rounded-xl flex items-center justify-center flex-shrink-0 border border-gray-600">
              <span class="text-6xl">{emojiFor(fmRevealItem.imageHint)}</span>
            </div>
            <div class="flex-1 space-y-1">
              <p class="text-xs text-emerald-400 uppercase tracking-widest">{fmRevealItem.category}</p>
              <p class="text-2xl font-black text-white">{fmRevealItem.name}</p>
              <p class="text-sm text-gray-400">{fmRevealItem.description}</p>
              <p class="text-xl font-black text-emerald-400 mt-1">{formatPrice(fmRevealItem.askingPrice)}</p>
            </div>
          </div>
        </div>
      {/if}

      {#if fmRevealStep >= 2}
        <!-- Step 2: Message pops up below -->
        <div class="bg-gray-900 border-2 border-yellow-500/60 rounded-2xl p-6 max-w-2xl mx-auto animate-pop-in">
          <p class="text-xs text-yellow-400 uppercase tracking-widest mb-3">Message to Seller</p>
          <p class="text-2xl text-white leading-relaxed italic">"{fmRevealMessage}"</p>
          <p class="text-right text-sm text-gray-500 mt-3">-- {fmRevealPlayerName}</p>
        </div>
      {/if}
    </div>

  {:else if subPhase === "fm_voting"}
    <!-- Voting phase -->
    <div class="w-full max-w-2xl space-y-6 text-center">
      <div>
        <h1 class="text-3xl font-black text-emerald-400">Vote for the Funniest!</h1>
        <p class="text-lg text-gray-400 mt-2">Players are voting on their phones</p>
      </div>

      <!-- Candidates list -->
      <div class="space-y-3 max-w-2xl mx-auto">
        {#each fmVotingEntries as entry}
          <div class="bg-gray-800 border border-gray-700 rounded-2xl px-6 py-4 flex items-start gap-4">
            <PlayerIcon player={state.players.get(entry.playerId)} size={36} />
            <div class="w-20 h-20 rounded-xl bg-gray-700 border border-gray-600 flex items-center justify-center flex-shrink-0">
              <span class="text-5xl">{emojiFor(entry.item.imageHint)}</span>
            </div>
            <div class="flex-1 text-left space-y-1 min-w-0">
              <div class="flex items-center gap-3">
                <span class="text-lg font-semibold text-white">{entry.playerName}</span>
                <span class="text-[10px] uppercase tracking-widest text-emerald-400">{entry.item.category}</span>
              </div>
              <p class="text-xl font-black text-white">{entry.item.name}</p>
              <p class="text-sm text-gray-400 line-clamp-2">{entry.item.description}</p>
              <p class="text-lg text-gray-100 italic line-clamp-3">"{entry.message}"</p>
            </div>
          </div>
        {/each}
      </div>

      <!-- Timer -->
      <p class="text-5xl font-mono font-black {fmVotingTimeLeft < 5 ? 'text-red-400 animate-pulse' : 'text-white'}">
        {Math.ceil(fmVotingTimeLeft)}
      </p>

      <!-- Vote progress -->
      {#if fmTotalVoters > 0}
        <div class="w-64 mx-auto">
          <div class="flex justify-between text-sm text-gray-400 mb-1">
            <span>Votes in</span>
            <span>{fmVotesIn} / {fmTotalVoters}</span>
          </div>
          <div class="h-3 bg-gray-700 rounded-full overflow-hidden">
            <div
              class="h-full bg-emerald-500 rounded-full transition-all"
              style="width:{(fmVotesIn / fmTotalVoters) * 100}%"
            ></div>
          </div>
        </div>
      {/if}
    </div>

  {:else if subPhase === "fm_results"}
    <!-- Funny Messages Results -->
    <div class="w-full max-w-3xl space-y-6">
      <h1 class="text-3xl font-bold text-center text-emerald-400">Round Results</h1>

      {#if fmResults}
        <!-- Winner highlight -->
        {#if fmWinnerEntry}
          <div class="text-center bg-yellow-900/40 border-2 border-yellow-500 rounded-2xl p-6 shadow-lg max-w-2xl mx-auto">
            <p class="text-sm text-yellow-400 uppercase tracking-widest mb-2">Funniest Message</p>
            <p class="text-4xl font-black text-yellow-200">{fmWinnerEntry.playerName}</p>
            <p class="text-lg text-yellow-400 mt-2">
              {fmWinnerEntry.voteCount} vote{fmWinnerEntry.voteCount !== 1 ? "s" : ""}
            </p>
            <div class="bg-gray-900/50 rounded-xl p-4 mt-4">
              <p class="text-sm text-gray-400">
                Re: <span class="text-emerald-400">{fmWinnerEntry.itemName}</span>
              </p>
              <p class="text-xl text-white italic mt-1">"{fmWinnerEntry.message}"</p>
            </div>
          </div>
        {/if}

        <!-- All entries ranked -->
        <div class="bg-gray-800 rounded-xl p-4">
          <p class="text-xs text-gray-400 uppercase tracking-widest mb-3 text-center">All Messages</p>
          <div class="space-y-3">
            {#each fmSortedEntries as entry, i}
              {@const isWinner = entry.playerId === fmResults?.winner}
              {@const points = fmResults?.scores[entry.playerId] ?? 0}
              <div class="flex items-start gap-3 {isWinner ? '' : ''}">
                <span class="w-6 text-center font-mono text-sm mt-1 {isWinner ? 'text-yellow-400' : 'text-gray-500'}">
                  {i + 1}.
                </span>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-semibold text-white">{entry.playerName}</span>
                    {#if isWinner}
                      <span class="text-yellow-400 text-xs">★ WINNER</span>
                    {/if}
                    <span class="ml-auto text-sm text-gray-500">{entry.voteCount} vote{entry.voteCount !== 1 ? "s" : ""}</span>
                    <span class="text-sm font-mono {points > 0 ? 'text-green-400' : 'text-gray-500'}">+{points}</span>
                  </div>
                  <p class="text-sm text-gray-400 mt-1">
                    <span class="text-emerald-400">{entry.itemName}</span>:
                    <span class="italic text-gray-300">"{entry.message}"</span>
                  </p>
                </div>
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
                <PlayerIcon player={p} size={24} />
                <span class="flex-1 truncate font-semibold text-white">{p.name}</span>
                <span class="font-mono text-lg font-bold text-white">{p.score}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes slide-up {
    from { opacity: 0; transform: translateY(30px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes pop-in {
    0% { opacity: 0; transform: scale(0.8) translateY(20px); }
    60% { opacity: 1; transform: scale(1.03) translateY(-2px); }
    100% { opacity: 1; transform: scale(1) translateY(0); }
  }
  :global(.animate-fade-in) {
    animation: fade-in 0.5s ease-out both;
  }
  :global(.animate-slide-up) {
    animation: slide-up 0.6s ease-out both;
  }
  :global(.animate-pop-in) {
    animation: pop-in 0.5s ease-out both;
  }
</style>
