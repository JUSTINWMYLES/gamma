<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { Room } from "colyseus.js";
  import type { PlayerState, RoomState } from "../../../../shared/types";
  import WantedPosterCard, { type WantedPosterViewData } from "../../components/WantedPosterCard.svelte";

  export let room: Room;
  export let state: RoomState;
  export let me: PlayerState | undefined;

  type SubPhase = "waiting" | "submission" | "submitted" | "reveal" | "voting" | "result";

  type PosterData = WantedPosterViewData & { submittedAt: number };

  let subPhase: SubPhase = "waiting";
  let roundSkipped = false;
  let skipReason = "";

  let targetPlayerId = "";
  let targetPlayerName = "";
  let conditionInput = "Dead or Alive";
  let bountyInput = "";
  let reasonInput = "";
  let conditionSuggestions: string[] = [];
  let submitted = false;
  let submittedCount = 0;
  let totalPlayers = 0;

  let revealPoster: PosterData | null = null;
  let revealIndex = 0;
  let revealTotal = 0;

  let votingPosters: PosterData[] = [];
  let voteSubmitted = false;
  let myVote = "";
  let voteError = "";
  let votesIn = 0;
  let totalVoters = 0;

  let resultPosters: PosterData[] = [];
  let winnerAuthorIds: string[] = [];
  let roundScores: Record<string, number> = {};
  let totalVotes = 0;

  let timeLeft = 0;
  let timerInterval: ReturnType<typeof setInterval> | null = null;

  function playerById(playerId: string): PlayerState | undefined {
    return [...state.players.values()].find((player) => player.id === playerId);
  }

  function startTimerFromEnd(endTimeMs: number) {
    clearTimer();
    const tick = () => {
      timeLeft = Math.max(0, (endTimeMs - Date.now()) / 1000);
    };
    tick();
    timerInterval = setInterval(tick, 100);
  }

  function clearTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function resetForm() {
    conditionInput = "Dead or Alive";
    bountyInput = "";
    reasonInput = "";
    submitted = false;
  }

  function submitPoster() {
    if (submitted) return;
    room.send("game_input", {
      action: "wa_submit_poster",
      condition: conditionInput,
      bounty: bountyInput,
      reason: reasonInput,
    });
  }

  function voteFor(authorId: string) {
    if (voteSubmitted || !authorId || authorId === me?.id) return;
    myVote = authorId;
    voteError = "";
    room.send("game_input", { action: "wa_vote", targetAuthorId: authorId });
  }

  function onSubmissionStart(data: { totalPlayers: number; conditionSuggestions?: string[] }) {
    roundSkipped = false;
    skipReason = "";
    submittedCount = 0;
    totalPlayers = data.totalPlayers;
    conditionSuggestions = data.conditionSuggestions ?? conditionSuggestions;
  }

  function onAssignment(data: {
    targetPlayerId: string;
    targetPlayerName: string;
    durationMs: number;
    serverTimestamp: number;
    conditionSuggestions?: string[];
  }) {
    subPhase = "submission";
    targetPlayerId = data.targetPlayerId;
    targetPlayerName = data.targetPlayerName;
    conditionSuggestions = data.conditionSuggestions ?? conditionSuggestions;
    resetForm();
    startTimerFromEnd(data.serverTimestamp + data.durationMs);
  }

  function onSubmitAck(data: { accepted: boolean; reason?: string }) {
    if (!data.accepted) return;
    submitted = true;
    subPhase = "submitted";
  }

  function onSubmissionProgress(data: { submittedCount: number; totalPlayers: number }) {
    submittedCount = data.submittedCount;
    totalPlayers = data.totalPlayers;
  }

  function onRevealStart(data: { totalPosters: number }) {
    clearTimer();
    subPhase = "reveal";
    revealPoster = null;
    revealIndex = 0;
    revealTotal = data.totalPosters;
  }

  function onRevealPoster(data: {
    poster: PosterData;
    index: number;
    totalPosters: number;
    displayMs: number;
    serverTimestamp: number;
  }) {
    subPhase = "reveal";
    revealPoster = data.poster;
    revealIndex = data.index + 1;
    revealTotal = data.totalPosters;
    startTimerFromEnd(data.serverTimestamp + data.displayMs);
  }

  function onVotingStart(data: {
    posters: PosterData[];
    durationMs: number;
    serverTimestamp: number;
    totalVoters: number;
  }) {
    subPhase = "voting";
    votingPosters = data.posters.filter((poster) => poster.authorId !== me?.id);
    totalVoters = data.totalVoters;
    votesIn = 0;
    myVote = "";
    voteSubmitted = false;
    voteError = "";
    startTimerFromEnd(data.serverTimestamp + data.durationMs);
  }

  function onVoteAck(data: { accepted: boolean; reason?: string; targetAuthorId?: string }) {
    if (data.accepted) {
      voteSubmitted = true;
      myVote = data.targetAuthorId ?? myVote;
      return;
    }
    myVote = "";
    voteError = data.reason ?? "Vote failed";
  }

  function onVoteUpdate(data: { votesIn: number; totalVoters: number }) {
    votesIn = data.votesIn;
    totalVoters = data.totalVoters;
  }

  function onRoundResult(data: {
    posters: PosterData[];
    winnerAuthorIds: string[];
    scores: Record<string, number>;
    totalVotes: number;
  }) {
    clearTimer();
    subPhase = "result";
    resultPosters = data.posters;
    winnerAuthorIds = data.winnerAuthorIds;
    roundScores = data.scores;
    totalVotes = data.totalVotes;
  }

  function onRoundSkipped(data: { reason: string }) {
    clearTimer();
    roundSkipped = true;
    skipReason = data.reason;
  }

  onMount(() => {
    room.onMessage("wa_submission_start", onSubmissionStart);
    room.onMessage("wa_assignment", onAssignment);
    room.onMessage("wa_submit_ack", onSubmitAck);
    room.onMessage("wa_submission_progress", onSubmissionProgress);
    room.onMessage("wa_reveal_start", onRevealStart);
    room.onMessage("wa_reveal_poster", onRevealPoster);
    room.onMessage("wa_voting_start", onVotingStart);
    room.onMessage("wa_vote_ack", onVoteAck);
    room.onMessage("wa_vote_update", onVoteUpdate);
    room.onMessage("wa_round_result", onRoundResult);
    room.onMessage("round_skipped", onRoundSkipped);
  });

  onDestroy(() => {
    clearTimer();
  });

  $: myRoundScore = me ? roundScores[me.id] ?? 0 : 0;
  $: draftPoster = {
    authorId: me?.id ?? "",
    targetPlayerId,
    targetPlayerName,
    condition: conditionInput,
    bounty: bountyInput.trim() ? Number(bountyInput.replace(/[^\d]/g, "")) || null : null,
    reason: reasonInput,
  } as WantedPosterViewData;
  $: myPosterResult = me ? resultPosters.find((poster) => poster.authorId === me.id) ?? null : null;
</script>

<div class="flex-1 flex flex-col gap-4 p-4 overflow-y-auto" data-testid="wanted-ad-player">
  {#if roundSkipped}
    <div class="text-center space-y-3 mt-8">
      <h2 class="text-xl font-black text-yellow-400">Round Skipped</h2>
      <p class="text-gray-300">{skipReason}</p>
    </div>

  {:else if subPhase === "waiting"}
    <div class="text-center space-y-4 mt-8">
      <h2 class="text-3xl font-black text-amber-300 tracking-[0.2em]">WANTED AD</h2>
      <p class="text-gray-300">Waiting for the sheriff to hand you a blank poster...</p>
    </div>

  {:else if subPhase === "submission" || subPhase === "submitted"}
    <div class="space-y-4">
      <div class="rounded-3xl border border-amber-500/30 bg-amber-950/30 p-4 space-y-2">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-xs uppercase tracking-[0.3em] text-amber-200/80">Poster Assignment</p>
            <h2 class="text-2xl font-black text-amber-100">Build a poster for {targetPlayerName}</h2>
          </div>
          <p class:animate-pulse={timeLeft < 10} class="text-3xl font-black font-mono text-white">{Math.ceil(timeLeft)}</p>
        </div>
        <p class="text-sm text-amber-50/80">Fill in any fields you want, then the town votes for their favourite. The portrait uses {targetPlayerName}'s player icon automatically.</p>
        <div class="space-y-2">
          <div class="flex items-center justify-between text-sm text-amber-100/80">
            <span>Posters turned in</span>
            <span>{submittedCount} / {totalPlayers}</span>
          </div>
          <div class="h-3 rounded-full bg-black/30 overflow-hidden">
            <div class="h-full bg-amber-400 transition-all duration-500" style="width:{totalPlayers > 0 ? (submittedCount / totalPlayers) * 100 : 0}%"></div>
          </div>
        </div>
      </div>

      <WantedPosterCard poster={draftPoster} targetPlayer={playerById(targetPlayerId)} audioPlaceholder />

      <div class="rounded-3xl border border-white/10 bg-gray-900/70 p-4 space-y-4">
        <label class="block space-y-2">
          <span class="text-sm font-bold uppercase tracking-[0.2em] text-gray-300">Wanted dead / alive / whatever</span>
          <input
            bind:value={conditionInput}
            maxlength="28"
            class="w-full rounded-2xl border border-amber-600/40 bg-amber-50/95 px-4 py-3 text-lg font-semibold text-amber-950 outline-none"
            placeholder="Dead or Alive"
            disabled={submitted}
          />
        </label>

        <div class="flex flex-wrap gap-2">
          {#each conditionSuggestions as suggestion}
            <button
              class="rounded-full border border-amber-500/40 px-3 py-1 text-xs font-bold uppercase tracking-[0.15em] text-amber-200"
              on:click={() => (conditionInput = suggestion)}
              disabled={submitted}
            >{suggestion}</button>
          {/each}
        </div>

        <label class="block space-y-2">
          <span class="text-sm font-bold uppercase tracking-[0.2em] text-gray-300">Bounty price</span>
          <input
            bind:value={bountyInput}
            inputmode="numeric"
            class="w-full rounded-2xl border border-amber-600/40 bg-amber-50/95 px-4 py-3 text-lg font-semibold text-amber-950 outline-none"
            placeholder="$5,000"
            disabled={submitted}
          />
        </label>

        <label class="block space-y-2">
          <span class="text-sm font-bold uppercase tracking-[0.2em] text-gray-300">Why are they wanted?</span>
          <textarea
            bind:value={reasonInput}
            maxlength="96"
            rows="3"
            class="w-full rounded-2xl border border-amber-600/40 bg-amber-50/95 px-4 py-3 text-base font-semibold text-amber-950 outline-none"
            placeholder="Stole every pie in town and vanished into the sunset..."
            disabled={submitted}
          ></textarea>
        </label>

        <button
          class="w-full rounded-2xl bg-amber-500 px-4 py-3 text-lg font-black text-amber-950 disabled:opacity-50"
          on:click={submitPoster}
          disabled={submitted}
        >{submitted ? "Poster Submitted" : "Pin Poster To Wall"}</button>
      </div>
    </div>

  {:else if subPhase === "reveal"}
    <div class="space-y-4">
      <div class="rounded-3xl border border-amber-500/30 bg-amber-950/30 p-4 text-center space-y-2">
        <p class="text-xs uppercase tracking-[0.3em] text-amber-200/80">Sheriff Showcase</p>
        <h2 class="text-2xl font-black text-amber-100">Poster {revealIndex} of {revealTotal}</h2>
        <p class:animate-pulse={timeLeft < 4} class="text-4xl font-black font-mono text-white">{Math.ceil(timeLeft)}</p>
      </div>

      {#if revealPoster}
        <WantedPosterCard
          poster={revealPoster}
          targetPlayer={playerById(revealPoster.targetPlayerId)}
          showAuthor
          authorName={state.players.get(revealPoster.authorId)?.name ?? "Unknown Deputy"}
          audioPlaceholder
          featuredLabel="On Display"
        />
      {/if}
    </div>

  {:else if subPhase === "voting"}
    <div class="space-y-4">
      <div class="rounded-3xl border border-purple-500/30 bg-purple-950/30 p-4 space-y-2">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-xs uppercase tracking-[0.3em] text-purple-200/80">Vote</p>
            <h2 class="text-2xl font-black text-purple-100">Pick the poster you liked most</h2>
          </div>
          <p class:animate-pulse={timeLeft < 10} class="text-3xl font-black font-mono text-white">{Math.ceil(timeLeft)}</p>
        </div>
        <div class="flex items-center justify-between text-sm text-purple-100/80">
          <span>Votes in</span>
          <span>{votesIn} / {totalVoters}</span>
        </div>
        {#if voteError}
          <p class="text-sm font-semibold text-red-300">{voteError}</p>
        {/if}
      </div>

      <div class="grid gap-4">
        {#each votingPosters as poster}
          <button
            class:selected={myVote === poster.authorId}
            class="rounded-[28px] border border-white/10 bg-transparent p-0 text-left transition-transform hover:-translate-y-1 disabled:opacity-70"
            on:click={() => voteFor(poster.authorId)}
            disabled={voteSubmitted}
          >
            <WantedPosterCard
              poster={poster}
              targetPlayer={playerById(poster.targetPlayerId)}
              compact
              showAuthor
              authorName={state.players.get(poster.authorId)?.name ?? "Unknown Deputy"}
              audioPlaceholder
            />
          </button>
        {/each}
      </div>
    </div>

  {:else if subPhase === "result"}
    <div class="space-y-4 pb-6">
      <div class="rounded-3xl border border-emerald-500/30 bg-emerald-950/30 p-4 space-y-2">
        <p class="text-xs uppercase tracking-[0.3em] text-emerald-200/80">Results</p>
        <h2 class="text-2xl font-black text-emerald-100">
          {winnerAuthorIds.length > 0
            ? `${winnerAuthorIds.map((id) => state.players.get(id)?.name ?? "Unknown Deputy").join(" & ")} won the vote`
            : "No winning poster this round"}
        </h2>
        <p class="text-sm text-emerald-50/80">You earned <span class="font-black text-white">{myRoundScore}</span> points this round. Total votes cast: {totalVotes}.</p>
        {#if myPosterResult}
          <p class="text-sm text-emerald-50/70">Your poster pulled in {myPosterResult.voteCount ?? 0} vote{(myPosterResult.voteCount ?? 0) === 1 ? "" : "s"}.</p>
        {/if}
      </div>

      <div class="grid gap-4">
        {#each resultPosters as poster}
          <WantedPosterCard
            poster={poster}
            targetPlayer={playerById(poster.targetPlayerId)}
            compact
            showAuthor
            authorName={state.players.get(poster.authorId)?.name ?? "Unknown Deputy"}
            showVoteCount
            audioPlaceholder
            featuredLabel={poster.isWinner ? "Winner" : "Finalist"}
          />
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  button.selected :global(.poster-shell) {
    transform: translateY(-4px);
    box-shadow: 0 0 0 2px rgba(196, 181, 253, 0.6), 0 22px 40px rgba(0,0,0,0.35);
  }
</style>
