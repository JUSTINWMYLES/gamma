<script lang="ts">
  import type { Room } from "colyseus.js";
  import type { PlayerState } from "../../../shared/types";
  import { createEventDispatcher } from "svelte";
  import PlayerIcon from "./PlayerIcon.svelte";
  import {
    createEmptyIconDesign,
    DEFAULT_BRUSH_COLOR,
    DEFAULT_ICON_BG,
    DEFAULT_STICKER_SIZE,
    designFromPlayer,
    MAX_ICON_STICKERS,
    serializeIconDesign,
    type IconDesign,
    type IconStroke,
  } from "../../../shared/playerIconDesign";

  export let room: Room;
  export let me: PlayerState | undefined;

  const dispatch = createEventDispatcher<{ done: void }>();

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
    "#8b5cf6",
    "#ef4444",
    "#0f172a",
    "#64748b",
    "#14b8a6",
    "#f43f5e",
  ];

  const EMOJI_ROWS = [
    ["😎", "🤠", "👻", "🦊", "🐸", "🤡"],
    ["🔥", "💀", "🎃", "👽", "🤖", "🦄"],
    ["🐶", "🐱", "🐻", "🐼", "🐵", "🦁"],
    ["⚡", "🌈", "🎵", "💎", "🍕", "🎮"],
    ["🏆", "🎯", "🚀", "💥", "🌊", "🍀"],
  ];

  type IconSource = {
    iconDesign?: string;
    iconEmoji?: string;
    iconText?: string;
    iconBgColor?: string;
  };

  function getInitialDesign(): IconDesign {
    const iconSource = me as IconSource | undefined;
    const playerDesign = me
      ? designFromPlayer({
          iconDesign: iconSource?.iconDesign ?? "",
          iconEmoji: iconSource?.iconEmoji ?? "",
          iconText: iconSource?.iconText ?? "",
          iconBgColor: iconSource?.iconBgColor ?? DEFAULT_ICON_BG,
        })
      : createEmptyIconDesign(DEFAULT_ICON_BG);
    return { ...playerDesign, text: null };
  }

  let design: IconDesign = getInitialDesign();
  let brushColor = DEFAULT_BRUSH_COLOR;
  let brushSize = 8;
  let selectedEmoji = "😎";
  let placingEmoji = false;
  let drawingStroke: IconStroke | null = null;
  let canvasEl: HTMLDivElement | null = null;
  let pointerActive = false;
  let activePointerId: number | null = null;
  let designHistory: IconDesign[] = [];

  $: previewPlayer = {
    ...(me ?? {} as PlayerState),
    name: me?.name ?? "You",
    iconEmoji: "",
    iconText: "",
    iconBgColor: design.bgColor,
    iconDesign: serializeIconDesign({ ...design, text: null }),
  } as PlayerState;

  function resetDesign() {
    design = createEmptyIconDesign(DEFAULT_ICON_BG);
    placingEmoji = false;
    designHistory = [];
  }

  function pushHistorySnapshot() {
    designHistory = [...designHistory, JSON.parse(serializeIconDesign({ ...design, text: null })) as IconDesign];
  }

  function startStroke(event: PointerEvent) {
    if (placingEmoji || !canvasEl) return;
    pointerActive = true;
    activePointerId = event.pointerId;
    canvasEl.setPointerCapture(event.pointerId);
    pushHistorySnapshot();
    const point = eventToPercent(event);
    drawingStroke = {
      color: brushColor,
      size: brushSize,
      points: [point],
    };
    design = { ...design, strokes: [...design.strokes, drawingStroke] };
  }

  function moveStroke(event: PointerEvent) {
    if (!pointerActive || activePointerId !== event.pointerId || !drawingStroke) return;
    drawingStroke.points = [...drawingStroke.points, eventToPercent(event)];
    design = {
      ...design,
      strokes: [...design.strokes.slice(0, -1), { ...drawingStroke }],
    };
  }

  function endStroke(event: PointerEvent) {
    if (activePointerId !== event.pointerId) return;
    pointerActive = false;
    activePointerId = null;
    drawingStroke = null;
  }

  function placeEmoji(event: PointerEvent) {
    if (!placingEmoji || !canvasEl) return;
    if (design.stickers.length >= MAX_ICON_STICKERS) return;
    pushHistorySnapshot();
    const point = eventToPercent(event);
    design = {
      ...design,
      stickers: [...design.stickers, {
        emoji: selectedEmoji,
        x: point.x,
        y: point.y,
        size: DEFAULT_STICKER_SIZE,
      }],
    };
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

  function toggleEmojiPlacement(emoji: string) {
    selectedEmoji = emoji;
    placingEmoji = true;
  }

  function stopEmojiPlacement() {
    placingEmoji = false;
  }

  function setBackgroundColor(color: string) {
    if (design.bgColor === color) return;
    pushHistorySnapshot();
    design = { ...design, bgColor: color };
  }

  function undoLastChange() {
    const previous = designHistory[designHistory.length - 1];
    if (!previous) return;
    design = { ...previous, text: null };
    designHistory = designHistory.slice(0, -1);
  }

  function saveCustomization() {
    const finalDesign: IconDesign = {
      ...design,
      bgColor: design.bgColor || DEFAULT_ICON_BG,
      text: null,
    };

    room.send("customize_player", {
      iconEmoji: "",
      iconText: "",
      iconBgColor: finalDesign.bgColor,
      iconDesign: serializeIconDesign(finalDesign),
    });
    dispatch("done");
  }
</script>

<div class="w-full max-w-sm mx-auto space-y-4">
  <p class="text-center text-xs text-gray-400 uppercase tracking-widest font-semibold">Design Your Icon</p>

  <div class="flex justify-center">
    <PlayerIcon player={previewPlayer} size={96} />
  </div>

  <div class="bg-gray-900/70 border border-gray-700 rounded-2xl p-4 space-y-4">
    <div class="flex items-center justify-between text-xs text-gray-400">
      <span>{placingEmoji ? `Tap canvas to place ${selectedEmoji}` : "Draw directly in the circle"}</span>
      <button class="text-gray-300 hover:text-white" on:click={stopEmojiPlacement}>Draw mode</button>
    </div>

    <div class="flex justify-center">
      <div
        bind:this={canvasEl}
        class="relative w-56 h-56 rounded-full overflow-hidden border-2 border-white/10 shadow-inner touch-none"
        style="background:{design.bgColor};background-color:{design.bgColor};"
        on:pointerdown={(event) => placingEmoji ? placeEmoji(event) : startStroke(event)}
        on:pointermove={moveStroke}
        on:pointerup={endStroke}
        on:pointercancel={endStroke}
        on:pointerleave={endStroke}
      >
        <svg class="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {#each design.strokes as stroke}
            <polyline
              fill="none"
              stroke={stroke.color}
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width={stroke.size / 4}
              points={stroke.points.map((point) => `${point.x},${point.y}`).join(" ")}
            />
          {/each}
        </svg>

        {#each design.stickers as sticker}
          <span
            class="absolute leading-none pointer-events-none"
            style="left:calc({sticker.x}% - {sticker.size / 2}px);top:calc({sticker.y}% - {sticker.size / 2}px);font-size:{sticker.size}px;"
          >{sticker.emoji}</span>
        {/each}
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
          ></button>
        {/each}
      </div>
      <input type="range" min="4" max="18" bind:value={brushSize} class="w-full" />
    </div>

    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <p class="text-xs text-gray-500 uppercase tracking-widest">Emoji Stickers</p>
        <span class="text-[11px] text-gray-500">{design.stickers.length}/{MAX_ICON_STICKERS}</span>
      </div>
      <div class="grid grid-cols-6 gap-1.5">
        {#each EMOJI_ROWS.flat() as emoji}
          <button
            class="aspect-square rounded-lg text-2xl flex items-center justify-center transition-all {selectedEmoji === emoji && placingEmoji ? 'bg-indigo-600 scale-110 shadow-lg shadow-indigo-600/40' : 'bg-gray-800 active:bg-gray-700'}"
            on:click={() => toggleEmojiPlacement(emoji)}
          >{emoji}</button>
        {/each}
      </div>
    </div>

    <div class="grid grid-cols-2 gap-2">
      <button class="py-2 rounded-xl bg-gray-800 text-gray-200 font-semibold active:bg-gray-700" on:click={undoLastChange}>Undo</button>
      <button class="py-2 rounded-xl bg-gray-800 text-gray-200 font-semibold active:bg-gray-700" on:click={resetDesign}>Reset</button>
    </div>
  </div>

  <button
    class="w-full py-3 rounded-xl text-sm font-bold bg-indigo-600 text-white active:bg-indigo-500 transition-colors active:scale-[0.98]"
    on:click={saveCustomization}
  >Save Icon</button>
</div>
