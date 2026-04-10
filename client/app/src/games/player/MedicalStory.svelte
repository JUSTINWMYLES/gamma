<script lang="ts">
  /**
   * Phone game component for "Medical Story" (registry-43).
   *
   * Sub-phases during `in_round`:
   *   role_voting → roles_assigned → submission → voting → phase_result → round_recap
   *
   * The game cycles through four creative phases:
   *   complaint → diagnosis → procedure → catchphrase
   *
   * Server messages listened:
   *   ms_role_phase, ms_roles_assigned, ms_submission_phase,
   *   ms_submit_ack, ms_voting_phase, ms_vote_ack,
   *   ms_phase_result, ms_round_recap, round_skipped
   */
  import { onMount, onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState, PlayerState } from "../../../../shared/types";
  import MedicalStoryBodyModel from "../../components/MedicalStoryBodyModel.svelte";

  export let room: Room;
  export let state: RoomState;
  export let me: PlayerState | undefined;

  // ── Sub-phase tracking ──────────────────────────────────────────────
  type SubPhase =
    | "waiting"
    | "role_voting"
    | "roles_assigned"
    | "submission"
    | "voting"
    | "phase_result"
    | "round_recap";
  let subPhase: SubPhase = "waiting";

  // ── Role voting ──────────────────────────────────────────────────────
  let playerList: { id: string; name: string }[] = [];
  let roleVoteDurationMs = 30_000;
  let roleVoteTimeLeft = 0;
  let roleVoteEndTime = 0;
  let roleVoteTimer: ReturnType<typeof setInterval> | null = null;

  let selectedPatient = "";
  let selectedDoctor = "";
  let selectedNurse = "";
  let roleVoteSubmitted = false;

  // ── Role assignment ──────────────────────────────────────────────────
  let roles: Record<string, string> = {};
  let myRole = "";

  // ── Submission phase ─────────────────────────────────────────────────
  let currentPhase: "complaint" | "diagnosis" | "procedure" | "catchphrase" = "complaint";
  let submissionDurationMs = 45_000;
  let submissionTimeLeft = 0;
  let submissionEndTime = 0;
  let submissionTimer: ReturnType<typeof setInterval> | null = null;

  let submissionText = "";
  let selectedBodyPart = "";
  let selectedAction = "";
  let submitted = false;
  let submitError = "";

  let bodyParts: string[] = [];
  let actions: string[] = [];

  // 3D placeholder data
  let scene3dPlaceholder: { type: string; description: string } | null = null;

  // ── Voting phase ─────────────────────────────────────────────────────
  let votingDurationMs = 30_000;
  let votingTimeLeft = 0;
  let votingEndTime = 0;
  let votingTimer: ReturnType<typeof setInterval> | null = null;
  let votingSubmissions: {
    playerId: string;
    text: string;
    bodyPart?: string;
    action?: string;
  }[] = [];
  let votedFor = "";
  let voteSubmitted = false;

  // ── Phase result ─────────────────────────────────────────────────────
  let phaseResults: {
    playerId: string;
    text: string;
    bodyPart?: string;
    action?: string;
    voteCount: number;
  }[] = [];
  let phaseWinner: typeof phaseResults[0] | null = null;
  let phasePoints: Record<string, number> = {};

  // ── Round recap ──────────────────────────────────────────────────────
  let phaseWinners: Record<string, typeof phaseWinner> = {};
  let roundScores: Record<string, number> = {};
  let recapRoles: Record<string, string> = {};

  // ── Round skipped ────────────────────────────────────────────────────
  let roundSkipped = false;
  let skipReason = "";

  // ── Phase labels ─────────────────────────────────────────────────────
  const phaseLabels: Record<string, string> = {
    complaint: "Patient's Complaint",
    diagnosis: "Diagnosis",
    procedure: "Procedure",
    catchphrase: "Catchphrase",
  };

  const phasePrompts: Record<string, string> = {
    complaint: "What is the patient's primary complaint?",
    diagnosis: "Invent a hilariously fake medical term!",
    procedure: "Devise an emergency procedure name!",
    catchphrase: 'Complete: "Well that\'s why they call me the ___ doctor in the country"',
  };

  const phaseIcons: Record<string, string> = {
    complaint: "🤕",
    diagnosis: "🔬",
    procedure: "🏥",
    catchphrase: "🎤",
  };

  // ── Message handlers ─────────────────────────────────────────────────

  function onRolePhase(data: { playerList: { id: string; name: string }[]; durationMs: number }) {
    subPhase = "role_voting";
    playerList = data.playerList;
    roleVoteDurationMs = data.durationMs;
    roleVoteEndTime = Date.now() + data.durationMs;
    roleVoteSubmitted = false;
    selectedPatient = "";
    selectedDoctor = "";
    selectedNurse = "";

    clearAllTimers();
    roleVoteTimer = setInterval(() => {
      roleVoteTimeLeft = Math.max(0, (roleVoteEndTime - Date.now()) / 1000);
    }, 200);
  }

  function onRolesAssigned(data: { roles: Record<string, string> }) {
    subPhase = "roles_assigned";
    roles = data.roles;
    myRole = roles[me?.id ?? ""] ?? "bystander";
    clearAllTimers();
  }

  function onSubmissionPhase(data: {
    phase: typeof currentPhase;
    durationMs: number;
    bodyParts?: string[];
    actions?: string[];
    scene3dPlaceholder?: { type: string; description: string };
  }) {
    subPhase = "submission";
    currentPhase = data.phase;
    submissionDurationMs = data.durationMs;
    submissionEndTime = Date.now() + data.durationMs;
    bodyParts = data.bodyParts ?? [];
    actions = data.actions ?? [];
    scene3dPlaceholder = data.scene3dPlaceholder ?? null;
    submissionText = "";
    selectedBodyPart = "";
    selectedAction = "";
    submitted = false;
    submitError = "";

    clearAllTimers();
    submissionTimer = setInterval(() => {
      submissionTimeLeft = Math.max(0, (submissionEndTime - Date.now()) / 1000);
    }, 200);
  }

  function onSubmitAck(data: { accepted: boolean; reason?: string }) {
    if (data.accepted) {
      submitted = true;
      submitError = "";
    } else {
      submitError = data.reason ?? "Submission failed";
    }
  }

  function onVotingPhase(data: {
    phase: typeof currentPhase;
    submissions: typeof votingSubmissions;
    durationMs: number;
    scene3dPlaceholder?: { type: string; description: string };
  }) {
    subPhase = "voting";
    currentPhase = data.phase;
    votingDurationMs = data.durationMs;
    votingEndTime = Date.now() + data.durationMs;
    votingSubmissions = data.submissions.filter((s) => s.playerId !== me?.id);
    scene3dPlaceholder = data.scene3dPlaceholder ?? null;
    votedFor = "";
    voteSubmitted = false;

    clearAllTimers();
    votingTimer = setInterval(() => {
      votingTimeLeft = Math.max(0, (votingEndTime - Date.now()) / 1000);
    }, 200);
  }

  function onVoteAck() {
    voteSubmitted = true;
  }

  function onPhaseResult(data: {
    phase: typeof currentPhase;
    results: typeof phaseResults;
    phaseWinner: typeof phaseWinner;
    points: Record<string, number>;
    scene3dPlaceholder?: { type: string; description: string };
  }) {
    subPhase = "phase_result";
    currentPhase = data.phase;
    phaseResults = data.results;
    phaseWinner = data.phaseWinner;
    phasePoints = data.points;
    scene3dPlaceholder = data.scene3dPlaceholder ?? null;
    clearAllTimers();
  }

  function onRoundRecap(data: {
    phaseWinners: typeof phaseWinners;
    scores: Record<string, number>;
    roles: Record<string, string>;
  }) {
    subPhase = "round_recap";
    phaseWinners = data.phaseWinners;
    roundScores = data.scores;
    recapRoles = data.roles;
    clearAllTimers();
  }

  function onRoundSkipped(data: { reason: string }) {
    roundSkipped = true;
    skipReason = data.reason;
  }

  // ── Actions ──────────────────────────────────────────────────────────

  function submitRoleVote() {
    if (!selectedPatient || !selectedDoctor || !selectedNurse) return;
    if (selectedPatient === selectedDoctor || selectedPatient === selectedNurse || selectedDoctor === selectedNurse) return;

    room.send("game_input", {
      action: "ms_role_vote",
      patient: selectedPatient,
      doctor: selectedDoctor,
      nurse: selectedNurse,
    });
    roleVoteSubmitted = true;
  }

  function submitEntry() {
    if (!submissionText.trim()) return;

    room.send("game_input", {
      action: "ms_submit",
      text: submissionText.trim(),
      bodyPart: selectedBodyPart || undefined,
      actionName: selectedAction || undefined,
    });
  }

  function castVote(targetPlayerId: string) {
    if (voteSubmitted) return;
    votedFor = targetPlayerId;
    room.send("game_input", {
      action: "ms_vote",
      targetPlayerId,
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  function clearAllTimers() {
    if (roleVoteTimer) { clearInterval(roleVoteTimer); roleVoteTimer = null; }
    if (submissionTimer) { clearInterval(submissionTimer); submissionTimer = null; }
    if (votingTimer) { clearInterval(votingTimer); votingTimer = null; }
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

  // ── Reactive checks ──────────────────────────────────────────────────
  $: roleVoteValid =
    selectedPatient &&
    selectedDoctor &&
    selectedNurse &&
    selectedPatient !== selectedDoctor &&
    selectedPatient !== selectedNurse &&
    selectedDoctor !== selectedNurse;

  $: requiresBodyPart = bodyParts.length > 0;
  $: requiresAction = actions.length > 0;
  $: canSubmitEntry =
    Boolean(submissionText.trim()) &&
    (!requiresBodyPart || Boolean(selectedBodyPart)) &&
    (!requiresAction || Boolean(selectedAction));

  // ── Lifecycle ────────────────────────────────────────────────────────

  onMount(() => {
    room.onMessage("ms_role_phase", onRolePhase);
    room.onMessage("ms_roles_assigned", onRolesAssigned);
    room.onMessage("ms_submission_phase", onSubmissionPhase);
    room.onMessage("ms_submit_ack", onSubmitAck);
    room.onMessage("ms_voting_phase", onVotingPhase);
    room.onMessage("ms_vote_ack", onVoteAck);
    room.onMessage("ms_phase_result", onPhaseResult);
    room.onMessage("ms_round_recap", onRoundRecap);
    room.onMessage("round_skipped", onRoundSkipped);
  });

  onDestroy(() => {
    clearAllTimers();
  });
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-4 p-4" data-testid="medical-story">
  {#if roundSkipped}
    <!-- ── Round skipped ────────────────────────────────────────── -->
    <div class="text-center space-y-3">
      <h2 class="text-xl font-black text-yellow-400">Round Skipped</h2>
      <p class="text-gray-300">{skipReason}</p>
    </div>

  {:else if subPhase === "waiting"}
    <!-- ── Waiting ──────────────────────────────────────────────── -->
    <div class="text-center space-y-2">
      <p class="text-4xl">🚑</p>
      <p class="text-gray-400">A patient is arriving...</p>
    </div>

  {:else if subPhase === "role_voting"}
    <!-- ── Role voting ──────────────────────────────────────────── -->
    <div class="w-full max-w-sm space-y-4">
      <div class="text-center">
        <h2 class="text-xl font-black text-blue-400">Assign Roles</h2>
        <p class="text-sm text-gray-400 mt-1">
          {Math.ceil(roleVoteTimeLeft)}s remaining
        </p>
      </div>

      {#if roleVoteSubmitted}
        <div class="bg-green-900/50 border border-green-600 rounded-xl p-4 text-center">
          <p class="text-green-200 font-bold">Vote submitted!</p>
          <p class="text-green-400 text-sm">Waiting for others...</p>
        </div>
      {:else}
        {#each [
          { role: "patient", emoji: "🤒", label: "Patient", bind: "selectedPatient" },
          { role: "doctor", emoji: "👨‍⚕️", label: "Doctor", bind: "selectedDoctor" },
          { role: "nurse", emoji: "👩‍⚕️", label: "Nurse", bind: "selectedNurse" },
        ] as roleOption}
          <div class="space-y-1">
            <p class="text-xs text-gray-400 uppercase tracking-widest">
              {roleOption.emoji} {roleOption.label}
            </p>
            <div class="flex flex-wrap gap-2">
              {#each playerList as player}
                <button
                  class="px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors
                    {(roleOption.bind === 'selectedPatient' ? selectedPatient : roleOption.bind === 'selectedDoctor' ? selectedDoctor : selectedNurse) === player.id
                      ? 'border-blue-500 bg-blue-900 text-white'
                      : 'border-gray-700 bg-gray-800 text-gray-300 active:border-blue-500'}"
                  on:click={() => {
                    if (roleOption.bind === 'selectedPatient') selectedPatient = player.id;
                    else if (roleOption.bind === 'selectedDoctor') selectedDoctor = player.id;
                    else selectedNurse = player.id;
                  }}
                >
                  {player.name}
                </button>
              {/each}
            </div>
          </div>
        {/each}

        <button
          class="w-full py-3 rounded-xl font-bold transition-all
            {roleVoteValid
              ? 'bg-blue-600 text-white active:bg-blue-500 active:scale-95'
              : 'bg-gray-800 text-gray-600 cursor-not-allowed'}"
          disabled={!roleVoteValid}
          on:click={submitRoleVote}
        >
          Submit Vote
        </button>
      {/if}
    </div>

  {:else if subPhase === "roles_assigned"}
    <!-- ── Roles assigned ───────────────────────────────────────── -->
    <div class="w-full max-w-sm space-y-4 text-center">
      <h2 class="text-xl font-black text-emerald-400">Roles Assigned!</h2>
      <div class="bg-gray-800 rounded-xl p-4 space-y-2">
        {#each Object.entries(roles) as [playerId, role]}
          <div class="flex items-center justify-between">
            <span class="text-sm text-gray-300">{getPlayerName(playerId)}</span>
            <span class="text-sm font-bold {role === 'patient' ? 'text-red-400' : role === 'doctor' ? 'text-blue-400' : role === 'nurse' ? 'text-pink-400' : 'text-gray-500'}">
              {getRoleEmoji(role)} {role}
            </span>
          </div>
        {/each}
      </div>
      <p class="text-lg">You are the {getRoleEmoji(myRole)} <span class="font-bold capitalize">{myRole}</span>!</p>
    </div>

  {:else if subPhase === "submission"}
    <!-- ── Submission phase ─────────────────────────────────────── -->
    <div class="w-full max-w-sm space-y-4">
      <div class="text-center">
        <p class="text-3xl">{phaseIcons[currentPhase]}</p>
        <h2 class="text-lg font-black text-amber-400">{phaseLabels[currentPhase]}</h2>
        <p class="text-sm text-gray-400 mt-1">
          {Math.ceil(submissionTimeLeft)}s remaining
        </p>
      </div>

      {#if submitted}
        <div class="bg-green-900/50 border border-green-600 rounded-xl p-4 text-center">
          <p class="text-green-200 font-bold">Submitted! ✅</p>
          <p class="text-green-400 text-sm">Waiting for others...</p>
        </div>
      {:else}
        <!-- Prompt -->
        <div class="bg-gray-800 rounded-xl p-3 text-center">
          <p class="text-sm text-gray-200">{phasePrompts[currentPhase]}</p>
        </div>

        <!-- Text input -->
        <div class="space-y-2">
          {#if currentPhase === "catchphrase"}
            <div class="flex items-center gap-2 text-sm text-gray-300">
              <span>"Well that's why they call me the</span>
            </div>
          {/if}
          <input
            type="text"
            maxlength="60"
            placeholder={currentPhase === "catchphrase" ? "best / greatest / most feared..." : "Type your answer..."}
            bind:value={submissionText}
            class="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-600 text-white placeholder-gray-500 focus:border-amber-500 focus:outline-none"
          />
          {#if currentPhase === "catchphrase"}
            <div class="text-sm text-gray-300 text-right">
              <span>doctor in the country"</span>
            </div>
          {/if}
          <p class="text-xs text-gray-500 text-right">{submissionText.length}/60</p>
        </div>

        <!-- Body part selector (complaint/diagnosis) -->
        {#if bodyParts.length > 0}
          <div class="space-y-2">
            <p class="text-xs text-gray-400 uppercase tracking-widest">Select body part *</p>
            <MedicalStoryBodyModel
              allowedParts={bodyParts}
              bind:selectedPart={selectedBodyPart}
              interactive={true}
              title="3D Body Selector"
              subtitle={scene3dPlaceholder?.description ?? "Tap the body model to mark where the complaint is happening."}
              compact={true}
            />
            <div class="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              {#each bodyParts as part}
                <button
                  class="px-2 py-1 rounded text-xs font-medium border transition-colors
                    {selectedBodyPart === part
                      ? 'border-amber-500 bg-amber-900/60 text-amber-200'
                      : 'border-gray-700 bg-gray-800 text-gray-400 active:border-amber-500'}"
                  on:click={() => selectedBodyPart = part}
                >
                  {part}
                </button>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Action selector (procedure) -->
        {#if actions.length > 0}
          <div class="space-y-2">
            <p class="text-xs text-gray-400 uppercase tracking-widest">Select action *</p>
            <div class="grid grid-cols-3 gap-2">
              {#each actions as actionItem}
                <button
                  class="px-2 py-3 rounded-xl text-sm font-bold border transition-colors
                    {selectedAction === actionItem
                      ? 'border-amber-500 bg-amber-900/60 text-amber-200'
                      : 'border-gray-700 bg-gray-800 text-gray-400 active:border-amber-500'}"
                  on:click={() => selectedAction = actionItem}
                >
                  {actionItem}
                </button>
              {/each}
            </div>
          </div>
        {/if}

        {#if submitError}
          <p class="text-red-400 text-sm text-center">{submitError}</p>
        {/if}

        <button
          class="w-full py-3 rounded-xl font-bold transition-all
            {canSubmitEntry
              ? 'bg-amber-600 text-white active:bg-amber-500 active:scale-95'
              : 'bg-gray-800 text-gray-600 cursor-not-allowed'}"
          disabled={!canSubmitEntry}
          on:click={submitEntry}
        >
          Submit
        </button>
        {#if requiresBodyPart && !selectedBodyPart}
          <p class="text-xs text-amber-300 text-center">Pick a body part to finish your answer.</p>
        {:else if requiresAction && !selectedAction}
          <p class="text-xs text-amber-300 text-center">Pick an action to finish your answer.</p>
        {/if}
      {/if}
    </div>

  {:else if subPhase === "voting"}
    <!-- ── Voting phase ─────────────────────────────────────────── -->
    <div class="w-full max-w-sm space-y-4">
      <div class="text-center">
        <p class="text-3xl">{phaseIcons[currentPhase]}</p>
        <h2 class="text-lg font-black text-indigo-400">Vote: {phaseLabels[currentPhase]}</h2>
        <p class="text-sm text-gray-400 mt-1">
          {Math.ceil(votingTimeLeft)}s remaining
        </p>
      </div>

      {#if voteSubmitted}
        <div class="bg-green-900/50 border border-green-600 rounded-xl p-4 text-center">
          <p class="text-green-200 font-bold">Vote cast! ✅</p>
        </div>
      {:else if votingSubmissions.length === 0}
        <p class="text-gray-400 text-center">No other submissions to vote on.</p>
      {:else}
        <!-- TODO: Replace with 3D scene for voting (Three.js) -->
        <div class="space-y-3">
          {#each votingSubmissions as sub}
            <button
              class="w-full text-left px-4 py-3 rounded-xl border transition-colors
                {votedFor === sub.playerId
                  ? 'border-indigo-500 bg-indigo-900 text-white'
                  : 'border-gray-700 bg-gray-800 text-gray-300 active:border-indigo-500'}"
              on:click={() => castVote(sub.playerId)}
              disabled={voteSubmitted}
            >
              <p class="font-semibold text-sm">"{sub.text}"</p>
              {#if sub.bodyPart}
                <p class="text-xs text-gray-400 mt-1">📍 {sub.bodyPart}</p>
              {/if}
              {#if sub.action}
                <p class="text-xs text-gray-400 mt-1">⚡ {sub.action}</p>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>

  {:else if subPhase === "phase_result"}
    <!-- ── Phase result ─────────────────────────────────────────── -->
    <div class="w-full max-w-sm space-y-4 text-center">
      <p class="text-3xl">{phaseIcons[currentPhase]}</p>
      <h2 class="text-lg font-black text-emerald-400">{phaseLabels[currentPhase]} Winner!</h2>

      {#if phaseWinner}
        <div class="bg-gradient-to-br from-amber-900/50 to-yellow-900/50 border border-amber-500 rounded-xl p-6 space-y-2">
          {#if phaseWinner.bodyPart}
            <MedicalStoryBodyModel
              allowedParts={bodyParts}
              selectedPart={phaseWinner.bodyPart}
              title="Winning Body Part"
              subtitle={`Chosen by ${getPlayerName(phaseWinner.playerId)}`}
              compact={true}
            />
          {/if}
          <p class="text-xs text-amber-400 uppercase tracking-widest">Winner</p>
          <p class="text-lg font-bold text-white">"{phaseWinner.text}"</p>
          {#if phaseWinner.bodyPart}
            <p class="text-sm text-amber-200">📍 {phaseWinner.bodyPart}</p>
          {/if}
          {#if phaseWinner.action}
            <p class="text-sm text-amber-200">⚡ {phaseWinner.action}</p>
          {/if}
          <p class="text-sm text-gray-300">by {getPlayerName(phaseWinner.playerId)}</p>
          <p class="text-amber-300 font-bold">{phaseWinner.voteCount} vote{phaseWinner.voteCount !== 1 ? 's' : ''}</p>
        </div>
      {:else}
        <p class="text-gray-400">No winner this round.</p>
      {/if}

      <!-- All results -->
      <div class="space-y-2">
        {#each phaseResults as result, i}
          <div class="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-800 text-sm">
            <div class="flex-1 text-left">
              <span class="text-gray-300">"{result.text}"</span>
              <span class="text-gray-500 ml-1">— {getPlayerName(result.playerId)}</span>
            </div>
            <span class="text-gray-400 ml-2">{result.voteCount}🗳️</span>
          </div>
        {/each}
      </div>

      <!-- My points -->
      {#if me && phasePoints[me.id]}
        <p class="text-2xl font-black text-green-400">+{phasePoints[me.id]} pts</p>
      {/if}
    </div>

  {:else if subPhase === "round_recap"}
    <!-- ── Round recap ──────────────────────────────────────────── -->
    <div class="w-full max-w-sm space-y-4 text-center">
      <h2 class="text-xl font-black text-fuchsia-400">Round Recap</h2>

      <div class="space-y-3">
        {#each ["complaint", "diagnosis", "procedure", "catchphrase"] as phase}
          <div class="bg-gray-800 rounded-xl p-3 text-left">
            <p class="text-xs text-gray-400 uppercase tracking-widest mb-1">
              {phaseIcons[phase]} {phaseLabels[phase]}
            </p>
            {#if phaseWinners[phase]}
              <p class="text-sm text-white font-medium">"{phaseWinners[phase]?.text}"</p>
              <p class="text-xs text-gray-400">by {getPlayerName(phaseWinners[phase]?.playerId ?? '')}</p>
            {:else}
              <p class="text-sm text-gray-500">No winner</p>
            {/if}
          </div>
        {/each}
      </div>

      <!-- My total points this round -->
      {#if me && roundScores[me.id]}
        <div class="bg-gradient-to-r from-emerald-900 to-green-900 border border-emerald-500 rounded-xl p-4">
          <p class="text-xs text-emerald-400 uppercase tracking-widest">Your Round Score</p>
          <p class="text-3xl font-black text-emerald-300">+{roundScores[me.id]}</p>
        </div>
      {/if}
    </div>
  {/if}
</div>
