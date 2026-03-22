<script lang="ts">
  /**
   * GammaTitle.svelte
   *
   * Animated "GAMMA" wordmark with glitch/chromatic aberration effect.
   * Ported from title.html prototype.
   */
  export let subtitle = "Party Game Platform";
  export let size: "sm" | "md" | "lg" = "lg";
</script>

<div class="wordmark-wrap wordmark-{size}">
  <div class="wordmark-glow"></div>
  <div class="wordmark">
    <span class="layer mg" aria-hidden="true">GAMMA</span>
    <span class="layer tl" aria-hidden="true">GAMMA</span>
    <span class="base">GAMMA</span>
  </div>
</div>
{#if subtitle}
  <div class="wm-label">{subtitle}</div>
{/if}

<style>
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap');

  .wordmark-wrap {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .wordmark-glow {
    position: absolute;
    inset: -20px -30px;
    background: radial-gradient(ellipse at center, rgba(124,111,173,0.08) 0%, transparent 70%);
    pointer-events: none;
    animation: glowPulse 4s ease-in-out infinite;
  }

  @keyframes glowPulse {
    0%, 100% { opacity: 0.7; }
    50% { opacity: 1; }
  }

  .wordmark {
    position: relative;
    font-family: 'Bebas Neue', sans-serif;
    letter-spacing: 0.1em;
    line-height: 1;
    user-select: none;
    white-space: nowrap;
    z-index: 1;
  }

  .wordmark-lg .wordmark { font-size: 112px; }
  .wordmark-md .wordmark { font-size: 72px; }
  .wordmark-sm .wordmark { font-size: 48px; }

  .wordmark .layer {
    display: block;
    position: absolute;
    top: 0;
    left: 0;
    white-space: nowrap;
  }

  .wordmark .base {
    position: relative;
    color: #9b93b8;
    z-index: 3;
  }

  .wordmark .mg {
    color: #cc6ab5;
    z-index: 2;
    mix-blend-mode: multiply;
    animation: wmMg 3.8s steps(1) infinite;
  }

  .wordmark .tl {
    color: #5bbfb5;
    z-index: 2;
    mix-blend-mode: multiply;
    animation: wmTl 3.8s steps(1) infinite;
  }

  @keyframes wmMg {
    0%, 84%  { opacity: 0; clip-path: inset(100% 0 0 0); transform: translate(0); }
    85%      { opacity: 1; clip-path: inset(12% 0 52% 0); transform: translate(-7px, 0); }
    86%      { opacity: 0; }
    90%      { opacity: 1; clip-path: inset(58% 0 8% 0); transform: translate(-5px, 1px); }
    91%      { opacity: 0; }
    95%      { opacity: 1; clip-path: inset(32% 0 38% 0); transform: translate(-4px, 0); }
    96%      { opacity: 0; }
    100%     { opacity: 0; }
  }

  @keyframes wmTl {
    0%, 84%  { opacity: 0; clip-path: inset(100% 0 0 0); transform: translate(0); }
    85%      { opacity: 1; clip-path: inset(52% 0 12% 0); transform: translate(7px, 0); }
    86%      { opacity: 0; }
    90%      { opacity: 1; clip-path: inset(8% 0 58% 0); transform: translate(5px, -1px); }
    91%      { opacity: 0; }
    95%      { opacity: 1; clip-path: inset(38% 0 32% 0); transform: translate(4px, 0); }
    96%      { opacity: 0; }
    100%     { opacity: 0; }
  }

  /* scan lines */
  .wordmark-wrap::after {
    content: '';
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      180deg,
      transparent 0px,
      transparent 3px,
      rgba(124, 111, 173, 0.05) 3px,
      rgba(124, 111, 173, 0.05) 4px
    );
    pointer-events: none;
    z-index: 10;
  }

  .wm-label {
    font-family: 'Bebas Neue', sans-serif;
    letter-spacing: 0.35em;
    font-size: 13px;
    color: #b0a8cc;
    margin-top: -8px;
    text-align: center;
  }
</style>
