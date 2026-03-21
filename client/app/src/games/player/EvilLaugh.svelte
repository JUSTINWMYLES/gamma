<script lang="ts">
  /**
   * Phone game component for "Evil Laugh Overlay" (registry-26).
   *
   * Sub-phases during `in_round`:
   *   recording → scene_pick → waiting_gallery → voting → results
   *
   * Server messages listened:
   *   start_recording, submission_confirmed, gallery_entry, gallery_done,
   *   voting_start, vote_confirmed, vote_count_update, round_result, round_skipped
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
    | "recording"
    | "scene_pick"
    | "submitting"
    | "waiting_gallery"
    | "gallery"
    | "voting"
    | "results";

  let subPhase: SubPhase = "waiting";

  // ── Recording ────────────────────────────────────────────────────

  let recordingTimeLeft = 0;
  let recordingEndTime = 0;
  let recordingTimer: ReturnType<typeof setInterval> | null = null;

  let micAllowed = false;
  let micError = "";
  let isRecording = false;
  let recordingDone = false;
  let audioBase64 = "";

  let mediaRecorder: MediaRecorder | null = null;
  let audioChunks: Blob[] = [];
  let mediaStream: MediaStream | null = null;

  // Visual feedback
  let recordingProgress = 0; // 0-1

  // ── Scene selection ──────────────────────────────────────────────

  const VILLAIN_SCENES = [
    { id: "thunderstorm", label: "Thunderstorm", emoji: "⛈️" },
    { id: "volcano-lair", label: "Volcano Lair", emoji: "🌋" },
    { id: "haunted-castle", label: "Haunted Castle", emoji: "🏰" },
    { id: "evil-laboratory", label: "Evil Lab", emoji: "🧪" },
    { id: "dark-throne", label: "Dark Throne", emoji: "👑" },
    { id: "sinister-forest", label: "Sinister Forest", emoji: "🌲" },
    { id: "underwater-base", label: "Underwater Base", emoji: "🌊" },
    { id: "space-station", label: "Space Station", emoji: "🚀" },
  ];

  let selectedScene = "";
  let submitted = false;

  // ── Gallery (player just watches status) ─────────────────────────

  let galleryPlayerName = "";

  // ── Voting ───────────────────────────────────────────────────────

  let votableEntries: { playerId: string; playerName: string }[] = [];
  let votingTimeLeft = 0;
  let votingEndTime = 0;
  let votingTimer: ReturnType<typeof setInterval> | null = null;
  let myVote: string | null = null;
  let voteConfirmed = false;
  let votesIn = 0;
  let totalVoters = 0;

  // ── Results ──────────────────────────────────────────────────────

  let results: {
    winner: string | null;
    scores: Record<string, number>;
    entries: { playerId: string; playerName: string; sceneId: string; voteCount: number }[];
  } | null = null;

  // Round skipped
  let roundSkipped = false;
  let skipReason = "";

  // ── Mic helpers ──────────────────────────────────────────────────

  async function requestMic(): Promise<boolean> {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micAllowed = true;
      micError = "";
      return true;
    } catch (err) {
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

    // Try to use webm/opus, fall back to whatever is available
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

    mediaRecorder.start(100); // collect data every 100ms

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
        // Strip the data URL prefix to get raw base64
        const base64 = result.split(",")[1] ?? "";
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // ── Submit ───────────────────────────────────────────────────────

  function submitEntry() {
    if (!audioBase64 || !selectedScene) return;
    subPhase = "submitting";
    room.send("game_input", {
      action: "submit_recording",
      audioBase64,
      sceneId: selectedScene,
    });
  }

  // ── Vote ─────────────────────────────────────────────────────────

  function castVote(targetId: string) {
    if (myVote || voteConfirmed) return;
    if (targetId === me?.id) return;
    myVote = targetId;
    room.send("game_input", { action: "vote", targetId });
  }

  // ── Timer helpers ────────────────────────────────────────────────

  function clearAllTimers() {
    if (recordingTimer) { clearInterval(recordingTimer); recordingTimer = null; }
    if (votingTimer) { clearInterval(votingTimer); votingTimer = null; }
  }

  // ── Message handlers ─────────────────────────────────────────────

  function onStartRecording(data: { durationMs: number; serverTimestamp: number }) {
    subPhase = "recording";
    recordingEndTime = data.serverTimestamp + data.durationMs;
    recordingTimeLeft = Math.max(0, (recordingEndTime - Date.now()) / 1000);

    recordingTimer = setInterval(() => {
      recordingTimeLeft = Math.max(0, (recordingEndTime - Date.now()) / 1000);
      const total = data.durationMs / 1000;
      recordingProgress = 1 - recordingTimeLeft / total;
    }, 100);

    // Immediately request mic + start recording
    startRecording(data.durationMs);
  }

  function onSubmissionConfirmed() {
    submitted = true;
    subPhase = "waiting_gallery";
  }

  function onGalleryEntry(data: { playerId: string; playerName: string }) {
    subPhase = "gallery";
    galleryPlayerName = data.playerName;
  }

  function onGalleryDone() {
    galleryPlayerName = "";
    // Voting will start next
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

  // ── Lifecycle ────────────────────────────────────────────────────

  onMount(() => {
    room.onMessage("start_recording", onStartRecording);
    room.onMessage("submission_confirmed", onSubmissionConfirmed);
    room.onMessage("gallery_entry", onGalleryEntry);
    room.onMessage("gallery_done", onGalleryDone);
    room.onMessage("voting_start", onVotingStart);
    room.onMessage("vote_confirmed", onVoteConfirmed);
    room.onMessage("vote_count_update", onVoteCountUpdate);
    room.onMessage("round_result", onRoundResult);
    room.onMessage("round_skipped", onRoundSkipped);
  });

  onDestroy(() => {
    clearAllTimers();
    // Stop any active recording
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
    // Release mic
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
    }
  });

  // Derived
  $: myScore = results?.scores[me?.id ?? ""] ?? 0;
  $: myEntry = results?.entries.find((e) => e.playerId === me?.id);

  // Transition from recording → scene_pick when recording finishes
  $: if (subPhase === "recording" && recordingDone && recordingTimeLeft <= 0) {
    subPhase = "scene_pick";
    if (recordingTimer) { clearInterval(recordingTimer); recordingTimer = null; }
  }
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-6 p-6" data-testid="evil-laugh">

  {#if roundSkipped}
    <div class="text-center space-y-3">
      <h2 class="text-xl font-black text-yellow-400">Round Skipped</h2>
      <p class="text-gray-300">{skipReason}</p>
    </div>

  {:else if subPhase === "waiting"}
    <p class="text-gray-400 text-center">Get ready to record your most evil laugh...</p>

  {:else if subPhase === "recording"}
    <!-- Recording phase -->
    <div class="w-full max-w-sm text-center space-y-6">
      <h2 class="text-2xl font-black text-red-400">Record Your Evil Laugh!</h2>

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
        <p class="text-5xl font-mono font-black text-white">
          {Math.ceil(recordingTimeLeft)}
        </p>

        <!-- Recording indicator -->
        <div class="flex flex-col items-center gap-4">
          <!-- Pulsing mic circle -->
          <div class="relative">
            <div
              class="w-28 h-28 rounded-full flex items-center justify-center transition-all
                {isRecording ? 'bg-red-600 animate-pulse' : 'bg-gray-700'}"
            >
              <span class="text-5xl">🎤</span>
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

        <p class="text-xs text-gray-500">Give us your most menacing villain laugh!</p>
      {/if}
    </div>

  {:else if subPhase === "scene_pick"}
    <!-- Scene selection phase -->
    <div class="w-full max-w-sm space-y-4">
      <div class="text-center">
        <h2 class="text-xl font-black text-purple-400">Choose Your Villain Scene</h2>
        <p class="text-sm text-gray-400 mt-1">Pick a backdrop for your evil laugh</p>
      </div>

      <div class="grid grid-cols-2 gap-3">
        {#each VILLAIN_SCENES as scene}
          <button
            class="flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all active:scale-95
              {selectedScene === scene.id
                ? 'border-purple-500 bg-purple-900/50'
                : 'border-gray-700 bg-gray-800 active:border-purple-500'}"
            on:click={() => (selectedScene = scene.id)}
          >
            <span class="text-3xl">{scene.emoji}</span>
            <span class="text-xs font-bold {selectedScene === scene.id ? 'text-purple-200' : 'text-gray-300'}">
              {scene.label}
            </span>
          </button>
        {/each}
      </div>

      <button
        class="w-full py-4 rounded-xl text-lg font-bold transition-all active:scale-95
          {selectedScene && audioBase64
            ? 'bg-purple-600 text-white active:bg-purple-500'
            : 'bg-gray-700 text-gray-500 cursor-not-allowed'}"
        disabled={!selectedScene || !audioBase64}
        on:click={submitEntry}
      >Submit Evil Laugh</button>
    </div>

  {:else if subPhase === "submitting"}
    <div class="text-center space-y-3">
      <div class="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
      <p class="text-gray-300">Submitting your evil laugh...</p>
    </div>

  {:else if subPhase === "waiting_gallery" || subPhase === "gallery"}
    <!-- Gallery viewing phase (player side — just shows who's being displayed) -->
    <div class="text-center space-y-4">
      <h2 class="text-xl font-black text-purple-400">Gallery Time!</h2>
      {#if submitted}
        <div class="bg-green-900 border border-green-600 rounded-xl p-3">
          <p class="text-green-200 text-sm font-bold">Your entry was submitted!</p>
        </div>
      {/if}
      {#if galleryPlayerName}
        <p class="text-lg text-gray-300">Now playing: <span class="font-bold text-white">{galleryPlayerName}</span></p>
      {:else}
        <p class="text-gray-400">Watch the TV to see everyone's evil laughs...</p>
      {/if}
    </div>

  {:else if subPhase === "voting"}
    <!-- Vote UI -->
    <div class="w-full max-w-sm space-y-4">
      <div class="text-center">
        <h2 class="text-xl font-black text-purple-400">Vote for the Best Evil Laugh!</h2>
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
      <h2 class="text-xl font-black text-purple-400">Round Results</h2>

      {#if results}
        <!-- Winner -->
        {#if results.winner}
          {@const winnerEntry = results.entries.find((e) => e.playerId === results?.winner)}
          <div class="bg-yellow-900/60 border border-yellow-500 rounded-xl p-4">
            <p class="text-xs text-yellow-400 uppercase tracking-widest mb-1">Most Evil Laugh</p>
            <p class="text-2xl font-black text-yellow-200">{winnerEntry?.playerName ?? "???"}</p>
            <p class="text-sm text-yellow-400 mt-1">{winnerEntry?.voteCount ?? 0} votes</p>
          </div>
        {/if}

        <!-- Your score -->
        <div class="bg-gray-800 rounded-xl p-4">
          <p class="text-xs text-gray-400 uppercase tracking-widest mb-1">Your Score This Round</p>
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
