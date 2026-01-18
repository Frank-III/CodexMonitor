import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [
    // Use the upstream Solid Vite plugin during development while `solid-jsx-oxc` is being refactored.
    solid(),
  ],

  // Exclude @tauri-apps from pre-bundling to avoid "default" export resolution issues
  optimizeDeps: {
    // Force-prebundle CJS deps that are imported from ESM-only packages.
    // Fixes: "The requested module ... does not provide an export named 'default'"
    include: ["debug", "extend"],
    exclude: ["@tauri-apps/api", "@tauri-apps/plugin-dialog", "@tauri-apps/plugin-opener"],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
