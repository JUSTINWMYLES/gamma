<script lang="ts">
  /**
   * Phone game component for "Hot Potato" (registry-07).
   *
   * Redesigned: One physical phone IS the potato for the entire round.
   * The potato phone shows who to pass to. The receiver taps Accept on
   * the potato phone. All other phones show a spectating/waiting screen
   * until the voting phase, when everyone votes from their own phone.
   *
   * Server messages listened:
   *   potato_round_start, potato_show_target, potato_accepted,
   *   potato_timer, potato_exploded, potato_play_sound,
   *   potato_vote_start, potato_vote_confirmed, potato_vote_update,
   *   potato_result, round_skipped
   *
   * Client actions sent:
   *   { action: "potato_accept" }
   *   { action: "potato_vote", targetId }
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
    | "i_am_potato"    // My phone is the potato — showing pass target
    | "spectating"     // My phone is NOT the potato — watching
    | "exploded"       // Timer ran out
    | "voting"         // Vote: blame the holder or the target?
    | "results";       // Round results

  let subPhase: SubPhase = "waiting";

  // ── Potato device state ────────────────────────────────────────

  let iAmPotatoDevice = false;
  let potatoDeviceName = "";

  // ── Pass target (only relevant if I am the potato device) ─────

  let targetName = "";
  let targetId = "";
  let passNumber = 0;
  let lastAcceptorName = "";

  // ── Timer (broadcast to all, but display varies) ──────────────

  let timeRemaining = 0;

  // ── Explosion state ────────────────────────────────────────────

  let explodedHolderName = "";
  let explodedHolderId = "";
  let explodedTargetName = "";
  let explodedTargetId = "";
  let explodedPassCount = 0;

  // ── Voting state ───────────────────────────────────────────────

  let voteHolderId = "";
  let voteHolderName = "";
  let voteTargetId = "";
  let voteTargetName = "";
  let votingTimeLeft = 0;
  let votingEndTime = 0;
  let votingTimer: ReturnType<typeof setInterval> | null = null;
  let myVote: string | null = null;
  let voteConfirmed = false;
  let votesIn = 0;
  let totalVoters = 0;

  // ── Results state ──────────────────────────────────────────────

  let resultLoserName = "";
  let resultLoserId = "";
  let resultLoserPenalty = 0;
  let resultScores: Record<string, number> = {};
  let resultPassCount = 0;
  let resultPassLeaderName: string | null = null;
  let resultPassLeaderCount = 0;
  let resultHolderVotes = 0;
  let resultTargetVotes = 0;

  // ── Round skipped ──────────────────────────────────────────────

  let roundSkipped = false;
  let skipReason = "";

  // ── Helpers ────────────────────────────────────────────────────

  function clearAllTimers() {
    if (votingTimer) { clearInterval(votingTimer); votingTimer = null; }
  }

  // ── Actions ────────────────────────────────────────────────────

  function acceptPotato() {
    if (subPhase !== "i_am_potato") return;
    room.send("game_input", { action: "potato_accept" });
  }

  function castVote(tid: string) {
    if (myVote || voteConfirmed) return;
    myVote = tid;
    room.send("game_input", { action: "potato_vote", targetId: tid });
  }

  // ── Message handlers ───────────────────────────────────────────

  function onPotatoRoundStart(data: {
    potatoDeviceId: string;
    potatoDeviceName: string;
    timerDurationMs: number;
  }) {
    // Reset round state
    roundSkipped = false;
    lastAcceptorName = "";
    passNumber = 0;
    myVote = null;
    voteConfirmed = false;
    timeRemaining = data.timerDurationMs;

    iAmPotatoDevice = data.potatoDeviceId === me?.id;
    potatoDeviceName = data.potatoDeviceName;

    if (iAmPotatoDevice) {
      subPhase = "i_am_potato";
      // Vibrate to alert: you are the potato!
      if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
    } else {
      subPhase = "spectating";
    }
  }

  function onPotatoShowTarget(data: {
    targetId: string;
    targetName: string;
    passNumber: number;
  }) {
    // Only the potato device receives this
    targetId = data.targetId;
    targetName = data.targetName;
    passNumber = data.passNumber;
    subPhase = "i_am_potato";
  }

  function onPotatoAccepted(data: {
    acceptorName: string;
    passNumber: number;
  }) {
    lastAcceptorName = data.acceptorName;
    passNumber = data.passNumber;
  }

  function onPotatoTimer(data: { timeRemaining: number }) {
    timeRemaining = data.timeRemaining;
  }

  function onPotatoExploded(data: {
    holderId: string;
    holderName: string;
    targetId: string;
    targetName: string;
    passCount: number;
  }) {
    subPhase = "exploded";
    clearAllTimers();
    explodedHolderId = data.holderId;
    explodedHolderName = data.holderName;
    explodedTargetId = data.targetId;
    explodedTargetName = data.targetName;
    explodedPassCount = data.passCount;
    timeRemaining = 0;

    // Vibrate on explosion
    if (navigator.vibrate) navigator.vibrate([500, 200, 500]);
  }

  function onPotatoPlaySound() {
    // SOUND_PLACEHOLDER: Replace with actual explosion/alarm sound
    // Example: new Audio('/sounds/potato-explosion.mp3').play();
    // For now, just trigger a longer vibration pattern as haptic feedback
    if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 300, 100, 500]);
  }

  function onPotatoVoteStart(data: {
    holderId: string;
    holderName: string;
    targetId: string;
    targetName: string;
    durationMs: number;
    serverTimestamp: number;
  }) {
    subPhase = "voting";
    voteHolderId = data.holderId;
    voteHolderName = data.holderName;
    voteTargetId = data.targetId;
    voteTargetName = data.targetName;
    myVote = null;
    voteConfirmed = false;
    votesIn = 0;

    votingEndTime = data.serverTimestamp + data.durationMs;
    votingTimeLeft = Math.max(0, (votingEndTime - Date.now()) / 1000);

    clearAllTimers();
    votingTimer = setInterval(() => {
      votingTimeLeft = Math.max(0, (votingEndTime - Date.now()) / 1000);
    }, 200);
  }

  function onPotatoVoteConfirmed() {
    voteConfirmed = true;
  }

  function onPotatoVoteUpdate(data: { votesIn: number; totalVoters: number }) {
    votesIn = data.votesIn;
    totalVoters = data.totalVoters;
  }

  function onPotatoResult(data: {
    loserId: string;
    loserName: string;
    loserPenalty: number;
    scores: Record<string, number>;
    passCount: number;
    passLeaderName: string | null;
    passLeaderCount: number;
    holderVotes: number;
    targetVotes: number;
  }) {
    subPhase = "results";
    clearAllTimers();
    resultLoserId = data.loserId;
    resultLoserName = data.loserName;
    resultLoserPenalty = data.loserPenalty;
    resultScores = data.scores;
    resultPassCount = data.passCount;
    resultPassLeaderName = data.passLeaderName;
    resultPassLeaderCount = data.passLeaderCount;
    resultHolderVotes = data.holderVotes;
    resultTargetVotes = data.targetVotes;
  }

  function onRoundSkipped(data: { reason: string }) {
    roundSkipped = true;
    skipReason = data.reason;
  }

  // ── Lifecycle ──────────────────────────────────────────────────

  onMount(() => {
    room.onMessage("potato_round_start", onPotatoRoundStart);
    room.onMessage("potato_show_target", onPotatoShowTarget);
    room.onMessage("potato_accepted", onPotatoAccepted);
    room.onMessage("potato_timer", onPotatoTimer);
    room.onMessage("potato_exploded", onPotatoExploded);
    room.onMessage("potato_play_sound", onPotatoPlaySound);
    room.onMessage("potato_vote_start", onPotatoVoteStart);
    room.onMessage("potato_vote_confirmed", onPotatoVoteConfirmed);
    room.onMessage("potato_vote_update", onPotatoVoteUpdate);
    room.onMessage("potato_result", onPotatoResult);
    room.onMessage("round_skipped", onRoundSkipped);
  });

  onDestroy(() => {
    clearAllTimers();
  });

  // ── Derived ────────────────────────────────────────────────────

  $: myScore = resultScores[me?.id ?? ""] ?? 0;
  $: iWasLoser = resultLoserId === me?.id;
  $: timerSeconds = Math.max(0, timeRemaining / 1000);
  $: timerUrgent = timerSeconds < 4;
  $: timerDisplay = timerSeconds.toFixed(1);
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-6 p-6" data-testid="hot-potato">

  {#if roundSkipped}
    <div class="text-center space-y-3">
      <h2 class="text-xl font-black text-yellow-400">Round Skipped</h2>
      <p class="text-gray-300">{skipReason}</p>
    </div>

  {:else if subPhase === "waiting"}
    <div class="text-center space-y-3">
      <p class="text-5xl">🥔</p>
      <p class="text-gray-400">Get ready...</p>
      <p class="text-xs text-gray-500">A phone is about to become the hot potato!</p>
    </div>

  {:else if subPhase === "i_am_potato"}
    <!-- MY PHONE IS THE POTATO -->
    <div class="w-full max-w-sm space-y-5 text-center">
      <!-- Hot potato pulsing visual -->
      <div class="relative mx-auto w-28 h-28">
        <div class="absolute inset-0 bg-red-600/30 rounded-full animate-ping"></div>
        <div class="relative w-28 h-28 bg-gradient-to-br from-orange-500 to-red-600 rounded-full flex items-center justify-center border-4 border-orange-400 shadow-lg shadow-red-500/50">
          <span class="text-5xl">🥔</span>
        </div>
      </div>

      {#if passNumber === 0}
        <!-- First pass: instruct the potato device owner -->
        <div class="space-y-2">
          <p class="text-lg font-black text-red-400">YOUR PHONE IS THE POTATO!</p>
          <p class="text-base text-gray-300">
            Hand this phone to
          </p>
          <p class="text-3xl font-black text-orange-400">{targetName}</p>
        </div>
      {:else}
        <!-- Subsequent passes: the person now holding the potato phone sees this -->
        <div class="space-y-2">
          <p class="text-lg font-black text-orange-400">PASS THIS PHONE TO:</p>
          <p class="text-3xl font-black text-yellow-300">{targetName}</p>
        </div>
      {/if}

      <button
        class="w-full py-5 rounded-xl text-xl font-black bg-yellow-500 text-black
          active:bg-yellow-400 active:scale-95 transition-all shadow-lg shadow-yellow-500/30"
        on:click={acceptPotato}
      >
        I'M {targetName.toUpperCase()} — I HAVE IT!
      </button>

      <p class="text-xs text-gray-500">
        {passNumber} pass{passNumber !== 1 ? "es" : ""} so far
      </p>
    </div>

  {:else if subPhase === "spectating"}
    <!-- My phone is NOT the potato — waiting screen -->
    <div class="w-full max-w-sm space-y-5 text-center">
      <div class="mx-auto w-24 h-24 bg-gray-800 border-2 border-gray-600 rounded-full flex items-center justify-center">
        <span class="text-4xl opacity-50">🥔</span>
      </div>

      <div class="space-y-2">
        <p class="text-lg text-gray-400">The potato is being passed around...</p>
        <p class="text-sm text-gray-500">
          <span class="font-bold text-orange-400">{potatoDeviceName}</span>'s phone is the potato
        </p>
        {#if lastAcceptorName}
          <p class="text-sm text-gray-500">
            Last accepted by <span class="text-white font-semibold">{lastAcceptorName}</span>
          </p>
        {/if}
        <p class="text-xs text-gray-600">{passNumber} pass{passNumber !== 1 ? "es" : ""} so far</p>
      </div>

      <p class="text-xs text-gray-600 italic">
        Wait for the potato to explode, then you'll vote!
      </p>
    </div>

  {:else if subPhase === "exploded"}
    <!-- BOOM! -->
    <div class="w-full max-w-sm space-y-5 text-center">
      <div class="text-7xl animate-bounce">💥</div>
      <h2 class="text-3xl font-black text-red-400">BOOM!</h2>
      <p class="text-lg text-gray-300">
        The potato exploded after <span class="font-bold text-orange-400">{explodedPassCount}</span> passes!
      </p>
      <div class="bg-gray-800 rounded-xl p-4 space-y-2">
        <p class="text-sm text-gray-400">
          <span class="font-bold text-white">{explodedHolderName}</span> was holding it
        </p>
        <p class="text-sm text-gray-400">
          <span class="font-bold text-white">{explodedTargetName}</span> was supposed to receive it
        </p>
      </div>
      <p class="text-sm text-gray-500">Get ready to vote...</p>
    </div>

  {:else if subPhase === "voting"}
    <!-- Vote: who's to blame? -->
    <div class="w-full max-w-sm space-y-4">
      <div class="text-center">
        <h2 class="text-xl font-black text-orange-400">Who Should Lose Points?</h2>
        <p class="text-sm text-gray-400 mt-1">
          Was it the holder's fault or the receiver's?
        </p>
        <p class="text-sm text-gray-500 mt-1">
          {Math.ceil(votingTimeLeft)}s remaining
          {#if votesIn > 0}
            <span class="ml-2 text-gray-500">({votesIn}/{totalVoters} voted)</span>
          {/if}
        </p>
      </div>

      {#if voteConfirmed}
        <div class="bg-orange-900 border border-orange-600 rounded-xl p-4 text-center">
          <p class="text-orange-200 font-bold">Vote submitted!</p>
          <p class="text-orange-400 text-sm mt-1">Waiting for others...</p>
        </div>
      {:else}
        <div class="space-y-3">
          <!-- Vote for the holder -->
          <button
            class="w-full text-left px-4 py-4 rounded-lg border transition-colors active:scale-[0.98]
              {myVote === voteHolderId
                ? 'border-red-500 bg-red-900 text-white'
                : 'border-gray-700 bg-gray-800 text-gray-300 active:border-red-500'}"
            on:click={() => castVote(voteHolderId)}
            disabled={!!myVote}
          >
            <p class="font-semibold text-lg">{voteHolderName}</p>
            <p class="text-xs text-gray-400 mt-1">Was holding the potato</p>
          </button>

          <div class="text-center text-xs text-gray-600 uppercase tracking-widest">or</div>

          <!-- Vote for the target -->
          <button
            class="w-full text-left px-4 py-4 rounded-lg border transition-colors active:scale-[0.98]
              {myVote === voteTargetId
                ? 'border-yellow-500 bg-yellow-900 text-white'
                : 'border-gray-700 bg-gray-800 text-gray-300 active:border-yellow-500'}"
            on:click={() => castVote(voteTargetId)}
            disabled={!!myVote}
          >
            <p class="font-semibold text-lg">{voteTargetName}</p>
            <p class="text-xs text-gray-400 mt-1">Was supposed to receive it</p>
          </button>
        </div>

        <p class="text-xs text-gray-600 text-center">
          The most-voted player loses points
        </p>
      {/if}
    </div>

  {:else if subPhase === "results"}
    <!-- Results -->
    <div class="w-full max-w-sm space-y-4 text-center">
      <h2 class="text-xl font-black text-orange-400">Round Results</h2>

      <!-- Loser -->
      <div class="bg-red-900/40 border border-red-600 rounded-xl p-4">
        <p class="text-xs text-red-400 uppercase tracking-widest mb-1">Voted Out</p>
        <p class="text-2xl font-black text-red-200">{resultLoserName}</p>
        <p class="text-red-400 font-bold text-lg mt-1">-{resultLoserPenalty}</p>
        <p class="text-xs text-gray-400 mt-1">
          {resultHolderVotes} voted holder · {resultTargetVotes} voted receiver
        </p>
      </div>

      <!-- My score -->
      <div class="bg-gray-800 rounded-xl p-4 space-y-2">
        {#if iWasLoser}
          <p class="text-red-400 font-bold">You were voted out!</p>
        {:else}
          <p class="text-green-400 font-bold">You survived!</p>
        {/if}
        <p class="text-3xl font-black {myScore >= 0 ? 'text-green-400' : 'text-red-400'}">
          {myScore >= 0 ? "+" : ""}{myScore}
        </p>
      </div>

      <!-- Stats -->
      <div class="bg-gray-800/50 rounded-xl p-3 space-y-1">
        <p class="text-xs text-gray-500">
          {resultPassCount} pass{resultPassCount !== 1 ? "es" : ""} this round
        </p>
        {#if resultPassLeaderName}
          <p class="text-xs text-gray-500">
            Most passes: <span class="text-orange-400 font-bold">{resultPassLeaderName}</span>
            ({resultPassLeaderCount}, +25 bonus)
          </p>
        {/if}
      </div>
    </div>
  {/if}
</div>
