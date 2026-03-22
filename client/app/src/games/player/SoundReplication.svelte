<script lang="ts">
  /**
   * Phone game component for "Sound Replication" (registry-06).
   *
   * Turn-based audio mimicry game. Players hear a target sound on the TV
   * and take turns recording their best imitation.
   *
   * Server messages listened:
   *   sound_target_play, sound_turn_start, sound_prepare,
   *   sound_countdown, sound_record_start,
   *   sound_submit_confirmed, sound_player_submitted,
   *   sound_scoring, sound_result_reveal, sound_round_leaderboard,
   *   round_skipped
   */
  import { onMount, onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState, PlayerState } from "../../../../shared/types";

  export let room: Room;
  export let state: RoomState;
  export let me: PlayerState | undefined;

  // ── Sub-phase ────────────────────────────────────────────────────

  type SubPhase =
    | "waiting"
    | "listening"
    | "waiting_turn"
    | "preparing"
    | "countdown"
    | "recording"
    | "review"
    | "submitted"
    | "watching_others"
    | "scoring"
    | "results"
    | "leaderboard";

  let subPhase: SubPhase = "waiting";

  // ── Target sound ─────────────────────────────────────────────────

  let turnOrder: { id: string; name: string }[] = [];
  let currentTurnPlayerId = "";
  let currentTurnPlayerName = "";
  let currentTurnIndex = 0;
  let totalTurns = 0;

  // ── Recording ────────────────────────────────────────────────────

  let recordingTimeLeft = 0;
  let recordingEndTime = 0;
  let recordingTimer: ReturnType<typeof setInterval> | null = null;
  let recordingDurationMs = 0;
  let recordingProgress = 0;

  let maxRetries = 1;
  let retriesUsed = 0;

  let micAllowed = false;
  let micError = "";
  let isRecording = false;
  let recordingDone = false;
  let audioBase64 = "";
  let recordingSubmitted = false;
  let recordingStartedAt = 0;

  let mediaRecorder: MediaRecorder | null = null;
  let audioChunks: Blob[] = [];
  let mediaStream: MediaStream | null = null;

  // ── Results ──────────────────────────────────────────────────────

  let revealPlayerName = "";
  let revealScore = 0;
  let revealPoints = 0;
  let revealRank = 0;
  let revealTotal = 0;

  let leaderboard: { playerId: string; playerName: string; similarityScore: number; points: number; rank: number }[] = [];

  let roundSkipped = false;
  let skipReason = "";

  // ── Mic helpers ──────────────────────────────────────────────────

  async function requestMic(): Promise<boolean> {
    if (!navigator.mediaDevices?.getUserMedia) {
      micAllowed = false;
      micError = "Microphone unavailable. Use Safari/Chrome on HTTPS.";
      return false;
    }
    if (!window.isSecureContext) {
      micAllowed = false;
      micError = "Microphone requires HTTPS or localhost.";
      return false;
    }
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micAllowed = true;
      micError = "";
      return true;
    } catch (err) {
      micAllowed = false;
      const name = err instanceof DOMException ? err.name : "UnknownError";
      if (name === "NotAllowedError" || name === "SecurityError") {
        micError = "Mic permission denied. Allow access in browser settings.";
      } else if (name === "NotFoundError") {
        micError = "No microphone found.";
      } else {
        micError = "Could not access microphone.";
      }
      return false;
    }
  }

  async function startRecording(durationMs: number) {
    if (!mediaStream) {
      const ok = await requestMic();
      if (!ok) return;
    }

    audioChunks = [];
    isRecording = true;
    recordingDone = false;
    recordingStartedAt = Date.now();

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    mediaRecorder = new MediaRecorder(mediaStream!, { mimeType });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      isRecording = false;
      recordingDone = true;
      const blob = new Blob(audioChunks, { type: mimeType });
      audioBase64 = await blobToBase64(blob);
    };

    mediaRecorder.start(100);

    setTimeout(() => {
      if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
      }
    }, durationMs);
  }

  function stopRecordingEarly() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
  }

  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1] ?? "");
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // ── Actions ──────────────────────────────────────────────────────

  function submitRecording() {
    if (!audioBase64 || recordingSubmitted) return;
    recordingSubmitted = true;
    const durationSecs = (Date.now() - recordingStartedAt) / 1000;
    room.send("game_input", {
      action: "submit_recording",
      audioBase64,
      durationSecs,
    });
  }

  function retryRecording() {
    if (retriesUsed >= maxRetries || recordingSubmitted) return;
    audioBase64 = "";
    recordingDone = false;
    room.send("game_input", { action: "retry_recording" });
  }

  // ── Timer ────────────────────────────────────────────────────────

  function clearAllTimers() {
    if (recordingTimer) { clearInterval(recordingTimer); recordingTimer = null; }
  }

  // ── Message handlers ─────────────────────────────────────────────

  function onTargetPlay(data: {
    round: number;
    targetId: string;
    durationMs: number;
    turnOrder: { id: string; name: string }[];
  }) {
    subPhase = "listening";
    turnOrder = data.turnOrder;
    totalTurns = data.turnOrder.length;
  }

  function onTurnStart(data: {
    playerId: string;
    playerName: string;
    turnIndex: number;
    totalTurns: number;
  }) {
    currentTurnPlayerId = data.playerId;
    currentTurnPlayerName = data.playerName;
    currentTurnIndex = data.turnIndex;
    totalTurns = data.totalTurns;

    if (data.playerId === me?.id) {
      // Will transition to preparing when sound_prepare arrives
    } else {
      subPhase = "watching_others";
    }
  }

  function onPrepare(data: { durationMs: number }) {
    subPhase = "preparing";
    recordingSubmitted = false;
    audioBase64 = "";
    recordingDone = false;
    retriesUsed = 0;
  }

  function onCountdown(_data: { durationMs: number }) {
    subPhase = "countdown";
  }

  function onRecordStart(data: {
    durationMs: number;
    maxRetries: number;
    retriesUsed?: number;
  }) {
    subPhase = "recording";
    recordingDurationMs = data.durationMs;
    maxRetries = data.maxRetries;
    if (data.retriesUsed !== undefined) retriesUsed = data.retriesUsed;

    recordingEndTime = Date.now() + data.durationMs;
    recordingTimeLeft = data.durationMs / 1000;
    const totalSecs = data.durationMs / 1000;

    recordingTimer = setInterval(() => {
      recordingTimeLeft = Math.max(0, (recordingEndTime - Date.now()) / 1000);
      recordingProgress = 1 - recordingTimeLeft / totalSecs;
    }, 100);

    startRecording(data.durationMs);
  }

  function onSubmitConfirmed() {
    subPhase = "submitted";
    clearAllTimers();
  }

  function onPlayerSubmitted(data: { playerId: string; playerName: string }) {
    // Another player submitted — no action needed on phone
  }

  function onScoring(_data: { message: string }) {
    subPhase = "scoring";
  }

  function onResultReveal(data: {
    playerId: string;
    playerName: string;
    similarityScore: number;
    points: number;
    rank: number;
    totalPlayers: number;
    revealIndex: number;
    isLast: boolean;
  }) {
    subPhase = "results";
    revealPlayerName = data.playerName;
    revealScore = data.similarityScore;
    revealPoints = data.points;
    revealRank = data.rank;
    revealTotal = data.totalPlayers;
  }

  function onLeaderboard(data: {
    round: number;
    results: { playerId: string; playerName: string; similarityScore: number; points: number; rank: number }[];
  }) {
    subPhase = "leaderboard";
    leaderboard = data.results;
  }

  function onRoundSkipped(data: { reason: string }) {
    roundSkipped = true;
    skipReason = data.reason;
  }

  // ── Lifecycle ────────────────────────────────────────────────────

  onMount(() => {
    room.onMessage("sound_target_play", onTargetPlay);
    room.onMessage("sound_turn_start", onTurnStart);
    room.onMessage("sound_prepare", onPrepare);
    room.onMessage("sound_countdown", onCountdown);
    room.onMessage("sound_record_start", onRecordStart);
    room.onMessage("sound_submit_confirmed", onSubmitConfirmed);
    room.onMessage("sound_player_submitted", onPlayerSubmitted);
    room.onMessage("sound_scoring", onScoring);
    room.onMessage("sound_result_reveal", onResultReveal);
    room.onMessage("sound_round_leaderboard", onLeaderboard);
    room.onMessage("round_skipped", onRoundSkipped);
  });

  onDestroy(() => {
    clearAllTimers();
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
    }
  });

  $: if (subPhase === "recording" && recordingDone && audioBase64 && !recordingSubmitted) {
    subPhase = "review";
    clearAllTimers();
  }

  $: myLeaderboardEntry = leaderboard.find((e) => e.playerId === me?.id);
  $: myTurnIndex = turnOrder.findIndex((t) => t.id === me?.id);
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-6 p-6" data-testid="sound-replication">

  {#if roundSkipped}
    <div class="text-center space-y-3">
      <h2 class="text-xl font-black text-yellow-400">Round Skipped</h2>
      <p class="text-gray-300">{skipReason}</p>
    </div>

  {:else if subPhase === "waiting"}
    <div class="text-center space-y-4">
      <h2 class="text-3xl font-black text-purple-400">Sound Replication</h2>
      <p class="text-gray-400">Get ready to listen and mimic!</p>
    </div>

  {:else if subPhase === "listening"}
    <div class="text-center space-y-4">
      <h2 class="text-2xl font-black text-purple-400">Listen Carefully!</h2>
      <p class="text-gray-300">The target sound is playing on the TV...</p>

      <!-- Listening animation -->
      <div class="flex items-end gap-1 h-16 justify-center">
        {#each Array(12) as _, i}
          <div
            class="w-2 bg-purple-500/60 rounded-full animate-pulse"
            style="height:{20 + Math.random() * 80}%;animation-delay:{i * 0.08}s;animation-duration:{0.4 + Math.random() * 0.4}s"
          ></div>
        {/each}
      </div>

      <!-- Turn order preview -->
      <div class="mt-4">
        <p class="text-xs text-gray-500 uppercase tracking-widest mb-2">Turn Order</p>
        <div class="flex gap-2 justify-center flex-wrap">
          {#each turnOrder as t, i}
            <span class="px-3 py-1 rounded-full text-xs font-semibold
              {t.id === me?.id ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400'}">
              {i + 1}. {t.name}
            </span>
          {/each}
        </div>
      </div>

      <!-- Mic permission prompt -->
      {#if !micAllowed}
        <div class="bg-gray-800 border border-gray-600 rounded-xl p-4 space-y-3 mt-4">
          <p class="text-gray-200 font-semibold text-sm">You'll need your microphone!</p>
          {#if micError}
            <p class="text-red-400 text-sm">{micError}</p>
          {/if}
          <button
            class="w-full py-3 rounded-xl text-lg font-bold bg-red-600 text-white active:bg-red-500 transition-all active:scale-95"
            on:click={() => requestMic()}
          >Allow Microphone</button>
        </div>
      {:else}
        <p class="text-green-400 text-xs mt-2">Mic ready</p>
      {/if}
    </div>

  {:else if subPhase === "watching_others"}
    <div class="text-center space-y-4">
      <h2 class="text-xl font-bold text-purple-400">Recording in Progress</h2>
      <p class="text-lg text-gray-300">
        <span class="font-bold text-white">{currentTurnPlayerName}</span> is recording...
      </p>
      <p class="text-sm text-gray-500">
        Turn {currentTurnIndex + 1} of {totalTurns}
      </p>
      <p class="text-xs text-gray-600">Watch the TV!</p>

      {#if !micAllowed}
        <div class="bg-gray-800 border border-gray-600 rounded-xl p-4 space-y-3 mt-4">
          <p class="text-gray-200 font-semibold text-sm">Your turn is coming up!</p>
          {#if micError}
            <p class="text-red-400 text-sm">{micError}</p>
          {/if}
          <button
            class="w-full py-3 rounded-xl text-lg font-bold bg-red-600 text-white active:bg-red-500 transition-all active:scale-95"
            on:click={() => requestMic()}
          >Allow Microphone</button>
        </div>
      {/if}
    </div>

  {:else if subPhase === "preparing"}
    <div class="text-center space-y-4">
      <h2 class="text-2xl font-black text-yellow-400">Your Turn!</h2>
      <p class="text-gray-300">Get ready to replicate the sound...</p>
      <div class="w-20 h-20 rounded-full bg-yellow-900 border-4 border-yellow-500 flex items-center justify-center mx-auto animate-pulse">
        <span class="text-3xl">🎵</span>
      </div>
    </div>

  {:else if subPhase === "countdown"}
    <div class="text-center space-y-4">
      <h2 class="text-xl font-bold text-gray-400">Get Ready...</h2>
      <p class="text-6xl font-mono font-black text-white animate-pulse">3...2...1</p>
    </div>

  {:else if subPhase === "recording"}
    <div class="w-full max-w-sm text-center space-y-4">
      <h2 class="text-2xl font-black text-red-400">Recording!</h2>
      <p class="text-sm text-gray-400">Make the sound!</p>

      <!-- Timer -->
      <p class="text-4xl font-mono font-black text-white">{Math.ceil(recordingTimeLeft)}</p>

      <!-- Recording indicator -->
      <div class="flex flex-col items-center gap-3">
        <div class="relative">
          <div class="w-24 h-24 rounded-full bg-red-600 animate-pulse flex items-center justify-center">
            <span class="text-5xl">🎤</span>
          </div>
          <div class="absolute inset-0 rounded-full border-4 border-red-400 animate-ping opacity-30"></div>
        </div>

        <!-- Progress bar -->
        <div class="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
          <div
            class="h-full bg-red-500 rounded-full transition-all"
            style="width:{recordingProgress * 100}%"
          ></div>
        </div>

        {#if isRecording}
          <button
            class="px-6 py-3 rounded-xl bg-gray-700 text-white font-bold active:bg-gray-600 transition-all active:scale-95"
            on:click={stopRecordingEarly}
          >Done Early</button>
        {/if}
      </div>
    </div>

  {:else if subPhase === "review"}
    <div class="w-full max-w-sm text-center space-y-4">
      <h2 class="text-xl font-black text-green-400">Recording Complete!</h2>

      <div class="flex gap-3 justify-center">
        <button
          class="flex-1 py-4 rounded-xl text-lg font-bold transition-all active:scale-95
            bg-green-600 text-white active:bg-green-500"
          on:click={submitRecording}
          disabled={recordingSubmitted}
        >
          Submit
        </button>

        {#if retriesUsed < maxRetries}
          <button
            class="flex-1 py-4 rounded-xl text-lg font-bold transition-all active:scale-95
              bg-orange-600 text-white active:bg-orange-500"
            on:click={retryRecording}
          >
            Retry ({maxRetries - retriesUsed} left)
          </button>
        {/if}
      </div>
    </div>

  {:else if subPhase === "submitted"}
    <div class="text-center space-y-4">
      <div class="bg-green-900 border border-green-600 rounded-xl p-4">
        <p class="text-green-200 font-bold text-lg">Submitted!</p>
        <p class="text-green-400 text-sm mt-1">Waiting for other players...</p>
      </div>
    </div>

  {:else if subPhase === "scoring"}
    <div class="text-center space-y-4">
      <h2 class="text-xl font-bold text-purple-400">Analyzing Recordings...</h2>
      <div class="flex items-end gap-1 h-10 justify-center">
        {#each Array(8) as _, i}
          <div
            class="w-3 bg-purple-500/60 rounded-full animate-pulse"
            style="height:{20 + Math.random() * 80}%;animation-delay:{i * 0.1}s"
          ></div>
        {/each}
      </div>
    </div>

  {:else if subPhase === "results"}
    <div class="text-center space-y-4">
      <p class="text-xs text-gray-500 uppercase tracking-widest">Result</p>
      <h2 class="text-2xl font-black text-white">{revealPlayerName}</h2>
      <div class="bg-gray-800 rounded-xl p-6 space-y-2">
        <p class="text-xs text-gray-400 uppercase">Similarity</p>
        <p class="text-5xl font-black {revealScore >= 70 ? 'text-green-400' : revealScore >= 40 ? 'text-yellow-400' : 'text-red-400'}">
          {revealScore}%
        </p>
        <p class="text-sm text-gray-400">+{revealPoints} points</p>
        <p class="text-xs text-gray-500">Rank: {revealRank} of {revealTotal}</p>
      </div>
    </div>

  {:else if subPhase === "leaderboard"}
    <div class="w-full max-w-sm space-y-4">
      <h2 class="text-xl font-black text-center text-purple-400">Round Results</h2>
      <div class="space-y-2">
        {#each leaderboard as entry}
          <div class="flex items-center gap-3 bg-gray-800 rounded-lg px-4 py-2
            {entry.playerId === me?.id ? 'border border-purple-500' : ''}">
            <span class="w-6 text-center font-mono text-gray-500">{entry.rank}.</span>
            <span class="flex-1 font-semibold text-white truncate">{entry.playerName}</span>
            <span class="text-sm {entry.similarityScore >= 70 ? 'text-green-400' : entry.similarityScore >= 40 ? 'text-yellow-400' : 'text-red-400'}">
              {entry.similarityScore}%
            </span>
            <span class="text-xs text-gray-400">+{entry.points}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
