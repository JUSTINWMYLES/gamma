<script lang="ts">
  /**
   * Phone game component for "Audio Overlay" (registry-26).
   *
 * Flow sub-phases:
 *   category_choosing | category_waiting → gif_browsing → gif_confirmed →
 *   recording_prepare → my_recording → recording_done → watching_others →
 *   playback → voting → results
   *
   * Server messages listened:
   *   category_selection_start, category_chosen,
   *   gif_selection_start, gif_selection_confirmed, gif_selection_update,
 *   gif_assigned, recording_prepare, recording_turn, recording_submitted,
   *   playback_entry, playback_done,
   *   voting_start, vote_confirmed, vote_count_update,
   *   round_result, round_skipped
   */
  import { onMount, onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState, PlayerState } from "../../../../shared/types";
  import { getCachedMicStream, cacheMicStream } from "../../lib/permissions";

  export let room: Room;
  export let state: RoomState;
  export let me: PlayerState | undefined;

  type PermissionAwarePlayer = PlayerState & {
    micPermission?: string;
  };

  $: permissionPlayer = me as PermissionAwarePlayer | undefined;
  $: micGranted = permissionPlayer?.micPermission === "granted";

  // ── Sub-phase state ──────────────────────────────────────────────

  type SubPhase =
    | "waiting"
    | "category_choosing"
    | "category_waiting"
    | "gif_browsing"
    | "gif_confirmed"
    | "recording_prepare"
    | "my_recording"
    | "recording_done"
    | "watching_others"
    | "playback"
    | "voting"
    | "results";

  let subPhase: SubPhase = "waiting";

  // ── Category Selection ─────────────────────────────────────────

  interface CategoryInfo {
    id: string;
    name: string;
    icon: string;
    description: string;
  }

  let categories: CategoryInfo[] = [];
  let categoryChooserId = "";
  let categoryChooserName = "";
  let categoryTimeLeft = 0;
  let categoryEndTime = 0;
  let categoryTimer: ReturnType<typeof setInterval> | null = null;
  let chosenCategory: CategoryInfo | null = null;
  let amCategoryChooser = false;
  let categoryRevealing = false;

  const CATEGORY_ICONS: Record<string, string> = {
    devil: "\uD83D\uDE08",
    paw: "\uD83D\uDC3E",
    car: "\uD83D\uDE97",
    megaphone: "\uD83D\uDCE2",
    music: "\uD83C\uDFB5",
    trophy: "\uD83C\uDFC6",
    shuffle: "\uD83C\uDFB2",
  };

  // ── GIF Selection ───────────────────────────────────────────────

  interface GifEntry {
    url: string;
    label: string;
  }

  let gifPool: GifEntry[] = [];
  let selectedGifUrl = "";
  let selectedGifLabel = "";
  let gifSelectionTimeLeft = 0;
  let gifSelectionEndTime = 0;
  let gifSelectionTimer: ReturnType<typeof setInterval> | null = null;
  let gifSelectionConfirmed = false;
  let selectionsSubmitted = 0;
  let selectionsTotal = 0;
  let gifCategoryInfo: CategoryInfo | null = null;

  // ── GIF Search ──────────────────────────────────────────────────

  let searchQuery = "";
  let isSearching = false;
  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Recording ───────────────────────────────────────────────────

  let assignedGifUrl = "";
  let assignedGifLabel = "";
  let assignedOriginalPicker = "";
  let assignedMode: "randomized" | "record_own" = "randomized";
  let recordingTimeLeft = 0;
  let recordingEndTime = 0;
  let recordingTimer: ReturnType<typeof setInterval> | null = null;
  let maxClipDurationMs = 10_000;
  let clipTimeLeft = 10;
  let clipTimer: ReturnType<typeof setInterval> | null = null;
  let recordingStopTimer: ReturnType<typeof setTimeout> | null = null;

  let micAllowed = false;
  let micError = "";
  let isRecording = false;
  let recordingDone = false;
  let audioBase64 = "";
  let audioPreviewUrl = "";
  let recordingSubmitted = false;
  let recordingSubmitPending = false;
  let recordedDurationSecs = 0;
  let recordingStartedAt = 0;

  let mediaRecorder: MediaRecorder | null = null;
  let audioChunks: Blob[] = [];
  let mediaStream: MediaStream | null = null;
  let recordingProgress = 0;

  // Who is currently recording (for "watching others" state)
  let currentRecorderName = "";
  let isMyTurn = false;

  // ── Playback ────────────────────────────────────────────────────

  let playbackPlayerName = "";
  let playbackGifUrl = "";

  // ── Voting ──────────────────────────────────────────────────────

  let votableEntries: { playerId: string; playerName: string; gifUrl: string; gifLabel: string }[] = [];
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
    category: string;
    entries: { playerId: string; playerName: string; gifUrl: string; gifLabel: string; voteCount: number }[];
  } | null = null;

  // Round skipped
  let roundSkipped = false;
  let skipReason = "";

  // ── Mic helpers ─────────────────────────────────────────────────

  async function requestMic(): Promise<boolean> {
    if (!micGranted) {
      micAllowed = false;
      micError = "Enable microphone in the lobby to join Audio Overlay recording.";
      return false;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      micAllowed = false;
      micError = "Microphone is unavailable in this browser/context. Use Safari/Chrome on HTTPS.";
      return false;
    }

    if (!window.isSecureContext) {
      micAllowed = false;
      micError = "Microphone requires HTTPS (or localhost). Open the game over a secure connection.";
      return false;
    }

    try {
      // Prefer the cached stream from the lobby consent flow to avoid
      // triggering a second browser permission prompt mid-game.
      const cached = getCachedMicStream();
      mediaStream = cached ?? await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!cached && mediaStream) {
        cacheMicStream(mediaStream);
      }
      micAllowed = true;
      micError = "";
      return true;
    } catch (err) {
      micAllowed = false;
      const name = err instanceof DOMException ? err.name : "UnknownError";
      if (name === "NotAllowedError" || name === "SecurityError") {
        micError = "Microphone permission denied. Allow mic access in browser settings and try again.";
      } else if (name === "NotFoundError") {
        micError = "No microphone found on this device.";
      } else if (name === "NotReadableError") {
        micError = "Microphone is busy in another app. Close other apps and try again.";
      } else {
        micError = "Could not access microphone. Check browser permissions and HTTPS.";
      }
      return false;
    }
  }

  function revokeAudioPreview() {
    if (audioPreviewUrl) {
      URL.revokeObjectURL(audioPreviewUrl);
      audioPreviewUrl = "";
    }
  }

  function stopMediaStream() {
    if (!mediaStream) return;
    // Keep the cached consent stream alive so the browser does not prompt again.
    if (getCachedMicStream() === mediaStream) {
      mediaStream = null;
      micAllowed = false;
      return;
    }
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
    micAllowed = false;
  }

  function clearClipTimers() {
    if (clipTimer) { clearInterval(clipTimer); clipTimer = null; }
    if (recordingStopTimer) { clearTimeout(recordingStopTimer); recordingStopTimer = null; }
  }

  function resetTakeState() {
    clearClipTimers();
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
    isRecording = false;
    recordingDone = false;
    audioBase64 = "";
    recordingSubmitPending = false;
    recordedDurationSecs = 0;
    recordingStartedAt = 0;
    recordingProgress = 0;
    clipTimeLeft = maxClipDurationMs / 1000;
    audioChunks = [];
    revokeAudioPreview();
  }

  async function startHeldRecording() {
    if (recordingSubmitted || recordingSubmitPending || isRecording) return;
    if (recordingTimeLeft <= 0) return;

    if (!mediaStream) {
      const ok = await requestMic();
      if (!ok) return;
    }

    clearClipTimers();
    audioChunks = [];
    isRecording = true;
    recordingDone = false;
    recordingStartedAt = Date.now();
    micError = "";

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    mediaRecorder = new MediaRecorder(mediaStream!, { mimeType });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      clearClipTimers();
      isRecording = false;
      recordingDone = true;
      recordedDurationSecs = Math.min(maxClipDurationMs, Date.now() - recordingStartedAt) / 1000;
      const blob = new Blob(audioChunks, { type: mimeType });
      revokeAudioPreview();
      audioPreviewUrl = URL.createObjectURL(blob);
      const encoded = await blobToBase64(blob);
      audioBase64 = encoded;
      stopMediaStream();
    };

    mediaRecorder.start(100);

    const clipWindowMs = Math.min(maxClipDurationMs, Math.max(0, recordingEndTime - Date.now()));
    clipTimeLeft = clipWindowMs / 1000;
    clipTimer = setInterval(() => {
      clipTimeLeft = Math.max(0, (recordingStartedAt + clipWindowMs - Date.now()) / 1000);
    }, 100);

    recordingStopTimer = setTimeout(() => {
      if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
      }
    }, clipWindowMs);
  }

  function stopHeldRecording() {
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

  function pickCategory(categoryId: string) {
    const category = categories.find((entry) => entry.id === categoryId);
    if (category) {
      chosenCategory = category;
      categoryRevealing = true;
      subPhase = "category_waiting";
    }
    room.send("game_input", { action: "select_category", category: categoryId });
  }

  function selectGif(url: string, label?: string) {
    selectedGifUrl = url;
    selectedGifLabel = label ?? "GIF";
  }

  function confirmGifSelection() {
    if (!selectedGifUrl) return;
    room.send("game_input", { action: "select_gif", gifUrl: selectedGifUrl, gifLabel: selectedGifLabel });
  }

  function searchGifs() {
    const q = searchQuery.trim();
    if (q.length < 2) return;
    isSearching = true;
    room.send("game_input", { action: "search_gifs", query: q });
  }

  function onSearchInput() {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    const q = searchQuery.trim();
    if (q.length < 2) {
      return;
    }
    // Debounce 500ms so we don't spam the server on every keystroke
    searchDebounceTimer = setTimeout(() => searchGifs(), 500);
  }

  function submitRecording() {
    if (!audioBase64 || recordingSubmitted || recordingSubmitPending) return;
    recordingSubmitPending = true;
    room.send("game_input", {
      action: "submit_recording",
      audioBase64,
      durationSecs: recordedDurationSecs,
    });
  }

  function castVote(targetId: string) {
    if (myVote || voteConfirmed) return;
    if (targetId === me?.id) return;
    myVote = targetId;
    room.send("game_input", { action: "vote", targetId });
  }

  // ── Timer helpers ───────────────────────────────────────────────

  function clearAllTimers() {
    if (categoryTimer) { clearInterval(categoryTimer); categoryTimer = null; }
    if (gifSelectionTimer) { clearInterval(gifSelectionTimer); gifSelectionTimer = null; }
    if (recordingTimer) { clearInterval(recordingTimer); recordingTimer = null; }
    if (votingTimer) { clearInterval(votingTimer); votingTimer = null; }
    clearClipTimers();
  }

  // ── Message handlers ────────────────────────────────────────────

  function onCategorySelectionStart(data: {
    chooserId: string;
    chooserName: string;
    categories: CategoryInfo[];
    durationMs: number;
    serverTimestamp: number;
  }) {
    categories = data.categories;
    categoryChooserId = data.chooserId;
    categoryChooserName = data.chooserName;
    amCategoryChooser = data.chooserId === me?.id;
    chosenCategory = null;
    categoryRevealing = false;

    subPhase = amCategoryChooser ? "category_choosing" : "category_waiting";

    categoryEndTime = data.serverTimestamp + data.durationMs;
    categoryTimeLeft = Math.max(0, (categoryEndTime - Date.now()) / 1000);

    categoryTimer = setInterval(() => {
      categoryTimeLeft = Math.max(0, (categoryEndTime - Date.now()) / 1000);
    }, 200);
  }

  function onCategoryChosen(data: { category: CategoryInfo; chooserName: string }) {
    chosenCategory = data.category;
    categoryRevealing = true;
    subPhase = "category_waiting";
    if (categoryTimer) { clearInterval(categoryTimer); categoryTimer = null; }
    // The server will send gif_selection_start after a brief delay
  }

  function onGifSelectionStart(data: {
    gifs: GifEntry[];
    category: CategoryInfo;
    searchTerm?: string;
    durationMs: number;
    serverTimestamp: number;
    totalSelectors: number;
  }) {
    subPhase = "gif_browsing";
    gifPool = data.gifs;
    gifCategoryInfo = data.category;
    selectedGifUrl = "";
    selectedGifLabel = "";
    gifSelectionConfirmed = false;
    // Pre-populate search with the category's search term
    searchQuery = data.searchTerm ?? "";
    isSearching = false;

    gifSelectionEndTime = data.serverTimestamp + data.durationMs;
    gifSelectionTimeLeft = Math.max(0, (gifSelectionEndTime - Date.now()) / 1000);
    selectionsSubmitted = 0;
    selectionsTotal = data.totalSelectors;

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

  function onGifSearchResults(data: { gifs: GifEntry[]; query: string }) {
    isSearching = false;
    // Replace the displayed GIFs with the new search results
    gifPool = data.gifs;
  }

  function onRecordingPrepare(data: {
    playerId: string;
    playerName: string;
    durationMs: number;
    serverTimestamp: number;
  }) {
    clearAllTimers();
    currentRecorderName = data.playerName;
    isMyTurn = data.playerId === me?.id;
    recordingEndTime = data.serverTimestamp + data.durationMs;
    recordingTimeLeft = Math.max(0, (recordingEndTime - Date.now()) / 1000);

    if (isMyTurn) {
      subPhase = "recording_prepare";
    } else {
      subPhase = "watching_others";
    }

    recordingTimer = setInterval(() => {
      recordingTimeLeft = Math.max(0, (recordingEndTime - Date.now()) / 1000);
    }, 100);
  }

  function onRecordingTurn(data: {
    playerId: string;
    playerName: string;
    durationMs: number;
    serverTimestamp: number;
    maxClipDurationMs: number;
    mode: "randomized" | "record_own";
  }) {
    clearAllTimers();
    currentRecorderName = data.playerName;
    isMyTurn = data.playerId === me?.id;
    maxClipDurationMs = data.maxClipDurationMs;
    assignedMode = data.mode;

    if (isMyTurn) {
      subPhase = "my_recording";
      if (!audioBase64) {
        recordingDone = false;
        clipTimeLeft = data.maxClipDurationMs / 1000;
        recordingProgress = 0;
      }
    } else {
      subPhase = "watching_others";
    }

    recordingEndTime = data.serverTimestamp + data.durationMs;
    recordingTimeLeft = Math.max(0, (recordingEndTime - Date.now()) / 1000);
    const totalSecs = data.durationMs / 1000;
    recordingTimer = setInterval(() => {
      recordingTimeLeft = Math.max(0, (recordingEndTime - Date.now()) / 1000);
      recordingProgress = 1 - recordingTimeLeft / totalSecs;

      if (recordingTimeLeft <= 0) {
        if (isRecording) {
          stopHeldRecording();
        } else if (isMyTurn && audioBase64 && !recordingSubmitted) {
          submitRecording();
        }
      }
    }, 100);
  }

  function onGifAssigned(data: {
    gifUrl: string;
    gifLabel: string;
    originalPicker: string;
    maxClipDurationMs: number;
    mode: "randomized" | "record_own";
  }) {
    assignedGifUrl = data.gifUrl;
    assignedGifLabel = data.gifLabel;
    assignedOriginalPicker = data.originalPicker;
    assignedMode = data.mode;
    maxClipDurationMs = data.maxClipDurationMs;
    recordingSubmitted = false;
    recordingSubmitPending = false;
    resetTakeState();
  }

  function onRecordingSubmitted(data: { playerId: string }) {
    if (recordingTimer) {
      clearInterval(recordingTimer);
      recordingTimer = null;
    }
    recordingTimeLeft = 0;
    recordingProgress = 1;

    if (data.playerId === me?.id) {
      recordingSubmitted = true;
      recordingSubmitPending = false;
    } else {
      // Someone else finished — advance their wait UI
    }
  }

  function onPlaybackEntry(data: {
    playerId: string;
    playerName: string;
    gifUrl: string;
    gifLabel: string;
    audioDurationMs: number;
    introDurationMs: number;
    postDurationMs: number;
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
    totalVoters: number;
    entries: { playerId: string; playerName: string; gifUrl: string; gifLabel: string }[];
  }) {
    subPhase = "voting";
    clearAllTimers();

    votableEntries = data.entries.filter((e) => e.playerId !== me?.id);
    votingEndTime = data.serverTimestamp + data.durationMs;
    votingTimeLeft = Math.max(0, (votingEndTime - Date.now()) / 1000);
    myVote = null;
    voteConfirmed = false;
    votesIn = 0;
    totalVoters = data.totalVoters;

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
    room.onMessage("category_selection_start", onCategorySelectionStart);
    room.onMessage("category_chosen", onCategoryChosen);
    room.onMessage("gif_selection_start", onGifSelectionStart);
    room.onMessage("gif_selection_confirmed", onGifSelectionConfirmed);
    room.onMessage("gif_selection_update", onGifSelectionUpdate);
    room.onMessage("gif_search_results", onGifSearchResults);
    room.onMessage("gif_assigned", onGifAssigned);
    room.onMessage("recording_prepare", onRecordingPrepare);
    room.onMessage("recording_turn", onRecordingTurn);
    room.onMessage("recording_submitted", onRecordingSubmitted);
    room.onMessage("playback_entry", onPlaybackEntry);
    room.onMessage("playback_done", onPlaybackDone);
    room.onMessage("voting_start", onVotingStart);
    room.onMessage("vote_confirmed", onVoteConfirmed);
    room.onMessage("vote_count_update", onVoteCountUpdate);
    room.onMessage("round_result", onRoundResult);
    room.onMessage("round_skipped", onRoundSkipped);
    window.addEventListener("pointerup", stopHeldRecording);
    window.addEventListener("pointercancel", stopHeldRecording);
  });

  onDestroy(() => {
    clearAllTimers();
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
    stopMediaStream();
    window.removeEventListener("pointerup", stopHeldRecording);
    window.removeEventListener("pointercancel", stopHeldRecording);
    revokeAudioPreview();
  });

  // ── Auto-submit when recording finishes ─────────────────────────
  $: if (subPhase === "my_recording" && recordingDone && audioBase64 && !recordingSubmitted) {
    subPhase = "recording_done";
  }

  $: myScore = results?.scores[me?.id ?? ""] ?? 0;
  $: myEntry = results?.entries.find((e) => e.playerId === me?.id);
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-6 p-6" data-testid="audio-overlay">

  {#if roundSkipped}
    <div class="text-center space-y-3">
      <h2 class="text-xl font-black text-yellow-400">Round Skipped</h2>
      <p class="text-gray-300">{skipReason}</p>
    </div>

  {:else if subPhase === "waiting"}
    <p class="text-gray-400 text-center">Get ready...</p>

  {:else if subPhase === "category_choosing"}
    <!-- I'm the chosen player — pick a category -->
    <div class="w-full max-w-sm space-y-4 overflow-y-auto max-h-[85vh]">
      <div class="text-center sticky top-0 bg-gray-900 pb-2 z-10">
        <h2 class="text-2xl font-black text-purple-400">You Choose!</h2>
        <p class="text-sm text-gray-400 mt-1">Pick a GIF category for everyone</p>
        <p class="text-lg font-mono text-white mt-2">{Math.ceil(categoryTimeLeft)}s</p>
      </div>

      <div class="space-y-2">
        {#each categories as cat}
          <button
            class="w-full text-left px-4 py-4 rounded-xl border-2 transition-all active:scale-[0.97]
              border-gray-700 bg-gray-800 hover:border-purple-500 active:border-purple-400"
            on:click={() => pickCategory(cat.id)}
          >
            <div class="flex items-center gap-3">
              <span class="text-3xl">{CATEGORY_ICONS[cat.icon] ?? '?'}</span>
              <div class="flex-1 min-w-0">
                <p class="font-bold text-white text-lg">{cat.name}</p>
                <p class="text-sm text-gray-400 truncate">{cat.description}</p>
              </div>
            </div>
          </button>
        {/each}
      </div>
    </div>

  {:else if subPhase === "category_waiting"}
    <!-- Someone else is choosing the category -->
    <div class="text-center space-y-6">
      {#if categoryRevealing && chosenCategory}
        <!-- Category reveal animation -->
        <div class="animate-bounce">
          <span class="text-6xl">{CATEGORY_ICONS[chosenCategory.icon] ?? '?'}</span>
        </div>
        <h2 class="text-3xl font-black text-purple-400">{chosenCategory.name}</h2>
        <p class="text-gray-400">Get ready to browse GIFs!</p>
      {:else}
        <div class="space-y-4">
          <h2 class="text-xl font-black text-purple-400">Choosing Category...</h2>
          <p class="text-lg text-gray-300">
            <span class="font-bold text-white">{categoryChooserName}</span> is picking the theme
          </p>
          <p class="text-3xl font-mono text-white">{Math.ceil(categoryTimeLeft)}s</p>
        </div>

        <!-- Show available categories dimmed -->
        <div class="w-full max-w-xs space-y-1.5 opacity-60">
          {#each categories as cat}
            <div class="flex items-center gap-2 px-3 py-2 bg-gray-800/50 rounded-lg">
              <span class="text-xl">{CATEGORY_ICONS[cat.icon] ?? '?'}</span>
              <span class="text-sm text-gray-400">{cat.name}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>

  {:else if subPhase === "gif_browsing"}
    <!-- GIF Selection Phase — Search-based -->
    <div class="w-full max-w-sm space-y-4 overflow-y-auto max-h-[85vh]">
      <div class="text-center sticky top-0 bg-gray-900 pb-2 z-10">
        <h2 class="text-xl font-black text-purple-400">Pick a GIF!</h2>
        {#if gifCategoryInfo}
          <p class="text-xs text-purple-300 mt-0.5">
            {CATEGORY_ICONS[gifCategoryInfo.icon] ?? ''} {gifCategoryInfo.name}
          </p>
        {/if}
        <p class="text-sm text-gray-400 mt-1">
          {Math.ceil(gifSelectionTimeLeft)}s remaining
          {#if selectionsTotal > 0}
            <span class="ml-1 text-gray-500">({selectionsSubmitted}/{selectionsTotal} picked)</span>
          {/if}
        </p>

        <!-- Search input — always visible -->
        <div class="mt-2 flex gap-2">
          <input
            type="text"
            bind:value={searchQuery}
            on:input={onSearchInput}
            placeholder="Search for GIFs..."
            class="flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm
              placeholder-gray-500 focus:border-purple-500 focus:outline-none"
          />
          <button
            class="px-3 py-2 rounded-lg text-sm font-bold transition-colors
              {searchQuery.trim().length >= 2
                ? 'bg-purple-600 text-white active:bg-purple-500'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'}"
            disabled={searchQuery.trim().length < 2 || isSearching}
            on:click={searchGifs}
          >
            {isSearching ? '...' : 'Go'}
          </button>
        </div>
      </div>

      <!-- GIF grid -->
      {#if isSearching}
        <div class="text-center py-8">
          <p class="text-gray-400">Searching...</p>
        </div>
      {:else if gifPool.length === 0}
        <div class="text-center py-8 space-y-2">
          <p class="text-gray-400">No GIFs found</p>
          <p class="text-gray-500 text-sm">Try searching for something else</p>
        </div>
      {:else}
        <div class="grid grid-cols-2 gap-2">
          {#each gifPool as gif}
            <button
              class="rounded-lg overflow-hidden border-2 transition-all active:scale-95
                {selectedGifUrl === gif.url
                  ? 'border-purple-500 ring-2 ring-purple-400'
                  : 'border-gray-700 active:border-purple-500'}"
              on:click={() => selectGif(gif.url, gif.label)}
            >
              <img
                src={gif.url}
                alt={gif.label}
                class="w-full h-24 object-cover"
                loading="lazy"
              />
            </button>
          {/each}
        </div>
      {/if}

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
    <!-- Confirmed — waiting for others + mic permission prompt -->
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

      {#if micGranted}
        <div class="flex items-center gap-2 justify-center text-green-400 text-sm">
          <span>Microphone enabled in lobby</span>
        </div>
      {:else}
        <div class="bg-red-950/60 border border-red-700 rounded-xl p-4 space-y-2">
          <p class="text-red-200 font-semibold">Microphone not enabled</p>
          <p class="text-red-300/90 text-sm">Use the lobby permission button before the next round if you want to record.</p>
        </div>
      {/if}
    </div>

  {:else if subPhase === "watching_others"}
    <!-- Watching another player record -->
    <div class="text-center space-y-4">
      <h2 class="text-xl font-black text-purple-400">Recording in Progress</h2>
      <p class="text-lg text-gray-300">
        <span class="font-bold text-white">{currentRecorderName}</span> is dubbing a GIF...
      </p>
      <p class="text-sm text-gray-500">{Math.ceil(recordingTimeLeft)}s remaining</p>
      <p class="text-xs text-gray-600">Watch the TV!</p>

      {#if !micGranted}
        <div class="bg-red-950/60 border border-red-700 rounded-xl p-4 space-y-2 mt-4">
          <p class="text-red-200 font-semibold text-sm">Recording requires lobby mic access</p>
          <p class="text-red-300/90 text-sm">Players without microphone permission stay out of the recording rotation.</p>
        </div>
      {/if}
    </div>

  {:else if subPhase === "recording_prepare"}
    <div class="w-full max-w-sm text-center space-y-4">
      <p class="text-xs uppercase tracking-[0.3em] text-yellow-400">Up Next</p>
      <h2 class="text-3xl font-black text-white">Your turn starts soon</h2>
      <p class="text-gray-300">You have 60 seconds for as many attempts as you want. Each take must stay under 10 seconds.</p>

      {#if assignedGifUrl}
        <img
          src={assignedGifUrl}
          alt={assignedGifLabel}
          class="w-full max-w-xs h-48 object-cover rounded-xl mx-auto border-2 border-yellow-500"
        />
      {/if}

      <div class="rounded-xl bg-gray-800 px-4 py-3">
        <p class="text-4xl font-mono font-black text-white">{Math.ceil(recordingTimeLeft)}</p>
        <p class="text-sm text-gray-400 mt-1">
          {assignedMode === 'record_own'
            ? 'You are dubbing your own GIF.'
            : `You are dubbing ${assignedOriginalPicker}'s GIF.`}
        </p>
      </div>
    </div>

  {:else if subPhase === "my_recording"}
    <!-- My turn to record -->
    <div class="w-full max-w-sm text-center space-y-4">
      <h2 class="text-2xl font-black text-red-400">Your Turn!</h2>
      <p class="text-sm text-gray-400">
        Dub this GIF with your audio
        <span class="text-gray-500">
          ({assignedMode === 'record_own' ? 'your pick' : `picked by ${assignedOriginalPicker}`})
        </span>
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
        </div>
      {:else}
        <div class="grid grid-cols-2 gap-3 text-center">
          <div class="rounded-xl bg-gray-800 px-4 py-3">
            <p class="text-xs uppercase tracking-widest text-gray-500">Turn</p>
            <p class="text-3xl font-mono font-black text-white">{Math.ceil(recordingTimeLeft)}</p>
          </div>
          <div class="rounded-xl bg-gray-800 px-4 py-3">
            <p class="text-xs uppercase tracking-widest text-gray-500">Take Max</p>
            <p class="text-3xl font-mono font-black text-red-300">{clipTimeLeft.toFixed(1)}</p>
          </div>
        </div>

        <p class="text-sm text-gray-400">Press and hold to record. Let go to stop. Re-record as many times as you want before the turn ends.</p>

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

          <button
            class="w-full py-5 rounded-xl font-black text-lg transition-all select-none
              {isRecording
                ? 'bg-red-700 text-white scale-[0.98]'
                : 'bg-red-600 text-white active:bg-red-500 active:scale-95'}"
            on:pointerdown|preventDefault={startHeldRecording}
            on:pointerup|preventDefault={stopHeldRecording}
            on:pointerleave={stopHeldRecording}
            disabled={recordingSubmitted || recordingSubmitPending || recordingTimeLeft <= 0}
          >
            {isRecording ? 'Recording... release to stop' : 'Press and Hold to Record'}
          </button>

          {#if audioPreviewUrl && !isRecording}
            <audio controls src={audioPreviewUrl} class="w-full"></audio>
            <div class="grid grid-cols-2 gap-3 w-full">
              <button
                class="py-3 rounded-xl bg-gray-700 text-white font-bold active:bg-gray-600 transition-all active:scale-95"
                on:click={resetTakeState}
              >Re-record</button>
              <button
                class="py-3 rounded-xl bg-green-600 text-white font-bold active:bg-green-500 transition-all active:scale-95"
                on:click={submitRecording}
                disabled={recordingSubmitted || recordingSubmitPending}
              >{recordingSubmitPending ? 'Submitting...' : 'Submit Take'}</button>
             </div>
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

      {#if audioPreviewUrl}
        <audio controls src={audioPreviewUrl} class="w-full"></audio>
      {/if}

      <p class="text-sm text-gray-400">You can still re-record until the turn timer reaches zero.</p>

      <button
        class="w-full py-4 rounded-xl text-lg font-bold transition-all active:scale-95
          bg-gray-700 text-white active:bg-gray-600"
        on:click={() => {
          resetTakeState();
          subPhase = 'my_recording';
        }}
        disabled={recordingTimeLeft <= 0 || recordingSubmitted || recordingSubmitPending}
      >Record Again</button>

      <button
        class="w-full py-4 rounded-xl text-lg font-bold transition-all active:scale-95
          bg-green-600 text-white active:bg-green-500"
        on:click={submitRecording}
        disabled={recordingSubmitted || recordingSubmitPending}
      >
        {recordingSubmitted ? "Submitted!" : recordingSubmitPending ? "Submitting..." : "Submit Recording"}
      </button>

      {#if recordingSubmitted}
        <p class="text-sm text-green-400">Waiting for next player...</p>
      {:else if recordingSubmitPending}
        <p class="text-sm text-yellow-400">Submitting your take...</p>
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
              <div class="flex gap-3 items-center">
                <img src={entry.gifUrl} alt={entry.gifLabel} class="w-20 h-14 rounded-lg object-cover border border-gray-700" />
                <div class="min-w-0">
                  <p class="font-semibold">{entry.playerName}</p>
                  <p class="text-xs text-gray-400 truncate">{entry.gifLabel}</p>
                </div>
              </div>
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
            <p class="text-xs text-yellow-400 uppercase tracking-widest mb-1">Best Audio Overlay</p>
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
