<script lang="ts">
  import type { PlayerState } from "../../../shared/types";
  import {
    DEFAULT_TEXT_COLOR,
    designFromPlayer,
    iconDesignHasVisibleContent,
  } from "../../../shared/playerIconDesign";

  export let player: PlayerState;
  export let size: number = 28;

  $: design = designFromPlayer(player);
  $: hasVisibleDesign = iconDesignHasVisibleContent(design);
  $: fallbackText = player.name?.charAt(0)?.toUpperCase() || "?";
  $: fontSize = Math.round(size * 0.4);

  function toPx(percent: number): number {
    return (percent / 100) * size;
  }

  function pointsToPath(points: Array<{ x: number; y: number }>): string {
    if (points.length === 0) return "";
    const [first, ...rest] = points;
    return `M ${toPx(first.x)} ${toPx(first.y)} ${rest.map((point) => `L ${toPx(point.x)} ${toPx(point.y)}`).join(" ")}`;
  }
</script>

<span
  class="relative inline-flex items-center justify-center rounded-full flex-shrink-0 overflow-hidden select-none border border-white/10 bg-gray-700"
  style="width:{size}px;height:{size}px;background-color:{design.bgColor};"
  title={player.name}
>
  {#if hasVisibleDesign}
    <svg class="absolute inset-0 w-full h-full" viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {#each design.strokes as stroke}
        <path
          d={pointsToPath(stroke.points)}
          fill="none"
          stroke={stroke.color}
          stroke-width={(stroke.size / 100) * size}
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      {/each}
    </svg>

    {#each design.stickers as sticker}
      <span
        class="absolute leading-none pointer-events-none"
        style="left:calc({sticker.x}% - {(sticker.size / 2 / 100) * size}px);top:calc({sticker.y}% - {(sticker.size / 2 / 100) * size}px);font-size:{(sticker.size / 100) * size}px;"
      >{sticker.emoji}</span>
    {/each}

    {#if design.text?.value}
      <span
        class="absolute font-black leading-none tracking-tight pointer-events-none whitespace-nowrap"
        style="left:{design.text.x}%;top:{design.text.y}%;transform:translate(-50%, -50%);font-size:{(design.text.size / 100) * size}px;color:{design.text.color || DEFAULT_TEXT_COLOR};text-shadow:0 1px 2px rgba(0,0,0,0.45);"
      >{design.text.value}</span>
    {/if}
  {:else}
    <span class="font-bold text-white leading-none tracking-tight" style="font-size:{fontSize}px;">{fallbackText}</span>
  {/if}
</span>
