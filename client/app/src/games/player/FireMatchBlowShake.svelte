<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState, PlayerState } from "../../../../shared/types";
  import CampfireCanvas from "../shared/CampfireCanvas.svelte";

  export let room: Room;
  export let state: RoomState;
  export let me: PlayerState | undefined;

  // ── Stage / phase state ───────────────────────────────────────────────────
  type FireStage = "strike" | "blow" | "shake" | "extinguish";
  type GamePhase = "waiting" | "active" | "stage_complete" | "round_success" | "round_done";

  let phase: GamePhase = "waiting";
  let currentStage: FireStage = "strike";
  let stageIndex = 0;
  let totalStages = 4;

  // Progress
  let target = 0;
  let current = 0;
  let fireLevel = 0;
  let invertedProgress = false;
  let timeLeft = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let roundEndAt = 0;

  // Standings
  let standings: { playerId: string; playerName: string; contribution: number }[] = [];

  // ── Campfire intensity (drives the visual) ────────────────────────────────
  // Maps the stage progression to a fire intensity:
  //   strike: 0 -> ~0.15  (dim flicker when match is lit)
  //   blow:   0.15 -> ~0.45  (growing)
  //   shake:  0.45 -> ~0.85  (roaring)
  //   extinguish: 0.85 -> 0 (dying down)
  const STAGE_INTENSITY: Record<FireStage, [number, number]> = {
    strike:     [0.0,  0.15],
    blow:       [0.15, 0.45],
    shake:      [0.45, 0.85],
    extinguish: [0.85, 0.0],
  };
  let fireIntensity = 0;

  $: {
    const [from, to] = STAGE_INTENSITY[currentStage] ?? [0, 0];
    const pct = target > 0
      ? invertedProgress
        ? 1 - fireLevel / target
        : current / target
      : 0;
    const clampedPct = Math.max(0, Math.min(1, pct));
    fireIntensity = from + (to - from) * clampedPct;
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
    if (micActive) return;
    try {
      if (!window.isSecureContext) {
        micMsg = "Microphone requires HTTPS (or localhost).";
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStream = stream;
      audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      micActive = true;
      micMsg = "Listening for blowing...";

      // Poll amplitude
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      micCheckTimer = setInterval(() => {
        if (!analyser || currentStage !== "blow" || phase !== "active") return;
        analyser.getByteFrequencyData(dataArray);
        // Compute average amplitude (0-255)
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        // Blow threshold: ~40+ out of 255 means actively blowing
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
    if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }
    if (audioCtx) { audioCtx.close(); audioCtx = null; }
    analyser = null;
    micActive = false;
  }

  // Fallback manual blow button
  function sendBlowManual() {
    room.send("game_input", { action: "fire_blow", amplitude: 1 });
  }

  // ── Shake (accelerometer) state ───────────────────────────────────────────
  let motionEnabled = false;
  let motionMsg = "";
  let lastShakeAt = 0;

  function onMotion(e: DeviceMotionEvent) {
    if (!motionEnabled || currentStage !== "shake" || phase !== "active") return;
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

  async function enableMotion() {
    if (!window.isSecureContext) {
      motionMsg = "Motion sensors require HTTPS (or localhost).";
      return;
    }
    const dm = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
    if (typeof dm.requestPermission === "function") {
      try {
        const p = await dm.requestPermission();
        if (p !== "granted") {
          motionMsg = "Motion permission denied.";
          return;
        }
      } catch {
        motionMsg = "Could not request motion permission.";
        return;
      }
    }
    motionEnabled = true;
    motionMsg = "Shake detection enabled!";
  }

  // Fallback manual shake button
  function sendShakeManual() {
    room.send("game_input", { action: "fire_shake", magnitude: 1.2 });
  }

  // ── Extinguish (tap) state ────────────────────────────────────────────────
  let extinguishTaps = 0;

  function sendExtinguish() {
    extinguishTaps++;
    room.send("game_input", { action: "fire_tap" });
  }

  // ── Timer ─────────────────────────────────────────────────────────────────
  function startTimer(durationMs: number, serverTimestamp: number) {
    roundEndAt = serverTimestamp + durationMs;
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
    blow: "Blow into your mic (or tap the button)",
    shake: "Shake your phone to fan the flames!",
    extinguish: "Tap rapidly to stamp out the fire",
  };

  // ── Colyseus message handlers ─────────────────────────────────────────────
  onMount(() => {
    room.onMessage("fire_round_start", () => {
      phase = "waiting";
      strikeTaps = 0;
      extinguishTaps = 0;
      fireIntensity = 0;
    });

    room.onMessage("fire_stage_start", (d: {
      stage: FireStage;
      stageIndex: number;
      totalStages: number;
      target: number;
      durationMs: number;
      serverTimestamp: number;
      invertedProgress: boolean;
    }) => {
      phase = "active";
      currentStage = d.stage;
      stageIndex = d.stageIndex;
      totalStages = d.totalStages;
      target = d.target;
      current = 0;
      fireLevel = d.invertedProgress ? d.target : 0;
      invertedProgress = d.invertedProgress;
      standings = [];
      startTimer(d.durationMs, d.serverTimestamp);

      // Auto-start mic for blow stage
      if (d.stage === "blow" && !micActive) {
        startMic();
      }
    });

    room.onMessage("fire_stage_update", (d: {
      stage: FireStage;
      current: number;
      target: number;
      fireLevel: number;
      timeLeftMs: number;
      standings: { playerId: string; playerName: string; contribution: number }[];
      invertedProgress: boolean;
    }) => {
      current = d.current;
      target = d.target;
      fireLevel = d.fireLevel;
      invertedProgress = d.invertedProgress;
      timeLeft = Math.max(0, d.timeLeftMs / 1000);
      standings = d.standings;
    });

    room.onMessage("fire_stage_end", (d: { stage: FireStage; success: boolean }) => {
      phase = "stage_complete";
      clearTimerInterval();
      // Stop mic when blow stage ends
      if (d.stage === "blow") {
        stopMic();
      }
    });

    room.onMessage("fire_round_success", () => {
      phase = "round_success";
      clearTimerInterval();
      stopMic();
    });

    room.onMessage("fire_round_done", () => {
      phase = "round_done";
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
  $: percent = target > 0
    ? invertedProgress
      ? Math.min(100, (1 - fireLevel / target) * 100)
      : Math.min(100, (current / target) * 100)
    : 0;
  $: myContribution = standings.find((s) => s.playerId === me?.id)?.contribution ?? 0;
  $: stageLabel = STAGE_LABELS[currentStage] ?? "";
  $: stageInstruction = STAGE_INSTRUCTIONS[currentStage] ?? "";

  // Stage progress dots
  const stageNames: FireStage[] = ["strike", "blow", "shake", "extinguish"];
</script>

<div class="flex-1 flex flex-col items-center justify-between p-4 gap-3 overflow-hidden">
  <!-- Header -->
  <h2 class="text-xl font-black text-orange-400">Camp Fire</h2>

  <!-- Stage progress dots -->
  <div class="flex items-center gap-2">
    {#each stageNames as sn, i}
      <div class="flex items-center gap-1">
        <div class="w-3 h-3 rounded-full transition-all {i < stageIndex ? 'bg-green-400' : i === stageIndex && phase === 'active' ? 'bg-orange-400 animate-pulse' : 'bg-gray-600'}"></div>
        <span class="text-[10px] text-gray-400 uppercase tracking-wide">{sn}</span>
      </div>
      {#if i < stageNames.length - 1}
        <div class="w-4 h-px {i < stageIndex ? 'bg-green-400' : 'bg-gray-700'}"></div>
      {/if}
    {/each}
  </div>

  <!-- Campfire animation -->
  <div class="flex-shrink-0">
    <CampfireCanvas intensity={fireIntensity} width={200} height={220} />
  </div>

  <!-- Stage info + progress bar -->
  {#if phase === "active"}
    <div class="w-full max-w-sm space-y-2">
      <p class="text-center text-lg font-black text-yellow-300">{stageLabel}</p>
      <p class="text-center text-xs text-gray-400">{stageInstruction}</p>

      <!-- Progress bar -->
      <div class="h-3 bg-gray-700 rounded-full overflow-hidden">
        <div
          class="h-full transition-all duration-150 rounded-full {invertedProgress ? 'bg-gradient-to-r from-red-500 to-orange-400' : 'bg-gradient-to-r from-orange-500 to-yellow-400'}"
          style="width:{percent}%"
        ></div>
      </div>
      <div class="flex justify-between text-xs text-gray-500">
        <span>{Math.round(percent)}%</span>
        <span class="font-mono font-bold {timeLeft < 5 ? 'text-red-400' : 'text-white'}">{Math.ceil(timeLeft)}s</span>
      </div>
    </div>

    <!-- Stage-specific controls -->
    <div class="w-full max-w-sm">
      {#if currentStage === "strike"}
        <button
          class="w-full py-5 rounded-xl bg-amber-600 text-white font-black text-xl active:scale-95 active:bg-amber-500 transition-all select-none"
          on:click={sendStrike}
        >
          STRIKE! ({strikeTaps})
        </button>

      {:else if currentStage === "blow"}
        <div class="space-y-2">
          {#if !micActive}
            <button
              class="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold active:scale-95 transition-all"
              on:click={startMic}
            >
              Enable Microphone
            </button>
          {/if}
          <button
            class="w-full py-5 rounded-xl bg-orange-600 text-white font-black text-xl active:scale-95 active:bg-orange-500 transition-all select-none"
            on:click={sendBlowManual}
          >
            BLOW
          </button>
          {#if micMsg}
            <p class="text-xs text-center {micActive ? 'text-green-400' : 'text-gray-400'}">{micMsg}</p>
          {/if}
        </div>

      {:else if currentStage === "shake"}
        <div class="space-y-2">
          {#if !motionEnabled}
            <button
              class="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold active:scale-95 transition-all"
              on:click={enableMotion}
            >
              Enable Motion
            </button>
          {/if}
          <button
            class="w-full py-5 rounded-xl bg-sky-600 text-white font-black text-xl active:scale-95 active:bg-sky-500 transition-all select-none"
            on:click={sendShakeManual}
          >
            SHAKE
          </button>
          {#if motionMsg}
            <p class="text-xs text-center {motionEnabled ? 'text-green-400' : 'text-gray-400'}">{motionMsg}</p>
          {/if}
        </div>

      {:else if currentStage === "extinguish"}
        <button
          class="w-full py-5 rounded-xl bg-red-600 text-white font-black text-xl active:scale-95 active:bg-red-500 transition-all select-none"
          on:click={sendExtinguish}
        >
          TAP TO EXTINGUISH! ({extinguishTaps})
        </button>
      {/if}
    </div>

  {:else if phase === "stage_complete"}
    <div class="text-center space-y-1">
      <p class="text-lg font-black text-green-400">Stage complete!</p>
      <p class="text-sm text-gray-400">Next stage starting...</p>
    </div>

  {:else if phase === "round_success"}
    <p class="text-2xl font-black text-green-400">All stages cleared!</p>

  {:else if phase === "round_done"}
    <p class="text-2xl font-black text-red-400">Round over!</p>

  {:else}
    <p class="text-gray-400">Waiting for round...</p>
  {/if}

  <!-- Contribution -->
  <p class="text-sm text-gray-400">Your contribution: <span class="text-white font-bold">{myContribution}</span></p>
</div>
