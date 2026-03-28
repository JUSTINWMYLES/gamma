<script lang="ts">
  /**
   * CityScene.svelte — Immersive 3D city lobby built with Three.js.
   *
   * Players select games by clicking window panes on a central skyscraper.
   * Clicking a game transitions the camera to a themed city location.
   *
   * Props:
   *   dark       — true for nighttime, false for daytime
   *   games      — array of { id, label, color, accent } game entries
   *   selectedId — currently selected game ID (or "")
   *   readonly   — if true, clicking a window only dispatches "detail" not "select"
   *
   * Events:
   *   select  — { gameId: string }  — user clicked a game window
   *   detail  — { gameId: string }  — user wants to see game detail
   *   startGame — { gameId: string } — user wants to start from city view
   */
  import { onMount, onDestroy, createEventDispatcher } from "svelte";
  import * as THREE from "three";

  export let dark: boolean = true;
  export let games: { id: string; label: string; color: string; accent: string }[] = [];
  export let selectedId: string = "";
  export let readonly: boolean = false;

  const dispatch = createEventDispatcher<{
    select: { gameId: string };
    detail: { gameId: string };
    startGame: { gameId: string };
  }>();

  let canvasEl: HTMLCanvasElement;
  let containerEl: HTMLDivElement;
  let disposed = false;

  // ── Game location positions (where camera flies to) ──────────────
  // Radio station moved further from maze (maze at z=65, radio at z=80 area -> moved to z=85)
  const GAME_LOCATIONS: Record<string, { scene: { x: number; y: number; z: number }; cam: { x: number; y: number; z: number }; label: string }> = {
    "registry-03-tap-speed":            { scene: { x:  60, y: 0, z: -55 }, cam: { x:  60, y: 25, z: -30 }, label: "City Stadium" },
    "registry-04-escape-maze":          { scene: { x:  65, y: 0, z:  55 }, cam: { x:  65, y: 22, z:  80 }, label: "Hedge Maze Garden" },
    "registry-06-sound-replication":    { scene: { x: -55, y: 0, z:  30 }, cam: { x: -55, y: 12, z:  50 }, label: "Vinyl Records" },
    "registry-07-hot-potato":           { scene: { x:  35, y: 0, z:  30 }, cam: { x:  35, y: 12, z:  50 }, label: "Spicy Grocery" },
    "registry-14-dont-get-caught":      { scene: { x: -55, y: 0, z: -30 }, cam: { x: -55, y: 14, z: -10 }, label: "City Bank" },
    "registry-17-fire-match-blow-shake":{ scene: { x: -75, y: 0, z: -65 }, cam: { x: -60, y: 14, z: -50 }, label: "Pine Woods Camp" },
    "registry-19-shave-the-yak":        { scene: { x: -70, y: 0, z:  65 }, cam: { x: -55, y: 14, z:  80 }, label: "Yak Farm" },
    "registry-20-odd-one-out":          { scene: { x: -35, y: 0, z: -55 }, cam: { x: -35, y: 14, z: -35 }, label: "Police HQ" },
    "registry-25-lowball-marketplace":  { scene: { x:  45, y: 0, z: -30 }, cam: { x:  45, y: 14, z: -10 }, label: "Auction House" },
    "registry-40-paint-match":          { scene: { x:  0,  y: 0, z:  85 }, cam: { x:  15, y: 10, z: 105 }, label: "Riverside Park" },
    "registry-26-audio-overlay":        { scene: { x:  75, y: 0, z:  85 }, cam: { x:  75, y: 14, z: 105 }, label: "Radio Tower" },
  };

  // Card background gradients (matching GameCardGrid CARD_THEMES)
  const CARD_BG_THEMES: Record<string, { bg: string; nameColor: string; footerBg: string }> = {
    "registry-03-tap-speed":            { bg: "radial-gradient(ellipse at 50% 100%, #3d0e00, #0d0200)", nameColor: "#ff6020", footerBg: "#100300" },
    "registry-04-escape-maze":          { bg: "radial-gradient(ellipse at 50% 60%, #0a200a, #040a03)", nameColor: "#70e870", footerBg: "#050e04" },
    "registry-06-sound-replication":    { bg: "radial-gradient(ellipse at 50% 50%, #1a0030, #06000e)", nameColor: "#d080ff", footerBg: "#0a0015" },
    "registry-07-hot-potato":           { bg: "radial-gradient(ellipse at 50% 80%, #3d0a00, #0d0302)", nameColor: "#ff9050", footerBg: "#1a0500" },
    "registry-14-dont-get-caught":      { bg: "#050505", nameColor: "#c8c8c8", footerBg: "#080808" },
    "registry-17-fire-match-blow-shake":{ bg: "linear-gradient(180deg, #1e1500, #0e0a00)", nameColor: "#f0c040", footerBg: "#1a1200" },
    "registry-19-shave-the-yak":        { bg: "radial-gradient(ellipse at 50% 80%, #001e10, #000a06)", nameColor: "#40f0a0", footerBg: "#000e07" },
    "registry-20-odd-one-out":          { bg: "radial-gradient(ellipse at 50% 50%, #200010, #08000a)", nameColor: "#f060a0", footerBg: "#0e0008" },
    "registry-25-lowball-marketplace":  { bg: "linear-gradient(180deg, #1e1500, #0e0a00)", nameColor: "#f0c040", footerBg: "#1a1200" },
    "registry-40-paint-match":          { bg: "radial-gradient(ellipse at 50% 50%, #0a1428, #020408)", nameColor: "#60b8ff", footerBg: "#020408" },
    "registry-26-audio-overlay":        { bg: "#020408", nameColor: "#80a8ff", footerBg: "#020408" },
  };

  // ── Theme definitions ──────────────────────────────────────────────
  const THEMES = {
    dark: {
      sky: 0x0c1e38, ground: 0x1a2a18, grass: 0x18301a,
      road: 0x1a1e24, roadLine: 0x2a3a48, sidewalk: 0x222a30,
      building: 0x1a2840, facade: 0x1f3050, ledge: 0x0d1828,
      roof: 0x0b1522, antenna: 0x2a3d55,
      cityBlock: [0x2a3858, 0x3a2848, 0x283a48],
      cityRoof: [0x1a2838, 0x281a30, 0x1a3028],
      treeTrunk: 0x2d1f0f,
      treeCanopy: [0x145828, 0x18602a, 0x104a1e],
      pineTree: [0x0c3818, 0x10401c, 0x083010],
      flowerColors: [0xff6688, 0xffaa44, 0xdd66ff, 0x44aaff],
      benchColor: 0x3a2a18, fenceColor: 0x5a4a38,
      waterColor: 0x0a1830, waterHighlight: 0x1a3050,
      streetPole: 0x2a3a4a,
      ambientColor: 0x2a3a5a, ambientInt: 0.7,
      sunColor: 0x7090c0, sunInt: 1.4,
      fillColor: 0x3a4060, fillInt: 0.35,
      streetLightColor: 0xfff0aa, streetLightInt: 8.0, streetLightDist: 30,
      winOpacityBase: 0.85, winLightInt: 0.9, glowOpacity: 0.16,
      cityWinColors: [0xffcc66, 0x88ccff, 0xffffff, 0xffaa44],
      cityWinOpMin: 0.25, cityWinOpRange: 0.5,
      exposure: 1.3,
      hillColor: 0x122218, distTreeColor: 0x0e1e0e,
    },
    light: {
      sky: 0x4a9edd, ground: 0x4a9838, grass: 0x3d8830,
      road: 0x889098, roadLine: 0xb8c8d0, sidewalk: 0xc0c8cc,
      building: 0xd0e2f5, facade: 0xe0eefa, ledge: 0xaabfd8,
      roof: 0xaac0d8, antenna: 0x7a9ab5,
      cityBlock: [0xdda8a8, 0xa8c8dd, 0xc8dda8],
      cityRoof: [0xbb8888, 0x88aabb, 0xaabb88],
      treeTrunk: 0x7a5530,
      treeCanopy: [0x2a8830, 0x248020, 0x329038],
      pineTree: [0x1a6024, 0x22702c, 0x145418],
      flowerColors: [0xff4466, 0xff8822, 0xcc44ee, 0x2288ff],
      benchColor: 0x8a6a40, fenceColor: 0xaa9070,
      waterColor: 0x3070aa, waterHighlight: 0x68a8cc,
      streetPole: 0x607080,
      ambientColor: 0xfff8e8, ambientInt: 2.4,
      sunColor: 0xfff8d0, sunInt: 3.5,
      fillColor: 0xd8eeff, fillInt: 0.8,
      streetLightColor: 0xfff8d0, streetLightInt: 0.0, streetLightDist: 12,
      winOpacityBase: 0.92, winLightInt: 0.0, glowOpacity: 0.04,
      cityWinColors: [0xddeeff, 0xe8f4ff, 0xf2f8ff, 0xd8e8f8],
      cityWinOpMin: 0.4, cityWinOpRange: 0.3,
      exposure: 1.5,
      hillColor: 0x3a7828, distTreeColor: 0x306a20,
    }
  };

  // ── Internal state exposed to template ────────────────────────────
  type CityView = "city" | "tower" | "game";
  let currentView: CityView = "tower";
  let activeGameId: string | null = null;
  let gameLabelText = "";
  let scrollHintText = "Scroll to navigate floors";

  // Tooltip state
  let tooltipVisible = false;
  let tooltipX = 0;
  let tooltipY = 0;
  let tooltipName = "";
  let tooltipGenre = "";

  // ── Three.js state (created in onMount) ────────────────────────────
  let renderer: THREE.WebGLRenderer;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let clock: THREE.Clock;
  let animFrameId: number;

  // Lighting refs
  let ambient: THREE.AmbientLight;
  let sunMoon: THREE.DirectionalLight;
  let fill: THREE.DirectionalLight;
  let antLight: THREE.PointLight;

  // Material tracking (for theme switching)
  interface MatTrackers {
    ground: THREE.MeshLambertMaterial[];
    roads: THREE.MeshLambertMaterial[];
    roadLines: THREE.MeshBasicMaterial[];
    sidewalks: THREE.MeshLambertMaterial[];
    treeTrunks: THREE.MeshLambertMaterial[];
    treeCanopies: THREE.MeshLambertMaterial[];
    pineTrees: THREE.MeshLambertMaterial[];
    cityBuildings: { mat: THREE.MeshLambertMaterial; ci: number }[];
    cityRoofs: { mat: THREE.MeshLambertMaterial; ci: number }[];
    cityWindows: THREE.MeshBasicMaterial[];
    streetPoles: THREE.MeshLambertMaterial[];
    streetLightBulbs: THREE.MeshBasicMaterial[];
    streetLightPts: THREE.PointLight[];
    benches: THREE.MeshLambertMaterial[];
    fences: THREE.MeshLambertMaterial[];
    flowers: THREE.MeshBasicMaterial[];
    water: THREE.MeshBasicMaterial[];
    waterHighlights: THREE.MeshBasicMaterial[];
    hills: THREE.MeshLambertMaterial[];
    distTrees: THREE.MeshLambertMaterial[];
    clouds: THREE.MeshBasicMaterial[];
  }
  let matTrackers: MatTrackers;

  // Building materials
  let buildingMat: THREE.MeshLambertMaterial;
  let facadeMat: THREE.MeshLambertMaterial;
  let roofMat: THREE.MeshLambertMaterial;
  let antMat: THREE.MeshLambertMaterial;
  let groundMat: THREE.MeshLambertMaterial;
  let skyMat: THREE.MeshBasicMaterial;
  let ledgeMeshes: THREE.Mesh[];
  let colMeshes: THREE.Mesh[];

  // Window arrays
  let windowMeshes: THREE.Mesh[];
  let windowGlows: THREE.Mesh[];
  let windowLights: THREE.PointLight[];
  let windowEdges: THREE.LineSegments[];

  // Animated elements
  let groceryFlames: { mesh: THREE.Mesh; baseY: number; speed: number }[];
  let cars: { group: THREE.Group; roadAxis: string; roadPos: number; speed: number; progress: number; range: number }[];
  let clouds: { mesh: THREE.Mesh; speed: number; baseX: number; range: number }[];
  let riverWaterMeshes: THREE.Mesh[];
  let riverFlowOffset: number;

  // Camera system
  let scrollOffset = 0;
  let targetScrollOffset = 0;
  let BUILDING_H = 0;
  let MAX_SCROLL = 0;

  const CITY_VIEW_POS = new THREE.Vector3(55, 40, 70);
  const CITY_VIEW_TARGET = new THREE.Vector3(0, 0, 0);

  let camPos = new THREE.Vector3();
  let camTarget = new THREE.Vector3();
  let camPosTarget = new THREE.Vector3();
  let camLookTarget = new THREE.Vector3();
  let camLerpSpeed = 0.06;

  // Zoom-snap state
  let isZooming = false;

  // Free camera mode (developer)
  let freeCamera = false;
  let freeCamPos = new THREE.Vector3(0, 20, 50);
  let freeCamRot = { yaw: 0, pitch: -0.3 };
  let keys: Record<string, boolean> = {};

  // Raycaster
  let raycaster: THREE.Raycaster;
  let mouse = new THREE.Vector2();
  let hoveredIdx = -1;

  // Occupied zones (for collision avoidance with street lights)
  let occupiedZones: { x: number; z: number; r: number }[] = [];

  // ── Helpers ──────────────────────────────────────────────────────────
  function box(
    w: number, h: number, d: number, color: number,
    x: number, y: number, z: number,
    opts?: { transparent?: boolean; opacity?: number; castShadow?: boolean; receiveShadow?: boolean }
  ) {
    opts = opts || {};
    const mat = new THREE.MeshLambertMaterial({ color });
    if (opts.transparent) { mat.transparent = true; mat.opacity = opts.opacity ?? 1; }
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    if (opts.castShadow !== false) mesh.castShadow = true;
    if (opts.receiveShadow) mesh.receiveShadow = true;
    scene.add(mesh);
    return { mesh, mat };
  }

  function cylinder(rT: number, rB: number, h: number, color: number, x: number, y: number, z: number, segs = 8) {
    const mat = new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rT, rB, h, segs), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    scene.add(mesh);
    return { mesh, mat };
  }

  function sphere(r: number, color: number, x: number, y: number, z: number, segs = 8) {
    const mat = new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, segs, segs), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    scene.add(mesh);
    return { mesh, mat };
  }

  // ── Tree makers ──────────────────────────────────────────────────────
  function registerTreeZone(x: number, z: number) {
    occupiedZones.push({ x, z, r: 2.0 });
  }

  function makeTree(x: number, z: number, h?: number, canopyR?: number) {
    h = h ?? 3 + Math.random() * 2;
    canopyR = canopyR ?? 1.2 + Math.random() * 0.5;
    const r = cylinder(0.15, 0.22, h * 0.35, 0x2d1f0f, x, h * 0.175, z);
    matTrackers.treeTrunks.push(r.mat);
    const offsets: [number, number][] = [[h * 0.35, canopyR], [h * 0.5, canopyR * 0.85], [h * 0.65, canopyR * 0.65]];
    offsets.forEach(([oy, or]) => {
      const s = sphere(or, 0x145828, x + (Math.random() - 0.5) * 0.3, oy, z + (Math.random() - 0.5) * 0.3, 7);
      matTrackers.treeCanopies.push(s.mat);
    });
    registerTreeZone(x, z);
  }

  function makePine(x: number, z: number, h?: number) {
    h = h ?? 5 + Math.random() * 3;
    const r = cylinder(0.12, 0.18, h * 0.3, 0x2d1f0f, x, h * 0.15, z);
    matTrackers.treeTrunks.push(r.mat);
    for (let i = 0; i < 3; i++) {
      const coneH = h * (0.35 - i * 0.05);
      const coneR = (1.8 - i * 0.4) + Math.random() * 0.3;
      const mat = new THREE.MeshLambertMaterial({ color: 0x0c3818 });
      const mesh = new THREE.Mesh(new THREE.ConeGeometry(coneR, coneH, 7), mat);
      mesh.position.set(x, h * 0.25 + i * (h * 0.2), z);
      mesh.castShadow = true;
      scene.add(mesh);
      matTrackers.pineTrees.push(mat);
    }
    registerTreeZone(x, z);
  }

  function makeFlowerPatch(cx: number, cz: number, count: number, radius: number) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * radius;
      const fx = cx + Math.cos(a) * d;
      const fz = cz + Math.sin(a) * d;
      const colors = [0xff6688, 0xffaa44, 0xdd66ff, 0x44aaff];
      const color = colors[Math.floor(Math.random() * 4)];
      const mat = new THREE.MeshBasicMaterial({ color });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.15 + Math.random() * 0.1, 5, 4), mat);
      mesh.position.set(fx, 0.15, fz);
      scene.add(mesh);
      matTrackers.flowers.push(mat);
      const stemMat = new THREE.MeshLambertMaterial({ color: 0x1a5818 });
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 4), stemMat);
      stem.position.set(fx, 0.05, fz);
      scene.add(stem);
    }
  }

  function makeBench(x: number, z: number, rotY: number) {
    const group = new THREE.Group();
    const seatMat = new THREE.MeshLambertMaterial({ color: 0x3a2a18 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.6), seatMat);
    seat.position.y = 0.5;
    group.add(seat);
    matTrackers.benches.push(seatMat);
    const backMat = new THREE.MeshLambertMaterial({ color: 0x3a2a18 });
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 0.08), backMat);
    back.position.set(0, 0.8, -0.26);
    group.add(back);
    matTrackers.benches.push(backMat);
    [-0.7, 0.7].forEach((lx) => {
      const legMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.5), legMat);
      leg.position.set(lx, 0.25, 0);
      group.add(leg);
    });
    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    scene.add(group);
  }

  function isNearTree(x: number, z: number, minDist: number): boolean {
    for (const zone of occupiedZones) {
      const dx = x - zone.x, dz = z - zone.z;
      if (Math.sqrt(dx * dx + dz * dz) < minDist + zone.r) return true;
    }
    return false;
  }

  function makeStreetLight(x: number, z: number) {
    // Skip if too close to a tree
    if (isNearTree(x, z, 2.5)) return;

    const pm = new THREE.MeshLambertMaterial({ color: 0x2a3a4a });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.5, 6), pm);
    pole.position.set(x, 2.25, z);
    scene.add(pole);
    matTrackers.streetPoles.push(pm);

    const armMat = new THREE.MeshLambertMaterial({ color: 0x2a3a4a });
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.06), armMat);
    arm.position.set(x + 0.6, 4.4, z);
    scene.add(arm);
    matTrackers.streetPoles.push(armMat);

    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff5cc });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 6), bulbMat);
    bulb.position.set(x + 1.1, 4.3, z);
    scene.add(bulb);
    matTrackers.streetLightBulbs.push(bulbMat);

    const light = new THREE.PointLight(0xfff0aa, 8.0, 30);
    light.position.set(x + 1.1, 4.3, z);
    scene.add(light);
    matTrackers.streetLightPts.push(light);
  }

  // Road zones for collision checking
  let roadZones: { x: number; z: number; w: number; h: number }[] = [];

  function makeRoad(x: number, z: number, w: number, h: number, isVertical: boolean) {
    roadZones.push({ x, z, w: isVertical ? w + 4 : w, h: isVertical ? h : h + 4 });

    const mat = new THREE.MeshLambertMaterial({ color: 0x1a1e24 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.02, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
    matTrackers.roads.push(mat);

    const lineLen = isVertical ? h : w;
    const dashCount = Math.floor(lineLen / 6);
    for (let i = 0; i < dashCount; i++) {
      const lm = new THREE.MeshBasicMaterial({ color: 0x2a3a48, transparent: true, opacity: 0.6 });
      const dw = isVertical ? 0.2 : 2;
      const dh = isVertical ? 2 : 0.2;
      const ln = new THREE.Mesh(new THREE.PlaneGeometry(dw, dh), lm);
      ln.rotation.x = -Math.PI / 2;
      const offset = -lineLen / 2 + (i + 0.5) * (lineLen / dashCount);
      ln.position.set(isVertical ? x : x + offset, 0.03, isVertical ? z + offset : z);
      scene.add(ln);
      matTrackers.roadLines.push(lm);
    }

    for (let s = 0; s < 2; s++) {
      const side = s === 0 ? -1 : 1;
      const sm = new THREE.MeshLambertMaterial({ color: 0x222a30 });
      const swW = 2;
      let sw: THREE.Mesh;
      if (isVertical) {
        sw = new THREE.Mesh(new THREE.PlaneGeometry(swW, h), sm);
        sw.position.set(x + side * (w / 2 + swW / 2), 0.04, z);
      } else {
        sw = new THREE.Mesh(new THREE.PlaneGeometry(w, swW), sm);
        sw.position.set(x, 0.04, z + side * (h / 2 + swW / 2));
      }
      sw.rotation.x = -Math.PI / 2;
      sw.receiveShadow = true;
      scene.add(sw);
      matTrackers.sidewalks.push(sm);
    }
  }

  function makeIntersection(x: number, z: number, size: number) {
    const mat = new THREE.MeshLambertMaterial({ color: 0x1a1e24 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.025, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
    matTrackers.roads.push(mat);
  }

  function makeCityBuilding(x: number, z: number, w: number, d: number, h: number, colorIdx = 0) {
    const colors = [0x2a3858, 0x3a2848, 0x283a48];
    const roofColors = [0x1a2838, 0x281a30, 0x1a3028];

    const b = box(w, h, d, colors[colorIdx % 3], x, h / 2, z);
    matTrackers.cityBuildings.push({ mat: b.mat, ci: colorIdx });

    const rb = box(w + 0.3, 0.3, d + 0.3, roofColors[colorIdx % 3], x, h + 0.15, z);
    matTrackers.cityRoofs.push({ mat: rb.mat, ci: colorIdx });

    const wRows = Math.floor(h / 3);
    const wCols = Math.floor(w / 2.5);
    for (let wr = 0; wr < wRows; wr++) {
      for (let wc = 0; wc < wCols; wc++) {
        if (Math.random() > 0.55) {
          const wm = new THREE.MeshBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0.2 + Math.random() * 0.4 });
          const ww = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5), wm);
          ww.position.set(x - w / 2 + 1.2 + wc * 2.5, 1.5 + wr * 3, z + d / 2 + 0.05);
          scene.add(ww);
          matTrackers.cityWindows.push(wm);
        }
      }
    }
  }

  function makeCar(roadAxis: string, roadPos: number, speed: number, color: number) {
    const bodyMat = new THREE.MeshLambertMaterial({ color });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 1.4), bodyMat);
    const topColor = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.15);
    const topMat = new THREE.MeshLambertMaterial({ color: topColor });
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 1.2), topMat);
    top.position.set(-0.2, 0.7, 0);

    const group = new THREE.Group();
    group.add(body);
    group.add(top);

    const hlMat = new THREE.MeshBasicMaterial({ color: 0xffffcc });
    const hl1 = new THREE.Mesh(new THREE.SphereGeometry(0.08, 4, 4), hlMat);
    const hl2 = hl1.clone();
    hl1.position.set(1.25, 0.1, 0.4);
    hl2.position.set(1.25, 0.1, -0.4);
    group.add(hl1, hl2);

    const tlMat = new THREE.MeshBasicMaterial({ color: 0xff2200 });
    const tl1 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 4), tlMat);
    const tl2 = tl1.clone();
    tl1.position.set(-1.25, 0.1, 0.4);
    tl2.position.set(-1.25, 0.1, -0.4);
    group.add(tl1, tl2);

    group.position.y = 0.5;
    scene.add(group);

    cars.push({
      group, roadAxis, roadPos, speed,
      progress: Math.random() * 200 - 100, range: 100
    });
  }

  function makeGrassPatch(x: number, z: number, w: number, d: number) {
    const mat = new THREE.MeshLambertMaterial({ color: 0x1a4818 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.04, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
    matTrackers.ground.push(mat);
  }

  function makeCloud(x: number, y: number, z: number, scale: number) {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
    const blobCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < blobCount; i++) {
      const r = (0.8 + Math.random() * 1.2) * scale;
      const blob = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), mat);
      blob.position.set((Math.random() - 0.5) * scale * 3, (Math.random() - 0.3) * scale * 0.8, (Math.random() - 0.5) * scale * 1.5);
      group.add(blob);
    }
    group.position.set(x, y, z);
    scene.add(group);
    matTrackers.clouds.push(mat);
    clouds.push({ mesh: group as any, speed: 0.3 + Math.random() * 0.5, baseX: x, range: 60 + Math.random() * 40 });
  }

  // ── Card texture generation ─────────────────────────────────────────
  function createCardTexture(game: { id: string; label: string; color: string; accent: string }): THREE.CanvasTexture {
    const cvs = document.createElement("canvas");
    cvs.width = 256;
    cvs.height = 192;
    const ctx = cvs.getContext("2d")!;

    // Background gradient
    const bgTheme = CARD_BG_THEMES[game.id];
    if (bgTheme) {
      // Parse CSS gradient and approximate
      const nameC = bgTheme.nameColor;
      // Create a dark gradient background
      const grd = ctx.createRadialGradient(128, 140, 20, 128, 96, 160);
      // Parse the nameColor to create tinted bg
      const r = parseInt(nameC.slice(1,3), 16);
      const g = parseInt(nameC.slice(3,5), 16);
      const b = parseInt(nameC.slice(5,7), 16);
      grd.addColorStop(0, `rgba(${Math.floor(r*0.25)},${Math.floor(g*0.25)},${Math.floor(b*0.25)},1)`);
      grd.addColorStop(1, `rgba(${Math.floor(r*0.08)},${Math.floor(g*0.08)},${Math.floor(b*0.08)},1)`);
      ctx.fillStyle = grd;
    } else {
      ctx.fillStyle = "#050505";
    }
    ctx.fillRect(0, 0, 256, 192);

    // Footer bar
    const footerY = 140;
    ctx.fillStyle = bgTheme?.footerBg ?? "#080808";
    ctx.fillRect(0, footerY, 256, 52);

    // Separator line
    ctx.strokeStyle = game.color;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, footerY);
    ctx.lineTo(256, footerY);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Game name text
    ctx.fillStyle = game.color;
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(game.label, 128, footerY + 20);

    // Accent color accent mark at top
    ctx.fillStyle = game.color;
    ctx.globalAlpha = 0.15;
    ctx.fillRect(0, 0, 256, 3);
    ctx.globalAlpha = 1;

    // Simple icon-like shape in the center area (varies by game color)
    ctx.fillStyle = game.color;
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(128, 70, 25, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(128, 70, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    const tex = new THREE.CanvasTexture(cvs);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }

  // ── Build the entire city ──────────────────────────────────────────
  function buildCity() {
    matTrackers = {
      ground: [], roads: [], roadLines: [], sidewalks: [],
      treeTrunks: [], treeCanopies: [], pineTrees: [],
      cityBuildings: [], cityRoofs: [], cityWindows: [],
      streetPoles: [], streetLightBulbs: [], streetLightPts: [],
      benches: [], fences: [], flowers: [], water: [], waterHighlights: [],
      hills: [], distTrees: [], clouds: [],
    };
    windowMeshes = [];
    windowGlows = [];
    windowLights = [];
    windowEdges = [];
    groceryFlames = [];
    cars = [];
    clouds = [];
    ledgeMeshes = [];
    colMeshes = [];
    roadZones = [];
    occupiedZones = [];
    riverWaterMeshes = [];
    riverFlowOffset = 0;

    // -- Ground
    groundMat = new THREE.MeshLambertMaterial({ color: 0x18301a });
    const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);
    matTrackers.ground.push(groundMat);

    // -- Rolling hills
    function makeHill(x: number, z: number, rx: number, rz: number, h: number) {
      const mat = new THREE.MeshLambertMaterial({ color: 0x122218 });
      const geo = new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      geo.scale(rx, h, rz);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, -0.5, z);
      scene.add(mesh);
      matTrackers.hills.push(mat);
    }

    for (let angle = 0; angle < Math.PI * 2; angle += 0.35) {
      const dist = 140 + Math.random() * 40;
      makeHill(Math.cos(angle) * dist, Math.sin(angle) * dist,
        20 + Math.random() * 25, 20 + Math.random() * 25, 8 + Math.random() * 18);
    }
    for (let angle2 = 0.15; angle2 < Math.PI * 2; angle2 += 0.25) {
      const dist2 = 190 + Math.random() * 30;
      makeHill(Math.cos(angle2) * dist2, Math.sin(angle2) * dist2,
        25 + Math.random() * 30, 25 + Math.random() * 30, 12 + Math.random() * 25);
    }

    // Distant trees
    for (let dtAngle = 0; dtAngle < Math.PI * 2; dtAngle += 0.12) {
      const dtDist = 130 + Math.random() * 60;
      const x = Math.cos(dtAngle) * dtDist;
      const z = Math.sin(dtAngle) * dtDist;
      const h = 2 + Math.random() * 3;
      const mat = new THREE.MeshLambertMaterial({ color: 0x0e1e0e });
      const mesh = new THREE.Mesh(new THREE.ConeGeometry(1.5 + Math.random(), h, 6), mat);
      mesh.position.set(x, h / 2 + 0.5, z);
      scene.add(mesh);
      matTrackers.distTrees.push(mat);
    }

    // -- Sky dome
    const skyGeo = new THREE.SphereGeometry(300, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    skyMat = new THREE.MeshBasicMaterial({ color: 0x0c1e38, side: THREE.BackSide });
    const skyMesh = new THREE.Mesh(skyGeo, skyMat);
    skyMesh.position.y = -5;
    scene.add(skyMesh);

    // -- Clouds (floating in the sky)
    for (let ci = 0; ci < 12; ci++) {
      const angle = (ci / 12) * Math.PI * 2 + Math.random() * 0.5;
      const dist = 50 + Math.random() * 80;
      makeCloud(
        Math.cos(angle) * dist,
        30 + Math.random() * 25,
        Math.sin(angle) * dist,
        1.5 + Math.random() * 2
      );
    }

    // -- Roads (redesigned to avoid going through buildings)
    // Main horizontal road (shifted south to z=-20, avoids skyscraper at origin)
    makeRoad(0, -20, 200, 8, false);
    // Main vertical road (shifted west to x=-20, avoids skyscraper)
    makeRoad(-20, 0, 8, 200, true);
    // Secondary vertical road east (at x=25)
    makeRoad(25, -20, 8, 80, true);
    // East-west connector (at z=20)
    makeRoad(0, 20, 60, 8, false);
    // Far south road
    makeRoad(0, -60, 160, 8, false);
    // Far north road
    makeRoad(0, 70, 160, 8, false);
    // Far west vertical
    makeRoad(-60, 0, 8, 140, true);
    // Far east vertical
    makeRoad(55, -20, 8, 80, true);

    // Intersections
    const isects: [number,number][] = [[-20,-20],[25,-20],[-20,20],[-20,-60],[25,-60],[-60,-20],[-60,-60],[55,-20],[55,-60],[-20,70],[-60,70],[55,70],[25,20]];
    isects.forEach(([px, pz]) => makeIntersection(px, pz, 12));

    // -- Main Tower (2 columns wide, square footprint)
    const COLS = 2;
    const ROWS = Math.ceil(games.length / COLS);
    const WIN_W = 2.8, WIN_H = 2.1, WIN_GAP_X = 0.6, WIN_GAP_Y = 0.7;
    const FLOOR_H = WIN_H + WIN_GAP_Y;
    const BUILDING_W = COLS * WIN_W + (COLS - 1) * WIN_GAP_X + 2.0;
    const BUILDING_D = BUILDING_W; // Square footprint
    BUILDING_H = ROWS * FLOOR_H + 5;
    MAX_SCROLL = Math.max(0, BUILDING_H - 8);

    buildingMat = new THREE.MeshLambertMaterial({ color: 0x1a2840 });
    const building = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_W, BUILDING_H, BUILDING_D), buildingMat);
    building.position.y = BUILDING_H / 2;
    building.castShadow = building.receiveShadow = true;
    scene.add(building);

    facadeMat = new THREE.MeshLambertMaterial({ color: 0x1f3050, transparent: true, opacity: 0.88 });
    const facade = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_W + 0.1, BUILDING_H, 0.15), facadeMat);
    facade.position.set(0, BUILDING_H / 2, BUILDING_D / 2 + 0.08);
    scene.add(facade);

    // Ledges and columns
    for (let r = 0; r <= ROWS; r++) {
      const lmat = new THREE.MeshLambertMaterial({ color: 0x0d1828 });
      const l = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_W + 0.3, 0.15, BUILDING_D + 0.3), lmat);
      l.position.set(0, r * FLOOR_H + 1.8, 0);
      scene.add(l);
      ledgeMeshes.push(l);
    }
    for (let c = 0; c <= COLS; c++) {
      const cmat = new THREE.MeshLambertMaterial({ color: 0x0d1828 });
      const cm = new THREE.Mesh(new THREE.BoxGeometry(0.18, BUILDING_H, 0.2), cmat);
      cm.position.set(-BUILDING_W / 2 + 1.0 + c * (WIN_W + WIN_GAP_X) - WIN_GAP_X / 2, BUILDING_H / 2, BUILDING_D / 2 + 0.12);
      scene.add(cm);
      colMeshes.push(cm);
    }

    // Roof and antenna
    roofMat = new THREE.MeshLambertMaterial({ color: 0x0b1522 });
    const roofMesh = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_W + 0.8, 0.6, BUILDING_D + 0.8), roofMat);
    roofMesh.position.set(0, BUILDING_H + 0.3, 0);
    scene.add(roofMesh);

    antMat = new THREE.MeshLambertMaterial({ color: 0x2a3d55 });
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.08, 5, 6), antMat);
    antenna.position.set(0, BUILDING_H + 2.8, 0);
    scene.add(antenna);

    antLight = new THREE.PointLight(0xff3333, 2, 8);
    antLight.position.set(0, BUILDING_H + 5.5, 0);
    scene.add(antLight);

    // -- Window cards on tower (rendered as card textures)
    games.forEach((game, i) => {
      const col = i % COLS, row = Math.floor(i / COLS);
      const x = -BUILDING_W / 2 + 1.0 + col * (WIN_W + WIN_GAP_X) + WIN_W / 2;
      const y = 1.8 + row * FLOOR_H + WIN_H / 2 + WIN_GAP_Y / 2;
      const z = BUILDING_D / 2 + 0.22;

      // Glow
      const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(game.color), transparent: true, opacity: 0.16 });
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(WIN_W + 0.15, WIN_H + 0.15), glowMat);
      glow.position.set(x, y, z - 0.02);
      scene.add(glow);
      windowGlows.push(glow);

      // Card texture on window pane
      const cardTex = createCardTexture(game);
      const winMat = new THREE.MeshBasicMaterial({ map: cardTex, transparent: true, opacity: 0.92 });
      const win = new THREE.Mesh(new THREE.PlaneGeometry(WIN_W, WIN_H), winMat);
      win.position.set(x, y, z);
      (win as any).userData = { gameIndex: i, gameId: game.id };
      scene.add(win);
      windowMeshes.push(win);

      // Edge frame
      const edgeMat = new THREE.LineBasicMaterial({ color: new THREE.Color(game.accent), transparent: true, opacity: 0.7 });
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(WIN_W, WIN_H)), edgeMat);
      edges.position.set(x, y, z + 0.01);
      scene.add(edges);
      windowEdges.push(edges);

      // Point light
      const wl = new THREE.PointLight(new THREE.Color(game.color), 0.9, 5);
      wl.position.set(x, y, z + 0.6);
      scene.add(wl);
      windowLights.push(wl);
    });

    // -- City trees (placed first so street lights can avoid them)
    const treePositions: [number,number][] = [
      [-10, 10], [-10, -10], [10, 10], [10, -10],
      [-10, 30], [10, 30], [-10, -35], [10, -35],
      [-30, 10], [-30, -10], [30, 10], [30, -10],
      [-40, 30], [-40, -30], [40, 30], [40, -30],
      [15, -40], [-15, -40], [15, 40], [-15, 40],
      [-45, 15], [-45, -15], [45, 15], [45, -15],
    ];
    treePositions.forEach(([px, pz]) => makeTree(px, pz));

    // Flower patches
    makeFlowerPatch(-8, 8, 8, 2);
    makeFlowerPatch(8, 8, 8, 2);
    makeFlowerPatch(-8, -8, 6, 2);
    makeFlowerPatch(8, -8, 6, 2);
    makeFlowerPatch(-35, 15, 5, 1.5);
    makeFlowerPatch(35, 15, 5, 1.5);

    // Benches
    makeBench(-8, 5, 0);
    makeBench(8, 5, Math.PI);
    makeBench(-8, -8, 0);
    makeBench(8, -8, Math.PI);
    makeBench(-10, 30, 0);
    makeBench(10, 30, Math.PI);

    // -- Street lights (placed along roads, avoiding trees)
    // Along main horizontal road (z=-20)
    for (let si = -90; si <= 90; si += 20) {
      if (Math.abs(si - (-20)) < 10 && Math.abs(-20 - (-20)) < 10) continue; // skip near intersections
      makeStreetLight(si, -15);
      makeStreetLight(si, -25);
    }
    // Along main vertical road (x=-20)
    for (let sj = -90; sj <= 90; sj += 20) {
      if (Math.abs(sj - (-20)) < 10) continue;
      makeStreetLight(-15, sj);
      makeStreetLight(-25, sj);
    }
    // Along secondary vertical (x=25)
    for (let sj = -55; sj <= 15; sj += 20) {
      makeStreetLight(20, sj);
      makeStreetLight(30, sj);
    }
    // Along far roads
    for (let si = -70; si <= 70; si += 25) {
      makeStreetLight(si, -55);
      makeStreetLight(si, -65);
      makeStreetLight(si, 65);
      makeStreetLight(si, 75);
    }
    for (let sj = -55; sj <= 65; sj += 25) {
      makeStreetLight(-55, sj);
      makeStreetLight(-65, sj);
      makeStreetLight(50, sj);
      makeStreetLight(60, sj);
    }

    // -- Filler buildings (reduced count, with fun colors)
    makeCityBuilding(-40, -40, 8, 7, 14, 0);
    makeCityBuilding(40, -40, 7, 7, 16, 1);
    makeCityBuilding(-40, 40, 7, 6, 12, 2);
    makeCityBuilding(40, 40, 6, 6, 10, 0);
    makeCityBuilding(-80, -30, 8, 7, 20, 1);
    makeCityBuilding(-80, 30, 7, 6, 14, 2);
    makeCityBuilding(80, -30, 6, 6, 16, 0);

    // -- Cars (on the redesigned roads)
    makeCar("x", -22.5, 6, 0x4466aa);
    makeCar("x", -17.5, -5, 0xaa4444);
    makeCar("x", -22.5, 4, 0x44aa66);
    makeCar("z", -22.5, 5, 0xaa8844);
    makeCar("z", -17.5, -7, 0x6644aa);
    makeCar("z", -57.5, 4, 0x886644);
    makeCar("z", 57.5, -5, 0x448866);

    // ── Game-specific locations ────────────────────────────────────────
    buildTrack();
    buildMaze();
    buildRecordStore();
    buildGrocery();
    buildBank();
    buildCampfire();
    buildFarm();
    buildPoliceStation();
    buildAuctionHouse();
    buildPaintPark();
    buildRadioStation();

    // -- Extra greenery
    makeGrassPatch(-30, 30, 12, 12);
    makeGrassPatch(30, -35, 12, 12);
    makeGrassPatch(-30, -40, 10, 10);
    makeGrassPatch(30, 40, 12, 12);

    makeTree(-30, 32, 4);
    makeTree(-28, 28, 3.5);
    makeTree(30, -33, 4);
    makeTree(32, -37, 3.5);
    makeTree(32, 42, 4);
    makeTree(34, 38, 3.5);

    makeFlowerPatch(-30, 26, 10, 4);
    makeFlowerPatch(30, -30, 8, 3);
    makeFlowerPatch(32, 44, 8, 3);

    makeBench(-32, 25, Math.PI / 4);
    makeBench(32, -30, -Math.PI / 4);
    makeBench(34, 40, 0);

    // Set city view target now that BUILDING_H is known
    CITY_VIEW_TARGET.set(0, BUILDING_H * 0.4, 0);
  }

  // ── Game-specific location builders ────────────────────────────────
  function buildTrack() {
    const cx = 60, cz = -55;
    const rx = 12, rz = 8;
    const trackShape = new THREE.Shape();
    trackShape.absellipse(0, 0, rx, rz, 0, Math.PI * 2, false, 0);
    const innerRx = rx - 2.5, innerRz = rz - 2.5;
    const hole = new THREE.Path();
    hole.absellipse(0, 0, innerRx, innerRz, 0, Math.PI * 2, true, 0);
    trackShape.holes.push(hole);

    const trackMat = new THREE.MeshLambertMaterial({ color: 0xcc5533 });
    const trackMesh = new THREE.Mesh(new THREE.ShapeGeometry(trackShape, 48), trackMat);
    trackMesh.rotation.x = -Math.PI / 2;
    trackMesh.position.set(cx, 0.05, cz);
    trackMesh.receiveShadow = true;
    scene.add(trackMesh);

    const infieldShape = new THREE.Shape();
    infieldShape.absellipse(0, 0, innerRx - 0.2, innerRz - 0.2, 0, Math.PI * 2, false, 0);
    const infieldMat = new THREE.MeshLambertMaterial({ color: 0x287820 });
    const infield = new THREE.Mesh(new THREE.ShapeGeometry(infieldShape, 48), infieldMat);
    infield.rotation.x = -Math.PI / 2;
    infield.position.set(cx, 0.04, cz);
    scene.add(infield);

    [rx, rx - 2.5].forEach((lineR) => {
      const outer = new THREE.Shape();
      outer.absellipse(0, 0, lineR + 0.1, (lineR - (rx - rz)) + 0.1, 0, Math.PI * 2, false, 0);
      const inner = new THREE.Path();
      inner.absellipse(0, 0, lineR - 0.1, (lineR - (rx - rz)) - 0.1, 0, Math.PI * 2, true, 0);
      outer.holes.push(inner);
      const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
      const lineMesh = new THREE.Mesh(new THREE.ShapeGeometry(outer, 48), lineMat);
      lineMesh.rotation.x = -Math.PI / 2;
      lineMesh.position.set(cx, 0.06, cz);
      scene.add(lineMesh);
    });

    [-1, 1].forEach((side) => {
      const standMat = new THREE.MeshLambertMaterial({ color: 0x556677 });
      for (let row = 0; row < 3; row++) {
        const seatRow = new THREE.Mesh(new THREE.BoxGeometry(16, 0.8 + row * 0.5, 1.5), standMat);
        seatRow.position.set(cx, 0.4 + row * 0.8, cz + side * (rz + 3 + row * 1.5));
        seatRow.castShadow = true;
        scene.add(seatRow);
      }
    });

    makeTree(cx - 16, cz - 5, 4);
    makeTree(cx - 16, cz + 5, 3.5);
    makeTree(cx + 16, cz - 5, 4);
    makeTree(cx + 16, cz + 5, 3.5);
    makeFlowerPatch(cx - 15, cz, 6, 2);
    makeFlowerPatch(cx + 15, cz, 6, 2);
  }

  function buildMaze() {
    const cx = 65, cz = 55;
    const hedgeColor = 0x1a5820;
    const hedgeH = 2.5;
    const hedgeW = 0.6;

    function hedge(x1: number, z1: number, x2: number, z2: number) {
      const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
      const len = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
      const angle = Math.atan2(x2 - x1, z2 - z1);
      const mat = new THREE.MeshLambertMaterial({ color: hedgeColor });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(hedgeW, hedgeH, len), mat);
      mesh.position.set(cx + mx, hedgeH / 2, cz + mz);
      mesh.rotation.y = angle;
      mesh.castShadow = true;
      scene.add(mesh);
      matTrackers.treeCanopies.push(mat);
    }

    hedge(-10, -10, 10, -10);
    hedge(10, -10, 10, 10);
    hedge(10, 10, -10, 10);
    hedge(-10, 10, -10, -7);
    hedge(-7, -7, -7, 0);
    hedge(-7, 0, -2, 0);
    hedge(-4, -7, -4, -3);
    hedge(-4, -3, 2, -3);
    hedge(0, -7, 0, -3);
    hedge(3, -7, 3, 0);
    hedge(3, 0, 7, 0);
    hedge(7, -7, 7, 3);
    hedge(-7, 4, 0, 4);
    hedge(0, 4, 0, 7);
    hedge(3, 4, 3, 7);
    hedge(-4, 7, 7, 7);
    hedge(5, 3, 5, 7);
    hedge(-7, -3, -5, -3);

    const fountainMat = new THREE.MeshLambertMaterial({ color: 0x667788 });
    const fountain = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.2, 0.6, 12), fountainMat);
    fountain.position.set(cx, 0.3, cz);
    scene.add(fountain);
    const waterMat = new THREE.MeshBasicMaterial({ color: 0x4488cc, transparent: true, opacity: 0.6 });
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.1, 12), waterMat);
    water.position.set(cx, 0.55, cz);
    scene.add(water);

    makeFlowerPatch(cx - 12, cz - 12, 10, 2);
    makeFlowerPatch(cx + 12, cz - 12, 10, 2);
    makeFlowerPatch(cx - 12, cz + 12, 10, 2);
    makeTree(cx - 14, cz - 14, 4);
    makeTree(cx + 14, cz - 14, 3.5);
    makeTree(cx - 14, cz + 14, 4);
    makeTree(cx + 14, cz + 14, 3.5);
  }

  function buildRecordStore() {
    const cx = -55, cz = 30;
    box(10, 6, 8, 0x2a1a2a, cx, 3, cz);

    const winMat = new THREE.MeshBasicMaterial({ color: 0xdd88ff, transparent: true, opacity: 0.4 });
    const win = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), winMat);
    win.position.set(cx, 3, cz + 4.05);
    scene.add(win);

    const signMat = new THREE.MeshBasicMaterial({ color: 0xee66ff });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(7, 1, 0.2), signMat);
    sign.position.set(cx, 5.8, cz + 4.1);
    scene.add(sign);

    const discMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.05, 16), discMat);
    disc.rotation.x = Math.PI / 2;
    disc.position.set(cx + 3, 3.5, cz + 4.15);
    scene.add(disc);
    const labelMat = new THREE.MeshBasicMaterial({ color: 0xff4488 });
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.06, 12), labelMat);
    label.rotation.x = Math.PI / 2;
    label.position.set(cx + 3, 3.5, cz + 4.2);
    scene.add(label);

    const awningMat = new THREE.MeshLambertMaterial({ color: 0x8844aa });
    const awning = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.15, 2), awningMat);
    awning.position.set(cx, 5.2, cz + 5);
    scene.add(awning);

    makeBench(cx - 3, cz + 6, 0);
    makeFlowerPatch(cx + 4, cz + 6, 5, 1.5);
  }

  function buildGrocery() {
    const cx = 35, cz = 30;
    box(10, 7, 8, 0x2a3a1a, cx, 3.5, cz);

    const winMat = new THREE.MeshBasicMaterial({ color: 0xccff88, transparent: true, opacity: 0.35 });
    const win = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.5), winMat);
    win.position.set(cx, 3, cz + 4.05);
    scene.add(win);

    const signMat = new THREE.MeshBasicMaterial({ color: 0x88cc44 });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(8, 1.2, 0.2), signMat);
    sign.position.set(cx, 6.5, cz + 4.1);
    scene.add(sign);

    for (let i = 0; i < 5; i++) {
      const flameMat = new THREE.MeshBasicMaterial({ color: 0xff6622, transparent: true, opacity: 0.6 + Math.random() * 0.3 });
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.4 + Math.random() * 0.3, 1.5 + Math.random() * 1.5, 5), flameMat);
      flame.position.set(cx - 2 + Math.random() * 4, 7.5 + Math.random(), cz - 1 + Math.random() * 2);
      scene.add(flame);
      groceryFlames.push({ mesh: flame, baseY: flame.position.y, speed: 1 + Math.random() * 2 });
    }
    const fireLight = new THREE.PointLight(0xff6622, 3, 15);
    fireLight.position.set(cx, 8, cz);
    scene.add(fireLight);

    for (let j = 0; j < 3; j++) {
      const smokeMat = new THREE.MeshBasicMaterial({ color: 0x444444, transparent: true, opacity: 0.3 });
      const smoke = new THREE.Mesh(new THREE.SphereGeometry(0.5 + Math.random() * 0.5, 6, 5), smokeMat);
      smoke.position.set(cx - 1 + Math.random() * 2, 9 + Math.random() * 2, cz + Math.random());
      scene.add(smoke);
    }

    const awningMat = new THREE.MeshLambertMaterial({ color: 0x885533 });
    const awning = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.12, 2), awningMat);
    awning.position.set(cx, 5.5, cz + 5);
    scene.add(awning);
  }

  function buildBank() {
    const cx = -55, cz = -30;
    box(12, 8, 10, 0x3a3a4a, cx, 4, cz);

    for (let i = 0; i < 4; i++) {
      cylinder(0.3, 0.35, 6, 0xccccbb, cx - 4 + i * 2.7, 3, cz + 5.2, 10);
    }

    const pedMat = new THREE.MeshLambertMaterial({ color: 0x4a4a5a });
    const pedGeo = new THREE.CylinderGeometry(0, 7, 2.5, 3);
    const ped = new THREE.Mesh(pedGeo, pedMat);
    ped.position.set(cx, 9, cz + 5);
    ped.rotation.set(Math.PI / 2, Math.PI / 6, Math.PI / 2);
    scene.add(ped);

    const vaultMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const vault = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.15, 16), vaultMat);
    vault.rotation.x = Math.PI / 2;
    vault.position.set(cx, 2.5, cz + 5.1);
    scene.add(vault);

    const dollarMat = new THREE.MeshBasicMaterial({ color: 0x44aa44 });
    const dollar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.6, 0.1), dollarMat);
    dollar.position.set(cx, 2.5, cz + 5.2);
    scene.add(dollar);

    for (let s = 0; s < 3; s++) {
      box(13, 0.25, 1.5, 0xaaaaaa, cx, 0.12 + s * 0.25, cz + 6 + s * 0.5);
    }
  }

  function buildCampfire() {
    const cx = -75, cz = -65;

    const pines: [number,number][] = [
      [-8,-8],[-5,-10],[-10,-5],[-12,0],[-8,5],[-14,-8],
      [-3,-12],[5,-10],[8,-8],[10,-5],[12,0],[8,5],
      [-5,8],[0,10],[5,8],[-10,8],[10,8],[-14,5],
      [14,-5],[-6,-6],[6,-6],[0,-8],[-3,5],[3,-5],
    ];
    pines.forEach(([px, pz]) => makePine(cx + px, cz + pz, 5 + Math.random() * 4));

    for (let a = 0; a < Math.PI * 2; a += 0.7) {
      sphere(0.25, 0x556666, cx + Math.cos(a) * 1.2, 0.2, cz + Math.sin(a) * 1.2, 5);
    }

    const fireLightCamp = new THREE.PointLight(0xff6622, 4, 12);
    fireLightCamp.position.set(cx, 1.5, cz);
    scene.add(fireLightCamp);

    const fireColors = [0xff4400, 0xff8800, 0xffcc00, 0xff6600];
    for (let fi = 0; fi < 4; fi++) {
      const fmat = new THREE.MeshBasicMaterial({ color: fireColors[fi], transparent: true, opacity: 0.7 });
      const flm = new THREE.Mesh(new THREE.ConeGeometry(0.2 + Math.random() * 0.15, 0.8 + Math.random() * 0.6, 5), fmat);
      flm.position.set(cx + (Math.random() - 0.5) * 0.5, 0.6, cz + (Math.random() - 0.5) * 0.5);
      scene.add(flm);
    }

    const trailers: [number, number, number][] = [[4, 3, -0.3], [-5, 4, 0.5]];
    trailers.forEach(([dx, dz, ry]) => {
      const group = new THREE.Group();
      const bodyMat = new THREE.MeshLambertMaterial({ color: 0xccccbb });
      const body = new THREE.Mesh(new THREE.BoxGeometry(3, 1.8, 1.8), bodyMat);
      body.position.y = 1.1;
      group.add(body);
      const topMat = new THREE.MeshLambertMaterial({ color: 0xddddcc });
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 3, 8, 1, false, 0, Math.PI), topMat);
      top.rotation.z = Math.PI / 2;
      top.position.y = 1.9;
      group.add(top);
      [-0.8, 0.8].forEach((wx) => {
        const wheelMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.15, 8), wheelMat);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(wx, 0.3, 0.95);
        group.add(wheel);
      });
      const hitchMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
      const hitch = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 0.1), hitchMat);
      hitch.position.set(2, 0.5, 0);
      group.add(hitch);
      group.position.set(cx + dx, 0, cz + dz);
      group.rotation.y = ry;
      scene.add(group);
    });

    [0.5, 2, 3.5, 5].forEach((angle) => {
      const logMat = new THREE.MeshLambertMaterial({ color: 0x4a3020 });
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 1.5, 6), logMat);
      log.rotation.z = Math.PI / 2;
      log.position.set(cx + Math.cos(angle) * 2.5, 0.3, cz + Math.sin(angle) * 2.5);
      log.rotation.y = angle;
      scene.add(log);
    });
  }

  function buildFarm() {
    const cx = -70, cz = 65;

    box(8, 5, 6, 0x8b4422, cx - 5, 2.5, cz);
    const roofMat2 = new THREE.MeshLambertMaterial({ color: 0x663311 });
    const roofGeo2 = new THREE.CylinderGeometry(0, 5.5, 2.5, 4);
    const roof2 = new THREE.Mesh(roofGeo2, roofMat2);
    roof2.position.set(cx - 5, 6.2, cz);
    roof2.rotation.y = Math.PI / 4;
    scene.add(roof2);
    box(2, 3, 0.15, 0x552200, cx - 5, 1.5, cz + 3.1);

    const fieldW = 12, fieldD = 10;
    const fx = cx + 3, fz = cz;

    function fencePost(fpx: number, fpz: number) {
      const r = cylinder(0.06, 0.08, 1, 0x5a4a38, fpx, 0.5, fpz, 5);
      matTrackers.fences.push(r.mat);
    }

    for (let pi = 0; pi <= 4; pi++) {
      fencePost(fx + pi * (fieldW / 4), fz - fieldD / 2);
      fencePost(fx + pi * (fieldW / 4), fz + fieldD / 2);
    }
    for (let pj = 1; pj < 4; pj++) {
      fencePost(fx, fz - fieldD / 2 + pj * (fieldD / 4));
      fencePost(fx + fieldW, fz - fieldD / 2 + pj * (fieldD / 4));
    }

    function fenceRail(x1: number, z1: number, x2: number, z2: number, h: number) {
      const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
      const len = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
      const angle = Math.atan2(x2 - x1, z2 - z1);
      const r = box(0.06, 0.06, len, 0x5a4a38, mx, h, mz);
      r.mesh.rotation.y = angle;
      matTrackers.fences.push(r.mat);
    }

    [0.35, 0.7].forEach((h) => {
      fenceRail(fx, fz - fieldD / 2, fx + fieldW, fz - fieldD / 2, h);
      fenceRail(fx, fz + fieldD / 2, fx + fieldW, fz + fieldD / 2, h);
      fenceRail(fx, fz - fieldD / 2, fx, fz + fieldD / 2, h);
      fenceRail(fx + fieldW, fz - fieldD / 2, fx + fieldW, fz + fieldD / 2, h);
    });

    // The yak
    const yakGroup = new THREE.Group();
    const yakBodyMat = new THREE.MeshLambertMaterial({ color: 0x4a3828 });
    const yakBody = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 1), yakBodyMat);
    yakBody.position.y = 1.2;
    yakGroup.add(yakBody);
    const yakHeadMat = new THREE.MeshLambertMaterial({ color: 0x3a2818 });
    const yakHead = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.6), yakHeadMat);
    yakHead.position.set(1.2, 1.4, 0);
    yakGroup.add(yakHead);
    [-0.3, 0.3].forEach((side) => {
      const hornMat = new THREE.MeshLambertMaterial({ color: 0xccbb99 });
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.5, 5), hornMat);
      horn.position.set(1.3, 1.9, side);
      horn.rotation.z = side > 0 ? -0.4 : 0.4;
      yakGroup.add(horn);
    });
    ([[-0.6,-0.35],[-0.6,0.35],[0.6,-0.35],[0.6,0.35]] as [number,number][]).forEach(([lx,lz]) => {
      const legMat = new THREE.MeshLambertMaterial({ color: 0x3a2818 });
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), legMat);
      leg.position.set(lx, 0.4, lz);
      yakGroup.add(leg);
    });
    for (let fi = 0; fi < 6; fi++) {
      const furMat = new THREE.MeshLambertMaterial({ color: 0x5a4838 });
      const fur = new THREE.Mesh(new THREE.SphereGeometry(0.25 + Math.random() * 0.15, 5, 4), furMat);
      fur.position.set(-0.5 + Math.random() * 1.5, 1 + Math.random() * 0.6, -0.3 + Math.random() * 0.6);
      yakGroup.add(fur);
    }
    yakGroup.position.set(fx + fieldW / 2, 0, fz);
    scene.add(yakGroup);

    makeFlowerPatch(fx + fieldW / 2, fz, 8, 4);
    makeTree(cx - 10, cz - 5, 3.5);
    makeTree(cx - 10, cz + 5, 4);
  }

  function buildPoliceStation() {
    const cx = -35, cz = -55;
    box(12, 7, 10, 0x3a4050, cx, 3.5, cz);
    box(4, 3.5, 1, 0x556070, cx, 1.75, cz + 5.5);
    box(12.5, 0.4, 10.5, 0x2a3040, cx, 7.2, cz);

    const policeLightMat = new THREE.MeshBasicMaterial({ color: 0x4444ff, transparent: true, opacity: 0.8 });
    const policeLight = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 0.6), policeLightMat);
    policeLight.position.set(cx, 7.8, cz);
    scene.add(policeLight);
    const pLight = new THREE.PointLight(0x4444ff, 2, 10);
    pLight.position.set(cx, 8, cz);
    scene.add(pLight);

    const badgeMat = new THREE.MeshBasicMaterial({ color: 0xddcc44 });
    const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.6, 0.1, 6), badgeMat);
    badge.rotation.x = Math.PI / 2;
    badge.position.set(cx, 5, cz + 5.1);
    scene.add(badge);

    for (let s = 0; s < 2; s++) {
      box(5, 0.2, 1, 0x888888, cx, 0.1 + s * 0.2, cz + 6.2 + s * 0.4);
    }

    cylinder(0.04, 0.04, 6, 0x888888, cx - 5, 3, cz + 5.5, 6);
    const flagMat = new THREE.MeshBasicMaterial({ color: 0x2244aa, side: THREE.DoubleSide });
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1), flagMat);
    flag.position.set(cx - 4.2, 5.5, cz + 5.5);
    scene.add(flag);

    makeTree(cx + 7, cz + 6, 3.5);
    makeBench(cx - 7, cz + 7, 0);
  }

  function buildAuctionHouse() {
    const cx = 45, cz = -30;
    box(12, 9, 10, 0x4a3820, cx, 4.5, cz);
    box(3, 5, 0.5, 0x3a2810, cx, 2.5, cz + 5.2);

    const archMat = new THREE.MeshLambertMaterial({ color: 0x5a4830 });
    const arch = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.5, 12, 1, false, 0, Math.PI), archMat);
    arch.rotation.set(0, Math.PI / 2, Math.PI / 2);
    arch.position.set(cx, 5.2, cz + 5.2);
    scene.add(arch);

    box(13, 0.5, 11, 0x6a5840, cx, 9.2, cz);

    const signMat = new THREE.MeshBasicMaterial({ color: 0xddaa44 });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(6, 1, 0.15), signMat);
    sign.position.set(cx, 7.5, cz + 5.15);
    scene.add(sign);

    const gavelMat = new THREE.MeshLambertMaterial({ color: 0x664422 });
    const gavelHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.5, 6), gavelMat);
    gavelHandle.position.set(cx + 2, 7.5, cz + 5.3);
    gavelHandle.rotation.z = -0.4;
    scene.add(gavelHandle);
    const gavelHead = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.3), gavelMat);
    gavelHead.position.set(cx + 2.5, 8.1, cz + 5.3);
    scene.add(gavelHead);

    for (let s = 0; s < 3; s++) {
      box(5, 0.25, 1, 0x888877, cx, 0.12 + s * 0.25, cz + 5.8 + s * 0.5);
    }

    makeTree(cx - 7, cz + 6, 3.5);
    makeTree(cx + 7, cz + 6, 4);
    makeBench(cx + 8, cz + 5, -Math.PI / 2);
  }

  function buildPaintPark() {
    const cx = 0, cz = 85;

    // River (curved, with animated water strips)
    // Create a curved river path using a series of planes
    const riverCurvePoints = [
      { x: -60, z: cz + 15, w: 14 },
      { x: -40, z: cz + 17, w: 15 },
      { x: -20, z: cz + 18, w: 16 },
      { x: 0,   z: cz + 16, w: 15 },
      { x: 20,  z: cz + 14, w: 14 },
      { x: 40,  z: cz + 16, w: 15 },
      { x: 60,  z: cz + 18, w: 16 },
    ];

    // Build river from segments
    for (let i = 0; i < riverCurvePoints.length - 1; i++) {
      const p1 = riverCurvePoints[i];
      const p2 = riverCurvePoints[i + 1];
      const mx = (p1.x + p2.x) / 2;
      const mz = (p1.z + p2.z) / 2;
      const segLen = Math.sqrt((p2.x - p1.x) ** 2 + (p2.z - p1.z) ** 2);
      const angle = Math.atan2(p2.z - p1.z, p2.x - p1.x);
      const avgW = (p1.w + p2.w) / 2;

      const riverMat = new THREE.MeshBasicMaterial({ color: 0x1a4878, transparent: true, opacity: 0.85 });
      const riverSeg = new THREE.Mesh(new THREE.PlaneGeometry(segLen + 2, avgW), riverMat);
      riverSeg.rotation.x = -Math.PI / 2;
      riverSeg.rotation.z = -angle;
      riverSeg.position.set(mx, 0.03, mz);
      scene.add(riverSeg);
      matTrackers.water.push(riverMat);

      // Water shimmer strips
      for (let si = 0; si < 4; si++) {
        const shimMat = new THREE.MeshBasicMaterial({ color: 0x3868a8, transparent: true, opacity: 0.2 + Math.random() * 0.2 });
        const shimW = 3 + Math.random() * 4;
        const shim = new THREE.Mesh(new THREE.PlaneGeometry(shimW, 0.4), shimMat);
        shim.rotation.x = -Math.PI / 2;
        shim.rotation.z = -angle;
        shim.position.set(mx + (Math.random() - 0.5) * segLen * 0.6, 0.04, mz + (Math.random() - 0.5) * avgW * 0.4);
        scene.add(shim);
        matTrackers.waterHighlights.push(shimMat);
        riverWaterMeshes.push(shim);
      }
    }

    // Riverbanks (slightly elevated edges)
    for (let bi = -55; bi <= 55; bi += 5) {
      const bankZ = cz + 15 + Math.sin(bi * 0.05) * 2;
      [-1, 1].forEach((side) => {
        const bankMat = new THREE.MeshLambertMaterial({ color: 0x3a6830 });
        const bank = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.3, 1.5), bankMat);
        bank.position.set(bi, 0.15, bankZ + side * 8.5);
        scene.add(bank);
        matTrackers.ground.push(bankMat);
      });
    }

    const parkMat = new THREE.MeshLambertMaterial({ color: 0x1a4818 });
    const park = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), parkMat);
    park.rotation.x = -Math.PI / 2;
    park.position.set(cx, 0.05, cz);
    park.receiveShadow = true;
    scene.add(park);
    matTrackers.ground.push(parkMat);

    // Easels facing the river (rotated to look towards +z)
    const canvasColors = [0xff4444, 0x44aaff, 0xffcc00, 0x44ff88, 0xff88cc];
    for (let i = 0; i < 5; i++) {
      const easelX = cx - 8 + i * 4;
      const easelZ = cz + 4;

      const legMat = new THREE.MeshLambertMaterial({ color: 0x5a4030 });
      [-0.3, 0.3].forEach((dx) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.5, 0.06), legMat);
        leg.position.set(easelX + dx, 1.25, easelZ);
        scene.add(leg);
      });
      const backLeg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.2, 0.06), legMat);
      backLeg.position.set(easelX, 1.1, easelZ - 0.8);
      backLeg.rotation.x = -0.3;
      scene.add(backLeg);

      // Canvas facing +z (toward the river)
      const canvasMat = new THREE.MeshBasicMaterial({ color: canvasColors[i], transparent: true, opacity: 0.7 });
      const canvasPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1), canvasMat);
      canvasPlane.position.set(easelX, 1.8, easelZ + 0.05);
      // Face toward the river (already facing +z by default for a PlaneGeometry)
      scene.add(canvasPlane);

      const frame = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(1.3, 1.1)),
        new THREE.LineBasicMaterial({ color: 0x443322 })
      );
      frame.position.set(easelX, 1.8, easelZ + 0.06);
      scene.add(frame);
    }

    for (let ti = 0; ti < 6; ti++) {
      makeTree(cx - 15 + ti * 6, cz - 4, 3 + Math.random() * 2);
    }
    makeBench(cx - 5, cz - 7, 0);
    makeBench(cx + 5, cz - 7, 0);
    makeFlowerPatch(cx - 10, cz - 5, 8, 3);
    makeFlowerPatch(cx + 10, cz - 5, 8, 3);
  }

  function buildRadioStation() {
    // Moved further from maze (was 50, 55 -> now 75, 85)
    const cx = 75, cz = 85;
    box(8, 7, 7, 0x2a3040, cx, 3.5, cz);

    cylinder(0.08, 0.15, 8, 0x667788, cx, 11, cz, 6);
    for (let h = 8; h < 15; h += 2.5) {
      box(1.5, 0.06, 0.06, 0x667788, cx, h, cz);
      box(0.06, 0.06, 1.5, 0x667788, cx, h, cz);
    }

    const radioLight = new THREE.PointLight(0xff2222, 3, 10);
    radioLight.position.set(cx, 15.5, cz);
    scene.add(radioLight);
    const radioLightBulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xff3333 })
    );
    radioLightBulb.position.set(cx, 15.5, cz);
    scene.add(radioLightBulb);

    const dishMat = new THREE.MeshLambertMaterial({ color: 0xcccccc, side: THREE.DoubleSide });
    const dishGeo = new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 3);
    const dish = new THREE.Mesh(dishGeo, dishMat);
    dish.position.set(cx + 4, 7.5, cz);
    dish.rotation.x = -Math.PI / 4;
    dish.rotation.z = Math.PI / 6;
    scene.add(dish);

    const signMat = new THREE.MeshBasicMaterial({ color: 0x4488ff });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(5, 1, 0.15), signMat);
    sign.position.set(cx, 6, cz + 3.6);
    scene.add(sign);

    for (let i = 0; i < 3; i++) {
      const arcMat = new THREE.MeshBasicMaterial({ color: 0x88bbff, transparent: true, opacity: 0.4 - i * 0.1 });
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.8 + i * 0.5, 0.05, 4, 12, Math.PI), arcMat);
      arc.position.set(cx - 2, 4, cz + 3.6);
      arc.rotation.y = Math.PI / 2;
      scene.add(arc);
    }

    box(2, 3, 0.3, 0x1a2030, cx, 1.5, cz + 3.6);
    makeTree(cx - 5, cz + 5, 3.5);
    makeTree(cx + 5, cz + 5, 4);
  }

  // ── Theme application ────────────────────────────────────────────
  function applyThemeToScene(themeName: "dark" | "light") {
    const T = THEMES[themeName];

    skyMat.color.set(T.sky);
    renderer.setClearColor(T.sky);
    renderer.toneMappingExposure = T.exposure;

    ambient.color.set(T.ambientColor); ambient.intensity = T.ambientInt;
    sunMoon.color.set(T.sunColor); sunMoon.intensity = T.sunInt;
    fill.color.set(T.fillColor); fill.intensity = T.fillInt;

    if (themeName === "light") {
      sunMoon.position.set(-40, 80, -30);
    } else {
      sunMoon.position.set(-30, 50, -20);
    }

    matTrackers.ground.forEach((m) => m.color.set(T.grass));
    groundMat.color.set(T.ground);
    matTrackers.hills.forEach((m) => m.color.set(T.hillColor));
    matTrackers.distTrees.forEach((m) => m.color.set(T.distTreeColor));
    matTrackers.roads.forEach((m) => m.color.set(T.road));
    matTrackers.roadLines.forEach((m) => m.color.set(T.roadLine));
    matTrackers.sidewalks.forEach((m) => m.color.set(T.sidewalk));

    buildingMat.color.set(T.building);
    facadeMat.color.set(T.facade);
    roofMat.color.set(T.roof);
    antMat.color.set(T.antenna);
    ledgeMeshes.forEach((l) => (l.material as THREE.MeshLambertMaterial).color.set(T.ledge));
    colMeshes.forEach((c) => (c.material as THREE.MeshLambertMaterial).color.set(T.ledge));

    matTrackers.treeTrunks.forEach((m) => m.color.set(T.treeTrunk));
    matTrackers.treeCanopies.forEach((m, i) => m.color.set(T.treeCanopy[i % T.treeCanopy.length]));
    matTrackers.pineTrees.forEach((m, i) => m.color.set(T.pineTree[i % T.pineTree.length]));
    matTrackers.flowers.forEach((m, i) => m.color.set(T.flowerColors[i % T.flowerColors.length]));
    matTrackers.benches.forEach((m) => m.color.set(T.benchColor));
    matTrackers.fences.forEach((m) => m.color.set(T.fenceColor));
    matTrackers.water.forEach((m) => m.color.set(T.waterColor));
    matTrackers.waterHighlights.forEach((m) => m.color.set(T.waterHighlight));

    matTrackers.cityBuildings.forEach((o) => o.mat.color.set(T.cityBlock[o.ci % T.cityBlock.length]));
    matTrackers.cityRoofs.forEach((o) => o.mat.color.set(T.cityRoof[o.ci % T.cityRoof.length]));
    matTrackers.cityWindows.forEach((m, i) => {
      m.color.set(T.cityWinColors[i % T.cityWinColors.length]);
      m.opacity = T.cityWinOpMin + Math.random() * T.cityWinOpRange;
    });

    matTrackers.streetPoles.forEach((m) => m.color.set(T.streetPole));
    matTrackers.streetLightPts.forEach((l) => {
      l.intensity = T.streetLightInt;
      l.distance = T.streetLightDist;
      l.color.set(T.streetLightColor);
    });
    matTrackers.streetLightBulbs.forEach((m) => {
      m.color.set(themeName === "dark" ? 0xffffcc : 0xfff8d0);
      m.opacity = themeName === "dark" ? 1.0 : 0.3;
    });

    // Clouds: visible in daytime, faint at night
    matTrackers.clouds.forEach((m) => {
      m.opacity = themeName === "light" ? 0.7 : 0.15;
    });

    windowLights.forEach((wl) => { wl.intensity = T.winLightInt; });
    windowGlows.forEach((g) => { (g.material as THREE.MeshBasicMaterial).opacity = T.glowOpacity; });
  }

  // ── Camera control ──────────────────────────────────────────────
  function setViewInternal(v: CityView) {
    if (freeCamera) return;
    currentView = v;
    activeGameId = null;
    gameLabelText = "";

    if (v === "city") {
      scrollHintText = "Scroll to orbit";
      camPosTarget.copy(CITY_VIEW_POS);
      camLookTarget.copy(CITY_VIEW_TARGET);
      camLerpSpeed = 0.04;
    } else if (v === "tower") {
      scrollHintText = "Scroll to navigate floors";
      const towerPos = new THREE.Vector3(0, BUILDING_H * 0.5 - scrollOffset + 5, 20);
      const towerTarget = new THREE.Vector3(0, BUILDING_H * 0.5 - scrollOffset, 0);
      camPosTarget.copy(towerPos);
      camLookTarget.copy(towerTarget);
      camLerpSpeed = 0.06;
    }
  }

  function goToGame(gameId: string) {
    const loc = GAME_LOCATIONS[gameId];
    if (!loc) return;
    currentView = "game";
    activeGameId = gameId;
    gameLabelText = loc.label;
    scrollHintText = "";

    camPosTarget.set(loc.cam.x, loc.cam.y, loc.cam.z);
    camLookTarget.set(loc.scene.x, loc.scene.y + 3, loc.scene.z);
    camLerpSpeed = 0.035;
  }

  // ── Zoom-snap logic ────────────────────────────────────────────
  function snapToView(direction: "in" | "out") {
    if (freeCamera || isZooming) return;
    isZooming = true;

    if (direction === "in" && currentView === "city") {
      setViewInternal("tower");
    } else if (direction === "out" && currentView === "tower") {
      setViewInternal("city");
    } else if (direction === "out" && currentView === "game") {
      setViewInternal("tower");
    }

    // Debounce so rapid scroll doesn't toggle back and forth
    setTimeout(() => { isZooming = false; }, 800);
  }

  // ── Event handlers ──────────────────────────────────────────────
  function onKeyDown(e: KeyboardEvent) {
    keys[e.key.toLowerCase()] = true;

    if (e.key === "f" || e.key === "F") {
      freeCamera = !freeCamera;
      if (freeCamera) {
        freeCamPos.copy(camera.position);
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        freeCamRot.yaw = Math.atan2(dir.x, dir.z);
        freeCamRot.pitch = Math.asin(dir.y);
      }
    }

    // Number keys for game locations (dev)
    const numMap: Record<string, number> = { "1": 0, "2": 1, "3": 2, "4": 3, "5": 4, "6": 5, "7": 6, "8": 7, "9": 8, "0": 9, "-": 10 };
    if (numMap[e.key] !== undefined) {
      const game = games[numMap[e.key]];
      if (game) goToGame(game.id);
    }

    if (e.key === "p" || e.key === "P") {
      const p = camera.position;
      console.log(`Camera: (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`);
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    keys[e.key.toLowerCase()] = false;
  }

  let wheelAccum = 0;
  const WHEEL_SNAP_THRESHOLD = 60;

  function onWheel(e: WheelEvent) {
    if (freeCamera) return;

    if (currentView === "tower") {
      // Accumulate scroll for floor navigation
      targetScrollOffset = Math.max(0, Math.min(MAX_SCROLL, targetScrollOffset + e.deltaY * 0.04));

      // Detect strong zoom-out gesture
      wheelAccum += e.deltaY;
      if (wheelAccum > WHEEL_SNAP_THRESHOLD * 3) {
        // User is scrolling down a lot past bottom — snap to city view
        if (targetScrollOffset >= MAX_SCROLL - 1) {
          snapToView("out");
          wheelAccum = 0;
        }
      }
      if (wheelAccum < -WHEEL_SNAP_THRESHOLD * 3) {
        wheelAccum = 0;
      }
    } else if (currentView === "city") {
      // In city view, scroll orbits. But zoom-in gesture snaps to tower
      wheelAccum += e.deltaY;
      if (wheelAccum < -WHEEL_SNAP_THRESHOLD) {
        snapToView("in");
        wheelAccum = 0;
      } else {
        const rotSpeed = e.deltaY * 0.001;
        const pos = CITY_VIEW_POS;
        const dist = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
        const cAngle = Math.atan2(pos.z, pos.x) + rotSpeed;
        CITY_VIEW_POS.x = Math.cos(cAngle) * dist;
        CITY_VIEW_POS.z = Math.sin(cAngle) * dist;
        camPosTarget.copy(CITY_VIEW_POS);
        wheelAccum = 0; // reset so orbit doesn't accidentally trigger zoom
      }
    } else if (currentView === "game" && activeGameId) {
      // In game view, scroll out goes back to tower
      wheelAccum += e.deltaY;
      if (Math.abs(wheelAccum) > WHEEL_SNAP_THRESHOLD) {
        snapToView("out");
        wheelAccum = 0;
      }
    }
  }

  function onMouseMove(e: MouseEvent) {
    const rect = containerEl.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    tooltipX = e.clientX + 14;
    tooltipY = e.clientY - 10;
  }

  function onClick() {
    if (freeCamera) return;
    if (currentView !== "tower") return;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(windowMeshes);
    if (hits.length) {
      const idx = windowMeshes.indexOf(hits[0].object as THREE.Mesh);
      if (idx >= 0) {
        const game = games[idx];
        if (game) {
          goToGame(game.id);
          if (readonly) {
            dispatch("detail", { gameId: game.id });
          } else {
            dispatch("select", { gameId: game.id });
          }
        }
      }
    }
  }

  function onResize() {
    if (!renderer || !camera) return;
    const w = containerEl?.clientWidth ?? window.innerWidth;
    const h = containerEl?.clientHeight ?? window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  // Touch support
  let touchStartY = 0;
  let touchStartX = 0;
  let pinchStartDist = 0;
  let isTouchTap = true;

  function getTouchDist(e: TouchEvent): number {
    if (e.touches.length < 2) return 0;
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function onTouchStart(e: TouchEvent) {
    touchStartY = e.touches[0].clientY;
    touchStartX = e.touches[0].clientX;
    isTouchTap = true;
    // Update mouse for raycasting
    const rect = containerEl.getBoundingClientRect();
    mouse.x = ((e.touches[0].clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.touches[0].clientY - rect.top) / rect.height) * 2 + 1;

    if (e.touches.length === 2) {
      pinchStartDist = getTouchDist(e);
      isTouchTap = false;
    }
  }

  function onTouchMove(e: TouchEvent) {
    // Pinch zoom
    if (e.touches.length === 2) {
      isTouchTap = false;
      const newDist = getTouchDist(e);
      const delta = newDist - pinchStartDist;
      if (Math.abs(delta) > 40) {
        snapToView(delta > 0 ? "in" : "out");
        pinchStartDist = newDist;
      }
      return;
    }

    const dy = e.touches[0].clientY - touchStartY;
    const dx = e.touches[0].clientX - touchStartX;

    if (Math.abs(dy) > 8 || Math.abs(dx) > 8) isTouchTap = false;

    touchStartY = e.touches[0].clientY;
    touchStartX = e.touches[0].clientX;

    if (currentView === "tower") {
      targetScrollOffset = Math.max(0, Math.min(MAX_SCROLL, targetScrollOffset - dy * 0.08));
    } else if (currentView === "city") {
      const rotSpeed = dx * 0.002;
      const pos = CITY_VIEW_POS;
      const dist = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
      const cAngle = Math.atan2(pos.z, pos.x) + rotSpeed;
      CITY_VIEW_POS.x = Math.cos(cAngle) * dist;
      CITY_VIEW_POS.z = Math.sin(cAngle) * dist;
      camPosTarget.copy(CITY_VIEW_POS);
    } else if (currentView === "game" && activeGameId) {
      camPosTarget.y = Math.max(5, Math.min(35, camPosTarget.y - dy * 0.06));
    }
  }

  function onTouchEnd() {
    if (!isTouchTap) return;
    // Check for tap (not swipe) — use the last known mouse position
    if (currentView === "tower") {
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(windowMeshes);
      if (hits.length) {
        const idx = windowMeshes.indexOf(hits[0].object as THREE.Mesh);
        if (idx >= 0) {
          const game = games[idx];
          if (game) {
            goToGame(game.id);
            if (readonly) {
              dispatch("detail", { gameId: game.id });
            } else {
              dispatch("select", { gameId: game.id });
            }
          }
        }
      }
    }
  }

  // ── Animation loop ──────────────────────────────────────────────
  function animate() {
    if (disposed) return;
    animFrameId = requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    // Free camera movement
    if (freeCamera) {
      const speed = keys["shift"] ? 40 : 15;
      const forward = new THREE.Vector3(Math.sin(freeCamRot.yaw), 0, Math.cos(freeCamRot.yaw));
      const right = new THREE.Vector3(Math.cos(freeCamRot.yaw), 0, -Math.sin(freeCamRot.yaw));

      if (keys["w"]) freeCamPos.add(forward.clone().multiplyScalar(speed * 0.016));
      if (keys["s"]) freeCamPos.add(forward.clone().multiplyScalar(-speed * 0.016));
      if (keys["a"]) freeCamPos.add(right.clone().multiplyScalar(-speed * 0.016));
      if (keys["d"]) freeCamPos.add(right.clone().multiplyScalar(speed * 0.016));
      if (keys["q"]) freeCamPos.y -= speed * 0.016;
      if (keys["e"]) freeCamPos.y += speed * 0.016;
      if (keys["arrowleft"]) freeCamRot.yaw += 1.5 * 0.016;
      if (keys["arrowright"]) freeCamRot.yaw -= 1.5 * 0.016;
      if (keys["arrowup"]) freeCamRot.pitch = Math.min(1.4, freeCamRot.pitch + 1.0 * 0.016);
      if (keys["arrowdown"]) freeCamRot.pitch = Math.max(-1.4, freeCamRot.pitch - 1.0 * 0.016);

      camera.position.copy(freeCamPos);
      const lookDir = new THREE.Vector3(
        Math.sin(freeCamRot.yaw) * Math.cos(freeCamRot.pitch),
        Math.sin(freeCamRot.pitch),
        Math.cos(freeCamRot.yaw) * Math.cos(freeCamRot.pitch)
      );
      camera.lookAt(freeCamPos.clone().add(lookDir));
    } else {
      // Smooth camera
      scrollOffset += (targetScrollOffset - scrollOffset) * 0.08;
      if (currentView === "tower") {
        camPosTarget.set(0, BUILDING_H * 0.5 - scrollOffset + 5, 20);
        camLookTarget.set(0, BUILDING_H * 0.5 - scrollOffset, 0);
      }
      camPos.lerp(camPosTarget, camLerpSpeed);
      camTarget.lerp(camLookTarget, camLerpSpeed);
      camera.position.copy(camPos);
      camera.lookAt(camTarget);
    }

    // Antenna blink
    antLight.intensity = dark ? 1.5 + 1.5 * Math.round(Math.sin(t * 1.5) * 0.5 + 0.5) : 0;

    // Window pane pulse
    const winBase = THEMES[dark ? "dark" : "light"].winOpacityBase;
    windowMeshes.forEach((win, i) => {
      (win.material as THREE.MeshBasicMaterial).opacity = winBase + 0.08 * Math.sin(t * 0.6 + i * 0.7);
    });

    // Grocery fire animation
    groceryFlames.forEach((f) => {
      f.mesh.position.y = f.baseY + Math.sin(t * f.speed) * 0.3;
      f.mesh.rotation.y = t * f.speed * 0.5;
    });

    // Car animation
    cars.forEach((car) => {
      car.progress += car.speed * 0.016;
      if (car.progress > car.range) car.progress = -car.range;
      if (car.progress < -car.range) car.progress = car.range;

      if (car.roadAxis === "x") {
        car.group.position.x = car.progress;
        car.group.position.z = car.roadPos;
        car.group.rotation.y = car.speed > 0 ? 0 : Math.PI;
      } else {
        car.group.position.z = car.progress;
        car.group.position.x = car.roadPos;
        car.group.rotation.y = car.speed > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
    });

    // Cloud animation
    clouds.forEach((cloud) => {
      cloud.mesh.position.x = cloud.baseX + Math.sin(t * cloud.speed * 0.1) * cloud.range * 0.3;
      cloud.mesh.position.z += Math.sin(t * 0.05 + cloud.baseX) * 0.003;
    });

    // River water shimmer animation
    riverFlowOffset = t * 0.5;
    riverWaterMeshes.forEach((mesh, i) => {
      mesh.position.x += Math.sin(t * 0.3 + i * 1.5) * 0.008;
      (mesh.material as THREE.MeshBasicMaterial).opacity = 0.15 + 0.15 * Math.sin(t * 0.8 + i * 2.0);
    });

    // Hover (tower view)
    if (!freeCamera && currentView === "tower") {
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(windowMeshes);
      if (hits.length) {
        const idx = windowMeshes.indexOf(hits[0].object as THREE.Mesh);
        if (idx !== hoveredIdx) {
          if (hoveredIdx >= 0) windowGlows[hoveredIdx].scale.set(1, 1, 1);
          hoveredIdx = idx;
          const g = games[idx];
          if (g) {
            tooltipName = g.label;
            tooltipGenre = "";
            tooltipVisible = true;
            windowGlows[idx].scale.set(1.15, 1.15, 1);
          }
        }
      } else {
        if (hoveredIdx >= 0) windowGlows[hoveredIdx].scale.set(1, 1, 1);
        hoveredIdx = -1;
        tooltipVisible = false;
      }
    } else {
      if (hoveredIdx >= 0) {
        windowGlows[hoveredIdx].scale.set(1, 1, 1);
        hoveredIdx = -1;
      }
      tooltipVisible = false;
    }

    renderer.render(scene, camera);
  }

  // ── Start game from city view ────────────────────────────────────
  function handleStartGame() {
    if (activeGameId) {
      dispatch("startGame", { gameId: activeGameId });
    }
  }

  // ── Reactive: apply theme when dark prop changes ──────────────────
  $: if (renderer && skyMat) {
    applyThemeToScene(dark ? "dark" : "light");
  }

  // ── Lifecycle ────────────────────────────────────────────────────
  onMount(() => {
    // -- Renderer
    renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(containerEl.clientWidth, containerEl.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;

    // -- Scene + Camera
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(50, containerEl.clientWidth / containerEl.clientHeight, 0.1, 800);

    // -- Lighting
    ambient = new THREE.AmbientLight(0x2a3a5a, 0.7);
    scene.add(ambient);

    sunMoon = new THREE.DirectionalLight(0x7090c0, 1.4);
    sunMoon.position.set(-40, 80, -30);
    sunMoon.castShadow = true;
    sunMoon.shadow.mapSize.set(2048, 2048);
    const sc = sunMoon.shadow.camera;
    sc.left = -120; sc.right = 120; sc.top = 120; sc.bottom = -120; sc.far = 300;
    scene.add(sunMoon);

    fill = new THREE.DirectionalLight(0x3a4060, 0.35);
    fill.position.set(40, 30, 40);
    scene.add(fill);

    // -- Raycaster
    raycaster = new THREE.Raycaster();
    clock = new THREE.Clock();

    // -- Build the city
    buildCity();

    // -- Apply initial theme
    applyThemeToScene(dark ? "dark" : "light");

    // -- Initialize camera
    const towerPos = new THREE.Vector3(0, BUILDING_H * 0.5 + 5, 20);
    const towerTarget = new THREE.Vector3(0, BUILDING_H * 0.5, 0);
    camPos.copy(towerPos);
    camTarget.copy(towerTarget);
    camPosTarget.copy(towerPos);
    camLookTarget.copy(towerTarget);
    camera.position.copy(towerPos);
    camera.lookAt(towerTarget);

    // -- Event listeners
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("resize", onResize);
    canvasEl.addEventListener("wheel", onWheel, { passive: true });
    canvasEl.addEventListener("mousemove", onMouseMove);
    canvasEl.addEventListener("click", onClick);
    canvasEl.addEventListener("touchstart", onTouchStart, { passive: true });
    canvasEl.addEventListener("touchmove", onTouchMove, { passive: true });
    canvasEl.addEventListener("touchend", onTouchEnd, { passive: true });

    // -- Start animation
    animate();
  });

  onDestroy(() => {
    disposed = true;
    if (animFrameId) cancelAnimationFrame(animFrameId);

    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("resize", onResize);

    if (canvasEl) {
      canvasEl.removeEventListener("wheel", onWheel);
      canvasEl.removeEventListener("mousemove", onMouseMove);
      canvasEl.removeEventListener("click", onClick);
      canvasEl.removeEventListener("touchstart", onTouchStart);
      canvasEl.removeEventListener("touchmove", onTouchMove);
      canvasEl.removeEventListener("touchend", onTouchEnd);
    }

    renderer?.dispose();
  });
</script>

<div class="city-container" bind:this={containerEl}>
  <canvas bind:this={canvasEl}></canvas>

  <!-- Back button + Start Game button (game view) -->
  {#if currentView === "game"}
    <button class="back-btn" on:click={() => setViewInternal("tower")}>
      &larr; Back to Tower
    </button>
    {#if !readonly && activeGameId}
      <button class="start-game-btn" on:click={handleStartGame}>
        Start Game
      </button>
    {/if}
  {/if}

  <!-- Scroll hint -->
  {#if scrollHintText && currentView !== "game"}
    <div class="scroll-hint">
      {currentView === "city" ? "Pinch or scroll to zoom in" : "Scroll to browse - Pinch out for city view"}
    </div>
  {/if}

  <!-- Game label (when viewing a game location) -->
  {#if currentView === "game" && gameLabelText}
    <div class="game-label">{gameLabelText}</div>
  {/if}

  <!-- Tooltip -->
  {#if tooltipVisible}
    <div class="card-tooltip" style="left:{tooltipX}px;top:{tooltipY}px">
      <strong>{tooltipName}</strong>
      {#if tooltipGenre}<br><span class="tooltip-genre">{tooltipGenre}</span>{/if}
    </div>
  {/if}
</div>

<style>
  .city-container {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    border-radius: 12px;
  }

  .city-container canvas {
    display: block;
    width: 100%;
    height: 100%;
  }

  .back-btn {
    position: absolute;
    top: 16px;
    left: 16px;
    z-index: 20;
    padding: 8px 20px;
    border-radius: 30px;
    cursor: pointer;
    font-size: 13px;
    letter-spacing: 0.06em;
    backdrop-filter: blur(12px);
    transition: all 0.4s ease;
    border: 1px solid;
    background: rgba(15,25,45,0.7);
    border-color: rgba(180,210,255,0.2);
    color: #c8deff;
  }
  :global(html.light) .back-btn {
    background: rgba(255,255,255,0.7);
    border-color: rgba(80,120,180,0.3);
    color: #2a4a7a;
  }
  .back-btn:hover { transform: scale(1.05); }

  .start-game-btn {
    position: absolute;
    bottom: 32px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 20;
    padding: 12px 32px;
    border-radius: 40px;
    cursor: pointer;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    backdrop-filter: blur(12px);
    transition: all 0.3s ease;
    border: 2px solid rgba(129,140,248,0.5);
    background: rgba(79,70,229,0.85);
    color: #ffffff;
    box-shadow: 0 4px 20px rgba(79,70,229,0.4);
  }
  .start-game-btn:hover {
    transform: translateX(-50%) scale(1.05);
    background: rgba(99,90,249,0.95);
    box-shadow: 0 6px 28px rgba(79,70,229,0.6);
  }
  .start-game-btn:active {
    transform: translateX(-50%) scale(0.97);
  }
  :global(html.light) .start-game-btn {
    background: rgba(79,70,229,0.9);
    border-color: rgba(79,70,229,0.6);
  }

  .scroll-hint {
    position: absolute;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    pointer-events: none;
    color: rgba(180,210,255,0.3);
    transition: color 1s;
    white-space: nowrap;
  }
  :global(html.light) .scroll-hint {
    color: rgba(40,80,140,0.45);
  }

  .game-label {
    position: absolute;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 14px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    pointer-events: none;
    text-align: center;
    color: rgba(200,225,255,0.8);
    transition: color 1s;
  }
  :global(html.light) .game-label {
    color: rgba(30,60,120,0.75);
  }

  .card-tooltip {
    position: fixed;
    pointer-events: none;
    padding: 10px 16px;
    border-radius: 10px;
    font-size: 13px;
    backdrop-filter: blur(16px);
    z-index: 30;
    border: 1px solid;
    max-width: 220px;
    background: rgba(8,14,30,0.92);
    border-color: rgba(120,180,255,0.25);
    color: #c0d8ff;
  }
  :global(html.light) .card-tooltip {
    background: rgba(240,246,255,0.92);
    border-color: rgba(80,140,220,0.3);
    color: #1a3a6a;
  }

  .tooltip-genre {
    opacity: 0.55;
    font-size: 11px;
  }
</style>
