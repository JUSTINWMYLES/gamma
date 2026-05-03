/**
 * client/app/src/main.ts — Unified app entry point
 */
import "./global.css";
import { installDeviceLockdown, teardownDeviceLockdown } from "./lib/deviceLockdown";
import App from "./App.svelte";

// System-wide mobile UX: block pinch-to-zoom and suppress shake-to-undo dialogs
installDeviceLockdown();

const app = new App({ target: document.getElementById("app")! });
export default app;

// Hot Module Replacement cleanup — prevents listener duplication on dev reloads.
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    teardownDeviceLockdown();
    installDeviceLockdown();
  });
  import.meta.hot.dispose(() => {
    app.$destroy();
    teardownDeviceLockdown();
  });
}
