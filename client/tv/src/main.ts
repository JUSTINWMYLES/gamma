/**
 * client/tv/src/main.ts — TV app entry point
 */
import "../../src/global.css";
import App from "./App.svelte";

const app = new App({ target: document.getElementById("app")! });
export default app;
