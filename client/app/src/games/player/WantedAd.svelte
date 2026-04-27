<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { Room } from "colyseus.js";
  import type { PlayerState, RoomState } from "../../../../shared/types";
  import IconDesignEditor from "../../components/IconDesignEditor.svelte";
  import WantedPosterCard, { type WantedPosterViewData } from "../../components/WantedPosterCard.svelte";
  import {
    createEmptyIconDesign,
    serializeIconDesign,
    type IconDesign,
  } from "../../../../shared/playerIconDesign";

  export let room: Room;
  export let state: RoomState;
  export let me: PlayerState | undefined;

  type SubPhase = "waiting" | "character_creation" | "character_submitted" | "submission" | "submitted" | "reveal" | "voting" | "result";
  type PosterData = WantedPosterViewData & { submittedAt: number };
  type CharacterData = {
    creatorId: string;
    name: string;
    description: string;
    portraitDesign: string;
    submittedAt: number;
  };
  type CharacterAssignment = {
    creatorId: string;
    name: string;
    description: string;
    portraitDesign: string;
  };

  let subPhase: SubPhase = "waiting";
  let roundSkipped = false;
  let skipReason = "";

  let totalPlayers = 0;
  let submittedCount = 0;
  let maxBountyLength = 40;

  let characterNameInput = "";
  let characterDescriptionInput = "";
  let characterDesign: IconDesign = createEmptyIconDesign();
  let characterSubmitted = false;
  let characterError = "";
  let acceptedCharacter: CharacterData | null = null;

  let assignedCharacter: CharacterAssignment | null = null;
  let conditionInput = "Dead or Alive";
  let bountyInput = "";
  let reasonInput = "";
  let posterSubmitted = false;
  let posterError = "";

  let revealPoster: PosterData | null = null;
  let revealIndex = 0;
  let revealTotal = 0;

  let votingPosters: PosterData[] = [];
  let voteSubmitted = false;
  let myVote = "";
  let selectedVoteAuthorId = "";
  let voteError = "";
  let votesIn = 0;
  let totalVoters = 0;

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

  function resetCharacterForm() {
    characterNameInput = "";
    characterDescriptionInput = "";
    characterDesign = createEmptyIconDesign();
    characterSubmitted = false;
    characterError = "";
    acceptedCharacter = null;
  }

  function resetPosterForm() {
    conditionInput = "Dead or Alive";
    bountyInput = "";
    reasonInput = "";
    posterSubmitted = false;
    posterError = "";
  }

  function submitCharacter() {
    if (characterSubmitted) return;
    characterError = "";

    room.send("game_input", {
      action: "wa_submit_character",
      characterName: characterNameInput,
      characterDescription: characterDescriptionInput,
      portraitDesign: serializeIconDesign({ ...characterDesign, text: null }),
    });
  }

  function submitPoster() {
    if (posterSubmitted) return;
    posterError = "";

    room.send("game_input", {
      action: "wa_submit_poster",
      condition: conditionInput,
      bounty: bountyInput,
      reason: reasonInput,
    });
  }

  function selectVote(authorId: string) {
    if (voteSubmitted || !authorId || authorId === me?.id) return;
    selectedVoteAuthorId = authorId;
    voteError = "";
  }

  function submitVote() {
    if (voteSubmitted || !selectedVoteAuthorId || selectedVoteAuthorId === me?.id) return;
    voteError = "";
    room.send("game_input", { action: "wa_vote", targetAuthorId: selectedVoteAuthorId });
  }

  function onCharacterCreationStart(data: { totalPlayers: number; durationMs: number; serverTimestamp: number }) {
    roundSkipped = false;
    skipReason = "";
    totalPlayers = data.totalPlayers;
    submittedCount = 0;
    assignedCharacter = null;
    resetCharacterForm();
    resetPosterForm();
    votingPosters = [];
    revealPoster = null;
    resultPosters = [];
    winnerAuthorIds = [];
    roundScores = {};
    totalVotes = 0;
    subPhase = "character_creation";
    startTimerFromEnd(data.serverTimestamp + data.durationMs);
  }

  function onCharacterAck(data: { accepted: boolean; character?: CharacterData; reason?: string }) {
    if (!data.accepted) {
      characterError = data.reason ?? "Character submission failed";
      return;
    }

    characterSubmitted = true;
    acceptedCharacter = data.character ?? null;
    subPhase = "character_submitted";
  }

  function onCharacterProgress(data: { submittedCount: number; totalPlayers: number }) {
    submittedCount = data.submittedCount;
    totalPlayers = data.totalPlayers;
  }

  function onSubmissionStart(data: { totalPlayers: number; durationMs: number; serverTimestamp: number; maxBountyLength: number }) {
    roundSkipped = false;
    skipReason = "";
    submittedCount = 0;
    totalPlayers = data.totalPlayers;
    maxBountyLength = data.maxBountyLength;
    resetPosterForm();
    subPhase = posterSubmitted ? "submitted" : "waiting";
    startTimerFromEnd(data.serverTimestamp + data.durationMs);
  }

  function onAssignment(data: { character: CharacterAssignment; durationMs: number; serverTimestamp: number; maxBountyLength: number }) {
    assignedCharacter = data.character;
    maxBountyLength = data.maxBountyLength;
    resetPosterForm();
    subPhase = "submission";
    startTimerFromEnd(data.serverTimestamp + data.durationMs);
  }

  function onSubmitAck(data: { accepted: boolean; reason?: string }) {
    if (!data.accepted) {
      posterError = data.reason ?? "Poster submission failed";
      return;
    }

    posterSubmitted = true;
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

  function onRevealPoster(data: { poster: PosterData; index: number; totalPosters: number; displayMs: number; serverTimestamp: number }) {
    subPhase = "reveal";
    revealPoster = data.poster;
    revealIndex = data.index + 1;
    revealTotal = data.totalPosters;
    startTimerFromEnd(data.serverTimestamp + data.displayMs);
  }

  function onVotingStart(data: { posters: PosterData[]; durationMs: number; serverTimestamp: number; totalVoters: number }) {
    subPhase = "voting";
    votingPosters = data.posters.filter((poster) => poster.authorId !== me?.id);
    totalVoters = data.totalVoters;
    votesIn = 0;
    myVote = "";
    selectedVoteAuthorId = "";
    voteSubmitted = false;
    voteError = "";
    startTimerFromEnd(data.serverTimestamp + data.durationMs);
  }

  function onVoteAck(data: { accepted: boolean; reason?: string; targetAuthorId?: string }) {
    if (data.accepted) {
      voteSubmitted = true;
      myVote = data.targetAuthorId ?? myVote;
      selectedVoteAuthorId = data.targetAuthorId ?? selectedVoteAuthorId;
      return;
    }

    selectedVoteAuthorId = "";
    voteError = data.reason ?? "Vote failed";
  }

  function onVoteUpdate(data: { votesIn: number; totalVoters: number }) {
    votesIn = data.votesIn;
    totalVoters = data.totalVoters;
  }

  function onRoundResult(data: { posters: PosterData[]; winnerAuthorIds: string[]; scores: Record<string, number>; totalVotes: number }) {
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
    room.onMessage("wa_character_creation_start", onCharacterCreationStart);
    room.onMessage("wa_character_ack", onCharacterAck);
    room.onMessage("wa_character_progress", onCharacterProgress);
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

  $: timerDisplay = String(Math.max(0, Math.ceil(timeLeft))).padStart(2, "0");
  $: characterPreview = {
    authorId: me?.id ?? "",
    characterCreatorId: me?.id ?? "",
    characterName: characterNameInput,
    characterDescription: characterDescriptionInput,
    portraitDesign: serializeIconDesign({ ...characterDesign, text: null }),
    condition: "Legend pending",
    bounty: "Name your price",
    reason: "This outlaw is still being invented.",
  } satisfies WantedPosterViewData;
  $: draftPoster = {
    authorId: me?.id ?? "",
    characterCreatorId: assignedCharacter?.creatorId ?? "",
    characterName: assignedCharacter?.name ?? "Mystery Outlaw",
    characterDescription: assignedCharacter?.description ?? "Awaiting assignment from the sheriff.",
    portraitDesign: assignedCharacter?.portraitDesign ?? "",
    condition: conditionInput,
    bounty: bountyInput,
    reason: reasonInput,
  } satisfies WantedPosterViewData;
  $: myRoundScore = me ? roundScores[me.id] ?? 0 : 0;
  $: myPosterResult = me ? resultPosters.find((poster) => poster.authorId === me.id) ?? null : null;
</script>

<div class="flex-1 flex flex-col gap-4 p-4 overflow-y-auto rounded-[28px] border border-amber-900/40 bg-gray-950" data-testid="wanted-ad-player">
  {#if roundSkipped}
    <div class="text-center space-y-3 mt-8">
      <h2 class="text-xl font-black text-yellow-400">Round Skipped</h2>
      <p class="text-gray-300">{skipReason}</p>
    </div>

  {:else if subPhase === "waiting"}
    <div class="text-center space-y-4 mt-8">
      <h2 class="text-3xl font-black text-amber-300 tracking-[0.2em]">WANTED AD</h2>
      <p class="text-gray-300">Waiting for the sheriff to hand out the next assignment...</p>
    </div>

  {:else if subPhase === "character_creation" || subPhase === "character_submitted"}
    <div class="space-y-4 pb-6">
      <div class="rounded-3xl border border-red-500/30 bg-red-950/30 p-4 space-y-2">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-xs uppercase tracking-[0.3em] text-red-200/80">Create An Outlaw</p>
            <h2 class="text-2xl font-black text-red-100">Invent a western menace</h2>
          </div>
          <p class:animate-pulse={timeLeft < 10} class="min-w-[2.5ch] text-right text-3xl font-black font-mono tabular-nums text-white">{timerDisplay}</p>
        </div>
        <p class="text-sm text-red-50/80">Name them, sketch them, and give the next player enough detail to write a ridiculous bounty poster.</p>
        <div class="space-y-2">
          <div class="flex items-center justify-between text-sm text-red-100/80">
            <span>Characters turned in</span>
            <span>{submittedCount} / {totalPlayers}</span>
          </div>
          <div class="h-3 rounded-full bg-black/30 overflow-hidden">
            <div class="h-full bg-red-400 transition-all duration-500" style="width:{totalPlayers > 0 ? (submittedCount / totalPlayers) * 100 : 0}%"></div>
          </div>
        </div>
      </div>

      <WantedPosterCard poster={characterPreview} />

      <div class="rounded-3xl border border-white/10 bg-gray-900/70 p-4 space-y-4">
        <label class="block space-y-2">
          <span class="text-sm font-bold uppercase tracking-[0.2em] text-gray-300">Outlaw name</span>
          <input
            bind:value={characterNameInput}
            maxlength="28"
            class="w-full rounded-2xl border border-red-600/40 bg-red-50/95 px-4 py-3 text-lg font-semibold text-red-950 outline-none"
            placeholder="Dusty Biscuit"
            disabled={characterSubmitted}
          />
        </label>

        <label class="block space-y-2">
          <span class="text-sm font-bold uppercase tracking-[0.2em] text-gray-300">Short description</span>
          <textarea
            bind:value={characterDescriptionInput}
            maxlength="120"
            rows="3"
            class="w-full rounded-2xl border border-red-600/40 bg-red-50/95 px-4 py-3 text-base font-semibold text-red-950 outline-none"
            placeholder="Pie thief, train whisperer, and undefeated saloon karaoke champion."
            disabled={characterSubmitted}
          ></textarea>
        </label>

        <IconDesignEditor bind:design={characterDesign} previewName={characterNameInput || me?.name || "Outlaw"} previewSize={112} disabled={characterSubmitted} />

        {#if characterError}
          <p class="text-sm font-semibold text-red-300">{characterError}</p>
        {/if}

        {#if acceptedCharacter}
          <p class="text-sm text-red-100/80">Submitted as <span class="font-black text-white">{acceptedCharacter.name}</span>. The sheriff is now shuffling outlaws between players.</p>
        {/if}

        <button
          class="w-full rounded-2xl bg-red-500 px-4 py-3 text-lg font-black text-red-950 disabled:opacity-50"
          on:click={submitCharacter}
          disabled={characterSubmitted}
        >{characterSubmitted ? "Character Submitted" : "Send Outlaw To Sheriff"}</button>
      </div>
    </div>

  {:else if subPhase === "submission" || subPhase === "submitted"}
    <div class="space-y-4 pb-6">
      <div class="rounded-3xl border border-amber-500/30 bg-amber-950/30 p-4 space-y-2">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-xs uppercase tracking-[0.3em] text-amber-200/80">Poster Assignment</p>
            <h2 class="text-2xl font-black text-amber-100">Write the bounty for {assignedCharacter?.name ?? "your assigned outlaw"}</h2>
          </div>
          <p class:animate-pulse={timeLeft < 10} class="min-w-[2.5ch] text-right text-3xl font-black font-mono tabular-nums text-white">{timerDisplay}</p>
        </div>
        <p class="text-sm text-amber-50/80">Keep the portrait, description, and name. You control the condition, bounty text, and accusation.</p>
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

      <WantedPosterCard poster={draftPoster} />

      <div class="rounded-3xl border border-white/10 bg-gray-900/70 p-4 space-y-4">
        <label class="block space-y-2">
          <span class="text-sm font-bold uppercase tracking-[0.2em] text-gray-300">Condition</span>
          <input
            bind:value={conditionInput}
            maxlength="28"
            class="w-full rounded-2xl border border-amber-600/40 bg-amber-50/95 px-4 py-3 text-lg font-semibold text-amber-950 outline-none"
            placeholder="Dead or Alive"
            disabled={posterSubmitted}
          />
        </label>

        <label class="block space-y-2">
          <span class="text-sm font-bold uppercase tracking-[0.2em] text-gray-300">Bounty text</span>
          <input
            bind:value={bountyInput}
            maxlength={maxBountyLength}
            class="w-full rounded-2xl border border-amber-600/40 bg-amber-50/95 px-4 py-3 text-lg font-semibold text-amber-950 outline-none"
            placeholder="Three horses, $4,500, and a warm pie"
            disabled={posterSubmitted}
          />
          <p class="text-xs text-gray-400">Free-form. Use money, trade offers, threats, or whatever the town would pay.</p>
        </label>

        <label class="block space-y-2">
          <span class="text-sm font-bold uppercase tracking-[0.2em] text-gray-300">Why are they wanted?</span>
          <textarea
            bind:value={reasonInput}
            maxlength="120"
            rows="4"
            class="w-full rounded-2xl border border-amber-600/40 bg-amber-50/95 px-4 py-3 text-base font-semibold text-amber-950 outline-none"
            placeholder="Hijacked the town tuba parade and declared themselves mayor of every cactus in sight."
            disabled={posterSubmitted}
          ></textarea>
        </label>

        {#if posterError}
          <p class="text-sm font-semibold text-red-300">{posterError}</p>
        {/if}

        <button
          class="w-full rounded-2xl bg-amber-500 px-4 py-3 text-lg font-black text-amber-950 disabled:opacity-50"
          on:click={submitPoster}
          disabled={posterSubmitted || !assignedCharacter}
        >{posterSubmitted ? "Poster Submitted" : "Pin Poster To Wall"}</button>
      </div>
    </div>

  {:else if subPhase === "reveal"}
    <div class="space-y-4">
      <div class="rounded-3xl border border-amber-500/30 bg-amber-950/30 p-4 text-center space-y-2">
        <p class="text-xs uppercase tracking-[0.3em] text-amber-200/80">Sheriff Showcase</p>
        <h2 class="text-2xl font-black text-amber-100">Poster {revealIndex} of {revealTotal}</h2>
        <p class:animate-pulse={timeLeft < 4} class="min-w-[2.5ch] text-center text-4xl font-black font-mono tabular-nums text-white">{timerDisplay}</p>
      </div>

      {#if revealPoster}
        <WantedPosterCard
          poster={revealPoster}
          showAuthor
          authorName={state.players.get(revealPoster.authorId)?.name ?? "Unknown Deputy"}
          featuredLabel="On Display"
          emphasis="showcase"
        />
      {/if}
    </div>

  {:else if subPhase === "voting"}
    <div class="space-y-4">
      <div class="rounded-3xl border border-purple-500/30 bg-purple-950/30 p-4 space-y-2">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-xs uppercase tracking-[0.3em] text-purple-200/80">Vote</p>
            <h2 class="text-2xl font-black text-purple-100">Pick the best poster</h2>
          </div>
          <p class:animate-pulse={timeLeft < 10} class="min-w-[2.5ch] text-right text-3xl font-black font-mono tabular-nums text-white">{timerDisplay}</p>
        </div>
        <div class="flex items-center justify-between text-sm text-purple-100/80">
          <span>Votes in</span>
          <span>{votesIn} / {totalVoters}</span>
        </div>
        {#if voteError}
          <p class="text-sm font-semibold text-red-300">{voteError}</p>
        {/if}
      </div>

      <div class="grid gap-4 justify-items-center">
        {#each votingPosters as poster}
          <button
            class:selected={selectedVoteAuthorId === poster.authorId}
            class="w-full max-w-[340px] rounded-[28px] border border-white/10 bg-transparent p-0 text-left transition-transform hover:-translate-y-1 disabled:opacity-70"
            on:click={() => selectVote(poster.authorId)}
            disabled={voteSubmitted}
          >
            <WantedPosterCard
              poster={poster}
              compact
              showAuthor
              authorName={state.players.get(poster.authorId)?.name ?? "Unknown Deputy"}
            />
          </button>
        {/each}
      </div>

      <button
        class="w-full rounded-2xl bg-purple-500 px-4 py-3 text-lg font-black text-purple-950 disabled:opacity-50"
        on:click={submitVote}
        disabled={voteSubmitted || !selectedVoteAuthorId}
      >{voteSubmitted ? "Vote Submitted" : selectedVoteAuthorId ? "Submit Vote" : "Choose A Poster To Vote"}</button>
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
  button.selected :global(.poster-shell) {
    transform: translateY(-4px);
    box-shadow: 0 0 0 2px rgba(196, 181, 253, 0.6), 0 22px 40px rgba(0,0,0,0.35);
  }
</style>
