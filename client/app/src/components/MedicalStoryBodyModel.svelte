<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import * as THREE from "three";
  import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

  export let allowedParts: string[] = [];
  export let selectedPart = "";
  export let interactive = false;
  export let compact = false;

  interface BodyTarget {
    position: [number, number, number];
    size: [number, number, number];
  }

  const BODY_PART_TARGETS: Record<string, BodyTarget> = {
    head: { position: [0, 1.82, 0.02], size: [0.45, 0.42, 0.4] },
    forehead: { position: [0, 1.95, 0.2], size: [0.28, 0.14, 0.14] },
    "left eye": { position: [-0.12, 1.86, 0.3], size: [0.1, 0.1, 0.1] },
    "right eye": { position: [0.12, 1.86, 0.3], size: [0.1, 0.1, 0.1] },
    nose: { position: [0, 1.73, 0.34], size: [0.12, 0.16, 0.12] },
    mouth: { position: [0, 1.58, 0.32], size: [0.18, 0.1, 0.12] },
    "left ear": { position: [-0.26, 1.78, 0.02], size: [0.1, 0.18, 0.12] },
    "right ear": { position: [0.26, 1.78, 0.02], size: [0.1, 0.18, 0.12] },
    neck: { position: [0, 1.42, 0.04], size: [0.22, 0.18, 0.18] },
    "left shoulder": { position: [-0.45, 1.32, 0.02], size: [0.22, 0.2, 0.2] },
    "right shoulder": { position: [0.45, 1.32, 0.02], size: [0.22, 0.2, 0.2] },
    chest: { position: [0, 1.1, 0.16], size: [0.62, 0.4, 0.25] },
    stomach: { position: [0, 0.76, 0.18], size: [0.55, 0.32, 0.24] },
    "left arm": { position: [-0.7, 1.0, 0.02], size: [0.2, 0.5, 0.2] },
    "right arm": { position: [0.7, 1.0, 0.02], size: [0.2, 0.5, 0.2] },
    "left elbow": { position: [-0.72, 0.68, 0.04], size: [0.18, 0.18, 0.18] },
    "right elbow": { position: [0.72, 0.68, 0.04], size: [0.18, 0.18, 0.18] },
    "left hand": { position: [-0.72, 0.28, 0.08], size: [0.18, 0.2, 0.18] },
    "right hand": { position: [0.72, 0.28, 0.08], size: [0.18, 0.2, 0.18] },
    "left hip": { position: [-0.24, 0.42, 0.04], size: [0.2, 0.18, 0.2] },
    "right hip": { position: [0.24, 0.42, 0.04], size: [0.2, 0.18, 0.2] },
    "left leg": { position: [-0.2, -0.18, 0.04], size: [0.22, 0.72, 0.2] },
    "right leg": { position: [0.2, -0.18, 0.04], size: [0.22, 0.72, 0.2] },
    "left knee": { position: [-0.2, -0.5, 0.08], size: [0.18, 0.18, 0.18] },
    "right knee": { position: [0.2, -0.5, 0.08], size: [0.18, 0.18, 0.18] },
    "left foot": { position: [-0.2, -1.1, 0.16], size: [0.2, 0.14, 0.35] },
    "right foot": { position: [0.2, -1.1, 0.16], size: [0.2, 0.14, 0.35] },
    back: { position: [0, 0.98, -0.18], size: [0.62, 0.88, 0.16] },
    spine: { position: [0, 0.82, -0.22], size: [0.14, 0.78, 0.12] },
    spleen: { position: [-0.2, 0.72, 0.2], size: [0.16, 0.16, 0.14] },
  };
  const MODEL_VIEW_BOUNDS = {
    minX: -0.95,
    maxX: 0.95,
    minY: -1.28,
    maxY: 2.08,
    minZ: -0.4,
    maxZ: 0.45,
  };

  let container: HTMLDivElement;
  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let frameId = 0;
  let resizeObserver: ResizeObserver | null = null;
  let rootGroup: THREE.Group | null = null;
  let hitboxGroup: THREE.Group | null = null;
  let highlightPulse = 0;
  let loadError = "";
  let modelLoaded = false;
  let isDragging = false;
  let dragMoved = false;
  let dragStartX = 0;
  let dragRotationStart = 0;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const hitboxMap = new Map<string, THREE.Mesh>();
  let renderablePartKey = "";

  function getRenderableParts(): string[] {
    const source = allowedParts.length > 0 ? allowedParts : Object.keys(BODY_PART_TARGETS);
    return source.filter((part) => BODY_PART_TARGETS[part]);
  }

  function syncHitboxStyles() {
    for (const [part, mesh] of hitboxMap.entries()) {
      const material = mesh.material as THREE.MeshStandardMaterial;
      const isSelected = part === selectedPart;
      material.color.set(0xf59e0b);
      material.emissive.set(0xf59e0b);
      material.emissiveIntensity = isSelected ? 0.9 + Math.sin(highlightPulse) * 0.18 : 0;
      material.opacity = isSelected ? 0.34 : 0;
      mesh.scale.setScalar(isSelected ? 1.08 : 1);
    }
  }

  function rebuildHitboxes() {
    if (!scene || !rootGroup) return;

    if (hitboxGroup) {
      rootGroup.remove(hitboxGroup);
      for (const child of hitboxGroup.children) {
        const mesh = child as THREE.Mesh;
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    }

    hitboxGroup = new THREE.Group();
    hitboxMap.clear();

    for (const part of getRenderableParts()) {
      const target = BODY_PART_TARGETS[part];
      const geometry = new THREE.BoxGeometry(...target.size);
      const material = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xf59e0b,
        transparent: true,
        opacity: 0,
        roughness: 0.3,
        metalness: 0.15,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(target.position[0], target.position[1], target.position[2]);
      mesh.userData.bodyPart = part;
      hitboxGroup.add(mesh);
      hitboxMap.set(part, mesh);
    }

    rootGroup.add(hitboxGroup);
    syncHitboxStyles();
  }

  function resizeRenderer() {
    if (!renderer || !camera || !container) return;
    const { clientWidth, clientHeight } = container;
    if (!clientWidth || !clientHeight) return;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
  }

  function handlePointerDown(event: PointerEvent) {
    if (!renderer || !rootGroup) return;

    isDragging = true;
    dragMoved = false;
    dragStartX = event.clientX;
    dragRotationStart = rootGroup.rotation.y;
    renderer.domElement.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent) {
    if (!isDragging || !rootGroup) return;

    const deltaX = event.clientX - dragStartX;
    if (Math.abs(deltaX) > 3) {
      dragMoved = true;
    }

    rootGroup.rotation.y = dragRotationStart + deltaX * 0.012;
  }

  function handlePointerUp(event: PointerEvent) {
    if (!renderer) return;

    if (!dragMoved) {
      handleSelection(event);
    }

    if (renderer.domElement.hasPointerCapture(event.pointerId)) {
      renderer.domElement.releasePointerCapture(event.pointerId);
    }
    isDragging = false;
  }

  function handleSelection(event: PointerEvent) {
    if (!interactive || !renderer || !camera || !hitboxGroup) return;

    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersections = raycaster.intersectObjects(hitboxGroup.children, false);
    const match = intersections.find((entry) => typeof entry.object.userData.bodyPart === "string");
    if (!match) return;

    selectedPart = String(match.object.userData.bodyPart);
    syncHitboxStyles();
  }

  function animate() {
    if (!renderer || !scene || !camera || !rootGroup) return;
    highlightPulse += 0.08;
    if (!isDragging) {
      rootGroup.rotation.y += interactive ? 0.002 : 0.0015;
    }
    syncHitboxStyles();
    renderer.render(scene, camera);
    frameId = requestAnimationFrame(animate);
  }

  onMount(() => {
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 0.42, 8.8);
    camera.lookAt(0, 0.42, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = false;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 1.4);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
    keyLight.position.set(3, 6, 6);
    const fillLight = new THREE.DirectionalLight(0x60a5fa, 0.8);
    fillLight.position.set(-4, 3, 4);
    scene.add(ambient, keyLight, fillLight);

    rootGroup = new THREE.Group();
    scene.add(rootGroup);

    const loader = new GLTFLoader();
    loader.load(
      "/human_dude_guy.glb",
      (gltf) => {
        if (!rootGroup) return;
        const model = gltf.scene;
        model.rotation.y = Math.PI;

        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const width = Math.max(MODEL_VIEW_BOUNDS.maxX - MODEL_VIEW_BOUNDS.minX, 0.001);
        const height = Math.max(MODEL_VIEW_BOUNDS.maxY - MODEL_VIEW_BOUNDS.minY, 0.001);
        const depth = Math.max(MODEL_VIEW_BOUNDS.maxZ - MODEL_VIEW_BOUNDS.minZ, 0.001);
        const scale = Math.min(1.9 / Math.max(size.x, 0.001), 3.36 / Math.max(size.y, 0.001), 0.85 / Math.max(size.z, 0.001));
        model.scale.setScalar(scale);

        const scaledCenter = center.clone().multiplyScalar(scale);
        const scaledMin = new THREE.Vector3(
          MODEL_VIEW_BOUNDS.minX,
          MODEL_VIEW_BOUNDS.minY,
          MODEL_VIEW_BOUNDS.minZ,
        );
        const scaledMax = new THREE.Vector3(
          MODEL_VIEW_BOUNDS.maxX,
          MODEL_VIEW_BOUNDS.maxY,
          MODEL_VIEW_BOUNDS.maxZ,
        );
        const targetCenter = scaledMin.clone().add(scaledMax).multiplyScalar(0.5);
        model.position.set(
          targetCenter.x - scaledCenter.x,
          targetCenter.y - scaledCenter.y,
          targetCenter.z - scaledCenter.z,
        );

        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = false;
            child.receiveShadow = false;
          }
        });

        rootGroup.add(model);
        rootGroup.rotation.y = Math.PI;
        modelLoaded = true;
        rebuildHitboxes();
      },
      undefined,
      () => {
        loadError = "3D model unavailable";
        rebuildHitboxes();
      },
    );

    resizeRenderer();
    resizeObserver = new ResizeObserver(() => resizeRenderer());
    resizeObserver.observe(container);
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("pointercancel", handlePointerUp);
    frameId = requestAnimationFrame(animate);
  });

  onDestroy(() => {
    if (frameId) cancelAnimationFrame(frameId);
    if (resizeObserver) resizeObserver.disconnect();
    if (renderer) {
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("pointercancel", handlePointerUp);
      renderer.dispose();
      renderer.domElement.remove();
    }
  });

  $: renderablePartKey = getRenderableParts().join("|");

  $: if (rootGroup) {
    renderablePartKey;
    rebuildHitboxes();
  }

  $: syncHitboxStyles();
</script>

<div class="relative overflow-hidden rounded-2xl bg-transparent">
  <div
    bind:this={container}
    class={`${compact ? "h-52 w-full sm:h-60" : "h-64 w-full sm:h-80"} ${interactive ? "cursor-grab active:cursor-grabbing" : ""}`}
  ></div>

  {#if selectedPart}
    <div class="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-gray-700 shadow-sm">
      {selectedPart}
    </div>
  {:else if interactive}
    <div class="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-white/85 px-3 py-1 text-[11px] font-medium text-gray-500 shadow-sm">
      Tap a body part
    </div>
  {/if}

  {#if interactive && modelLoaded}
    <div class="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-white/85 px-3 py-1 text-[11px] font-medium text-gray-500 shadow-sm">
      Drag to rotate
    </div>
  {/if}

  {#if loadError}
    <div class="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-100 px-3 py-1 text-[11px] font-medium text-amber-700 shadow-sm">
      {loadError}
    </div>
  {/if}
</div>
