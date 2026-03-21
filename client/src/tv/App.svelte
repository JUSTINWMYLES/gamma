<script lang="ts">
  export let title: string = 'Gamma — TV Display';
</script>

<main class="p-6">
  <h1 class="text-4xl font-bold">{title}</h1>
  <p class="mt-3 text-sm text-gray-600">TV client: renders shared game state and scoreboard.</p>
  <slot />
</main>

<style>
  main { max-width: 960px; margin: 0 auto; }
</style>
