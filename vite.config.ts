import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Served as a GitHub Pages project site under magnus.is-a.dev/flagsales-live/.
export default defineConfig({
  base: "/flagsales-live/",
  plugins: [react(), tailwindcss()],
  // PGlite ships its own WebAssembly and data files; pre-bundling would lose them.
  optimizeDeps: { exclude: ["@electric-sql/pglite"] },
  build: { chunkSizeWarningLimit: 1_500 },
});
