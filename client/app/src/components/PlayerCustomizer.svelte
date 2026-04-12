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
    DEFAULT_TEXT_COLOR,
    DEFAULT_TEXT_SIZE,
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

  let design: IconDesign = designFromPlayer(me);
  let brushColor = DEFAULT_BRUSH_COLOR;
  let brushSize = 8;
  let textValue = design.text?.value ?? me?.iconText ?? "";
  let textColor = design.text?.color ?? DEFAULT_TEXT_COLOR;
  let textSize = design.text?.size ?? DEFAULT_TEXT_SIZE;
  let selectedEmoji = "😎";
  let placingEmoji = false;
  let drawingStroke: IconStroke | null = null;
  let canvasEl: HTMLDivElement | null = null;
  let pointerActive = false;
  let activePointerId: number | null = null;

  $: previewPlayer = {
    ...(me ?? {} as PlayerState),
    name: me?.name ?? "You",
    iconEmoji: "",
    iconText: "",
    iconBgColor: design.bgColor,
    iconDesign: serializeIconDesign({ ...design, text: textValue.trim() ? { value: textValue.trim().slice(0, 12), color: textColor, size: textSize, x: 50, y: 58 } : null }),
  } as PlayerState;

  function resetDesign() {
    design = createEmptyIconDesign(DEFAULT_ICON_BG);
    textValue = "";
    textColor = DEFAULT_TEXT_COLOR;
    textSize = DEFAULT_TEXT_SIZE;
    placingEmoji = false;
  }

  function startStroke(event: PointerEvent) {
    if (placingEmoji || !canvasEl) return;
    pointerActive = true;
    activePointerId = event.pointerId;
    canvasEl.setPointerCapture(event.pointerId);
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

  function undoStroke() {
    if (design.strokes.length === 0) return;
    design = { ...design, strokes: design.strokes.slice(0, -1) };
  }

  function removeLastSticker() {
    if (design.stickers.length === 0) return;
    design = { ...design, stickers: design.stickers.slice(0, -1) };
  }

  function saveCustomization() {
    const trimmedText = textValue.trim().slice(0, 12);
    const finalDesign: IconDesign = {
      ...design,
      bgColor: design.bgColor || DEFAULT_ICON_BG,
      text: trimmedText
        ? {
            value: trimmedText,
            color: textColor,
            size: textSize,
            x: 50,
            y: 58,
          }
        : null,
    };

    room.send("customize_player", {
      iconEmoji: "",
      iconText: trimmedText.slice(0, 3),
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
        class="relative w-56 h-56 rounded-full overflow-hidden border-2 border-white/10 shadow-inner bg-gray-800 touch-none"
        style="background-color:{design.bgColor}"
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

        {#if textValue.trim()}
          <span
            class="absolute font-black leading-none tracking-tight pointer-events-none whitespace-nowrap"
            style="left:50%;top:58%;transform:translate(-50%, -50%);font-size:{textSize}px;color:{textColor};text-shadow:0 1px 2px rgba(0,0,0,0.45);"
          >{textValue.trim().slice(0, 12)}</span>
        {/if}
      </div>
    </div>

    <div class="space-y-2">
      <p class="text-xs text-gray-500 uppercase tracking-widest">Background</p>
      <div class="grid grid-cols-6 gap-2">
        {#each BG_COLORS as color}
          <button
            class="w-full aspect-square rounded-full border-2 {design.bgColor === color ? 'border-white scale-110' : 'border-transparent'}"
            style="background-color:{color};"
            on:click={() => (design = { ...design, bgColor: color })}
          ></button>
        {/each}
      </div>
    </div>

    <div class="grid grid-cols-2 gap-3">
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
        <p class="text-xs text-gray-500 uppercase tracking-widest">Text</p>
        <input
          type="text"
          maxlength="12"
          bind:value={textValue}
          placeholder={me?.name?.slice(0, 8).toUpperCase() ?? "GAMMA"}
          class="w-full text-center text-sm font-black bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:border-indigo-500 focus:outline-none uppercase tracking-wider"
        />
        <div class="flex gap-2 flex-wrap">
          {#each PALETTE as color}
            <button
              class="w-7 h-7 rounded-full border-2 {textColor === color ? 'border-white scale-110' : 'border-gray-600'}"
              style="background-color:{color};"
              on:click={() => (textColor = color)}
            ></button>
          {/each}
        </div>
        <input type="range" min="14" max="36" bind:value={textSize} class="w-full" />
      </div>
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

    <div class="grid grid-cols-3 gap-2">
      <button class="py-2 rounded-xl bg-gray-800 text-gray-200 font-semibold active:bg-gray-700" on:click={undoStroke}>Undo Draw</button>
      <button class="py-2 rounded-xl bg-gray-800 text-gray-200 font-semibold active:bg-gray-700" on:click={removeLastSticker}>Undo Emoji</button>
      <button class="py-2 rounded-xl bg-gray-800 text-gray-200 font-semibold active:bg-gray-700" on:click={resetDesign}>Reset</button>
    </div>
  </div>

  <button
    class="w-full py-3 rounded-xl text-sm font-bold bg-indigo-600 text-white active:bg-indigo-500 transition-colors active:scale-[0.98]"
    on:click={saveCustomization}
  >Save Icon</button>
</div>
