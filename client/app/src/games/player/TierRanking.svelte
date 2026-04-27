<script lang="ts">
  /**
   * Phone game component for "S-Tier Ranking" (registry-11).
   *
   * Server messages listened:
   *   tr_category_phase, tr_category_chosen, tr_entry_phase, tr_entry_ack,
   *   tr_ranking_phase, tr_rankings_ack, tr_round_result, round_skipped
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
    | "category_pick_chooser"
    | "category_pick_waiting"
    | "entry_submit"
    | "tier_rank"
    | "result";

  let subPhase: SubPhase = "waiting";

  // ── Category phase ───────────────────────────────────────────────
  let chooserId = "";
  let chooserName = "";
  let suggestions: string[] = [];
  let categoryInput = "";
  let categoryChosen = "";
  let categoryDurationMs = 30000;
  let categoryStartedAt = 0;

  // ── Entry phase ──────────────────────────────────────────────────
  let category = "";
  let entryInput = "";
  let entrySubmitted = false;
  let entryAccepted = false;
  let entryRejectedReason = "";
  let currentEntryCount = 0;
  let entryDurationMs = 30000;
  let entryStartedAt = 0;

  // ── Ranking phase ────────────────────────────────────────────────
  const TIERS = ["S", "A", "B", "C", "D"] as const;
  type Tier = (typeof TIERS)[number];

  let rankingItems: string[] = [];
  let playerTierChoices: Record<string, Tier | ""> = {};
  let rankingsSubmitted = false;
  let rankingDurationMs = 90000;
  let rankingStartedAt = 0;

  // ── Results ──────────────────────────────────────────────────────
  interface FinalTier {
    item: string;
    tier: Tier;
    voteCounts: Record<Tier, number>;
  }
  let finalTiers: FinalTier[] = [];
  let roundScores: Record<string, number> = {};
  let resultCategory = "";

  // ── Round skipped ────────────────────────────────────────────────
  let roundSkipped = false;
  let skipReason = "";

  // ── Timer ────────────────────────────────────────────────────────
  let timeLeft = 0;
  let timerInterval: ReturnType<typeof setInterval> | null = null;

  function startTimer(startedAt: number, durationMs: number) {
    clearTimer();
    timerInterval = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      timeLeft = Math.max(0, (durationMs - elapsed) / 1000);
    }, 100);
  }

  function clearTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  // ── Actions ──────────────────────────────────────────────────────
  function submitCategory(cat: string) {
    const trimmed = cat.trim();
    if (!trimmed) return;
    room.send("game_input", { action: "tr_set_category", category: trimmed });
    categoryChosen = trimmed;
  }

  function submitEntry() {
    const trimmed = entryInput.trim();
    if (!trimmed || entrySubmitted) return;
    entrySubmitted = true;
    entryRejectedReason = "";
    room.send("game_input", { action: "tr_submit_entry", entry: trimmed });
  }

  function setTier(item: string, tier: Tier) {
    if (rankingsSubmitted) return;
    playerTierChoices = { ...playerTierChoices, [item]: tier };
  }

  function submitRankings() {
    if (rankingsSubmitted) return;
    const allRanked = rankingItems.every((item) => playerTierChoices[item]);
    if (!allRanked) return;

    rankingsSubmitted = true;
    const rankings = rankingItems.map((item) => ({
      item,
      tier: playerTierChoices[item] as Tier,
    }));
    room.send("game_input", { action: "tr_submit_rankings", rankings });
  }

  // ── Message handlers ─────────────────────────────────────────────
  function onCategoryPhase(data: {
    chooserId: string;
    chooserName: string;
    suggestions: string[];
    durationMs: number;
  }) {
    chooserId = data.chooserId;
    chooserName = data.chooserName;
    suggestions = data.suggestions;
    categoryDurationMs = data.durationMs;
    categoryStartedAt = Date.now();
    categoryChosen = "";
    roundSkipped = false;

    subPhase = me?.id === chooserId ? "category_pick_chooser" : "category_pick_waiting";
    startTimer(categoryStartedAt, categoryDurationMs);
  }

  function onCategoryChosen(data: { category: string }) {
    clearTimer();
    category = data.category;
    // Move to entry phase next
  }

  function onEntryPhase(data: { category: string; durationMs: number }) {
    category = data.category;
    entryDurationMs = data.durationMs;
    entryStartedAt = Date.now();
    entryInput = "";
    entrySubmitted = false;
    entryAccepted = false;
    entryRejectedReason = "";
    currentEntryCount = 0;
    subPhase = "entry_submit";
    startTimer(entryStartedAt, entryDurationMs);
  }

  function onEntryAck(data: { accepted: boolean; reason?: string; currentEntryCount: number }) {
    currentEntryCount = data.currentEntryCount;
    if (data.accepted) {
      entryAccepted = true;
    } else {
      entrySubmitted = false;
      entryRejectedReason = data.reason ?? "That entry was not accepted.";
    }
  }

  function onRankingPhase(data: { items: string[]; category: string; durationMs: number }) {
    clearTimer();
    rankingItems = data.items;
    category = data.category;
    rankingDurationMs = data.durationMs;
    rankingStartedAt = Date.now();
    rankingsSubmitted = false;
    // Reset choices
    playerTierChoices = {};
    for (const item of rankingItems) {
      playerTierChoices[item] = "";
    }
    subPhase = "tier_rank";
    startTimer(rankingStartedAt, rankingDurationMs);
  }

  function onRankingsAck() {
    // Acknowledged — just wait for results
  }

  function onRoundResult(data: {
    finalTiers: FinalTier[];
    scores: Record<string, number>;
    category: string;
  }) {
    clearTimer();
    finalTiers = data.finalTiers;
    roundScores = data.scores;
    resultCategory = data.category;
    subPhase = "result";
  }

  function onRoundSkipped(data: { reason: string }) {
    clearTimer();
    roundSkipped = true;
    skipReason = data.reason;
  }

  // ── Lifecycle ────────────────────────────────────────────────────
  onMount(() => {
    room.onMessage("tr_category_phase", onCategoryPhase);
    room.onMessage("tr_category_chosen", onCategoryChosen);
    room.onMessage("tr_entry_phase", onEntryPhase);
    room.onMessage("tr_entry_ack", onEntryAck);
    room.onMessage("tr_ranking_phase", onRankingPhase);
    room.onMessage("tr_rankings_ack", onRankingsAck);
    room.onMessage("tr_round_result", onRoundResult);
    room.onMessage("round_skipped", onRoundSkipped);
  });

  onDestroy(() => {
    clearTimer();
  });

  // ── Derived ──────────────────────────────────────────────────────
  $: timerDisplay = Math.ceil(timeLeft);
  $: allRanked = rankingItems.length > 0 && rankingItems.every((item) => playerTierChoices[item]);
  $: myRoundScore = me ? roundScores[me.id] ?? 0 : 0;

  const TIER_COLORS: Record<string, string> = {
    S: "bg-yellow-500 hover:bg-yellow-400",
    A: "bg-green-600 hover:bg-green-500",
    B: "bg-blue-600 hover:bg-blue-500",
    C: "bg-purple-600 hover:bg-purple-500",
    D: "bg-gray-600 hover:bg-gray-500",
  };

  const TIER_SELECTED_COLORS: Record<string, string> = {
    S: "bg-yellow-500 ring-2 ring-yellow-300",
    A: "bg-green-600 ring-2 ring-green-300",
    B: "bg-blue-600 ring-2 ring-blue-300",
    C: "bg-purple-600 ring-2 ring-purple-300",
    D: "bg-gray-600 ring-2 ring-gray-300",
  };
</script>

<div class="flex-1 flex flex-col gap-4 overflow-y-auto rounded-[28px] border border-slate-800 bg-gray-950 p-4" data-testid="tier-ranking">
  {#if roundSkipped}
    <div class="text-center space-y-3 mt-8">
      <h2 class="text-xl font-black text-yellow-400">Round Skipped</h2>
      <p class="text-gray-300">{skipReason}</p>
    </div>

  {:else if subPhase === "waiting"}
    <div class="text-center space-y-4 mt-8">
      <h2 class="text-3xl font-black text-yellow-400">S-Tier Ranking</h2>
      <p class="text-gray-300">Predict the group's consensus to score!</p>
      <p class="text-gray-400 text-sm">Waiting for round to start...</p>
    </div>

  {:else if subPhase === "category_pick_chooser"}
    <!-- ── Chooser: pick a category ──────────────────────────── -->
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-black text-yellow-400">You're the Chooser!</h2>
        <p class="text-2xl font-mono font-bold {timerDisplay < 10 ? 'text-red-400' : 'text-white'}">{timerDisplay}</p>
      </div>
      <p class="text-gray-300 text-sm">Pick a category or type your own:</p>

      <!-- Free text input -->
      <div class="flex gap-2">
        <input
          type="text"
          placeholder="Type your own category..."
          bind:value={categoryInput}
          maxlength={60}
          class="flex-1 px-3 py-2 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-yellow-400"
          on:keydown={(e) => e.key === "Enter" && submitCategory(categoryInput)}
        />
        <button
          class="px-4 py-2 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-sm active:scale-95 transition-transform"
          on:click={() => submitCategory(categoryInput)}
        >Go</button>
      </div>

      <!-- Suggestions -->
      <div class="space-y-1">
        <p class="text-xs text-gray-500 uppercase tracking-widest">Suggestions</p>
        <div class="grid grid-cols-2 gap-2">
          {#each suggestions as suggestion}
            <button
              class="px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-gray-200 text-sm text-left
                hover:border-yellow-500 hover:bg-gray-700 active:scale-95 transition-all"
              on:click={() => submitCategory(suggestion)}
            >{suggestion}</button>
          {/each}
        </div>
      </div>
    </div>

  {:else if subPhase === "category_pick_waiting"}
    <!-- ── Non-chooser: waiting ───────────────────────────────── -->
    <div class="text-center space-y-4 mt-8">
      <p class="text-xs text-gray-500 uppercase tracking-widest">Category Pick</p>
      <p class="text-2xl font-mono font-bold {timerDisplay < 10 ? 'text-red-400' : 'text-white'}">{timerDisplay}</p>
      <div class="bg-gray-800 rounded-2xl p-6 space-y-2">
        <p class="text-4xl">🎲</p>
        <p class="text-lg font-bold text-yellow-400">{chooserName}</p>
        <p class="text-gray-400 text-sm">is choosing the category...</p>
      </div>
    </div>

  {:else if subPhase === "entry_submit"}
    <!-- ── Entry submission ───────────────────────────────────── -->
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-black text-teal-400">Submit Your Entry</h2>
        <p class="text-2xl font-mono font-bold {timerDisplay < 10 ? 'text-red-400' : 'text-white'}">{timerDisplay}</p>
      </div>

      <div class="bg-gray-800 rounded-xl px-4 py-3">
        <p class="text-xs text-gray-500 uppercase tracking-widest">Category</p>
        <p class="text-lg font-bold text-white">{category}</p>
      </div>

      {#if entryAccepted}
        <div class="bg-green-900/40 rounded-xl p-4 border border-green-500/30 text-center">
          <p class="text-green-400 font-bold text-lg">✓ Entry submitted!</p>
          <p class="text-gray-400 text-sm mt-1">"{entryInput}" is locked in.</p>
          <p class="text-gray-500 text-xs mt-2">{currentEntryCount} submission{currentEntryCount !== 1 ? "s" : ""} so far</p>
        </div>
      {:else}
        <div class="space-y-3">
          <input
            type="text"
            placeholder="Your entry for this category..."
            bind:value={entryInput}
            maxlength={60}
            disabled={entrySubmitted}
            class="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-600 text-white placeholder-gray-500
              focus:outline-none focus:border-teal-400 disabled:opacity-50"
            on:keydown={(e) => e.key === "Enter" && submitEntry()}
          />

          {#if entryRejectedReason}
            <p class="text-red-400 text-sm">{entryRejectedReason}</p>
          {/if}

          <button
            class="w-full py-3 rounded-xl font-bold text-white
              bg-teal-600 hover:bg-teal-500 active:scale-95 transition-transform
              disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={!entryInput.trim() || entrySubmitted}
            on:click={submitEntry}
          >Submit Entry</button>

          <p class="text-xs text-gray-500 text-center">{currentEntryCount} submission{currentEntryCount !== 1 ? "s" : ""} so far</p>
        </div>
      {/if}
    </div>

  {:else if subPhase === "tier_rank"}
    <!-- ── Tier ranking ───────────────────────────────────────── -->
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-black text-rose-400">Rank Everything!</h2>
        <p class="text-2xl font-mono font-bold {timerDisplay < 10 ? 'text-red-400' : 'text-white'}">{timerDisplay}</p>
      </div>

      <div class="bg-gray-800 rounded-xl px-4 py-2">
        <p class="text-xs text-gray-500 uppercase tracking-widest">Category</p>
        <p class="font-bold text-white">{category}</p>
      </div>

      {#if rankingsSubmitted}
        <div class="bg-green-900/40 rounded-xl p-4 border border-green-500/30 text-center">
          <p class="text-green-400 font-bold">✓ Rankings submitted!</p>
          <p class="text-gray-400 text-sm">Waiting for results...</p>
        </div>
      {:else}
        <div class="space-y-3">
          {#each rankingItems as item}
            <div class="bg-gray-800 rounded-xl p-3 space-y-2">
              <p class="font-bold text-white text-sm">{item}</p>
              <div class="flex gap-1">
                {#each TIERS as tier}
                  <button
                    class="flex-1 py-2 rounded-lg text-xs font-black text-white transition-all active:scale-95
                      {playerTierChoices[item] === tier
                        ? TIER_SELECTED_COLORS[tier]
                        : TIER_COLORS[tier] + ' opacity-60'}"
                    on:click={() => setTier(item, tier)}
                  >{tier}</button>
                {/each}
              </div>
            </div>
          {/each}

          <button
            class="w-full py-3 rounded-xl font-bold text-white transition-all active:scale-95
              {allRanked
                ? 'bg-rose-600 hover:bg-rose-500'
                : 'bg-gray-700 opacity-40 cursor-not-allowed'}"
            disabled={!allRanked}
            on:click={submitRankings}
          >
            {allRanked ? "Submit Rankings!" : `Rank all ${rankingItems.length} items to submit`}
          </button>
        </div>
      {/if}
    </div>

  {:else if subPhase === "result"}
    <!-- ── Results ────────────────────────────────────────────── -->
    <div class="space-y-3">
      <div class="text-center space-y-1">
        <p class="text-xs text-gray-300 uppercase tracking-widest">Results</p>
        <p class="font-bold text-gray-200">{resultCategory}</p>
      </div>

      <div class="space-y-2">
        {#each finalTiers as { item, tier, voteCounts }}
          {@const myVote = playerTierChoices[item]}
          {@const didMatch = myVote === tier}
          <div class="bg-gray-800 rounded-xl p-3 space-y-1 border
            {didMatch ? 'border-green-500/40' : 'border-gray-700'}">
            <div class="flex items-center justify-between">
              <p class="text-sm font-bold text-white truncate">{item}</p>
              <span class="text-lg font-black ml-2
                {tier === 'S' ? 'text-yellow-400' :
                 tier === 'A' ? 'text-green-400' :
                 tier === 'B' ? 'text-blue-400' :
                 tier === 'C' ? 'text-purple-400' : 'text-gray-400'}">
                {tier}
              </span>
            </div>
            <div class="flex gap-1 text-xs text-gray-300">
              {#each TIERS as t}
                <span class="{t === tier ? 'text-white font-bold' : ''}">{t}:{voteCounts[t]}</span>
              {/each}
              {#if myVote}
                <span class="ml-2 {didMatch ? 'text-green-400' : 'text-red-400'}">
                  (you: {myVote}{didMatch ? ' ✓' : ' ✕'})
                </span>
              {/if}
            </div>
          </div>
        {/each}
      </div>

      <div class="text-center mt-4">
        <p class="text-sm text-gray-300">Your score this round:</p>
        <p class="text-4xl font-black {myRoundScore > 0 ? 'text-yellow-400' : 'text-gray-400'}">
          +{myRoundScore}
        </p>
      </div>
    </div>
  {/if}
</div>
