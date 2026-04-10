<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import * as THREE from "three";
  import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

  export let allowedParts: string[] = [];
  export let selectedPart = "";
  export let interactive = false;
  export let title = "";
  export let subtitle = "";
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
      material.color.set(isSelected ? 0xf59e0b : 0x38bdf8);
      material.emissive.set(isSelected ? 0xf59e0b : 0x0f172a);
      material.emissiveIntensity = isSelected ? 0.9 + Math.sin(highlightPulse) * 0.18 : 0.18;
      material.opacity = isSelected ? 0.42 : interactive ? 0.22 : 0.12;
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
        color: 0x38bdf8,
        emissive: 0x0f172a,
        transparent: true,
        opacity: interactive ? 0.22 : 0.12,
        roughness: 0.3,
        metalness: 0.15,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...target.position);
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
    rootGroup.rotation.y += interactive ? 0.005 : 0.003;
    syncHitboxStyles();
    renderer.render(scene, camera);
    frameId = requestAnimationFrame(animate);
  }

  onMount(() => {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);

    camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0.6, 5.2);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = false;
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 1.4);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
    keyLight.position.set(3, 6, 6);
    const fillLight = new THREE.DirectionalLight(0x60a5fa, 0.8);
    fillLight.position.set(-4, 3, 4);
    scene.add(ambient, keyLight, fillLight);

    rootGroup = new THREE.Group();
    scene.add(rootGroup);

    const stage = new THREE.Mesh(
      new THREE.CircleGeometry(1.7, 48),
      new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.95, metalness: 0 }),
    );
    stage.rotation.x = -Math.PI / 2;
    stage.position.y = -1.25;
    scene.add(stage);

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
        const height = Math.max(size.y, 0.001);
        const scale = 3.1 / height;
        model.scale.setScalar(scale);
        model.position.sub(center.multiplyScalar(scale));
        model.position.y -= 1.15;

        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = false;
            child.receiveShadow = false;
          }
        });

        rootGroup.add(model);
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
    frameId = requestAnimationFrame(animate);
  });

  onDestroy(() => {
    if (frameId) cancelAnimationFrame(frameId);
    if (resizeObserver) resizeObserver.disconnect();
    if (renderer) {
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
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

<div class="rounded-2xl border border-cyan-500/30 bg-slate-950/90 overflow-hidden shadow-[0_0_30px_rgba(8,145,178,0.18)]">
  <div bind:this={container} class={compact ? "h-56 w-full" : "h-72 w-full"}></div>

  <div class="border-t border-white/10 px-3 py-2 space-y-1 bg-slate-950/90">
    {#if title}
      <p class="text-[11px] uppercase tracking-[0.3em] text-cyan-300">{title}</p>
    {/if}
    <p class="text-sm font-semibold text-white">
      {selectedPart ? `Selected: ${selectedPart}` : interactive ? "Tap the model to choose a body part" : "Highlighted area will appear here"}
    </p>
    {#if subtitle}
      <p class="text-xs text-slate-300">{subtitle}</p>
    {:else if interactive}
      <p class="text-xs text-slate-400">You can also use the quick-select buttons below if you prefer.</p>
    {/if}
    {#if loadError}
      <p class="text-xs text-amber-300">{loadError}</p>
    {/if}
  </div>
</div>
