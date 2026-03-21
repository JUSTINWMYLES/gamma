<script lang="ts">
  export let title: string = 'Gamma — Phone Controller';
</script>

<main class="p-4">
  <h1 class="text-2xl font-semibold">{title}</h1>
  <p class="mt-2 text-sm text-gray-600">Player client: join room, send inputs, view private UI.</p>
  <slot />
</main>

<style>
  main { max-width: 640px; margin: 0 auto; }
</style>
