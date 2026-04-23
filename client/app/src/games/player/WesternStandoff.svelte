<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { Room } from "colyseus.js";
  import type { PlayerState, RoomState } from "../../../../shared/types";
  import { isMotionPermissionGrantedThisSession } from "../../lib/permissions";
  import RevolverModel from "../../components/RevolverModel.svelte";

  export let room: Room;
  export let state: RoomState;
  export let me: PlayerState | undefined;

  type SubPhase =
    | "waiting"
    | "preview"
    | "calibrating"
    | "countdown"
    | "draw"
    | "resolved"
    | "eliminated"
    | "champion";

  interface OrientationSnapshot {
    alpha: number;
    beta: number;
    gamma: number;
  }

  let subPhase: SubPhase = "waiting";
  let matchId = "";
  let bracketRound = 0;
  let isPractice = false;
  let isInMatch = false;
  let opponentId = "";
  let opponentName = "";
  let previewEndsAt = 0;
  let calibrationReady = false;
  let readyCount = 0;
  let totalReady = 2;
  let countdownValue = 0;
  let drawEndsAt = 0;
  let timeRemaining = 0;
  let reactionMs = 0;
  let resultText = "";
  let resultReason = "";
  let invalidMessage = "";
  let championName = "";
  let runnerUpName = "";
  let permissionProblem = "";
  let latestOrientation: OrientationSnapshot = { alpha: 0, beta: 0, gamma: 0 };
  let orientationSeen = false;
  let drawReady = false;
  let motionListenerAttached = false;
  let countdownInterval: ReturnType<typeof setInterval> | null = null;
  let timerInterval: ReturnType<typeof setInterval> | null = null;
  let previewTimer: ReturnType<typeof setInterval> | null = null;
  let drawAudio: HTMLAudioElement | null = null;

  const DRAW_TURN_THRESHOLD_DEG = 120;
  const DRAW_GAMMA_TARGET = 90;
  const DRAW_GAMMA_TOLERANCE = 30;
  const DRAW_BETA_MAX = 70;
  let calibrationBaseline: OrientationSnapshot | null = null;

  $: myId = me?.id ?? "";

  function normalizeDegrees(angle: number): number {
    const normalized = angle % 360;
    return normalized < 0 ? normalized + 360 : normalized;
  }

  function shortestAngleDelta(a: number, b: number): number {
    const diff = Math.abs(normalizeDegrees(a) - normalizeDegrees(b));
    return diff > 180 ? 360 - diff : diff;
  }

  function computeDrawReady(): boolean {
    if (!calibrationBaseline || !orientationSeen) return false;
    const turned = shortestAngleDelta(calibrationBaseline.alpha, latestOrientation.alpha) >= DRAW_TURN_THRESHOLD_DEG;
    const gammaDistance = Math.abs(Math.abs(latestOrientation.gamma) - DRAW_GAMMA_TARGET);
    const aimed = gammaDistance <= DRAW_GAMMA_TOLERANCE && Math.abs(latestOrientation.beta) <= DRAW_BETA_MAX;
    return turned && aimed;
  }

  $: drawReady = computeDrawReady();

  function clearCountdown() {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  }

  function clearTimers() {
    clearCountdown();
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    if (previewTimer) {
      clearInterval(previewTimer);
      previewTimer = null;
    }
  }

  function stopAudio() {
    if (drawAudio) {
      drawAudio.pause();
      drawAudio.currentTime = 0;
    }
  }

  function startPreviewTimer(durationMs: number) {
    if (previewTimer) clearInterval(previewTimer);
    previewEndsAt = Date.now() + durationMs;
    previewTimer = setInterval(() => {
      const remaining = Math.max(0, previewEndsAt - Date.now());
      timeRemaining = remaining / 1000;
      if (remaining <= 0 && previewTimer) {
        clearInterval(previewTimer);
        previewTimer = null;
      }
    }, 100);
  }

  function startDrawTimer(durationMs: number) {
    if (timerInterval) clearInterval(timerInterval);
    drawEndsAt = Date.now() + durationMs;
    timerInterval = setInterval(() => {
      const remaining = Math.max(0, drawEndsAt - Date.now());
      timeRemaining = remaining / 1000;
      if (remaining <= 0 && timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
    }, 50);
  }

  function maybePlay(audio: HTMLAudioElement | null, reset = false) {
    if (!audio) return;
    if (reset) audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  function attachMotionListener() {
    if (motionListenerAttached) return;
    if (me?.motionPermission !== "granted") {
      permissionProblem = "Motion permission was not enabled in the lobby.";
      return;
    }
    if (!isMotionPermissionGrantedThisSession()) {
      permissionProblem = "Motion permission expired. Return to the lobby and re-enable it.";
      return;
    }

    window.addEventListener("deviceorientation", onDeviceOrientation);
    motionListenerAttached = true;
    permissionProblem = "";
  }

  function detachMotionListener() {
    if (!motionListenerAttached) return;
    window.removeEventListener("deviceorientation", onDeviceOrientation);
    motionListenerAttached = false;
  }

  function onDeviceOrientation(event: DeviceOrientationEvent) {
    latestOrientation = {
      alpha: event.alpha ?? 0,
      beta: event.beta ?? 0,
      gamma: event.gamma ?? 0,
    };
    orientationSeen = true;
  }

  function handlePreview(data: {
    matchId: string;
    player1Id: string;
    player1Name: string;
    player2Id: string;
    player2Name: string;
    bracketRound: number;
    previewMs: number;
    isPractice: boolean;
  }) {
    matchId = data.matchId;
    bracketRound = data.bracketRound;
    isPractice = data.isPractice;
    invalidMessage = "";
    calibrationReady = false;
    calibrationBaseline = null;
    readyCount = 0;
    reactionMs = 0;
    resultReason = "";
    resultText = "";
    championName = "";
    runnerUpName = "";
    stopAudio();

    if (myId === data.player1Id) {
      isInMatch = true;
      opponentId = data.player2Id;
      opponentName = data.player2Name;
    } else if (myId === data.player2Id) {
      isInMatch = true;
      opponentId = data.player1Id;
      opponentName = data.player1Name;
    } else {
      isInMatch = false;
      opponentId = "";
      opponentName = "";
    }

    subPhase = "preview";
    startPreviewTimer(data.previewMs);
  }

  function handleCalibrateStart() {
    clearTimers();
    readyCount = 0;
    totalReady = 2;
    subPhase = "calibrating";
    if (isInMatch) attachMotionListener();
  }

  function handleReady(data: { readyCount: number; totalCount: number }) {
    readyCount = data.readyCount;
    totalReady = data.totalCount;
  }

  function handleCalibrationSaved(_data: { readyCount: number; totalCount: number }) {
    calibrationReady = true;
  }

  function handleCountdown(data: { seconds: number }) {
    clearCountdown();
    clearTimers();
    countdownValue = data.seconds;
    subPhase = "countdown";
    countdownInterval = setInterval(() => {
      countdownValue = Math.max(0, countdownValue - 1);
      if (countdownValue <= 0) clearCountdown();
    }, 1000);
  }

  function handleDraw(data: { timeoutMs: number }) {
    invalidMessage = "";
    subPhase = "draw";
    startDrawTimer(data.timeoutMs);
    if (isInMatch) {
      maybePlay(drawAudio, true);
    }
  }

  function handleInvalidShot(data: { message: string }) {
    invalidMessage = data.message;
  }

  function handleResult(data: {
    winnerId: string;
    loserId: string;
    reactionMs: number;
    reason: string;
    isPractice: boolean;
  }) {
    clearTimers();
    stopAudio();
    reactionMs = data.reactionMs;
    resultReason = data.reason;

    if (data.winnerId === myId) {
      resultText = data.isPractice ? "Practice duel win!" : "You won the duel!";
      subPhase = "resolved";
    } else if (data.loserId === myId) {
      resultText = data.reason === "disconnect" ? "You disconnected." : "You lost the draw.";
      subPhase = "eliminated";
    } else {
      resultText = "Duel resolved.";
      subPhase = "resolved";
    }
  }

  function handleAdvance() {
    invalidMessage = "";
    resultText = "";
    stopAudio();
    if (me?.isEliminated) {
      subPhase = "eliminated";
    } else {
      subPhase = "waiting";
    }
  }

  function handleTournamentComplete(data: {
    championId: string;
    championName: string;
    runnerUpName: string;
  }) {
    stopAudio();
    championName = data.championName;
    runnerUpName = data.runnerUpName;
    subPhase = data.championId === myId ? "champion" : me?.isEliminated ? "eliminated" : "resolved";
  }

  function calibrateNow() {
    if (!isInMatch) return;
    if (!orientationSeen) {
      invalidMessage = "Move your phone a little so orientation data appears first.";
      return;
    }

    calibrationBaseline = { ...latestOrientation };
    room.send("game_input", {
      action: "standoff_calibrate_done",
      ...latestOrientation,
    });
    invalidMessage = "";
  }

  function shoot() {
    if (!isInMatch) return;
    room.send("game_input", {
      action: "standoff_shoot",
      ...latestOrientation,
    });
  }

  onMount(() => {
    drawAudio = new Audio("/whip_crack.wav");
    drawAudio.preload = "auto";

    room.onMessage("standoff_match_preview", handlePreview);
    room.onMessage("standoff_calibrate_start", handleCalibrateStart);
    room.onMessage("standoff_ready", handleReady);
    room.onMessage("standoff_calibration_saved", handleCalibrationSaved);
    room.onMessage("standoff_paces_countdown", handleCountdown);
    room.onMessage("standoff_draw", handleDraw);
    room.onMessage("standoff_invalid_shot", handleInvalidShot);
    room.onMessage("standoff_match_result", handleResult);
    room.onMessage("standoff_bracket_round_advance", handleAdvance);
    room.onMessage("standoff_tournament_complete", handleTournamentComplete);
  });

  onDestroy(() => {
    clearTimers();
    detachMotionListener();
    stopAudio();
    drawAudio = null;
  });
</script>

<div class="flex flex-1 flex-col bg-gradient-to-b from-stone-950 via-orange-950 to-zinc-950 p-4 text-white" data-testid="western-standoff-player">
  <div class="mb-4 flex items-center justify-between rounded-2xl border border-amber-700/40 bg-black/30 px-4 py-3">
    <div>
      <p class="text-xs uppercase tracking-[0.3em] text-amber-300">Western Standoff</p>
      <p class="text-sm text-amber-100">{isPractice ? "Practice Duel" : bracketRound > 0 ? `Bracket Round ${bracketRound}` : "Tournament"}</p>
      <p class="text-xs text-amber-100/60">{state.players.size} players in the bracket</p>
    </div>
    <div class="text-right">
      <p class="text-xs uppercase tracking-widest text-amber-300">Score</p>
      <p class="text-2xl font-black text-white">{me?.score ?? 0}</p>
    </div>
  </div>

  <div class="mb-4">
    <RevolverModel compact={subPhase !== "draw"} />
  </div>

  {#if subPhase === "waiting"}
    <div class="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <h2 class="text-3xl font-black text-amber-300">Holster Up</h2>
      <p class="max-w-sm text-amber-100/80">Wait for your duel to be called. Watch the TV for the bracket.</p>
    </div>

  {:else if subPhase === "preview"}
    <div class="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      {#if isInMatch}
        <p class="text-xs uppercase tracking-[0.3em] text-amber-300">You're Up Next</p>
        <h2 class="text-4xl font-black text-white">{me?.name ?? "You"} vs {opponentName}</h2>
        <p class="text-lg text-amber-100">Stand back-to-back and get ready to calibrate.</p>
      {:else}
        <h2 class="text-3xl font-black text-amber-300">Spectating Duel</h2>
        <p class="text-amber-100/80">{timeRemaining.toFixed(1)}s until the showdown starts.</p>
      {/if}
    </div>

  {:else if subPhase === "calibrating"}
    <div class="flex flex-1 flex-col gap-4 text-center">
      <h2 class="text-3xl font-black text-amber-300">Calibrate</h2>
      {#if isInMatch}
        <p class="text-amber-100">Stand facing away from {opponentName}, then lock your current orientation.</p>
        <div class="rounded-2xl border border-amber-600/30 bg-black/30 p-4 text-left text-sm text-amber-100/90">
          <p>α {latestOrientation.alpha.toFixed(1)}°</p>
          <p>β {latestOrientation.beta.toFixed(1)}°</p>
          <p>γ {latestOrientation.gamma.toFixed(1)}°</p>
        </div>
        <button
          class="rounded-2xl bg-amber-500 px-5 py-4 text-lg font-black text-stone-950 shadow-lg transition active:scale-95 disabled:cursor-not-allowed disabled:bg-amber-800/70 disabled:text-amber-200"
          on:click={calibrateNow}
          disabled={!orientationSeen || calibrationReady}
        >
          {calibrationReady ? "Calibration locked" : "Lock facing direction"}
        </button>
        <p class="text-sm text-amber-100/70">Ready cowboys: {readyCount}/{totalReady}</p>
      {:else}
        <p class="text-amber-100/80">The duelists are calibrating their draw pose.</p>
      {/if}
    </div>

  {:else if subPhase === "countdown"}
    <div class="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <p class="text-xs uppercase tracking-[0.3em] text-amber-300">Take your paces</p>
      <p class="text-8xl font-black text-white">{countdownValue > 0 ? countdownValue : "DRAW"}</p>
      <p class="text-amber-100/80">Three steps. Then turn and fire.</p>
    </div>

  {:else if subPhase === "draw"}
    <div class="flex flex-1 flex-col gap-4 text-center">
      <p class="text-xs uppercase tracking-[0.3em] text-red-300">Draw!</p>
      <p class="text-6xl font-black {timeRemaining < 2 ? 'text-red-400' : 'text-white'}">{Math.ceil(timeRemaining)}</p>

      {#if isInMatch}
        <div class="rounded-3xl border px-4 py-3 {drawReady ? 'border-green-400 bg-green-500/15' : 'border-amber-600/40 bg-black/30'}">
          <p class="text-sm uppercase tracking-widest {drawReady ? 'text-green-300' : 'text-amber-300'}">Aim status</p>
          <p class="mt-2 text-xl font-black">{drawReady ? "Ready to fire" : "Turn around and hold sideways"}</p>
          <p class="mt-2 text-sm text-amber-100/70">β {latestOrientation.beta.toFixed(1)}° • γ {latestOrientation.gamma.toFixed(1)}°</p>
        </div>

        <button
          class="mt-2 rounded-[2rem] border-4 border-amber-200 bg-gradient-to-b from-amber-400 to-orange-600 px-8 py-8 text-3xl font-black text-stone-950 shadow-2xl transition active:scale-95"
          on:click={shoot}
        >
          FIRE
        </button>
      {:else}
        <p class="text-amber-100/80">Watch the duel on the TV.</p>
      {/if}
    </div>

  {:else if subPhase === "resolved"}
    <div class="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <h2 class="text-4xl font-black text-green-300">{resultText || "Duel Complete"}</h2>
      {#if reactionMs > 0}
        <p class="text-xl text-amber-100">Reaction: {(reactionMs / 1000).toFixed(2)}s</p>
      {/if}
      <p class="text-sm uppercase tracking-widest text-amber-300">{resultReason}</p>
      {#if championName}
        <p class="text-lg text-amber-100">Champion: {championName}</p>
      {/if}
    </div>

  {:else if subPhase === "eliminated"}
    <div class="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <h2 class="text-4xl font-black text-red-300">Out of the Bracket</h2>
      <p class="max-w-sm text-amber-100/80">{resultText || "Your duel is over. Watch the rest of the tournament on the TV."}</p>
      {#if championName}
        <p class="text-lg text-amber-100">Champion: {championName}</p>
      {/if}
      {#if runnerUpName}
        <p class="text-sm text-amber-100/60">Runner-up: {runnerUpName}</p>
      {/if}
    </div>

  {:else if subPhase === "champion"}
    <div class="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <p class="text-xs uppercase tracking-[0.4em] text-yellow-300">Champion</p>
      <h2 class="text-5xl font-black text-yellow-200">{championName}</h2>
      <p class="text-2xl text-amber-100">Fastest draw in the territory.</p>
      {#if runnerUpName}
        <p class="text-sm text-amber-100/70">Final duel versus {runnerUpName}</p>
      {/if}
    </div>
  {/if}

  {#if permissionProblem}
    <div class="mt-4 rounded-2xl border border-red-400/40 bg-red-500/15 px-4 py-3 text-sm text-red-100">{permissionProblem}</div>
  {/if}

  {#if invalidMessage}
    <div class="mt-4 rounded-2xl border border-amber-400/40 bg-amber-500/15 px-4 py-3 text-sm text-amber-100">{invalidMessage}</div>
  {/if}
</div>
