<script lang="ts">
  /**
   * client/app/src/screens/RoleSelectScreen.svelte
   *
   * First screen of the unified client. Users choose their role:
   *   - "Display / Viewer" → creates a room as view_screen (TV/projector)
   *   - "Player" → enters the player flow (join or host)
   */
  import { createEventDispatcher } from "svelte";
  import GammaTitle from "../components/GammaTitle.svelte";

  const dispatch = createEventDispatcher<{
    selectViewer: void;
    selectPlayer: void;
  }>();
</script>

<div class="flex-1 flex flex-col min-h-screen bg-gray-950 text-white">
  <!-- Hero -->
  <div class="flex-1 flex flex-col items-center justify-center gap-10 px-8 pt-16 pb-8">
    <div class="text-center space-y-3">
      <GammaTitle subtitle="Party games for everyone" size="lg" />
    </div>

    <div class="text-center">
      <p class="text-gray-400 text-sm mb-6">How are you using this device?</p>

      <div class="w-full max-w-md grid grid-cols-1 sm:grid-cols-2 gap-4">
        <!-- Viewer / Display -->
        <button
          class="flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-gray-700 bg-gray-800/90
                 hover:border-indigo-500 hover:bg-indigo-900/90 active:scale-95 transition-all backdrop-blur-sm"
          on:click={() => dispatch("selectViewer")}
          data-testid="role-viewer-btn"
        >
          <span class="text-6xl">📺</span>
          <span class="text-xl font-black">Display</span>
          <span class="text-sm text-gray-400 text-center leading-snug">
            Shared screen for everyone to watch (TV, laptop, projector)
          </span>
        </button>

        <!-- Player -->
        <button
          class="flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-gray-700 bg-gray-800/90
                 hover:border-indigo-500 hover:bg-indigo-900/90 active:scale-95 transition-all backdrop-blur-sm"
          on:click={() => dispatch("selectPlayer")}
          data-testid="role-player-btn"
        >
          <span class="text-6xl">📱</span>
          <span class="text-xl font-black">Player</span>
          <span class="text-sm text-gray-400 text-center leading-snug">
            Use this phone or device as a game controller
          </span>
        </button>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div class="border-t border-gray-800 px-6 py-6">
    <div class="grid grid-cols-3 gap-4 text-center text-xs text-gray-500">
      <div class="space-y-1">
        <p class="text-2xl">📱</p>
        <p>Phone controls</p>
      </div>
      <div class="space-y-1">
        <p class="text-2xl">📺</p>
        <p>Shared display</p>
      </div>
      <div class="space-y-1">
        <p class="text-2xl">🎮</p>
        <p>Party games</p>
      </div>
    </div>
  </div>
</div>
