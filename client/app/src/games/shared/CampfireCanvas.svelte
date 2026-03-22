<!--
  CampfireCanvas.svelte

  Animated campfire rendered on an HTML Canvas.
  Props:
    - intensity: 0 (unlit/dark) to 1 (full roaring fire)
    - width / height: canvas size (default 280 x 320)

  The flame is composed of layered particles that grow taller, wider,
  and more vivid as intensity increases. Logs are drawn at the base.
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";

  export let intensity: number = 0;
  export let width: number = 280;
  export let height: number = 320;

  let canvas: HTMLCanvasElement;
  let animFrame: number;

  interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    size: number;
  }

  const particles: Particle[] = [];
  const MAX_PARTICLES = 120;

  /** Ember particles that drift upward when fire is active. */
  interface Ember {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    size: number;
  }
  const embers: Ember[] = [];
  const MAX_EMBERS = 25;

  function spawnParticle(baseX: number, baseY: number, spread: number, heightScale: number) {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * spread;
    particles.push({
      x: baseX + Math.cos(angle) * r,
      y: baseY,
      vx: (Math.random() - 0.5) * 1.2 * (spread / 20),
      vy: -(1.5 + Math.random() * 2.5) * heightScale,
      life: 0,
      maxLife: 25 + Math.random() * 30,
      size: 4 + Math.random() * 6 * heightScale,
    });
  }

  function spawnEmber(baseX: number, baseY: number, spread: number) {
    embers.push({
      x: baseX + (Math.random() - 0.5) * spread * 0.8,
      y: baseY - Math.random() * 20,
      vx: (Math.random() - 0.5) * 0.8,
      vy: -(0.6 + Math.random() * 1.2),
      life: 0,
      maxLife: 40 + Math.random() * 40,
      size: 1.5 + Math.random() * 2,
    });
  }

  function drawLogs(ctx: CanvasRenderingContext2D, cx: number, by: number) {
    ctx.save();
    // Left log
    ctx.translate(cx - 22, by);
    ctx.rotate(-0.3);
    ctx.fillStyle = "#5C3A1E";
    ctx.beginPath();
    ctx.roundRect(-28, -6, 56, 12, 5);
    ctx.fill();
    ctx.strokeStyle = "#3E2510";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    // Right log
    ctx.translate(cx + 22, by);
    ctx.rotate(0.3);
    ctx.fillStyle = "#6B4226";
    ctx.beginPath();
    ctx.roundRect(-28, -6, 56, 12, 5);
    ctx.fill();
    ctx.strokeStyle = "#3E2510";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // Cross log behind
    ctx.save();
    ctx.translate(cx, by + 4);
    ctx.fillStyle = "#4A2E14";
    ctx.beginPath();
    ctx.roundRect(-20, -5, 40, 10, 4);
    ctx.fill();
    ctx.restore();
  }

  function drawSmoke(ctx: CanvasRenderingContext2D, cx: number, by: number, t: number, inten: number) {
    if (inten < 0.05) return;
    const smokeAlpha = Math.min(0.15, inten * 0.12);
    for (let i = 0; i < 3; i++) {
      const sx = cx + Math.sin(t * 0.8 + i * 2.1) * 8 * inten;
      const sy = by - 60 * inten - i * 25 - Math.sin(t * 0.5 + i) * 5;
      const sr = 8 + i * 6 + inten * 12;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180,180,180,${smokeAlpha * (1 - i * 0.3)})`;
      ctx.fill();
    }
  }

  function drawGlow(ctx: CanvasRenderingContext2D, cx: number, by: number, inten: number) {
    if (inten < 0.02) return;
    const glowRadius = 40 + inten * 80;
    const grad = ctx.createRadialGradient(cx, by - 20 * inten, 0, cx, by - 20 * inten, glowRadius);
    grad.addColorStop(0, `rgba(255,160,30,${0.25 * inten})`);
    grad.addColorStop(0.5, `rgba(255,80,0,${0.10 * inten})`);
    grad.addColorStop(1, "rgba(255,80,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(cx - glowRadius, by - glowRadius - 20 * inten, glowRadius * 2, glowRadius * 2);
  }

  function render() {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = width;
    const h = height;
    const cx = w / 2;
    const baseY = h * 0.72; // where fire sits
    const t = Date.now() / 1000;

    // Clamp intensity
    const inten = Math.max(0, Math.min(1, intensity));

    ctx.clearRect(0, 0, w, h);

    // Ground shadow
    ctx.beginPath();
    ctx.ellipse(cx, baseY + 14, 50 + inten * 20, 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fill();

    // Logs
    drawLogs(ctx, cx, baseY + 8);

    // Glow behind flames
    drawGlow(ctx, cx, baseY, inten);

    // Spawn flame particles based on intensity
    if (inten > 0.01) {
      const spawnRate = Math.ceil(inten * 6);
      const spread = 8 + inten * 22;
      const heightScale = 0.3 + inten * 0.9;
      for (let i = 0; i < spawnRate; i++) {
        if (particles.length < MAX_PARTICLES) {
          spawnParticle(cx, baseY - 2, spread, heightScale);
        }
      }
      // Embers
      if (inten > 0.3 && Math.random() < inten * 0.3) {
        if (embers.length < MAX_EMBERS) {
          spawnEmber(cx, baseY, spread);
        }
      }
    }

    // Update & draw particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life++;
      p.x += p.vx + Math.sin(t * 3 + i) * 0.3;
      p.y += p.vy;
      p.vy *= 0.97;
      p.vx *= 0.98;

      const lifeRatio = p.life / p.maxLife;
      if (lifeRatio >= 1) {
        particles.splice(i, 1);
        continue;
      }

      const alpha = lifeRatio < 0.15 ? lifeRatio / 0.15 : 1 - (lifeRatio - 0.15) / 0.85;
      const size = p.size * (1 - lifeRatio * 0.5);

      // Color: core yellow -> orange -> red -> dark red as life progresses
      let r: number, g: number, b: number;
      if (lifeRatio < 0.3) {
        // Yellow core
        r = 255;
        g = 220 - lifeRatio * 300;
        b = 50 - lifeRatio * 150;
      } else if (lifeRatio < 0.6) {
        // Orange
        r = 255;
        g = 130 - (lifeRatio - 0.3) * 300;
        b = 0;
      } else {
        // Red to dark
        r = 255 - (lifeRatio - 0.6) * 400;
        g = 30 - (lifeRatio - 0.6) * 60;
        b = 0;
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1, size), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${Math.max(0, Math.round(r))},${Math.max(0, Math.round(g))},${Math.max(0, Math.round(b))},${alpha * 0.85})`;
      ctx.fill();
    }

    // Update & draw embers
    for (let i = embers.length - 1; i >= 0; i--) {
      const e = embers[i];
      e.life++;
      e.x += e.vx + Math.sin(t * 2 + i * 1.7) * 0.2;
      e.y += e.vy;

      const lifeRatio = e.life / e.maxLife;
      if (lifeRatio >= 1) {
        embers.splice(i, 1);
        continue;
      }

      const alpha = (1 - lifeRatio) * 0.9;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.size * (1 - lifeRatio * 0.3), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,${Math.round(100 + Math.random() * 80)},0,${alpha})`;
      ctx.fill();
    }

    // Smoke
    drawSmoke(ctx, cx, baseY, t, inten);

    // Unlit state: show a small match/spark hint
    if (inten < 0.02) {
      ctx.save();
      ctx.globalAlpha = 0.4 + Math.sin(t * 2) * 0.1;
      ctx.font = "28px serif";
      ctx.textAlign = "center";
      ctx.fillText("🪵", cx, baseY - 5);
      ctx.restore();
    }

    animFrame = requestAnimationFrame(render);
  }

  onMount(() => {
    animFrame = requestAnimationFrame(render);
  });

  onDestroy(() => {
    if (animFrame) cancelAnimationFrame(animFrame);
    particles.length = 0;
    embers.length = 0;
  });
</script>

<canvas
  bind:this={canvas}
  {width}
  {height}
  class="block mx-auto"
  style="image-rendering: auto;"
></canvas>
