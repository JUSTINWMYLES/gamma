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

<div class="role-select flex-1 flex flex-col min-h-screen">
  <!-- Hero -->
  <div class="flex-1 flex flex-col items-center justify-center gap-10 px-8 pt-16 pb-8">
    <div class="text-center space-y-3">
      <GammaTitle subtitle="Party games for everyone" size="lg" />
    </div>

    <div class="text-center">
      <p class="subtitle text-sm mb-6">How are you using this device?</p>

      <div class="w-full max-w-md grid grid-cols-1 sm:grid-cols-2 gap-4">
        <!-- Viewer / Display -->
        <button
          class="role-btn flex flex-col items-center gap-4 p-8 rounded-2xl border-2
                 hover:border-indigo-500 active:scale-95 transition-all backdrop-blur-sm"
          on:click={() => dispatch("selectViewer")}
          data-testid="role-viewer-btn"
        >
          <span class="text-6xl">📺</span>
          <span class="text-xl font-black">Display</span>
          <span class="role-desc text-sm text-center leading-snug">
            Shared screen for everyone to watch (TV, laptop, projector)
          </span>
        </button>

        <!-- Player -->
        <button
          class="role-btn flex flex-col items-center gap-4 p-8 rounded-2xl border-2
                 hover:border-indigo-500 active:scale-95 transition-all backdrop-blur-sm"
          on:click={() => dispatch("selectPlayer")}
          data-testid="role-player-btn"
        >
          <span class="text-6xl">📱</span>
          <span class="text-xl font-black">Player</span>
          <span class="role-desc text-sm text-center leading-snug">
            Use this phone or device as a game controller
          </span>
        </button>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer-strip border-t px-6 py-6">
    <div class="grid grid-cols-3 gap-4 text-center text-xs">
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
  <!-- GitHub link -->
  <div class="gh-link flex items-center justify-center px-6 pb-6">
    <a href="https://github.com/JUSTINWMYLES/gamma" target="_blank" rel="noopener noreferrer" class="hover:text-gray-400 transition-colors" aria-label="View source on GitHub">
      <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z"/>
      </svg>
    </a>
  </div>
</div>

<style>
  /* Dark mode (default) */
  .role-select { background: #030712; color: #fff; }
  .subtitle { color: #9ca3af; }
  .role-btn {
    border-color: #374151;
    background: rgba(31, 41, 55, 0.9);
    color: #fff;
  }
  .role-btn:hover { background: rgba(49, 46, 129, 0.9); }
  .role-desc { color: #9ca3af; }
  .footer-strip { border-color: #1f2937; color: #6b7280; }
  .gh-link { color: #4b5563; }

  /* Light mode */
  :global(.light) .role-select { background: #f9fafb; color: #111827; }
  :global(.light) .subtitle { color: #6b7280; }
  :global(.light) .role-btn {
    border-color: #d1d5db;
    background: #ffffff;
    color: #111827;
  }
  :global(.light) .role-btn:hover {
    border-color: #818cf8;
    background: #eef2ff;
  }
  :global(.light) .role-desc { color: #6b7280; }
  :global(.light) .footer-strip { border-color: #e5e7eb; color: #9ca3af; }
  :global(.light) .gh-link { color: #9ca3af; }
</style>
