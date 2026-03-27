<script lang="ts">
  /**
   * Paint Match — Player phone component.
   *
   * Shows five paint bucket sliders (red, yellow, blue, white, black),
   * a live colour preview, and a submit button.
   *
   * Listens for:
   *   "color_target"     — { targetRGB: [r,g,b] }
   *   "submit_confirmed" — { mixRGB: [r,g,b], distance, score }
   *   "submit_count"     — { submitted, total }
   *   "round_results"    — { rankings: [...] }
   *
   * Sends:
   *   game_input { action: "mix_update",  mix: { red, yellow, blue, white, black } }
   *   game_input { action: "mix_submit",  mix: { red, yellow, blue, white, black } }
   */
  import { onMount, onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState, PlayerState } from "../../../../shared/types";

  export let room: Room;
  export let state: RoomState;
  export let me: PlayerState | undefined;

  // ── Paint bucket amounts (0–1) ─────────────────────────────────
  let red = 0;
  let yellow = 0;
  let blue = 0;
  let white = 0;
  let black = 0;

  // ── State ──────────────────────────────────────────────────────
  let targetRGB: [number, number, number] | null = null;
  let previewColor = "rgb(255,255,255)";
  let submitted = false;
  let submittedColor = "";
  let submittedDistance = 0;
  let submittedScore = 0;
  let submitCount = 0;
  let totalPlayers = 0;
  let showResults = false;
  let myRank = 0;
  let rankings: Array<{
    playerId: string;
    mixRGB: [number, number, number];
    distance: number;
    score: number;
    rank: number;
  }> = [];

  // ── Timer ──────────────────────────────────────────────────────
  let timeLeft = 0;
  let timerInterval: ReturnType<typeof setInterval>;

  // ── Throttled mix update ───────────────────────────────────────
  let updateInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Simplified subtractive RYB→RGB mixing for the client-side preview.
   * This mirrors the server's mixToRGB but is inlined here to avoid
   * importing server code into the client bundle.
   */
  function localMixToRGB(r: number, y: number, b: number, w: number, k: number): string {
    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    r = clamp01(r); y = clamp01(y); b = clamp01(b); w = clamp01(w); k = clamp01(k);

    const total = r + y + b + w + k;
    if (total === 0) return "rgb(255,255,255)";

    const chromatic = r + y + b;
    let baseR: number, baseG: number, baseB: number;

    if (chromatic === 0) {
      baseR = 255; baseG = 255; baseB = 255;
    } else {
      const rn = r / chromatic;
      const yn = y / chromatic;
      const bn = b / chromatic;

      // RYB cube corners for each RGB output channel
      const cubeR = [255, 255, 255, 255,   0, 128,   0, 0];
      const cubeG = [255,   0, 255, 128,   0,   0, 128, 0];
      const cubeB = [255,   0,   0,   0, 255, 128,   0, 0];

      function interp(c: number[]): number {
        const c00 = c[0]*(1-rn) + c[1]*rn;
        const c01 = c[4]*(1-rn) + c[5]*rn;
        const c10 = c[2]*(1-rn) + c[3]*rn;
        const c11 = c[6]*(1-rn) + c[7]*rn;
        const c0 = c00*(1-yn) + c10*yn;
        const c1 = c01*(1-yn) + c11*yn;
        return c0*(1-bn) + c1*bn;
      }

      baseR = interp(cubeR);
      baseG = interp(cubeG);
      baseB = interp(cubeB);
    }

    const cf = chromatic / total;
    const wf = w / total;
    const kf = k / total;

    const fr = Math.round(Math.max(0, Math.min(255, baseR*cf + 255*wf)));
    const fg = Math.round(Math.max(0, Math.min(255, baseG*cf + 255*wf)));
    const fb = Math.round(Math.max(0, Math.min(255, baseB*cf + 255*wf)));

    return `rgb(${fr},${fg},${fb})`;
  }

  function updatePreview() {
    previewColor = localMixToRGB(red, yellow, blue, white, black);
  }

  $: red, yellow, blue, white, black, updatePreview();

  function handleSubmit() {
    if (submitted) return;
    submitted = true;
    room.send("game_input", {
      action: "mix_submit",
      mix: { red, yellow, blue, white, black },
    });
  }

  onMount(() => {
    // Timer
    timerInterval = setInterval(() => {
      const elapsed = (Date.now() - state.phaseStartedAt) / 1000;
      timeLeft = Math.max(0, state.roundDurationSecs - elapsed);
    }, 200);

    // Throttled mix updates at ~10 Hz
    updateInterval = setInterval(() => {
      if (!submitted && targetRGB) {
        room.send("game_input", {
          action: "mix_update",
          mix: { red, yellow, blue, white, black },
        });
      }
    }, 100);

    // Listen for server messages
    room.onMessage("color_target", (msg: { targetRGB: [number, number, number] }) => {
      targetRGB = msg.targetRGB;
      submitted = false;
      showResults = false;
      red = 0; yellow = 0; blue = 0; white = 0; black = 0;
      rankings = [];
    });

    room.onMessage("submit_confirmed", (msg: { mixRGB: [number, number, number]; distance: number; score: number }) => {
      submittedColor = `rgb(${msg.mixRGB[0]},${msg.mixRGB[1]},${msg.mixRGB[2]})`;
      submittedDistance = Math.round(msg.distance * 10) / 10;
      submittedScore = msg.score;
    });

    room.onMessage("submit_count", (msg: { submitted: number; total: number }) => {
      submitCount = msg.submitted;
      totalPlayers = msg.total;
    });

    room.onMessage("round_results", (msg: { rankings: typeof rankings }) => {
      rankings = msg.rankings;
      showResults = true;
      const myResult = rankings.find((r) => r.playerId === me?.id);
      myRank = myResult?.rank ?? 0;
    });

    return () => {
      clearInterval(timerInterval);
      if (updateInterval) clearInterval(updateInterval);
    };
  });

  onDestroy(() => {
    clearInterval(timerInterval);
    if (updateInterval) clearInterval(updateInterval);
  });

  // Bucket definitions for rendering
  const buckets = [
    { key: "red",    label: "Red",    color: "#ef4444", trackColor: "#7f1d1d" },
    { key: "yellow", label: "Yellow", color: "#eab308", trackColor: "#713f12" },
    { key: "blue",   label: "Blue",   color: "#3b82f6", trackColor: "#1e3a5f" },
    { key: "white",  label: "White",  color: "#f5f5f5", trackColor: "#525252" },
    { key: "black",  label: "Black",  color: "#1f2937", trackColor: "#0f172a" },
  ];

  function getBucketValue(key: string): number {
    switch (key) {
      case "red": return red;
      case "yellow": return yellow;
      case "blue": return blue;
      case "white": return white;
      case "black": return black;
      default: return 0;
    }
  }

  function setBucketValue(key: string, value: number) {
    switch (key) {
      case "red": red = value; break;
      case "yellow": yellow = value; break;
      case "blue": blue = value; break;
      case "white": white = value; break;
      case "black": black = value; break;
    }
  }
</script>

<div class="flex-1 flex flex-col bg-gray-950 select-none" data-testid="paint-match-player">
  <!-- Top bar: timer + submit count -->
  <div class="px-4 py-2 bg-gray-900 flex items-center justify-between">
    <div class="flex items-center gap-2">
      <span class="text-xs text-gray-400 uppercase tracking-wider">Round {state.currentRound}/{state.gameConfig.roundCount}</span>
    </div>
    <div class="flex items-center gap-3">
      <span class="text-xs text-gray-400">{submitCount}/{totalPlayers} submitted</span>
      <span
        class="text-xl font-mono font-black {timeLeft < 10 ? 'text-red-400' : 'text-white'}"
        data-testid="timer"
      >{Math.ceil(timeLeft)}</span>
    </div>
  </div>

  {#if showResults}
    <!-- ── Results view ─────────────────────────────────────────── -->
    <div class="flex-1 flex flex-col items-center justify-center gap-4 p-4">
      <p class="text-lg font-bold text-white">
        {#if myRank === 1}
          You got the closest match!
        {:else if myRank <= 3}
          Nice try! #{myRank}
        {:else}
          You placed #{myRank}
        {/if}
      </p>

      <div class="flex gap-4 items-center">
        <div class="text-center">
          <p class="text-xs text-gray-400 mb-1">Target</p>
          <div
            class="w-16 h-16 rounded-lg border-2 border-gray-600"
            style="background:rgb({targetRGB?.[0] ?? 0},{targetRGB?.[1] ?? 0},{targetRGB?.[2] ?? 0})"
          ></div>
        </div>
        <div class="text-2xl text-gray-500">vs</div>
        <div class="text-center">
          <p class="text-xs text-gray-400 mb-1">Your mix</p>
          <div
            class="w-16 h-16 rounded-lg border-2 border-gray-600"
            style="background:{submittedColor || previewColor}"
          ></div>
        </div>
      </div>

      <div class="text-center">
        <p class="text-3xl font-black text-amber-400">+{submittedScore}</p>
        <p class="text-xs text-gray-400">Distance: {submittedDistance}</p>
      </div>
    </div>
  {:else if !targetRGB}
    <!-- ── Waiting for target ───────────────────────────────────── -->
    <div class="flex-1 flex items-center justify-center">
      <p class="text-gray-400 animate-pulse">Waiting for target colour...</p>
    </div>
  {:else}
    <!-- ── Mixing UI ────────────────────────────────────────────── -->
    <div class="flex-1 flex flex-col p-4 gap-3 overflow-y-auto">
      <!-- Colour preview -->
      <div class="flex gap-3 items-stretch">
        <!-- Preview swatch -->
        <div class="flex-1 flex flex-col items-center gap-1">
          <p class="text-xs text-gray-400">Your Mix</p>
          <div
            class="w-full aspect-square rounded-xl border-2 border-gray-600 transition-colors"
            style="background:{previewColor}"
            data-testid="mix-preview"
          ></div>
        </div>
        <!-- Target swatch (small reference) -->
        <div class="flex flex-col items-center gap-1">
          <p class="text-xs text-gray-400">Target</p>
          <div
            class="w-20 aspect-square rounded-xl border-2 border-amber-500/50"
            style="background:rgb({targetRGB[0]},{targetRGB[1]},{targetRGB[2]})"
            data-testid="target-preview"
          ></div>
        </div>
      </div>

      <!-- Paint sliders -->
      <div class="flex flex-col gap-2">
        {#each buckets as bucket}
          <div class="flex items-center gap-2">
            <div
              class="w-8 h-8 rounded-full border-2 border-gray-600 flex-shrink-0"
              style="background:{bucket.color}"
            ></div>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(getBucketValue(bucket.key) * 100)}
              on:input={(e) => setBucketValue(bucket.key, parseInt(e.currentTarget.value) / 100)}
              class="flex-1 h-8 rounded-full appearance-none cursor-pointer"
              style="background: linear-gradient(to right, {bucket.trackColor}, {bucket.color})"
              disabled={submitted}
              data-testid="slider-{bucket.key}"
            />
            <span class="w-8 text-xs text-gray-400 text-right font-mono">
              {Math.round(getBucketValue(bucket.key) * 100)}
            </span>
          </div>
        {/each}
      </div>

      <!-- Submit button -->
      {#if !submitted}
        <button
          class="mt-2 w-full py-3 rounded-xl font-bold text-lg
            bg-gradient-to-r from-pink-600 to-purple-600 text-white
            active:scale-95 transition-transform"
          on:click={handleSubmit}
          data-testid="submit-button"
        >
          Submit Mix
        </button>
      {:else}
        <div class="mt-2 w-full py-3 rounded-xl text-center font-bold text-lg bg-gray-800 text-green-400">
          Submitted! Score: {submittedScore}
        </div>
      {/if}
    </div>
  {/if}
</div>
