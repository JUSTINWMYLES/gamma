<script lang="ts">
  /**
   * Phone game component for "Evil Laugh Overlay" (registry-26).
   *
   * New flow sub-phases:
   *   gif_browsing → gif_confirmed → waiting_turn → my_recording → recording_done
   *   → watching_others → playback → voting → results
   *
   * Server messages listened:
   *   gif_selection_start, gif_selection_confirmed, gif_selection_update,
   *   gif_assigned, recording_turn, recording_submitted,
   *   playback_entry, playback_done,
   *   voting_start, vote_confirmed, vote_count_update,
   *   round_result, round_skipped
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
    | "gif_browsing"
    | "gif_confirmed"
    | "waiting_turn"
    | "my_recording"
    | "recording_done"
    | "watching_others"
    | "playback"
    | "voting"
    | "results";

  let subPhase: SubPhase = "waiting";

  // ── GIF Selection ───────────────────────────────────────────────

  interface GifEntry {
    url: string;
    label: string;
  }

  let gifPool: GifEntry[] = [];
  let selectedGifUrl = "";
  let gifSelectionTimeLeft = 0;
  let gifSelectionEndTime = 0;
  let gifSelectionTimer: ReturnType<typeof setInterval> | null = null;
  let gifSelectionConfirmed = false;
  let selectionsSubmitted = 0;
  let selectionsTotal = 0;

  // ── Recording ───────────────────────────────────────────────────

  let assignedGifUrl = "";
  let assignedGifLabel = "";
  let assignedOriginalPicker = "";
  let recordingTimeLeft = 0;
  let recordingEndTime = 0;
  let recordingTimer: ReturnType<typeof setInterval> | null = null;

  let micAllowed = false;
  let micError = "";
  let isRecording = false;
  let recordingDone = false;
  let audioBase64 = "";
  let recordingSubmitted = false;

  let mediaRecorder: MediaRecorder | null = null;
  let audioChunks: Blob[] = [];
  let mediaStream: MediaStream | null = null;
  let recordingProgress = 0;

  // Who is currently recording (for "watching others" state)
  let currentRecorderName = "";
  let currentRecorderGifUrl = "";
  let currentRecorderGifLabel = "";
  let isMyTurn = false;

  // ── Playback ────────────────────────────────────────────────────

  let playbackPlayerName = "";
  let playbackGifUrl = "";

  // ── Voting ──────────────────────────────────────────────────────

  let votableEntries: { playerId: string; playerName: string }[] = [];
  let votingTimeLeft = 0;
  let votingEndTime = 0;
  let votingTimer: ReturnType<typeof setInterval> | null = null;
  let myVote: string | null = null;
  let voteConfirmed = false;
  let votesIn = 0;
  let totalVoters = 0;

  // ── Results ─────────────────────────────────────────────────────

  let results: {
    winner: string | null;
    scores: Record<string, number>;
    entries: { playerId: string; playerName: string; gifUrl: string; gifLabel: string; voteCount: number }[];
  } | null = null;

  // Round skipped
  let roundSkipped = false;
  let skipReason = "";

  // ── Mic helpers ─────────────────────────────────────────────────

  async function requestMic(): Promise<boolean> {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micAllowed = true;
      micError = "";
      return true;
    } catch {
      micAllowed = false;
      micError = "Microphone access denied. Please allow mic access and try again.";
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

    // Auto-stop after duration
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
        const base64 = result.split(",")[1] ?? "";
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // ── Actions ─────────────────────────────────────────────────────

  function selectGif(url: string) {
    selectedGifUrl = url;
  }

  function confirmGifSelection() {
    if (!selectedGifUrl) return;
    room.send("game_input", { action: "select_gif", gifUrl: selectedGifUrl });
  }

  function submitRecording() {
    if (!audioBase64 || recordingSubmitted) return;
    recordingSubmitted = true;
    room.send("game_input", { action: "submit_recording", audioBase64 });
  }

  function castVote(targetId: string) {
    if (myVote || voteConfirmed) return;
    if (targetId === me?.id) return;
    myVote = targetId;
    room.send("game_input", { action: "vote", targetId });
  }

  // ── Timer helpers ───────────────────────────────────────────────

  function clearAllTimers() {
    if (gifSelectionTimer) { clearInterval(gifSelectionTimer); gifSelectionTimer = null; }
    if (recordingTimer) { clearInterval(recordingTimer); recordingTimer = null; }
    if (votingTimer) { clearInterval(votingTimer); votingTimer = null; }
  }

  // ── Message handlers ────────────────────────────────────────────

  function onGifSelectionStart(data: { gifs: GifEntry[]; durationMs: number; serverTimestamp: number }) {
    subPhase = "gif_browsing";
    gifPool = data.gifs;
    selectedGifUrl = "";
    gifSelectionConfirmed = false;
    gifSelectionEndTime = data.serverTimestamp + data.durationMs;
    gifSelectionTimeLeft = Math.max(0, (gifSelectionEndTime - Date.now()) / 1000);

    gifSelectionTimer = setInterval(() => {
      gifSelectionTimeLeft = Math.max(0, (gifSelectionEndTime - Date.now()) / 1000);
    }, 200);
  }

  function onGifSelectionConfirmed() {
    gifSelectionConfirmed = true;
    subPhase = "gif_confirmed";
    if (gifSelectionTimer) { clearInterval(gifSelectionTimer); gifSelectionTimer = null; }
  }

  function onGifSelectionUpdate(data: { submitted: number; total: number }) {
    selectionsSubmitted = data.submitted;
    selectionsTotal = data.total;
  }

  function onRecordingTurn(data: {
    playerId: string;
    playerName: string;
    gifUrl: string;
    gifLabel: string;
    durationMs: number;
    serverTimestamp: number;
  }) {
    clearAllTimers();
    currentRecorderName = data.playerName;
    currentRecorderGifUrl = data.gifUrl;
    currentRecorderGifLabel = data.gifLabel;
    isMyTurn = data.playerId === me?.id;

    if (isMyTurn) {
      subPhase = "my_recording";
      // Timer + start recording handled by gif_assigned private message
    } else {
      subPhase = "watching_others";
      recordingEndTime = data.serverTimestamp + data.durationMs;
      recordingTimeLeft = Math.max(0, (recordingEndTime - Date.now()) / 1000);
      recordingTimer = setInterval(() => {
        recordingTimeLeft = Math.max(0, (recordingEndTime - Date.now()) / 1000);
      }, 200);
    }
  }

  function onGifAssigned(data: {
    gifUrl: string;
    gifLabel: string;
    originalPicker: string;
    durationMs: number;
    serverTimestamp: number;
  }) {
    // Private message — only the current recorder gets this
    assignedGifUrl = data.gifUrl;
    assignedGifLabel = data.gifLabel;
    assignedOriginalPicker = data.originalPicker;
    recordingSubmitted = false;
    audioBase64 = "";
    recordingDone = false;

    recordingEndTime = data.serverTimestamp + data.durationMs;
    recordingTimeLeft = Math.max(0, (recordingEndTime - Date.now()) / 1000);
    const totalSecs = data.durationMs / 1000;

    recordingTimer = setInterval(() => {
      recordingTimeLeft = Math.max(0, (recordingEndTime - Date.now()) / 1000);
      recordingProgress = 1 - recordingTimeLeft / totalSecs;
    }, 100);

    // Start recording immediately
    startRecording(data.durationMs);
  }

  function onRecordingSubmitted(data: { playerId: string }) {
    if (data.playerId !== me?.id) {
      // Someone else finished — advance their wait UI
    }
  }

  function onPlaybackEntry(data: {
    playerId: string;
    playerName: string;
    gifUrl: string;
    gifLabel: string;
  }) {
    subPhase = "playback";
    playbackPlayerName = data.playerName;
    playbackGifUrl = data.gifUrl;
  }

  function onPlaybackDone() {
    playbackPlayerName = "";
    playbackGifUrl = "";
  }

  function onVotingStart(data: {
    durationMs: number;
    serverTimestamp: number;
    entries: { playerId: string; playerName: string }[];
  }) {
    subPhase = "voting";
    clearAllTimers();

    votableEntries = data.entries.filter((e) => e.playerId !== me?.id);
    votingEndTime = data.serverTimestamp + data.durationMs;
    votingTimeLeft = Math.max(0, (votingEndTime - Date.now()) / 1000);
    myVote = null;
    voteConfirmed = false;
    votesIn = 0;
    totalVoters = data.entries.length;

    votingTimer = setInterval(() => {
      votingTimeLeft = Math.max(0, (votingEndTime - Date.now()) / 1000);
    }, 200);
  }

  function onVoteConfirmed() {
    voteConfirmed = true;
  }

  function onVoteCountUpdate(data: { votesIn: number; totalVoters: number }) {
    votesIn = data.votesIn;
    totalVoters = data.totalVoters;
  }

  function onRoundResult(data: typeof results) {
    subPhase = "results";
    results = data;
    clearAllTimers();
  }

  function onRoundSkipped(data: { reason: string }) {
    roundSkipped = true;
    skipReason = data.reason;
  }

  // ── Lifecycle ───────────────────────────────────────────────────

  onMount(() => {
    room.onMessage("gif_selection_start", onGifSelectionStart);
    room.onMessage("gif_selection_confirmed", onGifSelectionConfirmed);
    room.onMessage("gif_selection_update", onGifSelectionUpdate);
    room.onMessage("gif_assigned", onGifAssigned);
    room.onMessage("recording_turn", onRecordingTurn);
    room.onMessage("recording_submitted", onRecordingSubmitted);
    room.onMessage("playback_entry", onPlaybackEntry);
    room.onMessage("playback_done", onPlaybackDone);
    room.onMessage("voting_start", onVotingStart);
    room.onMessage("vote_confirmed", onVoteConfirmed);
    room.onMessage("vote_count_update", onVoteCountUpdate);
    room.onMessage("round_result", onRoundResult);
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

  // ── Auto-submit when recording finishes ─────────────────────────
  $: if (subPhase === "my_recording" && recordingDone && audioBase64 && !recordingSubmitted) {
    subPhase = "recording_done";
  }

  $: myScore = results?.scores[me?.id ?? ""] ?? 0;
  $: myEntry = results?.entries.find((e) => e.playerId === me?.id);
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-6 p-6" data-testid="evil-laugh">

  {#if roundSkipped}
    <div class="text-center space-y-3">
      <h2 class="text-xl font-black text-yellow-400">Round Skipped</h2>
      <p class="text-gray-300">{skipReason}</p>
    </div>

  {:else if subPhase === "waiting"}
    <p class="text-gray-400 text-center">Get ready to pick a GIF...</p>

  {:else if subPhase === "gif_browsing"}
    <!-- GIF Selection Phase -->
    <div class="w-full max-w-sm space-y-4 overflow-y-auto max-h-[85vh]">
      <div class="text-center sticky top-0 bg-gray-900 pb-2 z-10">
        <h2 class="text-xl font-black text-purple-400">Pick a GIF!</h2>
        <p class="text-sm text-gray-400 mt-1">
          {Math.ceil(gifSelectionTimeLeft)}s remaining
          {#if selectionsTotal > 0}
            <span class="ml-1 text-gray-500">({selectionsSubmitted}/{selectionsTotal} picked)</span>
          {/if}
        </p>
      </div>

      <!-- GIF grid -->
      <div class="grid grid-cols-2 gap-2">
        {#each gifPool as gif}
          <button
            class="relative rounded-lg overflow-hidden border-2 transition-all active:scale-95
              {selectedGifUrl === gif.url
                ? 'border-purple-500 ring-2 ring-purple-400'
                : 'border-gray-700 active:border-purple-500'}"
            on:click={() => selectGif(gif.url)}
          >
            <img
              src={gif.url}
              alt={gif.label}
              class="w-full h-24 object-cover"
              loading="lazy"
            />
            <span class="absolute bottom-0 left-0 right-0 bg-black/60 text-xs text-white text-center py-0.5 truncate px-1">
              {gif.label}
            </span>
          </button>
        {/each}
      </div>

      <!-- Confirm button -->
      <div class="sticky bottom-0 bg-gray-900 pt-2">
        <button
          class="w-full py-4 rounded-xl text-lg font-bold transition-all active:scale-95
            {selectedGifUrl
              ? 'bg-purple-600 text-white active:bg-purple-500'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'}"
          disabled={!selectedGifUrl}
          on:click={confirmGifSelection}
        >Confirm Selection</button>
      </div>
    </div>

  {:else if subPhase === "gif_confirmed"}
    <!-- Confirmed — waiting for others -->
    <div class="text-center space-y-4">
      <div class="bg-green-900 border border-green-600 rounded-xl p-4">
        <p class="text-green-200 font-bold text-lg">GIF Selected!</p>
        <p class="text-green-400 text-sm mt-1">Waiting for other players...</p>
      </div>
      {#if selectedGifUrl}
        <img
          src={selectedGifUrl}
          alt="Your pick"
          class="w-48 h-32 object-cover rounded-lg mx-auto border-2 border-purple-500"
        />
      {/if}
      {#if selectionsTotal > 0}
        <p class="text-sm text-gray-400">{selectionsSubmitted}/{selectionsTotal} have picked</p>
      {/if}
    </div>

  {:else if subPhase === "watching_others"}
    <!-- Watching another player record -->
    <div class="text-center space-y-4">
      <h2 class="text-xl font-black text-purple-400">Recording in Progress</h2>
      <p class="text-lg text-gray-300">
        <span class="font-bold text-white">{currentRecorderName}</span> is dubbing a GIF...
      </p>
      {#if currentRecorderGifUrl}
        <img
          src={currentRecorderGifUrl}
          alt={currentRecorderGifLabel}
          class="w-56 h-40 object-cover rounded-xl mx-auto border border-gray-700"
        />
      {/if}
      <p class="text-sm text-gray-500">{Math.ceil(recordingTimeLeft)}s remaining</p>
      <p class="text-xs text-gray-600">Watch the TV for the live show!</p>
    </div>

  {:else if subPhase === "my_recording"}
    <!-- My turn to record -->
    <div class="w-full max-w-sm text-center space-y-4">
      <h2 class="text-2xl font-black text-red-400">Your Turn!</h2>
      <p class="text-sm text-gray-400">
        Dub this GIF with your best evil laugh
        <span class="text-gray-500">(picked by {assignedOriginalPicker})</span>
      </p>

      <!-- The GIF to dub -->
      {#if assignedGifUrl}
        <img
          src={assignedGifUrl}
          alt={assignedGifLabel}
          class="w-full max-w-xs h-48 object-cover rounded-xl mx-auto border-2 border-red-500"
        />
      {/if}

      {#if micError}
        <div class="bg-red-900 border border-red-600 rounded-xl p-4">
          <p class="text-red-200 text-sm">{micError}</p>
          <button
            class="mt-3 px-4 py-2 rounded-lg bg-red-700 text-white text-sm font-bold"
            on:click={() => requestMic()}
          >Try Again</button>
        </div>
      {:else}
        <!-- Timer -->
        <p class="text-4xl font-mono font-black text-white">
          {Math.ceil(recordingTimeLeft)}
        </p>

        <!-- Recording indicator -->
        <div class="flex flex-col items-center gap-3">
          <div class="relative">
            <div
              class="w-20 h-20 rounded-full flex items-center justify-center transition-all
                {isRecording ? 'bg-red-600 animate-pulse' : 'bg-gray-700'}"
            >
              <span class="text-4xl">🎤</span>
            </div>
            {#if isRecording}
              <div class="absolute inset-0 rounded-full border-4 border-red-400 animate-ping opacity-30"></div>
            {/if}
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
      {/if}
    </div>

  {:else if subPhase === "recording_done"}
    <!-- Recording finished, ready to submit -->
    <div class="w-full max-w-sm text-center space-y-4">
      <h2 class="text-xl font-black text-green-400">Recording Complete!</h2>

      {#if assignedGifUrl}
        <img
          src={assignedGifUrl}
          alt={assignedGifLabel}
          class="w-48 h-32 object-cover rounded-xl mx-auto border border-green-500"
        />
      {/if}

      <button
        class="w-full py-4 rounded-xl text-lg font-bold transition-all active:scale-95
          bg-green-600 text-white active:bg-green-500"
        on:click={submitRecording}
        disabled={recordingSubmitted}
      >
        {recordingSubmitted ? "Submitted!" : "Submit Recording"}
      </button>

      {#if recordingSubmitted}
        <p class="text-sm text-green-400">Waiting for next player...</p>
      {/if}
    </div>

  {:else if subPhase === "playback"}
    <!-- Watching playback on TV -->
    <div class="text-center space-y-4">
      <h2 class="text-xl font-black text-purple-400">Playback Time!</h2>
      {#if playbackPlayerName}
        <p class="text-lg text-gray-300">Now playing: <span class="font-bold text-white">{playbackPlayerName}</span></p>
      {/if}
      {#if playbackGifUrl}
        <img
          src={playbackGifUrl}
          alt="Playing"
          class="w-48 h-32 object-cover rounded-lg mx-auto border border-gray-600"
        />
      {/if}
      <p class="text-gray-500 text-sm">Watch the TV!</p>
    </div>

  {:else if subPhase === "voting"}
    <!-- Vote UI -->
    <div class="w-full max-w-sm space-y-4">
      <div class="text-center">
        <h2 class="text-xl font-black text-purple-400">Vote for the Best!</h2>
        <p class="text-sm text-gray-400 mt-1">
          {Math.ceil(votingTimeLeft)}s remaining
          {#if votesIn > 0}
            <span class="ml-2 text-gray-500">({votesIn}/{totalVoters} voted)</span>
          {/if}
        </p>
      </div>

      {#if voteConfirmed}
        <div class="bg-green-900 border border-green-600 rounded-xl p-4 text-center">
          <p class="text-green-200 font-bold">Vote submitted!</p>
          <p class="text-green-400 text-sm mt-1">Waiting for others...</p>
        </div>
      {:else}
        <div class="space-y-2">
          {#each votableEntries as entry}
            <button
              class="w-full text-left px-4 py-3 rounded-lg border transition-colors active:scale-[0.98]
                {myVote === entry.playerId
                  ? 'border-purple-500 bg-purple-900 text-white'
                  : 'border-gray-700 bg-gray-800 text-gray-300 active:border-purple-500'}"
              on:click={() => castVote(entry.playerId)}
              disabled={!!myVote}
            >
              <p class="font-semibold">{entry.playerName}</p>
            </button>
          {/each}
        </div>
      {/if}
    </div>

  {:else if subPhase === "results"}
    <!-- Round results -->
    <div class="w-full max-w-sm space-y-4 text-center">
      <h2 class="text-xl font-black text-purple-400">Results</h2>

      {#if results}
        {#if results.winner}
          {@const winnerEntry = results.entries.find((e) => e.playerId === results?.winner)}
          <div class="bg-yellow-900/60 border border-yellow-500 rounded-xl p-4">
            <p class="text-xs text-yellow-400 uppercase tracking-widest mb-1">Best Evil Laugh</p>
            <p class="text-2xl font-black text-yellow-200">{winnerEntry?.playerName ?? "???"}</p>
            <p class="text-sm text-yellow-400 mt-1">{winnerEntry?.voteCount ?? 0} votes</p>
          </div>
        {/if}

        <div class="bg-gray-800 rounded-xl p-4">
          <p class="text-xs text-gray-400 uppercase tracking-widest mb-1">Your Score</p>
          <p class="text-3xl font-black {myScore > 0 ? 'text-green-400' : 'text-gray-500'}">
            +{myScore}
          </p>
          {#if myEntry}
            <p class="text-xs text-gray-500 mt-1">{myEntry.voteCount} vote{myEntry.voteCount !== 1 ? 's' : ''} received</p>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>
