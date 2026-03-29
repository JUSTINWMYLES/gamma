<script lang="ts">
  /**
   * client/app/src/games/player/ShaveYak.svelte
   *
   * "Shave The Yak" — full 3D version with Three.js.
   *
   * Visual approach:
   *   - Three.js scene with procedurally built yak model from basic geometries
   *   - Fur texture: a canvas texture painted brown, erased along swipe paths
   *   - Pink "skin" material underneath, revealed when fur is shaved
   *   - OrbitControls for camera pan/rotate (two-finger gesture or right-drag)
   *   - Single-finger swipe = shave (raycast to UV, erase fur texture)
   *   - 3D particle puffs on shave
   *
   * Server protocol is unchanged — swipe coords mapped to YAK_W x YAK_H space.
   */
  import { onMount, onDestroy } from "svelte";
  import type { Room } from "colyseus.js";
  import type { RoomState, PlayerState } from "../../../../shared/types";
  import * as THREE from "three";
  import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

  export let room: Room;
  export let state: RoomState;
  export let me: PlayerState | undefined;

  // ── Yak canvas virtual dimensions (must match server YAK_W / YAK_H) ──
  const YAK_W = 300;
  const YAK_H = 280;
  const SHAVE_RADIUS = 8;

  // ── Reactive state ────────────────────────────────────────────────────
  let shavedPercent = 0;
  let score = 0;
  let combo = 0;
  let comboMax = 0;
  let yakOffsetX = 0;
  let yakOffsetY = 0;
  let yakRotation = 0;
  let timeLeft = 0;

  // ── Three.js refs ─────────────────────────────────────────────────────
  let containerEl: HTMLDivElement;
  let renderer: THREE.WebGLRenderer;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let controls: OrbitControls;
  let yakGroup: THREE.Group;
  let furMesh: THREE.Mesh;
  let furCanvas: HTMLCanvasElement;
  let furCtx: CanvasRenderingContext2D;
  let furTexture: THREE.CanvasTexture;
  let headFurMesh: THREE.Mesh;
  let headFurCanvas: HTMLCanvasElement;
  let headFurCtx: CanvasRenderingContext2D;
  let headFurTexture: THREE.CanvasTexture;
  let raycaster: THREE.Raycaster;
  let animFrameId: number;

  // Swipe tracking
  let swiping = false;
  let swipingHead = false; // tracks whether the current swipe is on the head
  let lastUV: { u: number; v: number } | null = null;
  let lastPt: { x: number; y: number } | null = null; // in YAK_W/YAK_H space for server

  // ── Fur canvas initialization ─────────────────────────────────────────
  function createFurCanvas(): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = YAK_W;
    c.height = YAK_H;
    const ctx = c.getContext("2d")!;

    // Fill with brown fur color
    ctx.fillStyle = "#8b6914";
    ctx.fillRect(0, 0, YAK_W, YAK_H);

    // Add texture variation
    ctx.fillStyle = "#7c5b3a";
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * YAK_W;
      const y = Math.random() * YAK_H;
      ctx.beginPath();
      ctx.ellipse(x, y, 3 + Math.random() * 8, 1 + Math.random() * 4, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    // Wavy fur strokes
    ctx.strokeStyle = "#6b4f0a";
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.4;
    for (let i = 0; i < 60; i++) {
      const x1 = Math.random() * YAK_W;
      const y1 = Math.random() * YAK_H;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(
        x1 + (Math.random() - 0.5) * 20,
        y1 + (Math.random() - 0.5) * 20,
        x1 + (Math.random() - 0.5) * 30,
        y1 + (Math.random() - 0.5) * 10,
      );
      ctx.stroke();
    }
    ctx.globalAlpha = 1.0;

    return c;
  }

  /** Erase circles along a line on a fur canvas (UV space mapped to pixels). */
  function eraseSwipeLine(u1: number, v1: number, u2: number, v2: number, ctx: CanvasRenderingContext2D, texture: THREE.CanvasTexture) {
    if (!ctx) return;
    // UV to pixel coords
    const x1 = u1 * YAK_W;
    const y1 = (1 - v1) * YAK_H; // V is flipped in Three.js
    const x2 = u2 * YAK_W;
    const y2 = (1 - v2) * YAK_H;

    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0,0,0,1)";

    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(1, Math.ceil(dist / (SHAVE_RADIUS * 0.5)));

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      ctx.beginPath();
      ctx.arc(x1 + dx * t, y1 + dy * t, SHAVE_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
    texture.needsUpdate = true;
  }

  // ── Build the 3D yak model ────────────────────────────────────────────
  function buildYak(): THREE.Group {
    const group = new THREE.Group();
    const skinColor = 0xf9b4c2;
    const hoofColor = 0x6b4f3a;
    const hornColor = 0xc9a96e;

    const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.7 });
    const hoofMat = new THREE.MeshStandardMaterial({ color: hoofColor, roughness: 0.8 });
    const hornMat = new THREE.MeshStandardMaterial({ color: hornColor, roughness: 0.5, metalness: 0.1 });
    const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.3 });

    // Body — elongated ellipsoid
    const bodyGeom = new THREE.SphereGeometry(1, 32, 24);
    bodyGeom.scale(1.4, 1.0, 1.0);
    const body = new THREE.Mesh(bodyGeom, skinMat);
    body.position.set(0, 0.3, 0);
    group.add(body);

    // Fur shell — slightly larger body with fur texture
    furCanvas = createFurCanvas();
    furCtx = furCanvas.getContext("2d")!;
    furTexture = new THREE.CanvasTexture(furCanvas);
    furTexture.wrapS = THREE.RepeatWrapping;
    furTexture.wrapT = THREE.RepeatWrapping;

    const furMat = new THREE.MeshStandardMaterial({
      map: furTexture,
      transparent: true,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
    const furGeom = new THREE.SphereGeometry(1, 32, 24);
    furGeom.scale(1.42, 1.02, 1.02);
    furMesh = new THREE.Mesh(furGeom, furMat);
    furMesh.position.set(0, 0.3, 0);
    group.add(furMesh);

    // Head
    const headGeom = new THREE.SphereGeometry(0.55, 24, 20);
    headGeom.scale(1.0, 0.9, 0.9);
    const head = new THREE.Mesh(headGeom, skinMat);
    head.position.set(0, 0.95, 0.8);
    group.add(head);

    // Head fur
    headFurCanvas = createFurCanvas();
    headFurCtx = headFurCanvas.getContext("2d")!;
    headFurTexture = new THREE.CanvasTexture(headFurCanvas);
    headFurTexture.wrapS = THREE.RepeatWrapping;
    headFurTexture.wrapT = THREE.RepeatWrapping;

    const headFurGeom = new THREE.SphereGeometry(0.57, 24, 20);
    headFurGeom.scale(1.0, 0.92, 0.92);
    const headFurMat = new THREE.MeshStandardMaterial({
      map: headFurTexture,
      transparent: true,
      roughness: 0.9,
    });
    headFurMesh = new THREE.Mesh(headFurGeom, headFurMat);
    headFurMesh.position.set(0, 0.95, 0.8);
    group.add(headFurMesh);

    // Snout
    const snoutGeom = new THREE.SphereGeometry(0.22, 16, 12);
    snoutGeom.scale(1.2, 0.8, 1.0);
    const snoutMat = new THREE.MeshStandardMaterial({ color: 0xfcd5de, roughness: 0.6 });
    const snout = new THREE.Mesh(snoutGeom, snoutMat);
    snout.position.set(0, 0.78, 1.25);
    group.add(snout);

    // Nostrils
    const nostrilGeom = new THREE.SphereGeometry(0.04, 8, 8);
    const nostrilMat = new THREE.MeshStandardMaterial({ color: 0xd97890 });
    const nostrilL = new THREE.Mesh(nostrilGeom, nostrilMat);
    nostrilL.position.set(-0.08, 0.78, 1.42);
    group.add(nostrilL);
    const nostrilR = new THREE.Mesh(nostrilGeom, nostrilMat);
    nostrilR.position.set(0.08, 0.78, 1.42);
    group.add(nostrilR);

    // Eyes
    const eyeGeom = new THREE.SphereGeometry(0.1, 12, 10);
    const eyeL = new THREE.Mesh(eyeGeom, eyeWhiteMat);
    eyeL.position.set(-0.2, 1.05, 1.15);
    group.add(eyeL);
    const eyeR = new THREE.Mesh(eyeGeom, eyeWhiteMat);
    eyeR.position.set(0.2, 1.05, 1.15);
    group.add(eyeR);

    // Pupils
    const pupilGeom = new THREE.SphereGeometry(0.055, 10, 8);
    const pupilL = new THREE.Mesh(pupilGeom, pupilMat);
    pupilL.position.set(-0.2, 1.05, 1.24);
    group.add(pupilL);
    const pupilR = new THREE.Mesh(pupilGeom, pupilMat);
    pupilR.position.set(0.2, 1.05, 1.24);
    group.add(pupilR);

    // Eye highlights
    const highlightGeom = new THREE.SphereGeometry(0.025, 8, 6);
    const highlightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.5 });
    const hlL = new THREE.Mesh(highlightGeom, highlightMat);
    hlL.position.set(-0.17, 1.08, 1.24);
    group.add(hlL);
    const hlR = new THREE.Mesh(highlightGeom, highlightMat);
    hlR.position.set(0.23, 1.08, 1.24);
    group.add(hlR);

    // Horns — curved using TubeGeometry
    const hornCurveL = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-0.25, 1.3, 0.75),
      new THREE.Vector3(-0.45, 1.7, 0.6),
      new THREE.Vector3(-0.35, 1.85, 0.5),
    );
    const hornGeomL = new THREE.TubeGeometry(hornCurveL, 12, 0.06, 8, false);
    const hornL = new THREE.Mesh(hornGeomL, hornMat);
    group.add(hornL);

    const hornCurveR = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0.25, 1.3, 0.75),
      new THREE.Vector3(0.45, 1.7, 0.6),
      new THREE.Vector3(0.35, 1.85, 0.5),
    );
    const hornGeomR = new THREE.TubeGeometry(hornCurveR, 12, 0.06, 8, false);
    const hornR = new THREE.Mesh(hornGeomR, hornMat);
    group.add(hornR);

    // Ears
    const earGeom = new THREE.SphereGeometry(0.12, 10, 8);
    earGeom.scale(1.6, 0.6, 1.0);
    const earL = new THREE.Mesh(earGeom, skinMat);
    earL.position.set(-0.45, 1.05, 0.65);
    earL.rotation.z = 0.3;
    group.add(earL);
    const earR = new THREE.Mesh(earGeom, skinMat);
    earR.position.set(0.45, 1.05, 0.65);
    earR.rotation.z = -0.3;
    group.add(earR);

    // Legs — 4 cylinders
    const legGeom = new THREE.CylinderGeometry(0.12, 0.1, 0.7, 12);
    const legPositions = [
      [-0.55, -0.4, 0.4],  // front-left
      [0.55, -0.4, 0.4],   // front-right
      [-0.5, -0.4, -0.5],  // back-left
      [0.5, -0.4, -0.5],   // back-right
    ];
    for (const pos of legPositions) {
      const leg = new THREE.Mesh(legGeom, skinMat);
      leg.position.set(pos[0], pos[1], pos[2]);
      group.add(leg);

      // Hoof
      const hoofGeom = new THREE.CylinderGeometry(0.12, 0.13, 0.12, 12);
      const hoof = new THREE.Mesh(hoofGeom, hoofMat);
      hoof.position.set(pos[0], pos[1] - 0.4, pos[2]);
      group.add(hoof);
    }

    // Tail — curved tube
    const tailCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0.5, -1.0),
      new THREE.Vector3(0, 1.0, -1.3),
      new THREE.Vector3(0.1, 1.2, -1.15),
    );
    const tailGeom = new THREE.TubeGeometry(tailCurve, 10, 0.05, 8, false);
    const tail = new THREE.Mesh(tailGeom, skinMat);
    group.add(tail);

    // Tail tuft
    const tuftGeom = new THREE.SphereGeometry(0.1, 10, 8);
    const tuft = new THREE.Mesh(tuftGeom, skinMat);
    tuft.position.set(0.1, 1.2, -1.15);
    group.add(tuft);

    return group;
  }

  // ── 3D Particles ──────────────────────────────────────────────────────
  let particleMeshes: { mesh: THREE.Mesh; velocity: THREE.Vector3; age: number }[] = [];
  const particleMat = new THREE.MeshBasicMaterial({ color: 0xf5e6d3, transparent: true });

  function spawn3DParticles(point: THREE.Vector3) {
    for (let i = 0; i < 5; i++) {
      const geom = new THREE.SphereGeometry(0.02 + Math.random() * 0.03, 6, 4);
      const mesh = new THREE.Mesh(geom, particleMat.clone());
      mesh.position.copy(point);
      scene.add(mesh);
      particleMeshes.push({
        mesh,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.08,
          Math.random() * 0.06 + 0.02,
          (Math.random() - 0.5) * 0.08,
        ),
        age: 0,
      });
    }
  }

  function updateParticles() {
    particleMeshes = particleMeshes.filter((p) => {
      p.age++;
      p.mesh.position.add(p.velocity);
      p.velocity.y -= 0.001; // gravity
      const mat = p.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 1 - p.age / 30);
      if (p.age > 30) {
        scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        mat.dispose();
        return false;
      }
      return true;
    });
  }

  // ── Hit-test / raycast ────────────────────────────────────────────────
  function getUVFromPointer(clientX: number, clientY: number): { uv: THREE.Vector2; point: THREE.Vector3; isHead: boolean } | null {
    if (!containerEl || !furMesh) return null;
    const rect = containerEl.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(mouse, camera);

    // Check intersection with the fur mesh (body) and head fur
    const intersects = raycaster.intersectObjects(yakGroup.children, false);
    for (const hit of intersects) {
      if (hit.uv) {
        const isHead = hit.object === headFurMesh;
        return { uv: hit.uv, point: hit.point, isHead };
      }
    }
    return null;
  }

  function uvToYakCoords(uv: THREE.Vector2): { x: number; y: number } {
    return {
      x: uv.x * YAK_W,
      y: (1 - uv.y) * YAK_H, // flip V
    };
  }

  // ── Touch / pointer handlers ──────────────────────────────────────────
  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === "touch" && e.isPrimary === false) return; // multi-touch = orbit
    const hit = getUVFromPointer(e.clientX, e.clientY);
    if (hit) {
      swiping = true;
      swipingHead = hit.isHead;
      lastUV = { u: hit.uv.x, v: hit.uv.y };
      lastPt = uvToYakCoords(hit.uv);
      controls.enabled = false; // disable orbit while shaving
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (!swiping || !lastUV || !lastPt) return;
    const hit = getUVFromPointer(e.clientX, e.clientY);
    if (!hit) return;

    const currentPt = uvToYakCoords(hit.uv);
    const onTarget = true; // we already hit the mesh via raycast

    room.send("game_input", {
      action: "swipe",
      x1: lastPt.x,
      y1: lastPt.y,
      x2: currentPt.x,
      y2: currentPt.y,
      onTarget,
    });

    // Erase fur on the correct texture (body or head)
    const ctx = swipingHead ? headFurCtx : furCtx;
    const tex = swipingHead ? headFurTexture : furTexture;
    eraseSwipeLine(lastUV.u, lastUV.v, hit.uv.x, hit.uv.y, ctx, tex);
    spawn3DParticles(hit.point);

    lastUV = { u: hit.uv.x, v: hit.uv.y };
    lastPt = currentPt;
  }

  function onPointerUp(_e: PointerEvent) {
    if (swiping) {
      swiping = false;
      swipingHead = false;
      lastUV = null;
      lastPt = null;
      controls.enabled = true; // re-enable orbit
    }
  }

  // Handle off-target swipes (touches that don't hit the yak mesh)
  function onMissSwipe(e: PointerEvent) {
    if (e.pointerType === "touch" && e.isPrimary === false) return;
    const hit = getUVFromPointer(e.clientX, e.clientY);
    if (!hit && swiping && lastPt) {
      // Swipe went off the yak — send as off-target
      const rect = containerEl.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * YAK_W;
      const ny = ((e.clientY - rect.top) / rect.height) * YAK_H;
      room.send("game_input", {
        action: "swipe",
        x1: lastPt.x,
        y1: lastPt.y,
        x2: nx,
        y2: ny,
        onTarget: false,
      });
      swiping = false;
      swipingHead = false;
      lastUV = null;
      lastPt = null;
      controls.enabled = true;
    }
  }

  // ── Server messages ───────────────────────────────────────────────────
  function onShaveUpdate(data: {
    shavedPercent: number;
    score: number;
    combo: number;
    comboMax: number;
    yakOffsetX: number;
    yakOffsetY: number;
    yakRotation: number;
  }) {
    shavedPercent = data.shavedPercent;
    score = data.score;
    combo = data.combo;
    comboMax = data.comboMax;
    yakOffsetX = data.yakOffsetX;
    yakOffsetY = data.yakOffsetY;
    yakRotation = data.yakRotation;
  }

  function onYakNudge(data: {
    yakOffsetX: number;
    yakOffsetY: number;
    yakRotation: number;
  }) {
    yakOffsetX = data.yakOffsetX;
    yakOffsetY = data.yakOffsetY;
    yakRotation = data.yakRotation;
    // Apply nudge to the yak group rotation as a brief visual jolt
    if (yakGroup) {
      yakGroup.rotation.y += data.yakRotation * 0.5;
    }
  }

  // ── Animation loop ────────────────────────────────────────────────────
  function animate() {
    animFrameId = requestAnimationFrame(animate);
    controls.update();
    updateParticles();
    renderer.render(scene, camera);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────
  let timerInterval: ReturnType<typeof setInterval>;

  onMount(() => {
    // Setup Three.js
    const w = containerEl.clientWidth;
    const h = containerEl.clientHeight;

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    containerEl.appendChild(renderer.domElement);

    scene = new THREE.Scene();

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(2, 3, 4);
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0x8888ff, 0.3);
    fillLight.position.set(-2, 1, -2);
    scene.add(fillLight);

    // Camera
    camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
    camera.position.set(0, 1.5, 3.5);
    camera.lookAt(0, 0.3, 0);

    // Controls — orbit with 2 fingers / right mouse
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.3, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.minDistance = 1.5;
    controls.maxDistance = 6;
    controls.maxPolarAngle = Math.PI * 0.85;
    controls.touches = {
      ONE: THREE.TOUCH.ROTATE, // will be disabled during shaving
      TWO: THREE.TOUCH.DOLLY_ROTATE,
    };

    // Raycaster
    raycaster = new THREE.Raycaster();

    // Build yak
    yakGroup = buildYak();
    scene.add(yakGroup);

    // Ground plane
    const groundGeom = new THREE.CircleGeometry(3, 32);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x2d5a3d,
      roughness: 0.9,
    });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.75;
    scene.add(ground);

    // Pointer events
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", (e) => {
      onPointerMove(e);
      onMissSwipe(e);
    });
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.style.touchAction = "none"; // prevent browser scroll

    // Server messages
    room.onMessage("shave_update", onShaveUpdate);
    room.onMessage("yak_nudge", onYakNudge);

    // Timer
    timerInterval = setInterval(() => {
      const elapsed = (Date.now() - state.phaseStartedAt) / 1000;
      timeLeft = Math.max(0, state.roundDurationSecs - elapsed);
    }, 100);

    // Start render loop
    animate();

    // Handle resize
    const onResize = () => {
      const nw = containerEl.clientWidth;
      const nh = containerEl.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
    };
  });

  onDestroy(() => {
    cancelAnimationFrame(animFrameId);
    clearInterval(timerInterval);
    if (furTexture) furTexture.dispose();
    if (headFurTexture) headFurTexture.dispose();
    if (renderer) {
      renderer.dispose();
    }
    // Clean up particles
    for (const p of particleMeshes) {
      scene?.remove(p.mesh);
      p.mesh.geometry.dispose();
      (p.mesh.material as THREE.MeshBasicMaterial).dispose();
    }
    particleMeshes = [];
  });

  // ── Derived values ────────────────────────────────────────────────────
  $: comboColor = combo >= 8 ? "#f59e0b" : combo >= 5 ? "#a78bfa" : combo >= 3 ? "#6366f1" : "#94a3b8";
  $: urgentTimer = timeLeft < 6;
</script>

<div class="flex-1 flex flex-col select-none overflow-hidden bg-gradient-to-b from-sky-900 via-sky-800 to-emerald-900" data-testid="shave-yak-game">
  <!-- Top HUD -->
  <div class="px-4 py-3 bg-black/40 flex items-center gap-3 z-10">
    <!-- Shaved % bar -->
    <div class="flex-1">
      <p class="text-xs text-sky-300 mb-1 font-bold tracking-wide">Shaved</p>
      <div class="h-3 bg-gray-700 rounded-full overflow-hidden">
        <div
          class="h-full rounded-full transition-all duration-200"
          style="width:{shavedPercent}%;
            background: linear-gradient(90deg, #6366f1, #a78bfa, #f59e0b);"
          data-testid="shave-progress"
        ></div>
      </div>
      <p class="text-xs text-sky-200 mt-0.5 font-mono">{shavedPercent.toFixed(1)}%</p>
    </div>

    <!-- Combo -->
    {#if combo > 0}
      <div
        class="px-2 py-1 rounded-lg text-xs font-black animate-bounce"
        style="background:{comboColor}; color:#fff;"
        data-testid="combo-badge"
      >
        x{combo}
      </div>
    {/if}

    <!-- Timer -->
    <div class="text-right">
      <p
        class="text-2xl font-mono font-black transition-colors {urgentTimer ? 'text-red-400 animate-pulse' : 'text-white'}"
        data-testid="yak-timer"
      >{Math.ceil(timeLeft)}</p>
    </div>
  </div>

  <!-- Score -->
  <div class="text-center py-1 bg-black/20">
    <span class="text-sm text-sky-300 font-mono font-bold">Score: {score}</span>
  </div>

  <!-- 3D viewport -->
  <div
    bind:this={containerEl}
    class="flex-1 relative touch-none"
    data-testid="yak-3d-viewport"
  >
    <!-- Orbit hint -->
    {#if shavedPercent === 0 && timeLeft > 18}
      <div class="absolute bottom-4 left-0 right-0 text-center animate-bounce z-10 pointer-events-none">
        <span class="bg-black/60 text-white px-4 py-2 rounded-full text-sm font-bold">
          Swipe on the yak to shave! Pinch to rotate.
        </span>
      </div>
    {/if}
  </div>
</div>

<style>
  :global(body) {
    overscroll-behavior: none;
  }
</style>
