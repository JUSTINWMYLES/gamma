<script lang="ts">
  import type { Room } from "colyseus.js";
  import type { RoomState, PlayerState, GameMeta, DevicePermissionState } from "../../../../shared/types";
  import { GAME_REGISTRY, getGameUnavailableReason } from "../../../../shared/types";
  import { onDestroy, onMount } from "svelte";
  import GameCardGrid from "../../components/GameCardGrid.svelte";
  import GameDetailView from "../../components/GameDetailView.svelte";
  import PlayerCustomizer from "../../components/PlayerCustomizer.svelte";
  import PlayerIcon from "../../components/PlayerIcon.svelte";
  import { markMotionPermissionGranted, isMotionPermissionGrantedThisSession, cacheMicStream } from "../../lib/permissions";

  export let room: Room;
  export let state: RoomState;
  export let me: PlayerState | undefined;

  // ── Player customization panel ───────────────────────────────────────────
  let showCustomizer = false;
  $: hasCustomIcon = !!(me?.iconDesign || me?.iconEmoji || me?.iconText || me?.iconBgColor);

  // ── Device permission consent ────────────────────────────────────────────
  const CONSENT_KEY = "gamma-device-consent";
  let showConsent = false;

  interface PermissionResult {
    mic: "granted" | "denied" | "skipped";
    motion: "granted" | "denied" | "skipped" | "not_needed";
  }
  let permResult: PermissionResult | null = null;
  let permissionMessage = "";
  let pendingSetupChoice: string | null = null;
  let setupChoiceTimer: ReturnType<typeof setTimeout> | null = null;

  type PermissionRequester = {
    requestPermission?: () => Promise<string>;
  };

  function getSensorPermissionRequesters(): Array<() => Promise<string>> {
    const requesters: Array<() => Promise<string>> = [];
    const motion = DeviceMotionEvent as unknown as PermissionRequester;
    const orientation = DeviceOrientationEvent as unknown as PermissionRequester;

    if (typeof motion.requestPermission === "function") {
      requesters.push(() => motion.requestPermission!());
    }
    if (typeof orientation.requestPermission === "function") {
      requesters.push(() => orientation.requestPermission!());
    }

    return requesters;
  }

  function needsMotionPermission(): boolean {
    return getSensorPermissionRequesters().length > 0;
  }

  async function requestMotionPermissions(): Promise<PermissionResult["motion"]> {
    const requesters = getSensorPermissionRequesters();
    if (requesters.length === 0) {
      markMotionPermissionGranted();
      return "not_needed";
    }

    // Kick off all Safari sensor permission requests from the same tap before
    // yielding, otherwise later requests can lose transient activation.
    const permissionPromises = requesters.map((requestPermission) => {
      try {
        return requestPermission();
      } catch {
        return Promise.resolve("denied");
      }
    });

    const permissions = await Promise.all(permissionPromises.map(async (permissionPromise) => {
      try {
        return await permissionPromise;
      } catch {
        return "denied";
      }
    }));

    if (permissions.some((permission) => permission !== "granted")) {
      return "denied";
    }

    markMotionPermissionGranted();
    return "granted";
  }

  function motionDeniedHelpText(): string {
    const isIPhoneSafari = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (!isIPhoneSafari) {
      return "Motion access was denied. Check browser permissions and make sure you are using HTTPS.";
    }

    return "Motion access was denied. On iPhone Safari, motion must be allowed from the tap itself. If it still fails, check Safari's Motion & Orientation Access setting for this device, then close and reopen Safari and try again.";
  }

  async function requestAllPermissions() {
    const result: PermissionResult = { mic: "skipped", motion: "not_needed" };
    permissionMessage = "";

    // Safari on iPhone requires motion/orientation permission to be requested
    // directly from the original tap. Request it before any awaited mic prompt.
    result.motion = await requestMotionPermissions();

    if (result.motion === "denied") {
      permissionMessage = motionDeniedHelpText();
    }

    // ── Microphone ──
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Cache the granted stream so games can reuse it without triggering
        // additional browser permission prompts mid-session.
        cacheMicStream(stream);
        result.mic = "granted";
      }
    } catch {
      result.mic = "denied";
    }

    permResult = result;
    syncPermissionsToServer(result);
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify(result));
    } catch {}
    showConsent = false;
  }

  function skipConsent() {
    permResult = { mic: "skipped", motion: needsMotionPermission() ? "skipped" : "not_needed" };
    permissionMessage = "";
    syncPermissionsToServer(permResult);
    try {
      localStorage.setItem(CONSENT_KEY, "skipped");
    } catch {}
    showConsent = false;
  }

  function syncPermissionsToServer(result: PermissionResult | null) {
    if (!result) return;
    room.send("update_permissions", {
      mic: toPermissionState(result.mic),
      motion: result.motion === "not_needed" ? "granted" : toPermissionState(result.motion),
    });
  }

  function toPermissionState(
    value: "granted" | "denied" | "skipped",
  ): DevicePermissionState {
    return value === "granted" ? "granted" : value === "denied" ? "denied" : "unknown";
  }

  function permissionSummary(value: DevicePermissionState): string {
    return value === "granted"
      ? "Enabled"
      : value === "denied"
        ? "Denied"
        : "Not enabled";
  }

  // ── Game detail overlay ─────────────────────────────────────────────────
  let detailGameId: string | null = null;
  $: detailGame = detailGameId ? GAME_REGISTRY.find((g) => g.id === detailGameId) ?? null : null;

  /** Card theme colors — must mirror the CARD_THEMES in GameCardGrid */
  const DETAIL_THEMES: Record<string, { accent: string; bg: string }> = {
    "registry-03-tap-speed": { accent: "#ff6020", bg: "radial-gradient(ellipse at 50% 100%, #3d0e00, #0d0200)" },
    "registry-04-escape-maze": { accent: "#70e870", bg: "radial-gradient(ellipse at 50% 60%, #0a200a, #040a03)" },
    "registry-06-sound-replication": { accent: "#d080ff", bg: "radial-gradient(ellipse at 50% 50%, #1a0030, #06000e)" },
    "registry-07-hot-potato": { accent: "#ff9050", bg: "radial-gradient(ellipse at 50% 80%, #3d0a00, #0d0302)" },
    "registry-14-dont-get-caught": { accent: "#c8c8c8", bg: "#050505" },
    "registry-17-fire-match-blow-shake": { accent: "#f0c040", bg: "linear-gradient(180deg, #1e1500, #0e0a00)" },
    "registry-19-shave-the-yak": { accent: "#40f0a0", bg: "radial-gradient(ellipse at 50% 80%, #001e10, #000a06)" },
    "registry-20-odd-one-out": { accent: "#f060a0", bg: "radial-gradient(ellipse at 50% 50%, #200010, #08000a)" },
    "registry-25-lowball-marketplace": { accent: "#f0c040", bg: "linear-gradient(180deg, #1e1500, #0e0a00)" },
    "registry-26-audio-overlay": { accent: "#80a8ff", bg: "#020408" },
  };

  function openDetail(gameId: string) {
    detailGameId = gameId;
  }

  function closeDetail() {
    detailGameId = null;
  }

  // ── Selection mode: single game or playlist ──────────────────────────────
  type SelectionMode = "single" | "playlist";
  let selectionMode: SelectionMode = "single";

  // ── Derived state ─────────────────────────────────────────────────────────

  $: isHost = me?.id === state.hostSessionId;
  $: setupStep = state.setupStep ?? 0;
  $: setupDone = setupStep >= 4;
  $: selectedGameMeta = setupDone
    ? GAME_REGISTRY.find((g) => g.id === state.selectedGame)
    : null;
  $: selectedGameUnavailable = selectedGameMeta
    ? getGameUnavailableReason(selectedGameMeta, state)
    : null;
  $: allPlayersReady = [...state.players.values()].every(
    (p) => !p.isConnected || p.isReady || p.id === state.hostSessionId,
  );
  $: canStart = !!state.selectedGame && !selectedGameUnavailable && state.players.size >= 1 && allPlayersReady;
  $: hasQueue = (state.gameQueue?.length ?? 0) > 0;
  $: availableGames = GAME_REGISTRY.filter((g) => !getGameUnavailableReason(g, state));
  $: isLowballFunnyMessages =
    state.selectedGame === "registry-25-lowball-marketplace" &&
    state.gameConfig.gameMode === "funny_messages";

  const SETUP_STEP_LABELS: Record<number, string> = {
    1: "Host is choosing location…",
    2: "Host is choosing activity level…",
    3: "Host is choosing display setup…",
  };

  // ── Actions ───────────────────────────────────────────────────────────────

  function ready() {
    room.send("player_ready", {});
  }

  function unready() {
    room.send("player_unready", {});
  }

  // Host setup actions
  function sendSetup(patch: Record<string, unknown>) {
    room.send("update_setup", patch);
  }

  function selectLocation(mode: "same" | "remote") {
    sendSetup({ locationMode: mode, setupStep: 2 });
  }

  function selectActivity(level: "none" | "some" | "full") {
    sendSetup({ activityLevel: level, setupStep: 3 });
  }

  function selectDisplay(has: boolean) {
    sendSetup({ hasSecondaryDisplay: has, setupStep: 4 });
  }

  function chooseSetupOption(choiceId: string, apply: () => void) {
    if (setupChoiceTimer) {
      clearTimeout(setupChoiceTimer);
      setupChoiceTimer = null;
    }

    pendingSetupChoice = choiceId;
    setupChoiceTimer = setTimeout(() => {
      pendingSetupChoice = null;
      setupChoiceTimer = null;
      apply();
    }, 150);
  }

  function setupOptionClass(choiceId: string): string {
    return pendingSetupChoice === choiceId ? "is-pending" : "";
  }

  function setupOptionDescriptionClass(choiceId: string): string {
    return pendingSetupChoice === choiceId ? "is-pending" : "";
  }

  function resetSetup() {
    sendSetup({ locationMode: "", activityLevel: "", hasSecondaryDisplay: false, setupStep: 1 });
  }

  function selectGame(id: string) {
    // If selecting a single game, clear any existing queue
    if (selectionMode === "single") {
      room.send("clear_queue", {});
    }
    room.send("select_game", { gameId: id });
  }

  function start() {
    room.send("start_game", {});
  }

  function kickPlayer(targetId: string) {
    room.send("kick_player", { targetId });
  }

  function updateConfig(patch: Record<string, unknown>) {
    room.send("update_config", patch);
  }

  /**
   * Build a random playlist of `count` games from the available pool.
   * Shuffles and picks up to `count` games that match the current setup + player count.
   */
  function buildRandomPlaylist(count: number) {
    const pool = [...availableGames];
    // Fisher-Yates shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const selected = pool.slice(0, Math.min(count, pool.length));
    const queue = selected.map((g) => g.id);
    room.send("set_queue", { queue });
    selectionMode = "playlist";
  }

  function clearQueue() {
    room.send("clear_queue", {});
    selectionMode = "single";
  }

  // Start setup on first render if host and not yet started
  onMount(() => {
    if (isHost && setupStep === 0) {
      sendSetup({ setupStep: 1 });
    }

    // Show device consent dialog if we haven't asked before.
    // On iOS Safari, motion/orientation permissions are per-page-session
    // (they reset on reload), so we must re-request even if localStorage
    // says "granted" when the actual browser permission wasn't obtained
    // in this session.
    try {
      const saved = localStorage.getItem(CONSENT_KEY);
      if (!saved) {
        showConsent = true;
      } else if (saved === "skipped") {
        permResult = { mic: "skipped", motion: needsMotionPermission() ? "skipped" : "not_needed" };
        syncPermissionsToServer(permResult);
      } else {
        const parsed = JSON.parse(saved) as PermissionResult;

        // If cached result claims motion was granted but we're on a
        // platform that gates it behind requestPermission (iOS) and
        // the permission hasn't been obtained this page session, we
        // must re-prompt so motion events actually fire.
        const motionNeedsRerequest =
          parsed.motion === "granted" &&
          needsMotionPermission() &&
          !isMotionPermissionGrantedThisSession();

        if (motionNeedsRerequest) {
          showConsent = true;
        } else {
          permResult = parsed;
          syncPermissionsToServer(permResult);
        }
      }
    } catch {
      showConsent = true;
    }
  });

  onDestroy(() => {
    if (setupChoiceTimer) {
      clearTimeout(setupChoiceTimer);
      setupChoiceTimer = null;
    }
  });
</script>

<div class="flex-1 flex flex-col items-center gap-6 p-6 pt-10 overflow-y-auto touch-manipulation" data-testid="phone-lobby">

  <!-- ── Device permission consent overlay ─────────────────────── -->
  {#if showConsent}
    <div class="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-6">
      <div class="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-xs w-full text-center space-y-4 shadow-2xl">
        <h3 class="text-lg font-bold text-white">Enable Game Features</h3>
        <p class="text-sm text-gray-400 leading-relaxed">
          Some games use your microphone plus motion and tilt sensors. Grant access here so games can turn them on only while they are actually in use.
        </p>
        {#if permissionMessage}
          <p class="text-xs text-amber-300 leading-relaxed">{permissionMessage}</p>
        {/if}
        <button
          class="w-full py-3 rounded-xl text-base font-bold bg-indigo-600 text-white active:bg-indigo-500 transition-colors"
          on:click={requestAllPermissions}
        >Enable Permissions</button>
        <button
          class="w-full py-2 text-sm text-gray-500 active:text-gray-300 transition-colors"
          on:click={skipConsent}
        >Skip for now</button>
      </div>
    </div>
  {/if}

  <!-- ── Game detail overlay ──────────────────────────────────── -->
  {#if detailGame}
    {@const dTheme = DETAIL_THEMES[detailGame.id] ?? { accent: "#818cf8", bg: "#050505" }}
    {@const dUnavailable = getGameUnavailableReason(detailGame, state)}
    <GameDetailView
      game={detailGame}
      accent={dTheme.accent}
      artBg={dTheme.bg}
      {isHost}
      isSelected={state.selectedGame === detailGame.id}
      unavailableReason={dUnavailable}
      on:back={closeDetail}
      on:select={(e) => { selectGame(e.detail.gameId); closeDetail(); }}
    />
  {/if}

  <!-- ── Room code (always visible) ──────────────────────────────── -->
  <div class="text-center">
    <p class="text-gray-400 text-sm">Room</p>
    <p class="text-4xl font-mono font-black tracking-widest text-white">{state.roomCode}</p>
  </div>

  {#if !setupDone}
    <!-- ── Setup in progress ─────────────────────────────────────── -->
    {#if isHost}
      <!-- Host: interactive setup wizard -->
      <div class="w-full max-w-sm">
        {#if setupStep === 1}
          <h2 class="text-xl font-bold text-center mb-4 text-indigo-400">Are you all in the same room?</h2>
          <div class="space-y-3">
            <button
              class={`setup-option w-full min-h-[104px] flex items-center gap-4 p-6 rounded-2xl border-2 transition-all ${setupOptionClass("location-same")}`}
              on:click={() => chooseSetupOption("location-same", () => selectLocation("same"))}
            >
              <span class="text-4xl">🏠</span>
              <div class="text-left">
                <span class="text-lg font-black block">Together</span>
                <span class={`setup-option-description text-sm ${setupOptionDescriptionClass("location-same")}`}>Everyone is in the same physical room</span>
              </div>
            </button>
            <button
              class={`setup-option w-full min-h-[104px] flex items-center gap-4 p-6 rounded-2xl border-2 transition-all ${setupOptionClass("location-remote")}`}
              on:click={() => chooseSetupOption("location-remote", () => selectLocation("remote"))}
            >
              <span class="text-4xl">🌍</span>
              <div class="text-left">
                <span class="text-lg font-black block">Remote</span>
                <span class={`setup-option-description text-sm ${setupOptionDescriptionClass("location-remote")}`}>Players are in different locations</span>
              </div>
            </button>
          </div>

        {:else if setupStep === 2}
          <h2 class="text-xl font-bold text-center mb-4 text-indigo-400">How active?</h2>
          <div class="space-y-3">
            <button
              data-testid="setup-activity-none"
              class={`setup-option w-full min-h-[96px] flex items-center gap-4 p-5 rounded-2xl border-2 transition-all ${setupOptionClass("activity-none")}`}
              on:click={() => chooseSetupOption("activity-none", () => selectActivity("none"))}
            >
              <span class="text-3xl">🛋️</span>
              <div class="text-left">
                <span class="text-base font-black block">None</span>
                <span class={`setup-option-description text-sm ${setupOptionDescriptionClass("activity-none")}`}>Stay seated — all phone-based games</span>
              </div>
            </button>
            <button
              class={`setup-option w-full min-h-[96px] flex items-center gap-4 p-5 rounded-2xl border-2 transition-all ${setupOptionClass("activity-some")}`}
              on:click={() => chooseSetupOption("activity-some", () => selectActivity("some"))}
            >
              <span class="text-3xl">🚶</span>
              <div class="text-left">
                <span class="text-base font-black block">Some</span>
                <span class={`setup-option-description text-sm ${setupOptionDescriptionClass("activity-some")}`}>Light movement — passing phones, standing up</span>
              </div>
            </button>
            <button
              class={`setup-option w-full min-h-[96px] flex items-center gap-4 p-5 rounded-2xl border-2 transition-all ${setupOptionClass("activity-full")}`}
              on:click={() => chooseSetupOption("activity-full", () => selectActivity("full"))}
            >
              <span class="text-3xl">🏃</span>
              <div class="text-left">
                <span class="text-base font-black block">Full</span>
                <span class={`setup-option-description text-sm ${setupOptionDescriptionClass("activity-full")}`}>Running, shaking, physical challenges</span>
              </div>
            </button>
          </div>

        {:else if setupStep === 3}
          <h2 class="text-xl font-bold text-center mb-4 text-indigo-400">Using a shared screen?</h2>
          <div class="space-y-3">
            <button
              class={`setup-option w-full min-h-[104px] flex items-center gap-4 p-6 rounded-2xl border-2 transition-all ${setupOptionClass("display-yes")}`}
              on:click={() => chooseSetupOption("display-yes", () => selectDisplay(true))}
            >
              <span class="text-4xl">📺</span>
              <div class="text-left">
                <span class="text-lg font-black block">Yes</span>
                <span class={`setup-option-description text-sm ${setupOptionDescriptionClass("display-yes")}`}>TV, laptop, or projector as a shared display</span>
              </div>
            </button>
            <button
              class={`setup-option w-full min-h-[104px] flex items-center gap-4 p-6 rounded-2xl border-2 transition-all ${setupOptionClass("display-no")}`}
              on:click={() => chooseSetupOption("display-no", () => selectDisplay(false))}
            >
              <span class="text-4xl">📱</span>
              <div class="text-left">
                <span class="text-lg font-black block">Phone only</span>
                <span class={`setup-option-description text-sm ${setupOptionDescriptionClass("display-no")}`}>Everyone plays on their own phone — no shared screen</span>
              </div>
            </button>
          </div>
        {/if}
      </div>
    {:else}
      <!-- Non-host: passive waiting -->
      <h1 class="text-2xl font-black text-indigo-400 text-center">Setting up…</h1>
      <p class="text-gray-400 text-center">
        {SETUP_STEP_LABELS[state.setupStep ?? 1] ?? "Host is completing setup…"}
      </p>
    {/if}

  {:else}
    <!-- ── Setup done — lobby ────────────────────────────────────── -->
    {#if isHost}
      <h1 class="text-2xl font-black text-indigo-400">Pick a game</h1>
    {:else}
      <h1 class="text-2xl font-black text-indigo-400">Waiting for host…</h1>
    {/if}

    <!-- Setup summary -->
    <div class="flex gap-2 flex-wrap justify-center text-xs">
      <span class="px-2 py-1 bg-gray-800 rounded-full text-gray-400">
        {state.locationMode === "same" ? "🏠 Same room" : "🌍 Remote"}
      </span>
      <span class="px-2 py-1 bg-gray-800 rounded-full text-gray-400">
        {state.activityLevel === "none" ? "🛋️ No movement" :
         state.activityLevel === "some" ? "🚶 Some movement" : "🏃 Full movement"}
      </span>
      {#if isHost}
        <button
          class="px-2 py-1 bg-gray-700 rounded-full text-xs text-gray-400 active:text-white transition-colors"
          on:click={resetSetup}
        >Change</button>
      {/if}
    </div>

    <!-- Player customizer panel -->
    {#if showCustomizer}
      <div class="bg-gray-800/80 border border-gray-700 rounded-2xl p-5 w-full max-w-xs shadow-xl">
        <PlayerCustomizer {room} {me} on:done={() => (showCustomizer = false)} />
      </div>
    {/if}

    <!-- Player list + action buttons (BEFORE game selection so they're visible on phone) -->
    <div class="bg-gray-800 rounded-xl p-4 w-full max-w-xs">
      <div class="flex items-center justify-between mb-2">
        <p class="text-gray-400 text-sm text-center flex-1">Players ({state.players.size})</p>
        <button
          class="text-xs px-2.5 py-1 rounded-lg transition-colors
            {showCustomizer
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-700 text-gray-400 active:text-white'}"
          on:click={() => (showCustomizer = !showCustomizer)}
        >{hasCustomIcon ? 'Edit icon' : 'Set icon'}</button>
      </div>
      <ul class="space-y-1">
        {#each [...state.players.values()] as p}
          <li class="flex items-center justify-between text-sm">
            <span class="flex items-center gap-1.5">
              <PlayerIcon player={p} size={34} />
              {#if p.id === state.hostSessionId}
                <span class="text-yellow-400 text-xs" title="Host">&#x1F451;</span>
              {/if}
              <span class="{p.id === me?.id ? 'font-bold text-indigo-400' : 'text-gray-300'}">{p.name}{p.id === me?.id ? ' (you)' : ''}</span>
            </span>
            <span class="flex items-center gap-2">
              {#if p.id === state.hostSessionId}
                <span class="text-yellow-400 text-xs font-semibold">Host</span>
              {:else if p.isReady}
                <span class="text-green-400 font-bold">&#x2713;</span>
              {/if}
              {#if isHost && p.id !== me?.id}
                <button
                  class="text-red-400 text-xs font-bold px-2 py-0.5 rounded bg-gray-700 active:bg-red-900 transition-colors"
                  on:click={() => kickPlayer(p.id)}
                >Kick</button>
              {/if}
            </span>
          </li>
        {/each}
      </ul>

      {#if me}
        <div class="mt-3 pt-3 border-t border-gray-700 space-y-1 text-xs text-gray-400">
          <div class="flex items-center justify-between">
            <span>Microphone</span>
            <span class={me.micPermission === 'granted' ? 'text-green-400' : 'text-gray-400'}>{permissionSummary(me.micPermission)}</span>
          </div>
          <div class="flex items-center justify-between">
            <span>Motion</span>
            <span class={me.motionPermission === 'granted' ? 'text-green-400' : 'text-gray-400'}>{permissionSummary(me.motionPermission)}</span>
          </div>
          {#if me.micPermission !== 'granted' || me.motionPermission !== 'granted'}
            <button
              class="w-full mt-2 py-2 rounded-lg bg-gray-700 text-gray-200 font-semibold active:bg-indigo-700 transition-colors"
              on:click={() => (showConsent = true)}
            >Enable device permissions</button>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Host: start button. Non-host: ready button. -->
    {#if isHost}
      <button
        class="w-full max-w-xs py-4 rounded-xl text-lg font-bold transition-all active:scale-95
          {canStart
            ? 'bg-indigo-600 active:bg-indigo-500 text-white'
            : 'bg-gray-700 text-gray-500'}"
        disabled={!canStart}
        on:click={start}
        data-testid="start-btn"
      >{canStart ? 'Start Game' : !state.selectedGame ? 'Pick a game' : selectedGameUnavailable ? selectedGameUnavailable : !allPlayersReady ? 'Waiting for players...' : 'Start Game'}</button>
    {:else}
      <button
        class="w-full max-w-xs py-4 rounded-xl text-lg font-bold transition-all active:scale-95
          {me?.isReady
            ? 'bg-green-700 text-green-200 active:bg-red-800 active:text-red-200'
            : 'bg-indigo-600 active:bg-indigo-500 text-white'}"
        on:click={me?.isReady ? unready : ready}
        data-testid="ready-btn"
      >{me?.isReady ? 'Ready ✓ (tap to undo)' : 'Ready Up'}</button>
    {/if}

    <!-- Game selection area -->
    {#if isHost}
      <!-- Selection mode: single game vs playlist -->
      <div class="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
        <button
          class="px-3 py-1.5 text-xs font-semibold rounded-md transition-colors
            {selectionMode === 'single' ? 'bg-indigo-600 text-white' : 'text-gray-400 active:text-white'}"
          on:click={() => { selectionMode = "single"; clearQueue(); }}
        >Single Game</button>
        <button
          class="px-3 py-1.5 text-xs font-semibold rounded-md transition-colors
            {selectionMode === 'playlist' ? 'bg-indigo-600 text-white' : 'text-gray-400 active:text-white'}"
          on:click={() => (selectionMode = "playlist")}
        >Playlist</button>
      </div>

      {#if selectionMode === "playlist"}
        <!-- Playlist presets -->
        <div class="w-full max-w-xs space-y-3">
          <p class="text-xs text-gray-400 text-center">
            Auto-picks random games matching your setup ({availableGames.length} available)
          </p>
          <div class="grid grid-cols-3 gap-2">
            <button
              class="py-3 rounded-lg text-sm font-bold transition-colors
                {hasQueue && (state.gameQueue?.length ?? 0) === 4 ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-300 border border-gray-700 active:border-indigo-500'}"
              on:click={() => buildRandomPlaylist(4)}
              disabled={availableGames.length === 0}
            >Quick 4</button>
            <button
              class="py-3 rounded-lg text-sm font-bold transition-colors
                {hasQueue && (state.gameQueue?.length ?? 0) === 8 ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-300 border border-gray-700 active:border-indigo-500'}"
              on:click={() => buildRandomPlaylist(8)}
              disabled={availableGames.length === 0}
            >Party 8</button>
            <button
              class="py-3 rounded-lg text-sm font-bold transition-colors
                {hasQueue && (state.gameQueue?.length ?? 0) === 12 ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-300 border border-gray-700 active:border-indigo-500'}"
              on:click={() => buildRandomPlaylist(12)}
              disabled={availableGames.length === 0}
            >Marathon 12</button>
          </div>

          {#if hasQueue}
            <!-- Queue display -->
            <div class="bg-gray-900 rounded-lg p-3 space-y-1.5">
              <div class="flex items-center justify-between">
                <p class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Queue ({state.gameQueue?.length ?? 0} games)</p>
                <button
                  class="text-xs text-red-400 font-semibold active:text-red-300"
                  on:click={clearQueue}
                >Clear</button>
              </div>
              {#each (state.gameQueue ?? []) as gameId, i}
                {@const meta = GAME_REGISTRY.find((g) => g.id === gameId)}
                <div class="flex items-center gap-2 text-xs
                  {i === (state.queueIndex ?? 0) ? 'text-indigo-400 font-bold' : 'text-gray-500'}">
                  <span class="w-5 text-right font-mono">{i + 1}.</span>
                  <span>{meta?.label ?? gameId}</span>
                  {#if i === (state.queueIndex ?? 0)}
                    <span class="text-indigo-400 text-[10px]">UP NEXT</span>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {:else}
        <div class="w-full overflow-x-auto px-2">
          <GameCardGrid {state} on:select={(e) => selectGame(e.detail.gameId)} on:detail={(e) => openDetail(e.detail.gameId)} />
        </div>
      {/if}

      <!-- Config (shown in both single + playlist modes when a game is selected) -->
      {#if state.selectedGame}
        <div class="bg-gray-800 rounded-xl p-4 w-full max-w-xs space-y-3">
          <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Config</h3>
          <label class="flex items-center justify-between">
            <span class="text-sm text-gray-300">Rounds</span>
            <input
              type="number"
              min="1"
              max="5"
              value={state.gameConfig.roundCount}
              class="w-14 bg-gray-700 text-white text-center rounded px-2 py-1 text-sm"
              on:change={(e) => updateConfig({ roundCount: Number(e.currentTarget.value) })}
            />
          </label>
          {#if isLowballFunnyMessages}
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-300">Funny Message Time</span>
              <span class="text-sm font-semibold text-white">Fixed 180s</span>
            </div>
          {:else}
            <label class="flex items-center justify-between">
              <span class="text-sm text-gray-300">Time Limit (s)</span>
              <input
                type="number"
                min="10"
                max="120"
                value={state.gameConfig.timeLimitSecs}
                class="w-14 bg-gray-700 text-white text-center rounded px-2 py-1 text-sm"
                on:change={(e) => updateConfig({ timeLimitSecs: Number(e.currentTarget.value) })}
              />
            </label>
          {/if}
          <label class="flex items-center justify-between gap-3">
            <span class="text-sm text-gray-300">Practice Round</span>
            <input
              type="checkbox"
              checked={state.gameConfig.practiceRoundEnabled}
              class="w-5 h-5 accent-indigo-500"
              on:change={(e) => updateConfig({ practiceRoundEnabled: e.currentTarget.checked })}
            />
          </label>

          {#if state.selectedGame === "registry-25-lowball-marketplace"}
            <label class="flex items-center justify-between gap-3">
              <span class="text-sm text-gray-300">Mode</span>
              <select
                class="bg-gray-700 text-white rounded px-2 py-1 text-sm"
                value={state.gameConfig.gameMode === "funny_messages" ? "funny_messages" : "classic"}
                on:change={(e) => updateConfig({ gameMode: e.currentTarget.value })}
              >
                <option value="classic">Classic Bidding</option>
                <option value="funny_messages">Funny Messages</option>
              </select>
            </label>
          {:else if state.selectedGame === "registry-26-audio-overlay"}
            <label class="flex items-center justify-between gap-3">
              <span class="text-sm text-gray-300">Mode</span>
              <select
                class="bg-gray-700 text-white rounded px-2 py-1 text-sm"
                value={state.gameConfig.gameMode === "record_own" ? "record_own" : "randomized"}
                on:change={(e) => updateConfig({ gameMode: e.currentTarget.value })}
              >
                <option value="randomized">Random GIF Swap</option>
                <option value="record_own">Record Own GIF</option>
              </select>
            </label>
          {:else if state.selectedGame === "registry-04-escape-maze"}
            <label class="flex items-center justify-between gap-3">
              <span class="text-sm text-gray-300">Mode</span>
              <select
                class="bg-gray-700 text-white rounded px-2 py-1 text-sm"
                value={state.gameConfig.gameMode === "team" ? "team" : "individual"}
                on:change={(e) => updateConfig({ gameMode: e.currentTarget.value })}
              >
                <option value="individual">Individual</option>
                <option value="team">Teams of 4</option>
              </select>
            </label>
          {/if}
        </div>
      {/if}
    {:else}
      <!-- Non-host view -->
      {#if hasQueue}
        <!-- Non-host: show queue info -->
        <div class="w-full max-w-xs bg-gray-900 rounded-lg p-3 space-y-1.5">
          <p class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Playlist ({state.gameQueue?.length ?? 0} games)</p>
          {#each (state.gameQueue ?? []) as gameId, i}
            {@const meta = GAME_REGISTRY.find((g) => g.id === gameId)}
            <div class="flex items-center gap-2 text-xs
              {i === (state.queueIndex ?? 0) ? 'text-indigo-400 font-bold' : 'text-gray-500'}">
              <span class="w-5 text-right font-mono">{i + 1}.</span>
              <span>{meta?.label ?? gameId}</span>
              {#if i === (state.queueIndex ?? 0)}
                <span class="text-indigo-400 text-[10px]">UP NEXT</span>
              {/if}
            </div>
          {/each}
        </div>
      {:else}
        <!-- Non-host: show selected game banner (if any) + always-browsable game list -->
        {#if selectedGameMeta}
          <div class="bg-indigo-900 border border-indigo-600 rounded-xl p-3 w-full max-w-xs text-center">
            <p class="text-xs text-indigo-400 uppercase tracking-widest mb-0.5">Selected game</p>
            <p class="font-bold text-white text-sm">{selectedGameMeta.label}</p>
          </div>
        {:else}
          <p class="text-gray-400 text-sm text-center">Host is picking a game…</p>
        {/if}

        <div class="w-full overflow-x-auto px-2">
          <GameCardGrid {state} readonly={true} on:detail={(e) => openDetail(e.detail.gameId)} />
        </div>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .setup-option {
    border-color: #374151;
    background: rgba(31, 41, 55, 0.9);
    color: #ffffff;
  }

  .setup-option:hover {
    border-color: #6366f1;
    background: rgba(49, 46, 129, 0.9);
  }

  .setup-option.is-pending {
    border-color: #818cf8;
    background: rgba(49, 46, 129, 0.9);
    transform: scale(0.99);
    box-shadow: 0 18px 40px rgba(15, 23, 42, 0.35);
  }

  .setup-option-description {
    color: #9ca3af;
  }

  .setup-option-description.is-pending {
    color: #e0e7ff;
  }

  :global(.light) .setup-option {
    border-color: #d1d5db;
    background: #ffffff;
    color: #111827;
  }

  :global(.light) .setup-option:hover {
    border-color: #818cf8;
    background: #eef2ff;
  }

  :global(.light) .setup-option.is-pending {
    border-color: #818cf8;
    background: #eef2ff;
    color: #111827;
    box-shadow: 0 18px 40px rgba(129, 140, 248, 0.22);
  }

  :global(.light) .setup-option-description {
    color: #6b7280;
  }

  :global(.light) .setup-option-description.is-pending {
    color: #4338ca;
  }
</style>
