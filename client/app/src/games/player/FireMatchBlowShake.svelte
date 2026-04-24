<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState, PlayerState } from "../../../../shared/types";
  import CampfireCanvas from "../shared/CampfireCanvas.svelte";
  import { getCachedMicStream, isMotionPermissionGrantedThisSession } from "../../lib/permissions";

  export let room: Room;
  export let state: RoomState;
  export let me: PlayerState | undefined;

  type PermissionAwarePlayer = PlayerState & {
    micPermission?: string;
    motionPermission?: string;
  };

  $: permissionPlayer = me as PermissionAwarePlayer | undefined;
  $: micGranted = permissionPlayer?.micPermission === "granted";
  $: motionGranted = permissionPlayer?.motionPermission === "granted";

  // ── Stage / phase state ───────────────────────────────────────────────────
  type FireStage = "strike" | "blow" | "shake" | "extinguish";
  type GamePhase = "waiting" | "active" | "finished" | "round_end";

  let phase: GamePhase = "waiting";
  let myStageIndex = 0;
  let myStage: FireStage = "strike";
  let totalStages = 4;

  // My individual progress
  let myCurrent = 0;
  let myTarget = 0;
  let myFinished = false;
  let myTotalContribution = 0;

  // Timer (total game time)
  let timeLeft = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let roundEndAt = 0;

  // ── Campfire intensity (drives the visual) ────────────────────────────────
  const STAGE_INTENSITY: Record<FireStage, [number, number]> = {
    strike:     [0.0,  0.25],
    blow:       [0.25, 0.60],
    shake:      [0.60, 1.0],
    extinguish: [1.0,  0.0],
  };
  let fireIntensity = 0;

  $: {
    if (myFinished) {
      fireIntensity = 0;
    } else {
      const [from, to] = STAGE_INTENSITY[myStage] ?? [0, 0];
      const pct = myTarget > 0 ? Math.min(1, myCurrent / myTarget) : 0;
      fireIntensity = from + (to - from) * pct;
    }
  }

  // ── Strike (tap) state ────────────────────────────────────────────────────
  let strikeTaps = 0;

  function sendStrike() {
    strikeTaps++;
    room.send("game_input", { action: "fire_strike" });
  }

  // ── Blow (microphone) state ───────────────────────────────────────────────
  let micActive = false;
  let micMsg = "";
  let audioCtx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let micStream: MediaStream | null = null;
  let micCheckTimer: ReturnType<typeof setInterval> | null = null;

  async function startMic() {
    if (micActive || !micGranted) return;
    try {
      if (!window.isSecureContext) {
        micMsg = "Microphone requires HTTPS (or localhost).";
        return;
      }
      // Prefer the cached stream from the lobby consent flow to avoid
      // triggering a second browser permission prompt mid-game.
      let stream = getCachedMicStream();
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      micStream = stream;
      audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      micActive = true;
      micMsg = "Listening for blowing...";

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      micCheckTimer = setInterval(() => {
        if (!analyser || myStage !== "blow" || phase !== "active" || myFinished) return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        if (avg > 35) {
          const amplitude = Math.min(3, avg / 60);
          room.send("game_input", { action: "fire_blow", amplitude });
        }
      }, 150);
    } catch {
      micMsg = "Could not access microphone.";
    }
  }

  function stopMic() {
    if (micCheckTimer) { clearInterval(micCheckTimer); micCheckTimer = null; }
    // Only stop tracks if this is NOT the globally cached mic stream from
    // the lobby, which may be reused by other game stages.
    if (micStream && micStream !== getCachedMicStream()) {
      micStream.getTracks().forEach((t) => t.stop());
    }
    micStream = null;
    if (audioCtx) { audioCtx.close(); audioCtx = null; }
    analyser = null;
    micActive = false;
  }

  // ── Shake (accelerometer) state ───────────────────────────────────────────
  let motionEnabled = false;
  let motionMsg = "";
  let lastShakeAt = 0;

  function onMotion(e: DeviceMotionEvent) {
    if (!motionEnabled || myStage !== "shake" || phase !== "active" || myFinished) return;
    const ax = e.accelerationIncludingGravity?.x ?? 0;
    const ay = e.accelerationIncludingGravity?.y ?? 0;
    const az = e.accelerationIncludingGravity?.z ?? 0;
    const mag = Math.sqrt(ax * ax + ay * ay + az * az) / 9.81;

    const now = Date.now();
    if (mag > 1.45 && now - lastShakeAt > 220) {
      lastShakeAt = now;
      room.send("game_input", { action: "fire_shake", magnitude: Math.min(2.5, mag) });
    }
  }

  function enableMotion() {
    if (!motionGranted) return;
    if (!window.isSecureContext) {
      motionMsg = "Motion sensors require HTTPS (or localhost).";
      return;
    }
    // On iOS, DeviceMotionEvent.requestPermission() must have been called
    // this page session. If the lobby didn't obtain it (e.g. page reloaded
    // mid-game), motion events won't fire.
    if (!isMotionPermissionGrantedThisSession()) {
      motionMsg = "Motion permission expired. Return to the lobby and re-enable permissions.";
      return;
    }
    motionEnabled = true;
    motionMsg = "Shake detection ready.";
  }

  // ── Extinguish (tap) state ────────────────────────────────────────────────
  let extinguishTaps = 0;

  function sendExtinguish() {
    extinguishTaps++;
    room.send("game_input", { action: "fire_tap" });
  }

  // ── Timer ─────────────────────────────────────────────────────────────────
  function startTimer(totalDurationMs: number, serverTimestamp: number) {
    roundEndAt = serverTimestamp + totalDurationMs;
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      timeLeft = Math.max(0, (roundEndAt - Date.now()) / 1000);
    }, 100);
  }

  function clearTimerInterval() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  // ── Stage label & instructions ────────────────────────────────────────────
  const STAGE_LABELS: Record<FireStage, string> = {
    strike: "Strike the Match!",
    blow: "Blow on the Fire!",
    shake: "Fan the Flames!",
    extinguish: "Put Out the Fire!",
  };
  const STAGE_INSTRUCTIONS: Record<FireStage, string> = {
    strike: "Tap rapidly to strike the match",
    blow: "Blow into your mic to grow the fire",
    shake: "Shake your phone to fan the flames!",
    extinguish: "Tap rapidly to stamp out the fire",
  };

  // ── Colyseus message handlers ─────────────────────────────────────────────
  onMount(() => {
    if (!micGranted) {
      micMsg = "Enable microphone in the lobby to play the blow stage.";
    }

    if (motionGranted) {
      enableMotion();
    } else {
      motionMsg = "Enable motion in the lobby to play the shake stage.";
    }

    room.onMessage("fire_round_start", (d: {
      totalStages: number;
      totalDurationMs: number;
      serverTimestamp: number;
      players: { playerId: string; stageIndex: number; stage: string; current: number; target: number; finished: boolean }[];
    }) => {
      phase = "active";
      totalStages = d.totalStages;
      strikeTaps = 0;
      extinguishTaps = 0;
      myFinished = false;
      myTotalContribution = 0;

      // Find my initial state.
      const previousStage = myStage;
      const myState = d.players.find((p) => p.playerId === me?.id);
      if (myState) {
        myStageIndex = myState.stageIndex;
        myStage = myState.stage as FireStage;
        myCurrent = myState.current;
        myTarget = myState.target;
      } else {
        myStageIndex = 0;
        myStage = "strike";
        myCurrent = 0;
        myTarget = 0;
      }

      if (previousStage !== myStage) {
        if (myStage === "blow" && micGranted) {
          void startMic();
        } else if (previousStage === "blow") {
          stopMic();
        }
      }

      startTimer(d.totalDurationMs, d.serverTimestamp);
    });

    room.onMessage("fire_update", (d: {
      timeLeftMs: number;
      players: { playerId: string; stageIndex: number; stage: string | null; current: number; target: number; totalContribution: number; finished: boolean; invertedProgress: boolean }[];
    }) => {
      timeLeft = Math.max(0, d.timeLeftMs / 1000);

      // Update my own progress from server state.
      const myState = d.players.find((p) => p.playerId === me?.id);
      if (myState) {
        const previousStage = myStage;
        myStageIndex = myState.stageIndex;
        if (myState.stage) myStage = myState.stage as FireStage;
        myCurrent = myState.current;
        myTarget = myState.target;
        myTotalContribution = myState.totalContribution;
        myFinished = myState.finished;

        if ((previousStage === "blow" && myStage !== "blow") || myFinished) {
          stopMic();
        } else if (previousStage !== "blow" && myStage === "blow" && micGranted && !myFinished) {
          void startMic();
        }
      }
    });

    room.onMessage("fire_player_stage_complete", (d: { stage: string; stageIndex: number }) => {
      // My stage was completed; the server already advanced me.
      // Reset local tap counters.
      if (d.stage === "blow") {
        stopMic();
      }
    });

    room.onMessage("fire_player_finished", () => {
      myFinished = true;
      phase = "finished";
      stopMic();
    });

    room.onMessage("fire_round_end", () => {
      phase = "round_end";
      clearTimerInterval();
      stopMic();
    });

    window.addEventListener("devicemotion", onMotion);
  });

  onDestroy(() => {
    clearTimerInterval();
    stopMic();
    window.removeEventListener("devicemotion", onMotion);
  });

  // ── Derived ───────────────────────────────────────────────────────────────
  $: percent = myTarget > 0 ? Math.min(100, (myCurrent / myTarget) * 100) : 0;
  $: stageLabel = STAGE_LABELS[myStage] ?? "";
  $: stageInstruction = STAGE_INSTRUCTIONS[myStage] ?? "";

  const stageNames: FireStage[] = ["strike", "blow", "shake", "extinguish"];
</script>

<div class="flex-1 flex flex-col items-center justify-between p-4 gap-3 overflow-hidden">
  <!-- Header -->
  <h2 class="text-xl font-black text-orange-400">Camp Fire</h2>

  <!-- Stage progress dots (MY progress) -->
  <div class="flex items-center gap-2">
    {#each stageNames as sn, i}
      <div class="flex items-center gap-1">
        <div class="w-3 h-3 rounded-full transition-all {i < myStageIndex ? 'bg-green-400' : i === myStageIndex && phase === 'active' && !myFinished ? 'bg-orange-400 animate-pulse' : myFinished ? 'bg-green-400' : 'bg-gray-600'}"></div>
        <span class="text-[10px] text-gray-400 uppercase tracking-wide">{sn}</span>
      </div>
      {#if i < stageNames.length - 1}
        <div class="w-4 h-px {i < myStageIndex ? 'bg-green-400' : 'bg-gray-700'}"></div>
      {/if}
    {/each}
  </div>

  <!-- Total timer -->
  <p class="text-center font-mono font-bold text-lg {timeLeft < 10 ? 'text-red-400' : 'text-white'}">
    {Math.ceil(timeLeft)}s
  </p>

  <!-- Campfire animation -->
  <div class="flex-shrink-0">
    <CampfireCanvas intensity={fireIntensity} width={180} height={200} />
  </div>

  <!-- Stage info + progress bar -->
  {#if phase === "active" && !myFinished}
    <div class="w-full max-w-sm space-y-2">
      <p class="text-center text-lg font-black text-yellow-300">{stageLabel}</p>
      <p class="text-center text-xs text-gray-400">{stageInstruction}</p>

      <!-- Progress bar -->
      <div class="h-3 bg-gray-700 rounded-full overflow-hidden">
        <div
          class="h-full transition-all duration-150 rounded-full bg-gradient-to-r from-orange-500 to-yellow-400"
          style="width:{percent}%"
        ></div>
      </div>
      <div class="flex justify-between text-xs text-gray-500">
        <span>{Math.round(percent)}%</span>
        <span>Stage {myStageIndex + 1}/{totalStages}</span>
      </div>
    </div>

    <!-- Stage-specific controls -->
    <div class="w-full max-w-sm">
      {#if myStage === "strike"}
        <button
          class="w-full py-5 rounded-xl bg-amber-600 text-white font-black text-xl active:scale-95 active:bg-amber-500 transition-all select-none"
          style="touch-action:manipulation"
          on:click={sendStrike}
        >
          STRIKE! ({strikeTaps})
        </button>

      {:else if myStage === "blow"}
        <div class="space-y-2">
          {#if !micGranted}
            <div class="w-full rounded-xl border border-red-700 bg-red-950/50 px-4 py-3 text-center text-sm text-red-200">
              Enable microphone in the lobby to use the blow stage.
            </div>
          {/if}
          {#if micMsg}
            <p class="text-xs text-center {micActive ? 'text-green-400' : 'text-gray-400'}">{micMsg}</p>
          {/if}
        </div>

      {:else if myStage === "shake"}
        <div class="space-y-2">
          {#if !motionGranted}
            <div class="w-full rounded-xl border border-red-700 bg-red-950/50 px-4 py-3 text-center text-sm text-red-200">
              Enable motion in the lobby to use the shake stage.
            </div>
          {/if}
          {#if motionMsg}
            <p class="text-xs text-center {motionEnabled ? 'text-green-400' : 'text-gray-400'}">{motionMsg}</p>
          {/if}
        </div>

      {:else if myStage === "extinguish"}
        <button
          class="w-full py-5 rounded-xl bg-red-600 text-white font-black text-xl active:scale-95 active:bg-red-500 transition-all select-none"
          style="touch-action:manipulation"
          on:click={sendExtinguish}
        >
          TAP TO EXTINGUISH! ({extinguishTaps})
        </button>
      {/if}
    </div>

  {:else if phase === "finished" || myFinished}
    <div class="text-center space-y-2">
      <p class="text-2xl font-black text-green-400">All stages complete!</p>
      <p class="text-sm text-gray-400">Waiting for other players...</p>
    </div>

  {:else if phase === "round_end"}
    <div class="text-center space-y-1">
      <p class="text-2xl font-black {myFinished ? 'text-green-400' : 'text-red-400'}">
        {myFinished ? 'Round complete!' : "Time's up!"}
      </p>
      <p class="text-sm text-gray-400">Stages completed: {Math.min(myStageIndex, totalStages)}/{totalStages}</p>
    </div>

  {:else}
    <p class="text-gray-400">Waiting for round...</p>
  {/if}

  <!-- Contribution -->
  <p class="text-sm text-gray-400">Your effort: <span class="text-white font-bold">{myTotalContribution}</span></p>
</div>
