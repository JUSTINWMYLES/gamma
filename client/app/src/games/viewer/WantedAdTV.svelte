<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState, PlayerState } from "../../../../shared/types";
  import { getRoundProgressLabel } from "../../../../shared/types";
  import WantedPosterCard, { type WantedPosterViewData } from "../../components/WantedPosterCard.svelte";
  import PlayerIcon from "../../components/PlayerIcon.svelte";

  export let room: Room;
  export let state: RoomState;

  type SubPhase = "waiting" | "submission" | "reveal" | "voting" | "result";
  type PosterData = WantedPosterViewData & { submittedAt: number };

  let subPhase: SubPhase = "waiting";
  let roundSkipped = false;
  let skipReason = "";

  let submittedCount = 0;
  let totalPlayers = 0;
  let conditionSuggestions: string[] = [];

  let revealPoster: PosterData | null = null;
  let revealIndex = 0;
  let revealTotal = 0;

  let votingPosters: PosterData[] = [];
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

  function onSubmissionStart(data: {
    totalPlayers: number;
    durationMs: number;
    serverTimestamp: number;
    conditionSuggestions?: string[];
  }) {
    subPhase = "submission";
    roundSkipped = false;
    skipReason = "";
    submittedCount = 0;
    totalPlayers = data.totalPlayers;
    conditionSuggestions = data.conditionSuggestions ?? [];
    startTimerFromEnd(data.serverTimestamp + data.durationMs);
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
    votingPosters = data.posters;
    votesIn = 0;
    totalVoters = data.totalVoters;
    startTimerFromEnd(data.serverTimestamp + data.durationMs);
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
    room.onMessage("wa_submission_progress", onSubmissionProgress);
    room.onMessage("wa_reveal_start", onRevealStart);
    room.onMessage("wa_reveal_poster", onRevealPoster);
    room.onMessage("wa_voting_start", onVotingStart);
    room.onMessage("wa_vote_update", onVoteUpdate);
    room.onMessage("wa_round_result", onRoundResult);
    room.onMessage("round_skipped", onRoundSkipped);
  });

  onDestroy(() => {
    clearTimer();
  });

  $: leaderboard = [...state.players.values()].sort((a, b) => (roundScores[b.id] ?? b.score) - (roundScores[a.id] ?? a.score));
</script>

<div class="wanted-tv-shell" data-testid="wanted-ad-tv">
  {#if roundSkipped}
    <div class="text-center space-y-3">
      <p class="text-lg uppercase tracking-[0.4em] text-amber-200/70">Sheriff's Office</p>
      <h2 class="text-5xl font-black text-amber-100">Round Skipped</h2>
      <p class="text-xl text-amber-50/80">{skipReason}</p>
    </div>

  {:else if subPhase === "waiting"}
    <div class="text-center space-y-4">
      <p class="text-lg uppercase tracking-[0.5em] text-amber-200/70">Sheriff's Office</p>
      <h2 class="text-7xl font-black text-amber-100 tracking-[0.2em]">WANTED AD</h2>
      <p class="text-2xl text-amber-50/80">Draft posters, reveal them one by one, then vote for the town favourite.</p>
    </div>

  {:else if subPhase === "submission"}
    <div class="w-full max-w-6xl space-y-8">
      <div class="flex items-start justify-between gap-8">
        <div class="space-y-3">
          <p class="text-lg uppercase tracking-[0.4em] text-amber-200/70">{getRoundProgressLabel(state)}</p>
          <h2 class="text-6xl font-black text-amber-100 tracking-[0.16em]">Fill In The Missing Poster</h2>
          <p class="max-w-3xl text-xl text-amber-50/80">Each deputy is secretly assigned another player from the lobby pool. They fill in the wanted condition, bounty, and reason while the TV keeps the saloon buzzing.</p>
        </div>
        <div class="text-right">
          <p class:animate-pulse={timeLeft < 10} class="text-7xl font-black font-mono text-white">{Math.ceil(timeLeft)}</p>
          <p class="text-sm uppercase tracking-[0.3em] text-amber-200/60">seconds left</p>
        </div>
      </div>

      <div class="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] items-start">
        <div class="rounded-[32px] border border-amber-500/25 bg-amber-950/25 p-8 space-y-5">
          <div class="flex items-center justify-between text-amber-100/85">
            <span class="text-sm uppercase tracking-[0.3em]">Posters turned in</span>
            <span class="text-2xl font-black">{submittedCount} / {totalPlayers}</span>
          </div>
          <div class="h-4 overflow-hidden rounded-full bg-black/30">
            <div class="h-full bg-amber-400 transition-all duration-500" style="width:{totalPlayers > 0 ? (submittedCount / totalPlayers) * 100 : 0}%"></div>
          </div>
          <div class="grid grid-cols-2 xl:grid-cols-3 gap-4 pt-2">
            {#each [...state.players.values()] as player}
              <div class="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 flex items-center gap-3">
                <PlayerIcon {player} size={40} />
                <div>
                  <p class="font-black text-white">{player.name}</p>
                  <p class="text-xs uppercase tracking-[0.2em] text-amber-100/55">
                    {submittedCount > 0 && submittedCount >= [...state.players.values()].findIndex((p) => p.id === player.id) + 1 ? "In the mix" : "Drafting"}
                  </p>
                </div>
              </div>
            {/each}
          </div>
        </div>

        <div class="rounded-[32px] border border-amber-500/25 bg-black/25 p-8 space-y-4">
          <p class="text-sm uppercase tracking-[0.3em] text-amber-200/70">Sample condition ideas</p>
          <div class="flex flex-wrap gap-3">
            {#each conditionSuggestions as suggestion}
              <span class="rounded-full border border-amber-400/35 px-4 py-2 text-sm font-bold uppercase tracking-[0.15em] text-amber-100/90">{suggestion}</span>
            {/each}
          </div>
          <p class="text-base text-amber-50/70">Portraits pull from each player's icon automatically, and a dedicated audio area is reserved on every poster for future sound cues.</p>
        </div>
      </div>
    </div>

  {:else if subPhase === "reveal"}
    <div class="w-full max-w-6xl grid gap-8 lg:grid-cols-[0.8fr_1.2fr] items-center">
      <div class="space-y-4">
        <p class="text-lg uppercase tracking-[0.4em] text-amber-200/70">Poster Reveal</p>
        <h2 class="text-6xl font-black text-amber-100 tracking-[0.15em]">Wanted Wall</h2>
        <p class="text-amber-50/80 text-xl">Each poster gets a full 10-second spotlight before the town votes.</p>
        <p class:animate-pulse={timeLeft < 4} class="text-8xl font-black font-mono text-white">{Math.ceil(timeLeft)}</p>
        <p class="text-xl text-amber-200/70">Poster {revealIndex} of {revealTotal}</p>
      </div>

      {#if revealPoster}
        <WantedPosterCard
          poster={revealPoster}
          targetPlayer={playerById(revealPoster.targetPlayerId)}
          showAuthor
          authorName={state.players.get(revealPoster.authorId)?.name ?? "Unknown Deputy"}
          featuredLabel="Now Showing"
          audioPlaceholder
        />
      {/if}
    </div>

  {:else if subPhase === "voting"}
    <div class="w-full max-w-7xl space-y-6">
      <div class="flex items-start justify-between gap-8">
        <div>
          <p class="text-lg uppercase tracking-[0.4em] text-fuchsia-200/70">Town Vote</p>
          <h2 class="text-6xl font-black text-fuchsia-100">Which poster steals the show?</h2>
          <p class="text-xl text-fuchsia-50/80">Players vote on the funniest, most convincing wanted ad.</p>
        </div>
        <div class="text-right">
          <p class:animate-pulse={timeLeft < 10} class="text-7xl font-black font-mono text-white">{Math.ceil(timeLeft)}</p>
          <p class="text-sm uppercase tracking-[0.3em] text-fuchsia-200/60">seconds left</p>
        </div>
      </div>

      <div class="rounded-[28px] border border-fuchsia-500/25 bg-fuchsia-950/20 p-5 flex items-center justify-between text-fuchsia-100/85">
        <span class="uppercase tracking-[0.3em] text-sm">Votes in</span>
        <span class="text-2xl font-black">{votesIn} / {totalVoters}</span>
      </div>

      <div class="grid gap-5 lg:grid-cols-3">
        {#each votingPosters as poster}
          <WantedPosterCard
            poster={poster}
            targetPlayer={playerById(poster.targetPlayerId)}
            compact
            showAuthor
            authorName={state.players.get(poster.authorId)?.name ?? "Unknown Deputy"}
            audioPlaceholder
          />
        {/each}
      </div>
    </div>

  {:else if subPhase === "result"}
    <div class="w-full max-w-7xl space-y-8">
      <div class="flex items-start justify-between gap-8">
        <div class="space-y-3">
          <p class="text-lg uppercase tracking-[0.4em] text-emerald-200/70">Final Results</p>
          <h2 class="text-6xl font-black text-emerald-100">
            {winnerAuthorIds.length > 0
              ? `${winnerAuthorIds.map((id) => state.players.get(id)?.name ?? "Unknown Deputy").join(" & ")} won the town vote`
              : "No poster claimed the prize this round"}
          </h2>
          <p class="text-xl text-emerald-50/80">Total votes cast: {totalVotes}</p>
        </div>

        <div class="rounded-[28px] border border-white/10 bg-black/25 p-5 min-w-[260px]">
          <p class="text-sm uppercase tracking-[0.3em] text-emerald-200/70 mb-3">Scoreboard</p>
          <div class="space-y-3">
            {#each leaderboard.slice(0, 4) as player}
              <div class="flex items-center gap-3">
                <PlayerIcon {player} size={36} />
                <span class="flex-1 text-white font-semibold">{player.name}</span>
                <span class="font-black text-emerald-100">{roundScores[player.id] ?? player.score}</span>
              </div>
            {/each}
          </div>
        </div>
      </div>

      <div class="grid gap-5 lg:grid-cols-3">
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
  .wanted-tv-shell {
    flex: 1;
    padding: 3rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background:
      radial-gradient(circle at top, rgba(255, 205, 120, 0.16), transparent 30%),
      linear-gradient(180deg, #3b1808 0%, #1c0904 65%, #120603 100%);
  }
</style>
