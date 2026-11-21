import { defineConfig } from "vite";

// Tauri serves the built files from dist/ and, in development, this server on a fixed port (src-tauri/tauri.conf.json).
export default defineConfig({
  base: "./",
  clearScreen: false,
  server: { port: 1420, strictPort: true, host: true },
  build: { outDir: "dist", target: "es2022" },
});
