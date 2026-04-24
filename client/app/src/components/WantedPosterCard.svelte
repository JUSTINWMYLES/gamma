<script context="module" lang="ts">
  export interface WantedPosterViewData {
    authorId: string;
    characterCreatorId: string;
    characterName: string;
    characterDescription: string;
    portraitDesign: string;
    condition: string;
    bounty: string;
    reason: string;
    submittedAt?: number;
    voteCount?: number;
    isWinner?: boolean;
  }
</script>

<script lang="ts">
  import PlayerIcon from "./PlayerIcon.svelte";
  import type { PlayerState } from "../../../shared/types";

  export let poster: WantedPosterViewData;
  export let compact = false;
  export let featuredLabel = "";
  export let showVoteCount = false;
  export let showAuthor = false;
  export let authorName = "";
  export let emphasis: "default" | "showcase" = "default";

  $: nameLine = poster.characterName?.trim() || "Unknown Outlaw";
  $: conditionLine = poster.condition?.trim() || "Dead or alive-ish";
  $: bountyLine = poster.bounty?.trim() || "Reward negotiable";
  $: descriptionLine = poster.characterDescription?.trim() || "No official description on file.";
  $: reasonLine = poster.reason?.trim() || "No formal accusation submitted.";
  $: portraitPlayer = {
    id: `wanted-${poster.characterCreatorId || poster.authorId || "mystery"}`,
    name: nameLine,
    score: 0,
    isReady: false,
    isConnected: true,
    isEliminated: false,
    bracketSeed: 0,
    currentMatchOpponentId: "",
    iconEmoji: "",
    iconText: "",
    iconBgColor: "",
    iconDesign: poster.portraitDesign ?? "",
    micPermission: "unknown",
    motionPermission: "unknown",
    x: 0,
    y: 0,
    isDetected: false,
    detectionMeter: 0,
    timesCaught: 0,
  } satisfies PlayerState;
</script>

<div class:compact class:showcase={emphasis === "showcase"} class="poster-shell" class:winner={poster.isWinner}>
  {#if featuredLabel}
    <div class="stamp stamp-top">{featuredLabel}</div>
  {/if}
  {#if poster.isWinner}
    <div class="stamp stamp-bottom">Top Pick</div>
  {/if}

  <div class="poster-edge">
    <p class="tiny-title">Sheriff's Office • Frontier Territory</p>
    <h2 class="wanted-title">WANTED</h2>

    <div class="top-block">
      <div class="portrait-frame">
        <div class="portrait-matte">
          <PlayerIcon player={portraitPlayer} size={compact ? 108 : emphasis === "showcase" ? 184 : 148} />
        </div>
      </div>

      <div class="headline-block">
        <p class="nameplate">{nameLine}</p>
        <p class="character-description">{descriptionLine}</p>
      </div>
    </div>

    <div class="reward-banner">
      <span class="reward-label">Reward</span>
      <strong class="reward-value">{bountyLine}</strong>
    </div>

    <div class="info-grid">
      <div class="info-block">
        <p class="label">Condition</p>
        <p class="body-line">{conditionLine}</p>
      </div>
      <div class="info-block info-block-tall">
        <p class="label">Wanted For</p>
        <p class="body-copy">{reasonLine}</p>
      </div>
    </div>

    <div class="footer-row">
      {#if showAuthor}
        <div class="footer-pill">Poster by {authorName || "Unknown Deputy"}</div>
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
      radial-gradient(circle at top, rgba(255, 242, 207, 0.9), rgba(243, 227, 186, 0.98) 38%, rgba(219, 183, 116, 0.98) 100%),
      linear-gradient(180deg, #f3e3ba 0%, #d7ad67 100%);
    color: #4d2208;
    border: 3px solid rgba(91, 47, 18, 0.72);
    border-radius: 24px;
    box-shadow:
      0 18px 44px rgba(28, 12, 3, 0.34),
      inset 0 0 0 3px rgba(255, 250, 234, 0.25),
      inset 0 0 28px rgba(92, 44, 12, 0.13);
    overflow: hidden;
  }

  .poster-shell.compact {
    width: min(100%, 328px);
  }

  .poster-shell.showcase {
    width: min(100%, 560px);
  }

  .poster-shell::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(91, 51, 24, 0.025), rgba(91, 51, 24, 0.025)),
      repeating-linear-gradient(
        0deg,
        rgba(107, 63, 30, 0.025),
        rgba(107, 63, 30, 0.025) 2px,
        transparent 2px,
        transparent 7px
      );
    mix-blend-mode: multiply;
    pointer-events: none;
  }

  .poster-edge {
    position: relative;
    margin: 12px;
    padding: 18px 18px 20px;
    border: 2px solid rgba(91, 47, 18, 0.68);
    border-radius: 18px;
    background: rgba(255, 247, 228, 0.34);
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  .compact .poster-edge {
    margin: 10px;
    padding: 14px 14px 16px;
    gap: 0.72rem;
  }

  .tiny-title,
  .label,
  .footer-pill,
  .reward-label {
    text-transform: uppercase;
    letter-spacing: 0.14em;
  }

  .tiny-title {
    margin: 0;
    text-align: center;
    font-size: 0.62rem;
    opacity: 0.75;
  }

  .wanted-title {
    margin: 0;
    text-align: center;
    font-size: clamp(2.3rem, 5.4vw, 4.5rem);
    line-height: 0.92;
    letter-spacing: 0.14em;
    font-weight: 900;
  }

  .compact .wanted-title {
    font-size: 2rem;
  }

  .showcase .wanted-title {
    font-size: clamp(3rem, 4.2vw, 5rem);
  }

  .top-block {
    display: grid;
    grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
    gap: 1rem;
    align-items: center;
  }

  .compact .top-block {
    grid-template-columns: 1fr;
    justify-items: center;
    text-align: center;
  }

  .portrait-frame {
    border: 2px solid rgba(91, 47, 18, 0.68);
    border-radius: 18px;
    padding: 0.7rem;
    background: rgba(88, 48, 21, 0.08);
    box-shadow: inset 0 0 18px rgba(92, 44, 12, 0.13);
  }

  .portrait-matte {
    border-radius: 12px;
    min-height: 128px;
    display: flex;
    align-items: center;
    justify-content: center;
    background:
      linear-gradient(180deg, rgba(255,255,255,0.46), rgba(255,255,255,0.14)),
      rgba(91, 47, 18, 0.05);
  }

  .compact .portrait-matte {
    min-height: 108px;
  }

  .showcase .portrait-matte {
    min-height: 188px;
  }

  .headline-block {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
  }

  .nameplate {
    margin: 0;
    font-size: clamp(1.35rem, 2.6vw, 2.5rem);
    font-weight: 900;
    line-height: 1;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    overflow-wrap: anywhere;
  }

  .compact .nameplate {
    font-size: 1.3rem;
  }

  .character-description {
    margin: 0;
    font-size: clamp(0.85rem, 1.4vw, 1.05rem);
    line-height: 1.35;
    opacity: 0.84;
    overflow-wrap: anywhere;
  }

  .compact .character-description {
    font-size: 0.82rem;
  }

  .reward-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    border-block: 2px solid rgba(91, 47, 18, 0.18);
    padding: 0.6rem 0;
  }

  .compact .reward-banner {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.3rem;
  }

  .reward-label {
    font-size: 0.68rem;
    opacity: 0.72;
  }

  .reward-value {
    font-size: clamp(1rem, 2vw, 1.7rem);
    line-height: 1.1;
    text-align: right;
    overflow-wrap: anywhere;
  }

  .compact .reward-value {
    text-align: left;
    font-size: 1rem;
  }

  .info-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.8rem;
  }

  .compact .info-grid {
    grid-template-columns: 1fr;
  }

  .info-block {
    border: 1px solid rgba(91, 47, 18, 0.22);
    border-radius: 14px;
    padding: 0.75rem 0.85rem;
    background: rgba(255, 250, 236, 0.34);
    min-width: 0;
  }

  .info-block-tall {
    grid-column: span 1;
  }

  .label {
    margin: 0 0 0.3rem;
    font-size: 0.62rem;
    opacity: 0.72;
  }

  .body-line,
  .body-copy {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .body-line {
    font-size: clamp(0.92rem, 1.6vw, 1.15rem);
    font-weight: 800;
    line-height: 1.2;
  }

  .body-copy {
    font-size: clamp(0.82rem, 1.3vw, 1rem);
    line-height: 1.34;
    min-height: 3.4em;
  }

  .compact .body-copy {
    min-height: 0;
    font-size: 0.82rem;
  }

  .footer-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .footer-pill {
    border: 1px solid rgba(91, 47, 18, 0.3);
    border-radius: 999px;
    padding: 0.32rem 0.62rem;
    font-size: 0.58rem;
    background: rgba(91, 47, 18, 0.07);
  }

  .stamp {
    position: absolute;
    z-index: 2;
    border: 2px solid rgba(142, 39, 20, 0.72);
    color: rgba(142, 39, 20, 0.92);
    padding: 0.2rem 0.58rem;
    font-size: 0.66rem;
    font-weight: 900;
    letter-spacing: 0.18em;
    background: rgba(255, 240, 211, 0.88);
    transform: rotate(-8deg);
  }

  .stamp-top {
    top: 12px;
    right: 12px;
  }

  .stamp-bottom {
    bottom: 16px;
    right: 14px;
    transform: rotate(6deg);
  }

  .winner {
    box-shadow:
      0 0 0 3px rgba(255, 220, 120, 0.42),
      0 18px 44px rgba(28, 12, 3, 0.34),
      inset 0 0 0 3px rgba(255, 250, 234, 0.25),
      inset 0 0 28px rgba(92, 44, 12, 0.13);
  }
</style>
