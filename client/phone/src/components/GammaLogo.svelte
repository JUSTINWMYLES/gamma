<script lang="ts">
  /**
   * GammaLogo — Layered SVG Gamma (Γ) logo with mix-blend-mode effects.
   *
   * Three colour layers — base (purple), magenta, teal — stack with
   * mix-blend-mode: multiply to produce the distinctive overprint look.
   *
   * Props:
   *   size  — CSS width/height for the logo wrapper (default "150px")
   */
  export let size: string = "150px";
</script>

<div class="logo-wrap" style="width:{size};height:{size}">
  <!-- teal layer (back) -->
  <div class="logo-layer tl">
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="8" width="84" height="84" rx="20" fill="#dff0ee"/>
      <rect x="18" y="20" width="62" height="18" rx="6" fill="#5bbfb5"/>
      <rect x="18" y="20" width="18" height="60" rx="6" fill="#5bbfb5"/>
    </svg>
  </div>

  <!-- magenta layer (middle) -->
  <div class="logo-layer mg">
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="8" width="84" height="84" rx="20" fill="#f0e0ee"/>
      <rect x="18" y="20" width="62" height="18" rx="6" fill="#cc6ab5"/>
      <rect x="18" y="20" width="18" height="60" rx="6" fill="#cc6ab5"/>
    </svg>
  </div>

  <!-- base layer (front) -->
  <div class="logo-layer base">
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="8" width="84" height="84" rx="20" fill="#eceaf8"/>
      <rect x="18" y="20" width="62" height="18" rx="6" fill="#7c6fad"/>
      <rect x="18" y="20" width="18" height="60" rx="6" fill="#7c6fad"/>
    </svg>
  </div>
</div>

<style>
  .logo-wrap {
    position: relative;
  }

  .logo-layer {
    position: absolute;
    inset: 0;
  }
  .logo-layer :global(svg) {
    width: 100%;
    height: 100%;
  }

  .logo-layer.base { z-index: 3; }
  .logo-layer.mg   { z-index: 2; mix-blend-mode: multiply; }
  .logo-layer.tl   { z-index: 2; mix-blend-mode: multiply; }
</style>
