<script lang="ts">
  /**
   * GameCardGrid.svelte
   *
   * Cards-style game selection grid. Each game gets a themed visual card
   * with gradient backgrounds, icons, player counts, and tags.
   * Based on cards.html prototype but softer in general view.
   */
  import type { GameMeta, RoomState } from "../../../shared/types";
  import { GAME_REGISTRY, getGameUnavailableReason } from "../../../shared/types";
  import { createEventDispatcher } from "svelte";

  export let state: RoomState;
  export let readonly = false;

  const dispatch = createEventDispatcher<{
    select: { gameId: string };
  }>();

  /** Theme mapping per game ID — maps to card visual styles. */
  const CARD_THEMES: Record<string, {
    icon: string;
    theme: string;
    bg: string;
    glow: string;
    footerBg: string;
    border: string;
    nameColor: string;
    metaColor: string;
  }> = {
    "registry-03-tap-speed": {
      icon: "zap", theme: "lava",
      bg: "radial-gradient(ellipse at 50% 100%, #3d0e00, #0d0200)",
      glow: "rgba(255,120,0,0.4)",
      footerBg: "#100300", border: "rgba(255,80,0,0.25)",
      nameColor: "#ff6020", metaColor: "rgba(255,120,60,0.6)",
    },
    "registry-04-escape-maze": {
      icon: "maze", theme: "forest",
      bg: "radial-gradient(ellipse at 50% 60%, #0a200a, #040a03)",
      glow: "rgba(40,140,40,0.4)",
      footerBg: "#050e04", border: "rgba(60,180,60,0.2)",
      nameColor: "#70e870", metaColor: "rgba(100,220,100,0.6)",
    },
    "registry-06-sound-replication": {
      icon: "audio", theme: "arcane",
      bg: "radial-gradient(ellipse at 50% 50%, #1a0030, #06000e)",
      glow: "rgba(160,40,220,0.4)",
      footerBg: "#0a0015", border: "rgba(180,0,255,0.25)",
      nameColor: "#d080ff", metaColor: "rgba(180,100,255,0.6)",
    },
    "registry-07-hot-potato": {
      icon: "fire", theme: "dragon",
      bg: "radial-gradient(ellipse at 50% 80%, #3d0a00, #0d0302)",
      glow: "rgba(180,60,0,0.4)",
      footerBg: "#1a0500", border: "rgba(255,80,0,0.2)",
      nameColor: "#ff9050", metaColor: "rgba(255,140,80,0.6)",
    },
    "registry-14-dont-get-caught": {
      icon: "stealth", theme: "shadow",
      bg: "#050505",
      glow: "rgba(0,0,0,0.6)",
      footerBg: "#080808", border: "rgba(180,180,180,0.1)",
      nameColor: "#c8c8c8", metaColor: "rgba(160,160,160,0.5)",
    },
    "registry-17-fire-match-blow-shake": {
      icon: "flame", theme: "treasure",
      bg: "linear-gradient(180deg, #1e1500, #0e0a00)",
      glow: "rgba(180,130,0,0.35)",
      footerBg: "#1a1200", border: "rgba(200,150,20,0.2)",
      nameColor: "#f0c040", metaColor: "rgba(220,180,80,0.6)",
    },
    "registry-19-shave-the-yak": {
      icon: "scissors", theme: "mint",
      bg: "radial-gradient(ellipse at 50% 80%, #001e10, #000a06)",
      glow: "rgba(0,160,100,0.35)",
      footerBg: "#000e07", border: "rgba(0,180,120,0.2)",
      nameColor: "#40f0a0", metaColor: "rgba(60,220,140,0.6)",
    },
    "registry-20-odd-one-out": {
      icon: "eye", theme: "rose",
      bg: "radial-gradient(ellipse at 50% 50%, #200010, #08000a)",
      glow: "rgba(180,20,80,0.4)",
      footerBg: "#0e0008", border: "rgba(220,40,100,0.2)",
      nameColor: "#f060a0", metaColor: "rgba(240,80,140,0.6)",
    },
    "registry-25-lowball-marketplace": {
      icon: "money", theme: "treasure",
      bg: "linear-gradient(180deg, #1e1500, #0e0a00)",
      glow: "rgba(180,130,0,0.35)",
      footerBg: "#1a1200", border: "rgba(200,150,20,0.2)",
      nameColor: "#f0c040", metaColor: "rgba(220,180,80,0.6)",
    },
    "registry-26-evil-laugh-overlay": {
      icon: "laugh", theme: "space",
      bg: "#020408",
      glow: "rgba(60,80,200,0.35)",
      footerBg: "#020408", border: "rgba(80,120,255,0.2)",
      nameColor: "#80a8ff", metaColor: "rgba(100,140,255,0.6)",
    },
  };

  const ICON_MAP: Record<string, string> = {
    zap: "\u26A1", fire: "\uD83D\uDD25", flame: "\uD83D\uDD25",
    stealth: "\uD83D\uDD75\uFE0F", scissors: "\u2702\uFE0F",
    eye: "\uD83D\uDC41\uFE0F", money: "\uD83D\uDCB0",
    laugh: "\uD83D\uDE08", audio: "\uD83C\uDFA4",
    maze: "\uD83C\uDFDB\uFE0F",
  };

  function getTheme(id: string) {
    return CARD_THEMES[id] ?? {
      icon: "default", theme: "shadow",
      bg: "#050505", glow: "rgba(0,0,0,0.4)",
      footerBg: "#080808", border: "rgba(180,180,180,0.1)",
      nameColor: "#c8c8c8", metaColor: "rgba(160,160,160,0.5)",
    };
  }

  function handleClick(game: GameMeta, unavailable: string | null) {
    if (readonly || unavailable) return;
    dispatch("select", { gameId: game.id });
  }
</script>

<div class="card-grid">
  {#each GAME_REGISTRY as game (game.id)}
    {@const theme = getTheme(game.id)}
    {@const unavailable = getGameUnavailableReason(game, state)}
    {@const selected = state.selectedGame === game.id}
    <button
      class="card"
      class:selected
      class:unavailable={!!unavailable}
      class:readonly
      style="--glow: {theme.glow}; --footer-bg: {theme.footerBg}; --border-color: {theme.border}; --name-color: {theme.nameColor}; --meta-color: {theme.metaColor};"
      on:click={() => handleClick(game, unavailable)}
      disabled={!!unavailable || readonly}
    >
      <div class="card-art" style="background: {theme.bg}">
        <span class="card-icon">{ICON_MAP[theme.icon] ?? "\uD83C\uDFAE"}</span>
      </div>
      <div class="card-footer">
        <span class="card-name">{game.label}</span>
        <p class="card-desc">{game.description}</p>
        <div class="card-meta">
          <span>{game.minPlayers}–{game.maxPlayers} players</span>
          {#if game.tags.length > 0}
            <span class="card-tag">{game.tags[0]}</span>
          {/if}
        </div>
      </div>
      {#if unavailable}
        <div class="card-overlay">
          <span class="card-unavailable-text">{unavailable}</span>
        </div>
      {/if}
      {#if selected}
        <div class="card-selected-ring"></div>
      {/if}
    </button>
  {/each}
</div>

<style>
  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 16px;
    max-width: 1000px;
    width: 100%;
  }

  .card {
    border-radius: 12px;
    overflow: hidden;
    cursor: pointer;
    transition: transform 0.3s cubic-bezier(.2,.8,.3,1.2), box-shadow 0.3s;
    position: relative;
    display: flex;
    flex-direction: column;
    box-shadow: 0 6px 30px var(--glow);
    border: none;
    padding: 0;
    text-align: left;
    color: inherit;
    background: transparent;
  }

  .card:not(.unavailable):not(.readonly):hover {
    transform: translateY(-6px) scale(1.02);
    box-shadow: 0 16px 50px var(--glow);
  }

  .card:not(.unavailable):not(.readonly):active {
    transform: scale(0.97);
  }

  .card.unavailable {
    opacity: 0.4;
    cursor: not-allowed;
    filter: grayscale(0.5);
  }

  .card.readonly {
    cursor: default;
  }

  .card-art {
    flex: 0 0 80px;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .card-icon {
    font-size: 2.5rem;
    z-index: 1;
    filter: drop-shadow(0 0 16px var(--glow));
  }

  .card-footer {
    padding: 10px 12px 12px;
    position: relative;
    z-index: 2;
    background: var(--footer-bg);
    border-top: 1px solid var(--border-color);
  }

  .card-name {
    display: block;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--name-color);
    margin-bottom: 2px;
    letter-spacing: 0.04em;
  }

  .card-desc {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-size: 0.6rem;
    line-height: 1.35;
    color: var(--meta-color);
    margin-bottom: 4px;
  }

  .card-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.65rem;
    color: var(--meta-color);
  }

  .card-tag {
    font-size: 0.6rem;
    padding: 1px 6px;
    border-radius: 99px;
    border: 1px solid currentColor;
    opacity: 0.7;
  }

  .card-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 5;
    border-radius: 12px;
  }

  .card-unavailable-text {
    font-size: 0.7rem;
    color: rgba(255,255,255,0.7);
    text-align: center;
    padding: 8px;
  }

  .card-selected-ring {
    position: absolute;
    inset: -2px;
    border: 3px solid #818cf8;
    border-radius: 14px;
    z-index: 6;
    box-shadow: 0 0 20px rgba(129,140,248,0.4);
    pointer-events: none;
  }
</style>
