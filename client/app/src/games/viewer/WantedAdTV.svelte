<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState } from "../../../../shared/types";
  import { getRoundProgressLabel } from "../../../../shared/types";
  import WantedPosterCard, { type WantedPosterViewData } from "../../components/WantedPosterCard.svelte";
  import PlayerIcon from "../../components/PlayerIcon.svelte";

  export let room: Room;
  export let state: RoomState;

  type SubPhase = "waiting" | "character_creation" | "submission" | "reveal" | "voting" | "result";
  type PosterData = WantedPosterViewData & { submittedAt: number };

  let subPhase: SubPhase = "waiting";
  let roundSkipped = false;
  let skipReason = "";

  let submittedCount = 0;
  let totalPlayers = 0;

  let revealPoster: PosterData | null = null;
  let revealIndex = 0;
  let revealTotal = 0;

  let votingPosters: PosterData[] = [];
  let votesIn = 0;
  let totalVoters = 0;
  let votingFeaturedIndex = 0;
  let votingRotateTimer: ReturnType<typeof setInterval> | null = null;

  let resultPosters: PosterData[] = [];
  let winnerAuthorIds: string[] = [];
  let roundScores: Record<string, number> = {};
  let totalVotes = 0;

  let timeLeft = 0;
  let timerInterval: ReturnType<typeof setInterval> | null = null;

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

  function clearVotingRotation() {
    if (votingRotateTimer) {
      clearInterval(votingRotateTimer);
      votingRotateTimer = null;
    }
    votingFeaturedIndex = 0;
  }

  function onCharacterCreationStart(data: { totalPlayers: number; durationMs: number; serverTimestamp: number }) {
    subPhase = "character_creation";
    roundSkipped = false;
    skipReason = "";
    submittedCount = 0;
    totalPlayers = data.totalPlayers;
    startTimerFromEnd(data.serverTimestamp + data.durationMs);
  }

  function onCharacterProgress(data: { submittedCount: number; totalPlayers: number }) {
    submittedCount = data.submittedCount;
    totalPlayers = data.totalPlayers;
  }

  function onSubmissionStart(data: { totalPlayers: number; durationMs: number; serverTimestamp: number }) {
    subPhase = "submission";
    roundSkipped = false;
    skipReason = "";
    submittedCount = 0;
    totalPlayers = data.totalPlayers;
    startTimerFromEnd(data.serverTimestamp + data.durationMs);
  }

  function onSubmissionProgress(data: { submittedCount: number; totalPlayers: number }) {
    submittedCount = data.submittedCount;
    totalPlayers = data.totalPlayers;
  }

  function onRevealStart(data: { totalPosters: number }) {
    clearTimer();
    clearVotingRotation();
    subPhase = "reveal";
    revealPoster = null;
    revealIndex = 0;
    revealTotal = data.totalPosters;
  }

  function onRevealPoster(data: { poster: PosterData; index: number; totalPosters: number; displayMs: number; serverTimestamp: number }) {
    subPhase = "reveal";
    revealPoster = data.poster;
    revealIndex = data.index + 1;
    revealTotal = data.totalPosters;
    startTimerFromEnd(data.serverTimestamp + data.displayMs);
  }

  function onVotingStart(data: { posters: PosterData[]; durationMs: number; serverTimestamp: number; totalVoters: number }) {
    clearVotingRotation();
    subPhase = "voting";
    votingPosters = data.posters;
    votesIn = 0;
    totalVoters = data.totalVoters;
    startTimerFromEnd(data.serverTimestamp + data.durationMs);

    if (votingPosters.length > 1) {
      const stepMs = Math.max(2500, Math.min(6000, Math.floor(data.durationMs / votingPosters.length)));
      votingRotateTimer = setInterval(() => {
        votingFeaturedIndex = (votingFeaturedIndex + 1) % votingPosters.length;
      }, stepMs);
    }
  }

  function onVoteUpdate(data: { votesIn: number; totalVoters: number }) {
    votesIn = data.votesIn;
    totalVoters = data.totalVoters;
  }

  function onRoundResult(data: { posters: PosterData[]; winnerAuthorIds: string[]; scores: Record<string, number>; totalVotes: number }) {
    clearTimer();
    clearVotingRotation();
    subPhase = "result";
    resultPosters = data.posters;
    winnerAuthorIds = data.winnerAuthorIds;
    roundScores = data.scores;
    totalVotes = data.totalVotes;
  }

  function onRoundSkipped(data: { reason: string }) {
    clearTimer();
    clearVotingRotation();
    roundSkipped = true;
    skipReason = data.reason;
  }

  onMount(() => {
    room.onMessage("wa_character_creation_start", onCharacterCreationStart);
    room.onMessage("wa_character_progress", onCharacterProgress);
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
    clearVotingRotation();
  });

  $: timerDisplay = String(Math.max(0, Math.ceil(timeLeft))).padStart(2, "0");
  $: playerCards = [...state.players.values()];
  $: leaderboard = [...state.players.values()].sort((a, b) => (roundScores[b.id] ?? b.score) - (roundScores[a.id] ?? a.score));
  $: featuredVotingPoster = votingPosters.length > 0 ? votingPosters[Math.min(votingFeaturedIndex, votingPosters.length - 1)] : null;
</script>

<div class="wanted-tv-shell" data-testid="wanted-ad-tv">
  {#if roundSkipped}
    <div class="text-center space-y-3">
      <p class="text-lg uppercase tracking-[0.4em] text-amber-200/70">Sheriff's Office</p>
      <h2 class="text-5xl font-black text-amber-100">Round Skipped</h2>
      <p class="text-xl text-amber-50/80">{skipReason}</p>
    </div>

  {:else if subPhase === "waiting"}
    <div class="text-center space-y-4 max-w-4xl">
      <p class="text-lg uppercase tracking-[0.5em] text-amber-200/70">Sheriff's Office</p>
      <h2 class="text-7xl font-black text-amber-100 tracking-[0.2em]">WANTED AD</h2>
      <p class="text-2xl text-amber-50/80">Players invent outlaws, swap them around the room, write posters, then vote for the funniest bounty on the board.</p>
    </div>

  {:else if subPhase === "character_creation"}
    <div class="w-full max-w-7xl space-y-8">
      <div class="flex items-start justify-between gap-8">
        <div class="space-y-3 max-w-4xl">
          <p class="text-lg uppercase tracking-[0.4em] text-red-200/70">{getRoundProgressLabel(state)}</p>
          <h2 class="text-6xl font-black text-red-100 tracking-[0.12em]">Invent New Outlaws</h2>
          <p class="text-xl text-red-50/80">Everyone is drawing a fresh frontier character. Once the sheriff has enough new faces, the posters get reassigned so nobody writes their own outlaw.</p>
        </div>
        <div class="text-right shrink-0">
          <p class:animate-pulse={timeLeft < 10} class="min-w-[3ch] text-right text-7xl font-black font-mono tabular-nums text-yellow-300">{timerDisplay}</p>
          <p class="text-sm uppercase tracking-[0.3em] text-red-200/60">seconds left</p>
        </div>
      </div>

      <div class="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] items-start">
        <div class="rounded-[32px] border border-red-500/25 bg-red-950/20 p-8 space-y-5">
          <div class="flex items-center justify-between text-red-100/85">
            <span class="text-sm uppercase tracking-[0.3em]">Characters turned in</span>
            <span class="text-2xl font-black">{submittedCount} / {totalPlayers}</span>
          </div>
          <div class="h-4 overflow-hidden rounded-full bg-black/30">
            <div class="h-full bg-red-400 transition-all duration-500" style="width:{totalPlayers > 0 ? (submittedCount / totalPlayers) * 100 : 0}%"></div>
          </div>
          <div class="grid grid-cols-2 xl:grid-cols-3 gap-4 pt-2">
            {#each playerCards as player}
              <div class="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 flex items-center gap-3">
                <PlayerIcon {player} size={42} />
                <div>
                  <p class="font-black text-white">{player.name}</p>
                  <p class="text-xs uppercase tracking-[0.2em] text-red-100/55">Sketching outlaw</p>
                </div>
              </div>
            {/each}
          </div>
        </div>

        <div class="rounded-[32px] border border-red-500/25 bg-black/25 p-8 space-y-4">
          <p class="text-sm uppercase tracking-[0.3em] text-red-200/70">What each player submits</p>
          <div class="space-y-3 text-lg text-red-50/80">
            <p>Name the outlaw.</p>
            <p>Draw their portrait.</p>
            <p>Write a quick one-line description.</p>
          </div>
          <p class="text-base text-red-50/65">Only the characters that actually get submitted move into the poster-writing pool, so the round can keep going even if somebody misses the timer.</p>
        </div>
      </div>
    </div>

  {:else if subPhase === "submission"}
    <div class="w-full max-w-7xl space-y-8">
      <div class="flex items-start justify-between gap-8">
        <div class="space-y-3 max-w-4xl">
          <p class="text-lg uppercase tracking-[0.4em] text-amber-200/70">Poster Writing</p>
          <h2 class="text-6xl font-black text-amber-100 tracking-[0.12em]">Put A Price On Their Head</h2>
          <p class="text-xl text-amber-50/80">Players received someone else's new outlaw. They keep the portrait and description, then write the condition, bounty text, and reason the town wants them caught.</p>
        </div>
        <div class="text-right shrink-0">
          <p class:animate-pulse={timeLeft < 10} class="min-w-[3ch] text-right text-7xl font-black font-mono tabular-nums text-yellow-300">{timerDisplay}</p>
          <p class="text-sm uppercase tracking-[0.3em] text-amber-200/60">seconds left</p>
        </div>
      </div>

      <div class="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] items-start">
        <div class="rounded-[32px] border border-amber-500/25 bg-amber-950/20 p-8 space-y-5">
          <div class="flex items-center justify-between text-amber-100/85">
            <span class="text-sm uppercase tracking-[0.3em]">Posters turned in</span>
            <span class="text-2xl font-black">{submittedCount} / {totalPlayers}</span>
          </div>
          <div class="h-4 overflow-hidden rounded-full bg-black/30">
            <div class="h-full bg-amber-400 transition-all duration-500" style="width:{totalPlayers > 0 ? (submittedCount / totalPlayers) * 100 : 0}%"></div>
          </div>
          <div class="grid grid-cols-2 xl:grid-cols-3 gap-4 pt-2">
            {#each playerCards as player}
              <div class="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 flex items-center gap-3">
                <PlayerIcon {player} size={42} />
                <div>
                  <p class="font-black text-white">{player.name}</p>
                  <p class="text-xs uppercase tracking-[0.2em] text-amber-100/55">Writing bounty</p>
                </div>
              </div>
            {/each}
          </div>
        </div>

        <div class="rounded-[32px] border border-amber-500/25 bg-black/25 p-8 space-y-4">
          <p class="text-sm uppercase tracking-[0.3em] text-amber-200/70">Poster ingredients</p>
          <div class="space-y-3 text-lg text-amber-50/80">
            <p>Custom condition line</p>
            <p>Free-form bounty text</p>
            <p>Ridiculous accusation</p>
          </div>
          <p class="text-base text-amber-50/65">The reveal wall uses the finished posters exactly as players wrote them, so wild bounty wording and dense descriptions need to stay readable at TV size.</p>
        </div>
      </div>
    </div>

  {:else if subPhase === "reveal"}
    <div class="w-full max-w-7xl grid gap-8 lg:grid-cols-[0.72fr_1.28fr] items-center">
      <div class="space-y-4">
        <p class="text-lg uppercase tracking-[0.4em] text-amber-200/70">Poster Reveal</p>
        <h2 class="text-6xl font-black text-amber-100 tracking-[0.15em]">Wanted Wall</h2>
        <p class="text-amber-50/80 text-xl">Each finished poster gets the full spotlight before the town votes.</p>
        <p class:animate-pulse={timeLeft < 4} class="min-w-[3ch] text-left text-8xl font-black font-mono tabular-nums text-yellow-300">{timerDisplay}</p>
        <p class="text-xl text-amber-200/70">Poster {revealIndex} of {revealTotal}</p>
      </div>

      <div class="featured-poster-stage">
        {#if revealPoster}
          <WantedPosterCard
            poster={revealPoster}
            showAuthor
            authorName={state.players.get(revealPoster.authorId)?.name ?? "Unknown Deputy"}
            featuredLabel="Now Showing"
            emphasis="showcase"
          />
        {/if}
      </div>
    </div>

  {:else if subPhase === "voting"}
    <div class="w-full max-w-7xl space-y-6">
      <div class="flex items-start justify-between gap-8">
        <div>
          <p class="text-lg uppercase tracking-[0.4em] text-fuchsia-200/70">Town Vote</p>
          <h2 class="text-6xl font-black text-fuchsia-100">Which poster steals the show?</h2>
          <p class="text-xl text-fuchsia-50/80">Players vote on the funniest, most convincing wanted ad.</p>
        </div>
        <div class="text-right shrink-0">
          <p class:animate-pulse={timeLeft < 10} class="min-w-[3ch] text-right text-7xl font-black font-mono tabular-nums text-yellow-300">{timerDisplay}</p>
          <p class="text-sm uppercase tracking-[0.3em] text-fuchsia-200/60">seconds left</p>
        </div>
      </div>

      <div class="rounded-[28px] border border-fuchsia-500/25 bg-fuchsia-950/20 p-5 flex items-center justify-between text-fuchsia-100/85">
        <span class="uppercase tracking-[0.3em] text-sm">Votes in</span>
        <span class="text-2xl font-black">{votesIn} / {totalVoters}</span>
      </div>

      <div class="grid gap-6 xl:grid-cols-[1fr_0.9fr] items-start">
        <div class="featured-poster-stage min-h-[28rem]">
          {#if featuredVotingPoster}
            <WantedPosterCard
              poster={featuredVotingPoster}
              showAuthor
              authorName={state.players.get(featuredVotingPoster.authorId)?.name ?? "Unknown Deputy"}
              featuredLabel={`Ballot ${votingFeaturedIndex + 1}/${votingPosters.length}`}
              emphasis="showcase"
            />
          {/if}
        </div>

        <div class="rounded-[28px] border border-white/10 bg-black/25 p-5 space-y-3">
          <p class="text-sm uppercase tracking-[0.3em] text-fuchsia-200/70">Voting queue</p>
          <div class="space-y-2 max-h-[26rem] overflow-y-auto pr-1">
            {#each votingPosters as poster, index}
              <div class={`flex items-center gap-3 rounded-xl border px-3 py-2 ${index === votingFeaturedIndex ? "border-fuchsia-400/50 bg-fuchsia-900/25" : "border-white/10 bg-black/25"}`}>
                <span class="text-xs font-black text-fuchsia-200/80 w-8">#{index + 1}</span>
                <span class="flex-1 truncate text-white font-semibold">{state.players.get(poster.authorId)?.name ?? "Unknown Deputy"}</span>
                {#if index === votingFeaturedIndex}
                  <span class="text-[10px] uppercase tracking-[0.2em] text-fuchsia-200">On screen</span>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>

  {:else if subPhase === "result"}
    <div class="wanted-panel wanted-panel-result w-full max-w-7xl space-y-5">
      <div class="flex items-start justify-between gap-6">
        <div class="space-y-2 max-w-4xl min-w-0">
          <p class="text-lg uppercase tracking-[0.4em] text-emerald-200/70">Final Results</p>
          <h2 class="text-[clamp(2.6rem,4.2vw,4.4rem)] leading-[0.95] font-black text-emerald-100">
            {winnerAuthorIds.length > 0
              ? `${winnerAuthorIds.map((id) => state.players.get(id)?.name ?? "Unknown Deputy").join(" & ")} won the town vote`
              : "No poster claimed the prize this round"}
          </h2>
          <p class="text-lg text-emerald-50/80">Total votes cast: {totalVotes}</p>
        </div>

        <div class="rounded-[28px] border border-white/10 bg-black/25 p-4 min-w-[250px] max-w-[280px] shrink-0">
          <p class="text-sm uppercase tracking-[0.3em] text-emerald-200/70 mb-3">Scoreboard</p>
          <div class="space-y-2.5">
            {#each leaderboard.slice(0, 4) as player}
              <div class="flex items-center gap-3">
                <PlayerIcon {player} size={32} />
                <span class="flex-1 truncate text-white font-semibold">{player.name}</span>
                <span class="font-black text-emerald-100">{roundScores[player.id] ?? player.score}</span>
              </div>
            {/each}
          </div>
        </div>
      </div>

      <div class="poster-grid poster-grid-result">
        {#each resultPosters as poster}
          <WantedPosterCard
            poster={poster}
            compact
            showAuthor
            authorName={state.players.get(poster.authorId)?.name ?? "Unknown Deputy"}
            showVoteCount
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
    min-height: 0;
    padding: 1.75rem 2rem 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background:
      radial-gradient(circle at top, rgba(255, 205, 120, 0.16), transparent 30%),
      linear-gradient(180deg, #3b1808 0%, #1c0904 65%, #120603 100%);
  }

  .wanted-panel {
    max-height: calc(100vh - 5.5rem);
  }

  .wanted-panel-result {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .featured-poster-stage {
    min-height: min(68vh, 720px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.75rem;
    border-radius: 32px;
    background: rgba(0, 0, 0, 0.18);
    border: 1px solid rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }

  .poster-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1rem;
    align-items: start;
  }

  .poster-grid-result {
    flex: 1;
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    align-content: start;
    overflow: hidden;
  }
</style>
