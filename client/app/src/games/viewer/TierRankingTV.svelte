<script lang="ts">
  /**
   * TV/Viewer game component for "S-Tier Ranking" (registry-11).
   *
   * Displays the category-pick prompt, entry count during submission,
   * tier-ranking countdown, and the animated results reveal.
   *
   * Server messages listened:
   *   tr_category_phase, tr_category_chosen, tr_entry_phase, tr_entry_ack,
   *   tr_ranking_phase, tr_round_result, round_skipped
   */
  import { onMount, onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState } from "../../../../shared/types";
  import PlayerIcon from "../../components/PlayerIcon.svelte";

  export let room: Room;
  export let state: RoomState;

  // ── Sub-phase state ──────────────────────────────────────────────
  type SubPhase =
    | "waiting"
    | "category_pick"
    | "entry_submit"
    | "tier_rank"
    | "result";

  let subPhase: SubPhase = "waiting";

  // ── Category phase ───────────────────────────────────────────────
  let chooserName = "";
  let categoryDurationMs = 30000;
  let categoryStartedAt = 0;
  let category = "";

  // ── Entry phase ──────────────────────────────────────────────────
  let currentEntryCount = 0;
  let totalPlayers = 0;
  let entryDurationMs = 30000;
  let entryStartedAt = 0;

  // ── Ranking phase ────────────────────────────────────────────────
  let rankingItems: string[] = [];
  let rankingDurationMs = 90000;
  let rankingStartedAt = 0;

  // ── Results ──────────────────────────────────────────────────────
  const TIERS = ["S", "A", "B", "C", "D"] as const;
  type Tier = (typeof TIERS)[number];

  interface FinalTier {
    item: string;
    tier: Tier;
    voteCounts: Record<Tier, number>;
  }
  let finalTiers: FinalTier[] = [];
  let roundScores: Record<string, number> = {};
  let resultCategory = "";
  let revealedCount = 0;

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

  // ── Results reveal animation ─────────────────────────────────────
  let revealInterval: ReturnType<typeof setInterval> | null = null;

  function startReveal(tiers: FinalTier[]) {
    revealedCount = 0;
    finalTiers = tiers;
    if (revealInterval) clearInterval(revealInterval);
    revealInterval = setInterval(() => {
      if (revealedCount < finalTiers.length) {
        revealedCount++;
      } else {
        if (revealInterval) clearInterval(revealInterval);
      }
    }, 800);
  }

  // ── Message handlers ─────────────────────────────────────────────
  function onCategoryPhase(data: {
    chooserId: string;
    chooserName: string;
    suggestions: string[];
    durationMs: number;
  }) {
    chooserName = data.chooserName;
    categoryDurationMs = data.durationMs;
    categoryStartedAt = Date.now();
    category = "";
    roundSkipped = false;
    currentEntryCount = 0;
    totalPlayers = state.players.size;
    subPhase = "category_pick";
    startTimer(categoryStartedAt, categoryDurationMs);
  }

  function onCategoryChosen(data: { category: string }) {
    clearTimer();
    category = data.category;
  }

  function onEntryPhase(data: { category: string; durationMs: number }) {
    category = data.category;
    entryDurationMs = data.durationMs;
    entryStartedAt = Date.now();
    currentEntryCount = 0;
    totalPlayers = state.players.size;
    subPhase = "entry_submit";
    startTimer(entryStartedAt, entryDurationMs);
  }

  function onEntryAck(data: { accepted: boolean; currentEntryCount: number }) {
    if (data.accepted) {
      currentEntryCount = data.currentEntryCount;
    }
  }

  function onRankingPhase(data: { items: string[]; category: string; durationMs: number }) {
    clearTimer();
    rankingItems = data.items;
    category = data.category;
    rankingDurationMs = data.durationMs;
    rankingStartedAt = Date.now();
    subPhase = "tier_rank";
    startTimer(rankingStartedAt, rankingDurationMs);
  }

  function onRoundResult(data: {
    finalTiers: FinalTier[];
    scores: Record<string, number>;
    category: string;
  }) {
    clearTimer();
    roundScores = data.scores;
    resultCategory = data.category;
    subPhase = "result";
    startReveal(data.finalTiers);
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
    room.onMessage("tr_round_result", onRoundResult);
    room.onMessage("round_skipped", onRoundSkipped);
  });

  onDestroy(() => {
    clearTimer();
    if (revealInterval) clearInterval(revealInterval);
  });

  // ── Derived ──────────────────────────────────────────────────────
  $: timerDisplay = Math.ceil(timeLeft);
  $: sortedPlayers = [...state.players.values()].sort(
    (a, b) => (roundScores[b.id] ?? 0) - (roundScores[a.id] ?? 0),
  );

  const TIER_BG: Record<string, string> = {
    S: "bg-yellow-500",
    A: "bg-green-600",
    B: "bg-blue-600",
    C: "bg-purple-600",
    D: "bg-gray-600",
  };
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-8 p-12" data-testid="tier-ranking-tv">
  {#if roundSkipped}
    <h2 class="text-3xl font-black text-yellow-400">Round Skipped</h2>
    <p class="text-xl text-gray-300">{skipReason}</p>

  {:else if subPhase === "waiting"}
    <h2 class="text-6xl font-black text-yellow-400">S-Tier Ranking</h2>
    <p class="text-2xl text-gray-300">Predict the group's consensus to score!</p>
    <p class="text-gray-400">Waiting for round to start...</p>

  {:else if subPhase === "category_pick"}
    <div class="text-center space-y-6">
      <p class="text-xl text-gray-400 uppercase tracking-widest">Category Pick</p>
      <p class="text-7xl font-mono font-black {timerDisplay < 10 ? 'text-red-400 animate-pulse' : 'text-white'}">
        {timerDisplay}
      </p>
      <div class="space-y-2">
        <p class="text-3xl font-black text-yellow-400">{chooserName}</p>
        <p class="text-xl text-gray-300">is choosing the category...</p>
      </div>
      {#if category}
        <div class="mt-4 bg-gray-800 rounded-2xl px-8 py-4 border border-yellow-500/40">
          <p class="text-3xl font-black text-white">{category}</p>
        </div>
      {/if}
    </div>

  {:else if subPhase === "entry_submit"}
    <div class="text-center space-y-6">
      <p class="text-xl text-gray-400 uppercase tracking-widest">Submit Your Entry</p>
      <p class="text-7xl font-mono font-black {timerDisplay < 10 ? 'text-red-400 animate-pulse' : 'text-white'}">
        {timerDisplay}
      </p>
      <div class="bg-gray-800 rounded-2xl px-8 py-4">
        <p class="text-3xl font-black text-teal-400">{category}</p>
      </div>
      <!-- Entry count progress -->
      <div class="space-y-2">
        <p class="text-gray-400">
          <span class="text-2xl font-black text-white">{currentEntryCount}</span>
          <span class="text-lg"> / {totalPlayers} entries submitted</span>
        </p>
        <div class="w-64 h-3 bg-gray-700 rounded-full overflow-hidden">
          <div
            class="h-full bg-teal-500 rounded-full transition-all duration-500"
            style="width:{totalPlayers > 0 ? (currentEntryCount / totalPlayers) * 100 : 0}%"
          ></div>
        </div>
      </div>
    </div>

  {:else if subPhase === "tier_rank"}
    <div class="text-center space-y-6">
      <p class="text-xl text-gray-400 uppercase tracking-widest">Tier Rank Everything!</p>
      <p class="text-9xl font-mono font-black {timerDisplay < 10 ? 'text-red-400 animate-pulse' : 'text-white'}">
        {timerDisplay}
      </p>
      <div class="bg-gray-800 rounded-2xl px-8 py-4">
        <p class="text-2xl font-black text-rose-400">{category}</p>
      </div>
      <!-- Items list -->
      <div class="flex flex-wrap gap-3 justify-center max-w-2xl">
        {#each rankingItems as item}
          <span class="bg-gray-700 rounded-lg px-4 py-2 text-white font-bold">{item}</span>
        {/each}
      </div>
      <!-- Tier legend -->
      <div class="flex gap-4 justify-center mt-2">
        {#each TIERS as tier}
          <div class="flex items-center gap-1">
            <span class="w-6 h-6 rounded font-black text-sm text-white flex items-center justify-center {TIER_BG[tier]}">{tier}</span>
          </div>
        {/each}
      </div>
    </div>

  {:else if subPhase === "result"}
    <div class="w-full max-w-4xl space-y-6">
      <div class="text-center space-y-1">
        <p class="text-xl text-gray-400 uppercase tracking-widest">Results</p>
        <p class="text-3xl font-black text-white">{resultCategory}</p>
      </div>

      <!-- Tier list reveal -->
      <div class="space-y-3">
        {#each finalTiers.slice(0, revealedCount) as { item, tier, voteCounts }}
          <div class="flex items-center gap-4 bg-gray-800 rounded-xl px-6 py-3">
            <!-- Tier badge -->
            <span class="w-12 h-12 rounded-xl font-black text-xl text-white flex items-center justify-center flex-shrink-0 {TIER_BG[tier]}">
              {tier}
            </span>
            <!-- Item name -->
            <p class="flex-1 text-xl font-bold text-white">{item}</p>
            <!-- Vote distribution -->
            <div class="flex gap-3 text-sm">
              {#each TIERS as t}
                <span class="{t === tier ? 'text-white font-black' : 'text-gray-500'}">
                  {t}: {voteCounts[t]}
                </span>
              {/each}
            </div>
          </div>
        {/each}
      </div>

      <!-- Top scores -->
      {#if revealedCount >= finalTiers.length}
        <div class="mt-6">
          <p class="text-center text-lg text-gray-400 uppercase tracking-widest mb-3">Round Scores</p>
          <div class="flex flex-wrap gap-3 justify-center">
            {#each sortedPlayers as p}
              <div class="bg-gray-800 rounded-xl px-4 py-2 text-center flex items-center gap-3">
                <PlayerIcon player={p} size={24} />
                <p class="flex-1 text-sm text-gray-400 text-left">{p.name}</p>
                <p class="text-2xl font-black {(roundScores[p.id] ?? 0) > 0 ? 'text-yellow-400' : 'text-gray-500'}">
                  +{roundScores[p.id] ?? 0}
                </p>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>
