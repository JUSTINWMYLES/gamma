<script lang="ts">
  /**
   * GameShelf.svelte
   *
   * Bookshelf-style game selection display. Games appear as book spines
   * on wooden shelves with hover tooltips. Based on shelf.html prototype.
   */
  import type { GameMeta, RoomState } from "../../../shared/types";
  import { GAME_REGISTRY, getGameUnavailableReason } from "../../../shared/types";
  import { createEventDispatcher } from "svelte";

  export let state: RoomState;
  export let readonly = false;

  const dispatch = createEventDispatcher<{
    select: { gameId: string };
  }>();

  /** Spine theme per game ID */
  const SPINE_THEMES: Record<string, {
    icon: string; c1: string; c2: string; c3: string; tc: string;
    width: number; height: number;
  }> = {
    "registry-03-tap-speed": {
      icon: "\u26A1", c1: "#1a0500", c2: "#3d0e00", c3: "#f97316", tc: "#ffe0c0",
      width: 50, height: 185,
    },
    "registry-04-escape-maze": {
      icon: "\uD83C\uDFDB\uFE0F", c1: "#0a1a08", c2: "#1a3a10", c3: "#4ade80", tc: "#c0ffcc",
      width: 48, height: 192,
    },
    "registry-06-sound-replication": {
      icon: "\uD83C\uDFA4", c1: "#10001a", c2: "#280040", c3: "#e879f9", tc: "#ffd0ff",
      width: 54, height: 178,
    },
    "registry-07-hot-potato": {
      icon: "\uD83D\uDD25", c1: "#1a0a30", c2: "#3d1060", c3: "#c084fc", tc: "#e8d0ff",
      width: 48, height: 185,
    },
    "registry-14-dont-get-caught": {
      icon: "\uD83D\uDD75\uFE0F", c1: "#080808", c2: "#181818", c3: "#a3a3a3", tc: "#e0e0e0",
      width: 50, height: 182,
    },
    "registry-17-fire-match-blow-shake": {
      icon: "\uD83D\uDD25", c1: "#1a1200", c2: "#3d2e00", c3: "#f59e0b", tc: "#fff3b0",
      width: 56, height: 170,
    },
    "registry-19-shave-the-yak": {
      icon: "\u2702\uFE0F", c1: "#001a12", c2: "#003828", c3: "#34d399", tc: "#b0ffe0",
      width: 46, height: 186,
    },
    "registry-20-odd-one-out": {
      icon: "\uD83D\uDC41\uFE0F", c1: "#1a0010", c2: "#3d0028", c3: "#fb7185", tc: "#ffc0cc",
      width: 52, height: 190,
    },
    "registry-25-lowball-marketplace": {
      icon: "\uD83D\uDCB0", c1: "#1a1000", c2: "#3d2800", c3: "#eab308", tc: "#fff0a0",
      width: 58, height: 172,
    },
    "registry-26-evil-laugh-overlay": {
      icon: "\uD83D\uDE08", c1: "#001a2e", c2: "#003d5c", c3: "#22d3ee", tc: "#b0f0ff",
      width: 44, height: 195,
    },
  };

  const DEFAULT_SPINE = {
    icon: "\uD83C\uDFAE", c1: "#080808", c2: "#181818", c3: "#a3a3a3", tc: "#e0e0e0",
    width: 48, height: 150,
  };

  function getSpine(id: string) {
    return SPINE_THEMES[id] ?? DEFAULT_SPINE;
  }

  // Split games into shelf rows of ~5 each
  function chunk<T>(arr: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      result.push(arr.slice(i, i + size));
    }
    return result;
  }

  $: rows = chunk(GAME_REGISTRY, 5);

  /** Track which book index within its row, for left/right tooltip clamping */
  function getTooltipAlign(bookIdx: number, rowLength: number): string {
    if (bookIdx === 0) return "left";
    if (bookIdx === rowLength - 1) return "right";
    return "center";
  }

  function handleClick(game: GameMeta, unavailable: string | null) {
    if (readonly || unavailable) return;
    dispatch("select", { gameId: game.id });
  }
</script>

<div class="shelving-unit">
  {#each rows as row, rowIdx}
    <div class="shelf-row">
      <div class="books">
        {#each row as game, bookIdx (game.id)}
          {@const spine = getSpine(game.id)}
          {@const unavailable = getGameUnavailableReason(game, state)}
          {@const selected = state.selectedGame === game.id}
          {@const tooltipAlign = getTooltipAlign(bookIdx, row.length)}
          <button
            class="game-box"
            class:unavailable={!!unavailable}
            class:selected
            class:readonly
            class:tooltip-below={rowIdx === 0}
            style="--c1:{spine.c1};--c2:{spine.c2};--c3:{spine.c3};--tc:{spine.tc};"
            on:click={() => handleClick(game, unavailable)}
            disabled={!!unavailable || readonly}
          >
            <div class="spine" style="width:{spine.width}px;height:{spine.height}px">
              <span class="spine-icon">{spine.icon}</span>
              <span class="spine-title">{game.label}</span>
              <span class="player-count">{game.minPlayers}–{game.maxPlayers}</span>
            </div>
            <div class="box-tooltip tooltip-{tooltipAlign}">
              <h3>{game.label}</h3>
              <p>{game.description}</p>
              <div class="meta">
                <span class="tag">{game.minPlayers}–{game.maxPlayers} players</span>
                {#if game.tags.length > 0}
                  <span class="tag">{game.tags[0]}</span>
                {/if}
              </div>
              {#if unavailable}
                <p class="unavailable-note">{unavailable}</p>
              {/if}
            </div>
          </button>
        {/each}
      </div>
      <div class="shelf-plank"></div>
    </div>
  {/each}
</div>

<style>
  .shelving-unit {
    max-width: 900px;
    width: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .shelf-row {
    position: relative;
    margin-bottom: 40px;
  }

  .books {
    display: flex;
    align-items: flex-end;
    flex-wrap: wrap;
    gap: 6px;
    padding: 0 18px 0 24px;
    min-height: 170px;
  }

  .shelf-plank {
    position: relative;
    height: 24px;
    background: linear-gradient(180deg, #8b5a28 0%, #6b3f18 35%, #4e2d0f 70%, #3a2008 100%);
    border-radius: 2px;
    box-shadow: 0 6px 24px rgba(0,0,0,0.7), 0 2px 0px #b07030 inset, 0 -1px 0px #2a1505 inset;
    margin-top: 4px;
  }

  .game-box {
    position: relative;
    cursor: pointer;
    flex-shrink: 0;
    transition: transform 0.25s cubic-bezier(.2,.8,.3,1.2);
    transform-origin: bottom center;
    border: none;
    background: transparent;
    padding: 0;
    color: inherit;
    text-align: left;
  }

  .game-box:not(.unavailable):not(.readonly):hover {
    transform: translateY(-14px) scale(1.04);
    z-index: 10;
  }

  .game-box.unavailable {
    opacity: 0.35;
    cursor: not-allowed;
    filter: grayscale(0.5);
  }

  .game-box.selected .spine {
    box-shadow: 0 0 0 2px #818cf8, 3px 0 8px rgba(0,0,0,0.5), inset -3px 0 8px rgba(0,0,0,0.25);
  }

  .spine {
    position: relative;
    border-radius: 3px 3px 0 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    padding: 10px 6px;
    overflow: hidden;
    background: linear-gradient(135deg, var(--c1) 0%, var(--c2) 100%);
    border-top: 3px solid var(--c3);
    box-shadow: 3px 0 8px rgba(0,0,0,0.5), inset -3px 0 8px rgba(0,0,0,0.25), inset 2px 0 4px rgba(255,255,255,0.08);
  }

  .spine-title {
    writing-mode: vertical-rl;
    text-orientation: mixed;
    transform: rotate(180deg);
    font-weight: 700;
    font-size: 0.72rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-height: 90%;
    color: var(--tc);
  }

  .spine-icon {
    font-size: 1rem;
    margin-top: 4px;
    flex-shrink: 0;
    color: var(--c3);
  }

  .player-count {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    font-size: 0.5rem;
    letter-spacing: 0.06em;
    opacity: 0.7;
    flex-shrink: 0;
    color: var(--c3);
  }

  .box-tooltip {
    position: absolute;
    bottom: calc(100% + 12px);
    left: 50%;
    transform: translateX(-50%) scale(0.9);
    width: 160px;
    background: #1e1008;
    border: 1px solid rgba(200,160,60,0.3);
    border-radius: 6px;
    padding: 12px;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.18s, transform 0.18s;
    z-index: 20;
    box-shadow: 0 8px 32px rgba(0,0,0,0.7);
  }

  /* Align tooltip to left edge for leftmost books */
  .box-tooltip.tooltip-left {
    left: 0;
    transform: translateX(0) scale(0.9);
  }

  /* Align tooltip to right edge for rightmost books */
  .box-tooltip.tooltip-right {
    left: auto;
    right: 0;
    transform: translateX(0) scale(0.9);
  }

  /* Top-row books: show tooltip below the spine instead of above */
  .tooltip-below .box-tooltip {
    bottom: auto;
    top: calc(100% + 12px);
  }

  .game-box:hover .box-tooltip {
    opacity: 1;
    transform: translateX(-50%) scale(1);
  }

  .game-box:hover .box-tooltip.tooltip-left {
    transform: translateX(0) scale(1);
  }

  .game-box:hover .box-tooltip.tooltip-right {
    transform: translateX(0) scale(1);
  }

  .box-tooltip h3 {
    font-size: 0.8rem;
    font-weight: 700;
    color: #e8c87a;
    margin-bottom: 4px;
  }

  .box-tooltip p {
    font-size: 0.68rem;
    color: rgba(220,180,100,0.6);
    line-height: 1.4;
  }

  .box-tooltip .meta {
    margin-top: 8px;
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .box-tooltip .tag {
    font-size: 0.6rem;
    padding: 2px 6px;
    border-radius: 99px;
    background: rgba(200,140,30,0.15);
    color: rgba(220,180,100,0.7);
    border: 1px solid rgba(200,140,30,0.2);
  }

  .unavailable-note {
    margin-top: 6px;
    font-size: 0.6rem;
    color: rgba(255,100,100,0.7);
  }
</style>
