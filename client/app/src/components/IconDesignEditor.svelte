<script lang="ts">
  import { onDestroy } from "svelte";
  import type { PlayerState } from "../../../shared/types";
  import PlayerIcon from "./PlayerIcon.svelte";
  import {
    cloneIconDesign,
    createEmptyIconDesign,
    DEFAULT_BRUSH_COLOR,
    DEFAULT_ICON_BG,
    getIconStrokeRenderWidth,
    type IconDesign,
    type IconPoint,
    type IconStroke,
  } from "../../../shared/playerIconDesign";

  export let design: IconDesign = createEmptyIconDesign(DEFAULT_ICON_BG);
  export let previewName = "Preview";
  export let previewSize = 96;
  export let disabled = false;

  const PALETTE = [
    "#ffffff",
    "#0f172a",
    "#ef4444",
    "#f97316",
    "#eab308",
    "#22c55e",
    "#06b6d4",
    "#3b82f6",
    "#8b5cf6",
    "#ec4899",
  ];

  const BG_COLORS = [
    "#6366f1",
    "#ec4899",
    "#f97316",
    "#eab308",
    "#22c55e",
    "#06b6d4",
    "#ffffff",
    "#ef4444",
    "#0f172a",
    "#64748b",
    "#14b8a6",
    "#f43f5e",
  ];

  let brushColor = DEFAULT_BRUSH_COLOR;
  let brushSize = 8;
  let drawingStroke: IconStroke | null = null;
  let canvasEl: HTMLDivElement | null = null;
  let pointerActive = false;
  let activePointerId: number | null = null;
  let designHistory: IconDesign[] = [];
  let selectionLockCleanup: (() => void) | null = null;

  $: previewPlayer = {
    id: "preview-player",
    name: previewName,
    score: 0,
    isReady: false,
    isConnected: true,
    isEliminated: false,
    bracketSeed: 0,
    currentMatchOpponentId: "",
    iconEmoji: "",
    iconText: "",
    iconBgColor: design.bgColor,
    iconDesign: "",
    micPermission: "unknown",
    motionPermission: "unknown",
    x: 0,
    y: 0,
    isDetected: false,
    detectionMeter: 0,
    timesCaught: 0,
  } as PlayerState;

  $: if (disabled && pointerActive) {
    endStroke();
  }

  function resetDesign() {
    if (disabled) return;
    design = createEmptyIconDesign(DEFAULT_ICON_BG);
    designHistory = [];
    endStroke();
  }

  function pushHistorySnapshot() {
    designHistory = [...designHistory, cloneIconDesign({ ...design, text: null })];
  }

  function startStroke(event: PointerEvent) {
    if (disabled || !canvasEl || pointerActive || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    pointerActive = true;
    activePointerId = event.pointerId;
    lockUserSelection();
    try {
      canvasEl.setPointerCapture(event.pointerId);
    } catch {
      // Ignore pointer capture failures on unsupported input types.
    }
    pushHistorySnapshot();
    const point = eventToPercent(event);
    drawingStroke = {
      color: brushColor,
      size: brushSize,
      points: [point],
    };
    design = {
      ...design,
      strokes: [...design.strokes, cloneIconDesignStroke(drawingStroke)],
    };
  }

  function moveStroke(event: PointerEvent) {
    if (disabled || !pointerActive || activePointerId !== event.pointerId || !drawingStroke) return;
    event.preventDefault();
    appendPointToCurrentStroke(eventToPercent(event));
  }

  function endStroke(event?: PointerEvent) {
    if (event && activePointerId !== event.pointerId) return;
    if (!pointerActive && !drawingStroke && !selectionLockCleanup) return;

    if (canvasEl && activePointerId !== null && canvasEl.hasPointerCapture?.(activePointerId)) {
      try {
        canvasEl.releasePointerCapture(activePointerId);
      } catch {
        // Ignore release failures when the browser already released capture.
      }
    }

    pointerActive = false;
    activePointerId = null;
    drawingStroke = null;
    unlockUserSelection();
  }

  function eventToPercent(event: PointerEvent) {
    const rect = canvasEl?.getBoundingClientRect();
    if (!rect) return { x: 50, y: 50 };
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    return {
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    };
  }

  function setBackgroundColor(color: string) {
    if (disabled) return;
    if (design.bgColor === color) return;
    pushHistorySnapshot();
    design = { ...design, bgColor: color };
  }

  function undoLastChange() {
    if (disabled) return;
    const previous = designHistory[designHistory.length - 1];
    if (!previous) return;
    endStroke();
    design = cloneIconDesign({ ...previous, text: null });
    designHistory = designHistory.slice(0, -1);
  }

  function appendPointToCurrentStroke(point: IconPoint) {
    if (!drawingStroke) return;

    const lastPoint = drawingStroke.points[drawingStroke.points.length - 1];
    if (lastPoint && isSameRenderedPoint(lastPoint, point)) {
      return;
    }

    drawingStroke = {
      ...drawingStroke,
      points: [...drawingStroke.points, point],
    };
    syncDrawingStroke();
  }

  function syncDrawingStroke() {
    if (!drawingStroke) return;

    design = {
      ...design,
      strokes: [...design.strokes.slice(0, -1), cloneIconDesignStroke(drawingStroke)],
    };
  }

  function cloneIconDesignStroke(stroke: IconStroke): IconStroke {
    return {
      ...stroke,
      points: stroke.points.map((point) => ({ ...point })),
    };
  }

  function isSameRenderedPoint(a: IconPoint, b: IconPoint): boolean {
    return Math.abs(a.x - b.x) < 0.25 && Math.abs(a.y - b.y) < 0.25;
  }

  function lockUserSelection() {
    if (selectionLockCleanup || typeof document === "undefined") return;

    const rootStyle = document.documentElement.style;
    const bodyStyle = document.body?.style;
    const previousRootUserSelect = rootStyle.userSelect;
    const previousRootWebkitUserSelect = rootStyle.webkitUserSelect;
    const previousBodyUserSelect = bodyStyle?.userSelect ?? "";
    const previousBodyWebkitUserSelect = bodyStyle?.webkitUserSelect ?? "";

    rootStyle.userSelect = "none";
    rootStyle.webkitUserSelect = "none";
    if (bodyStyle) {
      bodyStyle.userSelect = "none";
      bodyStyle.webkitUserSelect = "none";
    }

    selectionLockCleanup = () => {
      rootStyle.userSelect = previousRootUserSelect;
      rootStyle.webkitUserSelect = previousRootWebkitUserSelect;
      if (bodyStyle) {
        bodyStyle.userSelect = previousBodyUserSelect;
        bodyStyle.webkitUserSelect = previousBodyWebkitUserSelect;
      }
      selectionLockCleanup = null;
    };
  }

  function unlockUserSelection() {
    selectionLockCleanup?.();
  }

  onDestroy(() => {
    endStroke();
  });
</script>

<div class="space-y-4">
  <div class="flex justify-center">
    <PlayerIcon player={previewPlayer} size={previewSize} designOverride={design} />
  </div>

  <div class="bg-gray-900/70 border border-gray-700 rounded-2xl p-4 space-y-4">
    <div class="text-xs text-gray-400">Tap for dots, drag for strokes</div>

    <div class="flex justify-center">
      <div
        bind:this={canvasEl}
        role="img"
        aria-label="Player icon drawing canvas"
        class="relative w-40 h-40 select-none sm:w-56 sm:h-56 rounded-full overflow-hidden border-2 border-white/10 shadow-inner touch-none"
        style="background:{design.bgColor};background-color:{design.bgColor};"
        on:pointerdown={startStroke}
        on:pointermove={moveStroke}
        on:pointerup={endStroke}
        on:pointercancel={endStroke}
        on:lostpointercapture={() => endStroke()}
        on:dragstart|preventDefault
        on:contextmenu|preventDefault
      >
        <svg class="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {#each design.strokes as stroke}
            {#if stroke.points.length === 1}
              <circle
                cx={stroke.points[0].x}
                cy={stroke.points[0].y}
                r={getIconStrokeRenderWidth(stroke.size) / 2}
                fill={stroke.color}
              />
            {:else}
              <polyline
                fill="none"
                stroke={stroke.color}
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width={getIconStrokeRenderWidth(stroke.size)}
                points={stroke.points.map((point) => `${point.x},${point.y}`).join(" ")}
              />
            {/if}
          {/each}
        </svg>
      </div>
    </div>

    <div class="space-y-2">
      <p class="text-xs text-gray-500 uppercase tracking-widest">Background</p>
      <div class="grid grid-cols-6 gap-2">
        {#each BG_COLORS as color}
          <button
            class="w-full aspect-square rounded-full border-2 {design.bgColor === color ? 'border-white scale-110' : 'border-transparent'}"
            style="background-color:{color};"
            on:click={() => setBackgroundColor(color)}
            disabled={disabled}
          ></button>
        {/each}
      </div>
    </div>

    <div class="space-y-2">
      <p class="text-xs text-gray-500 uppercase tracking-widest">Brush</p>
      <div class="flex gap-2 flex-wrap">
        {#each PALETTE as color}
          <button
            class="w-8 h-8 rounded-full border-2 {brushColor === color ? 'border-white scale-110' : 'border-gray-600'}"
            style="background-color:{color};"
            on:click={() => (brushColor = color)}
            disabled={disabled}
          ></button>
        {/each}
      </div>
      <input type="range" min="4" max="18" bind:value={brushSize} class="w-full" disabled={disabled} />
    </div>

    <div class="grid grid-cols-2 gap-2">
      <button class="py-2 rounded-xl bg-gray-800 text-gray-200 font-semibold active:bg-gray-700 disabled:text-gray-500" on:click={undoLastChange} disabled={disabled}>Undo</button>
      <button class="py-2 rounded-xl bg-gray-800 text-gray-200 font-semibold active:bg-gray-700 disabled:text-gray-500" on:click={resetDesign} disabled={disabled}>Reset</button>
    </div>
  </div>
</div>

<style>
  .select-none {
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
  }
</style>
