<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import * as THREE from "three";
  import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

  export let compact = false;
  export let spinning = true;

  let container: HTMLDivElement;
  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let frameId = 0;
  let resizeObserver: ResizeObserver | null = null;
  let revolver: THREE.Object3D | null = null;
  let loadError = "";

  function resizeRenderer() {
    if (!renderer || !camera || !container) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;

    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function animate() {
    if (!renderer || !scene || !camera) return;

    if (revolver && spinning) {
      revolver.rotation.y += 0.01;
    }

    renderer.render(scene, camera);
    frameId = requestAnimationFrame(animate);
  }

  onMount(() => {
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 1.1, 7.5);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    container.appendChild(renderer.domElement);

    scene.add(
      new THREE.AmbientLight(0xffffff, 1.5),
      Object.assign(new THREE.DirectionalLight(0xfff4d6, 2.2), {
        position: new THREE.Vector3(5, 5, 6),
      }),
      Object.assign(new THREE.DirectionalLight(0x60a5fa, 0.8), {
        position: new THREE.Vector3(-4, 3, 4),
      }),
    );

    const loader = new GLTFLoader();
    loader.load(
      "/revolver.glb",
      (gltf) => {
        if (!scene) return;

        revolver = gltf.scene;
        const box = new THREE.Box3().setFromObject(revolver);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxAxis = Math.max(size.x, size.y, size.z, 0.001);
        const scale = 3.2 / maxAxis;

        revolver.scale.setScalar(scale);
        revolver.position.set(
          -center.x * scale,
          -center.y * scale,
          -center.z * scale,
        );
        revolver.rotation.x = -0.2;
        revolver.rotation.y = Math.PI * 0.25;

        revolver.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = false;
            child.receiveShadow = false;
          }
        });

        scene.add(revolver);
      },
      undefined,
      () => {
        loadError = "3D model unavailable";
      },
    );

    resizeRenderer();
    resizeObserver = new ResizeObserver(() => resizeRenderer());
    resizeObserver.observe(container);
    frameId = requestAnimationFrame(animate);
  });

  onDestroy(() => {
    if (frameId) cancelAnimationFrame(frameId);
    resizeObserver?.disconnect();

    if (scene) {
      scene.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((material) => material.dispose());
        } else {
          child.material.dispose();
        }
      });
    }

    if (renderer) {
      renderer.dispose();
      renderer.domElement.remove();
    }
  });
</script>

<div class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-950/80 via-orange-950/60 to-slate-950/70 shadow-2xl">
  <div bind:this={container} class={compact ? "h-48 w-full" : "h-72 w-full sm:h-80"}></div>

  <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.18),transparent_60%)]"></div>

  {#if loadError}
    <div class="pointer-events-none absolute inset-0 flex items-center justify-center text-6xl">🔫</div>
    <div class="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-100 px-3 py-1 text-[11px] font-medium text-amber-700 shadow-sm">
      {loadError}
    </div>
  {/if}
</div>
