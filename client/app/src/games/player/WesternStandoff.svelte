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
    | "intro"
    | "waiting"
    | "preview"
    | "calibrating"
    | "countdown"
    | "draw"
    | "between_duels"
    | "resolved"
    | "eliminated"
    | "champion"
    | "tournament_over"
    | "skipped";

  interface OrientationSnapshot {
    alpha: number;
    beta: number;
    gamma: number;
  }

  interface Unsubscribe {
    (): void;
  }

  const DRAW_TURN_THRESHOLD_DEG = 120;
  const DRAW_GAMMA_TARGET = 90;
  const DRAW_GAMMA_TOLERANCE = 30;
  const DRAW_BETA_MAX = 70;

  let subPhase: SubPhase = "intro";
  let matchId = "";
  let bracketRound = 0;
  let totalPlayers = 0;
  let totalBracketRounds = 0;
  let isPractice = false;
  let isInMatch = false;
  let opponentName = "";
  let calibrationReady = false;
  let readyCount = 0;
  let totalReady = 2;
  let countdownValue = 0;
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
  let turnedAround = false;
  let sidewaysAimReady = false;
  let drawReady = false;
  let eliminatedLocally = false;
  let runnerUpId = "";
  let showCalibrationDebug = false;
  let motionListenerAttached = false;
  let countdownInterval: ReturnType<typeof setInterval> | null = null;
  let timerInterval: ReturnType<typeof setInterval> | null = null;
  let previewTimer: ReturnType<typeof setInterval> | null = null;
  let drawAudio: HTMLAudioElement | null = null;
  let calibrationBaseline: OrientationSnapshot | null = null;
  let unsubs: Unsubscribe[] = [];

  $: myId = me?.id ?? "";
  $: playerCount = state.players.size;
  $: turnedAround = !!calibrationBaseline && orientationSeen && hasTurnedAround(calibrationBaseline, latestOrientation);
  $: sidewaysAimReady = orientationSeen && isLandscapeDrawPose(latestOrientation);
  $: drawReady = !!calibrationBaseline && turnedAround && sidewaysAimReady;

  function normalizeDegrees(angle: number): number {
    const normalized = angle % 360;
    return normalized < 0 ? normalized + 360 : normalized;
  }

  function shortestAngleDelta(a: number, b: number): number {
    const diff = Math.abs(normalizeDegrees(a) - normalizeDegrees(b));
    return diff > 180 ? 360 - diff : diff;
  }

  function hasTurnedAround(baseline: OrientationSnapshot, current: OrientationSnapshot): boolean {
    return shortestAngleDelta(baseline.alpha, current.alpha) >= DRAW_TURN_THRESHOLD_DEG;
  }

  function isLandscapeDrawPose(orientation: OrientationSnapshot): boolean {
    const gammaDistance = Math.abs(Math.abs(orientation.gamma) - DRAW_GAMMA_TARGET);
    return gammaDistance <= DRAW_GAMMA_TOLERANCE && Math.abs(orientation.beta) <= DRAW_BETA_MAX;
  }

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

  function resetDuelState() {
    calibrationReady = false;
    calibrationBaseline = null;
    readyCount = 0;
    totalReady = 2;
    reactionMs = 0;
    resultReason = "";
    resultText = "";
    invalidMessage = "";
    permissionProblem = "";
    orientationSeen = false;
    turnedAround = false;
    sidewaysAimReady = false;
    drawReady = false;
    detachMotionListener();
    stopAudio();
  }

  function startPreviewTimer(durationMs: number) {
    if (previewTimer) clearInterval(previewTimer);
    const endsAt = Date.now() + durationMs;
    timeRemaining = durationMs / 1000;
    previewTimer = setInterval(() => {
      const remaining = Math.max(0, endsAt - Date.now());
      timeRemaining = remaining / 1000;
      if (remaining <= 0) {
        clearInterval(previewTimer!);
        previewTimer = null;
      }
    }, 100);
  }

  function startDrawTimer(durationMs: number) {
    if (timerInterval) clearInterval(timerInterval);
    const endsAt = Date.now() + durationMs;
    timeRemaining = durationMs / 1000;
    timerInterval = setInterval(() => {
      const remaining = Math.max(0, endsAt - Date.now());
      timeRemaining = remaining / 1000;
      if (remaining <= 0) {
        clearInterval(timerInterval!);
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
    if (motionListenerAttached || !isInMatch) return;

    if (me?.motionPermission !== "granted") {
      permissionProblem = "Motion permission is required. Re-enable it from the lobby on this phone.";
      return;
    }

    if (!isMotionPermissionGrantedThisSession()) {
      permissionProblem = "Motion permission expired for this browser session. Return to the lobby and re-enable it.";
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

    if (permissionProblem.includes("Move your phone")) {
      permissionProblem = "";
    }
  }

  function setWaitingState(message = "") {
    subPhase = "waiting";
    isInMatch = false;
    resultText = message;
    clearTimers();
  }

  function handleBracketInit(data: { totalPlayers: number; totalRounds: number }) {
    resetDuelState();
    totalPlayers = data.totalPlayers;
    totalBracketRounds = data.totalRounds;
    bracketRound = 0;
    championName = "";
    runnerUpId = "";
    runnerUpName = "";
    eliminatedLocally = false;
    setWaitingState("");
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
    clearTimers();
    resetDuelState();
    matchId = data.matchId;
    bracketRound = data.bracketRound;
    isPractice = data.isPractice;
    championName = "";
    runnerUpId = "";
    runnerUpName = "";

    if (myId === data.player1Id) {
      isInMatch = true;
      opponentName = data.player2Name;
    } else if (myId === data.player2Id) {
      isInMatch = true;
      opponentName = data.player1Name;
    } else {
      isInMatch = false;
      opponentName = `${data.player1Name} vs ${data.player2Name}`;
    }

    subPhase = "preview";
    startPreviewTimer(data.previewMs);
  }

  function handleCalibrateStart(_data: { timeoutMs: number; totalCount: number }) {
    clearTimers();
    readyCount = 0;
    totalReady = 2;
    invalidMessage = "";
    subPhase = "calibrating";

    if (isInMatch) {
      attachMotionListener();
      if (!orientationSeen && !permissionProblem) {
        permissionProblem = "Move your phone slightly so the sensor wakes up, then lock your direction.";
      }
    }
  }

  function handleReady(data: { readyCount: number; totalCount: number }) {
    readyCount = data.readyCount;
    totalReady = data.totalCount;
  }

  function handleCalibrationSaved(_data: { readyCount: number; totalCount: number }) {
    calibrationReady = true;
    invalidMessage = "";
    permissionProblem = "Direction locked. Keep your phone pointed away until the draw.";
  }

  function handleCountdown(data: { seconds: number }) {
    clearTimers();
    countdownValue = data.seconds;
    subPhase = "countdown";
    countdownInterval = setInterval(() => {
      countdownValue = Math.max(0, countdownValue - 1);
      if (countdownValue <= 0) {
        clearCountdown();
      }
    }, 1000);
  }

  function handleDraw(data: { timeoutMs: number }) {
    clearTimers();
    invalidMessage = "";
    permissionProblem = isInMatch
      ? "Turn, aim sideways, and tap FIRE the moment your aim indicator turns ready."
      : "Spectating live duel.";
    subPhase = "draw";
    startDrawTimer(data.timeoutMs);
    if (isInMatch) maybePlay(drawAudio, true);
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
    winnerName?: string;
    loserName?: string;
  }) {
    clearTimers();
    stopAudio();
    detachMotionListener();
    isInMatch = false;
    reactionMs = data.reactionMs;
    resultReason = data.reason;
    permissionProblem = "";
    invalidMessage = "";

    if (data.winnerId === myId) {
      eliminatedLocally = false;
      resultText = data.isPractice ? "Practice duel win!" : "You won the duel!";
      subPhase = "resolved";
    } else if (data.loserId === myId) {
      if (data.isPractice) {
        if (data.reason === "disconnect") {
          resultText = "Practice duel ended on disconnect.";
        } else if (data.reason === "timeout") {
          resultText = "Practice time expired before a legal shot landed.";
        } else {
          resultText = "Practice duel complete.";
        }
        subPhase = "resolved";
      } else {
        eliminatedLocally = true;
        if (data.reason === "disconnect") {
          resultText = "You were eliminated after disconnecting.";
        } else if (data.reason === "timeout") {
          resultText = "Time ran out before your shot landed.";
        } else {
          resultText = "You lost the draw.";
        }
        subPhase = "eliminated";
      }
    } else {
      resultText = `${data.winnerName ?? "Winner"} defeated ${data.loserName ?? "their rival"}.`;
      subPhase = "between_duels";
    }
  }

  function handleAdvance(data: { newRound: number; remainingPlayers: number }) {
    clearTimers();
    stopAudio();
    detachMotionListener();
    isInMatch = false;
    bracketRound = data.newRound;
    resultText = `Round ${data.newRound} is forming. ${data.remainingPlayers} duelists remain.`;
    invalidMessage = "";
    permissionProblem = "";
    resultReason = "";
    reactionMs = 0;

    if (eliminatedLocally || me?.isEliminated) {
      subPhase = "eliminated";
    } else {
      subPhase = "between_duels";
    }
  }

  function handleRoundSkipped(data: { reason: string }) {
    clearTimers();
    stopAudio();
    detachMotionListener();
    isInMatch = false;
    resultText = data.reason;
    permissionProblem = "";
    invalidMessage = "";
    resultReason = "";
    reactionMs = 0;
    subPhase = "skipped";
  }

  function handleTournamentComplete(data: {
    championId: string;
    championName: string;
    runnerUpId?: string;
    runnerUpName: string;
  }) {
    clearTimers();
    stopAudio();
    detachMotionListener();
    isInMatch = false;
    championName = data.championName;
    runnerUpId = data.runnerUpId ?? "";
    runnerUpName = data.runnerUpName;
    permissionProblem = "";
    invalidMessage = "";
    resultReason = "";
    reactionMs = 0;

    if (data.championId === myId) {
      eliminatedLocally = false;
      resultText = "You won the tournament.";
      subPhase = "champion";
    } else if ((data.runnerUpId ?? "") === myId) {
      resultText = `${data.championName} took the final duel. You finished runner-up.`;
      subPhase = "tournament_over";
    } else if (eliminatedLocally || me?.isEliminated) {
      resultText = `${data.championName} wins the tournament.`;
      subPhase = "eliminated";
    } else {
      resultText = `${data.championName} wins the tournament.`;
      subPhase = "tournament_over";
    }
  }

  function calibrateNow() {
    if (!isInMatch) return;

    if (!orientationSeen) {
      permissionProblem = "Move your phone slightly so the motion sensor starts reporting orientation.";
      return;
    }

    calibrationBaseline = { ...latestOrientation };
    room.send("game_input", {
      action: "standoff_calibrate_done",
      ...latestOrientation,
    });
    invalidMessage = "";
  }

  function retryMotion() {
    attachMotionListener();
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

    try {
      const searchParams = new URLSearchParams(window.location.search);
      showCalibrationDebug = searchParams.get("standoffDebug") === "1" || window.localStorage.getItem("gamma:standoff:debug") === "1";
    } catch {
      showCalibrationDebug = false;
    }

    unsubs = [
      room.onMessage("standoff_bracket_init", handleBracketInit),
      room.onMessage("standoff_match_preview", handlePreview),
      room.onMessage("standoff_calibrate_start", handleCalibrateStart),
      room.onMessage("standoff_ready", handleReady),
      room.onMessage("standoff_calibration_saved", handleCalibrationSaved),
      room.onMessage("standoff_paces_countdown", handleCountdown),
      room.onMessage("standoff_draw", handleDraw),
      room.onMessage("standoff_invalid_shot", handleInvalidShot),
      room.onMessage("standoff_match_result", handleResult),
      room.onMessage("standoff_bracket_round_advance", handleAdvance),
      room.onMessage("standoff_tournament_complete", handleTournamentComplete),
      room.onMessage("round_skipped", handleRoundSkipped),
    ];
  });

  onDestroy(() => {
    clearTimers();
    detachMotionListener();
    stopAudio();
    for (const unsub of unsubs) unsub();
    unsubs = [];
    drawAudio = null;
  });
</script>

<div class="flex flex-1 flex-col bg-gradient-to-b from-stone-950 via-orange-950 to-zinc-950 p-4 text-white" data-testid="western-standoff-player">
  <div class="mb-4 flex items-center justify-between rounded-2xl border border-amber-400/30 bg-black/45 px-4 py-3 shadow-lg">
    <div>
      <p class="text-xs uppercase tracking-[0.3em] text-amber-200">Western Standoff</p>
      <p class="text-sm font-semibold text-white">{isPractice ? "Practice Duel" : bracketRound > 0 ? `Bracket Round ${bracketRound}` : "Tournament"}</p>
      <p class="text-xs text-amber-100">{totalPlayers || playerCount} players • {totalBracketRounds || Math.max(1, state.players.size - 1)} rounds</p>
    </div>
    <div class="text-right">
      <p class="text-xs uppercase tracking-widest text-amber-200">Score</p>
      <p class="text-2xl font-black text-white">{me?.score ?? 0}</p>
    </div>
  </div>

  <div class="mb-4">
    <RevolverModel compact={subPhase !== "draw"} spinning={subPhase !== "draw"} />
  </div>

  {#if subPhase === "intro" || subPhase === "waiting"}
    <div class="flex flex-1 flex-col items-center justify-center gap-4 rounded-3xl border border-amber-500/20 bg-black/25 px-5 py-6 text-center">
      <h2 class="text-3xl font-black text-amber-200">Holster Up</h2>
      <p class="max-w-sm text-base text-white">
        {#if totalPlayers > 0}
          The bracket is live. Watch the TV and wait for your duel to be called.
        {:else}
          Loading the showdown. The TV will announce the next duel shortly.
        {/if}
      </p>
      {#if resultText}
        <p class="text-sm text-amber-100">{resultText}</p>
      {/if}
    </div>

  {:else if subPhase === "preview"}
    <div class="flex flex-1 flex-col items-center justify-center gap-4 rounded-3xl border border-amber-500/25 bg-black/25 px-5 py-6 text-center">
      {#if isInMatch}
        <p class="text-xs uppercase tracking-[0.3em] text-amber-200">You're Up Next</p>
        <h2 class="text-4xl font-black text-white">{me?.name ?? "You"} vs {opponentName}</h2>
        <p class="text-lg text-amber-100">Stand back-to-back and get ready to calibrate.</p>
        <p class="text-sm font-semibold text-amber-200">Duel starts in {timeRemaining.toFixed(1)}s</p>
      {:else}
        <p class="text-xs uppercase tracking-[0.3em] text-amber-200">Spectating</p>
        <h2 class="text-3xl font-black text-white">{opponentName}</h2>
        <p class="text-base text-amber-100">Watch the TV while the next duelists get in place.</p>
      {/if}
    </div>

  {:else if subPhase === "calibrating"}
    <div class="flex flex-1 flex-col gap-4 rounded-3xl border border-amber-500/25 bg-black/25 p-5 text-center">
      <h2 class="text-3xl font-black text-amber-200">Lock Your Direction</h2>

      {#if isInMatch}
        <p class="text-base text-white">Face away from {opponentName}, hold still, then tap the button below.</p>

        <div class="rounded-2xl border border-amber-300/30 bg-stone-950/85 p-4 text-left text-sm text-amber-50 shadow-inner">
          <p class="font-semibold text-amber-100">Calibration tip</p>
          <p class="mt-2 leading-relaxed">Hold your phone naturally in front of you, point straight ahead, and lock your facing direction once you are steady.</p>
        </div>

        {#if showCalibrationDebug}
          <div class="rounded-2xl border border-amber-300/25 bg-black/55 p-4 text-left text-xs text-amber-100 shadow-inner">
            <p class="font-semibold uppercase tracking-[0.2em] text-amber-200">Orientation debug</p>
            <p class="mt-2">α {latestOrientation.alpha.toFixed(1)}°</p>
            <p>β {latestOrientation.beta.toFixed(1)}°</p>
            <p>γ {latestOrientation.gamma.toFixed(1)}°</p>
          </div>
        {/if}

        <button
          class="rounded-2xl bg-amber-400 px-5 py-4 text-lg font-black text-stone-950 shadow-lg transition active:scale-95 disabled:cursor-not-allowed disabled:bg-amber-700 disabled:text-white"
          on:click={calibrateNow}
          disabled={!orientationSeen || calibrationReady}
        >
          {#if calibrationReady}
            Direction Locked
          {:else if !orientationSeen}
            Waiting for motion sensor…
          {:else}
            Lock Facing Direction
          {/if}
        </button>

        <p class="text-sm font-semibold text-amber-100">Ready duelists: {readyCount}/{totalReady}</p>

        {#if !motionListenerAttached || permissionProblem}
          <button class="self-center rounded-xl border border-amber-300/40 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-300/10" on:click={retryMotion}>
            Retry motion sensor
          </button>
        {/if}
      {:else}
        <p class="text-base text-white">The duelists are locking in their back-to-back stance.</p>
        <p class="text-sm font-semibold text-amber-100">Ready duelists: {readyCount}/{totalReady}</p>
      {/if}
    </div>

  {:else if subPhase === "countdown"}
    <div class="flex flex-1 flex-col items-center justify-center gap-4 rounded-3xl border border-amber-500/25 bg-black/25 px-5 py-6 text-center">
      <p class="text-xs uppercase tracking-[0.3em] text-amber-200">Take Three Paces</p>
      <p class="text-8xl font-black text-white">{countdownValue > 0 ? countdownValue : "DRAW"}</p>
      <p class="text-base text-amber-100">Step apart, then turn on the signal.</p>
    </div>

  {:else if subPhase === "draw"}
    <div class="flex flex-1 flex-col gap-4 rounded-3xl border border-red-400/25 bg-black/25 p-5 text-center">
      <p class="text-xs uppercase tracking-[0.3em] text-red-300">Draw!</p>
      <p class="text-6xl font-black {timeRemaining < 2 ? 'text-red-300' : 'text-white'}">{Math.ceil(timeRemaining)}</p>

      {#if isInMatch}
        <div class="rounded-3xl border px-4 py-4 shadow-inner {drawReady ? 'border-green-400 bg-green-500/20' : 'border-amber-400/30 bg-stone-950/70'}">
          <p class="text-sm uppercase tracking-widest {drawReady ? 'text-green-100' : 'text-amber-200'}">Aim status</p>
          <p class="mt-2 text-2xl font-black text-white">{drawReady ? "Ready to fire" : "Turn around and aim sideways"}</p>
          <div class="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold uppercase tracking-[0.2em]">
            <div class="rounded-2xl border px-3 py-2 {turnedAround ? 'border-green-400/50 bg-green-500/15 text-green-50' : 'border-amber-400/30 bg-black/20 text-amber-100'}">
              {turnedAround ? "Turn complete" : "Keep turning"}
            </div>
            <div class="rounded-2xl border px-3 py-2 {sidewaysAimReady ? 'border-green-400/50 bg-green-500/15 text-green-50' : 'border-amber-400/30 bg-black/20 text-amber-100'}">
              {sidewaysAimReady ? "Aim sideways" : "Level the phone"}
            </div>
          </div>
        </div>

        <button
          class="mt-2 rounded-[2rem] border-4 border-amber-100 bg-gradient-to-b from-amber-300 to-orange-500 px-8 py-8 text-3xl font-black text-stone-950 shadow-2xl transition active:scale-95"
          on:click={shoot}
        >
          FIRE
        </button>
      {:else}
        <p class="text-base text-amber-50">Watch the live duel on the TV.</p>
      {/if}
    </div>

  {:else if subPhase === "between_duels"}
    <div class="flex flex-1 flex-col items-center justify-center gap-4 rounded-3xl border border-amber-500/25 bg-black/25 px-5 py-6 text-center">
      <h2 class="text-3xl font-black text-amber-200">Next Duel Loading</h2>
      <p class="max-w-md text-base text-white">{resultText || "Watch the TV while the next pair of cowboys steps into the arena."}</p>
    </div>

  {:else if subPhase === "resolved"}
    <div class="flex flex-1 flex-col items-center justify-center gap-4 rounded-3xl border border-green-400/25 bg-black/25 px-5 py-6 text-center">
      <h2 class="text-4xl font-black text-green-200">{resultText || "Duel Complete"}</h2>
      {#if reactionMs > 0}
        <p class="text-xl text-white">Reaction: {(reactionMs / 1000).toFixed(2)}s</p>
      {/if}
      {#if resultReason}
        <p class="text-sm font-semibold uppercase tracking-widest text-amber-200">{resultReason}</p>
      {/if}
      {#if championName}
        <p class="text-lg text-white">Champion: {championName}</p>
      {/if}
    </div>

  {:else if subPhase === "eliminated"}
    <div class="flex flex-1 flex-col items-center justify-center gap-4 rounded-3xl border border-red-400/25 bg-black/25 px-5 py-6 text-center">
      <h2 class="text-4xl font-black text-red-200">Out of the Bracket</h2>
      <p class="max-w-sm text-base text-white">{resultText || "Your duel is over. Watch the remaining showdowns on the TV."}</p>
      {#if championName}
        <p class="text-lg text-white">Champion: {championName}</p>
      {/if}
      {#if runnerUpName}
        <p class="text-sm text-amber-100">Runner-up: {runnerUpName}{#if runnerUpId === myId} (you){/if}</p>
      {/if}
    </div>

  {:else if subPhase === "champion"}
    <div class="flex flex-1 flex-col items-center justify-center gap-4 rounded-3xl border border-yellow-300/30 bg-black/25 px-5 py-6 text-center">
      <p class="text-xs uppercase tracking-[0.4em] text-yellow-200">Champion</p>
      <h2 class="text-5xl font-black text-yellow-100">{championName}</h2>
      <p class="text-2xl text-white">Fastest draw in the territory.</p>
      {#if runnerUpName}
        <p class="text-sm text-amber-100">Final duel versus {runnerUpName}</p>
      {/if}
    </div>

  {:else if subPhase === "tournament_over"}
    <div class="flex flex-1 flex-col items-center justify-center gap-4 rounded-3xl border border-amber-300/30 bg-black/30 px-5 py-6 text-center">
      <p class="text-xs uppercase tracking-[0.4em] text-amber-200">Tournament Complete</p>
      <h2 class="text-5xl font-black text-yellow-100">{championName}</h2>
      <p class="text-xl text-white">Fastest draw in the territory.</p>
      {#if resultText}
        <p class="max-w-md rounded-2xl border border-amber-300/25 bg-stone-950/80 px-4 py-3 text-base text-amber-50">{resultText}</p>
      {/if}
      {#if runnerUpName}
        <p class="text-sm text-amber-100">Runner-up: {runnerUpName}</p>
      {/if}
    </div>

  {:else if subPhase === "skipped"}
    <div class="flex flex-1 flex-col items-center justify-center gap-4 rounded-3xl border border-amber-400/30 bg-black/25 px-5 py-6 text-center">
      <h2 class="text-3xl font-black text-amber-200">Round Skipped</h2>
      <p class="max-w-sm text-base text-white">{resultText}</p>
    </div>
  {/if}

  {#if permissionProblem}
    <div class="mt-4 rounded-2xl border border-sky-300/45 bg-sky-950/80 px-4 py-3 text-sm font-medium text-sky-50 shadow-sm">{permissionProblem}</div>
  {/if}

  {#if invalidMessage}
    <div class="mt-4 rounded-2xl border border-amber-300/45 bg-amber-950/85 px-4 py-3 text-sm font-medium text-amber-50 shadow-sm">{invalidMessage}</div>
  {/if}
</div>
