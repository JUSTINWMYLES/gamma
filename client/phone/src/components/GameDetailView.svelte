<script lang="ts">
  /**
   * GameDetailView.svelte
   *
   * Full-page game detail/summary overlay. Shows when a user taps a game
   * card in the lobby. Displays:
   *   - Game SVG art (large)
   *   - Title, description, detailed description
   *   - Tags, player count, estimated playtime
   *   - Placeholder for future image/video/GIF content
   *   - Back button to return to lobby
   *   - Select button (host only)
   */
  import type { GameMeta } from "../../../shared/types";
  import { createEventDispatcher } from "svelte";
  import GameCardArt from "./GameCardArt.svelte";

  export let game: GameMeta;
  export let accent: string = "#818cf8";
  export let artBg: string = "#050505";
  export let isHost: boolean = false;
  export let isSelected: boolean = false;
  export let unavailableReason: string | null = null;

  const dispatch = createEventDispatcher<{
    back: void;
    select: { gameId: string };
  }>();

  const ACTIVITY_LABELS: Record<string, string> = {
    none: "No movement",
    some: "Some movement",
    full: "Full movement",
  };
</script>

<div class="detail-overlay" on:click|self={() => dispatch("back")}>
  <div class="detail-card">
    <!-- Back button -->
    <button class="back-btn" on:click={() => dispatch("back")}>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M13 4L7 10L13 16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Back
    </button>

    <!-- Hero art area -->
    <div class="detail-art" style="background: {artBg}">
      <GameCardArt gameId={game.id} {accent} />
    </div>

    <!-- Content -->
    <div class="detail-content">
      <h1 class="detail-title" style="color: {accent}">{game.label}</h1>

      <!-- Tags row -->
      <div class="detail-tags">
        {#each game.tags as tag}
          <span class="detail-tag" style="border-color: {accent}; color: {accent}">{tag}</span>
        {/each}
      </div>

      <!-- Metadata row -->
      <div class="detail-meta">
        <div class="meta-item">
          <span class="meta-label">Players</span>
          <span class="meta-value">{game.minPlayers}–{game.maxPlayers}</span>
        </div>
        <div class="meta-divider"></div>
        <div class="meta-item">
          <span class="meta-label">Playtime</span>
          <span class="meta-value">~{game.estimatedMinutes} min</span>
        </div>
        <div class="meta-divider"></div>
        <div class="meta-item">
          <span class="meta-label">Activity</span>
          <span class="meta-value">{ACTIVITY_LABELS[game.activityLevel] ?? game.activityLevel}</span>
        </div>
      </div>

      <!-- Requirements -->
      <div class="detail-requirements">
        {#if game.requiresSameRoom}
          <span class="req-badge req-same-room">Same room required</span>
        {/if}
        {#if game.requiresSecondaryDisplay}
          <span class="req-badge req-display">TV/display required</span>
        {/if}
        {#if !game.requiresSameRoom && !game.requiresSecondaryDisplay}
          <span class="req-badge req-none">No special requirements</span>
        {/if}
      </div>

      <!-- Short description -->
      <p class="detail-desc">{game.description}</p>

      <!-- Long description -->
      <p class="detail-long-desc">{game.detailDescription}</p>

      <!-- Media placeholder -->
      <div class="detail-media-placeholder">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <rect x="2" y="5" width="28" height="22" rx="3" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>
          <polygon points="12,12 22,16 12,20" fill="currentColor" opacity="0.2"/>
        </svg>
        <span>Gameplay preview coming soon</span>
      </div>

      <!-- Action buttons -->
      {#if unavailableReason}
        <div class="detail-unavailable">
          <p>{unavailableReason}</p>
        </div>
      {:else if isHost}
        <button
          class="detail-select-btn"
          class:selected={isSelected}
          style="background: {isSelected ? accent : ''}"
          on:click={() => dispatch("select", { gameId: game.id })}
        >
          {isSelected ? "Selected" : "Select This Game"}
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  .detail-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    overflow-y: auto;
    animation: fade-in 0.2s ease-out;
  }

  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .detail-card {
    background: #111118;
    border-radius: 16px;
    width: 100%;
    max-width: 420px;
    max-height: 90vh;
    overflow-y: auto;
    position: relative;
    animation: slide-up 0.25s ease-out;
    border: 1px solid rgba(255, 255, 255, 0.06);
  }

  @keyframes slide-up {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .back-btn {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 4px;
    background: rgba(0, 0, 0, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.7);
    padding: 6px 12px 6px 8px;
    border-radius: 8px;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    backdrop-filter: blur(8px);
  }

  .back-btn:hover {
    background: rgba(0, 0, 0, 0.8);
    color: white;
  }

  .detail-art {
    width: 100%;
    height: 160px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-radius: 16px 16px 0 0;
    padding: 16px;
  }

  .detail-content {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .detail-title {
    font-size: 1.5rem;
    font-weight: 800;
    letter-spacing: 0.02em;
    margin: 0;
  }

  .detail-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .detail-tag {
    font-size: 0.65rem;
    padding: 2px 10px;
    border-radius: 99px;
    border: 1px solid;
    opacity: 0.7;
    font-weight: 500;
    text-transform: lowercase;
  }

  .detail-meta {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .meta-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    flex: 1;
  }

  .meta-label {
    font-size: 0.6rem;
    color: rgba(255, 255, 255, 0.35);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
  }

  .meta-value {
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.8);
    font-weight: 700;
  }

  .meta-divider {
    width: 1px;
    height: 24px;
    background: rgba(255, 255, 255, 0.08);
  }

  .detail-requirements {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .req-badge {
    font-size: 0.65rem;
    padding: 3px 10px;
    border-radius: 6px;
    font-weight: 500;
  }

  .req-same-room {
    background: rgba(251, 191, 36, 0.12);
    color: #fbbf24;
  }

  .req-display {
    background: rgba(96, 165, 250, 0.12);
    color: #60a5fa;
  }

  .req-none {
    background: rgba(74, 222, 128, 0.08);
    color: rgba(74, 222, 128, 0.6);
  }

  .detail-desc {
    font-size: 0.85rem;
    line-height: 1.5;
    color: rgba(255, 255, 255, 0.6);
    margin: 0;
  }

  .detail-long-desc {
    font-size: 0.8rem;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.45);
    margin: 0;
  }

  .detail-media-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 24px;
    border: 1px dashed rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    color: rgba(255, 255, 255, 0.2);
    font-size: 0.7rem;
  }

  .detail-unavailable {
    text-align: center;
    padding: 12px;
    background: rgba(239, 68, 68, 0.08);
    border-radius: 10px;
    color: rgba(239, 68, 68, 0.7);
    font-size: 0.8rem;
    font-weight: 500;
  }

  .detail-select-btn {
    width: 100%;
    padding: 14px;
    border-radius: 12px;
    font-size: 0.95rem;
    font-weight: 700;
    border: none;
    cursor: pointer;
    background: #4f46e5;
    color: white;
    transition: background 0.15s, transform 0.1s;
  }

  .detail-select-btn:active {
    transform: scale(0.97);
  }

  .detail-select-btn.selected {
    color: white;
    cursor: default;
    opacity: 0.8;
  }

  /* ── Light mode overrides ──────────────────────────────── */
  :global(.light) .detail-card {
    background: #ffffff;
    border-color: rgba(0, 0, 0, 0.08);
  }

  :global(.light) .detail-art {
    filter: brightness(1.8) saturate(0.7);
  }

  :global(.light) .back-btn {
    background: rgba(255, 255, 255, 0.8);
    border-color: rgba(0, 0, 0, 0.1);
    color: rgba(0, 0, 0, 0.6);
  }

  :global(.light) .back-btn:hover {
    background: white;
    color: black;
  }

  :global(.light) .detail-meta {
    background: rgba(0, 0, 0, 0.02);
    border-color: rgba(0, 0, 0, 0.06);
  }

  :global(.light) .meta-label {
    color: rgba(0, 0, 0, 0.4);
  }

  :global(.light) .meta-value {
    color: rgba(0, 0, 0, 0.75);
  }

  :global(.light) .meta-divider {
    background: rgba(0, 0, 0, 0.08);
  }

  :global(.light) .detail-desc {
    color: rgba(0, 0, 0, 0.6);
  }

  :global(.light) .detail-long-desc {
    color: rgba(0, 0, 0, 0.45);
  }

  :global(.light) .detail-media-placeholder {
    border-color: rgba(0, 0, 0, 0.08);
    color: rgba(0, 0, 0, 0.25);
  }
</style>
