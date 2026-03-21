<script lang="ts">
  import { createEventDispatcher } from "svelte";
  const dispatch = createEventDispatcher<{ join: void; host: void }>();
</script>

<div class="flex-1 flex flex-col min-h-screen bg-gray-950 text-white">
  <div class="flex-1 flex flex-col items-center justify-center gap-8 px-8 pt-16 pb-8">
    <div class="text-center space-y-3">
      <h1 class="text-7xl font-black tracking-tight text-indigo-400">gamma</h1>
      <p class="text-xl text-gray-300 font-medium">Party games for your phone</p>
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
</div>
