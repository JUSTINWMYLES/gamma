import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { resolve } from "path";
import fs from "fs";
import type { Plugin } from "vite";

/**
 * Serve an additional static directory alongside the main publicDir.
 * Vite only supports one publicDir, so this plugin adds a second one
 * for dev (middleware) and build (copy to outDir).
 */
function extraStaticDir(dir: string): Plugin {
  const absDir = resolve(__dirname, dir);
  return {
    name: "extra-static-dir",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next();
        const filePath = resolve(absDir, req.url.slice(1).split("?")[0]);
        if (filePath.startsWith(absDir) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          res.setHeader("Content-Type", getMime(filePath));
          fs.createReadStream(filePath).pipe(res);
        } else {
          next();
        }
      });
    },
    async generateBundle() {
      // Copy extra static files into the build output
      if (!fs.existsSync(absDir)) return;
      for (const file of fs.readdirSync(absDir)) {
        const full = resolve(absDir, file);
        if (fs.statSync(full).isFile()) {
          this.emitFile({
            type: "asset",
            fileName: file,
            source: fs.readFileSync(full),
          });
        }
      }
    },
  };
}

function getMime(f: string): string {
  const ext = f.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    html: "text/html", css: "text/css", js: "application/javascript",
    json: "application/json", png: "image/png", svg: "image/svg+xml",
    mp3: "audio/mpeg", wav: "audio/wav", flac: "audio/flac", ogg: "audio/ogg",
    glb: "model/gltf-binary",
    txt: "text/plain",
  };
  return map[ext ?? ""] ?? "application/octet-stream";
}

// Unified client Vite config — serves both viewer and player roles from one port
export default defineConfig({
  root: ".",
  publicDir: "public",
  plugins: [
    svelte({
      preprocess: (await import("svelte-preprocess")).default(),
    }),
    extraStaticDir("../../audio"),
    extraStaticDir("../../models"),
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
    // Only inject __SERVER_URL__ when explicitly set via env var.
    // In dev mode this is left undefined so colyseusClient.ts auto-derives
    // the URL from window.location.hostname — enabling LAN phone access.
    __SERVER_URL__: process.env.VITE_SERVER_URL
      ? JSON.stringify(process.env.VITE_SERVER_URL)
      : "undefined",
  },
});
