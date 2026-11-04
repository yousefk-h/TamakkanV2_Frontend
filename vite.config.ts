import { copyFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";
import { spatialRealVitePlugin } from "@spatialreal/web-sdk/vite";
import vinext from "vinext";
import { defineConfig } from "vite";
import { sites } from "./build/sites-vite-plugin";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const SPATIALREAL_SDK_DIST = join(import.meta.dirname, "node_modules/@spatialreal/web-sdk/dist");
// Where vinext actually serves the client-side bundle from (confirmed by inspecting a real build's output). The official
// SpatialReal plugin copies the renderer's `.wasm` into `build.outDir`/`build.assetsDir` (`dist/assets`), which is NOT
// where this app's client files are served from - without the file next to the bundled glue module the avatar fails to
// load in production ("WASM module initialization failed").
const CLIENT_ASSETS_DIR = join(import.meta.dirname, "dist/client/assets");

/** Companion to `spatialRealVitePlugin()` for vinext's output layout: also puts the renderer's `.wasm`, under its
 * original (content-hashed) name - the glue module looks it up by exactly that name - where this app serves assets. */
const spatialRealWasmForVinext: Plugin = {
  name: "spatialreal-wasm-vinext",
  apply: "build",
  closeBundle() {
    if (!existsSync(SPATIALREAL_SDK_DIST) || !existsSync(CLIENT_ASSETS_DIR)) return;
    for (const file of readdirSync(SPATIALREAL_SDK_DIST)) {
      if (file.startsWith("avatar_core_wasm") && file.endsWith(".wasm")) copyFileSync(join(SPATIALREAL_SDK_DIST, file), join(CLIENT_ASSETS_DIR, file));
    }
  },
};

// Runs as a plain local Vite/Node dev server - no Cloudflare Workers
// simulation. This app doesn't use any Workers-only feature (D1/R2/KV
// bindings, the Workers Images binding) - the BFF proxy routes just read
// `process.env.API_BASE_URL` directly (see lib/api/server/backend.ts), which
// works the same under plain Node as it did under the Miniflare-simulated
// `vars` binding. Removed after the Workers-simulated request body handling
// turned out to cap uploads at 1 MiB, well under what an end-of-week video
// check-in needs - a real limitation of the local Workers simulation, not this app.
export default defineConfig(() => ({
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    ...(isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : {}),
  },
  // The official SpatialReal plugin serves/copies the avatar renderer's WebAssembly (https://docs.spatialreal.ai/resources/migration-guide).
  plugins: [spatialRealVitePlugin(), spatialRealWasmForVinext, vinext(), sites()],
}));
