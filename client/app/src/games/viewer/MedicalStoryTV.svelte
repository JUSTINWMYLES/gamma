<script lang="ts">
  /**
   * TV/Viewer component for "Medical Story" (registry-43).
   *
   * Displays shared game state on a large screen:
   *   - Role assignments
   *   - Current phase and timer
   *   - Submission count during submission phase
   *   - All submissions during voting phase
   *   - Vote results with reveal animation
   *   - Round recap and leaderboard
   *
   * Server messages listened:
   *   ms_role_phase, ms_roles_assigned, ms_submission_phase,
 *   ms_voting_phase, ms_results_pending, ms_phase_result, ms_round_recap, round_skipped
   */
  import { onMount, onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState } from "../../../../shared/types";
  import { getRoundProgressLabel } from "../../../../shared/types";
  import MedicalStoryBodyModel from "../../components/MedicalStoryBodyModel.svelte";
  import PlayerIcon from "../../components/PlayerIcon.svelte";

  export let room: Room;
  export let state: RoomState;

  // ── Sub-phase tracking ──────────────────────────────────────────────
  type SubPhase =
    | "waiting"
    | "role_voting"
    | "roles_assigned"
    | "phase_preview"
    | "submission"
    | "voting"
    | "results_pending"
    | "phase_result"
    | "round_recap";
  type GamePhase = "complaint" | "diagnosis" | "procedure" | "catchphrase";
  type VotingSubmission = {
    playerId: string;
    text: string;
    bodyPart?: string;
    action?: string;
    tests?: string[];
  };
  type PhaseResult = VotingSubmission & { voteCount: number };
  type PhaseHistoryEntry = { phase: GamePhase; winner: PhaseResult | null };
  type RecapTimelineEntry = { phase: GamePhase; revealAtMs: number; winner: PhaseResult | null };
  let subPhase: SubPhase = "waiting";

  // ── Role voting ──────────────────────────────────────────────────────
  let playerList: { id: string; name: string }[] = [];
  let roleVoteDurationMs = 30_000;
  let roleVoteTimeLeft = 0;
  let roleVoteEndTime = 0;
  let roleVoteTimer: ReturnType<typeof setInterval> | null = null;

  // ── Role assignment ──────────────────────────────────────────────────
  let roles: Record<string, string> = {};

  // ── Submission phase ─────────────────────────────────────────────────
  let currentPhase: GamePhase = "complaint";
  let submissionDurationMs = 45_000;
  let submissionTimeLeft = 0;
  let submissionEndTime = 0;
  let submissionTimer: ReturnType<typeof setInterval> | null = null;
  let phaseHistory: PhaseHistoryEntry[] = [];
  let funnyTests: string[] = [];
  let catchphraseExamples: string[] = [];

  // Track which phases have had their winner officially revealed
  // (prevents sidebar from spoiling before the phase_result announcement)
  let revealedPhaseWinners = new Set<GamePhase>();

  /** Mark prior phases as revealed based on phase ordering */
  function markPriorPhasesRevealed(current: GamePhase, history: PhaseHistoryEntry[]) {
    const currentIdx = allPhases.indexOf(current);
    for (const entry of history) {
      const entryIdx = allPhases.indexOf(entry.phase);
      if (entryIdx < currentIdx && entry.winner) {
        revealedPhaseWinners.add(entry.phase);
      }
    }
    revealedPhaseWinners = revealedPhaseWinners;
  }

  // 3D placeholder data
  let scene3dPlaceholder: { type: string; description: string } | null = null;

  // ── Voting phase ─────────────────────────────────────────────────────
  let votingDurationMs = 30_000;
  let votingTimeLeft = 0;
  let votingEndTime = 0;
  let votingTimer: ReturnType<typeof setInterval> | null = null;
  let votingSubmissions: VotingSubmission[] = [];

  // ── Phase result ─────────────────────────────────────────────────────
  let phaseResults: PhaseResult[] = [];
  let phaseWinner: PhaseResult | null = null;
  let phasePoints: Record<string, number> = {};

  // ── Round recap ──────────────────────────────────────────────────────
  let phaseWinners: Record<string, PhaseResult | null> = {};
  let roundScores: Record<string, number> = {};
  let recapRoles: Record<string, string> = {};
  let recapTimeline: RecapTimelineEntry[] = [];
  let recapStartTime = 0;
  let recapTimer: ReturnType<typeof setInterval> | null = null;
  let revealedRecapPhases = new Set<GamePhase>();

  // ── Round skipped ────────────────────────────────────────────────────
  let roundSkipped = false;
  let skipReason = "";

  // ── Phase display info ───────────────────────────────────────────────
  const phaseLabels: Record<string, string> = {
    complaint: "Patient's Complaint",
    diagnosis: "Diagnosis",
    procedure: "Emergency Procedure",
    catchphrase: "Doctor's Catchphrase",
  };

  const phasePrompts: Record<string, string> = {
    complaint: "What is the patient's primary complaint?",
    diagnosis: "Invent a hilariously fake medical term and optionally add some funny tests.",
    procedure: "Devise an emergency procedure!",
    catchphrase: '"That\'s why they call me ___."',
  };

  const phaseIcons: Record<string, string> = {
    complaint: "🤕",
    diagnosis: "🔬",
    procedure: "🏥",
    catchphrase: "🎤",
  };

  const allPhases: GamePhase[] = ["complaint", "diagnosis", "procedure", "catchphrase"];

  // ── Message handlers ─────────────────────────────────────────────────

  function onRolePhase(data: { playerList: { id: string; name: string }[]; durationMs: number }) {
    subPhase = "role_voting";
    playerList = data.playerList;
    roleVoteDurationMs = data.durationMs;
    roleVoteEndTime = Date.now() + data.durationMs;

    clearAllTimers();
    roleVoteTimer = setInterval(() => {
      roleVoteTimeLeft = Math.max(0, (roleVoteEndTime - Date.now()) / 1000);
    }, 200);
  }

  function onRolesAssigned(data: { roles: Record<string, string> }) {
    subPhase = "roles_assigned";
    roles = data.roles;
    clearAllTimers();
  }

  // ── Phase preview (info screen before countdown) ────────────────────
  let previewDurationMs = 10_000;
  let previewTimeLeft = 0;
  let previewEndTime = 0;
  let previewTimer: ReturnType<typeof setInterval> | null = null;

  function onPhasePreview(data: { phase: typeof currentPhase; durationMs: number; history?: PhaseHistoryEntry[] }) {
    subPhase = "phase_preview";
    currentPhase = data.phase;
    previewDurationMs = data.durationMs;
    previewEndTime = Date.now() + data.durationMs;
    phaseHistory = data.history ?? phaseHistory;

    if (data.history) {
      markPriorPhasesRevealed(data.phase, data.history);
    }

    clearAllTimers();
    previewTimer = setInterval(() => {
      previewTimeLeft = Math.max(0, (previewEndTime - Date.now()) / 1000);
    }, 200);
  }

  function onSubmissionPhase(data: {
    phase: typeof currentPhase;
    durationMs: number;
    scene3dPlaceholder?: { type: string; description: string };
    history?: PhaseHistoryEntry[];
    tests?: string[];
    promptExamples?: string[];
  }) {
    subPhase = "submission";
    currentPhase = data.phase;
    submissionDurationMs = data.durationMs;
    submissionEndTime = Date.now() + data.durationMs;
    scene3dPlaceholder = data.scene3dPlaceholder ?? null;
    phaseHistory = data.history ?? [];
    funnyTests = data.tests ?? [];
    catchphraseExamples = data.promptExamples ?? [];

    // A new submission phase started — all phases in history are from prior reveals
    if (data.history) {
      markPriorPhasesRevealed(data.phase, data.history);
    }

    clearAllTimers();
    submissionTimer = setInterval(() => {
      submissionTimeLeft = Math.max(0, (submissionEndTime - Date.now()) / 1000);
    }, 200);
  }

  function onVotingPhase(data: {
    phase: typeof currentPhase;
    submissions: typeof votingSubmissions;
    durationMs: number;
    scene3dPlaceholder?: { type: string; description: string };
    history?: PhaseHistoryEntry[];
  }) {
    subPhase = "voting";
    currentPhase = data.phase;
    votingDurationMs = data.durationMs;
    votingEndTime = Date.now() + data.durationMs;
    votingSubmissions = data.submissions;
    scene3dPlaceholder = data.scene3dPlaceholder ?? null;
    phaseHistory = data.history ?? phaseHistory;

    // Mark prior phases as safe to show (not the current phase)
    if (data.history) {
      markPriorPhasesRevealed(data.phase, data.history);
    }

    clearAllTimers();
    votingTimer = setInterval(() => {
      votingTimeLeft = Math.max(0, (votingEndTime - Date.now()) / 1000);
    }, 200);
  }

  function onResultsPending(data: { phase: typeof currentPhase; history?: PhaseHistoryEntry[] }) {
    subPhase = "results_pending";
    currentPhase = data.phase;
    phaseHistory = data.history ?? phaseHistory;
    clearAllTimers();
  }

  function onPhaseResult(data: {
    phase: typeof currentPhase;
    results: typeof phaseResults;
    phaseWinner: typeof phaseWinner;
    points: Record<string, number>;
    scene3dPlaceholder?: { type: string; description: string };
    history?: PhaseHistoryEntry[];
  }) {
    subPhase = "phase_result";
    currentPhase = data.phase;
    phaseResults = data.results;
    phaseWinner = data.phaseWinner;
    phasePoints = data.points;
    scene3dPlaceholder = data.scene3dPlaceholder ?? null;
    phaseHistory = data.history ?? phaseHistory;

    // Officially reveal this phase's winner in the sidebar
    revealedPhaseWinners.add(data.phase);
    revealedPhaseWinners = revealedPhaseWinners;

    clearAllTimers();
  }

  function onRoundRecap(data: {
    phaseWinners: typeof phaseWinners;
    scores: Record<string, number>;
    roles: Record<string, string>;
    history?: PhaseHistoryEntry[];
    recapTimeline?: RecapTimelineEntry[];
  }) {
    subPhase = "round_recap";
    phaseWinners = data.phaseWinners;
    roundScores = data.scores;
    recapRoles = data.roles;
    phaseHistory = data.history ?? phaseHistory;
    recapTimeline = data.recapTimeline ?? [];
    recapStartTime = Date.now();
    revealedRecapPhases = new Set();

    // Reveal all phases in sidebar during recap
    for (const p of allPhases) {
      revealedPhaseWinners.add(p);
    }
    revealedPhaseWinners = revealedPhaseWinners;

    clearAllTimers();
    recapTimer = setInterval(() => {
      const elapsedMs = Date.now() - recapStartTime;
      revealedRecapPhases = new Set(
        recapTimeline
          .filter((entry) => elapsedMs >= entry.revealAtMs)
          .map((entry) => entry.phase),
      );
    }, 200);
  }

  function onRoundSkipped(data: { reason: string }) {
    roundSkipped = true;
    skipReason = data.reason;
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  function clearAllTimers() {
    if (roleVoteTimer) { clearInterval(roleVoteTimer); roleVoteTimer = null; }
    if (submissionTimer) { clearInterval(submissionTimer); submissionTimer = null; }
    if (votingTimer) { clearInterval(votingTimer); votingTimer = null; }
    if (recapTimer) { clearInterval(recapTimer); recapTimer = null; }
    if (previewTimer) { clearInterval(previewTimer); previewTimer = null; }
  }

  function getPlayerName(id: string): string {
    return state.players.get(id)?.name ?? id;
  }

  function getRoleEmoji(role: string): string {
    const emojis: Record<string, string> = {
      patient: "🤒",
      doctor: "👨‍⚕️",
      nurse: "👩‍⚕️",
      bystander: "👀",
    };
    return emojis[role] ?? "👤";
  }

  function getPhaseVoteBoost(phase: GamePhase): string {
    if (phase === "complaint") return "Patient votes count double this phase.";
    if (phase === "diagnosis") return "Nurse votes count double this phase.";
    if (phase === "catchphrase") return "Doctor votes count double this phase.";
    return "";
  }

  function phaseHasBodyModel(phase: GamePhase): boolean {
    return phase === "complaint";
  }

  $: sortedPlayers = [...state.players.values()].sort((a, b) => b.score - a.score);

  // ── Lifecycle ────────────────────────────────────────────────────────

  onMount(() => {
    room.onMessage("ms_role_phase", onRolePhase);
    room.onMessage("ms_roles_assigned", onRolesAssigned);
    room.onMessage("ms_phase_preview", onPhasePreview);
    room.onMessage("ms_submission_phase", onSubmissionPhase);
    room.onMessage("ms_voting_phase", onVotingPhase);
    room.onMessage("ms_results_pending", onResultsPending);
    room.onMessage("ms_phase_result", onPhaseResult);
    room.onMessage("ms_round_recap", onRoundRecap);
    room.onMessage("round_skipped", onRoundSkipped);
  });

  onDestroy(() => {
    clearAllTimers();
  });
</script>

<div class="flex-1 flex" data-testid="medical-story-tv">
  <div class="w-72 border-r border-gray-800 bg-gray-900/70 pt-14 px-4 pb-4 flex flex-col gap-3 flex-shrink-0">
    <div>
      <p class="text-xs text-gray-300 uppercase tracking-widest font-semibold">Story So Far</p>
      <p class="mt-1 text-sm text-gray-400">Winning entries stay visible all round.</p>
    </div>

    {#each allPhases as phase}
      {@const historyEntry = phaseHistory.find((entry) => entry.phase === phase)}
      {@const canShowWinner = revealedPhaseWinners.has(phase) && historyEntry?.winner}
      <div class="rounded-2xl border p-4 transition-all
        {canShowWinner
          ? 'border-emerald-600/60 bg-emerald-950/30'
          : 'border-gray-800 bg-gray-950/40'}">
        <p class="text-xs uppercase tracking-widest text-gray-200">{phaseIcons[phase]} {phaseLabels[phase]}</p>
        {#if canShowWinner}
          <p class="mt-2 text-sm font-semibold text-white">
            "{historyEntry.winner.text}"
          </p>
          {#if historyEntry.winner.bodyPart}
            <p class="mt-1 text-xs text-gray-200">📍 {historyEntry.winner.bodyPart}</p>
          {/if}
          {#if historyEntry.winner.tests && historyEntry.winner.tests.length}
            <p class="mt-1 text-xs text-gray-200">🧪 {historyEntry.winner.tests.join(", ")}</p>
          {/if}
          {#if historyEntry.winner.action}
            <p class="mt-1 text-xs text-gray-200">⚡ {historyEntry.winner.action}</p>
          {/if}
        {:else}
          <p class="mt-2 text-sm text-gray-500">Waiting for this phase.</p>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Main content area -->
  <div class="flex-1 flex flex-col items-center justify-center p-8">

    {#if roundSkipped}
      <!-- ── Round skipped ──────────────────────────────────────── -->
      <div class="text-center space-y-4">
        <h2 class="text-4xl font-black text-yellow-400">Round Skipped</h2>
        <p class="text-xl text-gray-300">{skipReason}</p>
      </div>

    {:else if subPhase === "waiting"}
      <!-- ── Waiting / Ambulance arrival ────────────────────────── -->
      <!-- TODO: Replace with 3D ambulance arrival scene (Three.js) -->
      <div class="text-center space-y-4">
        <p class="text-8xl animate-bounce">🚑</p>
        <h2 class="text-4xl font-black text-red-400">Patient Incoming!</h2>
        <p class="text-xl text-gray-400">Preparing the emergency room...</p>
      </div>

    {:else if subPhase === "role_voting"}
      <!-- ── Role voting ────────────────────────────────────────── -->
      <div class="text-center space-y-6 w-full max-w-2xl">
        <h2 class="text-4xl font-black text-blue-400">🏥 Assign Roles</h2>
        <p class="text-xl text-gray-300">Vote on your phones!</p>

        <p class="text-6xl font-mono font-black text-white">
          {Math.ceil(roleVoteTimeLeft)}
        </p>

        <div class="grid grid-cols-3 gap-4">
          <div class="bg-red-900/30 border border-red-700 rounded-2xl p-6 text-center">
            <p class="text-4xl mb-2">🤒</p>
            <p class="text-xl font-bold text-red-300">Patient</p>
          </div>
          <div class="bg-blue-900/30 border border-blue-700 rounded-2xl p-6 text-center">
            <p class="text-4xl mb-2">👨‍⚕️</p>
            <p class="text-xl font-bold text-blue-300">Doctor</p>
          </div>
          <div class="bg-pink-900/30 border border-pink-700 rounded-2xl p-6 text-center">
            <p class="text-4xl mb-2">👩‍⚕️</p>
            <p class="text-xl font-bold text-pink-300">Nurse</p>
          </div>
        </div>
      </div>

    {:else if subPhase === "roles_assigned"}
      <!-- ── Roles assigned ─────────────────────────────────────── -->
      <div class="text-center space-y-6 w-full max-w-2xl">
        <h2 class="text-4xl font-black text-emerald-400">Roles Assigned!</h2>
        <div class="flex flex-wrap gap-4 justify-center">
          {#each Object.entries(roles) as [playerId, role]}
            <div class="bg-gray-800 rounded-2xl p-6 text-center min-w-[150px]
              {role === 'patient' ? 'border-2 border-red-500' : role === 'doctor' ? 'border-2 border-blue-500' : role === 'nurse' ? 'border-2 border-pink-500' : 'border border-gray-700'}">
              <p class="text-3xl mb-2">{getRoleEmoji(role)}</p>
              <p class="text-lg font-bold text-white">{getPlayerName(playerId)}</p>
              <p class="text-sm text-gray-400 capitalize">{role}</p>
            </div>
          {/each}
        </div>
      </div>

    {:else if subPhase === "phase_preview"}
      <!-- ── Phase preview (info before countdown) ──────────────── -->
      <div class="text-center space-y-6 w-full max-w-3xl">
        <p class="text-8xl">{phaseIcons[currentPhase]}</p>
        <h2 class="text-5xl font-black text-amber-400">Next Up</h2>
        <p class="text-3xl font-bold text-white">{phaseLabels[currentPhase]}</p>
        <p class="text-xl text-gray-300">{phasePrompts[currentPhase]}</p>
        {#if getPhaseVoteBoost(currentPhase)}
          <p class="text-sm font-semibold uppercase tracking-widest text-amber-300">{getPhaseVoteBoost(currentPhase)}</p>
        {/if}
        <p class="text-lg text-gray-400">Starting in {Math.ceil(previewTimeLeft)}s...</p>
      </div>

    {:else if subPhase === "submission"}
      <!-- ── Submission phase ───────────────────────────────────── -->
      <div class="text-center space-y-6 w-full max-w-3xl">
        <p class="text-6xl">{phaseIcons[currentPhase]}</p>
        <h2 class="text-4xl font-black text-amber-400">{phaseLabels[currentPhase]}</h2>
        <p class="text-xl text-gray-300">{phasePrompts[currentPhase]}</p>
        {#if getPhaseVoteBoost(currentPhase)}
          <p class="text-sm font-semibold uppercase tracking-widest text-amber-300">{getPhaseVoteBoost(currentPhase)}</p>
        {/if}

        <p class="text-6xl font-mono font-black text-white">
          {Math.ceil(submissionTimeLeft)}
        </p>

        <p class="text-lg text-gray-400">Submit your answers on your phones!</p>

        {#if currentPhase === "complaint"}
          <div class="space-y-3">
            <MedicalStoryBodyModel />
            <p class="text-sm text-gray-400">
              {scene3dPlaceholder?.description ?? "Players are choosing a complaint location on the body model."}
            </p>
          </div>
        {:else if currentPhase === "diagnosis"}
          <div class="w-full rounded-3xl border border-cyan-700/40 bg-cyan-950/20 px-6 py-8 text-center">
            <p class="text-lg font-semibold text-white">Optional funny tests</p>
            <div class="mt-4 flex flex-wrap justify-center gap-2">
              {#each funnyTests as test}
                <span class="rounded-full border border-cyan-700/50 bg-cyan-900/40 px-3 py-1 text-sm text-cyan-100">{test}</span>
              {/each}
            </div>
            <p class="mt-4 text-sm text-gray-400">
              {scene3dPlaceholder?.description ?? "Players can add up to 3 ridiculous tests to support their fake diagnosis."}
            </p>
          </div>
        {:else if currentPhase === "catchphrase"}
          <div class="w-full rounded-3xl border border-violet-700/40 bg-violet-950/20 px-6 py-8 text-center">
            <p class="text-lg font-semibold text-white">Prompt examples</p>
            <p class="mt-2 text-3xl font-black text-violet-100">"That's why they call me ..."</p>
            {#if catchphraseExamples.length > 0}
              <div class="mt-4 flex flex-wrap justify-center gap-2">
                {#each catchphraseExamples as example}
                  <span class="rounded-full border border-violet-700/50 bg-violet-900/40 px-3 py-1 text-sm text-violet-100">{example}</span>
                {/each}
              </div>
            {/if}
            <p class="mt-4 text-sm text-gray-400">{scene3dPlaceholder?.description ?? "Players are turning the doctor boast into anything they want."}</p>
          </div>
        {:else}
          <div class="w-full rounded-3xl border border-gray-700/60 bg-white/5 px-6 py-8 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <p class="text-lg font-semibold text-white">Action preview coming next</p>
            <p class="mt-2 text-sm text-gray-400">
              {scene3dPlaceholder?.description ?? "Players are picking the emergency procedure action on their phones."}
            </p>
          </div>
        {/if}
      </div>

    {:else if subPhase === "voting"}
      <!-- ── Voting phase ───────────────────────────────────────── -->
      <div class="text-center space-y-6 w-full max-w-3xl">
        <p class="text-5xl">{phaseIcons[currentPhase]}</p>
        <h2 class="text-3xl font-black text-indigo-400">Vote: {phaseLabels[currentPhase]}</h2>
        {#if getPhaseVoteBoost(currentPhase)}
          <p class="text-sm font-semibold uppercase tracking-widest text-indigo-300">{getPhaseVoteBoost(currentPhase)}</p>
        {/if}

        <p class="text-5xl font-mono font-black text-white">
          {Math.ceil(votingTimeLeft)}
        </p>

        <!-- Show all submissions -->
        <!-- TODO: Replace with 3D voting scene (Three.js) -->
        <div class="grid grid-cols-2 gap-4 w-full">
          {#each votingSubmissions as sub, i}
            <div class="bg-gray-800 rounded-2xl p-6 text-left border border-gray-700 hover:border-indigo-500 transition-colors">
              <p class="text-lg font-bold text-white">"{sub.text}"</p>
              {#if sub.bodyPart}
                <p class="text-sm text-gray-400 mt-1">📍 {sub.bodyPart}</p>
              {/if}
              {#if sub.action}
                <p class="text-sm text-gray-400 mt-1">⚡ {sub.action}</p>
              {/if}
              {#if sub.tests && sub.tests.length > 0}
                <p class="text-sm text-gray-400 mt-1">🧪 {sub.tests.join(", ")}</p>
              {/if}
              <p class="text-xs text-gray-500 mt-2">by {getPlayerName(sub.playerId)}</p>
            </div>
          {/each}
        </div>
      </div>

    {:else if subPhase === "phase_result"}
      <!-- ── Phase result ───────────────────────────────────────── -->
      <div class="text-center space-y-6 w-full max-w-3xl">
        <p class="text-6xl">{phaseIcons[currentPhase]}</p>
        <h2 class="text-3xl font-black text-emerald-400">{phaseLabels[currentPhase]} — Winner!</h2>

        {#if phaseWinner}
          <div
            class="grid gap-6 items-center w-full max-w-5xl mx-auto"
            style={phaseHasBodyModel(currentPhase) && phaseWinner.bodyPart ? "grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);" : ""}
          >
            {#if phaseHasBodyModel(currentPhase) && phaseWinner.bodyPart}
              <div class="space-y-3">
                <MedicalStoryBodyModel selectedPart={phaseWinner.bodyPart} />
                <p class="text-sm text-gray-400">
                  {getPlayerName(phaseWinner.playerId)} nailed the location: {phaseWinner.bodyPart}
                </p>
              </div>
            {/if}
            <div class="bg-gradient-to-br from-amber-900/50 to-yellow-900/50 border-2 border-amber-500 rounded-2xl p-8 inline-block">
              <p class="text-2xl font-bold text-white mb-2">"{phaseWinner.text}"</p>
              {#if phaseWinner.bodyPart}
                <p class="text-lg text-amber-200">📍 {phaseWinner.bodyPart}</p>
              {/if}
              {#if phaseWinner.action}
                <p class="text-lg text-amber-200">⚡ {phaseWinner.action}</p>
              {/if}
              {#if phaseWinner.tests && phaseWinner.tests.length > 0}
                <p class="text-lg text-amber-200">🧪 {phaseWinner.tests.join(", ")}</p>
              {/if}
              <p class="text-lg text-gray-300 mt-2">by {getPlayerName(phaseWinner.playerId)}</p>
              <p class="text-xl text-amber-300 font-bold mt-1">
                {phaseWinner.voteCount} vote{phaseWinner.voteCount !== 1 ? 's' : ''} — +{phasePoints[phaseWinner.playerId] ?? 0} pts
              </p>
            </div>
          </div>
        {:else}
          <p class="text-xl text-gray-400">No submissions this phase.</p>
        {/if}

        <!-- All results ranked -->
        <div class="space-y-2 max-w-xl mx-auto">
          {#each phaseResults as result, i}
            <div class="flex items-center gap-3 px-4 py-2 rounded-xl bg-gray-800 text-left
              {i === 0 ? 'border border-amber-500' : 'border border-gray-700'}">
              <span class="text-lg font-bold text-gray-500 w-8">#{i + 1}</span>
              <div class="flex-1">
                <span class="text-sm text-white">"{result.text}"</span>
                <span class="text-xs text-gray-500 ml-2">— {getPlayerName(result.playerId)}</span>
              </div>
              <span class="text-sm text-gray-400">{result.voteCount}🗳️</span>
            </div>
          {/each}
        </div>
      </div>

    {:else if subPhase === "results_pending"}
      <!-- ── Results pending ───────────────────────────────────── -->
      <div class="text-center space-y-5 w-full max-w-3xl">
        <p class="text-6xl">{phaseIcons[currentPhase]}</p>
        <h2 class="text-5xl font-black text-emerald-300">The results are in...</h2>
        <p class="text-xl text-gray-300">Revealing the winning {phaseLabels[currentPhase].toLowerCase()} in a moment.</p>
      </div>

    {:else if subPhase === "round_recap"}
      <!-- ── Round recap ────────────────────────────────────────── -->
      <div class="text-center space-y-6 w-full max-w-3xl">
        <h2 class="text-4xl font-black text-fuchsia-400">Round Recap</h2>

        <!-- Phase winners summary -->
        <div class="grid grid-cols-2 gap-4">
          {#each allPhases as phase}
            {@const isRevealed = revealedRecapPhases.has(phase)}
            <div class="bg-gray-800 rounded-2xl p-5 text-left border transition-all
              {isRevealed
                ? 'border-fuchsia-500 opacity-100 scale-100'
                : 'border-gray-700 opacity-30 scale-95'}">
              <p class="text-sm text-gray-400 uppercase tracking-widest mb-2">
                {phaseIcons[phase]} {phaseLabels[phase]}
              </p>
              {#if isRevealed && phaseWinners[phase]}
                <p class="text-lg font-bold text-white">"{phaseWinners[phase]?.text}"</p>
                {#if phaseWinners[phase]?.tests && phaseWinners[phase]?.tests?.length}
                  <p class="text-sm text-gray-300 mt-1">🧪 {phaseWinners[phase]?.tests?.join(", ")}</p>
                {/if}
                <p class="text-sm text-gray-400 mt-1">by {getPlayerName(phaseWinners[phase]?.playerId ?? '')}</p>
              {:else if isRevealed}
                <p class="text-lg text-gray-600">No winner</p>
              {:else}
                <p class="text-lg text-gray-600">Revealing soon...</p>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <!-- Sidebar: Leaderboard -->
  <div class="w-64 bg-gray-800 p-4 flex flex-col gap-4 flex-shrink-0">
    <div class="text-center">
      <p class="text-xs text-gray-400 uppercase tracking-widest">Round</p>
      <p class="text-2xl font-black text-white">{getRoundProgressLabel(state)}</p>
    </div>

    <div>
        <p class="text-xs text-gray-400 uppercase tracking-widest mb-2">Leaderboard</p>
        <ul class="space-y-1">
          {#each sortedPlayers as p, i}
            <li class="flex items-center gap-2 rounded px-2 py-1.5 bg-gray-900">
              <span class="w-5 text-xs text-gray-500 font-mono">{i + 1}.</span>
              <PlayerIcon player={p} size={20} />
              <span class="flex-1 text-sm truncate text-gray-200">{p.name}</span>
              <span class="text-sm font-mono font-bold text-white">{p.score}</span>
            </li>
          {/each}
        </ul>
    </div>
  </div>
</div>
