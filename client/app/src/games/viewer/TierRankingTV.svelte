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
  const REVEAL_TIERS = ["D", "C", "B", "A", "S"] as const;

  interface FinalTier {
    item: string;
    tier: Tier;
    voteCounts: Record<Tier, number>;
  }
  let finalTiers: FinalTier[] = [];
  let roundScores: Record<string, number> = {};
  let resultCategory = "";
  let revealedCount = 0;
  let revealStepMs = 5000;

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
    }, revealStepMs);
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
    revealStepMs?: number;
  }) {
    clearTimer();
    roundScores = data.scores;
    resultCategory = data.category;
    revealStepMs = data.revealStepMs ?? 5000;
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
  $: revealedItems = finalTiers.slice(0, revealedCount);
  $: currentlyRevealedItem = revealedItems[revealedItems.length - 1] ?? null;
  $: tierBoard = REVEAL_TIERS.map((tier) => ({
    tier,
    items: revealedItems.filter((entry) => entry.tier === tier),
  }));

  const TIER_BG: Record<Tier, string> = {
    S: "bg-gradient-to-r from-amber-300 via-yellow-400 to-orange-400",
    A: "bg-gradient-to-r from-emerald-400 to-green-500",
    B: "bg-gradient-to-r from-sky-400 to-blue-500",
    C: "bg-gradient-to-r from-violet-400 to-purple-500",
    D: "bg-gradient-to-r from-slate-500 to-gray-600",
  };

  const TIER_TEXT: Record<Tier, string> = {
    S: "text-amber-950",
    A: "text-emerald-950",
    B: "text-blue-950",
    C: "text-violet-950",
    D: "text-slate-100",
  };
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-8 bg-[#09090f] p-12 text-white" data-testid="tier-ranking-tv">
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
    <div class="w-full max-w-[1200px] space-y-6">
      <div class="grid items-stretch gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div class="space-y-2">
          <p class="text-sm uppercase tracking-[0.4em] text-amber-300/70">Consensus Tier Board</p>
          <p class="text-5xl font-black text-white">{resultCategory}</p>
          <p class="text-lg text-gray-400">Revealing one item every 5 seconds, from the basement tiers up to the all-time greats.</p>
        </div>

        <div class="min-h-[150px] rounded-3xl border border-white/10 bg-white/5 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
          <p class="text-xs uppercase tracking-[0.3em] text-gray-400">Latest Reveal</p>
          {#if currentlyRevealedItem}
            <div class="mt-3 flex items-center gap-4">
              <div class={`flex h-16 w-16 items-center justify-center rounded-2xl text-3xl font-black ${TIER_BG[currentlyRevealedItem.tier]} ${TIER_TEXT[currentlyRevealedItem.tier]}`}>
                {currentlyRevealedItem.tier}
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-2xl font-black text-white">{currentlyRevealedItem.item}</p>
                <div class="mt-2 flex gap-3 text-sm">
                  {#each REVEAL_TIERS.slice().reverse() as t}
                    <span class={t === currentlyRevealedItem.tier ? 'font-black text-white' : 'text-gray-300'}>{t}:{currentlyRevealedItem.voteCounts[t]}</span>
                  {/each}
                </div>
              </div>
            </div>
          {:else}
            <div class="mt-4 flex h-[88px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/20 text-sm uppercase tracking-[0.3em] text-gray-400">
              Waiting for first reveal
            </div>
          {/if}
        </div>
      </div>

      <div class="space-y-3 rounded-[32px] border border-white/10 bg-[#0f1020] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
        {#each tierBoard.slice().reverse() as row}
          <div class="grid min-h-[92px] grid-cols-[110px_1fr] overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
            <div class={`flex items-center justify-center text-5xl font-black ${TIER_BG[row.tier]} ${TIER_TEXT[row.tier]}`}>
              {row.tier}
            </div>
            <div class="flex min-h-[92px] flex-wrap items-center gap-3 px-4 py-3">
              {#if row.items.length > 0}
                {#each row.items as item}
                  <div class="max-w-[220px] rounded-2xl border border-white/10 bg-black/30 px-4 py-3 shadow-[0_14px_30px_rgba(0,0,0,0.25)]">
                    <p class="text-lg font-black text-white leading-tight">{item.item}</p>
                    <p class="mt-2 text-xs uppercase tracking-[0.2em] text-gray-400">
                      {#each REVEAL_TIERS.slice().reverse() as t, index}
                        <span class={t === item.tier ? 'font-black text-white' : 'text-gray-300'}>{t}:{item.voteCounts[t]}</span>{index < REVEAL_TIERS.length - 1 ? ' ' : ''}
                      {/each}
                    </p>
                  </div>
                {/each}
              {:else}
                <p class="text-sm uppercase tracking-[0.3em] text-gray-400">Waiting for reveal...</p>
              {/if}
            </div>
          </div>
        {/each}
      </div>

      {#if revealedCount >= finalTiers.length}
        <div class="mt-2 space-y-3">
          <p class="text-center text-sm uppercase tracking-[0.35em] text-gray-500">Round Scores</p>
          <div class="flex flex-wrap justify-center gap-3">
            {#each sortedPlayers as p}
              <div class="flex min-w-[220px] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <PlayerIcon player={p} size={24} />
                <p class="flex-1 truncate text-sm text-gray-300">{p.name}</p>
                <p class={`text-2xl font-black ${(roundScores[p.id] ?? 0) > 0 ? 'text-amber-300' : 'text-gray-300'}`}>
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
