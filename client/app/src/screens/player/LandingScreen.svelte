<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import GammaLogo from "../../components/GammaLogo.svelte";
  const dispatch = createEventDispatcher<{ join: void; host: void }>();
</script>

<div class="flex-1 flex flex-col min-h-screen bg-gray-950 text-white">
  <div class="flex-1 flex flex-col items-center justify-center gap-6 px-8 pt-16 pb-8">
    <div class="flex flex-col items-center gap-4">
      <GammaLogo size="96px" />
      <div class="text-center space-y-1">
        <h1 class="text-5xl font-black tracking-tight text-indigo-400">GAMMA</h1>
        <p class="text-lg text-gray-300 font-medium">Party games for your phone</p>
      </div>
    </div>
    <div class="w-full max-w-xs space-y-3 mt-4">
      <button class="w-full py-5 rounded-2xl text-xl font-black bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition-all shadow-lg shadow-indigo-900/40" on:click={() => dispatch("join")} data-testid="landing-join-btn">Join a Room</button>
      <button class="w-full py-5 rounded-2xl text-xl font-black bg-gray-800 hover:bg-gray-700 active:scale-95 transition-all border border-gray-700" on:click={() => dispatch("host")} data-testid="landing-host-btn">Create a Room</button>
    </div>
    <div class="w-full max-w-xs mt-2 space-y-4 text-gray-400 text-sm text-center">
      <p>Use your phone as a controller. One person hosts on a TV or laptop — everyone else joins with a 4-letter code.</p>
    </div>
  </div>
  <div class="border-t border-gray-800 px-6 py-6">
    <div class="grid grid-cols-3 gap-4 text-center text-xs text-gray-500">
      <div class="space-y-1"><p class="text-2xl">📱</p><p>Phone controls</p></div>
      <div class="space-y-1"><p class="text-2xl">📺</p><p>TV display</p></div>
      <div class="space-y-1"><p class="text-2xl">🎮</p><p>Party games</p></div>
    </div>
  </div>
  <!-- Footer: GitHub + donation -->
  <div class="flex items-center justify-center gap-4 px-6 pb-6 text-gray-600">
    <a href="https://github.com/JUSTINWMYLES/gamma" target="_blank" rel="noopener noreferrer" class="hover:text-gray-400 transition-colors" aria-label="View source on GitHub">
      <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z"/>
      </svg>
    </a>
    <span class="text-gray-700">·</span>
    <a href="https://github.com/sponsors/JUSTINWMYLES" target="_blank" rel="noopener noreferrer" class="text-xs hover:text-gray-400 transition-colors">Consider donating</a>
  </div>
</div>
