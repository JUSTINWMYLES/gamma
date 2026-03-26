<script lang="ts">
  import type { Room } from "colyseus.js";
  import type { PlayerState } from "../../../shared/types";
  import { createEventDispatcher } from "svelte";

  export let room: Room;
  export let me: PlayerState | undefined;

  const dispatch = createEventDispatcher<{ done: void }>();

  // ── State ────────────────────────────────────────────────────────────────
  let selectedEmoji = me?.iconEmoji || "";
  let selectedText = me?.iconText || "";
  let selectedColor = me?.iconBgColor || "#6366f1";
  let mode: "emoji" | "text" = selectedText && !selectedEmoji ? "text" : "emoji";

  // ── Emoji grid — curated fun set ─────────────────────────────────────────
  const EMOJI_ROWS = [
    ["😎", "🤠", "👻", "🦊", "🐸", "🤡"],
    ["🔥", "💀", "🎃", "👽", "🤖", "🦄"],
    ["🐶", "🐱", "🐻", "🐼", "🐵", "🦁"],
    ["⚡", "🌈", "🎵", "💎", "🍕", "🎮"],
    ["🏆", "🎯", "🚀", "💥", "🌊", "🍀"],
  ];

  // ── Color presets ────────────────────────────────────────────────────────
  const COLOR_PRESETS = [
    { color: "#6366f1", label: "Indigo" },
    { color: "#ec4899", label: "Pink" },
    { color: "#f97316", label: "Orange" },
    { color: "#eab308", label: "Yellow" },
    { color: "#22c55e", label: "Green" },
    { color: "#06b6d4", label: "Cyan" },
    { color: "#8b5cf6", label: "Violet" },
    { color: "#ef4444", label: "Red" },
    { color: "#64748b", label: "Slate" },
    { color: "#f43f5e", label: "Rose" },
    { color: "#14b8a6", label: "Teal" },
    { color: "#a855f7", label: "Purple" },
  ];

  // ── Derived display ──────────────────────────────────────────────────────
  $: displayContent = mode === "emoji"
    ? (selectedEmoji || "?")
    : (selectedText || (me?.name?.slice(0, 2).toUpperCase() ?? "?"));

  $: isEmoji = mode === "emoji";

  // ── Actions ──────────────────────────────────────────────────────────────
  function pickEmoji(emoji: string) {
    selectedEmoji = emoji;
    selectedText = "";
    mode = "emoji";
  }

  function switchToText() {
    mode = "text";
    selectedEmoji = "";
    if (!selectedText && me?.name) {
      selectedText = me.name.slice(0, 2).toUpperCase();
    }
  }

  function switchToEmoji() {
    mode = "emoji";
    selectedText = "";
  }

  function sendCustomization() {
    const payload: { iconEmoji: string; iconText: string; iconBgColor: string } = {
      iconEmoji: mode === "emoji" ? selectedEmoji : "",
      iconText: mode === "text" ? selectedText.slice(0, 3) : "",
      iconBgColor: selectedColor,
    };
    room.send("customize_player", payload);
    dispatch("done");
  }

  function handleTextInput(e: Event) {
    const input = e.target as HTMLInputElement;
    selectedText = input.value.slice(0, 3).toUpperCase();
  }
</script>

<div class="w-full max-w-xs mx-auto space-y-4">
  <!-- Section header -->
  <p class="text-center text-xs text-gray-400 uppercase tracking-widest font-semibold">Your Icon</p>

  <!-- Preview circle -->
  <div class="flex justify-center">
    <div
      class="w-20 h-20 rounded-full flex items-center justify-center shadow-lg shadow-black/30 transition-colors duration-200 border-2 border-white/10"
      style="background-color: {selectedColor}"
    >
      {#if isEmoji}
        <span class="text-4xl select-none leading-none">{displayContent}</span>
      {:else}
        <span class="text-2xl font-black text-white select-none leading-none tracking-tight">{displayContent}</span>
      {/if}
    </div>
  </div>

  <!-- Mode toggle: emoji vs text -->
  <div class="flex items-center gap-1 bg-gray-800 rounded-lg p-1 mx-auto w-fit">
    <button
      class="px-4 py-1.5 text-xs font-semibold rounded-md transition-colors
        {mode === 'emoji' ? 'bg-indigo-600 text-white' : 'text-gray-400 active:text-white'}"
      on:click={switchToEmoji}
    >Emoji</button>
    <button
      class="px-4 py-1.5 text-xs font-semibold rounded-md transition-colors
        {mode === 'text' ? 'bg-indigo-600 text-white' : 'text-gray-400 active:text-white'}"
      on:click={switchToText}
    >Initials</button>
  </div>

  <!-- Emoji picker OR text input -->
  {#if mode === "emoji"}
    <div class="bg-gray-800/50 rounded-xl p-3 space-y-2">
      {#each EMOJI_ROWS as row}
        <div class="grid grid-cols-6 gap-1.5">
          {#each row as emoji}
            <button
              class="w-full aspect-square rounded-lg text-2xl flex items-center justify-center transition-all
                {selectedEmoji === emoji
                  ? 'bg-indigo-600 scale-110 shadow-lg shadow-indigo-600/40'
                  : 'bg-gray-700/50 active:bg-gray-600 active:scale-95'}"
              on:click={() => pickEmoji(emoji)}
            >{emoji}</button>
          {/each}
        </div>
      {/each}
    </div>
  {:else}
    <div class="bg-gray-800/50 rounded-xl p-4 flex flex-col items-center gap-3">
      <p class="text-xs text-gray-400">Enter 1-3 characters</p>
      <input
        type="text"
        maxlength="3"
        value={selectedText}
        on:input={handleTextInput}
        placeholder="AB"
        class="w-24 text-center text-2xl font-black bg-gray-700 text-white rounded-lg px-3 py-2
               border-2 border-gray-600 focus:border-indigo-500 focus:outline-none transition-colors
               placeholder:text-gray-500 uppercase tracking-wider"
      />
    </div>
  {/if}

  <!-- Color picker -->
  <div class="space-y-1.5">
    <p class="text-center text-xs text-gray-500">Color</p>
    <div class="grid grid-cols-6 gap-2 px-2">
      {#each COLOR_PRESETS as preset}
        <button
          class="w-full aspect-square rounded-full transition-all border-2
            {selectedColor === preset.color
              ? 'border-white scale-110 shadow-lg'
              : 'border-transparent active:scale-95 opacity-80 hover:opacity-100'}"
          style="background-color: {preset.color}; {selectedColor === preset.color ? `box-shadow: 0 0 12px ${preset.color}80;` : ''}"
          title={preset.label}
          on:click={() => (selectedColor = preset.color)}
        ></button>
      {/each}
    </div>
  </div>

  <!-- Done button -->
  <button
    class="w-full py-3 rounded-xl text-sm font-bold bg-indigo-600 text-white active:bg-indigo-500 transition-colors active:scale-[0.98]"
    on:click={sendCustomization}
  >Done</button>
</div>
