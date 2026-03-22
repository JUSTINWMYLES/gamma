<script lang="ts">
  /**
   * FloatingBackground.svelte
   *
   * Canvas-based floating shapes background with light/dark mode.
   * Ported from background.html prototype.
   * Should be shown on main pages through to room/lobby screens,
   * but NOT during actual games.
   */
  import { onMount, onDestroy } from "svelte";

  export let dark = false;

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;
  let animationId: number;
  let W = 0;
  let H = 0;

  const palettesLight = [
    "#e05c5c", "#e07a3c", "#d4b84a", "#5bab6e",
    "#4a8fc4", "#8b6fc4", "#c45c9e", "#4ab8b8",
    "#c4824a", "#7aab4a",
  ];
  const palettesDark = [
    "#f07070", "#f09050", "#f0d060", "#70cc88",
    "#60a8e8", "#a888e8", "#e870bc", "#60d8d8",
    "#e09e60", "#90cc60",
  ];

  function randBetween(a: number, b: number) {
    return a + Math.random() * (b - a);
  }
  function randInt(a: number, b: number) {
    return Math.floor(randBetween(a, b));
  }
  function pick<T>(arr: T[]): T {
    return arr[randInt(0, arr.length)];
  }

  const SHAPE_TYPES = ["circle", "square", "triangle", "diamond", "hexagon"] as const;
  type ShapeType = (typeof SHAPE_TYPES)[number];

  interface ShapeData {
    x: number;
    y: number;
    type: ShapeType;
    size: number;
    color: string;
    alpha: number;
    lineWidth: number;
    rotation: number;
    vx: number;
    vy: number;
    wobbleAmp: number;
    wobbleOffset: number;
    rotSpeed: number;
    t: number;
  }

  let shapes: ShapeData[] = [];

  function currentPalette(): string[] {
    return dark ? palettesDark : palettesLight;
  }

  function createShape(x?: number, y?: number): ShapeData {
    const palette = currentPalette();
    const angle = randBetween(-Math.PI * 0.6, -Math.PI * 0.4);
    const speed = randBetween(0.18, 0.55);
    return {
      x: x !== undefined ? x : randBetween(-60, W + 60),
      y: y !== undefined ? y : randBetween(-60, H + 60),
      type: pick([...SHAPE_TYPES]),
      size: randBetween(8, 22),
      color: pick(palette),
      alpha: randBetween(0.25, 0.65),
      lineWidth: randBetween(1.2, 2.5),
      rotation: randBetween(0, Math.PI * 2),
      vx: Math.cos(angle) * speed * randBetween(-1.5, 1.5),
      vy: Math.sin(angle) * speed,
      wobbleAmp: randBetween(0.0003, 0.001),
      wobbleOffset: randBetween(0, Math.PI * 2),
      rotSpeed: randBetween(-0.004, 0.004),
      t: 0,
    };
  }

  function updateShape(s: ShapeData) {
    s.t++;
    s.x += s.vx + Math.sin(s.t * s.wobbleAmp * 60 + s.wobbleOffset) * 0.3;
    s.y += s.vy;
    s.rotation += s.rotSpeed;

    if (s.y < -80 || s.y > H + 80 || s.x < -100 || s.x > W + 100) {
      const edge = Math.random();
      const replacement = edge < 0.6
        ? createShape(randBetween(0, W), H + 40)
        : edge < 0.8
          ? createShape(-40, randBetween(0, H))
          : createShape(W + 40, randBetween(0, H));
      Object.assign(s, replacement);
    }
  }

  function drawShape(s: ShapeData) {
    if (!ctx) return;
    ctx.save();
    ctx.globalAlpha = s.alpha;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rotation);
    ctx.beginPath();

    const sz = s.size;
    switch (s.type) {
      case "circle":
        ctx.arc(0, 0, sz, 0, Math.PI * 2);
        break;
      case "square":
        ctx.rect(-sz, -sz, sz * 2, sz * 2);
        break;
      case "triangle":
        ctx.moveTo(0, -sz);
        ctx.lineTo(sz * 0.866, sz * 0.5);
        ctx.lineTo(-sz * 0.866, sz * 0.5);
        ctx.closePath();
        break;
      case "diamond":
        ctx.moveTo(0, -sz * 1.2);
        ctx.lineTo(sz * 0.75, 0);
        ctx.lineTo(0, sz * 1.2);
        ctx.lineTo(-sz * 0.75, 0);
        ctx.closePath();
        break;
      case "hexagon":
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i - Math.PI / 6;
          if (i === 0) ctx.moveTo(Math.cos(a) * sz, Math.sin(a) * sz);
          else ctx.lineTo(Math.cos(a) * sz, Math.sin(a) * sz);
        }
        ctx.closePath();
        break;
    }
    ctx.stroke();
    ctx.restore();
  }

  function animate() {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    for (const s of shapes) {
      updateShape(s);
      drawShape(s);
    }
    animationId = requestAnimationFrame(animate);
  }

  function handleResize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  // When dark prop changes, update existing shapes' colors
  $: if (shapes.length > 0) {
    const pal = dark ? palettesDark : palettesLight;
    shapes.forEach((s) => (s.color = pick(pal)));
  }

  onMount(() => {
    ctx = canvas.getContext("2d");
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;

    const count = Math.min(120, Math.floor((W * H) / 8000));
    shapes = [];
    for (let i = 0; i < count; i++) {
      shapes.push(createShape());
    }

    window.addEventListener("resize", handleResize);
    animate();
  });

  onDestroy(() => {
    cancelAnimationFrame(animationId);
    window.removeEventListener("resize", handleResize);
  });
</script>

<canvas
  bind:this={canvas}
  class="fixed inset-0 w-full h-full pointer-events-none z-0"
/>
