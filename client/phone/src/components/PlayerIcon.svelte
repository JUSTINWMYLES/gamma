<script lang="ts">
  import type { PlayerState } from "../../../shared/types";

  /** The player state to display the icon for. */
  export let player: PlayerState;

  /** Size in pixels (width = height). Defaults to 28. */
  export let size: number = 28;

  $: hasCustom = !!(player.iconEmoji || player.iconText);
  $: bgColor = player.iconBgColor || "#6366f1";
  $: fontSize = player.iconEmoji
    ? Math.round(size * 0.55)
    : Math.round(size * 0.42);
  $: displayText = player.iconEmoji
    || player.iconText
    || player.name?.charAt(0)?.toUpperCase()
    || "?";
  $: isEmoji = !!player.iconEmoji;
</script>

<span
  class="inline-flex items-center justify-center rounded-full flex-shrink-0 select-none"
  style="
    width: {size}px;
    height: {size}px;
    background-color: {bgColor};
    font-size: {fontSize}px;
    line-height: 1;
  "
  title={player.name}
>
  {#if isEmoji}
    <span class="leading-none">{displayText}</span>
  {:else}
    <span class="font-bold text-white leading-none tracking-tight">{displayText}</span>
  {/if}
</span>
