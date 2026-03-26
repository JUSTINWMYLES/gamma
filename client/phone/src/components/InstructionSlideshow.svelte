<script lang="ts">
  /**
   * InstructionSlideshow.svelte (phone client copy)
   *
   * A themed slide-based instruction presentation. See the app client
   * version for full documentation.
   */
  import { onMount, onDestroy, createEventDispatcher } from "svelte";
  import type { InstructionSlide } from "../../../shared/instructionSlides";
  import { SLIDE_DURATION_MS, SLIDE_TRANSITION_MS } from "../../../shared/instructionSlides";

  /** The slides to display */
  export let slides: InstructionSlide[];

  /** "player" shows Got it! button; "viewer" shows ready counter */
  export let mode: "player" | "viewer" = "player";

  /** Whether the player has already confirmed (player mode) */
  export let isReady: boolean = false;

  /** Ready count (viewer mode) */
  export let readyCount: number = 0;

  /** Total player count (viewer mode) */
  export let totalCount: number = 0;

  /** Scale — "large" for TV, "normal" for phone */
  export let scale: "normal" | "large" = "normal";

  const dispatch = createEventDispatcher<{ confirm: void }>();

  let currentIndex = 0;
  let isTransitioning = false;
  let autoAdvanceTimer: ReturnType<typeof setTimeout> | null = null;
  let progressTimer: ReturnType<typeof setInterval> | null = null;
  let slideProgress = 0;

  $: slide = slides[currentIndex] ?? slides[0];
  $: isLastSlide = currentIndex === slides.length - 1;
  $: headingSize = scale === "large" ? "text-6xl" : "text-3xl";
  $: bodySize = scale === "large" ? "text-2xl" : "text-lg";
  $: iconSize = scale === "large" ? "text-8xl" : "text-6xl";
  $: dotSize = scale === "large" ? "w-4 h-4" : "w-2.5 h-2.5";

  function goToSlide(index: number) {
    if (index === currentIndex || isTransitioning || index < 0 || index >= slides.length) return;
    isTransitioning = true;
    slideProgress = 0;

    setTimeout(() => {
      currentIndex = index;
      isTransitioning = false;
      scheduleAutoAdvance();
    }, SLIDE_TRANSITION_MS);
  }

  function nextSlide() {
    if (currentIndex < slides.length - 1) {
      goToSlide(currentIndex + 1);
    }
  }

  function prevSlide() {
    if (currentIndex > 0) {
      goToSlide(currentIndex - 1);
    }
  }

  function scheduleAutoAdvance() {
    clearAutoAdvance();
    slideProgress = 0;

    if (isLastSlide) return;

    const startTime = Date.now();
    progressTimer = setInterval(() => {
      slideProgress = Math.min(1, (Date.now() - startTime) / SLIDE_DURATION_MS);
    }, 50);

    autoAdvanceTimer = setTimeout(() => {
      nextSlide();
    }, SLIDE_DURATION_MS);
  }

  function clearAutoAdvance() {
    if (autoAdvanceTimer) { clearTimeout(autoAdvanceTimer); autoAdvanceTimer = null; }
    if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
    slideProgress = 0;
  }

  function handleConfirm() {
    dispatch("confirm");
  }

  onMount(() => {
    scheduleAutoAdvance();
  });

  onDestroy(() => {
    clearAutoAdvance();
  });
</script>

<div
  class="flex-1 flex flex-col items-center justify-center relative overflow-hidden transition-colors"
  style="transition-duration: {SLIDE_TRANSITION_MS}ms"
>
  <!-- Background layer with gradient -->
  <div
    class="absolute inset-0 {slide.bgClass} transition-opacity"
    class:opacity-0={isTransitioning}
    class:opacity-100={!isTransitioning}
    style="transition-duration: {SLIDE_TRANSITION_MS}ms"
  ></div>

  <!-- Content layer -->
  <div
    class="relative z-10 flex flex-col items-center justify-center gap-4 px-6 py-8 w-full max-w-2xl mx-auto text-center
      transition-all"
    class:opacity-0={isTransitioning}
    class:translate-y-2={isTransitioning}
    class:opacity-100={!isTransitioning}
    class:translate-y-0={!isTransitioning}
    style="transition-duration: {SLIDE_TRANSITION_MS}ms"
  >
    <!-- Icon -->
    <div class="{iconSize} mb-2 drop-shadow-lg">
      {slide.icon}
    </div>

    <!-- Heading -->
    <h1 class="{headingSize} {slide.headingColor} {slide.fontClass} leading-tight drop-shadow-md">
      {slide.heading}
    </h1>

    <!-- Body -->
    <p class="{bodySize} {slide.bodyColor} max-w-lg leading-relaxed">
      {slide.body}
    </p>
  </div>

  <!-- Navigation arrows -->
  {#if slides.length > 1}
    <div class="absolute inset-x-0 top-1/2 -translate-y-1/2 z-20 flex justify-between px-3 pointer-events-none">
      <button
        class="pointer-events-auto w-10 h-10 rounded-full bg-black/20 backdrop-blur-sm
          flex items-center justify-center text-white/60 hover:text-white hover:bg-black/40
          transition-all active:scale-90 disabled:opacity-0"
        disabled={currentIndex === 0}
        on:click={prevSlide}
        aria-label="Previous slide"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <button
        class="pointer-events-auto w-10 h-10 rounded-full bg-black/20 backdrop-blur-sm
          flex items-center justify-center text-white/60 hover:text-white hover:bg-black/40
          transition-all active:scale-90 disabled:opacity-0"
        disabled={isLastSlide}
        on:click={nextSlide}
        aria-label="Next slide"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  {/if}

  <!-- Bottom area: dots + button/counter -->
  <div class="absolute bottom-0 inset-x-0 z-20 flex flex-col items-center gap-4 pb-6 px-6">
    <!-- Progress dots -->
    {#if slides.length > 1}
      <div class="flex gap-2 items-center">
        {#each slides as _, i}
          <button
            class="{dotSize} rounded-full transition-all duration-300 {i === currentIndex
              ? 'bg-white scale-125'
              : i < currentIndex
                ? 'bg-white/60'
                : 'bg-white/25'}"
            on:click={() => goToSlide(i)}
            aria-label="Go to slide {i + 1}"
          ></button>
        {/each}
      </div>

      {#if !isLastSlide}
        <div class="w-32 h-0.5 bg-white/10 rounded-full overflow-hidden">
          <div
            class="h-full bg-white/40 rounded-full transition-all"
            style="width:{slideProgress * 100}%;transition-duration:50ms"
          ></div>
        </div>
      {/if}
    {/if}

    <!-- Player mode: Got it! button -->
    {#if mode === "player"}
      {#if isReady}
        <div class="w-full max-w-xs py-4 rounded-xl text-lg font-bold
          bg-green-700/80 text-green-200 text-center backdrop-blur-sm">
          Ready! Waiting for others...
        </div>
      {:else}
        <button
          class="w-full max-w-xs py-4 rounded-xl text-lg font-bold
            bg-white/20 backdrop-blur-sm text-white border border-white/30
            hover:bg-white/30 active:bg-white/40 active:scale-95 transition-all"
          on:click={handleConfirm}
          data-testid="got-it-btn"
        >
          Got it!
        </button>
      {/if}
    {/if}

    <!-- Viewer mode: ready counter -->
    {#if mode === "viewer"}
      <div class="flex items-center gap-4 text-white/70">
        <div class="w-6 h-6 rounded-full border-3 border-white/50 border-t-transparent animate-spin"></div>
        <p class="{scale === 'large' ? 'text-xl' : 'text-base'}">
          Waiting for players...
          <span class="text-white font-bold">{readyCount}/{totalCount}</span>
        </p>
      </div>
    {/if}
  </div>
</div>
