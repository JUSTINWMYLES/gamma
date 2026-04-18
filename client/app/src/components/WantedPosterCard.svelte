<script lang="ts">
  import type { PlayerState } from "../../../shared/types";
  import PlayerIcon from "./PlayerIcon.svelte";

  export interface WantedPosterViewData {
    authorId: string;
    targetPlayerId: string;
    targetPlayerName?: string;
    condition: string;
    bounty: number | null;
    reason: string;
    voteCount?: number;
    isWinner?: boolean;
  }

  export let poster: WantedPosterViewData;
  export let targetPlayer: PlayerState | undefined = undefined;
  export let compact = false;
  export let featuredLabel = "";
  export let showVoteCount = false;
  export let showAuthor = false;
  export let authorName = "";
  export let audioPlaceholder = false;

  $: targetName = poster.targetPlayerName?.trim() || targetPlayer?.name || "Unknown Outlaw";
  $: conditionLine = poster.condition?.trim() || "No condition listed";
  $: bountyLine = typeof poster.bounty === "number"
    ? `$${poster.bounty.toLocaleString()}`
    : "Reward TBD";
  $: reasonLine = poster.reason?.trim() || "Reason left blank by the sheriff";
</script>

<div class:compact class="poster-shell" class:winner={poster.isWinner}>
  {#if featuredLabel}
    <div class="stamp stamp-top">{featuredLabel}</div>
  {/if}
  {#if poster.isWinner}
    <div class="stamp stamp-bottom">TOP PICK</div>
  {/if}

  <div class="poster-edge">
    <p class="tiny-title">Town Notice • Sheriff Approved</p>
    <h2 class="wanted-title">WANTED</h2>
    <p class="subtitle">for suspiciously delightful poster work</p>

    <div class="portrait-row">
      <div class="portrait-frame">
        {#if targetPlayer}
          <PlayerIcon player={targetPlayer} size={compact ? 74 : 112} />
        {:else}
          <div class="fallback-portrait">?</div>
        {/if}
      </div>
      <div class="headline-block">
        <p class="nameplate">{targetName}</p>
        <p class="meta-line"><span>Condition</span> <strong>{conditionLine}</strong></p>
        <p class="meta-line"><span>Bounty</span> <strong>{bountyLine}</strong></p>
      </div>
    </div>

    <div class="reason-block">
      <p class="label">Wanted For</p>
      <p class="reason">{reasonLine}</p>
    </div>

    <div class="footer-row">
      {#if showAuthor}
        <div class="footer-pill">By {authorName || "Unknown Deputy"}</div>
      {/if}
      {#if audioPlaceholder}
        <div class="footer-pill audio-pill">Audio Placeholder</div>
      {/if}
      {#if showVoteCount}
        <div class="footer-pill">{poster.voteCount ?? 0} vote{(poster.voteCount ?? 0) === 1 ? "" : "s"}</div>
      {/if}
    </div>
  </div>
</div>

<style>
  .poster-shell {
    position: relative;
    width: min(100%, 420px);
    background:
      radial-gradient(circle at top, rgba(255,255,255,0.28), transparent 35%),
      linear-gradient(180deg, #f3e3ba 0%, #e6ce93 50%, #d5b170 100%);
    color: #4a2107;
    border: 3px solid rgba(92, 44, 12, 0.7);
    box-shadow:
      0 18px 50px rgba(29, 13, 3, 0.34),
      inset 0 0 0 3px rgba(255, 244, 217, 0.25),
      inset 0 0 24px rgba(92, 44, 12, 0.16);
  }

  .poster-shell.compact {
    width: min(100%, 320px);
  }

  .poster-shell::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(91, 51, 24, 0.03), rgba(91, 51, 24, 0.03)),
      repeating-linear-gradient(
        0deg,
        rgba(107, 63, 30, 0.03),
        rgba(107, 63, 30, 0.03) 2px,
        transparent 2px,
        transparent 7px
      );
    pointer-events: none;
    mix-blend-mode: multiply;
  }

  .poster-edge {
    position: relative;
    margin: 10px;
    padding: 18px 18px 20px;
    border: 2px solid rgba(92, 44, 12, 0.7);
    background: rgba(255, 244, 214, 0.35);
  }

  .compact .poster-edge {
    padding: 14px;
  }

  .tiny-title,
  .subtitle,
  .label,
  .meta-line span,
  .footer-pill {
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .tiny-title {
    font-size: 0.68rem;
    text-align: center;
    opacity: 0.72;
    margin-bottom: 0.2rem;
  }

  .wanted-title {
    margin: 0;
    text-align: center;
    font-size: clamp(2.4rem, 5vw, 4rem);
    line-height: 0.95;
    letter-spacing: 0.12em;
    font-weight: 900;
  }

  .compact .wanted-title {
    font-size: 2.1rem;
  }

  .subtitle {
    margin: 0.25rem 0 1rem;
    text-align: center;
    font-size: 0.72rem;
    opacity: 0.8;
  }

  .portrait-row {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 1rem;
    align-items: center;
  }

  .compact .portrait-row {
    grid-template-columns: 1fr;
    justify-items: center;
    text-align: center;
  }

  .portrait-frame {
    min-width: 130px;
    min-height: 130px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid rgba(92, 44, 12, 0.7);
    background: rgba(88, 48, 21, 0.08);
    box-shadow: inset 0 0 18px rgba(92, 44, 12, 0.14);
  }

  .compact .portrait-frame {
    min-width: 94px;
    min-height: 94px;
  }

  .fallback-portrait {
    width: 72px;
    height: 72px;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px dashed rgba(92, 44, 12, 0.55);
    font-size: 2rem;
    font-weight: 700;
  }

  .headline-block {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }

  .nameplate {
    margin: 0;
    font-size: clamp(1.25rem, 2.4vw, 2rem);
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    line-height: 1.05;
  }

  .meta-line {
    margin: 0;
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    border-top: 1px dashed rgba(92, 44, 12, 0.35);
    padding-top: 0.4rem;
    font-size: 0.92rem;
  }

  .compact .meta-line {
    font-size: 0.8rem;
  }

  .meta-line strong {
    text-align: right;
    font-weight: 900;
    max-width: 60%;
  }

  .reason-block {
    margin-top: 1rem;
    padding-top: 0.8rem;
    border-top: 2px solid rgba(92, 44, 12, 0.2);
  }

  .label {
    margin: 0 0 0.3rem;
    font-size: 0.7rem;
    opacity: 0.72;
  }

  .reason {
    margin: 0;
    font-size: 1rem;
    line-height: 1.35;
    min-height: 3.1rem;
  }

  .compact .reason {
    min-height: 0;
    font-size: 0.88rem;
  }

  .footer-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem;
    margin-top: 1rem;
  }

  .footer-pill {
    font-size: 0.62rem;
    padding: 0.32rem 0.55rem;
    border: 1px solid rgba(92, 44, 12, 0.35);
    background: rgba(92, 44, 12, 0.07);
  }

  .audio-pill {
    border-style: dashed;
  }

  .stamp {
    position: absolute;
    z-index: 2;
    border: 2px solid rgba(142, 39, 20, 0.7);
    color: rgba(142, 39, 20, 0.9);
    padding: 0.18rem 0.55rem;
    font-weight: 900;
    letter-spacing: 0.18em;
    font-size: 0.68rem;
    transform: rotate(-10deg);
    background: rgba(255, 238, 210, 0.8);
  }

  .stamp-top {
    top: 10px;
    right: 10px;
  }

  .stamp-bottom {
    bottom: 14px;
    right: 12px;
    transform: rotate(6deg);
  }

  .winner {
    box-shadow:
      0 0 0 3px rgba(255, 220, 120, 0.35),
      0 18px 50px rgba(29, 13, 3, 0.34),
      inset 0 0 0 3px rgba(255, 244, 217, 0.25),
      inset 0 0 24px rgba(92, 44, 12, 0.16);
  }
</style>
