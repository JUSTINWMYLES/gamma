import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// TV client Vite config
export default defineConfig({
  root: ".",
  plugins: [
    svelte({
      preprocess: (await import("svelte-preprocess")).default(),
    }),
  ],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  define: {
    // VITE_SERVER_URL is set at build time or falls back to localhost
    __SERVER_URL__: JSON.stringify(
      process.env.VITE_SERVER_URL ?? "ws://localhost:2567"
    ),
  },
});
