/**
 * client/app/src/main.ts — Unified app entry point
 */
import "./global.css";
import { installDeviceLockdown } from "./lib/deviceLockdown";
import App from "./App.svelte";

// System-wide mobile UX: block pinch-to-zoom and suppress shake-to-undo dialogs
installDeviceLockdown();

const app = new App({ target: document.getElementById("app")! });
export default app;
