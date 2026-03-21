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
    __SERVER_URL__: JSON.stringify(
      process.env.VITE_SERVER_URL ?? "ws://localhost:2567"
    ),
  },
});
