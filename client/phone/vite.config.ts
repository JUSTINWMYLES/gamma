import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Phone client Vite config
export default defineConfig({
  root: ".",
  plugins: [
    svelte({
      preprocess: (await import("svelte-preprocess")).default(),
    }),
  ],
  server: {
    port: 5174,
    host: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  define: {
    // Only inject __SERVER_URL__ when explicitly set via env var.
    // In dev mode this is left undefined so colyseusClient.ts auto-derives
    // the URL from window.location.hostname — enabling LAN phone access.
    __SERVER_URL__: process.env.VITE_SERVER_URL
      ? JSON.stringify(process.env.VITE_SERVER_URL)
      : "undefined",
  },
});
